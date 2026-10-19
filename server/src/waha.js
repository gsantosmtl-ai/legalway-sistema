// WAHA — a SAÍDA dos setores.
//
// O escritório tem dois WhatsApp e cada um faz uma coisa. Confundir os dois é
// o erro fácil aqui, então:
//
//   WhatsApp Business oficial (Meta) — PORTA DE ENTRADA. Recebe o lead do
//   formulário e a mensagem de quem escreve, e responde dentro da janela de
//   24 h. Fica em whatsapp.js e meta-leads.js.
//
//   WAHA (este arquivo) — SAÍDA dos setores. Documentação e Financeiro falam
//   com o cliente quando precisam, não quando a janela está aberta.
//
// Cada setor (documentação, financeiro, comercial) fala com o cliente pelo
// próprio número, e esses números não são o WhatsApp Business oficial: são
// sessões do WhatsApp Web mantidas por um WAHA que o escritório hospeda.
//
// A DIFERENÇA QUE IMPORTA, e que muda o desenho de quem usa este módulo:
// o canal oficial da Meta só aceita texto livre dentro de 24 h depois de o
// cliente escrever, e fora disso exige modelo aprovado. O WAHA não tem nada
// disso — é uma sessão de WhatsApp Web, manda texto livre a qualquer hora,
// para qualquer número. Por isso o follow-up semanal só é possível de verdade
// por aqui.
//
// Em troca, o WAHA é frágil onde o oficial é sólido: a sessão cai quando o
// celular fica muito tempo sem internet, quando alguém desconecta o aparelho
// pelo WhatsApp, ou quando o container reinicia sem o volume. Por isso toda
// função daqui devolve o motivo da falha em vez de lançar, e existe o
// `statusSessao` para a tela mostrar quando é preciso ler o QR de novo.
//
// Variáveis (Railway → Variables):
//   WAHA_URL       endereço do WAHA, ex.: https://waha.suaempresa.com
//   WAHA_API_KEY   a chave do painel (header X-Api-Key)
//
// O nome da sessão de cada setor fica em Configurações → Regras → Setores,
// no campo "sessao" — uma por número.

const base = () => String(process.env.WAHA_URL || '').replace(/\/+$/, '');
const chave = () => String(process.env.WAHA_API_KEY || '');

export const wahaConfigurado = () => !!(base() && chave());

// O WhatsApp quer o número só com dígitos e o sufixo @c.us. Número dos EUA
// costuma vir como (321) 240-6602 e o do Brasil como +55 62 8221-7743 — os
// dois viram dígitos puros, com o país na frente.
export function chatId(telefone, paisPadrao = '1') {
  let d = String(telefone || '').replace(/\D/g, '');
  if (!d) return null;
  // 10 dígitos = número americano sem o país
  if (d.length === 10) d = paisPadrao + d;
  if (d.length < 11) return null;
  return d + '@c.us';
}

async function chamar(caminho, corpo, metodo = 'POST') {
  if (!wahaConfigurado()) return { ok: false, motivo: 'WAHA não está configurado neste servidor' };
  try {
    const r = await fetch(base() + caminho, {
      method: metodo,
      headers: { 'X-Api-Key': chave(), 'Content-Type': 'application/json' },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j?.message || j?.error || `erro ${r.status}`;
      console.error('[waha] falhou:', caminho, msg);
      return { ok: false, motivo: String(msg).slice(0, 200), status: r.status };
    }
    return { ok: true, dados: j };
  } catch (e) {
    const msg = e.name === 'TimeoutError' ? 'o WAHA não respondeu em 20s' : e.message;
    console.error('[waha] falhou:', caminho, msg);
    return { ok: false, motivo: String(msg).slice(0, 200) };
  }
}

/** Manda texto pela sessão do setor. Devolve {ok, motivo} — nunca lança. */
export async function enviarTexto(sessao, telefone, texto) {
  const id = chatId(telefone);
  if (!id) return { ok: false, motivo: 'telefone inválido: ' + (telefone || '(vazio)') };
  if (!sessao) return { ok: false, motivo: 'setor sem sessão configurada' };
  return chamar('/api/sendText', { session: sessao, chatId: id, text: String(texto || '').slice(0, 4000) });
}

/** Estado de uma sessão: WORKING, SCAN_QR_CODE, STOPPED, FAILED… */
export async function statusSessao(sessao) {
  if (!sessao) return { ok: false, motivo: 'sem sessão' };
  const r = await chamar('/api/sessions/' + encodeURIComponent(sessao), null, 'GET');
  if (!r.ok) return r;
  const s = r.dados || {};
  return { ok: true, estado: s.status || s.state || '?', pronta: /working/i.test(s.status || s.state || '') };
}

/** Todas as sessões, para a tela de configuração mostrar o que está de pé. */
export async function listarSessoes() {
  const r = await chamar('/api/sessions', null, 'GET');
  if (!r.ok) return r;
  const lista = Array.isArray(r.dados) ? r.dados : [];
  return { ok: true, sessoes: lista.map(s => ({ nome: s.name, estado: s.status || s.state || '?' })) };
}

/** A sessão do setor, lida das Regras. */
export function sessaoDoSetor(regras, key) {
  const s = ((regras?.setores?.lista) || []).find(x => x.key === key);
  return s ? (s.sessao || '') : '';
}
