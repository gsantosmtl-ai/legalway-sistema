-- Migração de todos os módulos: os dados que ficavam no localStorage passam pra cá,
-- com o mesmo formato (uma chave -> um bloco JSON), mais controle de versão pra mesclar edições simultâneas.

CREATE TABLE IF NOT EXISTS armazenamento (
  chave          TEXT PRIMARY KEY,
  valor          JSONB NOT NULL,
  versao         INTEGER NOT NULL DEFAULT 1,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por TEXT
);

-- Histórico recente de cada chave (pra mesclar em 3 vias quando duas pessoas salvam ao mesmo tempo)
CREATE TABLE IF NOT EXISTS armazenamento_hist (
  chave    TEXT NOT NULL,
  versao   INTEGER NOT NULL,
  valor    JSONB NOT NULL,
  salvo_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chave, versao)
);

-- Arquivos (documentos, comprovantes, traduções, PDFs assinados). Antes ficavam embutidos em base64 no JSON.
CREATE TABLE IF NOT EXISTS arquivos (
  id         TEXT PRIMARY KEY,           -- 32 hex aleatórios: o link é a chave de acesso
  nome       TEXT,
  tipo       TEXT NOT NULL,              -- content-type
  tamanho    INTEGER NOT NULL,
  conteudo   BYTEA NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por TEXT
);

-- Tokens que dão acesso limitado a páginas públicas (cliente assinando contrato, prestador no portal)
CREATE TABLE IF NOT EXISTS tokens_publicos (
  token     TEXT PRIMARY KEY,
  tipo      TEXT NOT NULL,               -- 'assinatura' | 'portal'
  dados     JSONB NOT NULL,              -- ex.: {"contratoId":"c123"} ou {"processoId":"p456"}
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL,
  criado_por TEXT
);
