// Leitura SÓ DE LEITURA, para a conferência Bling x LIV de outubro.
//
// Toda a conta é feita no Postgres de propósito: o bloco do financeiro tem
// mais de 400 KB e puxá-lo inteiro para dentro do Node já derrubou o
// contêiner antes. Aqui só os totais atravessam.
const pg = require('/app/node_modules/pg');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
const SQL = `
  SELECT coalesce(x->>'status','(sem status)') AS status,
         count(*) AS quantas,
         round(sum((coalesce(nullif(x->>'valor',''),'0'))::numeric), 2) AS soma,
         count(*) FILTER (WHERE x ? 'blingId') AS com_bling
  FROM armazenamento, jsonb_array_elements(valor::jsonb) x
  WHERE chave = 'legalway-financeiro-v1'
    AND left(coalesce(x->>'vencimento',''), 7) = '2026-10'
  GROUP BY 1 ORDER BY 2 DESC`;
c.connect()
  .then(() => c.query(SQL))
  .then(r => { console.log('RESULTADO ' + JSON.stringify(r.rows)); return c.end(); })
  .catch(e => { console.log('ERRO ' + e.message); process.exit(1); });
