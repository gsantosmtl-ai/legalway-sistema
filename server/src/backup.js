// Backup completo (dados, arquivos, usuários, chat) e restauração. Só pra quem tem acesso total.
// Também roda sozinho uma vez por dia e guarda as últimas cópias no banco (tabela `backups`),
// pra existir uma cópia mesmo que ninguém se lembre de baixar.
import { Router } from 'express';
import { anotar } from './guardiao.js';
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { query } from './db.js';
import { exigirLogin } from './auth.js';
import { gravar } from './armazenamento.js';

const COPIAS_GUARDADAS = 14; // quantos backups automáticos ficam no banco
// Quanto conteúdo de arquivo cabe num pedaço do backup.
//
// Eram 300 MB, e a conta não fechava com folga. O limite que decide isto não é
// o tamanho do corpo HTTP: é o TAMANHO MÁXIMO DE UMA STRING no Node, que neste
// servidor é 512 MB (medido: buffer.constants.MAX_STRING_LENGTH, Node 20).
//
// Base64 incha 33%, e o laço abaixo sempre leva ao menos um arquivo a mais para
// não travar — então um lote de 300 MB podia chegar a 340 MB de bytes e 453 MB
// de texto. Sobravam 59 MB antes de `JSON.stringify` levantar "Invalid string
// length" e o lote inteiro falhar.
//
// E o navegador paga duas vezes: `resp.json()` monta o objeto e o `Blob` do
// download pede a string outra vez. A 453 MB isso é mais de 1,4 GB numa aba.
//
// 120 MB viram 160 MB de texto: cabe com folga nos dois lados. São 28 pedaços
// em vez de 12, e o backup completo é feito uma vez antes da migração — vale
// muito mais terminar do que terminar rápido.
const BYTES_POR_LOTE = 120 * 1024 * 1024;

// `comArquivos` carrega o conteúdo de TODOS os arquivos na memória de uma vez.
// Com os 2.800 documentos do escritório isso passa de 2 GB e derruba o servidor,
// então as cópias automáticas vão sem: elas servem para desfazer um erro nos
// dados, e arquivo o sistema não apaga (a faxina de órfãos está desligada).
// A cópia de verdade, com os documentos, é a que se baixa em lotes.
async function montarBackup(geradoPor, { comArquivos = false } = {}) {
  const [usuarios, armazenamento, arquivos, chat, leitura] = await Promise.all([
    query('SELECT * FROM usuarios ORDER BY id'),
    query('SELECT chave, valor, versao, atualizado_em, atualizado_por FROM armazenamento ORDER BY chave'),
    query(`SELECT id, nome, tipo, tamanho, criado_em, criado_por${comArquivos ? ', conteudo' : ''} FROM arquivos ORDER BY criado_em`),
    query('SELECT * FROM chat_mensagens ORDER BY id'),
    query('SELECT * FROM chat_leitura'),
  ]);
  return {
    formato: 'legalway-backup-v1', geradoEm: new Date().toISOString(), geradoPor,
    usuarios: usuarios.rows,
    armazenamento: armazenamento.rows,
    // Sem o conteúdo, a lista continua valendo como inventário: diz quais
    // arquivos deveriam existir, e a restauração ignora os que não trazem bytes.
    arquivos: arquivos.rows.map(a => comArquivos ? { ...a, conteudo: a.conteudo.toString('base64') } : a),
    chat_mensagens: chat.rows,
    chat_leitura: leitura.rows,
  };
}

