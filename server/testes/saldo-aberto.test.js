// A regra do saldo em aberto já errou nas duas pontas: primeiro mostrando
// saldo devedor em parcela quitada no cartão (o valor da taxa), depois
// diminuindo a inadimplência pela taxa de uma parcela que ninguém pagou.
// Estes testes fixam as duas pontas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');
const corpo = html.match(/function saldoAberto\(c\)\{[\s\S]*?\n\}/)[0];
const saldoAberto = new Function(corpo + '; return saldoAberto;')();

test('parcela em aberto deve o BRUTO, não o líquido', () => {
  // US$ 300,00 vencida, nada recebido: o cliente deve 300, não 291.
  assert.equal(saldoAberto({ valor: 300, liquido: 291, taxa: 9, valorRecebido: 0 }), 300);
});

test('parcela paga no cartão não deixa saldo', () => {
  // Entraram 291 líquidos de uma de 300: quitada. Os 9 são taxa do escritório.
  assert.equal(saldoAberto({ valor: 300, liquido: 291, taxa: 9, valorRecebido: 291 }), 0);
});

test('pagamento parcial desconta do líquido', () => {
  assert.equal(saldoAberto({ valor: 300, liquido: 291, taxa: 9, valorRecebido: 100 }), 191);
});

test('parcela sem taxa se comporta igual', () => {
  assert.equal(saldoAberto({ valor: 500, valorRecebido: 0 }), 500);
  assert.equal(saldoAberto({ valor: 500, valorRecebido: 500 }), 0);
});

test('parcela sem dado de líquido não inventa desconto', () => {
  // As 821 parcelas futuras não têm líquido: devem o valor cheio.
  assert.equal(saldoAberto({ valor: 415, valorRecebido: 0 }), 415);
});
