// Portal do cliente: o cliente entra com e-mail e senha (temporária na primeira vez) e vê só o
// processo dele — etapa, checklist com o que falta, status no USCIS e parcelas. Também anexa os
// documentos por ali, e cada envio vira histórico no processo + aviso no chat da equipe.
// O que o cliente pode ver é regra do escritório (Configurações → Regras → Portal do cliente).
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { query } from './db.js';
import { ler, gravar } from './armazenamento.js';
import { salvarDataUri } from './arquivos.js';
import { avisarCanal, avisarPessoa } from './chat.js';
import { obterRegras } from './regras.js';
import { exigirLogin } from './auth.js';
import { podeGravar } from './permissoes.js';
import { limparTexto } from './sanitizar.js';

const COOKIE = 'lw_cliente';
const K_PROCESSOS = 'legalway-processos-documentacao-v1';
const K_FINANCEIRO = 'legalway-financeiro-v1';
const DIAS_SESSAO = 30;
const hashToken = (t) => createHash('sha256').update(t).digest('hex');
const uid = (p) => p + Date.now().toString(36) + randomBytes(3).toString('hex');

// senha temporária fácil de ditar por telefone (sem caracteres ambíguos)
export function senhaTemporaria() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ', num = '23456789';
  const pega = (s, n) => Array.from({ length: n }, () => s[randomBytes(1)[0] % s.length]).join('');
  return `${pega(abc, 4)}-${pega(num, 4)}`;
}

// ---- limite de tentativas de login (por IP + e-mail) ----
const tentativas = new Map();
function limiteAtingido(chave) {
  const t = tentativas.get(chave);
  if (!t) return false;
  if (Date.now() - t.quando > 10 * 60_000) { tentativas.delete(chave); return false; }
  return t.n >= 6;
}
function registrarFalha(chave) {
  const t = tentativas.get(chave);
  tentativas.set(chave, { n: (t && Date.now() - t.quando < 10 * 60_000 ? t.n : 0) + 1, quando: Date.now() });
}

async function criarSessao(res, cliente, req) {
  const token = randomBytes(32).toString('hex');
  await query(
    `INSERT INTO sessoes_portal (token_hash, cliente_id, expira_em, ip) VALUES ($1,$2, now() + ($3||' days')::interval, $4)`,
    [hashToken(token), cliente.id, String(DIAS_SESSAO), req.ip]
  );
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: !!req.secure, path: '/', maxAge: DIAS_SESSAO * 864e5 });
}

async function clienteDaSessao(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const { rows } = await query(
    `SELECT c.* FROM sessoes_portal s JOIN portal_clientes c ON c.id = s.cliente_id
     WHERE s.token_hash = $1 AND s.expira_em > now() AND c.ativo = true`, [hashToken(token)]
  );
  if (!rows[0]) return null;
  query(`UPDATE sessoes_portal SET ultimo_acesso = now() WHERE token_hash = $1 AND ultimo_acesso < now() - interval '1 minute'`, [hashToken(token)]).catch(() => {});
  query(`UPDATE portal_clientes SET ultimo_acesso = now() WHERE id = $1 AND (ultimo_acesso IS NULL OR ultimo_acesso < now() - interval '5 minutes')`, [rows[0].id]).catch(() => {});
  return rows[0];
}
async function exigirCliente(req, res, next) {
  try {
    const c = await clienteDaSessao(req);
    if (!c) return res.status(401).json({ erro: 'Sessão expirada. Entre de novo.' });
    req.cliente = c; next();
  } catch (e) { next(e); }
}

async function bloco(chave, padrao = []) { const r = await ler(chave); return { valor: r ? r.valor : padrao, versao: r ? r.versao : null }; }

