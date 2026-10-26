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
import { avisarClienteUscis } from './avisos-cliente.js';
import { recibosConsultaveis, rotuloDoRecibo, RE_RECIBO as RE } from './recibos.js';

const K_PROCESSOS = 'legalway-processos-documentacao-v1';
const K_TAREFAS = 'legalway-tarefas-v1';
const K_USCIS = 'legalway-uscis-v1'; // { ultimaVarredura: 'YYYY-MM-DD', ultimoErro: '' }
const QUEM = 'automação';
export const RE_RECIBO = RE;   // a regra mora em recibos.js; aqui só se reexporta

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
// O USCIS devolve erro no formato RFC-9457: { errors: [{ code, message, category, reference, status, traceId }] }.
// A mensagem fica dentro de errors[0], não num campo "message" solto — e eles exigem, na demo de
// produção, que essa mensagem apareça pro usuário. Lendo só j.message a tela mostraria o JSON cru.
export function mensagemDoErro(j) {
  const e = j && Array.isArray(j.errors) && j.errors.length ? j.errors[0] : null;
  if (e && e.message) return String(e.message).slice(0, 300) + (e.code ? ` (${e.code})` : '');
  if (j && j.message) return String(j.message).slice(0, 300);
  return '';
}
const sufixoErro = (j) => { const m = mensagemDoErro(j); return m ? ` O USCIS respondeu: “${m}”` : ''; };

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
  if (r.status === 401) { token = null; throw new Error('USCIS recusou o token; tente de novo.' + sufixoErro(j)); }
  if (r.status === 404) throw new Error('O USCIS não encontrou esse recibo.' + sufixoErro(j));
  if (!r.ok) throw new Error(`USCIS respondeu HTTP ${r.status}: ${mensagemDoErro(j) || (txt || '').slice(0, 200)}`);
  const cs = j.case_status || j.caseStatus || j;
  if (!cs || (!cs.current_case_status_text_en && !cs.currentCaseStatusTextEn)) throw new Error('Resposta do USCIS sem status' + (mensagemDoErro(j) ? ': ' + mensagemDoErro(j) : '.'));
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

// O topo de `p.uscis` continua sendo o caso PRINCIPAL (o primeiro recibo),
// porque quinze pontos entre telas, avisos e portal do cliente leem de lá e
// esperam UM status. Os demais ficam em `p.uscis.casos`, um por recibo.
function espelharPrincipal(p) {
  const c = (p.uscis.casos || [])[0];
  if (!c) return;
  for (const k of ['recibo', 'form', 'formulario', 'status', 'descricao', 'atualizadoEm',
                   'protocoladoEm', 'historico', 'consultadoEm', 'statusAnterior', 'mudouEm',
                   'erro', 'ambiente']) {
    p.uscis[k] = c[k] === undefined ? null : c[k];
  }
}

/** Guarda o resultado de UM recibo. Devolve o caso quando o status mudou. */
function aplicarResultado(p, res, item) {
  p.uscis = (p.uscis && typeof p.uscis === 'object') ? p.uscis : {};
  const casos = Array.isArray(p.uscis.casos) ? p.uscis.casos : [];
  const i = casos.findIndex((c) => c && c.recibo === item.numero);
  const antes = i >= 0 ? casos[i].status : null;
  const mudou = !!res.status && res.status !== antes;
  // `form` é o rótulo que a pessoa escolheu; `formulario` é o que o USCIS
  // respondeu. Os dois ficam: quando discordam, é sinal de número trocado.
  const caso = { ...(i >= 0 ? casos[i] : {}), ...res, recibo: item.numero,
    form: item.form || (i >= 0 ? casos[i].form : '') || '',
    statusAnterior: antes || null, erro: null,
    mudouEm: mudou ? new Date().toISOString() : (i >= 0 ? casos[i].mudouEm : null) || null };
  if (i >= 0) casos[i] = caso; else casos.push(caso);
  p.uscis.casos = casos;
  espelharPrincipal(p);
  if (mudou) {
    p.historico = Array.isArray(p.historico) ? p.historico : [];
    p.historico.push({ quando: new Date().toISOString(),
      texto: `USCIS ${rotuloDoRecibo(item)}: ${res.status}${antes ? ` (antes: ${antes})` : ''}` });
  }
  return mudou ? caso : null;
}

