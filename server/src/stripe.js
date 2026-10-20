// Stripe: cobrar pela plataforma e manter os valores batendo sempre.
//
// A conta é a Legalway Group LLC, em dólar. O Stripe JÁ é o canal principal do
// escritório — 2.265 das 2.948 parcelas estão marcadas como "Stripe
// Recebimentos" — só que a baixa era feita à mão. Isto liga as duas pontas.
//
// POR QUE fetch E NÃO O SDK: o resto do sistema fala com API de fora assim
// (uscis.js, waha.js). Sem dependência nova não há npm install no deploy, e a
// API do Stripe é form-encoded simples. O preço é escrever o aninhamento de
// chaves na mão, que é o que `form()` faz aqui embaixo.
//
// DINHEIRO EM CENTAVOS. O Stripe só fala em inteiro de centavo; o sistema
// guarda dólar com decimal. Toda conversão passa por `centavos()` e
// `dolares()`, e em lugar nenhum se multiplica por 100 solto — meio centavo
// perdido numa parcela vira divergência que ninguém acha depois.
//
// IDEMPOTÊNCIA. Toda criação manda `Idempotency-Key`. Se a rede cair entre o
// pedido e a resposta, a segunda tentativa devolve a MESMA sessão em vez de
// criar outra — senão o cliente receberia dois links e poderia pagar duas vezes
// a mesma parcela.
//
// NUNCA LANÇA. Igual ao waha.js: devolve { ok, ... } ou { ok:false, motivo }.
// Cobrança é dinheiro do cliente; um throw solto no meio de uma automação
// pararia a varredura inteira e deixaria o resto das parcelas sem conferir.

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const API = 'https://api.stripe.com/v1';

const cfg = () => ({
  chave: process.env.STRIPE_SECRET_KEY || '',
  segredoWebhook: process.env.STRIPE_WEBHOOK_SECRET || '',
});

export const stripeConfigurado = () => !!cfg().chave;
export const webhookConfigurado = () => !!cfg().segredoWebhook;

/** A chave de teste e a de produção são contas diferentes. Útil nos avisos da tela. */
export const ambienteStripe = () => {
  const k = cfg().chave;
  if (!k) return 'desligado';
  return k.startsWith('sk_live_') || k.startsWith('rk_live_') ? 'producao' : 'teste';
};

export const centavos = (valor) => Math.round(Number(valor || 0) * 100);
export const dolares = (cents) => Number(cents || 0) / 100;

// O Stripe recebe form-urlencoded com chave aninhada:
//   line_items[0][price_data][unit_amount]=34155
// Então o objeto vira esse formato aqui, recursivamente.
function form(valor, prefixo = '', saida = new URLSearchParams()) {
  if (valor === undefined || valor === null) return saida;
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => form(v, `${prefixo}[${i}]`, saida));
  } else if (typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) form(v, prefixo ? `${prefixo}[${k}]` : k, saida);
  } else {
    saida.append(prefixo, String(valor));
  }
  return saida;
}

