// A rota da Conciliação de Fluxo.
//
// Separada de conciliacao.js de propósito: aquele arquivo é função pura e não
// pode importar banco, senão os testes precisariam de Postgres para rodar.
//
// A conta é feita AQUI, no servidor, e não na tela. O bloco de fichas tem
// milhares de anexos; mandá-lo inteiro para o navegador é a leitura pesada que
// já derrubou o container. O navegador recebe só o diagnóstico, que é pequeno.
import { Router } from 'express';
import { ler } from './armazenamento.js';
import { exigirLogin } from './auth.js';
import { conciliar, servicosQueViramCard } from './conciliacao.js';
import { pagoPeloCliente, saldoDoCliente, entrouNaConta } from './pagamento.js';
import { limparTexto } from './sanitizar.js';
import { encaixarCliente, encaixarContas, novaFichaDeContrato } from './automacoes.js';
import { gravar } from './armazenamento.js';
import { query } from './db.js';

export const rotasConciliacao = Router();

const K = {
  contratos: 'legalway-contratos-v1',
  clientes: 'legalway-clientes-v1',
  contas: 'legalway-financeiro-v1',
  processos: 'legalway-processos-documentacao-v1',
  checklists: 'legalway-checklists-v1',
};

// 60 segundos. A varredura passa por todos os contratos e todos os
// lançamentos; com várias pessoas abrindo a tela ao mesmo tempo, refazer a
// conta a cada F5 é desperdício puro — e o diagnóstico não muda de segundo em
// segundo.
const CACHE_MS = 60 * 1000;
let cache = { quando: 0, dados: null };

// As três rotas de leitura passam por aqui, para não recalcularem o
// diagnóstico uma vez cada quando a tela abre o mês e a lista junto.
async function diagnostico(recalcular = false) {
  const agora = Date.now();
  if (!cache.dados || agora - cache.quando > CACHE_MS || recalcular) {
    cache = { quando: agora, dados: await diagnosticoAgora() };
  }
  return cache.dados;
}

// Cache dos BLOCOS, separado do cache do diagnóstico.
//
// Sem ele, cada chamada relia tudo do banco — inclusive o bloco de fichas, que
// tem milhares de anexos. Uma sequência normal de uso (abrir o painel, abrir
// três contratos) virava cinco leituras completas, e começava a dar tempo
// esgotado no meio da auditoria mês a mês.
//
// 45 segundos: curto o bastante para a tela não mentir depois de uma
// correção, longo o bastante para uma rajada de consultas custar uma leitura.
// A rota de correção NÃO usa este cache: ela lê direto, porque o que ela
// decide vira escrita.
const BLOCOS_MS = 45 * 1000;
const blocos = new Map();

const lista = async (chave) => {
  const guardado = blocos.get(chave);
  if (guardado && Date.now() - guardado.quando < BLOCOS_MS) return guardado.valor;
  const r = await ler(chave);
  const valor = Array.isArray(r && r.valor) ? r.valor : [];
  blocos.set(chave, { quando: Date.now(), valor });
  return valor;
};

// Depois de corrigir, o que está em cache virou passado.
function esquecerCache() {
  blocos.clear();
  cache = { quando: 0, dados: null };
}

export async function diagnosticoAgora() {
  const [contratos, clientes, contas, processos, checklists] = await Promise.all(
    [K.contratos, K.clientes, K.contas, K.processos, K.checklists].map(lista));
  return conciliar({ contratos, clientes, contas, processos, checklists });
}

