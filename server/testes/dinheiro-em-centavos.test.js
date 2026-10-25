// Uma parcela de US$ 5,79 paga em duas vezes — 4,56 e 1,23 — ficava "Pago
// parcialmente" PARA SEMPRE.
//
// Não é bug de arredondamento de tela: 4.56 + 1.23 dá 5.789999999999999 em
// ponto flutuante, que é MENOR que 5.79. A parcela nunca fechava, o cliente
// aparecia devendo um milionésimo de centavo, e ia para a inadimplência.
//
// Dinheiro se soma e se compara em centavos inteiros. Reais só na hora de
// mostrar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const fin = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');

function helpers() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  const i = comum.indexOf('window.LW.centavos');
  const fim = comum.indexOf('window.LW.fimDoTelefone');
  vm.runInContext('var LW = {}; window.LW = LW;\n' + comum.slice(i, fim).replace(/window\.LW\./g, 'LW.'), ctx);
  return ctx.LW;
}

test('o caso que não fechava: 4,56 + 1,23 = 5,79', () => {
  const LW = helpers();
  assert.equal(4.56 + 1.23 >= 5.79, false, 'é assim que o defeito nascia');
  assert.equal(LW.somarDinheiro(4.56, 1.23), 5.79);
  assert.equal(LW.centavos(LW.somarDinheiro(4.56, 1.23)) >= LW.centavos(5.79), true, 'agora fecha');
});

test('centavos e reais, ida e volta', () => {
  const LW = helpers();
  assert.equal(LW.centavos(5.79), 579);
  assert.equal(LW.centavos('177.50'), 17750);
  assert.equal(LW.centavos(null), 0);
  assert.equal(LW.centavos(undefined), 0);
  assert.equal(LW.centavos('abc'), 0, 'texto que não é número não pode virar NaN no saldo');
  assert.equal(LW.reais(579), 5.79);
  assert.equal(LW.reais(0), 0);
});

test('somar muitas parcelas não acumula erro', () => {
  const LW = helpers();
  // 0,1 somado dez vezes dá 0.9999999999999999 em ponto flutuante.
  const dez = Array(10).fill(0.1);
  assert.notEqual(dez.reduce((s, v) => s + v, 0), 1, 'em float, não dá 1');
  assert.equal(LW.somarDinheiro(...dez), 1);
  // Um contrato de 5.490 em 12 parcelas
  const parcela = 457.5;
  assert.equal(LW.somarDinheiro(...Array(12).fill(parcela)), 5490);
});

test('a baixa de parcela soma e compara em centavos', () => {
  const i = fin.indexOf("const valorPago = Number(document.getElementById('baixa-valor')");
  const corpo = fin.slice(i, i + 1400);
  assert.match(corpo, /c\.valorRecebido = LW\.somarDinheiro\(c\.valorRecebido, valorPago\)/);
  assert.match(corpo, /LW\.centavos\(c\.valorRecebido\) >= LW\.centavos\(c\.valor\) \? 'Pago' : 'Pago parcialmente'/);
  assert.ok(!/c\.valorRecebido >= Number\(c\.valor\)/.test(corpo), 'a comparação em float não pode voltar');
});

test('o saldo da conta bancária é somado em centavos', () => {
  // Soma e subtrai quatro listas: é onde o erro mais se acumula, e é número
  // que alguém confere contra o extrato do banco.
  const i = fin.indexOf('const saldoInicial = Number(conta.saldoInicial || 0)');
  const corpo = fin.slice(i, i + 1400);
  assert.match(corpo, /const somaCent = \(lista, pegar\)=> lista\.reduce\(\(s,x\)=> s \+ cent\(pegar\(x\)\), 0\)/);
  assert.match(corpo, /return LW\.reais\(cent\(saldoInicial\) \+ recebido - pago \+ entrou - saiu\)/);
  assert.ok(!/s\+Number\(c\.valorRecebido\|\|0\),0\)/.test(corpo), 'nenhuma das quatro somas pode voltar a float');
});

test('o saldo em aberto de uma parcela também', () => {
  // A conta saiu daqui e foi para LW.saldoDoCliente, que subtrai em centavos
  // (pago-pelo-cliente.test.js cobre o valor devolvido). O que importa checar
  // aqui é que a tela delega, e que ninguém trouxe a subtração em float de
  // volta junto com a taxa.
  assert.match(fin, /const saldoAberto = \(c\)=> LW\.saldoDoCliente\(c\);/);
  const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
  const i = comum.indexOf('window.LW.saldoDoCliente =');
  const corpo = comum.slice(i, comum.indexOf('\n  };', i));
  assert.match(corpo, /LW\.centavos\(c && c\.valor\) - LW\.centavos\(LW\.pagoPeloCliente\(c\)\)/);
});
