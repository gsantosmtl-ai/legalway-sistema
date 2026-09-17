// Login, sessão (cookie httpOnly + tabela sessoes) e usuários iniciais
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { query } from './db.js';

export const COOKIE = 'lw_sessao';
const BCRYPT_ROUNDS = 12;
const SESSAO_CURTA_MS = 12 * 60 * 60 * 1000;        // 12h
const SESSAO_LEMBRAR_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

const MODULOS = ['leads','funil','sdr','agenda','contratos','clientes','financeiro','documentos','marketing','relatorios','tarefas','processos','usuarios'];
export const permissoesTotal = () => Object.fromEntries(MODULOS.map(m => [m, 'editar']));

const hashToken = (t) => createHash('sha256').update(t).digest('hex');
export const gerarSenhaTemporaria = () => {
  // 10 caracteres sem ambiguidade (sem 0/O, 1/l/I) — fácil de digitar de um WhatsApp
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, b => alfabeto[b % alfabeto.length]).join('');
};
export const hashSenha = (s) => bcrypt.hash(s, BCRYPT_ROUNDS);

// Objeto de sessão no MESMO formato que login.html gravava no localStorage — as outras telas dependem dele
export function montarSessao(u, extras = {}) {
  return {
    usuarioId: u.id, nome: u.nome, cargo: u.cargo, papel: u.papel,
    acessoTotal: !!u.acesso_total, permissoes: u.permissoes || {},
    trocarSenha: !!u.trocar_senha, ...extras,
  };
}

