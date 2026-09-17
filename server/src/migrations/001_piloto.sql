-- Piloto fase 2: usuários, sessões e chat.
-- Os ids dos usuários continuam texto ('u1', 'u2'...) pra bater com o que as telas antigas já gravaram.

CREATE TABLE IF NOT EXISTS usuarios (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  usuario       TEXT NOT NULL UNIQUE,          -- login, sempre minúsculo
  senha_hash    TEXT NOT NULL,                 -- bcrypt; nunca guardamos a senha em si
  cargo         TEXT NOT NULL DEFAULT '',
  papel         TEXT NOT NULL DEFAULT 'socio',
  acesso_total  BOOLEAN NOT NULL DEFAULT false,
  permissoes    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  trocar_senha  BOOLEAN NOT NULL DEFAULT false, -- obriga a definir senha nova no próximo login
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash    TEXT PRIMARY KEY,              -- sha256 do token que vai no cookie
  usuario_id    TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em     TIMESTAMPTZ NOT NULL,
  ultimo_acesso TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX IF NOT EXISTS sessoes_usuario_idx ON sessoes(usuario_id);

CREATE TABLE IF NOT EXISTS chat_mensagens (
  id         BIGSERIAL PRIMARY KEY,
  tipo       TEXT NOT NULL CHECK (tipo IN ('canal','direta')),
  canal      TEXT,                              -- preenchido quando tipo = 'canal'
  de_id      TEXT NOT NULL REFERENCES usuarios(id),
  para_id    TEXT REFERENCES usuarios(id),      -- preenchido quando tipo = 'direta'
  texto      TEXT NOT NULL,
  quando     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_mensagens_canal_idx ON chat_mensagens(canal, quando) WHERE tipo = 'canal';
CREATE INDEX IF NOT EXISTS chat_mensagens_direta_idx ON chat_mensagens(de_id, para_id, quando) WHERE tipo = 'direta';

-- Até onde cada pessoa leu cada conversa ('canal:vendas' ou 'dm:u1|u2')
CREATE TABLE IF NOT EXISTS chat_leitura (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  conversa   TEXT NOT NULL,
  lida_ate   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, conversa)
);