// O raio-X de UM contrato, com os lançamentos, os cards e o cliente.
//
// Existe para a tela não precisar baixar os blocos inteiros só para mostrar o
// detalhe de um caso. O de fichas tem milhares de anexos; puxá-lo no navegador
// é a leitura pesada que já derrubou o servidor. Aqui sai só o que é daquele
// contrato, sem anexo nenhum.
// ---------------------------------------------------------------------------
// CORREÇÃO DE DIVERGÊNCIAS
//
// Três regras, e elas são o que torna isto aceitável:
//
//   1. Só operações comprovadamente seguras. Nada aqui altera valor de
//      contrato, de parcela ou de pagamento, e nada apaga registro. Criar o
//      que falta e religar o que se soltou — só isso.
//   2. Idempotente. Toda ação reconfere se a divergência ainda existe no
//      instante da escrita e não faz nada se já foi resolvida. As funções
//      usadas são as MESMAS da automação (encaixarCliente, encaixarContas,
//      novaFichaDeContrato), que já nasceram assim.
//   3. Auditável. Prévia obrigatória antes de aplicar, e toda aplicação entra
//      na auditoria com quem fez e o que mudou.
//
// O que NÃO está aqui, de propósito: acertar valor divergente, juntar
// clientes repetidos e apagar card duplicado. Os três precisam de gente
// olhando o caso, e dois deles mexem em dinheiro.
// Quem pode virar responsável, e em quais fichas.
//
// A regra de segurança é uma só e vale nas duas portas (um contrato e um mês
// inteiro): SÓ PREENCHE FICHA SEM DONO. Nunca troca quem já tem responsável.
// Foi assim que ela pediu — "todos no nome da Vitória, se ela quiser depois ela
// altera" —, e é o que torna a operação em massa segura: ela não pode apagar
// uma atribuição que alguém fez de propósito.
const MAX_NOME = 80;
function nomeDeResponsavel(bruto) {
  // Só string. Um objeto no corpo do POST virava "[object Object]", que tem 15
  // caracteres e passava na checagem de tamanho — e isso seria gravado como
  // responsável em 160 cards de uma vez.
  if (typeof bruto !== 'string') return null;
  const n = limparTexto(bruto).trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > MAX_NOME) return null;
  return n;
}
const fichaSemDono = (p, contratoId) => !!p && p.situacao !== 'cancelado' && !p.responsavel
  && (contratoId == null || p.contratoId === contratoId);

function porDono(processos, nome, quem, filtro) {
  const alvos = processos.filter(filtro);
  for (const p of alvos) {
    p.responsavel = nome;
    p.historico = Array.isArray(p.historico) ? p.historico : [];
    p.historico.push({ tipo: 'Sistema', quando: new Date().toISOString(), quem,
      texto: `Responsável definido como ${nome} pela Conciliação de Fluxo — o card estava sem ninguém. Dá para trocar a qualquer momento.` });
  }
  return alvos;
}

