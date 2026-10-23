// O saldo inicial ganhou data em 21/10/2026, depois da conciliação mostrar que o saldo
// das contas no sistema não tinha como bater com o extrato: o número de abertura era
// somado a TODO o histórico, sem dizer a partir de quando valia.
//
// Este teste extrai as funções do próprio financeiro.html e roda contra elas. Testar
// uma cópia não provaria nada — o erro moraria no original.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function carregar(contas, receber, pagar, transferencias) {
  const html = readFileSync(new URL('../../docs/financeiro.html', import.meta.url).pathname, 'utf8');
  const corte = html.slice(html.indexOf('function dentroDoCorte('), html.indexOf('// Quantos lançamentos ficaram de fora'));
  // O saldo passou a somar em CENTAVOS (4,56 + 1,23 em float não dava 5,79).
  // Os helpers moram no comum.js, que esta tela carrega — aqui entram no
  // contexto do mesmo jeito.
  const LW = {
    centavos: (v)=> Math.round((Number(v) || 0) * 100),
    reais: (c)=> Math.round(Number(c) || 0) / 100,
  };
  const ctx = { contasBancarias: contas, contasReceber: receber, contasPagar: pagar, transferencias, LW };
  vm.createContext(ctx);
  vm.runInContext(corte, ctx);
  return ctx;
}

test('sem data de corte, o saldo conta o histórico inteiro — como era antes', () => {
  const c = carregar(
    [{ nome: 'Truist', saldoInicial: 1000 }],
    [{ conta: 'Truist', valorRecebido: 500, dataRecebimento: '2020-01-01' }],
    [], []);
  assert.equal(c.calcularSaldoConta('Truist'), 1500);
});

test('com data de corte, lançamento anterior não entra', () => {
  const c = carregar(
    [{ nome: 'Truist', saldoInicial: 1000, dataInicio: '2026-10-23' }],
    [{ conta: 'Truist', valorRecebido: 500, dataRecebimento: '2026-10-22' },   // antes: fora
     { conta: 'Truist', valorRecebido: 300, dataRecebimento: '2026-10-24' }],  // depois: entra
    [], []);
  assert.equal(c.calcularSaldoConta('Truist'), 1300);
});

test('o próprio dia do corte entra — o saldo é o de fechamento daquele dia', () => {
  const c = carregar(
    [{ nome: 'Truist', saldoInicial: 100, dataInicio: '2026-10-23' }],
    [{ conta: 'Truist', valorRecebido: 50, dataRecebimento: '2026-10-23' }],
    [], []);
  assert.equal(c.calcularSaldoConta('Truist'), 150);
});

test('lançamento sem data fica de fora quando há corte, e entra quando não há', () => {
  const semData = [{ conta: 'Truist', valorRecebido: 900, dataRecebimento: null }];
  const comCorte = carregar([{ nome: 'Truist', saldoInicial: 0, dataInicio: '2026-10-23' }], semData, [], []);
  assert.equal(comCorte.calcularSaldoConta('Truist'), 0, 'sem data não dá para afirmar que é posterior ao corte');
  const semCorte = carregar([{ nome: 'Truist', saldoInicial: 0 }], semData, [], []);
  assert.equal(semCorte.calcularSaldoConta('Truist'), 900, 'sem corte, o comportamento antigo se mantém');
});

test('pagamento e transferência também respeitam o corte', () => {
  const c = carregar(
    [{ nome: 'Truist', saldoInicial: 1000, dataInicio: '2026-10-23' }],
    [],
    [{ conta: 'Truist', status: 'Pago', valor: 100, pagoEm: '2026-10-20' },    // antes: fora
     { conta: 'Truist', status: 'Pago', valor: 200, pagoEm: '2026-10-25' }],   // depois: entra
    [{ para: 'Truist', valor: 50, data: '2026-10-22' },                        // antes: fora
     { para: 'Truist', valor: 70, data: '2026-10-24' },                        // depois: entra
     { de: 'Truist', valor: 30, data: '2026-10-26' }]);                        // depois: sai
  assert.equal(c.calcularSaldoConta('Truist'), 1000 - 200 + 70 - 30);
});
