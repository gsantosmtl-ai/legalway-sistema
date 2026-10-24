// Automações que antes só rodavam quando alguém abria uma tela. Agora rodam no servidor:
// na inicialização, a cada minuto e logo depois de gravações relevantes. Mesma lógica das telas
// (que continuam idempotentes: se a tela rodar antes, o servidor não duplica; e vice-versa).
import { ler, gravar } from './armazenamento.js';
import { avisarCanal, avisarPessoa } from './chat.js';
import { obterRegras } from './regras.js';
import { varrerUscis } from './uscis.js';
import { primeiroContato } from './primeiro-contato.js';
import { avisosAutomaticos } from './avisos-automaticos.js';
import { DOCUMENTOS_DEPENDENTE_PADRAO } from './biblioteca-vistos.js';
import { conferirPrazos } from './prazos.js';
import { conferirStripe } from './stripe-rotas.js';
import { avisosDeParcela } from './avisos-cliente.js';
import { boletimDiario } from './guardiao.js';
import { limparTentativas } from './tentativas.js';
import { hojeNoFuso } from './datas.js';

const K = {
  contratos: 'legalway-contratos-v1', clientes: 'legalway-clientes-v1', receber: 'legalway-financeiro-v1',
  pagar: 'legalway-contas-pagar-v1', processos: 'legalway-processos-documentacao-v1', checklists: 'legalway-checklists-v1',
  sdr: 'legalway-sdr-v1', config: 'legalway-automacoes-config-v1',
};
const QUEM = 'automação';
const uid = (p) => p + Date.now() + Math.floor(Math.random() * 1000);
const agora = () => new Date().toISOString();
// hoje = o dia do escritório (Orlando), não o do relógio UTC. Ver datas.js.
const hoje = () => hojeNoFuso();
const fmtMoney = (v) => 'US$ ' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function bloco(chave, padrao = []) {
  const r = await ler(chave);
  let valor = r ? r.valor : padrao;
  // Um bloco com o formato errado derrubava o passo inteiro da automação. Foi
  // o que apareceu na bateria de testes: "legalway-sdr-v1" tinha virado o TEXTO
  // "[]" em vez da lista vazia — codificado duas vezes por um script avulso — e
  // a comissão do SDR morria em `sdrLeads.filter is not a function`, sem sair,
  // rodada após rodada. Comissão que o SDR ganhou e não recebe é o pior jeito
  // de descobrir um defeito de formato.
  //
  // Agora o passo segue com o padrão e o problema aparece no log, em vez de a
  // automação inteira parar ali.
  if (Array.isArray(padrao) && !Array.isArray(valor)) {
    console.error(`[automações] bloco "${chave}" não é uma lista (veio ${typeof valor}) — seguindo com lista vazia`);
    valor = padrao;
  }
  return { valor, versao: r ? r.versao : null };
}
async function salvar(chave, valor, versao, transformar) { return gravar(chave, valor, versao, QUEM, transformar); }

// Entre ler o bloco e gravá-lo cabe um mundo. Em 24/10 a automação leu as
// fichas logo depois do incidente que esvaziou 266 delas, concluiu — com razão,
// para o que ela estava vendo — que 241 contratos estavam sem ficha, e criou
// todas. Em paralelo, a recuperação devolvia as originais. A mescla do servidor
// é por id e nenhuma ponta apaga a outra: o quadro ganhou 241 cartões fantasma,
// cada um irmão exato de uma ficha real, mesmo contrato e mesmo serviço.
//
// A trava de "já existe ficha para este contrato e serviço" era boa; o que
// faltava era ela valer no instante da ESCRITA, não no da leitura. Esta poda
// roda dentro da transação, com a linha travada, e tem a última palavra: ficha
// recém-criada cujo par já está no banco agora simplesmente não entra.
export function podarFichasQueJaExistem(criados) {
  const chaveDe = p => (p.contratoId || '') + '|' + (p.servico || '');
  return (meu, atualDoBanco) => {
    const atual = Array.isArray(atualDoBanco) ? atualDoBanco : [];
    const jaTem = new Set();
    for (const p of atual) {
      // As que ESTA rodada acabou de criar não contam como "já existe": senão a
      // primeira podaria a si mesma numa regravação.
      if (!p || !p.contratoId || criados.has(p.id)) continue;
      jaTem.add(chaveDe(p));
    }
    return (Array.isArray(meu) ? meu : [])
      .filter(p => !(p && criados.has(p.id) && p.contratoId && jaTem.has(chaveDe(p))));
  };
}

// idêntico ao calcularParcelas de contratos.html
function calcularParcelas(dataBaseIso, numParcelas, diasPrimeira, recorrencia, diasCustom, valorTotal, entrada, dataPrimeira) {
  numParcelas = Number(numParcelas) || 0;
  if (numParcelas <= 0) return [];
  const valorRestante = Math.max(Number(valorTotal || 0) - Number(entrada || 0), 0);
  const valorParcela = Math.round((valorRestante / numParcelas) * 100) / 100;
  const parcelas = [];
  // A data escolhida no contrato manda. "Dias após a assinatura" fica de reserva pros contratos
  // criados antes deste campo existir. Esta conta e a da tela de Contratos têm que andar juntas:
  // se divergirem, a prévia mostra uma data e o Financeiro lança outra.
  let dataAtual;
  if (dataPrimeira) {
    dataAtual = new Date(dataPrimeira + 'T12:00:00');
  } else {
    dataAtual = new Date(dataBaseIso + 'T12:00:00');
    dataAtual.setDate(dataAtual.getDate() + Number(diasPrimeira || 30));
  }
  const diaAncora = dataAtual.getDate();   // dia de vencimento escolhido na 1ª parcela
  let soma = 0;
  for (let i = 1; i <= numParcelas; i++) {
    let valor = valorParcela;
    if (i === numParcelas) valor = Math.round((valorRestante - soma) * 100) / 100;
    soma += valor;
    parcelas.push({ numero: i, data: dataAtual.toISOString().slice(0, 10), valor });
    const proxima = new Date(dataAtual);
    if (recorrencia === 'mensal') {
      // 31/01 + 1 mês daria 03/03 (fevereiro não tem 31) e deslocaria todas as parcelas seguintes.
      // O vencimento fica ancorado no dia da PRIMEIRA parcela: mês que não tem esse dia usa o
      // último, e o mês seguinte volta pro dia original — 31/01 → 28/02 → 31/03 → 30/04.
      proxima.setDate(1);
      proxima.setMonth(proxima.getMonth() + 1);
      const ultimoDia = new Date(proxima.getFullYear(), proxima.getMonth() + 1, 0).getDate();
      proxima.setDate(Math.min(diaAncora, ultimoDia));
    }
    else if (recorrencia === '14') proxima.setDate(proxima.getDate() + 14);
    else proxima.setDate(proxima.getDate() + Number(diasCustom || 30));
    dataAtual = proxima;
  }
  return parcelas;
}

