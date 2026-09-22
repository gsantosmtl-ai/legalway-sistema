-- Portal do cliente: cada cliente acessa o próprio processo com e-mail e senha.
CREATE TABLE IF NOT EXISTS portal_clientes (
  id            TEXT PRIMARY KEY,
  processo_id   TEXT NOT NULL,                  -- id do processo em legalway-processos-documentacao-v1
  nome          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,           -- login, sempre minúsculo
  senha_hash    TEXT NOT NULL,
  trocar_senha  BOOLEAN NOT NULL DEFAULT true,  -- primeira senha é temporária
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_por    TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acesso TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS portal_clientes_processo_idx ON portal_clientes(processo_id);

CREATE TABLE IF NOT EXISTS sessoes_portal (
  token_hash    TEXT PRIMARY KEY,
  cliente_id    TEXT NOT NULL REFERENCES portal_clientes(id) ON DELETE CASCADE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em     TIMESTAMPTZ NOT NULL,
  ultimo_acesso TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip            TEXT
);
CREATE INDEX IF NOT EXISTS sessoes_portal_cliente_idx ON sessoes_portal(cliente_id);
