// Compara a versão anterior e a nova de um bloco e registra, item a item, o que mudou e quem mudou.
import { Router } from 'express';
import { query } from './db.js';
import { exigirLogin } from './auth.js';
import { podeLer } from './permissoes.js';

const IGNORAR = new Set(['historico', 'atualizadoEm', 'criadoEm', 'quando']); // campos que mudam sempre e não dizem nada
const curto = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s === undefined ? null : (s.length > 160 ? s.slice(0, 157) + '…' : s); };
const rotulo = (item) => item.nome || item.cliente || item.clienteNome || item.titulo || item.descricao || item.fornecedor || item.usuario || item.id;

export async function registrarDiferencas(chave, antes, depois, quem) {
  const temIds = (a) => Array.isArray(a) && a.every(x => x && typeof x === 'object' && x.id !== undefined);
  const linhas = [];
  if (temIds(antes || []) && temIds(depois || []) && (antes?.length || depois?.length)) {
    const mA = new Map((antes || []).map(x => [String(x.id), x])), mD = new Map((depois || []).map(x => [String(x.id), x]));
    for (const [id, d] of mD) {
      const a = mA.get(id);
      if (!a) { linhas.push({ item_id: id, acao: 'criado', mudancas: null, resumo: `${rotulo(d)}` }); continue; }
      const mud = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(d)])) {
        if (IGNORAR.has(k)) continue;
        if (JSON.stringify(a[k]) !== JSON.stringify(d[k])) mud[k] = { de: curto(a[k]), para: curto(d[k]) };
      }
      if (Object.keys(mud).length) linhas.push({ item_id: id, acao: 'alterado', mudancas: mud, resumo: `${rotulo(d)}: ${Object.keys(mud).slice(0, 4).join(', ')}` });
    }
    for (const [id, a] of mA) if (!mD.has(id)) linhas.push({ item_id: id, acao: 'removido', mudancas: null, resumo: `${rotulo(a)}` });
  } else if (JSON.stringify(antes) !== JSON.stringify(depois)) {
    linhas.push({ item_id: null, acao: 'bloco', mudancas: null, resumo: 'bloco atualizado' });
  }
  if (!linhas.length) return 0;
  for (const l of linhas.slice(0, 200)) {
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, mudancas, resumo) VALUES ($1,$2,$3,$4,$5,$6)',
      [quem || null, chave, l.item_id, l.acao, l.mudancas ? JSON.stringify(l.mudancas) : null, l.resumo]);
  }
  return linhas.length;
}

export const rotasAuditoria = Router();
rotasAuditoria.use(exigirLogin);
// Últimas alterações. Filtros: ?chave=&item=&quem=&limite=
rotasAuditoria.get('/auditoria', async (req, res, next) => {
  try {
    const cond = [], val = [];
    if (req.query.chave) { val.push(String(req.query.chave)); cond.push(`chave = $${val.length}`); }
    if (req.query.item) { val.push(String(req.query.item)); cond.push(`item_id = $${val.length}`); }
    if (req.query.quem) { val.push('%' + String(req.query.quem) + '%'); cond.push(`quem ILIKE $${val.length}`); }
    const limite = Math.min(Number(req.query.limite) || 200, 1000);
    const { rows } = await query(`SELECT * FROM auditoria ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY id DESC LIMIT ${limite}`, val);
    res.json({ registros: rows.filter(r => podeLer(req.usuario, r.chave)) });
  } catch (e) { next(e); }
});