const ACOES = {
  'criar-cliente': {
    rotulo: 'Criar o cadastro do cliente a partir do contrato',
    explica: 'Cria o cliente com o nome e o telefone do contrato, e liga o contrato a ele. Nenhum valor é tocado.',
    async preparar({ c, clientes }) {
      const antes = clientes.length;
      const log = [];
      const mudou = encaixarCliente(clientes, c, log);
      if (!mudou) return null;
      return { bloco: K.clientes, valor: clientes,
        resumo: clientes.length > antes ? `cliente "${c.cliente}" criado e ligado ao contrato`
                                        : `contrato ligado ao cadastro que já existia de "${c.cliente}"` };
    },
  },
  'gerar-financeiro': {
    rotulo: 'Gerar os lançamentos a partir do contrato',
    explica: 'Cria a entrada e as parcelas exatamente como o contrato combina. Só roda se o contrato não tiver NENHUM lançamento — nunca mexe no que já existe.',
    async preparar({ c, contas }) {
      if (contas.some(x => x && x.contratoId === c.id)) return null;   // já tem: não é caso disto
      const antes = contas.length;
      const log = [];
      if (!encaixarContas(contas, c, log)) return null;
      return { bloco: K.contas, valor: contas,
        resumo: `${contas.length - antes} lançamento(s) criado(s) somando US$ ${
          Math.round(contas.slice(antes).reduce((a, x) => a + (Number(x.valor) || 0), 0) * 100) / 100}` };
    },
  },
  'abrir-card': {
    rotulo: 'Abrir o card do serviço que falta',
    explica: 'Cria o processo na Documentação para um serviço contratado que não tem card, já com o checklist do serviço.',
    precisa: 'servico',
    async preparar({ c, processos, checklists, extra }) {
      const alvo = servicosQueViramCard(c).find(sv => sv.nome === extra);
      if (!alvo) return null;
      const jaTem = processos.some(p => p && p.contratoId === c.id && (p.servico || '') === alvo.nome && p.situacao !== 'cancelado');
      if (jaTem) return null;
      const modelo = checklists.find(ck => ck && ck.servico === alvo.nome);
      const ficha = novaFichaDeContrato(c, alvo, modelo);
      ficha.historico = [{ quando: new Date().toISOString(),
        texto: `Card aberto pela Conciliação de Fluxo — o serviço "${alvo.nome}" estava no contrato sem processo na Documentação.` }];
      processos.push(ficha);
      return { bloco: K.processos, valor: processos,
        resumo: `card de "${alvo.nome}" aberto com ${(ficha.checklist || []).length} documento(s) no checklist` };
    },
  },
  'definir-responsavel': {
    rotulo: 'Definir o responsável dos cards sem dono',
    explica: 'Põe a pessoa escolhida nos cards ativos deste contrato que estão SEM responsável. Quem já tem dono não é tocado, e dá para trocar depois no próprio card.',
    precisa: 'responsavel',
    async preparar({ c, processos, quem, extra }) {
      const nome = nomeDeResponsavel(extra);
      if (!nome) return null;
      const alvos = porDono(processos, nome, quem, (p) => fichaSemDono(p, c.id));
      if (!alvos.length) return null;
      return { bloco: K.processos, valor: processos,
        resumo: `${alvos.length} card(s) agora com ${nome}: ${alvos.map(p => p.servico || 'sem serviço').join(', ')}` };
    },
  },
  'cancelar-cards': {
    rotulo: 'Cancelar os cards deste contrato cancelado',
    explica: 'Marca como cancelados os processos ainda ativos de um contrato cancelado. Cancelar não apaga: tudo continua lá e dá para reativar.',
    async preparar({ c, processos, quem }) {
      if (c.etapa !== 'Cancelado') return null;
      const vivos = processos.filter(p => p && p.contratoId === c.id && p.situacao !== 'cancelado');
      if (!vivos.length) return null;
      for (const p of vivos) {
        p.situacao = 'cancelado';
        p.situacaoMotivo = 'Contrato cancelado';
        p.situacaoEm = new Date().toISOString();
        p.situacaoPor = quem;
        p.historico = Array.isArray(p.historico) ? p.historico : [];
        p.historico.push({ tipo: 'Sistema', quando: new Date().toISOString(), quem,
          texto: 'Card cancelado pela Conciliação de Fluxo — o contrato está cancelado. Nada foi apagado; dá para reativar.' });
      }
      return { bloco: K.processos, valor: processos,
        resumo: `${vivos.length} card(s) cancelado(s): ${vivos.map(p => p.servico).join(', ')}` };
    },
  },
};

rotasConciliacao.get('/conciliacao/acoes', exigirLogin, (req, res) => {
  res.json({ acoes: Object.entries(ACOES).map(([chave, a]) =>
    ({ chave, rotulo: a.rotulo, explica: a.explica, precisa: a.precisa || null })) });
});