// Etapas que o cliente vê (linguagem simples), a partir do status interno do processo
const ETAPAS_CLIENTE = [
  { chave: 'documentos', nome: 'Reunindo documentos', quando: ['Aguardando boas-vindas', 'Documentos solicitados', 'Recebendo documentos'] },
  { chave: 'revisao', nome: 'Em revisão pelo escritório', quando: ['Documentação completa', 'Aguardando autorização financeira', 'Liberado para protocolo'] },
  { chave: 'protocolado', nome: 'Protocolado no USCIS', quando: ['Protocolado'] },
  { chave: 'acompanhamento', nome: 'Acompanhamento', quando: ['Em acompanhamento'] },
];

function visaoDoProcesso(p, R, contas) {
  const P = R.portal || {};
  const etapaAtual = ETAPAS_CLIENTE.findIndex(e => e.quando.includes(p.status));
  const checklist = (p.checklist || []).map((d, i) => ({
    indice: i, nome: d.nome, dica: d.dica || '', status: d.status || 'Não solicitado',
    temArquivo: !!d.arquivo, arquivoNome: d.arquivo ? (d.arquivo.nome || 'arquivo') : null,
    podeEnviar: ['Não solicitado', 'Solicitado', 'Incorreto', 'Recebido'].includes(d.status || 'Não solicitado'),
  }));
  const visao = {
    nome: p.clienteNome, servico: p.servico, responsavel: p.responsavel || '',
    etapas: ETAPAS_CLIENTE.map((e, i) => ({ nome: e.nome, feita: etapaAtual >= 0 && i < etapaAtual, atual: i === etapaAtual })),
    statusInterno: p.status,
    checklist,
    resumo: {
      total: checklist.length,
      aprovados: checklist.filter(d => d.status === 'Aprovado').length,
      pendentes: checklist.filter(d => !d.arquivo && d.status !== 'Aprovado').length,
      refazer: checklist.filter(d => d.status === 'Incorreto').length,
    },
  };
  if (P.mostrarUscis !== false && p.protocolo) {
    visao.protocolo = { numero: p.protocolo.numero || '', data: p.protocolo.data || '', recibo: p.protocolo.recibo || '' };
    if (p.uscis && p.uscis.status) visao.uscis = { status: p.uscis.status, descricao: p.uscis.descricao || '', atualizadoEm: p.uscis.atualizadoEm || '', consultadoEm: p.uscis.consultadoEm || '', historico: (p.uscis.historico || []).slice(0, 10) };
  }
  visao.avisos = (p.avisosCliente || []).slice(0, 10).map(a => ({ titulo: a.titulo, texto: a.texto, quando: a.quando, tipo: a.tipo }));
  if (P.mostrarFinanceiro !== false) {
    const minhas = contas.filter(c => (p.contratoId && c.contratoId === p.contratoId) || (!p.contratoId && c.clienteNome === p.clienteNome));
    visao.pagamentos = {
      parcelas: minhas.map(c => ({ descricao: c.descricao, vencimento: c.vencimento, valor: Number(c.valor || 0), status: c.status, recebidoEm: c.dataRecebimento || null })).sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || '')),
      pago: minhas.reduce((s, c) => s + Number(c.valorRecebido || 0), 0),
      total: minhas.reduce((s, c) => s + Number(c.valor || 0), 0),
    };
  }
  return visao;
}

export const rotasPortalCliente = Router();

// ---- rotas do cliente (sem login do sistema) ----
rotasPortalCliente.post('/portal/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    if (!email || !senha) return res.status(400).json({ erro: 'Preencha e-mail e senha.' });
    const chave = `${req.ip}|${email}`;
    if (limiteAtingido(chave)) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 10 minutos e tente de novo.' });
    const { rows } = await query('SELECT * FROM portal_clientes WHERE email = $1', [email]);
    const c = rows[0];
    const ok = c && c.ativo && await bcrypt.compare(senha, c.senha_hash);
    if (!ok) { registrarFalha(chave); return res.status(401).json({ erro: 'E-mail ou senha incorretos.' }); }
    tentativas.delete(chave);
    await criarSessao(res, c, req);
    res.json({ ok: true, nome: c.nome, trocarSenha: c.trocar_senha });
  } catch (e) { next(e); }
});

