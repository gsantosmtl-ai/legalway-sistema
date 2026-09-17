// Servidor do sistema Legal Way Group: serve as telas (docs/) + API + WebSocket do chat
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rodarMigracoes } from './db.js';
import { rotasAuth, garantirUsuariosIniciais, buscarSessao } from './auth.js';
import { rotasUsuarios } from './usuarios.js';
import { rotasChat, ligarWebSocket } from './chat.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pastaTelas = path.join(raiz, 'docs');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.set('trust proxy', 1);              // Railway fica atrás de um proxy; sem isso req.secure/req.ip vêm errados
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// cabeçalhos básicos de segurança
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'same-origin');
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});

app.get('/api/saude', (req, res) => res.json({ ok: true, versao: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'local' }));
app.use('/api', rotasAuth);
app.use('/api', rotasUsuarios);
app.use('/api/chat', rotasChat);
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// As telas continuam sendo arquivos estáticos, mas só são entregues pra quem tem sessão válida.
// Exceções (abertas pra quem tem o link, sem login): a tela de login, os assets (logo, fundo),
// os modelos de contrato que o cliente assina e o Portal do Prestador (tradutor/psicólogo).
const PUBLICO = [/^\/login(\.html)?$/, /^\/assets\//, /^\/contratos-templates\//, /^\/portal-prestador(\.html)?$/, /^\/favicon\.ico$/];
app.use(async (req, res, next) => {
  // Normaliza ANTES de decidir se é público: sem isso, "/assets/../financeiro.html" passaria como "assets"
  // e o express.static serviria financeiro.html sem login.
  let caminho;
  try { caminho = path.posix.normalize(decodeURIComponent(req.path)); } catch { return res.status(400).end(); }
  if (caminho.includes('..') || caminho.includes('\0')) return res.status(400).end();
  if (PUBLICO.some(re => re.test(caminho))) return next();
  try {
    const u = await buscarSessao(req);
    if (!u) return res.redirect('/login.html');
    if (u.trocar_senha) return res.redirect('/login.html?trocar=1');
    res.set('Cache-Control', 'private, no-store'); // tela protegida não fica em cache compartilhado
    next();
  } catch (e) { next(e); }
});
app.use(express.static(pastaTelas, { extensions: ['html'], index: 'index.html' }));

app.use((err, req, res, next) => {
  console.error('[erro]', err);
  res.status(500).json({ erro: 'Erro interno no servidor.' });
});

const server = createServer(app);
ligarWebSocket(server);

await rodarMigracoes();
await garantirUsuariosIniciais();
server.listen(PORT, () => console.log(`[servidor] no ar em http://localhost:${PORT} — telas em ${pastaTelas}`));
