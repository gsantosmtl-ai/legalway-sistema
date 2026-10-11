// Mensagens de WhatsApp entrando no sistema (WhatsApp Cloud API, oficial).
//
// Chega pelo MESMO webhook do formulário: é o mesmo aplicativo da Meta, a mesma
// assinatura e o mesmo endereço. O que muda é o tipo de aviso — ali é 'leadgen',
// aqui é 'messages'.
//
// Por enquanto o sistema OUVE: toda mensagem recebida vira lead ou entra no
// histórico de quem já existe. Responder pelo sistema é o passo seguinte, e
// envolve a janela de 24 horas e modelos aprovados pela Meta.
//
// Variáveis:
//   WHATSAPP_TOKEN      token com permissão whatsapp_business_messaging
//   WHATSAPP_PHONE_ID   id do número (aparece no painel do WhatsApp)
import { registrarToque, avisarVendas, atualizarLead } from './leads-entrada.js';
import { obterRegras } from './regras.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
// Regra da Meta: texto livre só dentro de 24 h da última mensagem do cliente.
// Passou disso, só modelo aprovado. É isso que separa o lead que mandou
// WhatsApp (dá para responder) do que só preencheu formulário (não dá).
const JANELA_H = 24;

const CANAL = 'whatsapp';
const ROTULO = 'WhatsApp';

// Descreve a mensagem em uma linha, qualquer que seja o tipo.
function descrever(m) {
  switch (m.type) {
    case 'text':     return m.text?.body || '';
    case 'image':    return '[imagem]' + (m.image?.caption ? ' ' + m.image.caption : '');
    case 'document': return '[documento] ' + (m.document?.filename || '');
    case 'audio':    return '[áudio]';
    case 'video':    return '[vídeo]' + (m.video?.caption ? ' ' + m.video.caption : '');
    case 'sticker':  return '[figurinha]';
    case 'location': return '[localização]';
    case 'contacts': return '[contato compartilhado]';
    case 'button':   return m.button?.text || '[botão]';
    case 'interactive':
      return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '[resposta]';
    default:         return `[${m.type || 'mensagem'}]`;
  }
}

/**
 * Processa um bloco `value` de um aviso com field === 'messages'.
 * Ignora os avisos de entrega e leitura, que vêm no mesmo formato.
 */
export async function processarMensagens(value) {
  const mensagens = Array.isArray(value?.messages) ? value.messages : [];
  if (!mensagens.length) return;   // só 'statuses' (entregue, lido) — não interessa aqui

  // O nome do perfil vem fora da mensagem, numa lista paralela.
  const nomePor = {};
  for (const c of (value.contacts || [])) if (c?.wa_id) nomePor[c.wa_id] = c.profile?.name || '';

  for (const m of mensagens) {
    if (!m?.from || !m?.id) continue;
    const texto = descrever(m);

    // Conversa que começou num anúncio de Click-to-WhatsApp traz o `referral`:
    // é ele que diz DE QUAL anúncio a pessoa veio. Sem isso o vendedor atende
    // sem saber o que ela clicou, e ninguém consegue medir campanha.
    const r = m.referral || {};
    const anuncio = [r.headline, r.body].filter(Boolean).join(' — ').slice(0, 180);
    const campanha = anuncio || (r.source_id ? `Anúncio ${r.source_id}` : '');
    const origemTxt = campanha
      ? `\nVeio do anúncio: ${campanha}`
        + (r.source_type ? ` (${r.source_type})` : '')
        + (r.source_url ? `\nLink: ${r.source_url}` : '')
      : '';
    const quando = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : undefined;
    try {
      const r = await registrarToque({
        canal: CANAL, rotulo: ROTULO,
        chave: m.id, campoChave: 'whatsappMsgId',
        nome: nomePor[m.from] || '',
        telefone: m.from,
        quando,
        servico: '', campanha,
        texto: `Mensagem no WhatsApp: ${texto}${origemTxt}`,
        campos: {
          // Marca quando o cliente falou: é o que abre a janela de 24 h.
          whatsappUltimaEntrada: quando || new Date().toISOString(),
          ...(campanha ? { campanha, anuncioOrigem: { id: r.source_id || '', titulo: r.headline || '',
            texto: r.body || '', tipo: r.source_type || '', url: r.source_url || '',
            clique: r.ctwa_clid || '' } } : {}),
        },
      });
      if (!r) { console.log(`[whatsapp] mensagem ${m.id} já registrada — ignorada`); continue; }
      avisarVendas(r, ROTULO);
      console.log(`[whatsapp] ${r.novo ? 'lead criado' : 'juntado ao lead'} ${r.lead.id} (${m.from})`);
      await responderAutomatico(r.lead, m.from);
    } catch (e) {
      console.error('[whatsapp] falha ao registrar mensagem', m.id, e.message);
    }
  }
}

