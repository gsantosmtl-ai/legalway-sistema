-- Cada pessoa recebe no celular os avisos DOS DEPARTAMENTOS DELA.
--
-- Não dá para deduzir do papel: Adriano (vendas), Peterson (financeiro) e
-- Vitória (documentação) são todos 'socio'. Então a própria pessoa escolhe
-- quando liga o aviso no aparelho.
--
-- Vazio ou NULL = recebe tudo. É o que os aparelhos ligados antes desta
-- mudança já têm, e mantém o comportamento de antes para eles.
ALTER TABLE push_assinaturas ADD COLUMN IF NOT EXISTS canais TEXT;
