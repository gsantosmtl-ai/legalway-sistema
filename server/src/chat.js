// Chat interno: API REST + WebSocket pra entrega instantânea e presença online
import { Router } from 'express';
import { WebSocketServer } from 'ws';
import { query } from './db.js';
import { exigirLogin, usuarioDoCookieHeader } from './auth.js';

export const CANAIS = ['vendas', 'documentacao', 'financeiro'];
const TEXTO_MAX = 4000;

// ---------- presença / conexões ----------
const conexoes = new Map(); // usuarioId -> Set<ws>
const online = () => [...conexoes.keys()];

function enviar(ws, obj) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); }
function enviarPara(usuarioId, obj) { for (const ws of conexoes.get(usuarioId) || []) enviar(ws, obj); }
export function enviarTodos(obj) { for (const id of conexoes.keys()) enviarPara(id, obj); }

const chaveDM = (a, b) => 'dm:' + [a, b].sort().join('|');

function formatar(m) {
  return {
    id: Number(m.id), tipo: m.tipo, canal: m.canal, deId: m.de_id, de: m.de_nome,
    paraId: m.para_id, para: m.para_nome, texto: m.texto, quando: m.quando,
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
    const equipe = await query('SELECT id, nome FROM usuarios WHERE ativo = true ORDER BY id');
    const lidas = await query('SELECT conversa, lida_ate FROM chat_leitura WHERE usuario_id = $1', [req.usuario.id]);
    res.json({
      canais: CANAIS,
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

rotasChat.post('/mensagens', async (req, res, next) => {
  try {
    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ erro: 'Mensagem vazia.' });
    if (texto.length > TEXTO_MAX) return res.status(400).json({ erro: `Mensagem grande demais (máx. ${TEXTO_MAX} caracteres).` });
    const tipo = req.body?.tipo;
    let inserida;
    if (tipo === 'canal') {
      const canal = String(req.body?.canal || '');
      if (!CANAIS.includes(canal)) return res.status(400).json({ erro: 'Canal inválido.' });
      inserida = await query(
        `INSERT INTO chat_mensagens (tipo, canal, de_id, texto) VALUES ('canal', $1, $2, $3) RETURNING id`,
        [canal, req.usuario.id, texto]
      );
    } else if (tipo === 'direta') {
      const paraId = String(req.body?.paraId || '');
      const dest = await query('SELECT id FROM usuarios WHERE id = $1 AND ativo = true', [paraId]);
      if (!dest.rows[0] || paraId === req.usuario.id) return res.status(400).json({ erro: 'Destinatário inválido.' });
      inserida = await query(
        `INSERT INTO chat_mensagens (tipo, de_id, para_id, texto) VALUES ('direta', $1, $2, $3) RETURNING id`,
        [req.usuario.id, paraId, texto]
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
export async function avisarCanal(canal, texto) {
  if (!CANAIS.includes(canal)) return;
  const ins = await query(`INSERT INTO chat_mensagens (tipo, canal, de_id, texto) VALUES ('canal', $1, 'sistema', $2) RETURNING id`, [canal, String(texto).slice(0, TEXTO_MAX)]);
  const { rows } = await query(`${SELECT_MSG} WHERE m.id = $1`, [ins.rows[0].id]);
  enviarTodos({ tipo: 'mensagem', mensagem: formatar(rows[0]) });
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
    ws.vivo = true;
    ws.on('pong', () => { ws.vivo = true; });
    ws.on('message', (raw) => { // só "ping" de aplicação por enquanto; mensagens vão pela API
      if (raw.toString() === 'ping') enviar(ws, { tipo: 'pong' });
    });
    ws.on('close', () => {
      const set = conexoes.get(id);
      if (set) { set.delete(ws); if (set.size === 0) { conexoes.delete(id); enviarTodos({ tipo: 'presenca', online: online() }); } }
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
