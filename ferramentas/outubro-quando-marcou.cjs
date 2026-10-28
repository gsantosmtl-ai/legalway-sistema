// Quando o LIV marcou como paga cada parcela de outubro, e que campos a
// parcela tem. Serve para saber se a sincronia com o Bling PAROU numa data.
// Só leitura; a conta é feita no Postgres.
const pg = require('/app/node_modules/pg');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
const SQL = `
  WITH contas AS (
    SELECT x FROM armazenamento, jsonb_array_elements(valor::jsonb) x
    WHERE chave = 'legalway-financeiro-v1'
  ), outubro AS (
    SELECT x FROM contas WHERE left(coalesce(x->>'vencimento',''), 7) = '2026-10'
  )
  SELECT (SELECT jsonb_agg(DISTINCT k) FROM outubro, jsonb_object_keys(x) k) AS campos,
         (SELECT jsonb_agg(linha) FROM (
            SELECT left(coalesce(x->>'dataRecebimento', x->>'pagoEm', x->>'recebidoEm', '(sem data)'), 10) AS dia,
                   count(*) AS quantas
            FROM outubro WHERE x->>'status' = 'Pago'
            GROUP BY 1 ORDER BY 1
          ) linha) AS pagamentos_por_dia`;
c.connect()
  .then(() => c.query(SQL))
  .then(r => { console.log(JSON.stringify(r.rows[0])); return c.end(); })
  .catch(e => { console.log('ERRO ' + e.message); process.exit(1); });
