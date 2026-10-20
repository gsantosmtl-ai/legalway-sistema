// Cobrança pelo Stripe e conciliação contínua.
//
// O pedido era "cobrar por lá e os valores baterem sempre". São duas coisas
// diferentes, e aqui elas são resolvidas por dois caminhos de propósito:
//
//   WEBHOOK   — dá a velocidade. O Stripe avisa em segundos e a parcela é
//               baixada antes de alguém abrir a tela.
//   VARREDURA — dá a garantia. Webhook não é confiável por natureza: entrega
//               falha, servidor reinicia no meio do deploy, assinatura é
//               recusada por configuração errada. A varredura lê os eventos
//               direto da fonte, a partir do último que já foi tratado, e
//               alcança qualquer coisa que o webhook perdeu.
//
// Só o webhook seria rápido e furado. Só a varredura seria íntegra e lenta.
// Os dois juntos é o que faz "bater sempre" ser verdade e não promessa.
//
// ESCRITA ATÔMICA. Toda baixa passa pelo `transformar` do gravar(), que roda
// dentro da transação com SELECT ... FOR UPDATE. Sem isso, webhook e varredura
// podem ler a mesma lista de 2.948 parcelas ao mesmo tempo e o último a gravar
// apagaria a baixa do outro. É a primeira vez que este sistema usa esse
// recurso — e é o caso para o qual ele existe.
//
// IDEMPOTÊNCIA EM DOIS NÍVEIS. O Stripe reentrega evento, e reentrega mesmo:
//   1. o id do evento é guardado e evento repetido é descartado na porta;
//   2. e ainda assim aplicar "pago" duas vezes dá o mesmo resultado, porque a
//      baixa é escrita por atribuição e não por soma.
// Um nível só não bastaria: a lista de ids é limitada e evento muito antigo
// pode sair dela.
//
// ACH DEMORA, E ISSO MUDA O FLUXO. Cartão confirma na hora. Débito ACH — que é
// a forma barata e está habilitada na conta — fecha a sessão de Checkout com
// `payment_status: unpaid` e só confirma dias depois, por payment_intent.
// Por isso existe o estado intermediário "Processando": a parcela não está
// paga, mas também não está em aberto. Tratar ACH como cartão daria baixa em
// dinheiro que ainda não entrou.

import { Router } from 'express';
import { ler, gravar } from './armazenamento.js';
import { exigirLogin } from './auth.js';
import { podeGravar } from './permissoes.js';
import { obterRegras } from './regras.js';
import { avisarCanal } from './chat.js';
import { anotar } from './guardiao.js';
import { query } from './db.js';
import {
  stripeConfigurado, webhookConfigurado, ambienteStripe, assinaturaConfere,
  criarCheckout, lerPagamento, lerSessao, listarEventos, expirarSessao, lerSaldo,
} from './stripe.js';

const K = {
  financeiro: 'legalway-financeiro-v1',
  contratos: 'legalway-contratos-v1',
  stripe: 'legalway-stripe-v1',
  transferencias: 'legalway-transferencias-v1',
};
const QUEM = 'stripe';
const MAX_EVENTOS_LEMBRADOS = 500;

// Os eventos que interessam. Pedir só estes à varredura evita percorrer a
// história inteira da conta — que tem movimento desde antes do sistema.
// Toda saída e toda entrada de dinheiro tem de estar nesta lista. O que não
// estiver aqui move o saldo da Stripe sem o sistema saber, e aí a conta deixa
// de fechar — que é justamente o que não pode acontecer.
const TIPOS = [
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  // Contestação: o cliente reclama no banco e o dinheiro sai da conta na hora,
  // antes de qualquer análise. Sem tratar isto, o sistema continuaria dizendo
  // "pago" sobre dinheiro que já saiu.
  'charge.dispute.created',
  'charge.dispute.closed',
  // O repasse para o banco. É o que fecha a terceira camada sem ninguém
  // precisar lançar transferência à mão.
  'payout.paid',
  'payout.failed',
];

const hoje = () => new Date().toISOString().slice(0, 10);
const agora = () => new Date().toISOString();

async function estado() {
  const r = await ler(K.stripe);
  const v = (r && r.valor) || {};
  return { ultimoEvento: v.ultimoEvento || null, tratados: v.tratados || [], conferidoEm: v.conferidoEm || null };
}
async function salvarEstado(mudar) {
  await gravar(K.stripe, null, null, QUEM, (_novo, atual) => {
    const v = atual || { ultimoEvento: null, tratados: [], conferidoEm: null };
    const saida = mudar({ ...v, tratados: [...(v.tratados || [])] });
    if (saida.tratados.length > MAX_EVENTOS_LEMBRADOS) {
      saida.tratados = saida.tratados.slice(-MAX_EVENTOS_LEMBRADOS);
    }
    return saida;
  });
}

