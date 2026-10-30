// Avisos automáticos ao cliente: um motor, não um recurso por mensagem.
//
// O escritório precisa mandar coisas diferentes em momentos diferentes —
// cobrança chegando, cobrança paga, documentos que faltam, processo
// protocolado, notícia do USCIS. Escrever um módulo para cada uma faria o
// próximo pedido ("agora a cada 15 dias") virar outro módulo. Então aqui tem
// GATILHOS registrados, e o escritório monta os avisos que quiser por cima
// deles, em Configurações → Avisos automáticos.
//
// Cada gatilho sabe três coisas e só isso:
//   sobre      — se percorre processos, parcelas ou compromissos da agenda
//   quando     — semanal, a cada N dias, N dias antes, N MINUTOS antes, ou evento
//   candidatos — quem deve receber agora, com as chaves do template preenchidas
//
// O motor cuida do resto: horário no fuso do escritório, não repetir, montar o
// texto, mandar pelo WAHA do setor, registrar no histórico e no portal.
//
// MINUTOS, e por que ele é diferente de todos os outros. "Renato te liga daqui
// 15 minutos" não tem horário do dia: a hora dele é a hora de cada reunião.
// Então `minutosAntes` ignora o campo de horário e é conferido a cada passagem
// da automação (de minuto em minuto), e a frase do texto vem do tempo que falta
// DE VERDADE — se o servidor engasgou, a mensagem diz 13 minutos, não 15.
//
// TRÊS GANCHOS que um gatilho pode usar, nesta ordem:
//   preparar(c)  — roda depois de o motor decidir que vai enviar, antes de
//                  montar o texto, e devolve chaves novas. É o que permite ao
//                  aviso do portal CRIAR o acesso: a senha é guardada como
//                  hash, irreversível, e só existe no instante em que nasce —
//                  não há "consultar a senha depois". Preparar antes do corte
//                  renovaria o acesso de quem já tinha recebido.
//   aoEnviar(alvo) — efeito no registro depois do envio (marcar boas-vindas).
//   semRegistroDeTexto — o texto não é guardado no processo nem no portal.
//                  Mensagem com senha dentro iria para todo backup baixado.
// E `exigeEnvioAutomatico`, para o aviso que não faz sentido no modo manual:
// se ele cria a senha e a mensagem não sai na hora, ninguém mais sabe qual é.
//
// QUEM ENVIA É O WAHA, pelo número do setor. O WhatsApp oficial da Meta é a
// porta de entrada dos leads e só responde dentro da janela de 24 h — aviso
// que parte do escritório não cabe lá. Ver waha.js.
//
// A CALIBRAGEM, que impede o pior acidente possível aqui. Um aviso de EVENTO
// ("pagamento confirmado") olha o estado atual, não um registro de transições:
// no dia em que alguém ligasse, as 889 parcelas já pagas virariam 889 mensagens
// sobre pagamentos de meses atrás. Por isso, na primeira passagem depois de
// ligado, o aviso de evento MARCA tudo que já existe como tratado e não envia
// nada. Dali em diante só dispara o que acontecer de novo.
//
// Aviso recorrente não se calibra: ele fala do estado de hoje, e na primeira
// sexta tem de sair para todo mundo que está devendo documento.
//
// SOBRE COBRANÇA: não há gateway de pagamento ainda. "Pago" e "Atrasado" são
// o que o sistema sabe hoje, e é disso que os gatilhos de cobrança vivem.
// Quando o Stripe entrar, o evento de falha real vira um gatilho novo aqui,
// sem mexer em mais nada.

import { ler, gravar } from './armazenamento.js';
import { obterRegras } from './regras.js';
import { avisarCanal } from './chat.js';
import { enviarTexto as enviarWaha, wahaConfigurado, sessaoDoSetor, sessaoDoVendedor } from './waha.js';
import { enviarEmail, emailConfigurado } from './email.js';
import { montarAviso } from './avisos-cliente.js';
import { criarAcessoDoProcesso, processosComAcesso } from './portal-cliente.js';
import { pagoPeloCliente } from './pagamento.js';
import { execucaoDoProcesso } from './publico-alvo.js';
import { rotuloDaCobranca } from './cobranca.js';

const K = {
  avisos: 'legalway-avisos-automaticos-v1',
  processos: 'legalway-processos-documentacao-v1',
  financeiro: 'legalway-financeiro-v1',
  contratos: 'legalway-contratos-v1',
  agenda: 'legalway-agenda-v1',
  leads: 'legalway-funil-v1',
  checklists: 'legalway-checklists-v1',
};
const QUEM = 'automação';
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

async function bloco(chave, padrao = []) {
  const r = await ler(chave);
  return { valor: r ? r.valor : padrao, versao: r ? r.versao : null };
}
const digitos = (s) => String(s || '').replace(/\D/g, '');
const fmtData = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
const fmtValor = (v) => 'US$ ' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const primeiroNome = (n) => String(n || '').trim().split(' ')[0] || '';

