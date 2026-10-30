// Conta em real não entra no total em dólar.
//
// Pedido dela: "a conta do C6 do Brasil é em Real". As contas do LIV não
// tinham moeda — só nome e saldo inicial — e o "Total em caixa" somava as
// seis como se todas fossem dólar. O saldo do C6, em reais, entrava ali.
//
// O Bling faz o mesmo por padrão: mostra "Saldo atual R$ 30.415,04" somando
// as cinco contas dele, duas moedas juntas.
//
// Regra dela, que vale em todo projeto: NUNCA somar US$ com R$, e não
// converter sem ela mandar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');
const semComent = tela.replace(/^\s*\/\/.*$/gm, '');

function corpoDe(nome) {
  const i = semComent.indexOf('function ' + nome + '(');
  assert.ok(i > 0, 'não achei ' + nome);
  let nivel = 0, j = semComent.indexOf('{', i);
  for (; j < semComent.length; j++) {
    if (semComent[j] === '{') nivel++;
    else if (semComent[j] === '}') { nivel--; if (!nivel) break; }
  }
  return semComent.slice(i, j + 1);
}

test('a conta sabe em que moeda ela está', () => {
  const c = corpoDe('moedaDaConta');
  assert.match(c, /moeda === 'BRL'/, 'a moeda da conta deixou de ser lida');
  assert.match(c, /'USD'/, 'sem moeda declarada tem de continuar valendo dólar');
});

test('o total em caixa soma SÓ as contas em dólar', () => {
  const c = corpoDe('renderSaldosContas');
  assert.match(c, /moedaDaConta\(cb\.nome\) === 'USD'/,
    'o total voltou a somar todas as contas — conta em real entraria no total em dólar');
  assert.ok(!/contasBancarias\.reduce\(\(s,cb\)=>s\+calcularSaldoConta/.test(c),
    'ainda existe uma soma de TODAS as contas sem separar moeda');
});

test('o saldo em real aparece, e aparece em real', () => {
  const c = corpoDe('renderSaldosContas');
  assert.match(c, /fmtMoeda\(/, 'os cards voltaram a formatar tudo como dólar');
  assert.match(c, /não somados/, 'o total precisa dizer que o valor em real ficou de fora');
});

test('o formatador de real não escreve US$', () => {
  const c = corpoDe('fmtMoeda');
  assert.match(c, /'R\$ '/, 'real tem de sair com R$');
  assert.match(c, /pt-BR/, 'real formatado no padrão brasileiro');
});

test('nada é convertido sozinho', () => {
  // conversão exige a cotação do dia, que é decisão dela — o sistema não
  // pode inventar uma taxa para fechar um total bonito
  for (const termo of ['cotacao', 'cotação', 'taxaCambio', 'exchangeRate', 'converterMoeda']) {
    assert.ok(!semComent.includes(termo),
      `a tela passou a converter moeda sozinha (achei "${termo}") — a cotação é decisão dela`);
  }
});