// ---------------------------------------------------------------------------
// A BAIXA — o único lugar que escreve dinheiro
// ---------------------------------------------------------------------------

/**
 * Aplica o que o Stripe diz numa parcela, atomicamente.
 *
 * Escreve os campos que as telas e o DRE já leem (status, valorRecebido,
 * dataRecebimento, formaPagamento) para que nada precise mudar na interface, e
 * o bloco `stripe` com a trilha: id da sessão, id do pagamento, a TAXA REAL e
 * o líquido. A taxa é o que conserta o furo do relatório — até hoje ela não era
 * descontada em lugar nenhum e o resultado mostrava lucro que não existia.
 */
async function aplicar(parcelaId, mudanca, rotulo) {
  let achou = false, antes = null;
  await gravar(K.financeiro, null, null, QUEM, (_novo, atual) => {
    const lista = Array.isArray(atual) ? atual : [];
    for (const p of lista) {
      if (!p || String(p.id) !== String(parcelaId)) continue;
      achou = true;
      antes = p.status;
      // Dinheiro já baixado por outro meio não é sobrescrito: se alguém deu
      // baixa por Zelle e o cliente pagou o link depois, isso é caso de
      // devolução, não de baixa dupla. A divergência é registrada e avisada.
      if (p.status === 'Pago' && mudanca.status === 'Pago' && !(p.stripe && p.stripe.paymentIntentId)) {
        p.stripe = { ...(p.stripe || {}), conflito: `Já estava paga por ${p.formaPagamento || 'outro meio'} quando o Stripe confirmou`, conflitoEm: agora() };
        return lista;
      }
      Object.assign(p, mudanca.campos || {});
      p.stripe = { ...(p.stripe || {}), ...(mudanca.stripe || {}), atualizadoEm: agora() };
      p.historicoStripe = [...(p.historicoStripe || []), { quando: agora(), o_que: textoCurto(rotulo) }].slice(-20);
      break;
    }
    return lista;
  });
  return { achou, antes };
}
// Mensagem de erro do Stripe vai para dentro do registro da parcela: corta
// o tamanho para não inflar o bloco financeiro com texto de diagnóstico.
const textoCurto = (s) => String(s || '').slice(0, 120);

/** Parcela paga: o estado final e feliz. */
const comoPaga = (pg) => ({
  status: 'Pago',
  campos: {
    status: 'Pago',
    valorRecebido: pg.bruto,
    dataRecebimento: (pg.pagoEm || agora()).slice(0, 10),
    formaPagamento: pg.rotuloForma,
  },
  stripe: {
    paymentIntentId: pg.paymentIntentId, status: 'pago',
    bruto: pg.bruto, taxa: pg.taxa, liquido: pg.liquido,
    forma: pg.forma, recibo: pg.recibo, pagoEm: pg.pagoEm,
  },
});

// ---------------------------------------------------------------------------
// O REPASSE PARA O BANCO
// ---------------------------------------------------------------------------

/**
 * Registra o repasse da Stripe para a Truist como transferência do sistema.
 *
 * Este é o pedaço que faltava inteiro. O dinheiro não vai do cartão para o
 * banco: ele fica na Stripe e sai em lote, dias depois. Sem registrar esse
 * passo, a parcela é baixada e o dinheiro desaparece até reaparecer na Truist
 * como um depósito único que ninguém consegue abrir.
 *
 * `origemStripe` é a âncora, igual ao `origemBling` das transferências que
 * vieram da migração: é ela que garante que o mesmo repasse não entre duas
 * vezes, nem pelo webhook nem pela varredura.
 */
