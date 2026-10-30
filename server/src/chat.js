// Chat interno: API REST + WebSocket pra entrega instantânea e presença online
import { Router } from 'express';
import { WebSocketServer } from 'ws';
import { query } from './db.js';
import { exigirLogin, usuarioDoCookieHeader } from './auth.js';
import { salvarDataUri } from './arquivos.js';
import { limparTexto } from './sanitizar.js';
import { obterRegras } from './regras.js';
import { avisarCanalNoCelular, avisarPessoaNoCelular } from './push.js';

// quem não tem o módulo Chat no perfil não lê nem escreve (perfis antigos, sem a chave, seguem podendo)
const nivelChat = (u) => (u.acesso_total ? 'editar' : (u.permissoes && u.permissoes.chat));
const podeLerChat = (u) => { const n = nivelChat(u); return n === undefined || ['visualizar', 'editar'].includes(n); };
const podeEscreverChat = (u) => { const n = nivelChat(u); return n === undefined || n === 'editar'; };

export const CANAIS_PADRAO = ['vendas', 'documentacao', 'financeiro'];
async function canais() { const r = await obterRegras(); return (r.chat && r.chat.canais || []).map(c => c.key); }
const TEXTO_MAX = 4000;

// ---------- presença / conexões ----------
const conexoes = new Map(); // usuarioId -> Set<ws>
const quemEsta = new Map();  // usuarioId -> usuário (pra saber o que cada um pode receber)
const online = () => [...conexoes.keys()];

function enviar(ws, obj) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); }
function enviarPara(usuarioId, obj) { for (const ws of conexoes.get(usuarioId) || []) enviar(ws, obj); }
export function enviarTodos(obj) { for (const id of conexoes.keys()) enviarPara(id, obj); }
// Mesma coisa, mas só pra quem o filtro aprovar. Usado no aviso de "esse bloco mudou": quem não
// pode ver Financeiro também não precisa saber que o Financeiro mudou, nem quem mexeu nele.
export function enviarTodosSe(obj, filtro) {
  for (const id of conexoes.keys()) {
    const u = quemEsta.get(id);
    if (!u || filtro(u)) enviarPara(id, obj);
  }
}

const chaveDM = (a, b) => 'dm:' + [a, b].sort().join('|');

function formatar(m) {
  return {
    id: Number(m.id), tipo: m.tipo, canal: m.canal, deId: m.de_id, de: m.de_nome,
    paraId: m.para_id, para: m.para_nome, texto: m.texto, quando: m.quando,
    arquivo: m.arquivo_id ? { url: '/api/arquivos/' + m.arquivo_id, nome: m.arquivo_nome, tipo: m.arquivo_tipo } : null,
  };
}

const SELECT_MSG = `
  SELECT m.*, de.nome AS de_nome, para.nome AS para_nome
  FROM chat_mensagens m
  JOIN usuarios de ON de.id = m.de_id
  LEFT JOIN usuarios para ON para.id = m.para_id`;

// ---------- rotas ----------
export const rotasChat = Router();
rotasChat.use(exigirLogin);

// Tudo que a pessoa pode ver (canais + diretas dela). ?apos=<id> traz só o que chegou depois.
rotasChat.use((req, res, next) => podeLerChat(req.usuario) ? next() : res.status(403).json({ erro: 'Sem permissão pra ver o chat.' }));

rotasChat.get('/mensagens', async (req, res, next) => {
  try {
    const apos = Number(req.query.apos) || 0;
    const { rows } = await query(
      `${SELECT_MSG}
       WHERE m.id > $1 AND (m.tipo = 'canal' OR m.de_id = $2 OR m.para_id = $2)
       ORDER BY m.id DESC LIMIT 2000`,
      [apos, req.usuario.id]
    );
    res.json({ mensagens: rows.reverse().map(formatar) });
  } catch (e) { next(e); }
});

rotasChat.get('/estado', async (req, res, next) => {
  try {
    const equipe = await query("SELECT id, nome, (id = 'sistema') AS sistema FROM usuarios WHERE ativo = true OR id = 'sistema' ORDER BY (id = 'sistema') DESC, id");
    const lidas = await query('SELECT conversa, lida_ate FROM chat_leitura WHERE usuario_id = $1', [req.usuario.id]);
    res.json({
      canais: (await obterRegras()).chat.canais,
      equipe: equipe.rows,
      online: online(),
      lidas: Object.fromEntries(lidas.rows.map(r => [r.conversa, r.lida_ate])),
    });
  } catch (e) { next(e); }
});

