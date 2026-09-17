-- Trilha de auditoria por registro: quem criou/alterou/removeu qual item de qual módulo, e o que mudou.
CREATE TABLE IF NOT EXISTS auditoria (
  id        BIGSERIAL PRIMARY KEY,
  quando    TIMESTAMPTZ NOT NULL DEFAULT now(),
  quem      TEXT,
  chave     TEXT NOT NULL,
  item_id   TEXT,
  acao      TEXT NOT NULL,          -- criado | alterado | removido | bloco
  mudancas  JSONB,                  -- {campo: {de, para}} (valores encurtados)
  resumo    TEXT                    -- ex.: "Contrato Felipe Souza: valor 5059 -> 5500"
);
CREATE INDEX IF NOT EXISTS auditoria_quando_idx ON auditoria(quando DESC);
CREATE INDEX IF NOT EXISTS auditoria_chave_item_idx ON auditoria(chave, item_id);
