// Armazenamento compartilhado: o "localStorage" de todas as telas, agora no servidor.
// Cada chave guarda um bloco JSON com versão; salvar por cima de uma versão antiga dispara a mesclagem.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { pool, query } from './db.js';
import { exigirLogin } from './auth.js';
import { mesclar } from './mesclar.js';
import { extrairArquivos } from './arquivos.js';
import { avisarCanal } from './chat.js';
import { podeLer, podeGravar, chavesVisiveis } from './permissoes.js';
import { limparValor } from './sanitizar.js';

const HIST_MAX = 30;                       // versões guardadas por chave
const RE_CHAVE = /^[a-zA-Z0-9._:-]{1,120}$/;
let notificar = () => {};                  // ligado ao WebSocket em index.js
export const aoMudar = (fn) => { notificar = fn; };

const paraJson = (texto) => { try { return JSON.parse(texto); } catch { return texto; } };
const formato = (r) => r ? { chave: r.chave, valor: JSON.stringify(r.valor), versao: r.versao, atualizadoEm: r.atualizado_em } : null;

export async function ler(chave) {
  const { rows } = await query('SELECT * FROM armazenamento WHERE chave = $1', [chave]);
  return rows[0] || null;
}

// Grava com controle de versão. `versaoBase` = versão que a pessoa leu (null = não sabe / força).
export async function gravar(chave, valorNovo, versaoBase, quem, transformar, origem) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM armazenamento WHERE chave = $1 FOR UPDATE', [chave]);
    const atual = rows[0];
    let valor = valorNovo;
    if (transformar) valor = await transformar(valor, atual ? atual.valor : null);
    let mesclado = false;
    if (atual && versaoBase != null && versaoBase !== atual.versao) {
      const hist = await client.query('SELECT valor FROM armazenamento_hist WHERE chave = $1 AND versao = $2', [chave, versaoBase]);
      const base = hist.rows[0] ? hist.rows[0].valor : null;
      if (base !== null) { valor = mesclar(base, atual.valor, valor); mesclado = true; }
      else { valor = mesclar(atual.valor, atual.valor, valor); mesclado = true; } // base antiga demais: mescla 2 vias (meus itens vencem)
    }
    const versao = atual ? atual.versao + 1 : 1;
    await client.query(
      `INSERT INTO armazenamento (chave, valor, versao, atualizado_em, atualizado_por) VALUES ($1,$2,$3,now(),$4)
       ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, versao = EXCLUDED.versao, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por`,
      [chave, JSON.stringify(valor), versao, quem || null]
    );
    await client.query('INSERT INTO armazenamento_hist (chave, versao, valor) VALUES ($1,$2,$3)', [chave, versao, JSON.stringify(valor)]);
    await client.query('DELETE FROM armazenamento_hist WHERE chave = $1 AND versao <= $2', [chave, versao - HIST_MAX]);
    await client.query('COMMIT');
    notificar({ tipo: 'storage', chave, versao, por: quem || null, origem: origem || null });
    return { chave, valor: JSON.stringify(valor), versao, mesclado };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}

export const rotasArmazenamento = Router();
rotasArmazenamento.use(exigirLogin);

rotasArmazenamento.get('/storage', async (req, res, next) => {
  try {
    const prefixo = String(req.query.prefixo || '');
    const { rows } = await query('SELECT chave, versao, atualizado_em FROM armazenamento WHERE chave LIKE $1 ORDER BY chave', [prefixo + '%']);
    const visiveis = new Set(chavesVisiveis(req.usuario, rows.map(r => r.chave)));
    res.json({ chaves: rows.filter(r => visiveis.has(r.chave)).map(r => ({ chave: r.chave, versao: r.versao, atualizadoEm: r.atualizado_em })) });
  } catch (e) { next(e); }
});

rotasArmazenamento.get('/storage/:chave', async (req, res, next) => {
  try {
    if (!RE_CHAVE.test(req.params.chave)) return res.status(400).json({ erro: 'Chave inválida.' });
    if (!podeLer(req.usuario, req.params.chave)) return res.status(403).json({ erro: 'Sem permissão pra ver esses dados.' });
    const r = await ler(req.params.chave);
    if (!r) return res.status(404).json({ erro: 'Sem dados.' });
    res.json(formato(r));
  } catch (e) { next(e); }
});