// 1) Confirmação de assinatura → o contrato fica igual ao que o cliente assinou
//
// Três lugares diferentes marcam um contrato como "Assinado": a própria rota
// pública da assinatura, a tela de Contratos (que faz polling de 8 em 8
// segundos) e esta automação. Quem chegar primeiro ganha — e isso não é um
// problema desde que ninguém dependa de ter sido o primeiro.
//
// Era exatamente essa a dependência que quebrava o fluxo. Antes esta função
// pulava todo contrato que já estivesse "Assinado", e o que ela fazia depois
// de marcar — PDF, anexos, cliente, parcelas — simplesmente não acontecia
// quando outro lugar marcava antes. Pior: a tela grava a lista INTEIRA de
// contratos a partir da cópia que tem em memória, que pode ser anterior ao
// que a rota de assinatura acabou de escrever. Aí o `anexosCliente` que o
// cliente mandou junto com a assinatura ia embora. Foi o que ela viu:
// "anexo que o cliente coloca no contrato nao aparece depois".
//
// Agora isto é uma reconciliação: para todo contrato que tem confirmação de
// assinatura, o estado dele passa a ser o que a confirmação diz — etapa, data,
// PDF e anexos — esteja ele já "Assinado" ou não. Idempotente: só grava quando
// encontra diferença.
async function assinaturasPendentes(log) {
  const { valor: contratos, versao } = await bloco(K.contratos);
  let mudou = 0;
  let marcados = 0;
  for (const c of contratos) {
    if (!c || c.etapa === 'Cancelado') continue;
    const conf = await ler('legalway-contrato-assinado-' + c.id);
    if (!conf) continue;
    const dados = conf.valor || {};
    c.historico = c.historico || [];

    if (c.etapa !== 'Assinado') {
      c.etapa = 'Assinado';
      c.dataAssinatura = dados.assinadoEm || agora();
      c.historico.push({ quando: agora(), texto: 'Assinatura confirmada automaticamente pelo cliente — automação disparada' + (dados.pdf ? ' (PDF anexado)' : '') });
      marcados++; mudou++;
    } else if (!c.dataAssinatura && dados.assinadoEm) {
      c.dataAssinatura = dados.assinadoEm;
      mudou++;
    }

    if (dados.pdf && c.pdfAssinado !== dados.pdf) {
      c.pdfAssinado = dados.pdf;
      mudou++;
    }

    // Os anexos que o cliente mandou junto com a assinatura. Comparados por
    // nome do arquivo guardado, que é único — o nome que o cliente deu ao
    // arquivo pode repetir.
    const vindos = Array.isArray(dados.anexos) ? dados.anexos : [];
    if (vindos.length) {
      const atuais = Array.isArray(c.anexosCliente) ? c.anexosCliente : [];
      const tenho = new Set(atuais.map((a) => a && a.arquivo).filter(Boolean));
      const faltando = vindos.filter((a) => a && a.arquivo && !tenho.has(a.arquivo));
      if (faltando.length) {
        c.anexosCliente = atuais.concat(faltando);
        c.historico.push({ quando: agora(), texto: `${faltando.length} anexo(s) enviados pelo cliente na assinatura recuperados no contrato` });
        mudou++;
        log.push(`${faltando.length} anexo(s) do cliente recuperados: ${c.cliente}`);
      }
    }
  }
  if (!mudou) return;
  await salvar(K.contratos, contratos, versao);
  if (marcados) log.push(`${marcados} contrato(s) marcados como Assinado`);
  // O cliente e as parcelas NÃO são criados aqui. Ver clientesEContasDeAssinados,
  // logo abaixo: depender de "eu acabei de marcar este" era justamente o defeito.
}

// 1b) Todo contrato assinado precisa ter cliente e parcelas. Varre TODOS, não só
// os que esta rodada marcou.
//
// Era aqui que o fluxo quebrava, e de um jeito difícil de ver: a TELA de
// Contratos também confirma a assinatura, de 8 em 8 segundos, enquanto alguém
// está com a aba aberta. Quando ela marcava primeiro — e marcava quase sempre —
// o contrato já chegava aqui como "Assinado", o `continue` lá de cima pulava
// ele, e `clienteDoContrato`/`contasDoContrato` NUNCA rodavam. Resultado:
// contrato assinado, processo criado (essa automação varre todos), e nenhum
// cliente, nenhuma parcela. Uma corrida que a tela ganhava.
//
// `encaixarCliente` e `encaixarContas` só agem quando falta algo, então varrer
// tudo é seguro e conserta também os contratos que ficaram para trás.
// Só os assinados RECENTES. A varredura conserta a corrida entre quem marca o
// contrato como assinado — ela não existe para inventar registro financeiro de
// contrato velho.
//
// Sem esta janela, o primeiro ciclo depois do deploy passaria pelos quase
// duzentos contratos assinados da base. Para qualquer um deles cujas parcelas
// não estejam ligadas pelo `contratoId` — os importados do Bling, por exemplo —
// a varredura concluiria "este contrato não tem parcelas" e geraria um jogo
// novo de contas a receber. Cobrança inventada em cima de contrato de meses
// atrás, e ninguém pediu isso.
const DIAS_PARA_RECONCILIAR = 7;

