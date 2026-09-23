-- Tentativas de login compartilhadas entre todas as cópias do servidor.
-- Em memória, cada cópia contava sozinha: com 3 cópias no ar, 6 tentativas viravam 18.
CREATE TABLE IF NOT EXISTS tentativas_login (
  chave         TEXT PRIMARY KEY,        -- 'conta:tatiane' ou 'ip:1.2.3.4|tatiane'
  n             INT NOT NULL DEFAULT 0,
  bloqueado_ate TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tentativas_login_limpeza ON tentativas_login (atualizado_em);
