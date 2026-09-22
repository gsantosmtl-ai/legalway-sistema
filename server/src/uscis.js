// Acompanhamento de casos no USCIS pela API oficial (Case Status API, developer.uscis.gov).
// Cada processo protocolado guarda o número do recibo (13 caracteres, ex.: IOE0912345678). O servidor
// consulta uma vez por dia (e quando alguém clica "Consultar agora"), grava o status no processo e
// avisa a equipe quando muda. Sem as chaves configuradas, tudo continua funcionando — só a consulta
// automática fica desligada (a tela mostra isso).
//
// Variáveis de ambiente (Railway → Variables):
//   USCIS_CLIENT_ID, USCIS_CLIENT_SECRET  — do app criado em developer.uscis.gov
//   USCIS_AMBIENTE                        — 'sandbox' (padrão, dados de teste) ou 'producao'
//   USCIS_DEMO_ID                         — só durante a demo de acesso à produção (header demo_id exigido pelo USCIS)
import { Router } from 'express';
import { ler, gravar } from './armazenamento.js';
import { avisarCanal, avisarPessoa } from './chat.js';
import { obterRegras } from './regras.js';
import { exigirLogin } from './auth.js';
import { podeGravar } from './permissoes.js';
import { novoPrazo, diasPadraoDoTipo } from './prazos.js';

const K_PROCESSOS = 'legalway-processos-documentacao-v1';
const K_TAREFAS = 'legalway-tarefas-v1';
const K_USCIS = 'legalway-uscis-v1'; // { ultimaVarredura: 'YYYY-MM-DD', ultimoErro: '' }
const QUEM = 'automação';
export const RE_RECIBO = /^[A-Z]{3}\d{10}$/;

const BASES = { sandbox: 'https://api-int.uscis.gov', producao: 'https://api.uscis.gov' };
const cfg = () => {
  const ambiente = process.env.USCIS_AMBIENTE === 'producao' ? 'producao' : 'sandbox';
  return { id: process.env.USCIS_CLIENT_ID || '', secret: process.env.USCIS_CLIENT_SECRET || '', ambiente, base: process.env.USCIS_BASE_URL || BASES[ambiente] };
};
export const uscisConfigurado = () => { const c = cfg(); return !!(c.id && c.secret); };

