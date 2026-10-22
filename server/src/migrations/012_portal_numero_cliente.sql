-- Número do cliente como login do portal: 00032.
--
-- Telefone e e-mail continuam valendo. O número existe porque é fácil de ditar por
-- telefone, serve de referência para o escritório e não depende de o cliente ter
-- e-mail nem de lembrar como o telefone foi cadastrado.
--
-- Sequencial de propósito: um código embaralhado seria mais difícil de adivinhar, mas
-- impossível de passar por telefone sem erro. A conta é segura porque a SENHA é o que
-- protege — e porque a trava por origem (012, no código) impede alguém de varrer a
-- sequência tentando senha em cada número.
ALTER TABLE portal_clientes ADD COLUMN IF NOT EXISTS numero INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS portal_clientes_numero_unico
  ON portal_clientes (numero) WHERE numero IS NOT NULL;

-- Dá número a quem já tem acesso, na ordem em que foram criados.
WITH ordenados AS (
  SELECT id, row_number() OVER (ORDER BY criado_em, id) AS n
  FROM portal_clientes WHERE numero IS NULL
)
UPDATE portal_clientes p SET numero = o.n FROM ordenados o WHERE p.id = o.id;
