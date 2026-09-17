// Backup completo (dados, arquivos, usuários, chat) e restauração. Só pra quem tem acesso total.
import { Router } from 'express';
import { query } from './db.js';
import { exigirLogin } from './auth.js';
import { gravar } from './armazenamento.js';

const soAdmin = (req, res, next) => req.usuario.acesso_total ? next() : res.status(403).json({ erro: 'Só quem tem acesso total pode fazer backup.' });

export const rotasBackup = Router();
rotasBackup.use(exigirLogin, soAdmin);

rotasBackup.get('/backup', async (req, res, next) => {
  try {
    const [usuarios, armazenamento, arquivos, chat, leitura] = await Promise.all([
      query('SELECT * FROM usuarios ORDER BY id'),
      query('SELECT chave, valor, versao, atualizado_em, atualizado_por FROM armazenamento ORDER BY chave'),
      query('SELECT id, nome, tipo, tamanho, conteudo, criado_em, criado_por FROM arquivos ORDER BY criado_em'),
      query('SELECT * FROM chat_mensagens ORDER BY id'),
      query('SELECT * FROM chat_leitura'),
    ]);
    const nome = `legalway-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' });
    res.json({
      formato: 'legalway-backup-v1', geradoEm: new Date().toISOString(), geradoPor: req.usuario.nome,
      usuarios: usuarios.rows,
      armazenamento: armazenamento.rows,
      arquivos: arquivos.rows.map(a => ({ ...a, conteudo: a.conteudo.toString('base64') })),
      chat_mensagens: chat.rows,
      chat_leitura: leitura.rows,
    });
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