export function assinadoHaPoucoTempo(c, agoraMs) {
  if (!c.dataAssinatura) return false;          // sem data não dá para saber: fica de fora
  const quando = new Date(c.dataAssinatura).getTime();
  if (!Number.isFinite(quando)) return false;
  return (agoraMs - quando) <= DIAS_PARA_RECONCILIAR * 24 * 60 * 60 * 1000;
}

async function clientesEContasDeAssinados(log) {
  const { valor: contratos } = await bloco(K.contratos);
  const agoraMs = Date.now();
  const assinados = contratos.filter(c => c && c.etapa === 'Assinado' && assinadoHaPoucoTempo(c, agoraMs));
  if (!assinados.length) return;

  // Uma passada e UMA gravação por bloco. Chamar as funções de criação uma por
  // contrato gravaria o bloco de clientes centenas de vezes na primeira
  // varredura, e como o histórico guarda só as 30 últimas versões, isso
  // apagaria todo o histórico útil da chave.
  const { valor: clientes, versao: vCli } = await bloco(K.clientes);
  let mudouCli = 0;
  for (const c of assinados) if (encaixarCliente(clientes, c, log)) mudouCli++;
  if (mudouCli) {
    await salvar(K.clientes, clientes, vCli);
    log.push(`${mudouCli} cliente(s) acertados a partir de contrato assinado`);
  }

  const { valor: contas, versao: vRec } = await bloco(K.receber);
  let mudouRec = 0;
  for (const c of assinados) if (encaixarContas(contas, c, log)) mudouRec++;
  if (mudouRec) {
    await salvar(K.receber, contas, vRec);
    log.push(`${mudouRec} contrato(s) ganharam parcelas`);
  }
}

// Só os dígitos: "+1 407 555 0100" e "14075550100" são a mesma pessoa. Comparar o texto cru
// criava cliente novo a cada formato diferente.
const soDigitos = (t) => String(t || '').replace(/\D/g, '');
const mesmoTelefone = (a, b) => {
  const x = soDigitos(a), y = soDigitos(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);   // com e sem código do país
};

// Garante o cliente do contrato assinado DENTRO do array recebido, sem gravar.
// Devolve true se mexeu em algo. O que decide se há trabalho a fazer é o elo
// contrato -> cliente (`contratoIds`), não a existência da pessoa: um cliente
// antigo pode já estar na base e o contrato novo dele ainda não estar ligado.
// Como o elo é gravado junto, a varredura seguinte não repete nada.
export function encaixarCliente(clientes, c, log) {
  if (clientes.some(x => x && (x.contratoIds || []).includes(c.id))) return false;
  let cliente = clientes.find(x => x && mesmoTelefone(x.telefone, c.telefone))
             || clientes.find(x => x && (x.nome || '').trim().toLowerCase() === (c.cliente || '').trim().toLowerCase());
  if (!cliente) {
    cliente = { id: uid('cl'), nome: c.cliente, telefone: c.telefone, criadoEm: agora(), contratoIds: [], historico: [{ quando: agora(), texto: 'Cliente criado automaticamente ao assinar contrato' }] };
    clientes.push(cliente);
    log.push(`cliente criado: ${c.cliente}`);
  } else {
    cliente.historico = cliente.historico || [];
    cliente.historico.push({ quando: agora(), texto: `Novo contrato assinado: ${c.servico}` });
  }
  cliente.contratoIds = cliente.contratoIds || [];
  cliente.contratoIds.push(c.id);
  return true;
}

// Mesma ideia para as parcelas: mexe no array recebido e devolve se mudou.
export function encaixarContas(contas, c, log) {
  if (contas.some(cr => cr && cr.contratoId === c.id)) return false;
  // trava extra por (contrato + descrição): se por algum caminho uma parcela já existir,
  // ela não é criada de novo
  const jaTem = (descricao) => contas.some(cr => cr.contratoId === c.id && cr.descricao === descricao);
  const dataBase = c.dataAssinatura ? c.dataAssinatura.slice(0, 10) : hoje();
  const base = { contratoId: c.id, clienteNome: c.cliente, servico: c.servico, vendedor: c.vendedor, status: 'A vencer', valorRecebido: 0, dataRecebimento: null, formaPagamento: c.pagamento || '', observacao: '', criadoEm: agora() };
  // A entrada quase nunca é paga do mesmo jeito que as parcelas: o cliente
  // manda o sinal por Zelle e só depois deixa o cartão para o resto. Alguns
  // pagam tudo no cartão. Por isso a entrada tem forma própria — e, quando o
  // vendedor não marcou nada diferente, ela cai na mesma forma das parcelas.
  const formaEntrada = c.pagamentoEntrada || c.pagamento || '';
  if (c.entrada > 0 && !jaTem('Entrada')) contas.push({ id: uid('fr'), ...base, formaPagamento: formaEntrada, descricao: 'Entrada', valor: c.entrada, vencimento: dataBase });
  if (c.numParcelas > 0) {
    for (const p of calcularParcelas(dataBase, c.numParcelas, c.diasPrimeiraParcela, c.recorrencia, c.diasCustom, c.valor, c.entrada, c.dataPrimeiraParcela)) {
      const desc = `Parcela ${p.numero}/${c.numParcelas}`;
      if (!jaTem(desc)) contas.push({ id: uid('fr'), ...base, descricao: desc, valor: p.valor, vencimento: p.data });
    }
  }
  if (!contas.some(cr => cr && cr.contratoId === c.id)) return false;   // entrada 0 e 0 parcelas: nada a gerar
  log.push(`parcelas geradas: ${c.cliente}`);
  return true;
}

