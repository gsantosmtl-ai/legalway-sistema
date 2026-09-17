// Conexão com o Postgres + migrações (arquivos .sql em src/migrations, rodados em ordem, uma vez só)
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida. Local: copie server/.env.example pra server/.env. Railway: adicione o plugin Postgres.');
  process.exit(1);
}

// No Railway a conexão interna não usa SSL; conexões externas (proxy) usam. Detecta pelo host.
const url = new URL(process.env.DATABASE_URL);
const precisaSSL = !/localhost|127\.0\.0\.1|\.railway\.internal$/.test(url.hostname);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: precisaSSL ? { rejectUnauthorized: false } : false,
  max: 10,
});

export const query = (text, params) => pool.query(text, params);

export async function rodarMigracoes() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  const arquivos = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  const { rows } = await query('SELECT nome FROM schema_migrations');
  const jaAplicadas = new Set(rows.map(r => r.nome));
  for (const arquivo of arquivos) {
    if (jaAplicadas.has(arquivo)) continue;
    const sql = await readFile(path.join(dir, arquivo), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [arquivo]);
      await client.query('COMMIT');
      console.log(`[db] migração aplicada: ${arquivo}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