rotasConciliacao.post('/conciliacao/corrigir', exigirLogin, async (req, res, next) => {
  try {
    const acao = ACOES[String(req.body?.acao || '')];
    if (!acao) return res.status(400).json({ erro: 'Ação desconhecida.' });
    const id = String(req.body?.contratoId || '');
    // Cada ação diz de qual campo precisa; antes isto era sempre `servico`.
    const campo = acao.precisa || null;
    const extra = campo && req.body?.[campo] != null ? String(req.body[campo]) : null;
    if (campo && !extra) return res.status(400).json({ erro: `Informe: ${campo}.` });

    // Lê TUDO agora. A conferência vale no instante da escrita, não no da
    // última vez que alguém abriu o painel.
    const [contratos, clientes, contas, processos, checklists] = await Promise.all(
      [K.contratos, K.clientes, K.contas, K.processos, K.checklists].map(async (k) => {
        const r = await ler(k);
        return { chave: k, valor: Array.isArray(r && r.valor) ? r.valor : [], versao: r ? r.versao : null };
      }));
    const porChave = Object.fromEntries([contratos, clientes, contas, processos, checklists].map(b => [b.chave, b]));
    const c = porChave[K.contratos].valor.find(x => x && x.id === id);
    if (!c) return res.status(404).json({ erro: 'Contrato não encontrado.' });

    const plano = await acao.preparar({
      c, clientes: porChave[K.clientes].valor, contas: porChave[K.contas].valor,
      processos: porChave[K.processos].valor, checklists: porChave[K.checklists].valor,
      extra, quem: req.usuario.nome,
    });
    if (!plano) return res.json({ ok: true, nadaAFazer: true,
      resumo: 'Nada a corrigir: a divergência já não existe.' });

    if (req.query.previa === '1' || req.body?.previa) {
      return res.json({ previa: true, acao: acao.rotulo, explica: acao.explica,
        contrato: { id: c.id, cliente: c.cliente, valor: c.valor },
        mudanca: plano.resumo, bloco: plano.bloco });
    }

    const base = porChave[plano.bloco];
    await gravar(plano.bloco, plano.valor, base.versao, req.usuario.nome, undefined, 'conciliação');
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, plano.bloco, c.id, 'conciliação', `${acao.rotulo}: ${plano.resumo}`]).catch(() => {});
    esquecerCache();   // o painel não pode seguir mostrando o que acabou de ser resolvido
    res.json({ ok: true, acao: acao.rotulo, resumo: plano.resumo });
  } catch (e) {
    if (e && e.codigo === 'base-antiga') {
      return res.status(409).json({ erro: 'Outra pessoa mexeu neste bloco agora. Recarregue a Conciliação e tente de novo.' });
    }
    next(e);
  }
});

rotasConciliacao.get('/conciliacao/contrato/:id', exigirLogin, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const [contratos, clientes, contas, processos] = await Promise.all(
      [K.contratos, K.clientes, K.contas, K.processos].map(lista));
    const c = contratos.find(x => x && x.id === id);
    if (!c) return res.status(404).json({ erro: 'Contrato não encontrado.' });

    const semAcento = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const ls = contas.filter(x => x && x.contratoId === id);
    const fichas = processos.filter(p => p && p.contratoId === id);
    const dono = clientes.filter(x => semAcento(x.nome) === semAcento(c.cliente));

    // O diagnóstico vem do mesmo motor, rodado só para este contrato, para a
    // tela de detalhe nunca discordar do painel.
    const diag = conciliar({ contratos: [c], clientes: dono, contas: ls, processos: fichas,
      checklists: await lista(K.checklists) }).contratos[0] || null;

    res.json({
      contrato: { id: c.id, cliente: c.cliente, valor: c.valor, entrada: c.entrada,
        numParcelas: c.numParcelas, etapa: c.etapa, servico: c.servico, servicos: c.servicos || null,
        dataAssinatura: c.dataAssinatura || null, vendedor: c.vendedor || '',
        historico: (c.historico || []).slice(-12) },
      cliente: dono.map(x => ({ id: x.id, nome: x.nome, telefone: x.telefone || '',
        contratos: (x.contratoIds || []).length, ligadoAEste: (x.contratoIds || []).includes(id) })),
      // `pago` é quanto o CLIENTE pagou (com a taxa de volta) e `entrou` é o
      // que caiu na conta. Mostrar só valorRecebido fazia parcela quitada no
      // cartão parecer que devia a taxa.
      lancamentos: ls.map(x => ({ id: x.id, descricao: x.descricao, valor: x.valor,
        valorRecebido: x.valorRecebido || 0, pago: pagoPeloCliente(x), entrou: entrouNaConta(x),
        saldo: saldoDoCliente(x), status: x.status, vencimento: x.vencimento,
        dataRecebimento: x.dataRecebimento || null })),
      cards: fichas.map(p => ({ id: p.id, servico: p.servico, status: p.status,
        situacao: p.situacao || 'ativo', responsavel: p.responsavel || '',
        documentos: (p.checklist || []).length,
        comArquivo: (p.checklist || []).filter(dd => dd.arquivo || (dd.arquivos || []).length).length,
        anexos: (p.anexos || []).length })),
      diagnostico: diag,
    });
  } catch (e) { next(e); }
});