// Monta o checklist do processo a partir do modelo do serviço.
// Sem dependente, é a lista do serviço e acabou. Com dependente, cada um ganha
// a própria seção: o passaporte do titular não serve para o filho, e anexar os
// dois no mesmo item do checklist faz um sobrescrever o outro.
// O que entra na seção do dependente é `documentosDependente`, configurado por
// serviço — o dependente de Visto T não entrega o mesmo que o de EB-2. Enquanto
// o serviço não tiver a lista própria, o dependente recebe A MESMA LISTA DO
// TITULAR: na prática do escritório ele entrega o mesmo conjunto de documentos.
// O padrão antigo era um item genérico só, e aí o passaporte, a certidão e a
// foto do filho iam todos anexados no mesmo lugar, um sobrescrevendo o outro.
export function montarChecklist(modelo, dependentes) {
  if (!modelo) return [];
  const item = (d, grupo) => ({
    nome: d.nome, dica: d.dica || '', status: 'Não solicitado',
    precisaTraducao: d.precisaTraducao !== false, interno: !!d.interno, formularioId: d.formularioId || '', modelo: d.modelo || null, grupo: grupo || null,
  });
  const doTitular = modelo.documentos || [];
  const lista = doTitular.map(d => item(d, null));
  const daLista = modelo.documentosDependente || [];
  // A lista do dependente é IDÊNTICA à do titular, formulários inclusive. Cheguei a
  // tirar os formulários daqui achando que o do titular cobria a família: errado. O
  // I-914 Supplement A é um por familiar — é justamente o formulário do dependente.
  const doDependente = daLista.length ? daLista
    : (doTitular.length ? doTitular : DOCUMENTOS_DEPENDENTE_PADRAO);
  const n = Math.max(0, Math.floor(Number(dependentes) || 0));
  for (let i = 1; i <= n; i++) for (const d of doDependente) lista.push(item(d, 'Dependente ' + i));
  return lista;
}

