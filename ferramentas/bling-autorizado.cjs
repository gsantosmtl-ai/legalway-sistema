// A ligação com o Bling está autorizada? Só diz SE existe o refresh token e
// quando foi gravado — nunca o segredo em si.
const pg = require('/app/node_modules/pg');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
c.connect()
  .then(() => c.query(`SELECT (valor::jsonb ? 'refreshToken') AS tem_token,
                              jsonb_object_keys_count.chaves,
                              atualizado_em
                       FROM armazenamento,
                            LATERAL (SELECT jsonb_agg(k) AS chaves FROM jsonb_object_keys(valor::jsonb) k) jsonb_object_keys_count
                       WHERE chave = 'legalway-bling-oauth-v1'`))
  .then(r => { console.log('RESULTADO ' + JSON.stringify(r.rows)); return c.end(); })
  .catch(e => { console.log('ERRO ' + e.message); process.exit(1); });
