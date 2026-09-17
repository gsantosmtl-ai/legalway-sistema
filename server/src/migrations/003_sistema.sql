-- Usuário "Sistema": autor das mensagens automáticas no chat (contrato assinado etc.). Inativo = não faz login nem aparece na lista.
INSERT INTO usuarios (id, nome, usuario, senha_hash, cargo, papel, acesso_total, permissoes, ativo, trocar_senha)
VALUES ('sistema', 'Sistema', 'sistema', '*', 'Avisos automáticos', 'sistema', false, '{}'::jsonb, false, false)
ON CONFLICT (id) DO NOTHING;