// 2) Contrato assinado → processo de Documentação
// Quem é a mesma pessoa, para a automação não criar ficha em cima de ficha.
//
// A regra só vale para ficha ÓRFÃ — sem contrato nenhum — e ativa. É o caso que
// importa: a ficha veio do Trello (ou foi criada à mão) antes de o contrato ser
// assinado, e a automação, sem isso, criava uma segunda, em branco, do mesmo
// cliente. Foi o que aconteceu com a família Abreu em 23/10: dois contratos do
// Lucas viraram duas fichas, mais a do Trello, e os documentos do irmão foram
// parar na errada.
//
// Telefone e e-mail são identificadores. Nome exato é o último recurso e só
// casa se for idêntico depois de tirar acento e caixa — "Lucas Moisés
// Gonçalves de Abreu" não casa com "Esdras Gonçalves de Abreu", que é
// exatamente o que precisa continuar não casando.
const semAc = (t) => String(t || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const soDig = (t) => String(t || '').replace(/\D/g, '');

// Os serviços de um contrato, sempre como lista.
//
// Um contrato pode ter mais de um serviço: o cliente fecha "Motion + mudança de
// endereço" num contrato só, com um pagamento só — mas são dois processos de
// documentação, que andam separados e têm checklist diferente.
//
// `c.servicos` é a lista; `c.servico` continua existindo com o PRINCIPAL,
// porque trinta e tantas telas leem esse campo e não precisam saber da lista.
// Contrato antigo não tem `servicos`: vira uma lista de um item só.
//
// Os dependentes são por serviço: dois no visto principal e nenhum na mudança
// de endereço é o caso normal, e dar a mesma lista de documentos para os dois
// encheria a ficha errada de seções vazias.
export function servicosDoContrato(c) {
  if (!c) return [];
  const lista = Array.isArray(c.servicos) ? c.servicos : null;
  if (lista && lista.length) {
    return lista
      .map((s) => (typeof s === 'string' ? { nome: s, dependentes: 0 } : s))
      .filter((s) => s && String(s.nome || '').trim())
      .map((s) => ({ nome: String(s.nome).trim(), dependentes: Math.max(0, Math.floor(Number(s.dependentes) || 0)), semFicha: !!s.semFicha }));
  }
  const nome = String(c.servico || '').trim();
  if (!nome) return [];
  return [{ nome, dependentes: Math.max(0, Math.floor(Number(c.dependentes) || 0)), semFicha: false }];
}

// Os serviços que VIRAM FICHA na Documentação.
//
// Nem todo serviço contratado vira um processo que anda no quadro. A tradução
// de documentos é o caso: ela é vendida junto com o visto, aparece no contrato
// como serviço contratado, mas não é um processo separado — é trabalho dentro
// do processo principal. Virar card só encheria o quadro de cartão que ninguém
// move.
//
// O contrato continua mencionando todos: quem lista para o cliente é
// `servicosDoContrato`; quem abre ficha é esta.
export function servicosQueViramFicha(c) {
  return servicosDoContrato(c).filter((s) => !s.semFicha);
}

// `servico` restringe a adoção: com um contrato de vários serviços, a ficha
// órfã de Motion não pode ser adotada pela mudança de endereço só porque ela é
// a primeira da lista. Ficha órfã sem serviço nenhum serve para qualquer um.
export function fichaDoMesmoCliente(processos, c, servico) {
  const alvo = semAc(servico || '');
  const serveAoServico = (p) => !alvo || !semAc(p.servico || '') || semAc(p.servico) === alvo;
  const ativos = processos.filter(p => p && !p.situacao && serveAoServico(p));
  const tel = soDig(c.telefone);
  const email = semAc(c.email);
  const nome = semAc(c.cliente);
  const orfa = (p) => !p.contratoId;

  if (tel.length >= 10) {
    const achou = ativos.find(p => orfa(p) && soDig(p.telefone).length >= 10 && soDig(p.telefone).slice(-10) === tel.slice(-10));
    if (achou) return { ficha: achou, por: 'telefone' };
  }
  if (email) {
    const achou = ativos.find(p => orfa(p) && semAc(p.email) === email);
    if (achou) return { ficha: achou, por: 'e-mail' };
  }
  if (nome) {
    const iguais = ativos.filter(p => orfa(p) && semAc(p.clienteNome) === nome);
    // Dois órfãos com o mesmo nome: não dá para escolher sem chutar.
    if (iguais.length === 1) return { ficha: iguais[0], por: 'nome' };
  }
  return null;
}

/** Outra ficha ATIVA da mesma pessoa, já com contrato. Só para avisar. */
export function outraFichaDaPessoa(processos, c, excluindo) {
  const tel = soDig(c.telefone);
  const nome = semAc(c.cliente);
  // Fichas do MESMO contrato não contam: um contrato de dois serviços gera duas
  // fichas de propósito, e avisar "esta pessoa já tem outra ficha" em cada uma
  // seria barulho justamente onde está tudo certo. O aviso existe para o caso
  // do Lucas — a mesma pessoa aparecendo em contratos diferentes.
  const mesmoContrato = (p) => c && c.id && p.contratoId === c.id;
  return processos.find(p => p && !p.situacao && p !== excluindo && p.contratoId
    && !mesmoContrato(p)
    && ((tel.length >= 10 && soDig(p.telefone).slice(-10) === tel.slice(-10))
        || (nome && semAc(p.clienteNome) === nome))) || null;
}

async function processosDeContratos(log) {
  const { valor: contratos } = await bloco(K.contratos);
  const { valor: processos, versao } = await bloco(K.processos);
  const { valor: checklists } = await bloco(K.checklists);
  let n = 0;
  let adotados = 0;
  const criados = new Set();
  for (const c of contratos.filter(x => x.etapa === 'Assinado')) {
    // UMA FICHA POR SERVIÇO. Um contrato de "Motion + mudança de endereço" é um
    // pagamento só, mas dois processos que andam separados — por isso a conta
    // de "já existe?" passou a ser por contrato E serviço, não só por contrato.
    for (const sv of servicosQueViramFicha(c)) {
      if (processos.some(p => p.contratoId === c.id && (p.servico || '') === sv.nome)) continue;

      // Antes de criar, procurar: esta pessoa já tem ficha sem contrato? Com
      // vários serviços a ficha órfã só é adotada pelo serviço CERTO — senão a
      // ficha antiga de Motion seria adotada pela mudança de endereço, que é a
      // primeira da lista.
      const achada = fichaDoMesmoCliente(processos, c, sv.nome);
      if (achada) {
        achada.ficha.contratoId = c.id;
        if (!achada.ficha.servico && sv.nome) achada.ficha.servico = sv.nome;
        if (!achada.ficha.telefone && c.telefone) achada.ficha.telefone = c.telefone;
        if (!achada.ficha.email && c.email) achada.ficha.email = c.email;
        if (!achada.ficha.vendedor && c.vendedor) achada.ficha.vendedor = c.vendedor;
        achada.ficha.historico = achada.ficha.historico || [];
        achada.ficha.historico.push({ quando: agora(),
          texto: `Contrato assinado ligado a esta ficha (reconhecida pelo ${achada.por}) — em vez de criar uma ficha nova para o mesmo cliente.` });
        adotados++;
        continue;
      }
      const modelo = checklists.find(ck => ck.servico === sv.nome);
      processos.push({
      id: uid('doc'), contratoId: c.id, clienteNome: c.cliente, telefone: c.telefone || '', email: c.email || '', servico: sv.nome, vendedor: c.vendedor || '',
      responsavel: '', status: 'Aguardando boas-vindas',
      dependentes: sv.dependentes,
      checklist: montarChecklist(modelo, sv.dependentes),
      boasVindasEnviada: false, autorizacaoSolicitada: false, autorizacaoConcedida: false, protocolo: null, acompanhamentos: [], etiquetas: [],
      semRetorno: false, semRetornoDesde: null, ajudaVendedorSolicitadaEm: null,
      traducao: { status: 'nao_enviado', prestadorId: null, prestadorNome: null, enviadoEm: null, documentos: [], recebidoEm: null, valor: null, pagamentoGerado: false, confirmadoPeloPrestador: false, confirmadoEm: null, observacoesPrestador: '', arquivosRecebidos: [] },
      avaliacaoPsicologica: { necessaria: false, status: 'nao_iniciado', prestadorId: null, prestadorNome: null, dataConsulta: null, laudoRecebidoEm: null, valor: null, pagamentoGerado: false, laudoArquivo: null },
      historico: [{ quando: agora(), texto: `Processo criado automaticamente — contrato assinado · serviço "${sv.nome}"`
        + (sv.dependentes > 0 ? ` · ${sv.dependentes} dependente(s), cada um com a própria seção no checklist` : '') }], criadoEm: agora(),
    });
    // A pessoa já tinha outra ficha, com outro contrato. Pode ser legítimo —
    // dois vistos diferentes — ou pode ser o segundo contrato do mesmo caso.
    // Quem decide é gente; o sistema só não deixa isso passar em silêncio, que
    // foi como o Lucas acabou com três fichas.
    const outra = outraFichaDaPessoa(processos, c, processos[processos.length - 1]);
    if (outra) {
      processos[processos.length - 1].historico.push({ quando: agora(),
        texto: `Atenção: ${c.cliente} já tem outra ficha neste sistema (${outra.servico || 'sem serviço'}, etapa "${outra.status || ''}"). `
             + `Se for o mesmo caso, use "Unificar com outro processo". Se forem casos diferentes, ignore este aviso.` });
      log.push(`ficha nova de ${c.cliente}: a pessoa já tinha outra — avisado no histórico`);
    }
    criados.add(processos[processos.length - 1].id);
    n++;
    }
  }
  if (n || adotados) {
    await salvar(K.processos, processos, versao, criados.size ? podarFichasQueJaExistem(criados) : undefined);
    if (n) log.push(`${n} processo(s) de documentação criado(s)`);
    if (adotados) log.push(`${adotados} contrato(s) ligado(s) a ficha que já existia, sem duplicar`);
  }
}

// 3) Financeiro autorizou o protocolo → processo "Liberado para protocolo"
async function autorizacoesFinanceiras(log) {
  const { valor: processos, versao } = await bloco(K.processos);
  let n = 0;
  for (const p of processos) {
    if (p.status === 'Aguardando autorização financeira' && p.autorizacaoConcedida) {
      p.status = 'Liberado para protocolo';
      p.historico = p.historico || [];
      p.historico.push({ quando: agora(), texto: 'Financeiro autorizou o protocolo — liberado para a equipe de documentação' });
      n++;
    }
  }
  if (n) { await salvar(K.processos, processos, versao); log.push(`${n} processo(s) liberado(s) para protocolo`); }
}

// 4) Comissão do SDR: contrato assinado de lead recuperado + entrada mínima paga
// Prioridade da fila do SDR pela idade do lead. Roda uma vez por dia: o lead
// desce de cadência sozinho conforme envelhece, e sai da fila principal quando
// fica velho demais — sem ser descartado, continua em "Baixa prioridade".
// Existe porque a fila só cresce: sem isso, todo mundo acaba em cadência diária
// e ninguém vence a lista.
async function prioridadeSdrPorIdade(log) {
  const R = await obterRegras();
  const cfg = (R.sdr && R.sdr.prioridadePorIdade) || [];
  if (!R.sdr || R.sdr.prioridadePorIdadeAtiva === false || !cfg.length) return;

  const { valor: leads, versao } = await bloco(K.sdr);
  if (!Array.isArray(leads) || !leads.length) return;

  const hoje = Date.now();
  let mudou = 0, paraBaixa = 0;
  for (const l of leads) {
    // Só mexe em quem está esperando. Recuperado e encerrado ficam como estão.
    if (l.status !== 'fila' && l.status !== 'baixa_prioridade') continue;
    const base = l.enviadoEm || l.entrada;
    if (!base) continue;
    const dias = Math.floor((hoje - new Date(base).getTime()) / 864e5);
    if (!Number.isFinite(dias)) continue;

    const faixa = cfg.find(f => f.ateDias == null || dias <= Number(f.ateDias)) || cfg[cfg.length - 1];
    const novoStatus = faixa.baixaPrioridade ? 'baixa_prioridade' : 'fila';

    if (l.faixaCadencia !== faixa.cadencia || l.status !== novoStatus) {
      const antes = l.status;
      l.faixaCadencia = faixa.cadencia;
      l.status = novoStatus;
      l.historico = l.historico || [];
      l.historico.push({ tipo: 'Sistema', quando: new Date().toISOString(),
        texto: `Lead com ${dias} dias: cadência ${faixa.cadencia.replace(/_/g, ' ')}`
          + (novoStatus !== antes ? ` e movido para ${novoStatus === 'baixa_prioridade' ? 'baixa prioridade' : 'a fila'}` : '')
          + ' (prioridade por idade).' });
      mudou++;
      if (novoStatus === 'baixa_prioridade' && antes !== novoStatus) paraBaixa++;
    }
  }
  if (!mudou) return;
  await salvar(K.sdr, leads, versao);
  log.push(`prioridade do SDR por idade: ${mudou} lead(s) ajustado(s)${paraBaixa ? `, ${paraBaixa} para baixa prioridade` : ''}`);
}

async function comissaoSdr(log) {
  const R = await obterRegras();
  const cfg = { comissaoSdr: Number(R.sdr.comissao.valor) || 0, entradaMinSdr: Number(R.sdr.comissao.entradaMinima) || 0 };
  if (!cfg.comissaoSdr) return; // comissão zerada = desligada
  const { valor: contratos } = await bloco(K.contratos);
  const { valor: sdrLeads } = await bloco(K.sdr);
  const { valor: contas } = await bloco(K.receber);
  const { valor: pagar, versao } = await bloco(K.pagar);
  // O telefone era comparado como TEXTO EXATO: "+1 407 555 0110" não casava
  // com "+14075550110", e a comissão simplesmente não saía — dinheiro que o
  // SDR ganhou e não recebeu, sem ninguém ficar sabendo. Agora compara pelos
  // últimos dígitos, como o resto do sistema.
  const fim = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : ''; };
  const recuperados = sdrLeads.filter(l => l.status === 'recuperado');
  const semTelefone = recuperados.filter(l => !fim(l.telefone));
  if (semTelefone.length) {
    log.push(`comissão do SDR: ${semTelefone.length} lead(s) recuperado(s) sem telefone não podem ser casados com contrato — `
      + semTelefone.slice(0, 5).map(l => l.nome || l.id).join(', '));
  }
  const telsRecuperados = new Set(recuperados.map(l => fim(l.telefone)).filter(Boolean));
  let n = 0;
  for (const c of contratos) {
    if (c.etapa !== 'Assinado' || !fim(c.telefone)) continue;
    if (!telsRecuperados.has(fim(c.telefone))) continue;
    if (pagar.some(cp => cp.contratoId === c.id && cp.categoria === 'Comissão SDR')) continue;
    const entrada = contas.find(cr => cr.contratoId === c.id && cr.descricao === 'Entrada');
    const entradaPaga = entrada ? Number(entrada.valorRecebido || 0) : 0;
    if (entradaPaga < cfg.entradaMinSdr) continue;
    pagar.push({
      id: uid('cp'), fornecedor: 'SDR', descricao: `Comissão SDR — recuperação de ${c.cliente}`, categoria: 'Comissão SDR', centroCusto: 'Vendas', conta: '',
      valor: cfg.comissaoSdr, vencimento: hoje(), formaPagamento: '',
      observacao: `Contrato assinado + entrada de ${fmtMoney(entradaPaga)} paga (mínimo exigido: ${fmtMoney(cfg.entradaMinSdr)}).`,
      status: 'A vencer', tipo: 'unica', contratoId: c.id, criadoEm: agora(),
    });
    n++;
  }
  if (n) { await salvar(K.pagar, pagar, versao); log.push(`${n} comissão(ões) de SDR gerada(s)`); avisarCanal('financeiro', `💰 Comissão de SDR gerada automaticamente (${n}).`).catch(() => {}); }
}

