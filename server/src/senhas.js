// Regra única de senha pro sistema todo: tamanho mínimo e recusa das senhas óbvias.
// Fica num arquivo só pra não existir uma regra diferente em cada tela.
const MINIMO = 8;

// As que aparecem em qualquer lista de senhas vazadas, mais as óbvias deste escritório.
const OBVIAS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'senha123', 'senha1234',
  'qwertyui', 'abc12345', '11111111', '00000000', 'iloveyou', 'sunshine', 'princess',
  'legalway', 'legalway1', 'legalway123', 'legalway2025', 'legalway2026', 'imigracao',
  'advogado', 'mudar123', 'trocar123', 'admin123', 'administrador',
]);

export function problemaNaSenha(senha, { nome, usuario, email } = {}) {
  const s = String(senha || '');
  if (s.length < MINIMO) return `A senha precisa ter pelo menos ${MINIMO} caracteres.`;
  const baixa = s.toLowerCase();
  if (OBVIAS.has(baixa)) return 'Essa senha é fácil demais de adivinhar. Escolha outra.';
  if (/^(.)\1+$/.test(s)) return 'Uma senha com a mesma letra repetida não protege nada. Escolha outra.';
  if (/^(012345|123456|234567|345678|456789|abcdef|qwerty)/.test(baixa)) return 'Sequências como 123456 ou qwerty são as primeiras que um invasor tenta. Escolha outra.';
  for (const dado of [nome, usuario, email]) {
    const d = String(dado || '').toLowerCase().split('@')[0];
    if (d.length >= 4 && baixa.includes(d)) return 'A senha não pode conter o seu nome ou o seu login.';
  }
  return null;
}