// ---- token OAuth2 (client credentials), com cache até quase expirar ----
let token = null, tokenExpira = 0;
async function obterToken() {
  const c = cfg();
  if (!c.id || !c.secret) throw new Error('USCIS não configurado (USCIS_CLIENT_ID / USCIS_CLIENT_SECRET).');
  if (token && Date.now() < tokenExpira - 60_000) return token;
  const r = await fetch(`${c.base}/oauth/accesstoken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c.id, client_secret: c.secret }).toString(),
  });
  const txt = await r.text();
  let j = {}; try { j = JSON.parse(txt); } catch {}
  if (!r.ok || !j.access_token) throw new Error(`USCIS não aceitou as chaves (HTTP ${r.status}): ${(j.error_description || j.error || txt || '').slice(0, 200)}`);
  token = j.access_token;
  tokenExpira = Date.now() + (Number(j.expires_in) || 3600) * 1000;
  return token;
}

// ---- consulta de um recibo; devolve um objeto no nosso formato ----
export async function consultarRecibo(recibo) {
  recibo = String(recibo || '').trim().toUpperCase();
  if (!RE_RECIBO.test(recibo)) throw new Error('Recibo inválido: use 3 letras + 10 números (ex.: IOE0912345678).');
  const c = cfg();
  const t = await obterToken();
  const headers = { Authorization: `Bearer ${t}`, Accept: 'application/json' };
  if (process.env.USCIS_DEMO_ID) headers.demo_id = process.env.USCIS_DEMO_ID; // exigido pelo USCIS durante a demo de produção
  const r = await fetch(`${c.base}/case-status/${recibo}`, { headers });
  const txt = await r.text();
  let j = {}; try { j = JSON.parse(txt); } catch {}
  if (r.status === 401) { token = null; throw new Error('USCIS recusou o token; tente de novo.'); }
  if (r.status === 404) throw new Error('O USCIS não encontrou esse recibo.');
  if (!r.ok) throw new Error(`USCIS respondeu HTTP ${r.status}: ${(j.message || txt || '').slice(0, 200)}`);
  const cs = j.case_status || j.caseStatus || j;
  if (!cs || (!cs.current_case_status_text_en && !cs.currentCaseStatusTextEn)) throw new Error('Resposta do USCIS sem status' + (j.message ? ': ' + String(j.message).slice(0, 200) : '.'));
  const hist = (cs.hist_case_status || cs.histCaseStatus || []).map(h => ({
    data: h.date || h.completed_date || '', texto: h.completed_text_en || h.completedTextEn || '',
  }));
  return {
    recibo, ambiente: c.ambiente,
    formulario: cs.formType || cs.form_type || '',
    status: cs.current_case_status_text_en || cs.currentCaseStatusTextEn || '',
    descricao: cs.current_case_status_desc_en || cs.currentCaseStatusDescEn || '',
    atualizadoEm: cs.modifiedDate || cs.modified_date || '',
    protocoladoEm: cs.submittedDate || cs.submitted_date || '',
    historico: hist,
    consultadoEm: new Date().toISOString(),
  };
}

// Status que pedem ação da equipe → tarefa automática pro responsável (ou pra quem cuida da documentação)
const ACAO = [
  [/request for evidence|rfe/i, 'RFE recebido — preparar resposta ao USCIS'],
  [/intent to deny|noid/i, 'Aviso de intenção de negar (NOID) — resposta urgente'],
  [/fingerprint|biometric/i, 'Biometria agendada — avisar o cliente'],
  [/interview/i, 'Entrevista agendada — preparar o cliente'],
  [/denied|rejected/i, 'Caso negado/rejeitado — avaliar próximos passos com o cliente'],
];

function aplicarResultado(p, res) {
  const anterior = p.uscis && p.uscis.status;
  const mudou = !!res.status && res.status !== anterior;
  p.uscis = { ...(p.uscis || {}), ...res, erro: null, mudouEm: mudou ? new Date().toISOString() : (p.uscis && p.uscis.mudouEm) || null };
  if (mudou) {
    p.historico = p.historico || [];
    p.historico.push({ quando: new Date().toISOString(), texto: `USCIS: ${res.status}${anterior ? ` (antes: ${anterior})` : ''}` });
  }
  return mudou;
}

// RFE e NOID têm prazo de resposta — o sistema cria o prazo sozinho com a contagem do escritório
async function prazoDeResposta(p) {
  const s = (p.uscis.status + ' ' + (p.uscis.descricao || '')).toLowerCase();
  const tipo = /intent to deny|noid/.test(s) ? 'Resposta ao NOID' : (/request for evidence|rfe/.test(s) ? 'Resposta ao RFE' : null);
  if (!tipo) return false;
  const dias = await diasPadraoDoTipo(tipo);
  const base = p.uscis.atualizadoEm && !isNaN(new Date(p.uscis.atualizadoEm)) ? new Date(p.uscis.atualizadoEm) : new Date();
  const data = new Date(base.getTime() + (dias || 87) * 864e5).toISOString().slice(0, 10);
  return !!novoPrazo(p, tipo, data, 'Prazo contado a partir da data da carta do USCIS — confira a data exata no documento.', 'Sistema (USCIS)');
}

async function avisarMudanca(p, tarefas) {
  const R = await obterRegras();
  const canal = ((R.chat && R.chat.canais) || []).some(c => c.key === 'documentacao') ? 'documentacao' : (((R.chat && R.chat.canais) || [])[0] || {}).key || 'documentacao';
  const linha = `📬 USCIS atualizou o caso de ${p.clienteNome} (${p.uscis.recibo}): ${p.uscis.status}. Veja em Documentação → Protocolo.`;
  avisarCanal(canal, linha).catch(() => {});
  if (p.responsavel) avisarPessoa(p.responsavel, linha).catch(() => {});
  await prazoDeResposta(p);
  const acao = ACAO.find(([re]) => re.test(p.uscis.status + ' ' + (p.uscis.descricao || '')));
  if (acao && !tarefas.some(t => t.processoId === p.id && t.origem === 'uscis' && t.status !== 'Concluída' && t.titulo.startsWith(acao[1].split(' — ')[0]))) {
    const prazo = new Date(); prazo.setDate(prazo.getDate() + 3);
    tarefas.unshift({
      id: 'tf' + Date.now() + Math.floor(Math.random() * 1000), titulo: `${acao[1]} — ${p.clienteNome}`,
      descricao: `Status no USCIS: ${p.uscis.status}\n${p.uscis.descricao || ''}`.trim(),
      responsavel: p.responsavel || '', prioridade: 'Alta', prazo: prazo.toISOString().slice(0, 10),
      vinculo: p.clienteNome, clienteId: p.clienteId || null, processoId: p.id, origem: 'uscis',
      status: 'A fazer', criadoEm: new Date().toISOString(), concluidaEm: null, criadoPor: 'Sistema (USCIS)', historico: [],
    });
    return true;
  }
  return false;
}

async function bloco(chave, padrao) { const r = await ler(chave); return { valor: r ? r.valor : padrao, versao: r ? r.versao : null }; }

// Consulta um processo (usado pelo botão "Consultar agora")
export async function consultarProcesso(processoId) {
  const { valor: processos, versao } = await bloco(K_PROCESSOS, []);
  const p = processos.find(x => x.id === processoId);
  if (!p) throw new Error('Processo não encontrado.');
  const recibo = p.protocolo && p.protocolo.recibo;
  if (!recibo) throw new Error('Esse processo ainda não tem o número do recibo do USCIS.');
  let mudou = false, tarefa = false;
  try {
    const res = await consultarRecibo(recibo);
    mudou = aplicarResultado(p, res);
  } catch (e) {
    p.uscis = { ...(p.uscis || {}), recibo, erro: e.message, consultadoEm: new Date().toISOString() };
    await gravar(K_PROCESSOS, processos, versao, QUEM);
    throw e;
  }
  const { valor: tarefas, versao: vT } = await bloco(K_TAREFAS, []);
  if (mudou) tarefa = await avisarMudanca(p, tarefas);
  await gravar(K_PROCESSOS, processos, versao, QUEM);
  if (tarefa) await gravar(K_TAREFAS, tarefas, vT, QUEM);
  return { uscis: p.uscis, mudou, tarefa };
}

// Varredura diária de todos os processos com recibo (chamada pelas automações)
export async function varrerUscis(log) {
  if (!uscisConfigurado()) return;
  const hoje = new Date().toISOString().slice(0, 10);
  const { valor: estado, versao: vE } = await bloco(K_USCIS, {});
  if (estado.ultimaVarredura === hoje) return;
  const { valor: processos, versao } = await bloco(K_PROCESSOS, []);
  const alvo = processos.filter(p => p.protocolo && p.protocolo.recibo && RE_RECIBO.test(p.protocolo.recibo) && p.status !== 'Cancelado' && !(p.uscis && /approved|denied|closed/i.test(p.uscis.status || '') && p.uscis.consultadoEm && (Date.now() - new Date(p.uscis.consultadoEm)) < 30 * 864e5));
  if (!alvo.length) { await gravar(K_USCIS, { ...estado, ultimaVarredura: hoje }, vE, QUEM); return; }
  const { valor: tarefas, versao: vT } = await bloco(K_TAREFAS, []);
  let mudaram = 0, erros = 0, novasTarefas = 0;
  for (const p of alvo) {
    try {
      const res = await consultarRecibo(p.protocolo.recibo);
      if (aplicarResultado(p, res)) { mudaram++; if (await avisarMudanca(p, tarefas)) novasTarefas++; }
    } catch (e) { erros++; p.uscis = { ...(p.uscis || {}), recibo: p.protocolo.recibo, erro: e.message, consultadoEm: new Date().toISOString() }; }
    await new Promise(r => setTimeout(r, 400)); // gentileza com a API
  }
  await gravar(K_PROCESSOS, processos, versao, QUEM);
  if (novasTarefas) await gravar(K_TAREFAS, tarefas, vT, QUEM);
  await gravar(K_USCIS, { ...estado, ultimaVarredura: hoje, ultimoErro: erros ? `${erros} consulta(s) falharam` : '' }, vE, QUEM);
  log.push(`USCIS: ${alvo.length} caso(s) consultado(s), ${mudaram} mudou(aram)${erros ? `, ${erros} erro(s)` : ''}${novasTarefas ? `, ${novasTarefas} tarefa(s) criada(s)` : ''}`);
}

// ---- rotas ----
export const rotasUscis = Router();
rotasUscis.get('/uscis/estado', exigirLogin, async (req, res) => {
  const r = await ler(K_USCIS);
  res.json({ configurado: uscisConfigurado(), ambiente: cfg().ambiente, ultimaVarredura: r ? r.valor.ultimaVarredura || null : null, ultimoErro: r ? r.valor.ultimoErro || '' : '' });
});
rotasUscis.post('/uscis/consultar/:processoId', exigirLogin, async (req, res) => {
  if (!podeGravar(req.usuario, K_PROCESSOS)) return res.status(403).json({ erro: 'Sem permissão em Documentação.' });
  if (!uscisConfigurado()) return res.status(409).json({ erro: 'Consulta ao USCIS não configurada. Um administrador precisa colocar as chaves da API (USCIS_CLIENT_ID / USCIS_CLIENT_SECRET) no servidor.' });
  try { res.json(await consultarProcesso(String(req.params.processoId))); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});
// Diagnóstico (só administrador): testa as chaves e, se vier ?recibo=, consulta um caso sem gravar nada.
rotasUscis.get('/uscis/testar', exigirLogin, async (req, res) => {
  if (!req.usuario.acesso_total) return res.status(403).json({ erro: 'Só administradores.' });
  if (!uscisConfigurado()) return res.status(409).json({ erro: 'USCIS não configurado.' });
  try {
    await obterToken();
    const recibo = String(req.query.recibo || '').trim().toUpperCase();
    if (!recibo) return res.json({ ok: true, ambiente: cfg().ambiente, token: 'ok' });
    res.json({ ok: true, ambiente: cfg().ambiente, token: 'ok', caso: await consultarRecibo(recibo) });
  } catch (e) { res.status(400).json({ ok: false, ambiente: cfg().ambiente, erro: e.message }); }
});
