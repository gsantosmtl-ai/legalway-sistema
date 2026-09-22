// Servidor do sistema Legal Way Group: serve as telas (docs/) + API + WebSocket do chat
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rodarMigracoes } from './db.js';
import { rotasAuth, garantirUsuariosIniciais, buscarSessao } from './auth.js';
import { rotasUsuarios } from './usuarios.js';
import { rotasChat, ligarWebSocket, enviarTodos } from './chat.js';
import { rotasArmazenamento, rotasPublico, aoMudar } from './armazenamento.js';
import { rotasArquivos, limparArquivosOrfaos } from './arquivos.js';
import { rotasBackup, backupAutomatico } from './backup.js';
import { rotasAssinaturas } from './assinaturas.js';
import { executarAutomacoes, aoGravarChave } from './automacoes.js';
import { rotasAuditoria } from './auditoria.js';
import { rotasUscis, uscisConfigurado } from './uscis.js';
import { rotasPortalCliente } from './portal-cliente.js';
import { rotasManifest } from './manifest.js';
import { rotasRegras, invalidarRegras, CHAVE_REGRAS } from './regras.js';
import { rotasInstalacao, precisaInstalar } from './instalacao.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pastaTelas = path.join(raiz, 'docs');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.set('trust proxy', 1);              // Railway fica atrás de um proxy; sem isso req.secure/req.ip vêm errados
app.disable('x-powered-by');
// blocos dos módulos podem vir com arquivos embutidos em base64 (são extraídos no servidor)
app.use('/api/storage', express.json({ limit: '60mb' }));
app.use('/api/backup', express.json({ limit: '500mb' }));
app.use('/api/publico/storage', express.json({ limit: '60mb' }));
app.use('/api/publico/assinatura', express.json({ limit: '60mb' }));
app.use('/api/chat/mensagens', express.json({ limit: '40mb' }));
app.use('/api/portal/documento', express.json({ limit: '45mb' }));
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

app.get('/manifest.webmanifest', (req, res) => res.redirect(307, '/api/publico/manifest.webmanifest'));
app.get('/api/saude', (req, res) => res.json({ ok: true, versao: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'local' }));
app.use('/api', rotasAuth);
// rotas sem login (ou com login só em rotas específicas) vêm ANTES das que exigem login no router inteiro
app.use('/api', rotasPublico);
app.use('/api', rotasRegras);
app.use('/api', rotasInstalacao);
app.use('/api', rotasManifest);
app.use('/api', rotasPortalCliente);
app.use('/api', rotasAssinaturas);
app.use('/api', rotasArquivos);
app.use('/api', rotasUsuarios);
app.use('/api/chat', rotasChat);
app.use('/api', rotasArmazenamento);
app.use('/api', rotasBackup);
app.use('/api', rotasAuditoria);
app.use('/api', rotasUscis);
aoMudar((ev) => { enviarTodos(ev); if (ev.chave === CHAVE_REGRAS) invalidarRegras(); if (ev.por !== 'automação') aoGravarChave(ev.chave); }); // avisa as telas e dispara automações
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// As telas continuam sendo arquivos estáticos, mas só são entregues pra quem tem sessão válida.
// Exceções (abertas pra quem tem o link, sem login): a tela de login, os assets (logo, fundo),
// os modelos de contrato que o cliente assina e o Portal do Prestador (tradutor/psicólogo).
const PUBLICO = [/^\/login(\.html)?$/, /^\/portal-cliente(\.html)?$/, /^\/primeiro-acesso(\.html)?$/, /^\/assets\//, /^\/contratos-templates\//, /^\/portal-prestador(\.html)?$/, /^\/verificar(\.html)?$/, /^\/favicon\.ico$/, /^\/manifest\.webmanifest$/];
// Página de vendas do produto (site/): pública, fora da pasta das telas, num caminho próprio.
const pastaSite = path.join(raiz, 'site');
app.use('/site', express.static(pastaSite, { extensions: ['html'], index: 'index.html', setHeaders(res, caminho) { if (/\.html$/.test(caminho)) res.set('Cache-Control', 'no-cache'); } }));
app.use(async (req, res, next) => {
  // Normaliza ANTES de decidir se é público: sem isso, "/assets/../financeiro.html" passaria como "assets"
  // e o express.static serviria financeiro.html sem login.
  let caminho;
  try { caminho = path.posix.normalize(decodeURIComponent(req.path)); } catch { return res.status(400).end(); }
  if (caminho.includes('..') || caminho.includes('\0')) return res.status(400).end();
  if (/^\/primeiro-acesso(\.html)?$/.test(caminho)) { try { if (!(await precisaInstalar())) return res.redirect('/login.html'); } catch {} return next(); }
  if (PUBLICO.some(re => re.test(caminho))) return next();
  try {
    const u = await buscarSessao(req);
    if (!u) return res.redirect('/login.html');
    if (u.trocar_senha) return res.redirect('/login.html?trocar=1');
    res.set('Cache-Control', 'private, no-store'); // tela protegida não fica em cache compartilhado
    next();
  } catch (e) { next(e); }
});
app.use(express.static(pastaTelas, {
  extensions: ['html'], index: 'index.html',
  // telas e scripts: o navegador sempre confere se mudou (ETag), então uma atualização publicada aparece na hora
  setHeaders(res, caminho) { if (/\.(html|js)$/.test(caminho)) res.set('Cache-Control', 'no-cache'); },
}));

app.use((err, req, res, next) => {
  console.error('[erro]', err);
  res.status(500).json({ erro: 'Erro interno no servidor.' });
});

const server = createServer(app);
ligarWebSocket(server);

await rodarMigracoes();
if (process.env.SEED_LEGALWAY === '1') await garantirUsuariosIniciais();
if (await precisaInstalar()) console.log('[instalação] Nenhum usuário ainda: abra /primeiro-acesso.html pra configurar o escritório.');
limparArquivosOrfaos().catch(e => console.error('[arquivos] limpeza falhou', e));
executarAutomacoes('inicialização');
setInterval(() => executarAutomacoes('agendado'), 60 * 1000); // a cada minuto
setInterval(() => limparArquivosOrfaos().catch(() => {}), 24 * 60 * 60 * 1000); // uma vez por dia
backupAutomatico();                                                            // cópia de segurança do dia
setInterval(() => backupAutomatico(), 6 * 60 * 60 * 1000);                     // confere a cada 6 h
server.listen(PORT, () => console.log(`[servidor] no ar em http://localhost:${PORT} — telas em ${pastaTelas}`));