// 5) Contas vencidas viram "Atrasado" (receber e pagar), todo dia — não depende de alguém abrir o Financeiro
async function marcarAtrasadas(log) {
  const h = hoje();
  for (const chave of [K.receber, K.pagar]) {
    const { valor: contas, versao } = await bloco(chave);
    let n = 0;
    for (const c of contas) if (c.status === 'A vencer' && c.vencimento && c.vencimento < h) { c.status = 'Atrasado'; n++; }
    if (n) { await salvar(chave, contas, versao); log.push(`${n} conta(s) marcada(s) como Atrasado em ${chave === K.receber ? 'receber' : 'pagar'}`); }
  }
}

// 6) Tarefas antigas ligadas só pelo nome ganham clienteId (uma vez; novas já vêm com id)
async function vincularTarefasPorId(log) {
  const { valor: tarefas, versao } = await bloco('legalway-tarefas-v1');
  const { valor: clientes } = await bloco(K.clientes);
  let n = 0;
  for (const t of tarefas) {
    if (t.clienteId || !t.vinculo) continue;
    const alvo = (t.vinculo || '').trim().toLowerCase();
    const c = clientes.find(x => (x.nome || '').trim().toLowerCase() === alvo) || clientes.find(x => x.nome && alvo.includes(x.nome.trim().toLowerCase()));
    if (c) { t.clienteId = c.id; n++; }
  }
  if (n) { await salvar('legalway-tarefas-v1', tarefas, versao); log.push(`${n} tarefa(s) vinculada(s) a cliente por id`); }
}

