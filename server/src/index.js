// Servidor do sistema Legal Way Group: serve as telas (docs/) + API + WebSocket do chat
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rodarMigracoes } from './db.js';
import { rotasAuth, garantirUsuariosIniciais, buscarSessao, exigirLogin } from './auth.js';
import { rotasUsuarios } from './usuarios.js';
import { rotasChat, ligarWebSocket, enviarTodos, enviarTodosSe } from './chat.js';
import { rotasArmazenamento, rotasPublico, aoMudar } from './armazenamento.js';
import { rotasArquivos, limparArquivosOrfaos } from './arquivos.js';
import { rotasBackup, backupAutomatico } from './backup.js';
import { rotasWaha } from './waha-rotas.js';
import { rotasAssinaturas } from './assinaturas.js';
import { rotasLembretes } from './lembretes.js';
import { executarAutomacoes, aoGravarChave } from './automacoes.js';
import { rotasAuditoria } from './auditoria.js';
import { rotasUscis } from './uscis.js';
import { formularioPorId, FORMULARIOS } from './formularios.js';
import { rotasPortalCliente } from './portal-cliente.js';
import { rotasManifest } from './manifest.js';
import { rotasAvisosCliente } from './avisos-cliente.js';
import { limitePorIp, mesmaOrigem, cabecalhosSeguranca } from './protecao.js';
import { podeLer } from './permissoes.js';
import { rotasRegras, invalidarRegras, CHAVE_REGRAS } from './regras.js';
import { rotasInstalacao, precisaInstalar } from './instalacao.js';
import { rotasLimparDuplicados } from './limpar-duplicados.js';
import { barreira, carregarBloqueios, rotasSeguranca, anotar } from './guardiao.js';
import { rotasStripe } from './stripe-rotas.js';
import { rotasMetaLeads } from './meta-leads.js';
import { rotasCaixaEntrada } from './caixa-entrada.js';

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
// A Meta assina o corpo cru. Guardamos o original antes de analisar — depois do
// express.json() o conteúdo exato se perde e o HMAC nunca confere.
app.use('/api/publico/meta', express.json({ limit: '1mb', verify: (req, _res, buf) => { req.corpoBruto = buf; } }));
// Mesmo motivo no Stripe, e aqui o risco é dinheiro: sem o corpo byte a byte a
// assinatura nunca confere, e um webhook não verificado daria baixa em parcela
// que ninguém pagou.
app.use('/api/publico/stripe', express.json({ limit: '1mb', verify: (req, _res, buf) => { req.corpoBruto = buf; } }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.use(cabecalhosSeguranca);          // nosniff, CSP, HSTS, Permissions-Policy, no-store na API
app.use(barreira);                     // Guardião: endereço já bloqueado por atividade suspeita não passa
// O catálogo de formulários, para a tela de Documentação mostrar as respostas com o
// rótulo de cada pergunta em vez de um monte de chave solta.
// A lista, para Configurações oferecer os formulários em vez de ter um só no
// código da tela. Só nome e id: os campos vêm na rota de baixo, quando precisa.
app.get('/api/formularios', exigirLogin, (req, res) => {
  res.json({ formularios: FORMULARIOS.map(f => ({ id: f.id, nome: f.nome, servico: f.servico || '', campos: f.campos.length })) });
});
app.get('/api/formularios/:id', exigirLogin, (req, res) => {
  const f = formularioPorId(String(req.params.id));
  if (!f) return res.status(404).json({ erro: 'Formulário não encontrado.' });
  res.json({ id: f.id, nome: f.nome, campos: f.campos });
});

app.use('/api', limitePorIp);          // limite de requisições por IP (contém força bruta e varredura)
app.use('/api', mesmaOrigem);          // bloqueia POST/PUT/DELETE vindos de outro site (além do SameSite)

app.get('/manifest.webmanifest', (req, res) => res.redirect(307, '/api/publico/manifest.webmanifest'));
app.get('/api/saude', (req, res) => res.json({ ok: true, versao: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'local' }));
app.use('/api', rotasAuth);
// rotas sem login (ou com login só em rotas específicas) vêm ANTES das que exigem login no router inteiro
app.use('/api', rotasPublico);
app.use('/api', rotasMetaLeads);   // webhook do Meta Lead Ads (sem login, assinado)
app.use('/api', rotasStripe);      // cobrança e webhook do Stripe (webhook sem login, assinado)
// Montada no caminho dela, não no '/api' pelado: este router aplica exigirLogin
// em tudo que passa por ele, e em '/api' isso derrubava com 401 toda rota
// montada depois — inclusive o portal do cliente, que não tem sessão de
// funcionário. As URLs não mudam: '/api/caixa' + '/conversas'.
app.use('/api/caixa', rotasCaixaEntrada);  // caixa de entrada do WhatsApp (exige login)
app.use('/api', rotasRegras);
app.use('/api', rotasInstalacao);
app.use('/api', rotasManifest);
app.use('/api', rotasAvisosCliente);
app.use('/api', rotasPortalCliente);
app.use('/api', rotasAssinaturas);
app.use('/api', rotasArquivos);
app.use('/api', rotasUsuarios);
app.use('/api', rotasLembretes);
app.use('/api/chat', rotasChat);
app.use('/api', rotasArmazenamento);
app.use('/api', rotasBackup);
app.use('/api', rotasWaha);      // conectar os números dos setores ao WhatsApp
app.use('/api', rotasAuditoria);
app.use('/api', rotasUscis);
app.use('/api', rotasSeguranca);
app.use('/api', rotasLimparDuplicados);
// Avisa as telas que um bloco mudou — só pra quem tem permissão de ler aquele bloco — e dispara automações
aoMudar((ev) => {
  enviarTodosSe(ev, (u) => podeLer(u, ev.chave));
  if (ev.chave === CHAVE_REGRAS) invalidarRegras();
  if (ev.por !== 'automação') aoGravarChave(ev.chave);
});
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
  const status = Number(err?.status) || 500;
  if (status === 415) anotar('arquivo-recusado', req, err.message);        // tipo de arquivo perigoso
  if (status >= 500) console.error('[erro]', err);
  // Mensagem amigável: nunca devolvemos detalhe interno do servidor pra quem chamou.
  const amigavel =
    status === 500 ? 'Erro interno no servidor.' :
    err?.type === 'entity.parse.failed' ? 'Os dados enviados vieram num formato que o servidor não entendeu.' :
    err?.type === 'entity.too.large' ? 'O arquivo ou os dados enviados são grandes demais.' :
    err?.expose === false ? 'Não foi possível concluir.' : (err?.message || 'Não foi possível concluir.');
  res.status(status).json({ erro: amigavel });
});