rotasArmazenamento.put('/storage/:chave', async (req, res, next) => {
  try {
    const chave = req.params.chave;
    if (!RE_CHAVE.test(chave)) return res.status(400).json({ erro: 'Chave inválida.' });
    if (typeof req.body?.valor !== 'string') return res.status(400).json({ erro: 'Valor precisa ser texto (JSON).' });
    if (!podeGravar(req.usuario, chave)) return res.status(403).json({ erro: 'Sem permissão pra alterar esses dados.' });
    const versaoBase = req.body.versaoBase == null ? null : Number(req.body.versaoBase);
    const r = await gravar(chave, limparValor(paraJson(req.body.valor)), versaoBase, req.usuario.nome, (v) => extrairArquivos(v, req.usuario.nome), String(req.body.origem || '').slice(0, 40));
    res.json(r);
  } catch (e) { next(e); }
});

rotasArmazenamento.delete('/storage/:chave', async (req, res, next) => {
  try {
    if (!podeGravar(req.usuario, req.params.chave)) return res.status(403).json({ erro: 'Sem permissão pra apagar esses dados.' });
    await query('DELETE FROM armazenamento WHERE chave = $1', [req.params.chave]);
    await query('DELETE FROM armazenamento_hist WHERE chave = $1', [req.params.chave]);
    notificar({ tipo: 'storage', chave: req.params.chave, versao: 0, por: req.usuario.nome });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Importação do que existe no navegador de alguém: une por id com o que já está no servidor (o servidor vence em conflito)
rotasArmazenamento.post('/storage/importar', async (req, res, next) => {
  try {
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
    const resultado = [];
    for (const it of itens) {
      if (!RE_CHAVE.test(String(it.chave || '')) || typeof it.valor !== 'string') continue;
      if (!podeGravar(req.usuario, it.chave)) { resultado.push({ chave: it.chave, erro: 'sem permissão' }); continue; }
      const novo = limparValor(paraJson(it.valor));
      const r = await gravar(it.chave, novo, null, req.usuario.nome + ' (importação)', async (v, atual) => {
        const v2 = await extrairArquivos(v, req.usuario.nome);
        // já existe no servidor: entra só o que o servidor não tem (por id); o resto fica como está
        return atual == null ? v2 : unirPorId(atual, v2);
      });
      resultado.push({ chave: it.chave, versao: r.versao });
    }
    res.json({ importados: resultado });
  } catch (e) { next(e); }
});

function unirPorId(atual, novo) {
  if (Array.isArray(atual) && Array.isArray(novo)) {
    const ids = new Set(atual.map(x => x && String(x.id)));
    return atual.concat(novo.filter(x => x && x.id !== undefined && !ids.has(String(x.id))));
  }
  if (atual && novo && typeof atual === 'object' && typeof novo === 'object' && !Array.isArray(atual)) return { ...novo, ...atual };
  return atual; // valores simples: mantém o do servidor
}

// ---------- acesso público por token (cliente assinando, prestador no portal) ----------
export const rotasPublico = Router();

const CHAVE_PROCESSOS = 'legalway-processos-documentacao-v1';
const CHAVE_PAGAR = 'legalway-contas-pagar-v1';
const CHAVE_PRESTADORES = 'legalway-prestadores-externos-v1';

async function lerToken(t) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(t || ''))) return null;
  const { rows } = await query('SELECT * FROM tokens_publicos WHERE token = $1 AND expira_em > now()', [t]);
  return rows[0] || null;
}

// Emitir token (só logado). tipo 'assinatura' -> {contratoId}; tipo 'portal' -> {processoId}
async function tokenPara(tipo, ref, quem) {
  const dados = tipo === 'assinatura' ? { contratoId: String(ref) } : { processoId: String(ref) };
  // reaproveita um token válido do mesmo alvo (o link enviado antes continua funcionando)
  const existe = await query(`SELECT token FROM tokens_publicos WHERE tipo = $1 AND dados = $2 AND expira_em > now() + interval '7 days' LIMIT 1`, [tipo, JSON.stringify(dados)]);
  if (existe.rows[0]) return existe.rows[0].token;
  const token = randomBytes(24).toString('base64url');
  await query(`INSERT INTO tokens_publicos (token, tipo, dados, expira_em, criado_por) VALUES ($1,$2,$3, now() + interval '90 days', $4)`,
    [token, tipo, JSON.stringify(dados), quem]);
  return token;
}