// 7) Contrato cancelado → parcelas futuras (sem nada recebido) viram "Cancelado"; o que já foi pago fica
async function estornarParcelasDeCancelados(log) {
  const R = await obterRegras();
  if (R.contratos.cancelarEstornaFuturas === false) return;
  const { valor: contratos } = await bloco(K.contratos);
  const cancelados = new Set(contratos.filter(c => c.etapa === 'Cancelado').map(c => c.id));
  if (!cancelados.size) return;
  const { valor: contas, versao } = await bloco(K.receber);
  let n = 0;
  for (const c of contas) {
    if (!cancelados.has(c.contratoId)) continue;
    if (!['A vencer', 'Atrasado', 'Pausado'].includes(c.status) || Number(c.valorRecebido || 0) > 0) continue;
    c.status = 'Cancelado';
    c.observacao = ((c.observacao || '') + ' Cancelada automaticamente: contrato cancelado.').trim();
    n++;
  }
  if (n) { await salvar(K.receber, contas, versao); log.push(`${n} parcela(s) cancelada(s) de contrato(s) cancelado(s)`); }
}

// 8) Tarefas recorrentes: ao concluir, cria a próxima; no dia do prazo, avisa o responsável no chat
function proximaData(prazo, recorrencia) {
  const d = new Date((prazo || hoje()) + 'T12:00:00');
  if (recorrencia === 'diaria') d.setDate(d.getDate() + 1);
  else if (recorrencia === 'semanal') d.setDate(d.getDate() + 7);
  else if (recorrencia === 'quinzenal') d.setDate(d.getDate() + 15);
  else if (recorrencia === 'mensal') d.setMonth(d.getMonth() + 1);
  else return null;
  return d.toISOString().slice(0, 10);
}
async function tarefasRecorrentesELembretes(log) {
  const { valor: tarefas, versao } = await bloco('legalway-tarefas-v1');
  const R = await obterRegras();
  const antes = Number(R.tarefas.lembreteDiasAntes) || 0;
  const alvo = new Date(); alvo.setDate(alvo.getDate() + antes); const diaAlvo = alvo.toISOString().slice(0, 10);
  const h = hoje();
  let novas = 0, avisos = 0;
  for (const t of tarefas.slice()) {
    // concluída e recorrente, ainda sem a próxima gerada
    if (t.recorrencia && t.status === 'Concluída' && !t.proximaGerada) {
      const prox = proximaData(t.prazo, t.recorrencia);
      if (prox) {
        tarefas.unshift({ ...t, id: uid('tf'), status: 'A fazer', prazo: prox, criadoEm: agora(), concluidaEm: null, proximaGerada: false, lembreteEnviadoEm: null, criadoPor: 'Sistema (recorrência)', origemRecorrencia: t.id });
        t.proximaGerada = true; novas++;
      }
    }
    // lembrete no dia do prazo (uma vez)
    if (t.status !== 'Concluída' && t.prazo === diaAlvo && t.responsavel && t.lembreteEnviadoEm !== h) {
      const ok = await avisarPessoa(t.responsavel, `⏰ Tarefa ${antes ? 'pra ' + fmtVenc(t.prazo) : 'pra hoje'}: "${t.titulo}"${t.vinculo ? ' — ' + t.vinculo : ''}. Veja em Tarefas.`);
      t.lembreteEnviadoEm = h; if (ok) avisos++;
    }
  }
  if (novas || avisos) { await salvar('legalway-tarefas-v1', tarefas, versao); if (novas) log.push(`${novas} tarefa(s) recorrente(s) criada(s)`); if (avisos) log.push(`${avisos} lembrete(s) de tarefa enviado(s)`); }
}

// Controle de "já avisei hoje" (uma chave por tipo de aviso)
const K_AVISOS = 'legalway-avisos-enviados-v1';
async function avisoDoDia(chave) {
  const { valor: avisos, versao } = await bloco(K_AVISOS, {});
  const h = hoje();
  if (avisos[chave] === h) return false;
  avisos[chave] = h;
  await salvar(K_AVISOS, avisos, versao);
  return true;
}
const fmtVenc = (iso) => iso ? iso.split('-').reverse().join('/') : '';

// 9) Financeiro: resumo diário no #financeiro do que vence hoje, em 3 dias e do que está atrasado
async function avisosFinanceiro(log) {
  if (!(await avisoDoDia('financeiro-diario'))) return;
  const R = await obterRegras();
  const diasAviso = Number(R.financeiro.diasAvisoVencimento) || 3;
  const { valor: contas } = await bloco(K.receber);
  const h = hoje();
  const em3 = new Date(); em3.setDate(em3.getDate() + diasAviso); const d3 = em3.toISOString().slice(0, 10);
  const abertas = contas.filter(c => ['A vencer', 'Pago parcialmente', 'Atrasado'].includes(c.status));
  const hojeV = abertas.filter(c => c.vencimento === h);
  const prox = abertas.filter(c => c.vencimento > h && c.vencimento <= d3);
  const atras = abertas.filter(c => c.status === 'Atrasado' || (c.vencimento && c.vencimento < h));
  if (!hojeV.length && !prox.length && !atras.length) return;
  const linha = (c) => `${c.clienteNome} — ${c.descricao} ${fmtMoney(Number(c.valor || 0) - Number(c.valorRecebido || 0))} (${fmtVenc(c.vencimento)})`;
  const partes = [];
  if (hojeV.length) partes.push(`📅 Vencem hoje (${hojeV.length}):\n` + hojeV.map(linha).join('\n'));
  if (prox.length) partes.push(`🔜 Próximos ${diasAviso} dias (${prox.length}):\n` + prox.map(linha).join('\n'));
  if (atras.length) partes.push(`🔴 Atrasadas (${atras.length}):\n` + atras.slice(0, 15).map(linha).join('\n') + (atras.length > 15 ? `\n… e mais ${atras.length - 15}` : ''));
  await avisarCanal('financeiro', 'Resumo do dia — contas a receber\n\n' + partes.join('\n\n'));
  log.push('resumo financeiro do dia enviado');
}

