-- Login do portal pelo TELEFONE.
--
-- O escritório atende muita gente que não usa e-mail: pedir e-mail para entrar deixava
-- o portal inacessível justamente para quem mais precisa dele. O e-mail continua
-- valendo como login — quem já recebeu acesso não perde o que tinha, e cliente sem
-- telefone cadastrado (são 35 dos 264) continua entrando pelo e-mail.
--
-- Guardado só com dígitos, para o cliente poder digitar (68) 9288-4130, 68928841 30
-- ou +5568928841 30 e entrar do mesmo jeito.
ALTER TABLE portal_clientes ADD COLUMN IF NOT EXISTS telefone TEXT;

-- Único quando existe: duas pessoas com o mesmo número tornariam o login ambíguo, e
-- o sistema não teria como saber qual processo abrir.
CREATE UNIQUE INDEX IF NOT EXISTS portal_clientes_telefone_unico
  ON portal_clientes (telefone) WHERE telefone IS NOT NULL;
