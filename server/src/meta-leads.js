// Entrada automática de leads do Facebook e do Instagram (Meta Lead Ads).
//
// Quando alguém preenche o formulário instantâneo, a Meta avisa este endereço na
// hora. O servidor confere que o aviso é mesmo da Meta (assinatura), busca os
// dados do lead na API oficial e grava em legalway-leads-v1 — o mesmo lugar onde
// cai um lead digitado. Por isso a automação de primeiro contato dispara igual.
//
// Variáveis (Railway):
//   META_VERIFY_TOKEN   frase que você inventa e repete no painel da Meta
//   META_APP_SECRET     "Chave Secreta do App", em Configurações > Básico
//   META_PAGE_TOKEN     token da Página com permissão leads_retrieval
//   META_FORMULARIOS    (opcional) JSON mapeando formulário -> serviço e origem:
//                       {"123456":{"servico":"EB-2 NIW"},"789":{"servico":"Visto T"}}
//
// Sem essas variáveis a rota responde, mas não grava nada — e diz isso no log.
import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ler, gravar } from './armazenamento.js';
import { avisarCanal } from './chat.js';
import { anotar } from './guardiao.js';

const CHAVE_LEADS = 'legalway-leads-v1';
const GRAPH = 'https://graph.facebook.com/v21.0';
const QUEM = 'Meta Lead Ads';

const cfg = () => ({
  verify: process.env.META_VERIFY_TOKEN || '',
  segredo: process.env.META_APP_SECRET || '',
  token: process.env.META_PAGE_TOKEN || '',
});

function formulariosConfigurados() {
  try { return JSON.parse(process.env.META_FORMULARIOS || '{}'); }
  catch { console.error('[meta] META_FORMULARIOS não é um JSON válido — ignorando'); return {}; }
}