const MES = /^\d{4}-\d{2}$/;

/**
 * Define o responsável em TODOS os cards sem dono de um mês — ou de todos os
 * meses, com `mes=todos`.
 *
 * Existe porque a porta por contrato não serve para o tamanho do problema: são
 * 87 contratos aguardando decisão e 78 deles é só isto, card sem responsável.
 * Clicar 78 vezes não é conserto, é castigo.
 *
 * O que torna a operação em massa aceitável:
 *   - só PREENCHE vazio, nunca troca dono existente (porDono + fichaSemDono);
 *   - a prévia é obrigatória e devolve a lista nominal antes de escrever;
 *   - escreve num bloco só, com a versão lida no mesmo instante, então duas
 *     pessoas mexendo ao mesmo tempo dá 409 em vez de uma sobrescrever a outra;
 *   - fica na auditoria com quem fez, quantos e em qual mês.
 */
rotasConciliacao.post('/conciliacao/responsavel', exigirLogin, async (req, res, next) => {
  try {
    const nome = nomeDeResponsavel(req.body?.responsavel);
    if (!nome) return res.status(400).json({ erro: 'Informe um nome de responsável (2 a ' + MAX_NOME + ' letras).' });
    const mes = String(req.body?.mes || '');
    const todos = mes === 'todos';
    if (!todos && !MES.test(mes)) return res.status(400).json({ erro: 'Mês inválido. Use AAAA-MM ou "todos".' });

    const [bc, bp] = await Promise.all([K.contratos, K.processos].map(async (k) => {
      const r = await ler(k);
      return { chave: k, valor: Array.isArray(r && r.valor) ? r.valor : [], versao: r ? r.versao : null };
    }));
    // Quais contratos são do mês. Ficha sem contrato não entra: ela não tem
    // mês, e varrer o que não dá para datar é como se escreve em cima de coisa
    // que ninguém auditou.
    const doMes = new Set(bc.valor
      .filter(c => c && c.id && (todos || String(c.dataAssinatura || '').slice(0, 7) === mes))
      .map(c => c.id));
    const nomeDoContrato = new Map(bc.valor.filter(c => c && c.id).map(c => [c.id, c.cliente || '(sem nome)']));

    const alvo = (p) => fichaSemDono(p, null) && p.contratoId && doMes.has(p.contratoId);
    const quantos = bp.valor.filter(alvo).length;
    if (!quantos) return res.json({ ok: true, nadaAFazer: true,
      resumo: todos ? 'Nenhum card sem responsável.' : `Nenhum card sem responsável em ${mes}.` });

    if (req.query.previa === '1' || req.body?.previa) {
      return res.json({ previa: true, mes, responsavel: nome, quantos,
        explica: 'Só preenche card SEM responsável. Quem já tem dono não é tocado.',
        cards: bp.valor.filter(alvo).slice(0, 300).map(p => ({
          cliente: nomeDoContrato.get(p.contratoId) || p.clienteNome || '(sem nome)',
          servico: p.servico || '(sem serviço)', status: p.status || '' })) });
    }

    const feitos = porDono(bp.valor, nome, req.usuario.nome, alvo);
    await gravar(K.processos, bp.valor, bp.versao, req.usuario.nome, undefined, 'conciliação');
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, K.processos, mes, 'conciliação',
       `Responsável ${nome} definido em ${feitos.length} card(s) sem dono (${todos ? 'todos os meses' : mes})`]).catch(() => {});
    esquecerCache();
    res.json({ ok: true, responsavel: nome, mes, quantos: feitos.length,
      resumo: `${feitos.length} card(s) agora com ${nome}.` });
  } catch (e) {
    if (e && e.codigo === 'base-antiga') {
      return res.status(409).json({ erro: 'Outra pessoa mexeu nos cards agora. Recarregue a Conciliação e tente de novo.' });
    }
    next(e);
  }
});

