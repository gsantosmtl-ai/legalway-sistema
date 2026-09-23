// Contador de senhas erradas, guardado no banco (não na memória).
// Motivo: o servidor roda em mais de uma cópia ao mesmo tempo. Contando na memória, cada cópia
// contava separado e o limite de 6 tentativas virava 6 vezes o número de cópias.
// Contamos por CONTA e por IP+CONTA: quem troca de endereço a cada tentativa continua barrado pela conta.
import { query } from './db.js';

const MAX = 6;                 // erros seguidos até travar
const TRAVA_MIN = 10;          // minutos de trava
const ESQUECER_MIN = 15;       // sem errar por esse tempo, a conta recomeça do zero

export async function travado(chaves) {
  try {
    const { rows } = await query(
      `SELECT 1 FROM tentativas_login WHERE chave = ANY($1) AND bloqueado_ate > now() LIMIT 1`, [chaves]);
    return rows.length > 0;
  } catch { return false; }     // banco indisponível nunca pode impedir alguém de entrar
}

export async function errou(chaves) {
  for (const chave of chaves) {
    try {
      await query(
        `INSERT INTO tentativas_login (chave, n, atualizado_em) VALUES ($1, 1, now())
         ON CONFLICT (chave) DO UPDATE SET
           n = CASE WHEN tentativas_login.atualizado_em < now() - interval '${ESQUECER_MIN} minutes' THEN 1 ELSE tentativas_login.n + 1 END,
           bloqueado_ate = CASE WHEN (CASE WHEN tentativas_login.atualizado_em < now() - interval '${ESQUECER_MIN} minutes' THEN 1 ELSE tentativas_login.n + 1 END) >= ${MAX}
                                THEN now() + interval '${TRAVA_MIN} minutes' ELSE tentativas_login.bloqueado_ate END,
           atualizado_em = now()`, [chave]);
    } catch { /* nunca derruba o login por causa do contador */ }
  }
}

export async function acertou(chaves) {
  try { await query('DELETE FROM tentativas_login WHERE chave = ANY($1)', [chaves]); } catch {}
}

// Limpeza do que não interessa mais (roda junto com as automações do dia)
export async function limparTentativas() {
  try { await query(`DELETE FROM tentativas_login WHERE atualizado_em < now() - interval '1 day' AND (bloqueado_ate IS NULL OR bloqueado_ate < now())`); } catch {}
}
