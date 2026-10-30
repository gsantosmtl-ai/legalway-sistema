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
  // Não é um estado de vida do contrato: é a correção de um engano de cadastro.
  // Tradução, taxa, SEVIS e laudo são ADICIONAIS do serviço contratado — a
  // regra dela, de 27/10. Quando um deles foi cadastrado como contrato próprio,
  // juntá-lo ao contrato de verdade deixa este aqui sem razão de existir.
  // Cancelar seria mentira (ninguém cancelou, e o cliente pagou); apagar
  // perderia o rastro. Então ele ganha estado próprio e sai de todas as contas.
  adicional: { chave: 'adicional', rotulo: 'Virou adicional', icone: '↳' },
};

/** 'ativo' | 'pausado' | 'cancelado'. Contrato ausente conta como ativo. */
export function statusDoContrato(c) {
  if (!c || typeof c !== 'object') return 'ativo';
  // Vem ANTES de cancelado: quem virou adicional não é contrato nenhum, nem
  // vivo nem cancelado, e não pode aparecer em contagem de nenhum dos dois.
  if (c.virouAdicionalDe) return 'adicional';
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
  // O campo que a tela de Contratos GRAVA chama-se `canceladoMotivo`; aqui se
  // lia `motivoCancelamento`. Nomes trocados, e por isso o motivo do
  // cancelamento — que o sistema passou a exigir de quem cancela — nunca
  // aparecia em lugar nenhum. Lê os dois: os registros antigos podem ter
  // qualquer um dos dois nomes, e nenhum deles vai ser reescrito só por isso.
  if (s === 'cancelado') return String((c && (c.canceladoMotivo || c.motivoCancelamento)) || '').trim();
  if (s === 'adicional') return String((c && c.virouAdicionalMotivo) || '').trim();
  return '';
}

/** Aparece no funil da Documentação? Cancelado não; pausado sim. */
export const noFunilDeDocumentos = (c) => {
  const s = statusDoContrato(c);
  return s !== 'cancelado' && s !== 'adicional';
};

/** Aparece no Contas a Receber operacional? Só o ativo. */
export const noContasAReceber = (c) => statusDoContrato(c) === 'ativo';

/**
 * Conta como contrato — em total, faturamento, assinados, cancelados, gráfico?
 *
 * É a pergunta que as telas fazem antes de somar. Quem virou adicional responde
 * NÃO a todas elas de uma vez: foi o mesmo dinheiro cobrado uma vez só, e já
 * está contado na parcela que passou para o contrato de verdade. Contar aqui
 * também seria cobrar duas vezes no relatório.
 */
export const contaComoContrato = (c) => statusDoContrato(c) !== 'adicional';