/**
 * A lista de meses, e só ela. É a porta de entrada da conciliação: leve o
 * bastante para abrir no celular, e já diz por qual mês começar.
 */
rotasConciliacao.get('/conciliacao/meses', exigirLogin, async (req, res, next) => {
  try {
    const d = await diagnostico(req.query.recalcular === '1');
    res.json({ geradoEm: d.geradoEm, meses: d.meses, mesCorrente: d.mesCorrente,
      futuro: d.futuro,
      contratosSemDataDeAssinatura: d.contratosSemDataDeAssinatura,
      contratosComDataNoFuturo: d.contratosComDataNoFuturo,
      primeiroComPendencia: d.primeiroComPendencia });
  } catch (e) { next(e); }
});

/**
 * Um mês fechado: os contratos assinados nele, a cobrança que vencia nele e o
 * que entrou no caixa nele. É esta rota que responde "terminei dezembro".
 */
rotasConciliacao.get('/conciliacao/mes/:mes', exigirLogin, async (req, res, next) => {
  try {
    const mes = String(req.params.mes);
    if (!MES.test(mes)) return res.status(400).json({ erro: 'Mês inválido. Use AAAA-MM.' });
    const d = await diagnostico(req.query.recalcular === '1');
    const resumo = d.meses.find(m => m.mes === mes);
    if (!resumo) return res.status(404).json({ erro: 'Não há movimento neste mês.' });

    const doMes = (data) => typeof data === 'string' && data.slice(0, 7) === mes;
    // Pior primeiro DENTRO do mês: ela trabalha a lista de cima para baixo e
    // fecha o mês, em vez de pular entre meses.
    const ordem = { critico: 0, divergencia: 1, revisao: 2, ok: 3 };
    const contratos = d.contratos.filter(c => doMes(c.dataAssinatura))
      .sort((a, b) => (ordem[a.situacao] - ordem[b.situacao]) || (b.problemas - a.problemas)
        || String(a.cliente).localeCompare(String(b.cliente)));

    res.json({
      geradoEm: d.geradoEm, mes, resumo, contratos,
      // Os soltos DO MÊS entram aqui: sem eles o mês não fecha, porque uma
      // parcela órfã vencendo em dezembro é problema de dezembro.
      soltos: {
        parcelasSemContrato: d.soltos.parcelasSemContrato.filter(x => doMes(x.vencimento)),
        parcelasAvulsas: d.soltos.parcelasAvulsas.filter(x => doMes(x.vencimento)),
        fichasSemContrato: d.soltos.fichasSemContrato.filter(x => doMes(x.criadoEm)),
      },
      vizinhos: {
        anterior: [...d.meses].reverse().find(m => m.mes < mes)?.mes || null,
        proximo: d.meses.find(m => m.mes > mes)?.mes || null,
      },
    });
  } catch (e) { next(e); }
});

rotasConciliacao.get('/conciliacao', exigirLogin, async (req, res, next) => {
  try {
    const d = await diagnostico(req.query.recalcular === '1');
    // `resumo=1` para o cartão do Dashboard: devolve só os números, sem a
    // lista de contratos, que é o que pesa na resposta.
    if (req.query.resumo === '1') return res.json({ geradoEm: d.geradoEm, resumo: d.resumo });
    res.json(d);
  } catch (e) { next(e); }
});