rotasPortalCliente.post('/portal/logout', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) await query('DELETE FROM sessoes_portal WHERE token_hash = $1', [hashToken(token)]).catch(() => {});
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

rotasPortalCliente.post('/portal/senha', exigirCliente, async (req, res, next) => {
  try {
    const atual = String(req.body?.senhaAtual || ''), nova = String(req.body?.senhaNova || '');
    if (nova.length < 8) return res.status(400).json({ erro: 'A senha nova precisa ter pelo menos 8 caracteres.' });
    if (!(await bcrypt.compare(atual, req.cliente.senha_hash))) return res.status(401).json({ erro: 'Senha atual incorreta.' });
    if (atual === nova) return res.status(400).json({ erro: 'A senha nova precisa ser diferente da atual.' });
    await query('UPDATE portal_clientes SET senha_hash = $1, trocar_senha = false WHERE id = $2', [await bcrypt.hash(nova, 10), req.cliente.id]);
    await query('DELETE FROM sessoes_portal WHERE cliente_id = $1 AND token_hash <> $2', [req.cliente.id, hashToken(req.cookies[COOKIE])]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rotasPortalCliente.get('/portal/eu', exigirCliente, async (req, res, next) => {
  try {
    const R = await obterRegras();
    if (R.portal && R.portal.ativo === false) return res.status(403).json({ erro: 'O portal está desativado no momento. Fale com o escritório.' });
    const { valor: processos } = await bloco(K_PROCESSOS);
    const p = processos.find(x => x.id === req.cliente.processo_id);
    if (!p) return res.status(404).json({ erro: 'Não encontramos seu processo. Fale com o escritório.' });
    const { valor: contas } = await bloco(K_FINANCEIRO);
    res.json({
      cliente: { nome: req.cliente.nome, email: req.cliente.email, trocarSenha: req.cliente.trocar_senha },
      empresa: R.empresa, portal: { ...(R.portal || {}) },
      processo: visaoDoProcesso(p, R, contas),
    });
  } catch (e) { next(e); }
});

rotasPortalCliente.post('/portal/documento', exigirCliente, async (req, res, next) => {
  try {
    const R = await obterRegras();
    if (R.portal && (R.portal.ativo === false || R.portal.permitirEnvio === false)) return res.status(403).json({ erro: 'O envio de documentos está desativado. Fale com o escritório.' });
    const indice = Number(req.body?.indice);
    const nomeArquivo = String(req.body?.nome || 'documento').slice(0, 120);
    const dataUri = String(req.body?.arquivo || '');
    if (!dataUri.startsWith('data:')) return res.status(400).json({ erro: 'Arquivo inválido.' });
    const { valor: processos, versao } = await bloco(K_PROCESSOS);
    const p = processos.find(x => x.id === req.cliente.processo_id);
    if (!p) return res.status(404).json({ erro: 'Processo não encontrado.' });
    const doc = (p.checklist || [])[indice];
    if (!doc) return res.status(400).json({ erro: 'Documento não encontrado no seu checklist.' });
    if (doc.status === 'Aprovado') return res.status(409).json({ erro: 'Esse documento já foi aprovado pelo escritório.' });
    const link = await salvarDataUri(dataUri, nomeArquivo, 'portal:' + req.cliente.email);
    if (!link) return res.status(400).json({ erro: 'Não foi possível ler o arquivo.' });
    doc.arquivo = { nome: nomeArquivo, url: link, enviadoEm: new Date().toISOString(), enviadoPor: 'cliente' };
    doc.status = 'Recebido';
    p.historico = p.historico || [];
    p.historico.push({ quando: new Date().toISOString(), texto: `Cliente enviou pelo portal: ${doc.nome} (${nomeArquivo})` });
    if (p.semRetorno) { p.semRetorno = false; p.semRetornoDesde = null; }
    await gravar(K_PROCESSOS, processos, versao, 'portal do cliente');
    const aviso = `📎 ${p.clienteNome} enviou "${doc.nome}" pelo portal do cliente. Veja em Documentação → Checklist.`;
    avisarCanal('documentacao', aviso).catch(() => {});
    if (p.responsavel) avisarPessoa(p.responsavel, aviso).catch(() => {});
    res.json({ ok: true, status: doc.status });
  } catch (e) {
    if (e.status === 413 || e.status === 415) return res.status(e.status).json({ erro: e.message });
    next(e);
  }
});

// ---- rotas da equipe (gerenciar o acesso do cliente) ----
const podeGerenciar = (req) => podeGravar(req.usuario, K_PROCESSOS);

rotasPortalCliente.get('/portal-acessos/:processoId', exigirLogin, async (req, res, next) => {
  try {
    if (!podeGerenciar(req)) return res.status(403).json({ erro: 'Sem permissão em Documentação.' });
    const { rows } = await query('SELECT id, nome, email, ativo, trocar_senha, criado_em, ultimo_acesso FROM portal_clientes WHERE processo_id = $1', [String(req.params.processoId)]);
    res.json({ acesso: rows[0] || null });
  } catch (e) { next(e); }
});

rotasPortalCliente.post('/portal-acessos/:processoId', exigirLogin, async (req, res, next) => {
  try {
    if (!podeGerenciar(req)) return res.status(403).json({ erro: 'Sem permissão em Documentação.' });
    const processoId = String(req.params.processoId);
    const email = String(limparTexto(req.body?.email || '')).trim().toLowerCase();
    const nome = String(limparTexto(req.body?.nome || '')).trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
    const outro = await query('SELECT id FROM portal_clientes WHERE email = $1 AND processo_id <> $2', [email, processoId]);
    if (outro.rows[0]) return res.status(409).json({ erro: 'Esse e-mail já é usado por outro cliente no portal.' });
    const senha = senhaTemporaria();
    const hash = await bcrypt.hash(senha, 10);
    const { rows } = await query('SELECT id FROM portal_clientes WHERE processo_id = $1', [processoId]);
    if (rows[0]) {
      await query('UPDATE portal_clientes SET nome=$1, email=$2, senha_hash=$3, trocar_senha=true, ativo=true WHERE id=$4', [nome || 'Cliente', email, hash, rows[0].id]);
      await query('DELETE FROM sessoes_portal WHERE cliente_id = $1', [rows[0].id]);
    } else {
      await query('INSERT INTO portal_clientes (id, processo_id, nome, email, senha_hash, criado_por) VALUES ($1,$2,$3,$4,$5,$6)',
        [uid('pc'), processoId, nome || 'Cliente', email, hash, req.usuario.nome]);
    }
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, K_PROCESSOS, processoId, 'alterado', `Acesso do cliente ao portal criado/renovado (${email})`]).catch(() => {});
    res.status(201).json({ ok: true, email, senhaTemporaria: senha });
  } catch (e) { next(e); }
});

rotasPortalCliente.post('/portal-acessos/:processoId/ativo', exigirLogin, async (req, res, next) => {
  try {
    if (!podeGerenciar(req)) return res.status(403).json({ erro: 'Sem permissão em Documentação.' });
    const ativo = !!req.body?.ativo;
    await query('UPDATE portal_clientes SET ativo = $1 WHERE processo_id = $2', [ativo, String(req.params.processoId)]);
    if (!ativo) await query('DELETE FROM sessoes_portal WHERE cliente_id IN (SELECT id FROM portal_clientes WHERE processo_id = $1)', [String(req.params.processoId)]);
    res.json({ ok: true, ativo });
  } catch (e) { next(e); }
});