async function chamar(metodo, caminho, corpo, { idem } = {}) {
  const { chave } = cfg();
  if (!chave) return { ok: false, motivo: 'Faltam as chaves do Stripe nas variáveis do servidor.' };
  // Sem `Stripe-Version`: vale a versão fixada na própria conta, no painel.
  // Fixar aqui uma versão que ninguém conferiu troca um risco conhecido (a
  // conta ser atualizada) por um desconhecido (pedir uma versão que não existe
  // e quebrar toda chamada de uma vez).
  const cabecalhos = { Authorization: `Bearer ${chave}` };
  if (corpo) cabecalhos['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idem) cabecalhos['Idempotency-Key'] = idem;
  try {
    const r = await fetch(API + caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo ? form(corpo).toString() : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const texto = await r.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
    if (!r.ok) {
      // A mensagem do Stripe é escrita para humano e diz o que falta. Vale
      // repassar — mas sem o corpo inteiro, que pode trazer dado do cliente.
      const e = dados && dados.error ? dados.error : {};
      return { ok: false, status: r.status, codigo: e.code || e.type || String(r.status),
        motivo: e.message || `Stripe respondeu ${r.status}` };
    }
    return { ok: true, dados };
  } catch (e) {
    return { ok: false, motivo: e.name === 'TimeoutError' ? 'O Stripe não respondeu em 20 s.' : e.message };
  }
}

// ---------------------------------------------------------------------------
// COBRAR UMA PARCELA
// ---------------------------------------------------------------------------

/**
 * Cria uma sessão de Checkout para uma parcela e devolve o link de pagamento.
 *
 * `formas` decide o custo, e a diferença é grande: no recebível em aberto hoje
 * (US$ 701 mil em 2.030 parcelas) o cartão custaria ~US$ 20.950 de taxa e o
 * débito ACH ~US$ 5.560. Por isso a forma é configuração do escritório, não
 * constante aqui dentro.
 *
 * `client_reference_id` e `metadata.parcelaId` são a âncora dos dois lados: é
 * por eles que o webhook e a varredura reencontram a parcela. Mesma disciplina
 * de kommoId e blingId na migração.
 */
export async function criarCheckout({ parcela, cliente, formas, urlOk, urlVolta, expiraMinutos }) {
  const valor = centavos(parcela.valor);
  if (valor < 50) return { ok: false, motivo: 'O Stripe não cobra menos de US$ 0,50.' };

  const metodos = (Array.isArray(formas) && formas.length ? formas : ['card']);
  const corpo = {
    mode: 'payment',
    client_reference_id: parcela.id,
    payment_method_types: metodos,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: valor,
        product_data: {
          name: parcela.descricao || 'Parcela',
          description: [parcela.servico, parcela.vencimento ? 'Vencimento ' + parcela.vencimento : '']
            .filter(Boolean).join(' · ') || undefined,
        },
      },
    }],
    metadata: {
      parcelaId: parcela.id,
      contratoId: parcela.contratoId || '',
      vencimento: parcela.vencimento || '',
      sistema: 'legalway',
    },
    // O recibo do Stripe chega sozinho no e-mail do cliente, e é ele que o
    // cliente guarda. Sem isto a pessoa paga e não recebe comprovante.
    ...(cliente && cliente.email ? { customer_email: cliente.email } : {}),
    success_url: urlOk,
    cancel_url: urlVolta,
  };
  // Link que vence evita o caso ruim: a pessoa paga em cima de um link de três
  // meses atrás, de uma parcela que já foi baixada por Zelle.
  if (expiraMinutos) {
    corpo.expires_at = Math.floor(Date.now() / 1000) + Math.max(30, Number(expiraMinutos)) * 60;
  }

  // A chave de idempotência amarra parcela + valor + formas: se o valor da
  // parcela for corrigido, é outra cobrança e pode nascer sessão nova.
  const idem = `lw-parcela-${parcela.id}-${valor}-${metodos.join('_')}`;
  const r = await chamar('POST', '/checkout/sessions', corpo, { idem });
  if (!r.ok) return r;
  const s = r.dados;
  return { ok: true, sessaoId: s.id, link: s.url, expiraEm: s.expires_at || null,
    paymentIntentId: typeof s.payment_intent === 'string' ? s.payment_intent : null };
}

/** Desliga um link antes da hora — usado quando a parcela é baixada por fora. */
export async function expirarSessao(sessaoId) {
  return chamar('POST', `/checkout/sessions/${encodeURIComponent(sessaoId)}/expire`);
}

// ---------------------------------------------------------------------------
// LER O QUE O STRIPE SABE (a fonte da verdade da conciliação)
// ---------------------------------------------------------------------------

export async function lerSessao(sessaoId) {
  const r = await chamar('GET', `/checkout/sessions/${encodeURIComponent(sessaoId)}`);
  return r.ok ? { ok: true, sessao: r.dados } : r;
}

/**
 * Lê o pagamento COM a taxa real. O `balance_transaction` é o único lugar que
 * diz quanto o Stripe ficou e quanto caiu na conta — e é isso que conserta o
 * furo do DRE: hoje a taxa não é descontada em lugar nenhum e o relatório
 * mostra lucro que não existe. Com isto a parcela passa a guardar bruto, taxa
 * e líquido de verdade, não estimativa de tabela.
 */