async function registrarRepasse(payout, falhou, R, log = []) {
  const cfgS = (R.financeiro && R.financeiro.stripe) || {};
  const contaStripe = cfgS.contaStripe || 'Stripe';
  const contaDestino = cfgS.contaRepasse || 'Truist';
  const valor = Number(payout.amount || 0) / 100;
  const data = payout.arrival_date
    ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10) : hoje();

  if (falhou) {
    await avisarCanal('financeiro',
      `🏦 *Repasse da Stripe falhou* — US$ ${valor.toFixed(2)}.\n`
      + `Motivo: ${textoCurto(payout.failure_message || 'não informado')}.\n`
      + `O dinheiro continua na Stripe, não entrou na ${contaDestino}.`).catch(() => {});
    return { acao: 'repasse falhou' };
  }

  let criou = false;
  await gravar(K.transferencias, null, null, QUEM, (_novo, atual) => {
    const lista = Array.isArray(atual) ? atual : [];
    // Já entrou? Então não entra de novo. O Stripe reentrega evento e a
    // varredura passa pelo mesmo repasse — sem esta checagem o saldo da Truist
    // seria somado duas vezes.
    if (lista.some(t => t && t.origemStripe === payout.id)) return lista;
    lista.push({
      id: 'tr' + payout.id,
      de: contaStripe,
      para: contaDestino,
      valor,
      data,
      observacao: `Repasse automático da Stripe para a ${contaDestino}`,
      origemStripe: payout.id,
      criadoEm: agora(),
    });
    criou = true;
    return lista;
  });

  if (criou) {
    await avisarCanal('financeiro',
      `🏦 Repasse da Stripe para a ${contaDestino}: *US$ ${valor.toFixed(2)}* (chega em ${data}).\n`
      + `Lançado como transferência. Para ver de quais parcelas ele é feito, abra o repasse no Financeiro.`).catch(() => {});
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [QUEM, K.transferencias, payout.id, 'criado',
       `Repasse da Stripe para a ${contaDestino}: US$ ${valor.toFixed(2)}`]).catch(() => {});
  }
  return { acao: criou ? 'repasse lançado' : 'repasse já estava lançado' };
}

// ---------------------------------------------------------------------------
// TRATAR UM EVENTO (usado pelo webhook E pela varredura — um caminho só)
// ---------------------------------------------------------------------------