// Total de não-lidas da pessoa (badge do sino nas outras telas)
rotasChat.get('/nao-lidas', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM chat_mensagens m
       LEFT JOIN chat_leitura l ON l.usuario_id = $1 AND l.conversa = CASE WHEN m.tipo = 'canal' THEN 'canal:' || m.canal
            ELSE 'dm:' || least(m.de_id, m.para_id) || '|' || greatest(m.de_id, m.para_id) END
       WHERE m.de_id <> $1 AND (m.tipo = 'canal' OR m.para_id = $1) AND (l.lida_ate IS NULL OR m.quando > l.lida_ate)`,
      [req.usuario.id]
    );
    res.json({ total: rows[0].n });
  } catch (e) { next(e); }
});

/**
 * Avisa quem foi marcado com @ numa anotação.
 *
 * A anotação continua morando no histórico do processo, como sempre; isto aqui
 * é só o toque no ombro. Manda uma mensagem direta no chat para cada pessoa
 * citada e devolve quem foi avisado de verdade — e quem NÃO foi, porque o nome
 * não bate com ninguém ativo. Marcar alguém e o aviso sumir calado é pior do
 * que não ter a marcação: quem escreveu fica achando que o recado chegou.
 */
rotasChat.post('/mencoes', async (req, res, next) => {
  try {
    const nomes = Array.isArray(req.body?.nomes) ? req.body.nomes : [];
    const texto = limparTexto(String(req.body?.texto || '').trim());
    const sobre = limparTexto(String(req.body?.sobre || '').trim()).slice(0, 120);
    if (!nomes.length) return res.json({ avisados: [], naoEncontrados: [] });
    if (!texto) return res.status(400).json({ erro: 'Anotação vazia.' });
    if (!podeEscreverChat(req.usuario)) return res.status(403).json({ erro: 'Sem permissão pra usar o chat.' });

    const avisados = [], naoEncontrados = [];
    const vistos = new Set();
    for (const bruto of nomes.slice(0, 20)) {
      const nome = String(bruto || '').trim();
      // Sem acento também aqui: "Vitória" e "Vitoria" são a mesma pessoa, e
      // avisar duas vezes é mandar a pessoa ler o mesmo recado dois dias
      // seguidos achando que são dois casos.
      const k = semAcento(nome);
      if (!nome || vistos.has(k)) continue;
      vistos.add(k);
      // Ninguém precisa de aviso da própria anotação.
      // Dos dois lados sem acento: `k` já vem sem, e comparar com o nome cru
      // fazia a "Vitória" receber aviso da própria anotação e a "Vitoria" não.
      if (k === semAcento(req.usuario.nome || '')) continue;
      const linha = `📝 ${req.usuario.nome} marcou você numa anotação${sobre ? ' de ' + sobre : ''}:\n${texto.slice(0, 600)}`;
      (await avisarPessoa(nome, linha)) ? avisados.push(nome) : naoEncontrados.push(nome);
    }
    res.json({ avisados, naoEncontrados });
  } catch (e) { next(e); }
});

rotasChat.post('/mensagens', async (req, res, next) => {
  try {
    const texto = limparTexto(String(req.body?.texto || '').trim());
    const anexo = req.body?.arquivo && typeof req.body.arquivo === 'object' ? req.body.arquivo : null;
    if (!texto && !anexo) return res.status(400).json({ erro: 'Mensagem vazia.' });
    // A permissão é conferida ANTES de gravar qualquer anexo: sem isso, quem não pode escrever
    // ainda conseguiria subir arquivo pro servidor só tentando mandar mensagem.
    if (!podeEscreverChat(req.usuario)) return res.status(403).json({ erro: 'Sem permissão pra usar o chat.' });
    if (texto.length > TEXTO_MAX) return res.status(400).json({ erro: `Mensagem grande demais (máx. ${TEXTO_MAX} caracteres).` });
    // anexo: {nome, conteudo: data URI}. Tipos permitidos: imagem, PDF, Word/Excel, zip. Até 25 MB.
    let arq = { id: null, nome: null, tipo: null };
    if (anexo) {
      const m = /^data:([^;,]+)/.exec(String(anexo.conteudo || ''));
      const tipoArq = (m ? m[1] : '').toLowerCase();
      if (!/^(image\/(png|jpe?g|gif|webp|heic)|application\/pdf|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|vnd\.ms-excel|zip|x-zip-compressed))$/.test(tipoArq)) {
        return res.status(400).json({ erro: 'Tipo de arquivo não permitido no chat (use imagem, PDF, Word, Excel ou ZIP).' });
      }
      if (String(anexo.conteudo).length > 25 * 1024 * 1024 * 1.37) return res.status(413).json({ erro: 'Arquivo maior que 25 MB.' });
      const link = await salvarDataUri(anexo.conteudo, String(anexo.nome || 'arquivo').slice(0, 200), req.usuario.nome);
      arq = { id: link.split('/').pop(), nome: String(anexo.nome || 'arquivo').slice(0, 200), tipo: tipoArq };
    }
    const tipo = req.body?.tipo;
    let inserida;
    if (tipo === 'canal') {
      const canal = String(req.body?.canal || '');
      if (!(await canais()).includes(canal)) return res.status(400).json({ erro: 'Canal inválido.' });
      inserida = await query(
        `INSERT INTO chat_mensagens (tipo, canal, de_id, texto, arquivo_id, arquivo_nome, arquivo_tipo) VALUES ('canal', $1, $2, $3, $4, $5, $6) RETURNING id`,
        [canal, req.usuario.id, texto, arq.id, arq.nome, arq.tipo]
      );
    } else if (tipo === 'direta') {
      const paraId = String(req.body?.paraId || '');
      const dest = await query('SELECT id FROM usuarios WHERE id = $1 AND ativo = true', [paraId]);
      if (!dest.rows[0] || paraId === req.usuario.id) return res.status(400).json({ erro: 'Destinatário inválido.' });
      inserida = await query(
        `INSERT INTO chat_mensagens (tipo, de_id, para_id, texto, arquivo_id, arquivo_nome, arquivo_tipo) VALUES ('direta', $1, $2, $3, $4, $5, $6) RETURNING id`,
        [req.usuario.id, paraId, texto, arq.id, arq.nome, arq.tipo]
      );
    } else {
      return res.status(400).json({ erro: 'Tipo inválido.' });
    }
    const { rows } = await query(`${SELECT_MSG} WHERE m.id = $1`, [inserida.rows[0].id]);
    const msg = formatar(rows[0]);
    // quem mandou já leu até aqui
    await marcarLida(req.usuario.id, msg.tipo === 'canal' ? 'canal:' + msg.canal : chaveDM(msg.deId, msg.paraId));
    // entrega instantânea
    if (msg.tipo === 'canal') enviarTodos({ tipo: 'mensagem', mensagem: msg });
    else { enviarPara(msg.paraId, { tipo: 'mensagem', mensagem: msg }); enviarPara(msg.deId, { tipo: 'mensagem', mensagem: msg }); }
    res.status(201).json({ mensagem: msg });
  } catch (e) { next(e); }
});

// Mensagem automática do "Sistema" num canal (ex.: contrato assinado). Chega em tempo real pra quem estiver aberto.
const NOME_CANAL = { vendas: 'Vendas', documentacao: 'Documentação', financeiro: 'Financeiro' };

// Etiqueta padrão do aviso no celular: o canal mais uma marca do próprio texto.
// Assim dois avisos IGUAIS (o mesmo lead anunciado duas vezes por caminhos
// diferentes) viram UM aviso só no aparelho, em vez de duas buzinas — e dois
// avisos diferentes continuam aparecendo separados.
function etiqueta(canal, texto) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return canal + '-' + Math.abs(h).toString(36);
}

/**
 * Aviso do sistema num canal. `extra` só afeta o celular:
 *   grupo — avisos com a mesma etiqueta se substituem em vez de empilhar
 *   url   — para onde o toque leva
 */
export async function avisarCanal(canal, texto, extra) {
  if (!(await canais()).includes(canal)) return;
  const corpo = String(texto).slice(0, TEXTO_MAX);
  const ins = await query(`INSERT INTO chat_mensagens (tipo, canal, de_id, texto) VALUES ('canal', $1, 'sistema', $2) RETURNING id`, [canal, corpo]);
  const { rows } = await query(`${SELECT_MSG} WHERE m.id = $1`, [ins.rows[0].id]);
  enviarTodos({ tipo: 'mensagem', mensagem: formatar(rows[0]) });
  // O celular de quem escolheu este departamento. Nunca lança: aviso que
  // falha não pode derrubar quem o disparou.
  avisarCanalNoCelular(canal, {
    titulo: (extra && extra.titulo) || NOME_CANAL[canal] || canal,
    texto: corpo,
    grupo: (extra && extra.grupo) || etiqueta(canal, corpo),
    url: (extra && extra.url) || '/index.html',
  }).catch(() => {});
}

// Mensagem direta automática do "Sistema" pra uma pessoa (pelo nome de exibição). Devolve false se não achar.
const semAcento = (t) => String(t || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export async function avisarPessoa(nome, texto) {
  // `lower()` do Postgres não tira acento: procurar "Vitoria" nunca achava a
  // "Vitória" cadastrada, e a pessoa ficava sem o aviso sem ninguém notar. A
  // comparação passa a ignorar acento, dos dois lados.
  const alvo = semAcento(nome);
  if (!alvo) return false;
  let u = await query('SELECT id FROM usuarios WHERE ativo = true AND lower(nome) = lower($1) LIMIT 1', [String(nome || '')]);
  if (!u.rows[0]) {
    const todos = await query('SELECT id, nome FROM usuarios WHERE ativo = true');
    let achado = todos.rows.find((r) => semAcento(r.nome) === alvo);
    // Ainda não achou? O nome escrito pode ser a forma CURTA. A lista de
    // responsáveis de Documentação guarda "Bruno" e o cadastro tem "Bruno
    // Carvalho Maciel": em 30/10/2026, 13 menções a ele nunca chegaram.
    // Só vale quando o primeiro nome é único — com dois Brunos, avisar o
    // errado é pior do que não avisar.
    if (!achado && !alvo.includes(' ')) {
      const mesmos = todos.rows.filter((r) => semAcento(r.nome).split(/\s+/)[0] === alvo);
      if (mesmos.length === 1) achado = mesmos[0];
    }
    u = { rows: achado ? [achado] : [] };
  }
  if (!u.rows[0]) return false;
  const ins = await query(`INSERT INTO chat_mensagens (tipo, de_id, para_id, texto) VALUES ('direta', 'sistema', $1, $2) RETURNING id`, [u.rows[0].id, String(texto).slice(0, TEXTO_MAX)]);
  const { rows } = await query(`${SELECT_MSG} WHERE m.id = $1`, [ins.rows[0].id]);
  enviarPara(u.rows[0].id, { tipo: 'mensagem', mensagem: formatar(rows[0]) });
  // Mensagem direta é para ESTA pessoa: vai para o celular dela independente
  // de departamento escolhido, porque foi endereçada a ela.
  avisarPessoaNoCelular(u.rows[0].id, {
    titulo: 'Legal Way', texto: String(texto).slice(0, TEXTO_MAX),
    grupo: 'direta', url: '/index.html',
  }).catch(() => {});
  return true;
}

async function marcarLida(usuarioId, conversa) {
  await query(
    `INSERT INTO chat_leitura (usuario_id, conversa, lida_ate) VALUES ($1, $2, now())
     ON CONFLICT (usuario_id, conversa) DO UPDATE SET lida_ate = now()`,
    [usuarioId, conversa]
  );
}

rotasChat.post('/lida', async (req, res, next) => {
  try {
    const conversa = String(req.body?.conversa || '');
    if (!/^(canal:[a-z]+|dm:u[0-9]+\|u[0-9]+)$/.test(conversa)) return res.status(400).json({ erro: 'Conversa inválida.' });
    await marcarLida(req.usuario.id, conversa);
    res.json({ ok: true, lidaAte: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ---------- WebSocket ----------
export function ligarWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    if (new URL(req.url, 'http://x').pathname !== '/ws') { socket.destroy(); return; }
    let usuario = null;
    try { usuario = await usuarioDoCookieHeader(req.headers.cookie); } catch {}
    if (!usuario || usuario.trocar_senha) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, usuario));
  });

  wss.on('connection', (ws, usuario) => {
    const id = usuario.id;
    const primeira = !conexoes.has(id);
    if (primeira) conexoes.set(id, new Set());
    conexoes.get(id).add(ws);
    quemEsta.set(id, usuario);
    ws.vivo = true;
    ws.on('pong', () => { ws.vivo = true; });
    ws.on('message', (raw) => { // só "ping" de aplicação por enquanto; mensagens vão pela API
      if (raw.toString() === 'ping') enviar(ws, { tipo: 'pong' });
    });
    ws.on('close', () => {
      const set = conexoes.get(id);
      if (set) { set.delete(ws); if (set.size === 0) { conexoes.delete(id); quemEsta.delete(id); enviarTodos({ tipo: 'presenca', online: online() }); } }
    });
    enviar(ws, { tipo: 'presenca', online: online() });
    if (primeira) enviarTodos({ tipo: 'presenca', online: online() });
  });

  // derruba conexões mortas (rede caiu sem fechar) a cada 30s
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.vivo) { ws.terminate(); continue; }
      ws.vivo = false; ws.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(timer));
  return wss;
}
