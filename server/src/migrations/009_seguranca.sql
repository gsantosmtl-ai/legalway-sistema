-- Vigilância de segurança: o que aconteceu, quem foi bloqueado e o boletim diário.
CREATE TABLE IF NOT EXISTS seguranca_eventos (
  id         BIGSERIAL PRIMARY KEY,
  quando     TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo       TEXT NOT NULL,            -- login-errado, forca-bruta, csrf, apagar-em-massa, virar-admin, ...
  gravidade  SMALLINT NOT NULL,        -- 1 aviso · 2 atenção · 3 grave
  ip         TEXT,
  quem       TEXT,                     -- nome de quem estava logado (quando havia alguém)
  detalhe    TEXT,
  caminho    TEXT
);
CREATE INDEX IF NOT EXISTS seguranca_eventos_quando ON seguranca_eventos (quando DESC);
CREATE INDEX IF NOT EXISTS seguranca_eventos_ip ON seguranca_eventos (ip, quando DESC);

CREATE TABLE IF NOT EXISTS seguranca_bloqueios (
  ip        TEXT PRIMARY KEY,
  ate       TIMESTAMPTZ NOT NULL,
  motivo    TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seguranca_boletins (
  dia       DATE PRIMARY KEY,
  nota      SMALLINT NOT NULL,         -- 0 a 100
  itens     JSONB NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