export async function lerPagamento(paymentIntentId) {
  const r = await chamar('GET',
    `/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge.balance_transaction`);
  if (!r.ok) return r;
  const pi = r.dados;
  const cobranca = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const bt = cobranca && cobranca.balance_transaction && typeof cobranca.balance_transaction === 'object'
    ? cobranca.balance_transaction : null;
  return {
    ok: true,
    status: pi.status,                              // succeeded | processing | requires_payment_method | ...
    bruto: dolares(pi.amount_received || pi.amount),
    taxa: bt ? dolares(bt.fee) : null,
    liquido: bt ? dolares(bt.net) : null,
    moeda: (pi.currency || 'usd').toUpperCase(),
    forma: cobranca && cobranca.payment_method_details ? cobranca.payment_method_details.type : null,
    pagoEm: cobranca && cobranca.created ? new Date(cobranca.created * 1000).toISOString() : null,
    reembolsado: cobranca ? dolares(cobranca.amount_refunded || 0) : 0,
    recibo: cobranca ? cobranca.receipt_url || null : null,
    parcelaId: (pi.metadata && pi.metadata.parcelaId) || null,
  };
}

/**
 * Eventos desde um ponto — o que garante o "sempre batendo".
 *
 * Webhook é rápido mas não é garantido: entrega pode falhar, o servidor pode
 * estar reiniciando, a assinatura pode ser rejeitada por configuração errada.
 * A varredura passa por cima disso lendo os eventos direto da fonte, a partir
 * do último que o sistema já tratou. Webhook dá a velocidade; isto dá a
 * convergência.
 */
export async function listarEventos({ apos, tipos, limite = 100 } = {}) {
  const p = new URLSearchParams();
  p.set('limit', String(Math.min(100, Math.max(1, limite))));
  if (apos) p.set('starting_after', apos);
  for (const t of (tipos || [])) p.append('types[]', t);
  const r = await chamar('GET', `/events?${p.toString()}`);
  if (!r.ok) return r;
  return { ok: true, eventos: r.dados.data || [], temMais: !!r.dados.has_more };
}

/** Saldo da conta — para a tela conferir se o que o sistema diz bate com o Stripe. */
export async function lerSaldo() {
  const r = await chamar('GET', '/balance');
  if (!r.ok) return r;
  const soma = (lista) => (lista || []).reduce((s, x) => s + dolares(x.amount), 0);
  return { ok: true, disponivel: soma(r.dados.available), aCaminho: soma(r.dados.pending) };
}

// ---------------------------------------------------------------------------
// ASSINATURA DO WEBHOOK
// ---------------------------------------------------------------------------

/**
 * Confere a assinatura do Stripe. Sem isto, qualquer pessoa na internet
 * conseguiria mandar "pagamento confirmado" e dar baixa numa parcela que
 * ninguém pagou — o pior defeito possível num módulo de cobrança.
 *
 * O cabeçalho vem como `t=1730000000,v1=abc...`. O que se assina é
 * `${t}.${corpoBruto}`, e o corpo tem de ser o byte a byte recebido: depois de
 * express.json() o conteúdo exato se perde e o HMAC nunca mais confere.
 *
 * A tolerância de tempo barra reenvio: um corpo assinado e capturado hoje não
 * serve amanhã.
 */
export function assinaturaConfere(corpoBruto, cabecalho, toleranciaSegundos = 300) {
  const { segredoWebhook } = cfg();
  if (!segredoWebhook) return { ok: false, motivo: 'Falta STRIPE_WEBHOOK_SECRET no servidor.' };
  const partes = String(cabecalho || '').split(',').reduce((acc, p) => {
    const i = p.indexOf('='); if (i > 0) acc[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    return acc;
  }, {});
  const t = Number(partes.t);
  const recebida = partes.v1;
  if (!t || !recebida) return { ok: false, motivo: 'Cabeçalho de assinatura ausente ou malformado.' };

  const agora = Math.floor(Date.now() / 1000);
  if (Math.abs(agora - t) > toleranciaSegundos) {
    return { ok: false, motivo: `Evento fora da janela de ${toleranciaSegundos} s — possível reenvio.` };
  }

  const esperada = createHmac('sha256', segredoWebhook)
    .update(Buffer.concat([Buffer.from(`${t}.`), Buffer.isBuffer(corpoBruto) ? corpoBruto : Buffer.from(String(corpoBruto || ''))]))
    .digest('hex');
  const a = Buffer.from(recebida), b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, motivo: 'Assinatura não confere.' };
  }
  return { ok: true };
}

/** Id único para chamadas em que o chamador não tem uma âncora natural. */
export const novaChaveIdem = () => 'lw-' + randomUUID();