// A Meta assina o corpo da requisição. Sem conferir isso, qualquer pessoa na
// internet conseguiria despejar lead falso no funil do escritório.
function assinaturaConfere(req) {
  const { segredo } = cfg();
  if (!segredo) return false;
  const cabecalho = req.get('x-hub-signature-256') || '';
  if (!cabecalho.startsWith('sha256=')) return false;
  const esperado = 'sha256=' + createHmac('sha256', segredo)
    .update(req.corpoBruto || Buffer.from(''))
    .digest('hex');
  const a = Buffer.from(cabecalho), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Os nomes dos campos variam conforme quem montou o formulário. Cobrimos os
// padrões da Meta em pt/es/en e os apelidos mais comuns.
const CAMPOS = {
  nome:     ['full_name', 'nome', 'nome_completo', 'name', 'first_name', 'nombre'],
  email:    ['email', 'e-mail', 'correo', 'correo_electronico'],
  telefone: ['phone_number', 'telefone', 'celular', 'whatsapp', 'telefono', 'phone'],
  servico:  ['servico', 'serviço', 'visto', 'tipo_de_visto', 'interesse', 'visa', 'servicio'],
};

function extrairCampos(fieldData = []) {
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
  const extras = Object.entries(bruto)
    .filter(([k]) => !usados.includes?.(k) && !usados.has(k))
    .map(([k, v]) => `${k}: ${v}`);
  out.extras = extras;
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

// Dois telefones são a mesma pessoa se os últimos 8 dígitos batem — é o que
// sobrevive a +55, 0800, DDD escrito de jeitos diferentes e máscara do formulário.
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const fimDoTelefone = (s) => { const d = soDigitos(s); return d.length >= 8 ? d.slice(-8) : ''; };
const JANELA_DIAS = Number(process.env.META_JANELA_REPETIDO_DIAS || 90);

export function acharRepetido(lista, telefone, email) {
  const tel = fimDoTelefone(telefone);
  const mail = String(email || '').toLowerCase().trim();
  if (!tel && !mail) return null;
  const limite = Date.now() - JANELA_DIAS * 864e5;
  return lista.find(l => {
    if (!l) return false;
    // Lead antigo demais é oportunidade nova, não repetição — por isso a janela.
    const quando = new Date(l.entrada || 0).getTime();
    if (quando && quando < limite) return false;
    if (tel && fimDoTelefone(l.telefone) === tel) return true;
    if (mail && String(l.email || '').toLowerCase().trim() === mail) return true;
    return false;
  }) || null;
}

async function gravarLead(bruto) {
  const c = extrairCampos(bruto.field_data);
  const mapa = formulariosConfigurados()[String(bruto.form_id)] || {};
  const campanha = bruto.campaign_name || bruto.ad_name || '';
  const plataforma = bruto.platform === 'ig' ? 'Instagram' : 'Facebook';

  const atual = await ler(CHAVE_LEADS);
  const lista = Array.isArray(atual?.valor) ? atual.valor : (atual?.valor ? JSON.parse(atual.valor) : []);

  // A Meta reenvia o mesmo aviso quando não recebe 200 na primeira. Sem esta
  // checagem, uma falha de rede vira lead duplicado no funil.
  if (lista.some(l => l && l.metaLeadId === String(bruto.id))) {
    console.log(`[meta] lead ${bruto.id} já estava gravado — ignorado`);
    return null;
  }

  // Mesma pessoa chegando de novo: pelo segundo anúncio, repreenchendo o
  // formulário ou, mais tarde, mandando WhatsApp. Vira UM lead com vários
  // canais — é para isso que `origens` sempre foi uma lista.
  const repetido = acharRepetido(lista, c.telefone, c.email);
  if (repetido) {
    const canal = mapa.origem || 'facebook';
    repetido.origens = Array.from(new Set([...(repetido.origens || []), canal]));
    if (!repetido.servico && (mapa.servico || c.servico)) repetido.servico = mapa.servico || c.servico;
    if (!repetido.email && c.email) repetido.email = c.email;
    if (!repetido.telefone && c.telefone) repetido.telefone = c.telefone;
    repetido.historico = repetido.historico || [];
    repetido.historico.push({
      tipo: 'Sistema', quando: new Date().toISOString(),
      texto: `Preencheu de novo pelo ${bruto.platform === 'ig' ? 'Instagram' : 'Facebook'}`
        + (bruto.campaign_name ? ` — campanha "${bruto.campaign_name}"` : '')
        + (mapa.servico || c.servico ? ` · ${mapa.servico || c.servico}` : ''),
    });
    await gravar(CHAVE_LEADS, lista, atual ? atual.versao : null, QUEM);
    avisarCanal('vendas', `🔁 ${repetido.nome} preencheu o formulário de novo`
      + (mapa.servico || c.servico ? ` (${mapa.servico || c.servico})` : '')
      + '. Juntei no lead que já existia, não criei outro.').catch(() => {});
    console.log(`[meta] lead ${bruto.id} juntado ao existente ${repetido.id}`);
    return repetido;
  }

  const agora = new Date().toISOString();
  const lead = {
    id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    nome: c.nome || '(sem nome no formulário)',
    telefone: c.telefone || '',
    email: c.email || '',
    servico: mapa.servico || c.servico || '',
    campanha,
    origens: [mapa.origem || 'facebook'],
    entrada: bruto.created_time ? new Date(bruto.created_time).toISOString() : agora,
    responsavel: null,
    metaLeadId: String(bruto.id),
    metaFormId: String(bruto.form_id || ''),
    historico: [{
      tipo: 'Sistema', quando: agora,
      texto: `Chegou pelo formulário do ${plataforma}` + (campanha ? ` — campanha "${campanha}"` : '')
        + (c.extras.length ? `\n${c.extras.join('\n')}` : ''),
    }],
  };

  lista.unshift(lead);
  await gravar(CHAVE_LEADS, lista, atual ? atual.versao : null, QUEM);
  avisarCanal('vendas', `🆕 Lead do ${plataforma}: ${lead.nome}`
    + (lead.servico ? ` — ${lead.servico}` : '') + (lead.telefone ? ` · ${lead.telefone}` : '')).catch(() => {});
  console.log(`[meta] lead gravado: ${lead.nome} (${bruto.id})`);
  return lead;
}

export const rotasMetaLeads = Router();

// 1) Aperto de mão: a Meta chama uma vez, ao cadastrar o endereço no painel.
rotasMetaLeads.get('/publico/meta/leads', (req, res) => {
  const { verify } = cfg();
  const modo = req.query['hub.mode'], token = req.query['hub.verify_token'];
  if (modo === 'subscribe' && verify && token === verify) {
    console.log('[meta] webhook verificado pela Meta');
    return res.status(200).send(String(req.query['hub.challenge'] || ''));
  }
  anotar('meta-verificacao-invalida', req, 'tentativa de verificar o webhook com token errado');
  return res.sendStatus(403);
});

// 2) O aviso de lead novo.
rotasMetaLeads.post('/publico/meta/leads', async (req, res) => {
  if (!assinaturaConfere(req)) {
    anotar('meta-assinatura-invalida', req, 'POST no webhook da Meta sem assinatura válida');
    return res.sendStatus(403);
  }
  // Responder rápido é regra da Meta: acima de ~5s ela considera falha e reenvia.
  // Por isso o processamento acontece depois da resposta.
  res.sendStatus(200);

  const { token } = cfg();
  const entradas = Array.isArray(req.body?.entry) ? req.body.entry : [];
  for (const e of entradas) {
    for (const ch of (e.changes || [])) {
      if (ch.field !== 'leadgen' || !ch.value?.leadgen_id) continue;
      if (!token) { console.error('[meta] META_PAGE_TOKEN ausente — lead recebido e NÃO gravado:', ch.value.leadgen_id); continue; }
      try {
        const bruto = await buscarLead(ch.value.leadgen_id);
        await gravarLead(bruto);
      } catch (err) {
        console.error('[meta] falha ao processar lead', ch.value.leadgen_id, err.message);
      }
    }
  }
});

// 3) Diagnóstico: diz o que falta configurar, sem revelar nenhum segredo.
rotasMetaLeads.get('/publico/meta/estado', (req, res) => {
  const c = cfg();
  res.json({
    verificacao: !!c.verify, assinatura: !!c.segredo, token: !!c.token,
    formularios: Object.keys(formulariosConfigurados()).length,
    pronto: !!(c.verify && c.segredo && c.token),
  });
});