// Cópia sob demanda, guardada igual às automáticas. Usada antes de uma operação sem volta.
export async function backupAgora(origem = 'manual') {
  const dados = gzipSync(Buffer.from(JSON.stringify(await montarBackup(origem))));
  const id = randomBytes(12).toString('hex');
  await query('INSERT INTO backups (id, origem, tamanho, conteudo) VALUES ($1, $2, $3, $4)', [id, origem, dados.length, dados]);
  return { id, tamanho: dados.length };
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

const soAdmin = (req, res, next) => {
  if (req.usuario.acesso_total) return next();
  anotar('backup-negado', req, 'tentou baixar o backup');
  return res.status(403).json({ erro: 'Só quem tem acesso total pode fazer backup.' });
};

export const rotasBackup = Router();
// ATENÇÃO: este router é montado em '/api' junto com os outros. Um `use()` sem caminho valeria
// pra TODA requisição que passasse por aqui — e derrubaria as rotas registradas depois (foi o que
// acontecia: a Documentação recebia "só quem tem acesso total pode fazer backup" ao consultar o
// USCIS). Por isso o guard vai rota a rota.
const soBackup = [exigirLogin, soAdmin];

rotasBackup.get('/backup', soBackup, async (req, res, next) => {
  try {
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, 'confirmacao', null, 'alterado', 'Backup completo baixado (contém todos os dados do escritório)']).catch(() => {});
    const nome = `backup-dados-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' });
    res.json(await montarBackup(req.usuario.nome));
  } catch (e) { next(e); }
});

// Quantos lotes de arquivo existem e quanto pesam — para a tela saber o que baixar.
rotasBackup.get('/backup/arquivos/resumo', soBackup, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT count(*)::int AS n, coalesce(sum(tamanho),0)::bigint AS bytes FROM arquivos');
    const bytes = Number(rows[0].bytes);
    res.json({ arquivos: rows[0].n, bytes, lotes: Math.max(1, Math.ceil(bytes / BYTES_POR_LOTE)) });
  } catch (e) { next(e); }
});

// Um lote de arquivos, no mesmo formato do backup, para restaurar por cima.
// Pagina por `criado_em,id` em vez de OFFSET: arquivo novo criado no meio do
// download não embaralha a ordem nem faz pular nenhum.
rotasBackup.get('/backup/arquivos', soBackup, async (req, res, next) => {
  try {
    const apos = String(req.query.apos || '');
    const { rows } = apos
      ? await query(`SELECT a.id, a.nome, a.tipo, a.tamanho, a.conteudo, a.criado_em, a.criado_por
                     FROM arquivos a, (SELECT criado_em, id FROM arquivos WHERE id = $1) m
                     WHERE (a.criado_em, a.id) > (m.criado_em, m.id)
                     ORDER BY a.criado_em, a.id LIMIT 2000`, [apos])
      : await query(`SELECT id, nome, tipo, tamanho, conteudo, criado_em, criado_por
                     FROM arquivos ORDER BY criado_em, id LIMIT 2000`);

    const lote = [];
    let soma = 0, proximo = null;
    for (const a of rows) {
      // Sempre leva ao menos um: arquivo maior que o lote inteiro travaria o laço.
      if (lote.length && soma + a.tamanho > BYTES_POR_LOTE) { proximo = lote[lote.length - 1].id; break; }
      soma += a.tamanho;
      lote.push({ ...a, conteudo: a.conteudo.toString('base64') });
    }
    if (!proximo && rows.length === 2000 && lote.length === 2000) proximo = lote[lote.length - 1].id;

    res.set({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.json({ formato: 'legalway-backup-v1', geradoEm: new Date().toISOString(),
               geradoPor: req.usuario.nome, arquivos: lote, proximo, bytes: soma });
  } catch (e) { next(e); }
});

// Cópias automáticas guardadas no servidor
rotasBackup.get('/backups', soBackup, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, criado_em, origem, tamanho FROM backups ORDER BY criado_em DESC');
    res.json({ copias: rows });
  } catch (e) { next(e); }
});

rotasBackup.get('/backups/:id', soBackup, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT criado_em, conteudo FROM backups WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Cópia não encontrada.' });
    const nome = `backup-${new Date(rows[0].criado_em).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' });
    // O conteúdo é o backup que o próprio sistema gerou e guardou comprimido — não vem de fora.
    // Sai como anexo, com tipo application/json e X-Content-Type-Options: nosniff (posto em toda
    // resposta por cabecalhosSeguranca), então o navegador baixa em vez de interpretar como página.
    res.send(gunzipSync(rows[0].conteudo));   // nosemgrep: direct-response-write -- JSON baixado, nunca renderizado; rota só para admin
  } catch (e) { next(e); }
});

// Um bloco só, de dentro de uma cópia. Baixar a cópia inteira obriga o
// servidor a descompactar dezenas de MB e mandar tudo pela rede — e foi isso
// que derrubou o processo no dia em que precisamos justamente de recuperar
// alguma coisa. Aqui a descompactação acontece do mesmo jeito, mas só o bloco
// pedido atravessa, que são alguns KB.
rotasBackup.get('/backups/:id/bloco/:chave', soBackup, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT criado_em, conteudo FROM backups WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Cópia não encontrada.' });
    const dados = JSON.parse(gunzipSync(rows[0].conteudo).toString('utf8'));
    const bloco = (dados.armazenamento || []).find(b => b.chave === req.params.chave);
    if (!bloco) return res.status(404).json({ erro: 'Essa cópia não tem esse módulo.' });
    res.json({ chave: bloco.chave, versao: bloco.versao, geradoEm: dados.geradoEm,
      criadoEm: rows[0].criado_em, valor: JSON.stringify(bloco.valor) });
  } catch (e) { next(e); }
});

rotasBackup.post('/backups/agora', soBackup, async (req, res, next) => {
  try {
    const dados = gzipSync(Buffer.from(JSON.stringify(await montarBackup(req.usuario.nome))));
    await query('INSERT INTO backups (id, origem, tamanho, conteudo) VALUES ($1, $2, $3, $4)', [randomBytes(12).toString('hex'), req.usuario.nome, dados.length, dados]);
    res.json({ ok: true, tamanho: dados.length });
  } catch (e) { next(e); }
});

// Restaura por cima do que existe: blocos e arquivos do backup substituem/entram; usuários e chat só entram se não existirem.
rotasBackup.post('/backup/restaurar', soBackup, async (req, res, next) => {
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
