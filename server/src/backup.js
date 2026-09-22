// Backup completo (dados, arquivos, usuários, chat) e restauração. Só pra quem tem acesso total.
// Também roda sozinho uma vez por dia e guarda as últimas cópias no banco (tabela `backups`),
// pra existir uma cópia mesmo que ninguém se lembre de baixar.
import { Router } from 'express';
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { query } from './db.js';
import { exigirLogin } from './auth.js';
import { gravar } from './armazenamento.js';

const COPIAS_GUARDADAS = 14; // quantos backups automáticos ficam no banco

async function montarBackup(geradoPor) {
  const [usuarios, armazenamento, arquivos, chat, leitura] = await Promise.all([
    query('SELECT * FROM usuarios ORDER BY id'),
    query('SELECT chave, valor, versao, atualizado_em, atualizado_por FROM armazenamento ORDER BY chave'),
    query('SELECT id, nome, tipo, tamanho, conteudo, criado_em, criado_por FROM arquivos ORDER BY criado_em'),
    query('SELECT * FROM chat_mensagens ORDER BY id'),
    query('SELECT * FROM chat_leitura'),
  ]);
  return {
    formato: 'legalway-backup-v1', geradoEm: new Date().toISOString(), geradoPor,
    usuarios: usuarios.rows,
    armazenamento: armazenamento.rows,
    arquivos: arquivos.rows.map(a => ({ ...a, conteudo: a.conteudo.toString('base64') })),
    chat_mensagens: chat.rows,
    chat_leitura: leitura.rows,
  };
}

// Uma cópia por dia, guardada comprimida. Chamado na inicialização e a cada 6 horas.
export async function backupAutomatico() {
  try {
    const { rows } = await query("SELECT 1 FROM backups WHERE origem = 'automático' AND criado_em > now() - interval '20 hours' LIMIT 1");
    if (rows[0]) return;
    const dados = gzipSync(Buffer.from(JSON.stringify(await montarBackup('automático'))));
    await query('INSERT INTO backups (id, origem, tamanho, conteudo) VALUES ($1, $2, $3, $4)', [randomBytes(12).toString('hex'), 'automático', dados.length, dados]);
    await query("DELETE FROM backups WHERE id IN (SELECT id FROM backups WHERE origem = 'automático' ORDER BY criado_em DESC OFFSET $1)", [COPIAS_GUARDADAS]);
    console.log(`[backup] cópia automática guardada (${(dados.length / 1048576).toFixed(1)} MB)`);
  } catch (e) { console.error('[backup] falhou:', e.message); }
}

const soAdmin = (req, res, next) => req.usuario.acesso_total ? next() : res.status(403).json({ erro: 'Só quem tem acesso total pode fazer backup.' });

export const rotasBackup = Router();
rotasBackup.use(exigirLogin, soAdmin);

rotasBackup.get('/backup', async (req, res, next) => {
  try {
    const nome = `backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' });
    res.json(await montarBackup(req.usuario.nome));
  } catch (e) { next(e); }
});

// Cópias automáticas guardadas no servidor
rotasBackup.get('/backups', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, criado_em, origem, tamanho FROM backups ORDER BY criado_em DESC');
    res.json({ copias: rows });
  } catch (e) { next(e); }
});

rotasBackup.get('/backups/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT criado_em, conteudo FROM backups WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Cópia não encontrada.' });
    const nome = `backup-${new Date(rows[0].criado_em).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' });
    res.send(gunzipSync(rows[0].conteudo));
  } catch (e) { next(e); }
});

rotasBackup.post('/backups/agora', async (req, res, next) => {
  try {
    const dados = gzipSync(Buffer.from(JSON.stringify(await montarBackup(req.usuario.nome))));
    await query('INSERT INTO backups (id, origem, tamanho, conteudo) VALUES ($1, $2, $3, $4)', [randomBytes(12).toString('hex'), req.usuario.nome, dados.length, dados]);
    res.json({ ok: true, tamanho: dados.length });
  } catch (e) { next(e); }
});

// Restaura por cima do que existe: blocos e arquivos do backup substituem/entram; usuários e chat só entram se não existirem.
rotasBackup.post('/backup/restaurar', async (req, res, next) => {
  try {
    const b = req.body;
    if (!b || b.formato !== 'legalway-backup-v1') return res.status(400).json({ erro: 'Arquivo não é um backup do sistema.' });
    let n = { usuarios: 0, blocos: 0, arquivos: 0, mensagens: 0 };
    for (const u of b.usuarios || []) {
      const r = await query(
        `INSERT INTO usuarios (id, nome, usuario, senha_hash, cargo, papel, acesso_total, permissoes, ativo, trocar_senha, criado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
        [u.id, u.nome, u.usuario, u.senha_hash, u.cargo, u.papel, u.acesso_total, JSON.stringify(u.permissoes || {}), u.ativo, u.trocar_senha, u.criado_em || new Date()]
      );
      n.usuarios += r.rowCount;
    }
    for (const a of b.arquivos || []) {
      const r = await query(
        'INSERT INTO arquivos (id, nome, tipo, tamanho, conteudo, criado_em, criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING',
        [a.id, a.nome, a.tipo, a.tamanho, Buffer.from(a.conteudo, 'base64'), a.criado_em || new Date(), a.criado_por]
      );
      n.arquivos += r.rowCount;
    }
    for (const bl of b.armazenamento || []) {
      await gravar(bl.chave, bl.valor, null, req.usuario.nome + ' (restauração)');
      n.blocos++;
    }
    for (const m of b.chat_mensagens || []) {
      const r = await query(
        `INSERT INTO chat_mensagens (id, tipo, canal, de_id, para_id, texto, quando) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [m.id, m.tipo, m.canal, m.de_id, m.para_id, m.texto, m.quando]
      );
      n.mensagens += r.rowCount;
    }
    await query(`SELECT setval('chat_mensagens_id_seq', GREATEST((SELECT max(id) FROM chat_mensagens), 1))`);
    res.json({ ok: true, restaurado: n });
  } catch (e) { next(e); }
});
