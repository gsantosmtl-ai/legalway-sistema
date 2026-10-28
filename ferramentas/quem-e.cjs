// Tudo que o sistema tem sobre uma pessoa, pelo nome. Só leitura.
// Uso: ...quem-e.cjs  (o nome vem da variável de ambiente NOME)
const pg = require('/app/node_modules/pg');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
const NOME = process.env.NOME || '';
const SQL = `
  SELECT a.chave,
         jsonb_agg(x) AS achados
  FROM armazenamento a, jsonb_array_elements(a.valor::jsonb) x
  WHERE a.chave IN ('legalway-contratos-v1','legalway-processos-documentacao-v1',
                    'legalway-clientes-v1','legalway-funil-comercial-v1','legalway-leads-v1')
    AND lower(x::text) LIKE '%' || lower($1) || '%'
  GROUP BY a.chave`;
c.connect()
  .then(() => c.query(SQL, [NOME]))
  .then(r => { console.log(JSON.stringify(r.rows)); return c.end(); })
  .catch(e => { console.log('ERRO ' + e.message); process.exit(1); });
