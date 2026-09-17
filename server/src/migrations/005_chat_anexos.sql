-- Anexos no chat (imagem, PDF, documentos): o arquivo vai pra tabela `arquivos`, a mensagem guarda a referência
ALTER TABLE chat_mensagens ADD COLUMN IF NOT EXISTS arquivo_id   TEXT REFERENCES arquivos(id);
ALTER TABLE chat_mensagens ADD COLUMN IF NOT EXISTS arquivo_nome TEXT;
ALTER TABLE chat_mensagens ADD COLUMN IF NOT EXISTS arquivo_tipo TEXT;
