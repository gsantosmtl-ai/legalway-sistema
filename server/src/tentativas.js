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
    const nomes = chaves.map(c => (typeof c === 'string' ? c : c.chave));
    const { rows } = await query(
      `SELECT 1 FROM tentativas_login WHERE chave = ANY($1) AND bloqueado_ate > now() LIMIT 1`, [nomes]);
    return rows.length > 0;
  } catch { return false; }     // banco indisponível nunca pode impedir alguém de entrar
}

// Uma chave pode vir como texto (limite padrão) ou como {chave, max}. O limite por
// chave existe porque nem toda chave tem o mesmo peso: travar UMA conta com 6 erros é
// certo, mas travar um ENDEREÇO com 6 erros derrubaria gente inocente — operadora de
// celular põe milhares de clientes atrás do mesmo IP.
const partes = (c) => (typeof c === 'string' ? { chave: c, max: MAX } : { chave: c.chave, max: c.max || MAX });

export async function errou(chaves) {
  for (const bruta of chaves) {
    const { chave, max } = partes(bruta);
    try {
      await query(
        `INSERT INTO tentativas_login (chave, n, atualizado_em) VALUES ($1, 1, now())
         ON CONFLICT (chave) DO UPDATE SET
           n = CASE WHEN tentativas_login.atualizado_em < now() - interval '${ESQUECER_MIN} minutes' THEN 1 ELSE tentativas_login.n + 1 END,
           bloqueado_ate = CASE WHEN (CASE WHEN tentativas_login.atualizado_em < now() - interval '${ESQUECER_MIN} minutes' THEN 1 ELSE tentativas_login.n + 1 END) >= $2
                                THEN now() + interval '${TRAVA_MIN} minutes' ELSE tentativas_login.bloqueado_ate END,
           atualizado_em = now()`, [chave, max]);
    } catch { /* nunca derruba o login por causa do contador */ }
  }
}

export async function acertou(chaves) {
  // A chave por origem NÃO é apagada num acerto: senão bastaria uma senha certa no
  // meio da varredura para zerar o contador e recomeçar.
  const nomes = chaves.map(c => (typeof c === 'string' ? c : c.chave)).filter(n => !n.startsWith('portal-origem:'));
  try { await query('DELETE FROM tentativas_login WHERE chave = ANY($1)', [nomes]); } catch {}
}

// Limpeza do que não interessa mais (roda junto com as automações do dia)
export async function limparTentativas() {
  try { await query(`DELETE FROM tentativas_login WHERE atualizado_em < now() - interval '1 day' AND (bloqueado_ate IS NULL OR bloqueado_ate < now())`); } catch {}
}