async function tratarEvento(ev, R, log = []) {
  const obj = (ev.data && ev.data.object) || {};
  const meta = obj.metadata || {};
  const parcelaId = meta.parcelaId || obj.client_reference_id || null;
  const rotuloForma = ((R.financeiro && R.financeiro.stripe && R.financeiro.stripe.formaPagamento) || 'Stripe');

  // O repasse vem antes da guarda de parcela de propósito: ele é o lote inteiro
  // saindo para o banco e não pertence a nenhuma parcela. Se ficasse depois,
  // seria descartado por "sem parcela" e a terceira camada nunca entraria.
  if (ev.type === 'payout.paid' || ev.type === 'payout.failed') {
    return registrarRepasse(obj, ev.type === 'payout.failed', R, log);
  }

  // Evento de outra integração na mesma conta Stripe: ignorar em silêncio.
  // A conta recebe dinheiro de fora do sistema também, e não é papel nosso
  // mexer no que não nasceu aqui.
  if (!parcelaId && meta.sistema !== 'legalway') return { ignorado: 'sem parcela' };

  if (ev.type === 'checkout.session.completed') {
    // Cartão: já pago. ACH: ainda não — só fechou a autorização.
    if (obj.payment_status === 'paid') {
      const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : null;
      if (!pi) return { ignorado: 'sessão paga sem payment_intent' };
      const pg = await lerPagamento(pi);
      if (!pg.ok) { log.push(`stripe: não consegui ler o pagamento ${pi} — ${pg.motivo}`); return { erro: pg.motivo }; }
      const r = await aplicar(parcelaId, comoPaga({ ...pg, paymentIntentId: pi, rotuloForma }), 'pagamento confirmado');
      return { parcelaId, acao: r.achou ? 'paga' : 'parcela não encontrada' };
    }
    const r = await aplicar(parcelaId, {
      status: 'Processando',
      campos: { status: 'Processando' },
      stripe: { status: 'processando', sessaoId: obj.id,
        paymentIntentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : null },
    }, 'débito bancário em trânsito');
    return { parcelaId, acao: r.achou ? 'processando' : 'parcela não encontrada' };
  }

  if (ev.type === 'payment_intent.succeeded') {
    const pg = await lerPagamento(obj.id);
    if (!pg.ok) return { erro: pg.motivo };
    const r = await aplicar(parcelaId || pg.parcelaId, comoPaga({ ...pg, paymentIntentId: obj.id, rotuloForma }), 'pagamento confirmado');
    return { parcelaId: parcelaId || pg.parcelaId, acao: r.achou ? 'paga' : 'parcela não encontrada' };
  }

  if (ev.type === 'payment_intent.payment_failed') {
    const erro = (obj.last_payment_error && obj.last_payment_error.message) || 'o banco recusou';
    // Volta ao estado anterior em vez de inventar um status novo: a parcela
    // simplesmente não foi paga. E é AQUI que o aviso de "cobrança não entrou"
    // ganha causa real — até hoje ele só sabia que a data passou.
    const r = await aplicar(parcelaId, {
      status: 'falhou',
      campos: { status: 'A receber' },
      stripe: { status: 'falhou', motivoFalha: textoCurto(erro), falhouEm: agora() },
    }, `cobrança recusada: ${erro}`);
    if (r.achou) {
      await avisarCanal('financeiro', `💳 Cobrança recusada no Stripe — parcela ${parcelaId}: ${erro}`).catch(() => {});
    }
    return { parcelaId, acao: r.achou ? 'falhou' : 'parcela não encontrada' };
  }

  if (ev.type === 'charge.refunded') {
    const devolvido = Number(obj.amount_refunded || 0) / 100;
    const total = Number(obj.amount || 0) / 100;
    const parcial = devolvido > 0 && devolvido < total;
    const r = await aplicar(parcelaId, {
      status: 'devolvido',
      campos: parcial ? {} : { status: 'A receber', valorRecebido: 0, dataRecebimento: null },
      stripe: { status: parcial ? 'devolvido em parte' : 'devolvido', devolvido, devolvidoEm: agora() },
    }, `devolução de US$ ${devolvido.toFixed(2)}`);
    if (r.achou) {
      await avisarCanal('financeiro',
        `↩️ Devolução no Stripe — parcela ${parcelaId}: US$ ${devolvido.toFixed(2)}${parcial ? ' (parcial)' : ''}`).catch(() => {});
    }
    return { parcelaId, acao: r.achou ? 'devolvida' : 'parcela não encontrada' };
  }

  // --- CONTESTAÇÃO ---------------------------------------------------------
  // O banco do cliente retira o dinheiro imediatamente e só depois analisa. A
  // parcela continua devida — o serviço foi prestado — mas o dinheiro não está
  // mais lá. Marcar e avisar alto: contestação tem prazo de resposta, e perder
  // o prazo é perder o dinheiro sem discussão.
  if (ev.type === 'charge.dispute.created') {
    const valor = Number(obj.amount || 0) / 100;
    const r = await aplicar(parcelaId, {
      status: 'contestado',
      campos: {},
      stripe: { status: 'contestado', contestado: valor, contestadoEm: agora(),
        motivoContestacao: textoCurto(obj.reason || ''), prazoResposta: obj.evidence_details && obj.evidence_details.due_by
          ? new Date(obj.evidence_details.due_by * 1000).toISOString().slice(0, 10) : null },
    }, `contestação aberta: ${obj.reason || 'sem motivo informado'}`);
    await avisarCanal('financeiro',
      `⚠️ *Contestação no cartão* — parcela ${parcelaId}: US$ ${valor.toFixed(2)}.\n`
      + `Motivo: ${obj.reason || 'não informado'}.\n`
      + `O dinheiro já saiu da conta da Stripe. Responder até `
      + `${obj.evidence_details && obj.evidence_details.due_by ? new Date(obj.evidence_details.due_by * 1000).toISOString().slice(0, 10) : 'ver no painel'}.`).catch(() => {});
    return { parcelaId, acao: r.achou ? 'contestada' : 'parcela não encontrada' };
  }

  if (ev.type === 'charge.dispute.closed') {
    const ganhou = obj.status === 'won';
    const valor = Number(obj.amount || 0) / 100;
    const r = await aplicar(parcelaId, {
      status: ganhou ? 'contestação ganha' : 'contestação perdida',
      // Perdeu: o dinheiro não voltou, então a parcela volta a ser devida.
      // Sem isto o relatório contaria como recebido algo que foi retirado.
      campos: ganhou ? {} : { status: 'A receber', valorRecebido: 0, dataRecebimento: null },
      stripe: { status: ganhou ? 'contestação ganha' : 'contestação perdida', fechadoEm: agora() },
    }, `contestação ${ganhou ? 'ganha' : 'perdida'}`);
    await avisarCanal('financeiro',
      `${ganhou ? '✅' : '❌'} Contestação ${ganhou ? 'ganha' : 'perdida'} — parcela ${parcelaId}: US$ ${valor.toFixed(2)}`
      + (ganhou ? '. O dinheiro volta para a conta.' : '. O dinheiro não volta e a parcela voltou para "a receber".')).catch(() => {});
    return { parcelaId, acao: r.achou ? (ganhou ? 'contestação ganha' : 'contestação perdida') : 'parcela não encontrada' };
  }

  if (ev.type === 'checkout.session.expired') {
    await aplicar(parcelaId, { status: 'link expirado', campos: {},
      stripe: { status: 'link expirado', link: null, expiradoEm: agora() } }, 'link de pagamento expirou');
    return { parcelaId, acao: 'link expirado' };
  }

  return { ignorado: ev.type };
}