// ---------- usuários iniciais (só roda se a tabela estiver vazia) ----------
export async function garantirUsuariosIniciais() {
  const { rows } = await query('SELECT count(*)::int AS n FROM usuarios');
  if (rows[0].n > 0) return;
  const semAcesso = () => Object.fromEntries(MODULOS.map(m => [m, 'nenhum']));
  const iniciais = [
    { id:'u1', nome:'Tatiane',  usuario:'tatiane',  cargo:'Sócia — Tráfego e Sistema',         papel:'socio', acessoTotal:true },
    { id:'u2', nome:'Renato',   usuario:'renato',   cargo:'Sócio — Vendas',                    papel:'socio', acessoTotal:true },
    { id:'u3', nome:'Adriano',  usuario:'adriano',  cargo:'Sócio — Vendas',                    papel:'socio', acessoTotal:true },
    { id:'u4', nome:'Vitória',  usuario:'vitoria',  cargo:'Sócia — Documentação/Processos',    papel:'socio', acessoTotal:true },
    { id:'u5', nome:'Elaine',   usuario:'elaine',   cargo:'Documentação',                      papel:'documentacao', acessoTotal:false,
      permissoes:{ ...semAcesso(), agenda:'visualizar', contratos:'visualizar', clientes:'editar', documentos:'editar', relatorios:'visualizar', tarefas:'editar' } },
    { id:'u6', nome:'Peterson', usuario:'peterson', cargo:'Sócio — Financeiro/Contratos',      papel:'socio', acessoTotal:true },
    { id:'u7', nome:'SDR',      usuario:'sdr',      cargo:'SDR',                               papel:'sdr',   acessoTotal:false,
      permissoes:{ ...semAcesso(), leads:'visualizar', sdr:'editar', agenda:'editar', tarefas:'editar' } },
  ];
  const linhas = [];
  for (const u of iniciais) {
    const senha = (u.usuario === 'tatiane' && process.env.SENHA_INICIAL_ADMIN) || gerarSenhaTemporaria();
    await query(
      `INSERT INTO usuarios (id, nome, usuario, senha_hash, cargo, papel, acesso_total, permissoes, trocar_senha)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      [u.id, u.nome, u.usuario, await hashSenha(senha), u.cargo, u.papel, u.acessoTotal, JSON.stringify(u.acessoTotal ? permissoesTotal() : u.permissoes)]
    );
    linhas.push(`  ${u.usuario.padEnd(10)} ${senha}`);
  }
  console.log('\n[usuários] Tabela estava vazia — criados os usuários iniciais com SENHAS TEMPORÁRIAS.');
  console.log('[usuários] Cada pessoa é obrigada a trocar a senha no primeiro login. Guarde esta lista e apague este log depois:');
  console.log(linhas.join('\n') + '\n');
}

// ---------- sessões ----------
async function criarSessao(res, usuario, lembrar, req) {
  const token = randomBytes(32).toString('base64url');
  const duracao = lembrar ? SESSAO_LEMBRAR_MS : SESSAO_CURTA_MS;
  const expira = new Date(Date.now() + duracao);
  await query(
    `INSERT INTO sessoes (token_hash, usuario_id, expira_em, ip, user_agent) VALUES ($1,$2,$3,$4,$5)`,
    [hashToken(token), usuario.id, expira, req.ip, (req.get('user-agent') || '').slice(0, 300)]
  );
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/',
    maxAge: lembrar ? duracao : undefined, // sem maxAge = cookie de sessão do navegador
  });
}

// Devolve o usuário da sessão do cookie (ou null). Usado pelo middleware da API e pela proteção das telas.
export async function buscarSessao(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const { rows } = await query(
    `SELECT u.*, s.token_hash FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token_hash = $1 AND s.expira_em > now() AND u.ativo = true`,
    [hashToken(token)]
  );
  if (!rows[0]) return null;
  // atualiza "último acesso" no máximo uma vez por minuto pra não escrever à toa
  query(`UPDATE sessoes SET ultimo_acesso = now() WHERE token_hash = $1 AND ultimo_acesso < now() - interval '1 minute'`, [rows[0].token_hash]).catch(() => {});
  return rows[0];
}

// Middleware: exige login. Coloca o usuário em req.usuario
export async function exigirLogin(req, res, next) {
  try {
    const u = await buscarSessao(req);
    if (!u) return res.status(401).json({ erro: 'Sessão expirada ou inválida. Faça login de novo.' });
    if (u.trocar_senha && !req.path.startsWith('/senha') && !req.path.startsWith('/sessao') && !req.path.startsWith('/logout')) {
      return res.status(403).json({ erro: 'Você precisa definir uma senha nova antes de continuar.', trocarSenha: true });
    }
    req.usuario = u;
    next();
  } catch (e) { next(e); }
}

// Usado pelo WebSocket, que não passa pelo Express
export async function usuarioDoCookieHeader(cookieHeader) {
  const m = /(?:^|;\s*)lw_sessao=([^;]+)/.exec(cookieHeader || '');
  if (!m) return null;
  return buscarSessao({ cookies: { [COOKIE]: decodeURIComponent(m[1]) } });
}

// ---------- limite de tentativas de login (memória; suficiente pra 1 instância) ----------
const tentativas = new Map(); // chave -> {n, ate}
function limiteAtingido(chave) {
  const t = tentativas.get(chave);
  if (t && t.bloqueadoAte > Date.now()) return true;
  return false;
}
function registrarFalha(chave) {
  const t = tentativas.get(chave) || { n: 0 };
  t.n += 1;
  if (t.n >= 6) { t.bloqueadoAte = Date.now() + 10 * 60 * 1000; t.n = 0; } // 6 erros → 10 min de bloqueio
  tentativas.set(chave, t);
}

// ---------- rotas ----------
export const rotasAuth = Router();

rotasAuth.post('/login', async (req, res, next) => {
  try {
    const usuario = String(req.body?.usuario || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    const lembrar = !!req.body?.lembrar;
    if (!usuario || !senha) return res.status(400).json({ erro: 'Preencha usuário e senha.' });
    const chave = `${req.ip}|${usuario}`;
    if (limiteAtingido(chave)) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 10 minutos e tente de novo.' });

    const { rows } = await query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
    const u = rows[0];
    const ok = u && u.ativo && await bcrypt.compare(senha, u.senha_hash);
    if (!ok) { registrarFalha(chave); return res.status(401).json({ erro: 'Usuário ou senha incorretos.' }); }
    tentativas.delete(chave);
    await criarSessao(res, u, lembrar, req);
    res.json({ sessao: montarSessao(u, { logadoEm: new Date().toISOString(), lembrar }) });
  } catch (e) { next(e); }
});

rotasAuth.post('/logout', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) await query('DELETE FROM sessoes WHERE token_hash = $1', [hashToken(token)]).catch(() => {});
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

rotasAuth.get('/sessao', exigirLogin, (req, res) => {
  res.json({ sessao: montarSessao(req.usuario) });
});

// Trocar a própria senha (também é o caminho do "trocar no primeiro acesso")
rotasAuth.post('/senha', exigirLogin, async (req, res, next) => {
  try {
    const atual = String(req.body?.senhaAtual || '');
    const nova = String(req.body?.senhaNova || '');
    if (nova.length < 8) return res.status(400).json({ erro: 'A senha nova precisa ter pelo menos 8 caracteres.' });
    if (!(await bcrypt.compare(atual, req.usuario.senha_hash))) return res.status(401).json({ erro: 'Senha atual incorreta.' });
    if (atual === nova) return res.status(400).json({ erro: 'A senha nova precisa ser diferente da atual.' });
    await query('UPDATE usuarios SET senha_hash = $1, trocar_senha = false, atualizado_em = now() WHERE id = $2', [await hashSenha(nova), req.usuario.id]);
    // derruba as outras sessões dessa pessoa (mantém só a atual)
    await query('DELETE FROM sessoes WHERE usuario_id = $1 AND token_hash <> $2', [req.usuario.id, hashToken(req.cookies[COOKIE])]);
    const { rows } = await query('SELECT * FROM usuarios WHERE id = $1', [req.usuario.id]);
    res.json({ ok: true, sessao: montarSessao(rows[0]) });
  } catch (e) { next(e); }
});
