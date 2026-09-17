-- Prova das assinaturas eletrônicas. Tabela só de INSERT: nunca é editada nem apagada (gatilho abaixo garante).
CREATE TABLE IF NOT EXISTS assinaturas (
  id             TEXT PRIMARY KEY,           -- 32 hex aleatórios
  contrato_id    TEXT NOT NULL,
  token          TEXT NOT NULL,              -- token do link usado (prova que o link foi emitido pelo sistema)
  nome_digitado  TEXT NOT NULL,              -- nome completo que a pessoa digitou ao assinar
  nome_link      TEXT,                       -- nome que estava no link (cadastro)
  email          TEXT,
  telefone       TEXT,
  servico        TEXT,
  termos         JSONB NOT NULL,             -- todos os termos do link (valores, parcelas, datas...)
  consentimentos JSONB NOT NULL,             -- textos que a pessoa marcou
  hash_termos    TEXT NOT NULL,              -- sha256 dos termos (JSON canônico)
  hash_contrato  TEXT NOT NULL,              -- sha256 do PDF do contrato como o cliente viu/assinou
  hash_final     TEXT NOT NULL,              -- sha256 do PDF final (contrato + página de certificado)
  arquivo_final  TEXT NOT NULL,              -- id em `arquivos` do PDF final
  assinatura_png TEXT,                       -- id em `arquivos` da imagem da assinatura
  ip             TEXT,
  user_agent     TEXT,
  assinado_em    TIMESTAMPTZ NOT NULL DEFAULT now()  -- hora do SERVIDOR
);
CREATE INDEX IF NOT EXISTS assinaturas_contrato_idx ON assinaturas(contrato_id);
CREATE INDEX IF NOT EXISTS assinaturas_hash_final_idx ON assinaturas(hash_final);
CREATE INDEX IF NOT EXISTS assinaturas_hash_contrato_idx ON assinaturas(hash_contrato);

CREATE OR REPLACE FUNCTION assinaturas_imutaveis() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registros de assinatura não podem ser alterados nem apagados.';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS assinaturas_bloqueio ON assinaturas;
CREATE TRIGGER assinaturas_bloqueio BEFORE UPDATE OR DELETE ON assinaturas FOR EACH ROW EXECUTE FUNCTION assinaturas_imutaveis();
