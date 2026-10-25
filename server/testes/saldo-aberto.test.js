// A regra do saldo em aberto já errou nas duas pontas: primeiro mostrando
// saldo devedor em parcela quitada no cartão (o valor da taxa), depois
// diminuindo a inadimplência pela taxa de uma parcela que ninguém pagou.
// Estes testes fixam as duas pontas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A regra saiu de dentro do financeiro.html e virou LW.saldoDoCliente /
// saldoDoCliente, com uma cópia no navegador e uma no servidor que
// pago-pelo-cliente.test.js prova serem iguais. O financeiro.html agora só
// delega — e o teste abaixo confere que ele continua delegando, em vez de
// refazer a conta na mão.
import { saldoDoCliente as saldoAberto } from '../src/pagamento.js';

const html = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');

test('o financeiro.html delega, não refaz a conta', () => {
  assert.match(html, /const saldoAberto = \(c\)=> LW\.saldoDoCliente\(c\);/);
});

test('parcela em aberto deve o BRUTO, não o líquido', () => {
  // US$ 300,00 vencida, nada recebido: o cliente deve 300, não 291.
  assert.equal(saldoAberto({ valor: 300, liquido: 291, taxa: 9, valorRecebido: 0 }), 300);
});

test('parcela paga no cartão não deixa saldo', () => {
  // Entraram 291 líquidos de uma de 300: quitada. Os 9 são taxa do escritório.
  assert.equal(saldoAberto({ valor: 300, liquido: 291, taxa: 9, valorRecebido: 291 }), 0);
});

test('pagamento parcial não ganha desconto de taxa que não houve', () => {
  // Este número mudou de 191 para 200, e a mudança é o conserto.
  //
  // A taxa de 9 é a prevista para a parcela INTEIRA. Quem pagou 100 de 300 só
  // gerou taxa sobre os 100 que passaram no cartão; descontar os 9 cheios
  // significa perdoar taxa sobre os 200 que ninguém pagou ainda. Era a mesma
  // ponta do erro que este arquivo já descreve no alto — a inadimplência
  // ficando menor por causa de taxa de parcela não paga —, consertada só pela
  // metade na primeira vez.
  //
  // Hoje não há nenhuma parcela "Pago parcialmente" em produção (3.845
  // lançamentos conferidos), então nenhum número de tela muda com isso agora.
  assert.equal(saldoAberto({ valor: 300, liquido: 291, taxa: 9, valorRecebido: 100 }), 200);
});

test('parcela sem taxa se comporta igual', () => {
  assert.equal(saldoAberto({ valor: 500, valorRecebido: 0 }), 500);
  assert.equal(saldoAberto({ valor: 500, valorRecebido: 500 }), 0);
});

test('parcela sem dado de líquido não inventa desconto', () => {
  // As 821 parcelas futuras não têm líquido: devem o valor cheio.
  assert.equal(saldoAberto({ valor: 415, valorRecebido: 0 }), 415);
});
