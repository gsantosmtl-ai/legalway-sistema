-- Avisos no celular (Web Push). O vendedor instala o sistema na tela de início
-- e recebe a notificação mesmo com o app fechado — toca e cai na Entrada de
-- Leads para assumir.
--
-- Uma linha por APARELHO, não por pessoa: a mesma pessoa pode ter o celular e
-- o computador, e cada um tem endereço próprio.
CREATE TABLE IF NOT EXISTS push_assinaturas (
  endpoint     TEXT PRIMARY KEY,       -- endereço que o navegador dá; é único por aparelho
  usuario_id   TEXT NOT NULL,
  p256dh       TEXT NOT NULL,          -- chave pública do aparelho (base64url)
  auth         TEXT NOT NULL,          -- segredo do aparelho (base64url)
  aparelho     TEXT,                   -- texto livre só para a pessoa se reconhecer na lista
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_ok    TIMESTAMPTZ,
  falhas       INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_assinaturas_usuario ON push_assinaturas (usuario_id);

-- O par de chaves VAPID do servidor. Fica em tabela própria, e NÃO no
-- armazenamento: o armazenamento é lido pelas telas, e a chave privada não
-- pode chegar ao navegador de ninguém. Nasce sozinha no primeiro uso.
CREATE TABLE IF NOT EXISTS push_chaves (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  publica    TEXT NOT NULL,            -- 65 bytes não comprimidos, base64url
  privada    TEXT NOT NULL,            -- PEM pkcs8
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