// ---------------------------------------------------------------------------
// O WEBHOOK
// ---------------------------------------------------------------------------

export const rotasStripe = Router();

rotasStripe.post('/publico/stripe/webhook', async (req, res) => {
  if (!webhookConfigurado()) return res.status(503).json({ erro: 'webhook não configurado' });

  const conf = assinaturaConfere(req.corpoBruto, req.get('stripe-signature'));
  if (!conf.ok) {
    // Assinatura errada é tentativa de dar baixa em parcela não paga. Vai para
    // a vigilância, não só para o log.
    anotar('stripe-assinatura', req, `webhook recusado: ${conf.motivo}`);
    return res.status(400).json({ erro: 'assinatura inválida' });
  }

  let ev;
  try { ev = JSON.parse(req.corpoBruto.toString('utf8')); }
  catch { return res.status(400).json({ erro: 'corpo inválido' }); }

  // Responder rápido é regra do Stripe: ele reenvia o que demora. O trabalho
  // segue depois da resposta, e se algo falhar a varredura pega.
  res.json({ recebido: true });

  try {
    const st = await estado();
    if (st.tratados.includes(ev.id)) return;            // reentrega: já foi
    const R = await obterRegras();
    const log = [];
    const r = await tratarEvento(ev, R, log);
    await salvarEstado(v => ({ ...v, tratados: [...v.tratados, ev.id] }));
    if (r && r.acao) {
      await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
        [QUEM, K.financeiro, r.parcelaId || null, 'alterado', `Stripe · ${ev.type} → ${r.acao}`]).catch(() => {});
    }
    for (const l of log) console.error('[stripe]', l);
  } catch (e) {
    console.error('[stripe] webhook falhou depois de responder:', e.message);
  }
});

// ---------------------------------------------------------------------------
// COBRAR — gerar o link de uma parcela
// ---------------------------------------------------------------------------

const podeCobrar = (req) => req.usuario.acesso_total || podeGravar(req.usuario, K.financeiro);

rotasStripe.post('/stripe/cobrar/:parcelaId', exigirLogin, async (req, res, next) => {
  try {
    if (!podeCobrar(req)) return res.status(403).json({ erro: 'Sem permissão no Financeiro.' });
    if (!stripeConfigurado()) return res.status(503).json({ erro: 'Faltam as chaves do Stripe nas variáveis do servidor.' });

    const R = await obterRegras();
    const cfgS = (R.financeiro && R.financeiro.stripe) || {};
    const r = await ler(K.financeiro);
    const lista = (r && r.valor) || [];
    const parcela = lista.find(p => p && String(p.id) === String(req.params.parcelaId));
    if (!parcela) return res.status(404).json({ erro: 'Parcela não encontrada.' });
    if (parcela.status === 'Pago') return res.status(409).json({ erro: 'Essa parcela já está paga.' });
    if (parcela.status === 'Cancelado') return res.status(409).json({ erro: 'Essa parcela está cancelada.' });

    // E-mail do cliente para o recibo do Stripe chegar sozinho.
    const rc = await ler(K.contratos);
    const contrato = ((rc && rc.valor) || []).find(c => c && c.id === parcela.contratoId);
    const email = (contrato && contrato.email) || '';

    const base = (process.env.URL_PUBLICA || '').replace(/\/$/, '');
    const nova = await criarCheckout({
      parcela,
      cliente: { email },
      formas: cfgS.formas,
      urlOk: `${base}/portal-cliente.html?pago=1`,
      urlVolta: `${base}/portal-cliente.html?pago=0`,
      expiraMinutos: Number(cfgS.linkExpiraMinutos) || 0,
    });
    if (!nova.ok) return res.status(502).json({ erro: nova.motivo });

    await aplicar(parcela.id, {
      status: 'link gerado',
      campos: {},
      stripe: { sessaoId: nova.sessaoId, paymentIntentId: nova.paymentIntentId,
        link: nova.link, expiraEm: nova.expiraEm, status: 'aguardando pagamento', criadoEm: agora(), criadoPor: req.usuario.nome },
    }, `link de pagamento gerado por ${req.usuario.nome}`);

    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, K.financeiro, parcela.id, 'alterado',
       `Link de cobrança do Stripe gerado (US$ ${Number(parcela.valor || 0).toFixed(2)})`]).catch(() => {});

    res.json({ ok: true, link: nova.link, sessaoId: nova.sessaoId, expiraEm: nova.expiraEm });
  } catch (e) { next(e); }
});