const server = createServer(app);
ligarWebSocket(server);

await rodarMigracoes();
await carregarBloqueios();   // Guardião: retoma os bloqueios que ainda valem
if (process.env.SEED_LEGALWAY === '1') await garantirUsuariosIniciais();
if (await precisaInstalar()) console.log('[instalação] Nenhum usuário ainda: abra /primeiro-acesso.html pra configurar o escritório.');
// A faxina de órfãos está desligada de propósito. Com as cópias automáticas
// indo sem o conteúdo dos arquivos, apagar um arquivo que ficou sem referência
// o perderia para sempre — e aqui "arquivo" é passaporte e laudo de cliente.
// Para ligar de novo: LIMPAR_ARQUIVOS_ORFAOS=1.
if (process.env.LIMPAR_ARQUIVOS_ORFAOS === '1') {
  limparArquivosOrfaos().catch(e => console.error('[arquivos] limpeza falhou', e));
}
// AUTOMACOES=0 desliga tudo que age sozinho: os avisos e a cópia automática.
// Serve para rodar uma segunda cópia do sistema (na máquina de alguém, contra o
// mesmo banco) sem que o cliente receba a mesma mensagem duas vezes — o envio é
// o único efeito deste sistema que não dá para desfazer depois.
const AGE_SOZINHO = process.env.AUTOMACOES !== '0';
if (AGE_SOZINHO) {
  executarAutomacoes('inicialização');
  setInterval(() => executarAutomacoes('agendado'), 60 * 1000); // a cada minuto
  backupAutomatico();                                                          // cópia de segurança do dia
  setInterval(() => backupAutomatico(), 6 * 60 * 60 * 1000);                   // confere a cada 6 h
} else {
  console.log('[automações] DESLIGADAS (AUTOMACOES=0) — nenhum aviso sai desta cópia.');
}
if (process.env.LIMPAR_ARQUIVOS_ORFAOS === '1') setInterval(() => limparArquivosOrfaos().catch(() => {}), 24 * 60 * 60 * 1000);
server.listen(PORT, () => console.log(`[servidor] no ar em http://localhost:${PORT} — telas em ${pastaTelas}`));
