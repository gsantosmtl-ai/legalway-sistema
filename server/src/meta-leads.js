// Porta única de entrada da Meta: formulário instantâneo e WhatsApp oficial.
//
// É o mesmo aplicativo, o mesmo endereço e a mesma assinatura para os dois.
// O que muda é o tipo de aviso:
//   field 'leadgen'   → alguém preencheu o formulário do Facebook ou Instagram
//   field 'messages'  → alguém mandou mensagem no WhatsApp
//
// Os dois gravam em legalway-leads-v1 pela mesma função, então a automação de
// primeiro contato dispara igual e a pessoa que usa os dois canais vira UM lead.
//
// Variáveis (Railway):
//   META_VERIFY_TOKEN   frase que você inventa e repete no painel da Meta
//   META_APP_SECRET     "Chave Secreta do App" (Configurações > Básico)
//   META_PAGE_TOKEN     token da Página com permissão leads_retrieval
//   META_FORMULARIOS    (opcional) {"<id do formulário>":{"servico":"EB-2 NIW"}}
//   WHATSAPP_TOKEN / WHATSAPP_PHONE_ID   para o WhatsApp (ver whatsapp.js)
import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { registrarToque, avisarVendas } from './leads-entrada.js';
import { processarMensagens, whatsappConfigurado } from './whatsapp.js';
import { anotar } from './guardiao.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
const CANAL = 'facebook';
const ROTULO = 'Facebook';

const cfg = () => ({
  verify: process.env.META_VERIFY_TOKEN || '',
  segredo: process.env.META_APP_SECRET || '',
  token: process.env.META_PAGE_TOKEN || '',
});

function formulariosConfigurados() {
  try { return JSON.parse(process.env.META_FORMULARIOS || '{}'); }
  catch { console.error('[meta] META_FORMULARIOS não é JSON válido — ignorando'); return {}; }
}

// A Meta assina o corpo da requisição. Sem conferir, qualquer pessoa na internet
// conseguiria despejar lead falso no funil do escritório.
function assinaturaConfere(req) {
  const { segredo } = cfg();
  if (!segredo) return false;
  const cabecalho = req.get('x-hub-signature-256') || '';
  if (!cabecalho.startsWith('sha256=')) return false;
  const esperado = 'sha256=' + createHmac('sha256', segredo)
    .update(req.corpoBruto || Buffer.from('')).digest('hex');
  const a = Buffer.from(cabecalho), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Os nomes dos campos variam conforme quem montou o formulário.
const CAMPOS = {
  nome:     ['full_name', 'nome', 'nome_completo', 'name', 'first_name', 'nombre'],
  email:    ['email', 'e-mail', 'correo', 'correo_electronico'],
  telefone: ['phone_number', 'telefone', 'celular', 'whatsapp', 'telefono', 'phone'],
  servico:  ['servico', 'serviço', 'visto', 'tipo_de_visto', 'interesse', 'visa', 'servicio'],
};

export function extrairCampos(fieldData = []) {
  const bruto = {};
  for (const f of fieldData) {
    const k = String(f.name || '').toLowerCase().trim();
    const v = Array.isArray(f.values) ? String(f.values[0] ?? '').trim() : '';
    if (k && v) bruto[k] = v;
  }
  const achar = (lista) => {
    for (const n of lista) if (bruto[n]) return bruto[n];
    for (const [k, v] of Object.entries(bruto)) if (lista.some(n => k.includes(n))) return v;
    return '';
  };
  const out = {};
  for (const [campo, nomes] of Object.entries(CAMPOS)) out[campo] = achar(nomes);
  // o que sobrou vira observação — nenhuma resposta do formulário se perde
  const usados = new Set(Object.values(CAMPOS).flat());
  out.extras = Object.entries(bruto).filter(([k]) => !usados.has(k)).map(([k, v]) => `${k}: ${v}`);
  return out;
}

async function buscarLead(leadgenId) {
  const { token } = cfg();
  const campos = 'id,created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform';
  const r = await fetch(`${GRAPH}/${encodeURIComponent(leadgenId)}?fields=${campos}&access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Graph ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

async function processarFormulario(leadgenId) {
  const { token } = cfg();
  if (!token) { console.error('[meta] META_PAGE_TOKEN ausente — lead recebido e NÃO gravado:', leadgenId); return; }
  const bruto = await buscarLead(leadgenId);
  const c = extrairCampos(bruto.field_data);
  const mapa = formulariosConfigurados()[String(bruto.form_id)] || {};
  const plataforma = bruto.platform === 'ig' ? 'Instagram' : 'Facebook';
  const campanha = bruto.campaign_name || bruto.ad_name || '';

  const r = await registrarToque({
    canal: mapa.origem || CANAL, rotulo: plataforma,
    chave: bruto.id, campoChave: 'metaLeadId',
    nome: c.nome, telefone: c.telefone, email: c.email,
    servico: mapa.servico || c.servico, campanha,
    quando: bruto.created_time ? new Date(bruto.created_time).toISOString() : undefined,
    texto: `Preencheu o formulário do ${plataforma}`
      + (campanha ? ` — campanha "${campanha}"` : '')
      + (c.extras.length ? `\n${c.extras.join('\n')}` : ''),
  });
  if (!r) { console.log(`[meta] lead ${bruto.id} já estava gravado — ignorado`); return; }
  avisarVendas(r, plataforma);
  console.log(`[meta] ${r.novo ? 'lead criado' : 'juntado ao lead'} ${r.lead.id} (${bruto.id})`);
}

export const rotasMetaLeads = Router();

// 1) Aperto de mão: a Meta chama uma vez, ao cadastrar o endereço no painel.
rotasMetaLeads.get('/publico/meta/leads', (req, res) => {
  const { verify } = cfg();
  if (req.query['hub.mode'] === 'subscribe' && verify && req.query['hub.verify_token'] === verify) {
    console.log('[meta] webhook verificado pela Meta');
    return res.status(200).send(String(req.query['hub.challenge'] || ''));
  }
  anotar('meta-verificacao-invalida', req, 'tentativa de verificar o webhook com token errado');
  return res.sendStatus(403);
});

// 2) Os avisos. Responder rápido é regra da Meta: acima de ~5 s ela considera
//    falha e reenvia. Por isso o processamento acontece depois da resposta.
rotasMetaLeads.post('/publico/meta/leads', async (req, res) => {
  if (!assinaturaConfere(req)) {
    anotar('meta-assinatura-invalida', req, 'POST no webhook da Meta sem assinatura válida');
    return res.sendStatus(403);
  }
  res.sendStatus(200);

  for (const e of (Array.isArray(req.body?.entry) ? req.body.entry : [])) {
    for (const ch of (e.changes || [])) {
      try {
        if (ch.field === 'leadgen' && ch.value?.leadgen_id) await processarFormulario(ch.value.leadgen_id);
        else if (ch.field === 'messages') await processarMensagens(ch.value);
      } catch (err) {
        console.error(`[meta] falha ao processar aviso '${ch.field}':`, err.message);
      }
    }
  }
});

// 3) Diagnóstico: diz o que falta, sem revelar nenhum segredo.
rotasMetaLeads.get('/publico/meta/estado', (req, res) => {
  const c = cfg();
  res.json({
    verificacao: !!c.verify, assinatura: !!c.segredo, tokenPagina: !!c.token,
    formularios: Object.keys(formulariosConfigurados()).length,
    whatsapp: whatsappConfigurado(),
    formularioPronto: !!(c.verify && c.segredo && c.token),
  });
});