// Acusa o recebimento na hora. Uma vez a cada 12 h por pessoa: sem esse freio,
// quem manda cinco mensagens seguidas recebe cinco respostas iguais e o
// escritório parece um robô quebrado.
const ESPERA_H = 12;

async function responderAutomatico(lead, para) {
  if (!whatsappConfigurado()) return;
  let R; try { R = await obterRegras(); } catch { return; }
  const cfg = (R && R.leads) || {};
  if (cfg.respostaAutomaticaAtiva === false) return;

  const ultima = lead.respostaAutomaticaEm ? new Date(lead.respostaAutomaticaEm).getTime() : 0;
  if (ultima && Date.now() - ultima < ESPERA_H * 3600e3) return;

  const texto = (cfg.respostaAutomaticaWhatsapp ||
    'Oi, {cliente}! Recebemos seu contato 👋\n\nJá estamos com a sua mensagem aqui e um consultor vai falar com você em breve. Se puder, me conta qual visto te interessa — isso adianta bastante.')
    .replace(/\{cliente\}/g, (lead.nome || '').split(' ')[0] || '')
    .replace(/\{empresa\}/g, (R.empresa && R.empresa.nome) || '');

  const env = await enviarTexto(para, texto);
  if (env.ok) {
    // Precisa de gravação própria: registrarToque já salvou, e mexer no objeto
    // em memória depois disso não guarda nada.
    await atualizarLead(lead.id, { respostaAutomaticaEm: new Date().toISOString() },
      'Resposta automática enviada no WhatsApp');
    console.log(`[whatsapp] resposta automática enviada para ${para}`);
  } else {
    console.error(`[whatsapp] resposta automática não saiu: ${env.motivo}`);
  }
}

export const whatsappConfigurado = () =>
  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);

/** O cliente falou nas últimas 24 h? Só então podemos escrever texto livre. */
export function dentroDaJanela(lead) {
  const q = lead?.whatsappUltimaEntrada;
  if (!q) return false;
  return Date.now() - new Date(q).getTime() < JANELA_H * 3600e3;
}

async function chamar(corpo) {
  const token = process.env.WHATSAPP_TOKEN, id = process.env.WHATSAPP_PHONE_ID;
  if (!token || !id) return { ok: false, motivo: 'WhatsApp não está configurado neste servidor' };
  const r = await fetch(`${GRAPH}/${id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...corpo }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `erro ${r.status}`;
    console.error('[whatsapp] envio falhou:', msg);
    return { ok: false, motivo: msg };
  }
  return { ok: true, id: j?.messages?.[0]?.id || '' };
}

/** Texto livre. Só funciona dentro da janela de 24 h — confira antes. */
export const enviarTexto = (para, texto) =>
  chamar({ to: String(para).replace(/\D/g, ''), type: 'text', text: { preview_url: false, body: String(texto).slice(0, 4000) } });

/** Modelo aprovado pela Meta. Funciona a qualquer hora, inclusive fora da janela. */
export const enviarModelo = (para, nome, idioma = 'pt_BR', valores = []) =>
  chamar({
    to: String(para).replace(/\D/g, ''), type: 'template',
    template: {
      name: nome, language: { code: idioma },
      ...(valores.length ? { components: [{ type: 'body', parameters: valores.map(v => ({ type: 'text', text: String(v) })) }] } : {}),
    },
  });
