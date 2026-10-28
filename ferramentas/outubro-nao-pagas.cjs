// As parcelas de outubro que o LIV NÃO considera pagas, com o id da conta a
// receber no Bling e o nome do cliente — para cruzar uma a uma com o Bling.
//
// Só leitura. A conta é feita no Postgres: o bloco do financeiro passa de
// 400 KB e puxá-lo inteiro para o Node já derrubou o contêiner antes.
const pg = require('/app/node_modules/pg');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
const SQL = `
  WITH contas AS (
    SELECT x FROM armazenamento, jsonb_array_elements(valor::jsonb) x
    WHERE chave = 'legalway-financeiro-v1'
  ), contratos AS (
    SELECT y FROM armazenamento, jsonb_array_elements(valor::jsonb) y
    WHERE chave = 'legalway-contratos-v1'
  )
  SELECT x->>'blingId'       AS bling,
         x->>'status'        AS status,
         x->>'vencimento'    AS vencimento,
         x->>'valor'         AS valor,
         x->>'descricao'     AS descricao,
         x->>'formaPagamento' AS forma,
         y->>'cliente'       AS cliente,
         y->>'etapa'         AS etapa_contrato
  FROM contas LEFT JOIN contratos ON y->>'id' = x->>'contratoId'
  WHERE left(coalesce(x->>'vencimento',''), 7) = '2026-10'
    AND coalesce(x->>'status','') <> 'Pago'
  ORDER BY x->>'status', y->>'cliente', x->>'vencimento'`;
c.connect()
  .then(() => c.query(SQL))
  .then(r => { console.log(JSON.stringify(r.rows)); return c.end(); })
  .catch(e => { console.log('ERRO ' + e.message); process.exit(1); });