function agoraLocal(tz) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const data = `${p.year}-${p.month}-${p.day}`;
    return { data, minutos: Number(p.hour) * 60 + Number(p.minute), dia: DIAS[new Date(data + 'T12:00:00Z').getUTCDay()] };
  } catch {
    const d = new Date();
    return { data: d.toISOString().slice(0, 10), minutos: d.getUTCHours() * 60 + d.getUTCMinutes(), dia: DIAS[d.getUTCDay()] };
  }
}
const emMinutos = (hhmm) => { const [h, m] = String(hhmm || '10:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const somarDias = (data, n) => { const d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Documentos que o CLIENTE ainda deve. "Recebido" fica de fora: já chegou e
// espera conferência nossa — cobrar faria a pessoa mandar duas vezes.
// Como a parcela se identifica para o cliente.
//
// 949 das 3.911 parcelas (24%, todas vindas do Bling) têm `descricao` vazia —
// o texto delas mora em `observacao`. Usar só `descricao` faria uma em cada
// quatro mensagens sair com um buraco no lugar do número da parcela.
// A regra de como a cobrança se apresenta mora em cobranca.js, porque a
// numeração, a conciliação e a mensagem precisam enxergar a mesma coisa.
// Cobrança adicional (tradução, taxa, laudo) não recebe número de parcela:
// ela diz o que é.
const nomeDaParcela = (f, todas) => rotuloDaCobranca(f, todas);


const PENDENTE = new Set(['Não solicitado', 'Solicitado', 'Incorreto']);
// O que o CLIENTE ainda deve. Formulário do escritório fica de fora: ele não tem o que
// mandar num I-914, e ver isso na lista de boas-vindas faz ele achar que está devendo
// documento e ligar para perguntar o que fazer.
// `internoNoServico` vem de fora: o processo guarda uma CÓPIA do checklist do
// serviço, e a cópia envelhece. Marcar um formulário como interno no serviço
// não chegava aos 264 processos que já existiam — e a mensagem de boas-vindas
// continuava pedindo o I-914 ao cliente. Em vez de reescrever 3.754 itens, o
// motor consulta o serviço na hora de montar a mensagem.
const pendentesDe = (p, internoNoServico) => (p.checklist || []).filter(d =>
  PENDENTE.has(d.status || 'Não solicitado') && !d.arquivo
  && !d.interno && !(internoNoServico && internoNoServico(p.servico, d.nome)));

// O outro lado da mesma lista: o que o cliente JÁ entregou.
//
// Pedido dela: "tem um que é o documento sendo entregue. Então a mensagem: já
// recebemos esse documento, estamos aguardando esse que ainda está pendente."
//
// Uma cobrança que só enumera o que falta soa como se a pessoa não tivesse
// feito nada — e ela mandou seis dos oito. Reconhecer o que chegou muda o tom
// da mensagem inteira, e é o que faz ela responder em vez de se fechar.
//
// Documento marcado "Incorreto" NÃO entra aqui: ele chegou, mas vai ter que
// vir de novo, e contá-lo como entregue faria o cliente achar que está quite.
// E o terceiro grupo, que não estava em lugar nenhum: o documento que chegou
// mas foi RECUSADO.
//
// `pendentesDe` exige `!d.arquivo` — então um item marcado "Incorreto" com
// arquivo anexado não entra em "faltam". E não entra em "recebidos" porque vai
// ter que vir de novo. Resultado: a mensagem dizia "recebemos 2, faltam 2" e o
// cliente nunca ficava sabendo que um foi recusado. É justamente o documento
// que mais precisa de ação dele.
const recusadosDe = (p, internoNoServico) => (p.checklist || []).filter(d =>
  (d.status || '') === 'Incorreto' && d.arquivo
  && !d.interno && !(internoNoServico && internoNoServico(p.servico, d.nome)));

const RECEBIDO = new Set(['Recebido', 'Aprovado']);
const recebidosDe = (p, internoNoServico) => (p.checklist || []).filter(d =>
  (RECEBIDO.has(d.status || '') || (d.arquivo && (d.status || '') !== 'Incorreto'))
  && !d.interno && !(internoNoServico && internoNoServico(p.servico, d.nome)));

// A lista sai agrupada por pessoa quando há dependente: "Passaporte" três
// vezes seguidas não diz a ninguém de quem é cada um.
function listarDocumentos(itens, teto) {
  if (teto > 0 && itens.length > teto) {
    return listarDocumentos(itens.slice(0, teto), 0)
      + `\n\n…e mais ${itens.length - teto} documento(s). A lista completa está no seu portal.`;
  }
  const grupos = new Map();
  for (const d of itens) { const g = d.grupo || ''; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(d.nome); }
  const linhas = [];
  for (const [g, nomes] of grupos) { if (g) linhas.push(`*${g}*`); for (const n of nomes) linhas.push(`• ${n}`); }
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// OS GATILHOS. Para criar um novo, basta acrescentar aqui: a tela de
// configuração se monta a partir desta lista.
// ---------------------------------------------------------------------------
export const GATILHOS = {
  documentosPendentes: {
    nome: 'Follow-up de documentos', sobre: 'processo', quando: 'semanal', setorSugerido: 'documentos',
    ajuda: 'Uma vez por semana, para quem ainda tem documento pendente.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'documentos', 'quantidade', 'recebidos', 'quantosRecebidos', 'recusados', 'quantosRecusados'],
    padrao: `Olá, {cliente}! 👋\n\nPassando para atualizar o seu processo de {servico}.\n\n*Já recebemos ({quantosRecebidos}):*\n{recebidos}\n\n*Ainda faltam ({quantidade}):*\n{documentos}\n\nAssim que conseguir, pode mandar por aqui mesmo. Qualquer dúvida é só chamar!\n\n{empresa}`,
    // Quando houver documento recusado, acrescente este trecho ao texto:
    //   *Precisam vir de novo ({quantosRecusados}):*\n{recusados}
    // Deixei fora do padrão porque na maioria dos envios não há nenhum, e um
    // bloco vazio no meio da mensagem fica pior do que não ter.
    candidatos(d, cfg, agora) {
      const fora = [];
      for (const p of d.processos) {
        if (cfg.pularProtocolados !== false && p.protocolo && p.protocolo.recibo) continue;
        const faltam = pendentesDe(p, d.internoNoServico);
        if (!faltam.length) continue;
        const chegaram = recebidosDe(p, d.internoNoServico);
        const recusados = recusadosDe(p, d.internoNoServico);
        fora.push({ alvo: p, onde: 'processo', chaveUnica: 'semana:' + agora.data, telefone: p.telefone,
          valores: { cliente: primeiroNome(p.clienteNome), nomeCompleto: p.clienteNome || '', servico: p.servico || '',
            documentos: listarDocumentos(faltam, Number(cfg.maxItens) || 0), quantidade: String(faltam.length),
            recebidos: listarDocumentos(chegaram, Number(cfg.maxItens) || 0) || '—',
            quantosRecebidos: String(chegaram.length),
            recusados: listarDocumentos(recusados, Number(cfg.maxItens) || 0) || '—',
            quantosRecusados: String(recusados.length) },
          titulo: `Faltam ${faltam.length} documento(s)` });
      }
      return fora;
    },
  },

  processoProtocolado: {
    nome: 'Processo protocolado', sobre: 'processo', quando: 'evento', setorSugerido: 'documentos',
    ajuda: 'Uma vez, assim que o recibo do USCIS for preenchido no processo.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'recibo'],
    padrao: `Boa notícia, {cliente}! 🎉\n\nSeu processo de {servico} foi protocolado no USCIS.\n\nNúmero do recibo: *{recibo}*\n\nGuarde esse número — é por ele que o caso é acompanhado. Vamos avisando a cada novidade.\n\n{empresa}`,
    candidatos(d) {
      return d.processos
        .filter(p => p.protocolo && p.protocolo.recibo)
        .map(p => ({ alvo: p, onde: 'processo', chaveUnica: 'recibo:' + p.protocolo.recibo, telefone: p.telefone,
          valores: { cliente: primeiroNome(p.clienteNome), nomeCompleto: p.clienteNome || '',
            servico: p.servico || '', recibo: p.protocolo.recibo },
          titulo: 'Processo protocolado' }));
    },
  },

  atualizacaoUscis: {
    nome: 'Atualização do USCIS', sobre: 'processo', quando: 'cadaDias', setorSugerido: 'documentos',
    ajuda: 'De tempos em tempos, o status atual do caso no USCIS. Só para quem já tem recibo.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'recibo', 'status', 'desdeQuando'],
    padrao: `Olá, {cliente}!\n\nAtualização do seu processo de {servico} (recibo {recibo}):\n\n*{status}*\n\nQualquer mudança a gente avisa. Você também acompanha tudo pelo portal.\n\n{empresa}`,
    candidatos(d) {
      return d.processos
        .filter(p => p.protocolo && p.protocolo.recibo && p.uscis && p.uscis.status)
        .map(p => ({ alvo: p, onde: 'processo', chaveUnica: 'uscis:' + (p.uscis.status || ''), telefone: p.telefone,
          valores: { cliente: primeiroNome(p.clienteNome), nomeCompleto: p.clienteNome || '', servico: p.servico || '',
            recibo: p.protocolo.recibo, status: p.uscis.status,
            desdeQuando: fmtData(p.uscis.mudouEm || p.uscis.atualizadoEm) },
          titulo: 'Atualização do USCIS' }));
    },
  },

  parcelaVencendo: {
    nome: 'Cobrança chegando', sobre: 'parcela', quando: 'diasAntes', setorSugerido: 'financeiro',
    ajuda: 'Alguns dias antes do vencimento de cada parcela.',
    chaves: ['cliente', 'valor', 'vencimento', 'servico', 'parcela'],
    candidatosPrecisamDeDias: true,
    padrao: `Olá, {cliente}!\n\nLembrete: amanhã faremos a cobrança da sua *{parcela}*, de {valor}, do processo de {servico}.\n\nSe precisar remarcar ou tiver qualquer dúvida, é só me chamar por aqui antes.\n\n{empresa}`,
    candidatos(d, cfg, agora) {
      const alvoData = somarDias(agora.data, Number(cfg.diasAntes) || 1);
      return d.financeiro
        .filter(f => (f.status === 'A vencer') && String(f.vencimento || '').slice(0, 10) === alvoData)
        .map(f => ({ alvo: f, onde: 'parcela', chaveUnica: 'vencendo:' + f.id, telefone: d.telefoneDoCliente(f),
          valores: { cliente: primeiroNome(f.clienteNome), nomeCompleto: f.clienteNome || '',
            valor: fmtValor(f.valor), vencimento: fmtData(f.vencimento), servico: f.servico || '',
            parcela: nomeDaParcela(f, d.financeiro) },
          titulo: 'Parcela vencendo' }));
    },
  },

  cobrancaPaga: {
    nome: 'Pagamento confirmado', sobre: 'parcela', quando: 'evento', setorSugerido: 'financeiro',
    ajuda: 'Uma vez, quando a parcela for marcada como paga.',
    chaves: ['cliente', 'valor', 'vencimento', 'servico', 'parcela', 'quandoPagou'],
    padrao: `Recebemos, {cliente}! ✅\n\nCobrança efetuada com sucesso: *{parcela}*, de {valor}, do processo de {servico}.\n\nObrigada! Qualquer dúvida é só chamar.\n\n{empresa}`,
    candidatos(d) {
      return d.financeiro
        .filter(f => f.status === 'Pago')
        .map(f => ({ alvo: f, onde: 'parcela', chaveUnica: 'paga:' + f.id, telefone: d.telefoneDoCliente(f),
          valores: { cliente: primeiroNome(f.clienteNome), nomeCompleto: f.clienteNome || '',
            // "Pagamento confirmado US$ 216,97" para quem pagou 225 é a
            // confirmação dizendo ao cliente que ele pagou menos.
            valor: fmtValor(pagoPeloCliente(f) || f.valor), vencimento: fmtData(f.vencimento),
            servico: f.servico || '', parcela: nomeDaParcela(f, d.financeiro), quandoPagou: fmtData(f.dataRecebimento) },
          titulo: 'Pagamento confirmado' }));
    },
  },

  cobrancaAtrasada: {
    nome: 'Cobrança não entrou', sobre: 'parcela', quando: 'evento', setorSugerido: 'financeiro',
    ajuda: 'Uma vez, quando a parcela passa a atrasada. Enquanto não houver gateway de pagamento, é isto que o sistema sabe sobre falha de cobrança.',
    // `parcelas` é a lista em texto. Aqui é sempre uma linha; na cobrança feita
    // à mão pela tela de Inadimplência, o mesmo texto serve para um cliente com
    // várias parcelas em aberto — é o mesmo recado, e tem de ser escrito num
    // lugar só.
    chaves: ['cliente', 'nomeCompleto', 'valor', 'vencimento', 'servico', 'parcela', 'parcelas'],
    padrao: `Olá, {cliente}.\n\nA cobrança destes valores não foi concluída:\n\n{parcelas}\n\nTotal: {valor}\n\nNa maioria das vezes é algo simples de resolver — cartão vencido, limite ou um dado desatualizado.\n\nSe já pagou, pode desconsiderar e me mandar o comprovante. Se preferir, a gente reenvia o link de pagamento ou combina uma nova data — é só responder por aqui.\n\n{empresa}`,
    candidatos(d) {
      return d.financeiro
        .filter(f => f.status === 'Atrasado')
        .map(f => ({ alvo: f, onde: 'parcela', chaveUnica: 'atrasada:' + f.id, telefone: d.telefoneDoCliente(f),
          valores: { cliente: primeiroNome(f.clienteNome), nomeCompleto: f.clienteNome || '',
            valor: fmtValor(f.valor), vencimento: fmtData(f.vencimento), servico: f.servico || '',
            parcela: nomeDaParcela(f, d.financeiro),
            parcelas: `• ${f.descricao || 'Parcela'} — ${fmtValor(f.valor)}, vencida em ${fmtData(f.vencimento)}` },
          titulo: 'Cobrança em aberto' }));
    },
  },

  // -------------------------------------------------------------------------
  // Lembrete de reunião: o único gatilho que não trabalha em dias.
  // "Daqui 15 minutos" precisa de minuto, então ele ignora o horário fixo do
  // aviso e é conferido a cada passagem da automação.
  // -------------------------------------------------------------------------
  reuniaoChegando: {
    nome: 'Reunião ou ligação chegando', sobre: 'agenda', quando: 'minutosAntes', setorSugerido: 'comercial',
    ajuda: 'Pouco antes do horário marcado, para o lead não perder a ligação.',
    chaves: ['cliente', 'vendedor', 'quando', 'hora', 'data', 'tipo', 'numero'],
    padrao: `Oi, {cliente}! 👋\n\n{vendedor} vai te ligar {quando}, às {hora}, pelo número {numero}.\n\nJá salva esse contato pra não perder a chamada 📲\n\n{empresa}`,
    candidatos(d, cfg, agora) {
      const antes = Math.max(1, Number(cfg.minutosAntes) || 15);
      const fora = [];
      for (const ev of d.agenda) {
        if (!ev || ev.status === 'Cancelada' || ev.status === 'Realizada') continue;
        if (String(ev.data || '').slice(0, 10) !== agora.data) continue;   // só hoje
        if (!/^\d{1,2}:\d{2}$/.test(String(ev.hora || ''))) continue;      // sem hora não há antecedência
        const faltam = emMinutos(ev.hora) - agora.minutos;
        // Dentro da antecedência pedida, e nunca depois da hora: lembrete que
        // chega atrasado é pior que lembrete nenhum.
        if (faltam < 0 || faltam > antes || faltam < antes - 10) continue;
        fora.push({ alvo: ev, onde: 'agenda', chaveUnica: `reuniao:${antes}`, telefone: ev.telefone,
          valores: { cliente: primeiroNome(ev.cliente), nomeCompleto: ev.cliente || '',
            vendedor: ev.vendedor || '', hora: ev.hora || '', data: fmtData(ev.data),
            tipo: ev.tipo || 'Ligação', numero: d.numeroDoVendedor(ev.vendedor),
            // A frase vem do tempo REAL que falta, não da configuração: se o
            // servidor engasgou um minuto, a mensagem não mente para o cliente.
            quando: fraseDeMinutos(faltam) },
          titulo: `${ev.tipo || 'Ligação'} em ${faltam} min` });
      }
      return fora;
    },
  },

  // -------------------------------------------------------------------------
  // Prazo do caso: biometria, entrevista, RFE… Um aviso por tipo de prazo,
  // porque os tipos não têm nada a ver um com o outro — biometria avisa na
  // véspera, validade de passaporte avisa com seis meses.
  // -------------------------------------------------------------------------
  prazoDoCaso: {
    nome: 'Prazo do caso chegando', sobre: 'processo', quando: 'diasAntes', setorSugerido: 'documentos',
    ajuda: 'Antes de uma data marcada no processo (biometria, entrevista, resposta ao RFE…). Escolha qual prazo, e com quantos dias. Zero dia = no próprio dia.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'prazo', 'data', 'quando', 'obs'],
    extras: [{ k: 'tipoPrazo', tipo: 'prazo', label: 'Qual prazo' }],
    padrao: `Olá, {cliente}! 📅\n\nLembrete: sua {prazo} é {quando}, dia {data}.\n\nLeve um documento de identificação com foto e chegue com antecedência. Qualquer dúvida é só chamar.\n\n{empresa}`,
    candidatos(d, cfg, agora) {
      const antes = Math.max(0, Number(cfg.diasAntes) || 0);
      const soEste = String(cfg.tipoPrazo || '').trim().toLowerCase();
      const fora = [];
      for (const p of d.processos) {
        for (const z of (p.prazos || [])) {
          if (!z.data || z.concluidoEm) continue;
          if (soEste && String(z.tipo || '').toLowerCase() !== soEste) continue;
          const faltam = Math.round((new Date(String(z.data).slice(0, 10) + 'T12:00:00Z') - new Date(agora.data + 'T12:00:00Z')) / 864e5);
          if (faltam < 0 || faltam > antes) continue;
          fora.push({ alvo: p, onde: 'processo', chaveUnica: 'prazo:' + z.id + ':' + antes, telefone: p.telefone,
            valores: { cliente: primeiroNome(p.clienteNome), nomeCompleto: p.clienteNome || '',
              servico: p.servico || '', prazo: z.tipo || '', data: fmtData(z.data), obs: z.obs || '',
              quando: faltam === 0 ? 'hoje' : faltam === 1 ? 'amanhã' : `em ${faltam} dias` },
            titulo: `${z.tipo} — ${faltam === 0 ? 'hoje' : faltam === 1 ? 'amanhã' : 'em ' + faltam + ' dias'}` });
        }
      }
      return fora;
    },
  },

  // -------------------------------------------------------------------------
  // Boas-vindas: o que a documentação mandava à mão quando o contrato era
  // assinado. Marca `boasVindasEnviada` no processo, que é o mesmo campo da
  // tela — então o botão manual para de oferecer, e o aviso do acesso ao
  // portal (abaixo) sabe que já pode entrar.
  // -------------------------------------------------------------------------
  boasVindasDocumentos: {
    nome: 'Boas-vindas da documentação', sobre: 'processo', quando: 'evento', setorSugerido: 'documentos',
    ajuda: 'Sai quando o contrato é assinado e o processo nasce — não tem hora marcada. Uma vez por cliente.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'documentos', 'quantidade', 'responsavel'],
    padrao: `Olá, {cliente}! Seja muito bem-vindo(a) à {empresa} 💙\n\nSeu processo de {servico} já está aberto aqui com a gente. Quem vai te acompanhar na documentação é {responsavel}.\n\nPara começar, estes são os documentos que vamos precisar:\n\n{documentos}\n\nPode mandar por aqui mesmo, um por um, sem pressa. Em seguida te enviamos o acesso ao portal, onde você acompanha tudo.\n\n{empresa}`,
    candidatos(d) {
      return d.processos
        // `semAvisoAutomatico` é o corte da virada (01/11/2026). As 240 fichas
        // que já existiam foram marcadas: ligar as boas-vindas sem isso
        // mandaria "seja bem-vindo, vamos precisar destes documentos" para
        // 209 clientes reais — 79 já em acompanhamento, 27 já protocolados,
        // 3 com o I-797 na mão. Regra dela: "os antigos a gente não vai
        // disparar, porque não sabemos o real status deles nem o que já
        // enviaram de documentação".
        .filter(p => !p.semAvisoAutomatico)
        .filter(p => !p.boasVindasEnviada)
        .map(p => {
          const faltam = pendentesDe(p, d.internoNoServico);
          return { alvo: p, onde: 'processo', chaveUnica: 'boasvindas', telefone: p.telefone,
            valores: { cliente: primeiroNome(p.clienteNome), nomeCompleto: p.clienteNome || '',
              servico: p.servico || '', documentos: listarDocumentos(faltam, 0),
              quantidade: String(faltam.length), responsavel: p.responsavel || 'nossa equipe' },
            titulo: 'Boas-vindas enviadas',
            // Marcar que enviou não basta: quem movia o cartão de "Aguardando
            // boas-vindas" para "Documentos solicitados" era o botão manual da
            // ficha. Com a mensagem saindo sozinha e sem isto aqui, o cartão
            // ficaria parado na primeira coluna para sempre — e essa coluna já
            // tem 69 fichas acumuladas.
            //
            // Só avança quem ainda está esperando as boas-vindas. Quem já foi
            // movido à mão, ou está mais adiante, não volta nem pula etapa.
            aoEnviar: (alvo) => {
              alvo.boasVindasEnviada = new Date().toISOString();
              if (alvo.status === 'Aguardando boas-vindas') {
                alvo.status = 'Documentos solicitados';
                alvo.historico = Array.isArray(alvo.historico) ? alvo.historico : [];
                alvo.historico.push({ quando: new Date().toISOString(),
                  texto: 'Movido de "Aguardando boas-vindas" para "Documentos solicitados" (boas-vindas enviadas pelo sistema)' });
              }
            } };
        });
    },
  },

  // -------------------------------------------------------------------------
  // Acesso ao portal. O MOTIVO de ele criar o acesso em vez de só mandar:
  // a senha é guardada como hash, irreversível. Não existe "consultar a senha
  // do cliente" — ela só existe no instante em que é gerada. Então quem avisa
  // tem de ser quem cria, e por isso este gatilho só entra em processo que
  // ainda NÃO tem acesso (renovar derrubaria a senha de quem já usa o portal).
  //
  // O texto desta mensagem não é guardado no processo nem no portal, só é
  // enviado: senha em claro dentro do bloco de processos iria para todo backup.
  // -------------------------------------------------------------------------
  acessoPortal: {
    nome: 'Acesso ao portal do cliente', sobre: 'processo', quando: 'evento', setorSugerido: 'documentos',
    ajuda: 'A segunda mensagem, logo depois das boas-vindas: cria o acesso e manda login e senha. Só para quem ainda não tem acesso.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'link', 'login', 'email', 'senha'],
    semRegistroDeTexto: true,
    // Sem envio automático este aviso não pode rodar: ele CRIA a senha, e se
    // a mensagem não sai na hora ninguém mais fica sabendo qual é — nem o
    // cliente, nem o setor. Enquanto o WAHA não estiver de pé, o acesso se
    // cria à mão em Documentação, que mostra a senha na tela.
    exigeEnvioAutomatico: true,
    padrao: `{cliente}, preparamos o seu sistema 🔐\n\nÉ por ele que você acompanha o seu processo e anexa os seus documentos na nossa plataforma.\n\nAcesse: {link}\nLogin: {login}\nSenha: {senha}\n\nNo primeiro acesso o sistema vai pedir para você criar uma senha nova — essa aí só serve para entrar da primeira vez.\n\n{empresa}`,
    candidatos(d) {
      return d.processos
        // Mesmo corte das boas-vindas. Marcar só `boasVindasEnviada` nas
        // fichas antigas PIORARIA: este aviso exige esse campo, então as 238
        // sem portal virariam candidatas de uma vez.
        .filter(p => !p.semAvisoAutomatico)
        .filter(p => p.boasVindasEnviada && p.email && !d.comPortal.has(String(p.id)))
        .map(p => ({ alvo: p, onde: 'processo', chaveUnica: 'portal', telefone: p.telefone,
          valores: { cliente: primeiroNome(p.clienteNome), nomeCompleto: p.clienteNome || '',
            servico: p.servico || '', link: d.linkDoPortal, email: p.email, login: '', senha: '' },
          titulo: 'Acesso ao portal criado',
          // A senha só nasce aqui, depois de o motor decidir que vai mesmo
          // enviar — criar antes renovaria o acesso de quem acabou de ser
          // descartado por já ter recebido.
          preparar: () => d.criarAcesso(p) }));
    },
  },

  // ---------------------------------------------------------------------------
  // Os dois do comercial. Até aqui todo aviso falava com cliente de contrato
  // fechado; estes dois falam com o LEAD, antes do contrato — que é onde a
  // conversa esfria e some.
  //
  // O alvo deles é o lead no funil, e o lead guarda em si o que já recebeu.
  // Quem fecha, perde ou arquiva sai da lista sozinho.
  // ---------------------------------------------------------------------------
  followupComercial: {
    nome: 'Follow-up comercial', sobre: 'lead', quando: 'evento', setorSugerido: 'comercial',
    ajuda: 'No dia em que o vendedor marcou para retomar o contato com o lead. Uma vez por data marcada.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'vendedor', 'etapa'],
    padrao: `Oi, {cliente}! 👋\n\nAqui é da {empresa}. Passando para saber se você ainda tem interesse em tocar o seu processo de {servico}.\n\nQualquer dúvida sobre valores, prazos ou documentos, é só me chamar por aqui que eu te explico com calma.\n\n{vendedor} · {empresa}`,
    candidatos(d, aviso, agora) {
      return (d.leads || [])
        .filter(l => l && !ETAPAS_FECHADAS.has(l.etapa))
        .filter(l => l.proximaAcao && l.proximaAcao.data && l.proximaAcao.data <= agora.data)
        .map(l => ({ alvo: l, onde: 'lead',
          // A data marcada entra na chave: um follow-up por data, não um por dia
          // até o vendedor mexer no lead.
          chaveUnica: 'followup:' + l.proximaAcao.data, telefone: l.telefone,
          valores: { cliente: primeiroNome(l.nome), nomeCompleto: l.nome || '',
            servico: l.servico || (l.comercial && l.comercial.servicoOferecido) || 'imigração',
            vendedor: l.vendedor || '', etapa: l.etapa || '' },
          titulo: 'Follow-up comercial enviado' }));
    },
  },

  semContato: {
    nome: 'Follow-up sem contato', sobre: 'lead', quando: 'cadaDias', setorSugerido: 'comercial',
    ajuda: 'Para o lead que ficou parado, sem nenhum contato há mais dias do que você definir.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'vendedor', 'etapa', 'dias'],
    extras: [{ k: 'diasParado', tipo: 'numero', label: 'Parado há mais de (dias)', padrao: 7 }],
    padrao: `Oi, {cliente}! 👋\n\nFaz um tempinho que a gente não se fala sobre o seu processo de {servico}.\n\nSe ainda fizer sentido para você, me diz que eu retomo daqui — e se não for o momento, também pode falar, sem problema nenhum.\n\n{vendedor} · {empresa}`,
    candidatos(d, aviso, agora) {
      const dias = Math.max(1, Number(aviso.diasParado) || 7);
      const limite = Date.now() - dias * 86400000;
      return (d.leads || [])
        .filter(l => l && !ETAPAS_FECHADAS.has(l.etapa))
        .filter(l => {
          const ultimo = (l.ultimoContato && l.ultimoContato.quando) || l.entradaEtapa || l.assumidoEm || l.criadoEm;
          return ultimo && new Date(ultimo).getTime() < limite;
        })
        .map(l => ({ alvo: l, onde: 'lead',
          // O período entra na chave: enquanto o lead continuar parado, ele
          // recebe de novo só na próxima rodada — nunca duas vezes na mesma.
          chaveUnica: 'semcontato:' + agora.data, telefone: l.telefone,
          valores: { cliente: primeiroNome(l.nome), nomeCompleto: l.nome || '',
            servico: l.servico || (l.comercial && l.comercial.servicoOferecido) || 'imigração',
            vendedor: l.vendedor || '', etapa: l.etapa || '', dias: String(dias) },
          titulo: 'Follow-up de lead parado enviado' }));
    },
  },

  // Os doze gatilhos acima disparam por EVENTO (protocolou, pagou, reunião
  // chegando) ou por TEMPO (semanal, a cada N dias). Nenhum dispara por ETAPA
  // — e era isso que faltava, nas palavras dela:
  //
  //   "sinto falta de um campo que eles consigam disparar as mensagens
  //    automáticas de acordo com a etapa do funil. Por exemplo, só para quem
  //    está no funil de documentos / que não faz processo externo / que está
  //    na etapa de recebendo documentações."
  //
  // São dois gatilhos e não um porque `sobre` decide qual bloco o servidor
  // carrega: juntar os dois faria ler os milhares de leads a cada minuto só
  // para atender um aviso de documentação.
  etapaDocumentos: {
    nome: 'Chegou numa etapa da documentação', sobre: 'processo', quando: 'evento', setorSugerido: 'documentos',
    ajuda: 'Uma vez, quando o processo entra na etapa escolhida. Dá para restringir a quem é tocado pela casa ou por escritório de fora.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'etapa'],
    // A tela se monta a partir daqui. Sem estes campos a etapa ficaria gravada
    // só por baixo, e quem abrisse o aviso não teria como ver nem corrigir.
    extras: [
      { tipo: 'etapaDocumentos', k: 'etapa', label: 'Quando o processo entrar em' },
      { tipo: 'execucao', k: 'execucao', label: 'Só para processos' },
    ],
    padrao: `Olá, {cliente}! 👋\n\nSeu processo de {servico} entrou em uma nova etapa: *{etapa}*.\n\nQualquer dúvida é só chamar por aqui.\n\n{empresa}`,
    candidatos(d, aviso) {
      const etapa = String((aviso && aviso.etapa) || '').trim();
      if (!etapa) return [];   // sem etapa escolhida não há recorte: não dispara nada
      const exec = aviso && (aviso.execucao === 'interno' || aviso.execucao === 'externo') ? aviso.execucao : null;
      return d.processos
        .filter(p => p && String(p.status || '').trim().toLowerCase() === etapa.toLowerCase())
        .filter(p => !exec || execucaoDoProcesso(p).tipo === exec)
        .map(p => ({ alvo: p, onde: 'processo',
          // A etapa entra na chave: quem volta para a mesma etapa depois não
          // recebe de novo, e quem avança e recebe outro aviso não embaralha.
          chaveUnica: 'etapa:' + etapa.toLowerCase(), telefone: p.telefone,
          valores: { cliente: primeiroNome(p.clienteNome), nomeCompleto: p.clienteNome || '',
            servico: p.servico || '', etapa: etapa },
          titulo: 'Avisado da etapa: ' + etapa }));
    },
  },

  etapaComercial: {
    nome: 'Chegou numa etapa do comercial', sobre: 'lead', quando: 'evento', setorSugerido: 'comercial',
    ajuda: 'Uma vez, quando o lead entra na etapa escolhida do funil.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'vendedor', 'etapa'],
    extras: [{ tipo: 'etapaComercial', k: 'etapa', label: 'Quando o lead entrar em' }],
    padrao: `Oi, {cliente}! 👋\n\nAqui é da {empresa}. Vamos seguir com o seu atendimento sobre {servico}.\n\nQualquer dúvida, é só me chamar por aqui.\n\n{vendedor} · {empresa}`,
    candidatos(d, aviso) {
      const etapa = String((aviso && aviso.etapa) || '').trim();
      if (!etapa) return [];
      return (d.leads || [])
        .filter(l => l && String(l.etapa || '').trim().toLowerCase() === etapa.toLowerCase())
        .map(l => ({ alvo: l, onde: 'lead',
          // O lead guarda quando entrou na etapa. Usar isso na chave faz quem
          // volta para a mesma etapa depois receber de novo — que é o certo
          // no comercial, ao contrário da documentação.
          chaveUnica: 'etapa:' + etapa.toLowerCase() + ':' + String(l.entradaEtapa || ''),
          telefone: l.telefone,
          valores: { cliente: primeiroNome(l.nome), nomeCompleto: l.nome || '',
            servico: l.servico || (l.comercial && l.comercial.servicoOferecido) || 'imigração',
            vendedor: l.vendedor || '', etapa: etapa },
          titulo: 'Avisado da etapa: ' + etapa }));
    },
  },

};

// Lead fechado não recebe follow-up: já virou contrato, ou já disse não.
// 'Perdido' e 'Perda' convivem: o nome da coluna mudou e os leads gravados
// antes continuam com o nome velho.
const ETAPAS_FECHADAS = new Set(['Ganho', 'Fechado', 'Perdido', 'Perda', 'Cancelado', 'Arquivado']);

// "daqui a 15 minutos", "daqui a 1 hora" — com o tempo que falta de verdade.
function fraseDeMinutos(m) {
  if (m <= 1) return 'agora';
  if (m < 50) return `daqui a ${m} minutos`;
  if (m <= 70) return 'daqui a 1 hora';
  if (m < 110) return 'daqui a 1 hora e meia';
  return `daqui a ${Math.round(m / 60)} horas`;
}

// Chegou a hora deste aviso?
function naHora(aviso, gat, agora) {
  // Lembrete de reunião não tem horário do dia: a hora dele é a hora de cada
  // compromisso. Quem filtra é o próprio gatilho, a cada passagem.
  if (gat.quando === 'minutosAntes') return true;
  const alvo = emMinutos(aviso.hora || '10:00');
  const naJanela = agora.minutos >= alvo && agora.minutos <= alvo + 10;
  if (gat.quando === 'semanal') return agora.dia === (aviso.diaSemana || 'sex') && naJanela;
  if (gat.quando === 'cadaDias' || gat.quando === 'diasAntes') return naJanela;
  // Evento não tem hora marcada: ele acontece quando acontece. O contrato é
  // assinado, o processo nasce, e a boas-vindas sai na passagem seguinte — a
  // automação roda a cada minuto. O horário aqui não é um compromisso, é só o
  // intervalo em que o escritório aceita mandar mensagem: nada sai de
  // madrugada, fica para o começo da janela.
  if (gat.quando === 'evento') {
    const de = emMinutos(aviso.janelaDe || '08:00');
    const ate = emMinutos(aviso.janelaAte || '20:00');
    return agora.minutos >= de && agora.minutos <= ate;
  }
  return false;
}

// "Uma vez por dia" por chave livre, para não repetir o mesmo alerta a cada
// rodada. Guarda no próprio bloco de avisos.
const jaAvisadoHoje = new Map();
async function avisoDoDiaChave(chave) {
  const hoje = new Date().toISOString().slice(0, 10);
  if (jaAvisadoHoje.get(chave) === hoje) return false;
  jaAvisadoHoje.set(chave, hoje);
  return true;
}

export async function avisosAutomaticos(log) {
  const confAvisos = await ler(K.avisos);
  let avisos = confAvisos ? confAvisos.valor : [];
  if (typeof avisos === 'string') { try { avisos = JSON.parse(avisos); } catch { avisos = []; } }
  if (!Array.isArray(avisos) || !avisos.length) return;
  // A ordem de disparo é a ordem em que os gatilhos estão declarados, não a
  // ordem em que o escritório criou os avisos na tela. É o que garante a
  // sequência que a dona do escritório pediu: boas-vindas e, logo atrás, o
  // acesso ao portal como segunda mensagem — na mesma passagem, porque o
  // portal só olha para quem já tem boasVindasEnviada.
  const ordemDosGatilhos = Object.keys(GATILHOS);
  const ligados = avisos
    .filter(a => a && a.ativo && GATILHOS[a.gatilho])
    .sort((a, b) => ordemDosGatilhos.indexOf(a.gatilho) - ordemDosGatilhos.indexOf(b.gatilho));
  if (!ligados.length) return;

  const R = await obterRegras();
  const tz = (R.agenda && R.agenda.fusoHorario) || 'America/New_York';
  const agora = agoraLocal(tz);
  if (!ligados.some(a => naHora(a, GATILHOS[a.gatilho], agora))) return;

  const { valor: processos, versao: vP } = await bloco(K.processos);
  const { valor: financeiro, versao: vF } = await bloco(K.financeiro);
  const { valor: contratos } = await bloco(K.contratos);
  const precisaAgenda = ligados.some(a => GATILHOS[a.gatilho].sobre === 'agenda');
  const { valor: agenda, versao: vA } = precisaAgenda ? await bloco(K.agenda) : { valor: [], versao: null };
  // O funil só é lido quando algum aviso de lead está ligado — são milhares de
  // leads e não faz sentido carregar isso a cada minuto por nada.
  const precisaLeads = ligados.some(a => GATILHOS[a.gatilho].sobre === 'lead');
  const { valor: leads, versao: vL } = precisaLeads ? await bloco(K.leads) : { valor: [], versao: null };
  const precisaPortal = ligados.some(a => a.gatilho === 'acessoPortal');
  const comPortal = precisaPortal ? await processosComAcesso() : new Set();

  // A parcela guarda o nome do cliente, não o telefone. Ele vem do contrato,
  // e, se faltar lá, do processo do mesmo cliente.
  const telPorContrato = new Map(contratos.map(c => [c.id, c.telefone || '']));
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const telPorNome = new Map();
  for (const p of processos) if (p.telefone) telPorNome.set(norm(p.clienteNome), p.telefone);
  const telefoneDoCliente = (f) => telPorContrato.get(f.contratoId) || telPorNome.get(norm(f.clienteNome)) || '';

  // O número de quem liga vem da disponibilidade da equipe, pelo nome do
  // vendedor. Se não achar, cai no número do setor comercial: melhor o cliente
  // receber um número do escritório do que a chave crua no texto.
  const disp = (R.agenda && R.agenda.disponibilidade) || [];
  const comercial = ((R.setores && R.setores.lista) || []).find(s => s.key === 'comercial') || {};
  const numeroDoVendedor = (nome) => {
    const linha = disp.find(l => norm(l.vendedor) === norm(nome) && (l.numero || '').trim());
    return (linha && linha.numero) || comercial.numero || '';
  };
  const linkDoPortal = (process.env.URL_PUBLICA || '').replace(/\/$/, '') + '/portal-cliente.html';
  const criarAcesso = async (p) => {
    const r = await criarAcessoDoProcesso(String(p.id), p.clienteNome || 'Cliente', p.email, QUEM, p.telefone);
    // `login` é o telefone quando existe, senão o e-mail: mandar e-mail para quem não
    // usa e-mail é exatamente o que deixava o portal sem uso.
    return r.ok ? { email: r.email, login: r.login, senha: r.senha } : null;
  };

  // Quais documentos o SERVIÇO marca como internos, por nome. É consultado na
  // hora de montar a mensagem, para não depender da cópia velha no processo.
  const { valor: checklists } = await bloco(K.checklists);
  const semAcento = (t) => String(t || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Sem a descrição entre parênteses: o serviço diz "FORM LINK (REGISTRO DE
  // DADOS DO CLIENTE)" e o processo, criado antes, diz só "FORM LINK".
  const semDescricao = (t) => semAcento(t).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const internosPorServico = new Map();
  for (const ck of (Array.isArray(checklists) ? checklists : [])) {
    if (!ck || !ck.servico) continue;
    const nomes = new Set();
    for (const d of [...(ck.documentos || []), ...(ck.documentosDependente || [])]) {
      if (d && d.interno && d.nome) { nomes.add(semAcento(d.nome)); nomes.add(semDescricao(d.nome)); }
    }
    internosPorServico.set(semAcento(ck.servico), nomes);
  }
  const internoNoServico = (servico, nome) => {
    const nomes = internosPorServico.get(semAcento(servico));
    return !!(nomes && (nomes.has(semAcento(nome)) || nomes.has(semDescricao(nome))));
  };

  // Processo pausado ou cancelado não recebe mais nada. É o que "pausar"
  // significa para quem usa: o cliente para de ser cobrado e perseguido por
  // documento. O bloco inteiro continua sendo gravado no fim — o que some é só
  // o que os gatilhos enxergam.
  const processosAtivos = processos.filter(p => p && p.situacao !== 'pausado' && p.situacao !== 'cancelado');

  const dados = { processos: processosAtivos, financeiro, contratos, agenda, leads, internoNoServico, telefoneDoCliente,
    numeroDoVendedor, comPortal, criarAcesso, linkDoPortal };
  const canal = (R.setores && R.setores.canal) || 'manual';
  const podeWaha = canal === 'waha' && wahaConfigurado() && !!(R.setores && R.setores.envioAutomatico);
  // Dois canais, não um. Muito cliente não usa e-mail, e muito não responde WhatsApp:
  // o que faz a mensagem chegar é sair pelos dois. O e-mail obedece à mesma chave de
  // envio automático do escritório — ligar um canal não liga o outro por tabela.
  const podeEmail = emailConfigurado() && !!(R.setores && R.setores.envioAutomatico);

  let mexeuProcessos = false, mexeuFinanceiro = false, mexeuAvisos = false, mexeuAgenda = false, mexeuLeads = false;
  const resumo = [];

  for (const aviso of ligados) {
    const gat = GATILHOS[aviso.gatilho];
    if (!naHora(aviso, gat, agora)) continue;

    // "a cada N dias" se mede pelo último disparo deste aviso, não pelo calendário
    if (gat.quando === 'cadaDias') {
      const cada = Math.max(1, Number(aviso.cadaDias) || 15);
      if (aviso.ultimoDisparo && aviso.ultimoDisparo > somarDias(agora.data, -cada)) continue;
    }

    const setorKey = aviso.setor || gat.setorSugerido;
    const setor = ((R.setores && R.setores.lista) || []).find(s => s.key === setorKey) || {};
    const sessaoDoSetorDoAviso = sessaoDoSetor(R, setorKey);
    // Quem FALA com o cliente é a pessoa, quando a conversa é dela.
    //
    //   lead   — o vendedor dono do lead. O cliente respondeu ao Renato; se o
    //            follow-up chega por um número do escritório, o fio se quebra
    //            e a resposta vira "quem é você?".
    //   agenda — o vendedor que marcou a reunião. "{vendedor} vai te ligar"
    //            saindo de outro número é a mesma quebra.
    //
    // O resto sai pelo setor: o Comercial é a voz do escritório no primeiro
    // contato e no SDR, onde ninguém ainda tem dono. Sem sessão própria,
    // também cai no setor — melhor do que não sair.
    const DO_VENDEDOR = new Set(['lead', 'agenda']);
    const sessaoPara = (c) => (DO_VENDEDOR.has(gat.sobre)
      ? sessaoDoVendedor(R, c && c.alvo && c.alvo.vendedor) : '') || sessaoDoSetorDoAviso;
    // Para as decisões que valem para o aviso inteiro (pode enviar? exige envio
    // automático?), o que importa é existir ALGUM caminho de saída.
    const sessao = sessaoDoSetorDoAviso;
    const envia = podeWaha && (!!sessao || DO_VENDEDOR.has(gat.sobre));

    // Um aviso que cria senha só pode rodar se a mensagem sair NA HORA — a senha
    // nasce aqui e não fica guardada em lugar nenhum. Antes isto exigia WhatsApp e
    // travava mesmo com o e-mail ligado; agora basta um canal automático qualquer.
    if (gat.exigeEnvioAutomatico && !envia && !podeEmail) {
      log.push(`aviso "${aviso.nome}": parado — ele cria a senha do cliente e precisa de um canal automático (WhatsApp do setor ou e-mail) para a mensagem sair na hora. Ligue um dos dois em Configurações.`);
      continue;
    }

    let candidatos = [];
    try { candidatos = gat.candidatos(dados, aviso, agora) || []; }
    catch (e) { log.push(`aviso "${aviso.nome}": falhou ao escolher quem recebe — ${e.message}`); continue; }

    // Primeira passagem de um aviso de evento: marca o passado como tratado e
    // não manda nada. Sem isto, ligar "pagamento confirmado" dispararia para
    // toda parcela já paga na história do escritório.
    if (gat.quando === 'evento' && !aviso.calibrado) {
      for (const c of candidatos) {
        c.alvo.avisosEnviados = c.alvo.avisosEnviados || {};
        c.alvo.avisosEnviados[aviso.id + '|' + c.chaveUnica] = 'calibragem';
        if (c.onde === 'processo') mexeuProcessos = true;
        else if (c.onde === 'agenda') mexeuAgenda = true;
        else if (c.onde === 'lead') mexeuLeads = true;
        else mexeuFinanceiro = true;
      }
      aviso.calibrado = agora.data;
      mexeuAvisos = true;
      log.push(`aviso "${aviso.nome}": calibrado — ${candidatos.length} registro(s) anteriores marcados como tratados, nada foi enviado. A partir de agora só dispara o que for novo.`);
      continue;
    }

    let enviados = 0, prontos = 0;
    const pendentesDeEnvio = [];

    for (const c of candidatos) {
      const marca = 'avisosEnviados';
      c.alvo[marca] = c.alvo[marca] || {};
      const chave = aviso.id + '|' + c.chaveUnica;
      if (c.alvo[marca][chave]) continue;                     // já mandou isso

      // Alguns avisos precisam fazer algo ANTES de existir texto — o do acesso
      // ao portal cria o acesso, porque a senha só existe no instante em que é
      // gerada. Roda aqui, depois de decidido que vai mesmo enviar: antes
      // disso, mexeria em quem acabou de ser descartado.
      if (c.preparar) {
        let extra = null;
        try { extra = await c.preparar(); }
        catch (e) { log.push(`aviso "${aviso.nome}": ${c.valores.nomeCompleto} — ${e.message}`); continue; }
        if (!extra) { log.push(`aviso "${aviso.nome}": ${c.valores.nomeCompleto} ficou de fora (não deu para preparar o envio)`); continue; }
        Object.assign(c.valores, extra);
      }

      // Campo que o texto pede e o sistema não tem fica registrado em vez de
      // ir para o cliente. Antes a chave sobrava no meio da frase: quem
      // escrevesse {nome} em vez de {cliente} mandava "Olá, {nome}!" para
      // gente de verdade, e ninguém no escritório ficava sabendo.
      const faltando = [];
      const texto = String(aviso.template || gat.padrao || '')
        .replace(/\{(\w+)\}/g, (m, k) => c.valores[k] !== undefined ? c.valores[k]
          : k === 'empresa' ? ((R.empresa && R.empresa.nome) || '')
          : k === 'setor' ? (setor.nome || '')
          : (faltando.push(k), m));
      if (faltando.length) {
        // Melhor não mandar do que mandar quebrado — e dizer alto, porque
        // mensagem que para de sair em silêncio é pior ainda.
        log.push(`aviso "${aviso.nome}": NÃO enviado para ${c.valores.nomeCompleto || 'cliente'} — o texto usa `
          + faltando.map(k => '{' + k + '}') .join(', ') + `, que não existe neste aviso. Corrija em Configurações → Mensagens automáticas.`);
        if (await avisoDoDiaChave('texto-quebrado:' + aviso.id)) {
          avisarCanal(setorKey === 'financeiro' ? 'financeiro' : setorKey === 'comercial' ? 'vendas' : 'documentacao',
            `⚠️ A mensagem "${aviso.nome}" não está saindo: o texto usa ${faltando.map(k => '{' + k + '}').join(', ')}, `
            + 'que esse aviso não preenche. Corrija em Configurações → Mensagens automáticas.').catch(() => {});
        }
        continue;
      }

      // Sai pelos DOIS canais quando os dois existem. Não é redundância: parte dos
      // clientes só olha WhatsApp e parte só olha e-mail, e a mensagem do portal
      // carrega a senha — chegar pela metade é não chegar.
      let foiWaha = false, foiEmail = false;
      // Quem assina a mensagem: o vendedor dono do lead, quando ele tem número
      // próprio conectado; senão o setor.
      const deQuem = sessaoPara(c);
      if (podeWaha && deQuem && digitos(c.telefone).length >= 10) {
        const r = await enviarWaha(deQuem, c.telefone, texto);
        if (r.ok) foiWaha = true;
        else log.push(`aviso "${aviso.nome}": ${c.valores.nomeCompleto} não saiu no WhatsApp (${deQuem}) — ${r.motivo}`);
      }
      const emailDestino = (c.alvo && c.alvo.email) || c.valores.email || '';
      if (podeEmail && emailDestino) {
        try {
          const r = await enviarEmail({
            para: emailDestino,
            assunto: `${(R.empresa && R.empresa.nome) || 'Seu processo'} — ${c.titulo || aviso.nome}`,
            texto,
          });
          if (r.enviado) foiEmail = true;
          else log.push(`aviso "${aviso.nome}": ${c.valores.nomeCompleto} não saiu no e-mail — ${r.motivo || 'motivo não informado'}`);
        } catch (e) {
          log.push(`aviso "${aviso.nome}": ${c.valores.nomeCompleto} — e-mail falhou: ${e.message}`);
        }
      }
      const como = foiWaha && foiEmail ? 'waha+email' : foiWaha ? 'waha' : foiEmail ? 'email' : 'pronta';

      c.alvo[marca][chave] = agora.data;
      if (c.aoEnviar) c.aoEnviar(c.alvo);
      if (c.onde === 'processo') {
        mexeuProcessos = true;
        c.alvo.historico = c.alvo.historico || [];
        c.alvo.historico.push({ quando: new Date().toISOString(),
          texto: `${aviso.nome} — ${
            como === 'waha+email' ? 'enviado pelo WhatsApp do ' + (setor.nome || setorKey) + ' e por e-mail'
            : como === 'waha' ? 'enviado pelo WhatsApp do ' + (setor.nome || setorKey)
            : como === 'email' ? 'enviado por e-mail'
            : 'mensagem pronta para o setor enviar'}` });
        // Aviso com senha dentro não fica guardado: o bloco de processos vai
        // para todo backup que alguém baixa. O histórico registra que saiu.
        if (!gat.semRegistroDeTexto) await montarAviso(c.alvo, { tipo: 'aviso', titulo: c.titulo || aviso.nome, texto });
      } else if (c.onde === 'agenda') {
        mexeuAgenda = true;
      } else if (c.onde === 'lead') {
        mexeuLeads = true;
        // O vendedor abre o lead e vê o que o sistema mandou em nome dele.
        c.alvo.historico = c.alvo.historico || [];
        c.alvo.historico.push({ tipo: 'Sistema', quando: new Date().toISOString(),
          texto: `${aviso.nome} — ${como === 'pronta' ? 'mensagem pronta para o setor enviar' : 'enviado para o lead'}` });
      } else {
        mexeuFinanceiro = true;
      }

      if (como !== 'pronta') enviados++;
      else {
        prontos++;
        // Mesma razão: a lista que vai para o chat da equipe não leva o texto
        // de um aviso com senha — só o nome e o telefone de quem precisa dela.
        pendentesDeEnvio.push({ nome: c.valores.nomeCompleto, tel: c.telefone, texto: gat.semRegistroDeTexto ? '' : texto });
      }
    }

    if (gat.quando === 'cadaDias' && (enviados || prontos)) { aviso.ultimoDisparo = agora.data; mexeuAvisos = true; }

    if (enviados || prontos) {
      resumo.push(`${aviso.nome}: ${enviados} enviado(s), ${prontos} pronto(s)`);
      if (prontos) {
        const lista = pendentesDeEnvio.slice(0, 15)
          .map(x => `• ${x.nome} (${x.tel || 'sem telefone'})`).join('\n');
        await avisarCanal(setorKey,
          `📬 ${aviso.nome}: ${prontos} mensagem(ns) pronta(s) para enviar`
          + (setor.numero ? ` pelo ${setor.numero}` : '') + `.\n\n${lista}`
          + (pendentesDeEnvio.length > 15 ? `\n…e mais ${pendentesDeEnvio.length - 15}.` : '')).catch(() => {});
      }
    }
  }

  if (mexeuAgenda) await gravar(K.agenda, agenda, vA, QUEM);
  if (mexeuLeads) await gravar(K.leads, leads, vL, QUEM);
  if (mexeuProcessos) await gravar(K.processos, processos, vP, QUEM);
  if (mexeuFinanceiro) await gravar(K.financeiro, financeiro, vF, QUEM);
  if (mexeuAvisos) await gravar(K.avisos, avisos, confAvisos ? confAvisos.versao : null, QUEM);
  for (const r of resumo) log.push(r);
}