rotasPublico.post('/publico/token', exigirLogin, async (req, res, next) => {
  try {
    const { tipo, ref } = req.body || {};
    if (!['assinatura', 'portal'].includes(tipo) || !ref) return res.status(400).json({ erro: 'Tipo ou referência inválidos.' });
    res.json({ token: await tokenPara(tipo, ref, req.usuario.nome) });
  } catch (e) { next(e); }
});

// Vários de uma vez (a tela de Documentação pega os tokens de todos os processos ao carregar)
rotasPublico.post('/publico/tokens', exigirLogin, async (req, res, next) => {
  try {
    const { tipo, refs } = req.body || {};
    if (!['assinatura', 'portal'].includes(tipo) || !Array.isArray(refs)) return res.status(400).json({ erro: 'Parâmetros inválidos.' });
    const tokens = {};
    for (const ref of refs.slice(0, 500)) tokens[String(ref)] = await tokenPara(tipo, ref, req.usuario.nome);
    res.json({ tokens });
  } catch (e) { next(e); }
});

// A página pública usa o MESMO window.storage, mas cada token só enxerga a sua fatia
rotasPublico.get('/publico/storage/:chave', async (req, res, next) => {
  try {
    const tk = await lerToken(req.query.t);
    if (!tk) return res.status(401).json({ erro: 'Link inválido ou expirado. Peça um novo.' });
    const chave = req.params.chave;
    const r = await ler(chave);
    const valor = r ? r.valor : null;
    if (tk.tipo === 'portal') {
      const { processoId } = tk.dados;
      if (chave === CHAVE_PROCESSOS) return res.json({ chave, valor: JSON.stringify((valor || []).filter(p => p && p.id === processoId)), versao: r?.versao || 0 });
      if (chave === CHAVE_PAGAR) return res.json({ chave, valor: JSON.stringify((valor || []).filter(c => c && c.processoId === processoId)), versao: r?.versao || 0 });
      if (chave === CHAVE_PRESTADORES) return res.json({ chave, valor: JSON.stringify((valor || []).map(p => ({ id: p.id, nome: p.nome, tipo: p.tipo, valor: p.valor, valorPadrao: p.valorPadrao }))), versao: r?.versao || 0 });
    }
    return res.status(403).json({ erro: 'Sem acesso a esses dados.' });
  } catch (e) { next(e); }
});

rotasPublico.put('/publico/storage/:chave', async (req, res, next) => {
  try {
    const tk = await lerToken(req.query.t);
    if (!tk) return res.status(401).json({ erro: 'Link inválido ou expirado. Peça um novo.' });
    const chave = req.params.chave;
    if (typeof req.body?.valor !== 'string') return res.status(400).json({ erro: 'Valor inválido.' });
    const novo = limparValor(paraJson(req.body.valor));
    const quem = 'público:' + tk.tipo;
    if (tk.tipo === 'assinatura' && chave === 'legalway-contrato-assinado-' + tk.dados.contratoId) {
      const r = await gravar(chave, novo, null, quem, (v) => extrairArquivos(v, quem, 'contrato-assinado.pdf'));
      await query('DELETE FROM tokens_publicos WHERE token = $1', [tk.token]); // assinou: link não serve mais
      const nome = (novo && typeof novo === 'object' && novo.nome) ? String(novo.nome) : 'Cliente';
      avisarCanal('vendas', `📝 ${nome} acabou de assinar o contrato. Já está em Contratos como "Assinado", com o PDF anexado e as parcelas no Financeiro.`).catch(() => {});
      return res.json(r);
    }
    if (tk.tipo === 'portal' && (chave === CHAVE_PROCESSOS || chave === CHAVE_PAGAR)) {
      const { processoId } = tk.dados;
      // o portal manda só a fatia dele; aplicamos item a item no bloco completo
      const permitido = (item) => chave === CHAVE_PROCESSOS ? item.id === processoId : item.processoId === processoId;
      const itens = (Array.isArray(novo) ? novo : []).filter(x => x && x.id !== undefined && permitido(x));
      const r = await gravar(chave, itens, null, quem, async (fatia, atual) => {
        const fatia2 = await extrairArquivos(fatia, quem);
        const lista = Array.isArray(atual) ? atual.slice() : [];
        for (const item of fatia2) {
          const i = lista.findIndex(x => x && String(x.id) === String(item.id));
          if (i >= 0) lista[i] = item; else lista.push(item);
        }
        return lista;
      });
      return res.json({ chave, versao: r.versao });
    }
    return res.status(403).json({ erro: 'Sem acesso a esses dados.' });
  } catch (e) { next(e); }
});
