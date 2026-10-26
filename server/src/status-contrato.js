// O status operacional do contrato: ATIVO, PAUSADO ou CANCELADO.
//
// Antes cada tela respondia essa pergunta do seu jeito. O card da Documentação
// mostrava a situação da FICHA (`processo.situacao`), que é outra coisa: dá
// para ter ficha cancelada em contrato vivo e contrato cancelado com ficha
// ativa. O pedido dela foi explícito — "o status deverá ser obtido da fonte
// oficial do contrato, e não de um texto independente salvo no card".
//
// A fonte oficial já existia e estava sendo usada por uma tela só:
//
//   CANCELADO = contrato.etapa === 'Cancelado'
//   PAUSADO   = contrato.pausa  (gravado por quem pausou, com motivo e autor)
//   ATIVO     = o resto
//
// A pausa é um estado DECLARADO, não deduzido de inadimplência: ela escreveu
// que "não considerar todo cliente inadimplente automaticamente como pausado".
// Quem pausa escreve o motivo e fica no histórico; reativar apaga `pausa`.
//
// Onde cada um aparece:
//
//   ATIVO     — Documentação e Contas a Receber.
//   PAUSADO   — Documentação sim (o processo continua andando), Contas a
//               Receber não (a cobrança está suspensa).
//   CANCELADO — fora dos dois funis operacionais, e inteiro no histórico.
//
// O espelho vive em docs/assets/comum.js (LW.statusDoContrato) e
// server/testes/status-do-contrato.test.js prova que os dois respondem igual.

export const STATUS = {
  ativo: { chave: 'ativo', rotulo: 'Ativo', icone: '●' },
  pausado: { chave: 'pausado', rotulo: 'Pausado', icone: '⏸' },
  cancelado: { chave: 'cancelado', rotulo: 'Cancelado', icone: '✖' },
};

/** 'ativo' | 'pausado' | 'cancelado'. Contrato ausente conta como ativo. */
export function statusDoContrato(c) {
  if (!c || typeof c !== 'object') return 'ativo';
  if (String(c.etapa || '') === 'Cancelado') return 'cancelado';
  // Cancelado ganha da pausa: um contrato pausado que depois foi cancelado
  // está cancelado, e mostrar "pausado" esconderia o fato mais importante.
  if (c.pausa && typeof c.pausa === 'object') return 'pausado';
  return 'ativo';
}

/** O motivo, para a tela mostrar junto do selo. */
export function motivoDoStatus(c) {
  const s = statusDoContrato(c);
  if (s === 'pausado') return String((c.pausa && c.pausa.motivo) || '').trim();
  if (s === 'cancelado') return String(c && (c.motivoCancelamento || '') || '').trim();
  return '';
}

/** Aparece no funil da Documentação? Cancelado não; pausado sim. */
export const noFunilDeDocumentos = (c) => statusDoContrato(c) !== 'cancelado';

/** Aparece no Contas a Receber operacional? Só o ativo. */
export const noContasAReceber = (c) => statusDoContrato(c) === 'ativo';
