-- Backups automáticos: uma cópia por dia, guardada no próprio banco (as mais antigas são apagadas).
CREATE TABLE IF NOT EXISTS backups (
  id          TEXT PRIMARY KEY,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  origem      TEXT NOT NULL DEFAULT 'automático',   -- 'automático' | nome de quem pediu
  tamanho     BIGINT NOT NULL,
  conteudo    BYTEA NOT NULL                        -- JSON do backup, comprimido com gzip
);
CREATE INDEX IF NOT EXISTS backups_criado_idx ON backups(criado_em DESC);