/** Erro de consulta de UM recibo, sem derrubar os outros do mesmo processo. */
function aplicarErro(p, item, mensagem) {
  p.uscis = (p.uscis && typeof p.uscis === 'object') ? p.uscis : {};
  const casos = Array.isArray(p.uscis.casos) ? p.uscis.casos : [];
  const i = casos.findIndex((c) => c && c.recibo === item.numero);
  const caso = { ...(i >= 0 ? casos[i] : {}), recibo: item.numero, form: item.form || '',
    erro: mensagem, consultadoEm: new Date().toISOString() };
  if (i >= 0) casos[i] = caso; else casos.push(caso);
  p.uscis.casos = casos;
  espelharPrincipal(p);
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

// `caso` é o recibo que mudou — não o principal. Num processo com I-914 e
// I-765, dizer sempre o principal faria o aviso apontar para o número errado.
async function avisarMudanca(p, tarefas, caso) {
  const u = caso || p.uscis;
  const R = await obterRegras();
  const canal = ((R.chat && R.chat.canais) || []).some(c => c.key === 'documentacao') ? 'documentacao' : (((R.chat && R.chat.canais) || [])[0] || {}).key || 'documentacao';
  const linha = `📬 USCIS atualizou o caso de ${p.clienteNome} (${rotuloDoRecibo(u)}): ${u.status}. Veja em Documentação → Protocolo.`;
  avisarCanal(canal, linha).catch(() => {});
  if (p.responsavel) avisarPessoa(p.responsavel, linha).catch(() => {});
  await prazoDeResposta(p);
  await avisarClienteUscis(p, u.statusAnterior).catch(() => {});
  const acao = ACAO.find(([re]) => re.test(u.status + ' ' + (u.descricao || '')));
  if (acao && !tarefas.some(t => t.processoId === p.id && t.origem === 'uscis' && t.status !== 'Concluída' && t.titulo.startsWith(acao[1].split(' — ')[0]))) {
    const prazo = new Date(); prazo.setDate(prazo.getDate() + 3);
    tarefas.unshift({
      id: 'tf' + Date.now() + Math.floor(Math.random() * 1000), titulo: `${acao[1]} — ${p.clienteNome}`,
      descricao: `Status no USCIS (${rotuloDoRecibo(u)}): ${u.status}\n${u.descricao || ''}`.trim(),
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
  const itens = recibosConsultaveis(p);
  if (!itens.length) throw new Error('Esse processo ainda não tem nenhum número de recibo do USCIS.');
  // Um processo pode ter vários números (I-914 e I-765, por exemplo). Cada um
  // é um caso separado no USCIS, com andamento próprio — então consulta-se
  // todos, e um que falhe não impede os outros.
  const mudaram = [];
  const erros = [];
  for (const item of itens) {
    try {
      const caso = aplicarResultado(p, await consultarRecibo(item.numero), item);
      if (caso) mudaram.push(caso);
    } catch (e) {
      aplicarErro(p, item, e.message);
      erros.push(`${rotuloDoRecibo(item)}: ${e.message}`);
    }
    if (itens.length > 1) await new Promise((r) => setTimeout(r, 400));
  }
  const { valor: tarefas, versao: vT } = await bloco(K_TAREFAS, []);
  let tarefa = false;
  for (const caso of mudaram) if (await avisarMudanca(p, tarefas, caso)) tarefa = true;
  await gravar(K_PROCESSOS, processos, versao, QUEM);
  if (tarefa) await gravar(K_TAREFAS, tarefas, vT, QUEM);
  // Só é erro de verdade quando NENHUM dos números respondeu: com um de dois
  // funcionando, a tela precisa mostrar o que deu certo.
  if (erros.length === itens.length) throw new Error(erros.join(' · '));
  return { uscis: p.uscis, casos: p.uscis.casos || [], mudou: mudaram.length > 0, tarefa,
    erros: erros.length ? erros : null };
}

// Varredura diária de todos os processos com recibo (chamada pelas automações)
export async function varrerUscis(log) {
  if (!uscisConfigurado()) return;
  const hoje = new Date().toISOString().slice(0, 10);
  const { valor: estado, versao: vE } = await bloco(K_USCIS, {});
  if (estado.ultimaVarredura === hoje) return;
  const { valor: processos, versao } = await bloco(K_PROCESSOS, []);
  const alvo = processos.filter(p => recibosConsultaveis(p).length && p.status !== 'Cancelado' && !(p.uscis && /approved|denied|closed/i.test(p.uscis.status || '') && p.uscis.consultadoEm && (Date.now() - new Date(p.uscis.consultadoEm)) < 30 * 864e5));
  if (!alvo.length) { await gravar(K_USCIS, { ...estado, ultimaVarredura: hoje }, vE, QUEM); return; }
  const { valor: tarefas, versao: vT } = await bloco(K_TAREFAS, []);
  let mudaram = 0, erros = 0, novasTarefas = 0;
  let numeros = 0;
  for (const p of alvo) {
    // Cada NÚMERO é uma consulta. Um processo com I-914 e I-765 são dois casos
    // no USCIS, e o que avisa o escritório é cada um deles mudando.
    for (const item of recibosConsultaveis(p)) {
      numeros++;
      try {
        const caso = aplicarResultado(p, await consultarRecibo(item.numero), item);
        if (caso) { mudaram++; if (await avisarMudanca(p, tarefas, caso)) novasTarefas++; }
      } catch (e) { erros++; aplicarErro(p, item, e.message); }
      await new Promise(r => setTimeout(r, 400)); // gentileza com a API
    }
  }
  await gravar(K_PROCESSOS, processos, versao, QUEM);
  if (novasTarefas) await gravar(K_TAREFAS, tarefas, vT, QUEM);
  await gravar(K_USCIS, { ...estado, ultimaVarredura: hoje, ultimoErro: erros ? `${erros} consulta(s) falharam` : '' }, vE, QUEM);
  log.push(`USCIS: ${numeros} número(s) de ${alvo.length} processo(s) consultado(s), ${mudaram} mudou(aram)${erros ? `, ${erros} erro(s)` : ''}${novasTarefas ? `, ${novasTarefas} tarefa(s) criada(s)` : ''}`);
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
