// Quanto o cliente pagou, e quanto ele ainda deve.
//
// Uma parcela de US$ 225 paga no cartão tem três números, e todos os três
// estão guardados no registro: o cliente pagou 225 (bruto), a operadora ficou
// com 8,03 (taxa) e caíram 216,97 na conta do escritório (liquido).
//
// O erro que isso conserta: perguntar "quanto o cliente pagou" e responder com
// o que sobrou depois da taxa. Nove contratos quitados apareciam abaixo de
// 100% por causa disso — o Tiago Correia pagou os US$ 900 do contrato dele e o
// card dizia 98%. A taxa é custo do escritório, não dívida do cliente.
//
// E valorRecebido não responde isso sozinho, porque não tem uma convenção só:
// a importação do Bling grava o LÍQUIDO nele (596 de 596 lançamentos pagos
// conferidos em produção), e o webhook do Stripe grava o BRUTO
// (stripe-rotas.js, comoPaga). Por isso aqui não se pergunta a valorRecebido o
// que bruto e liquido sabem responder; valorRecebido só diz SE entrou algo.
//
// O espelho disto vive em docs/assets/comum.js (LW.pagoPeloCliente e
// LW.saldoDoCliente), e server/testes/pago-pelo-cliente.test.js prova que os
// dois lados respondem igual na mesma tabela de casos.

const centavos = (v) => Math.round((Number(v) || 0) * 100);
const reais = (c) => Math.round(Number(c) || 0) / 100;

/**
 * Quanto o CLIENTE pagou desta parcela, com a taxa da operadora de volta na
 * conta. Devolve 0 quando nada entrou.
 */
export function pagoPeloCliente(c) {
  const recebido = centavos(c && c.valorRecebido);
  if (recebido <= 0) return 0;
  const liquido = centavos(c && c.liquido);
  // bruto pode nao estar escrito: nesse caso ele E liquido + taxa, por
  // definicao, e so em ultimo caso o valor combinado da parcela.
  const bruto = centavos(c && c.bruto)
    || (liquido > 0 && centavos(c && c.taxa) > 0 ? liquido + centavos(c && c.taxa) : 0)
    || centavos(c && c.valor);
  // `bruto` MAIOR que o combinado não responde "quanto o cliente pagou".
  //
  // Medido em produção em 31/10/2026: 70 parcelas de 7 contratos têm `bruto`
  // diferente de `valor` — herança da importação do Bling. Num deles cada
  // parcela tem `bruto: 500` e `valor: 360,55`. O cliente pagou 360,55, entrou
  // 360,55 — e esta função respondia **500**, com saldo zero. US$ 139,45 a
  // mais, na pergunta mais sensível que o sistema responde. Faltam 68 parcelas
  // iguais a pagar, US$ 3.906 de diferença somada.
  //
  // `bruto` MENOR que o combinado continua valendo: é a operadora cobrando
  // menos, e aí o bruto é mesmo o que o cliente pagou. Só o maior é recusado,
  // e aí a resposta é o que de fato entrou.
  const combinado = centavos(c && c.valor);
  if (combinado > 0 && bruto > combinado + 1) return reais(recebido);
  // Só troca pelo bruto se a parcela foi paga INTEIRA — seja na convenção do
  // Bling (recebido == liquido) ou na do Stripe (recebido == bruto). Num
  // pagamento parcial o bruto é o total combinado, não o que ele pagou, e
  // aqui não se inventa rateio de taxa.
  const inteira = bruto > 0
    && (Math.abs(recebido - liquido) <= 1 || Math.abs(recebido - bruto) <= 1);
  return reais(inteira ? bruto : recebido);
}

/**
 * Quanto o cliente ainda deve desta parcela. Nunca negativo: quem pagou de
 * mais não fica com saldo ao contrário, isso é assunto de reembolso.
 */
export function saldoDoCliente(c) {
  const devido = centavos(c && c.valor);
  const pago = centavos(pagoPeloCliente(c));
  return reais(Math.max(0, devido - pago));
}

/**
 * Quanto ENTROU na conta do escritório — a outra pergunta, a de caixa. Aqui o
 * líquido é que vale, e a taxa fica fora.
 */
export function entrouNaConta(c) {
  const recebido = centavos(c && c.valorRecebido);
  if (recebido <= 0) return 0;
  const bruto = centavos(c && c.bruto);
  const liquido = centavos(c && c.liquido);
  // Convenção do Stripe: valorRecebido é o bruto, então o que caiu na conta é
  // o liquido. Na do Bling valorRecebido já é o liquido.
  const pagaPeloBruto = bruto > 0 && liquido > 0 && Math.abs(recebido - bruto) <= 1;
  return reais(pagaPeloBruto ? liquido : recebido);
}
