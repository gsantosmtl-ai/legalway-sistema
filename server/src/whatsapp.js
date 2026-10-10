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
import { registrarToque, avisarVendas } from './leads-entrada.js';

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
    const quando = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : undefined;
    try {
      const r = await registrarToque({
        canal: CANAL, rotulo: ROTULO,
        chave: m.id, campoChave: 'whatsappMsgId',
        nome: nomePor[m.from] || '',
        telefone: m.from,
        quando,
        texto: `Mensagem no WhatsApp: ${texto}`,
      });
      if (!r) { console.log(`[whatsapp] mensagem ${m.id} já registrada — ignorada`); continue; }
      avisarVendas(r, ROTULO);
      console.log(`[whatsapp] ${r.novo ? 'lead criado' : 'juntado ao lead'} ${r.lead.id} (${m.from})`);
    } catch (e) {
      console.error('[whatsapp] falha ao registrar mensagem', m.id, e.message);
    }
  }
}

export const whatsappConfigurado = () =>
  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