/** Cancela o link de uma parcela — usado quando ela é baixada por outro meio. */
rotasStripe.post('/stripe/cancelar/:parcelaId', exigirLogin, async (req, res, next) => {
  try {
    if (!podeCobrar(req)) return res.status(403).json({ erro: 'Sem permissão no Financeiro.' });
    const r = await ler(K.financeiro);
    const parcela = ((r && r.valor) || []).find(p => p && String(p.id) === String(req.params.parcelaId));
    if (!parcela || !parcela.stripe || !parcela.stripe.sessaoId) {
      return res.status(404).json({ erro: 'Essa parcela não tem link do Stripe.' });
    }
    const e = await expirarSessao(parcela.stripe.sessaoId);
    if (!e.ok && e.status !== 400) return res.status(502).json({ erro: e.motivo });
    await aplicar(parcela.id, { status: 'link cancelado', campos: {},
      stripe: { status: 'link cancelado', link: null } }, `link cancelado por ${req.usuario.nome}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** Situação da integração, para a tela avisar o que falta. */
rotasStripe.get('/stripe/situacao', exigirLogin, async (req, res, next) => {
  try {
    const st = await estado();
    const saldo = stripeConfigurado() ? await lerSaldo() : { ok: false };
    res.json({
      configurado: stripeConfigurado(),
      webhook: webhookConfigurado(),
      ambiente: ambienteStripe(),
      conferidoEm: st.conferidoEm,
      saldo: saldo.ok ? { disponivel: saldo.disponivel, aCaminho: saldo.aCaminho } : null,
    });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// A VARREDURA — a garantia de que os valores batem
// ---------------------------------------------------------------------------

/**
 * Lê do Stripe os eventos que ainda não foram tratados e aplica todos.
 *
 * É o que transforma "o webhook avisou" em "os valores batem". Roda junto das
 * outras automações. Em operação normal não encontra nada — o webhook chegou
 * primeiro e o id do evento já está na lista de tratados. Quando encontra,
 * quer dizer que um webhook se perdeu, e a divergência se fecha sozinha.
 */
export async function conferirStripe(log) {
  if (!stripeConfigurado()) return;
  const st = await estado();
  const R = await obterRegras();

  const r = await listarEventos({ apos: st.ultimoEvento, tipos: TIPOS, limite: 100 });
  if (!r.ok) { log.push(`stripe: não consegui ler os eventos — ${r.motivo}`); return; }

  // O Stripe devolve do mais novo para o mais velho. Aplicar nessa ordem faria
  // uma devolução ser sobrescrita pelo pagamento que veio antes dela.
  const eventos = [...r.eventos].reverse();
  let aplicados = 0, repetidos = 0;
  const tratadosAgora = [];

  for (const ev of eventos) {
    if (st.tratados.includes(ev.id)) { repetidos++; tratadosAgora.push(ev.id); continue; }
    try {
      const res = await tratarEvento(ev, R, log);
      tratadosAgora.push(ev.id);
      if (res && res.acao) {
        aplicados++;
        log.push(`stripe (varredura): ${ev.type} → ${res.acao} · parcela ${res.parcelaId}`);
      }
    } catch (e) {
      log.push(`stripe: evento ${ev.id} falhou — ${e.message}`);
      break;   // para no primeiro erro: não avança o marcador por cima de um buraco
    }
  }

  // O marcador só avança até o último evento aplicado com sucesso. Assim um
  // erro no meio não faz a varredura pular o que ficou para trás.
  const ultimo = tratadosAgora.length ? tratadosAgora[tratadosAgora.length - 1] : st.ultimoEvento;
  await salvarEstado(v => ({
    ...v,
    ultimoEvento: ultimo,
    tratados: [...v.tratados, ...tratadosAgora.filter(id => !v.tratados.includes(id))],
    conferidoEm: agora(),
  }));

  if (aplicados) log.push(`stripe: ${aplicados} evento(s) que o webhook não entregou foram conciliados`);
}