// 10) Comercial: follow-ups atrasados e leads parados, mensagem direta pra cada vendedor (uma vez por dia)
async function avisosComercial(log) {
  if (!(await avisoDoDia('comercial-diario'))) return;
  const R = await obterRegras();
  const diasParado = Number(R.funil.diasLeadParado) || 3;
  // 'Perdido' e 'Perda': o nome da coluna mudou em 23/10/2026 e os leads
  // gravados antes continuam com o nome velho.
  const fechadas = new Set([R.funil.etapaGanho, R.funil.etapaPerdido, 'Ganho', 'Perdido', 'Perda']);
  const { valor: leads } = await bloco('legalway-funil-v1');
  const agoraMs = Date.now(), h = hoje();
  const porVendedor = {};
  for (const l of leads) {
    if (!l.vendedor || fechadas.has(l.etapa)) continue;
    const v = porVendedor[l.vendedor] = porVendedor[l.vendedor] || { followups: [], parados: [] };
    if (l.proximaAcao && l.proximaAcao.data && (l.proximaAcao.data < h || (l.proximaAcao.data === h))) v.followups.push(`${l.nome} (${fmtVenc(l.proximaAcao.data)}${l.proximaAcao.hora ? ' ' + l.proximaAcao.hora : ''})`);
    const ultimo = (l.ultimoContato && l.ultimoContato.quando) || l.entradaEtapa || l.assumidoEm || l.criadoEm;
    if (ultimo && (agoraMs - new Date(ultimo).getTime()) > diasParado * 86400000) v.parados.push(`${l.nome} — ${l.etapa}`);
  }
  let n = 0;
  for (const [vend, v] of Object.entries(porVendedor)) {
    if (!v.followups.length && !v.parados.length) continue;
    const partes = [];
    if (v.followups.length) partes.push(`🔔 Follow-ups pra hoje/atrasados (${v.followups.length}):\n` + v.followups.join('\n'));
    if (v.parados.length) partes.push(`⏳ Sem contato há mais de ${diasParado} dias (${v.parados.length}):\n` + v.parados.slice(0, 15).join('\n'));
    if (await avisarPessoa(vend, 'Seu funil hoje\n\n' + partes.join('\n\n') + '\n\nVeja em Funil Comercial.')) n++;
  }
  if (n) log.push(`${n} resumo(s) comercial(is) enviado(s)`);
}

let rodando = false;
export async function executarAutomacoes(motivo = 'agendado') {
  if (rodando) return;
  rodando = true;
  const log = [];
  // A ORDEM importa: a conciliação do Stripe vem antes de tudo que julga
  // dinheiro — se o cliente pagou agora, marcar atrasado ou mandar cobrança
  // seria errado.
  const PASSOS = [
    ['primeiro contato', primeiroContato],
    ['conciliação do Stripe', conferirStripe],
    ['avisos automáticos', avisosAutomaticos],
    ['assinaturas pendentes', assinaturasPendentes],
    ['cliente e parcelas dos assinados', clientesEContasDeAssinados],
    ['processos de contratos', processosDeContratos],
    ['autorizações financeiras', autorizacoesFinanceiras],
    ['comissão do SDR', comissaoSdr],
    ['prioridade do SDR', prioridadeSdrPorIdade],
    ['marcar atrasadas', marcarAtrasadas],
    ['vincular tarefas', vincularTarefasPorId],
    ['estornar cancelados', estornarParcelasDeCancelados],
    ['tarefas recorrentes', tarefasRecorrentesELembretes],
    ['avisos do financeiro', avisosFinanceiro],
    ['avisos do comercial', avisosComercial],
    ['varrer USCIS', varrerUscis],
    ['conferir prazos', conferirPrazos],
    ['avisos de parcela', avisosDeParcela],
    ['boletim diário', boletimDiario],
    ['limpar tentativas', limparTentativas],
  ];

  // Cada passo no seu próprio try. Estavam os vinte dentro de UM: bastava o
  // primeiro falhar — um lead com data estragada, por exemplo — para que
  // cobrança, USCIS, comissão e todo o resto parassem de rodar. Em silêncio,
  // todas as rodadas seguintes, até alguém ler o log do servidor.
  const falhas = [];
  try {
    for (const [nome, passo] of PASSOS) {
      try {
        await passo(log);
      } catch (e) {
        falhas.push(`${nome}: ${e.message}`);
        console.error(`[automações] "${nome}" falhou:`, e);
      }
    }
    if (log.length) console.log(`[automações/${motivo}] ${log.join(' · ')}`);
    if (falhas.length) {
      console.error(`[automações/${motivo}] ${falhas.length} passo(s) falharam: ${falhas.join(' · ')}`);
      // Uma automação quebrada não pode ficar só no log: ninguém lê log de
      // servidor. Uma vez por dia, para não virar barulho a cada rodada.
      if (await avisoDoDia('automacoes-falharam')) {
        avisarCanal('documentacao',
          `⚠️ ${falhas.length} automação(ões) pararam de funcionar hoje:\n\n${falhas.map(f => '• ' + f).join('\n')}\n\n`
          + 'As outras continuaram rodando. Isso precisa de alguém olhando o sistema.').catch(() => {});
      }
    }
  } finally { rodando = false; }
  return { passos: PASSOS.length, falhas };
}

// Chaves cujas gravações disparam uma rodada logo em seguida
const GATILHOS = new Set([K.contratos, K.receber, K.processos, K.sdr, K.clientes, 'legalway-tarefas-v1', 'legalway-leads-v1']);
export function aoGravarChave(chave) {
  if (GATILHOS.has(chave) || chave.startsWith('legalway-contrato-assinado-')) setTimeout(() => executarAutomacoes('gatilho:' + chave), 1500);
}
