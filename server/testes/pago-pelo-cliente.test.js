// A taxa do cartão não é dívida do cliente.
//
// Nove contratos QUITADOS apareciam abaixo de 100% em produção porque a
// pergunta "quanto o cliente pagou" era respondida com valorRecebido, que
// guarda o líquido nos lançamentos vindos do Bling. O Tiago Correia pagou os
// US$ 900 do contrato dele e o card dizia 98%.
//
// E tem a armadilha de verdade: valorRecebido NÃO tem uma convenção só. O
// Bling grava o líquido nele; o webhook do Stripe grava o bruto
// (stripe-rotas.js, comoPaga). Qualquer conserto que simplesmente somasse a
// taxa de volta ia contar em dobro nos pagamentos do Stripe.
//
// Este teste roda a MESMA tabela de casos nas duas implementações — a do
// servidor e a do navegador, extraída do comum.js e executada num vm — porque
// a regra duplicada em dois arquivos só se mantém honesta se algo quebrar
// quando uma das duas mudar sozinha.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { pagoPeloCliente, saldoDoCliente, entrouNaConta } from '../src/pagamento.js';

// --- a cópia do navegador, rodando de verdade -------------------------------

function carregarComum() {
  const fonte = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
  const ctx = createContext({ window: { LW: {} }, Math, Number, String, JSON });
  ctx.LW = ctx.window.LW;
  // Só os pedaços que interessam: centavos/reais e as três funções novas.
  const pedacos = ['centavos', 'reais', 'pagoPeloCliente', 'saldoDoCliente', 'entrouNaConta']
    .map((nome) => recortar(fonte, 'window.LW.' + nome + ' ='));
  for (const p of pedacos) runInContext(p, ctx);
  return ctx.LW;
}

// Recorta "window.LW.x = ...;" equilibrando chaves e parênteses, para pegar
// tanto a arrow de uma linha quanto a function de corpo inteiro.
function recortar(fonte, inicio) {
  const i = fonte.indexOf(inicio);
  assert.ok(i >= 0, 'não achei ' + inicio + ' no comum.js');
  let j = i + inicio.length, chaves = 0, parens = 0;
  for (; j < fonte.length; j++) {
    const ch = fonte[j];
    if (ch === '{') chaves++;
    else if (ch === '}') chaves--;
    else if (ch === '(') parens++;
    else if (ch === ')') parens--;
    else if (ch === ';' && chaves === 0 && parens === 0) break;
  }
  return fonte.slice(i, j + 1);
}

// --- a tabela ---------------------------------------------------------------

const CASOS = [
  { nome: 'Bling: cartão, parcela quitada — valorRecebido é o LÍQUIDO',
    c: { valor: 225, bruto: 225, taxa: 8.03, liquido: 216.97, valorRecebido: 216.97, status: 'Pago' },
    pagou: 225, deve: 0, caixa: 216.97 },
  { nome: 'Stripe: parcela quitada — valorRecebido é o BRUTO, não somar taxa de novo',
    c: { valor: 500, bruto: 500, taxa: 14.8, liquido: 485.2, valorRecebido: 500, status: 'Pago' },
    pagou: 500, deve: 0, caixa: 485.2 },
  { nome: 'Zelle/dinheiro: sem taxa nenhuma',
    c: { valor: 300, valorRecebido: 300, status: 'Pago' },
    pagou: 300, deve: 0, caixa: 300 },
  { nome: 'ainda não pagou',
    c: { valor: 300, valorRecebido: 0, status: 'A vencer' },
    pagou: 0, deve: 300, caixa: 0 },
  { nome: 'pagamento parcial: não se inventa rateio de taxa',
    c: { valor: 1000, bruto: 1000, taxa: 30, liquido: 970, valorRecebido: 400, status: 'Pago parcialmente' },
    pagou: 400, deve: 600, caixa: 400 },
  { nome: 'pagou de mais: saldo é zero, nunca negativo',
    c: { valor: 100, valorRecebido: 150, status: 'Pago' },
    pagou: 150, deve: 0, caixa: 150 },
  { nome: 'o contrato de US$ 900 do Tiago: 3 parcelas de 300 no cartão',
    c: { valor: 300, bruto: 300, taxa: 9.95, liquido: 290.05, valorRecebido: 290.05, status: 'Pago' },
    pagou: 300, deve: 0, caixa: 290.05 },
  { nome: 'registro sem nada dentro',
    c: null, pagou: 0, deve: 0, caixa: 0 },
  { nome: 'campos como texto, que é como o Bling às vezes manda',
    c: { valor: '225.00', bruto: '225.00', taxa: '8.03', liquido: '216.97', valorRecebido: '216.97' },
    pagou: 225, deve: 0, caixa: 216.97 },
];

test('a taxa do cartão volta para a conta do que o cliente pagou', () => {
  for (const k of CASOS) {
    assert.equal(pagoPeloCliente(k.c), k.pagou, 'pagou — ' + k.nome);
    assert.equal(saldoDoCliente(k.c), k.deve, 'deve — ' + k.nome);
    assert.equal(entrouNaConta(k.c), k.caixa, 'caixa — ' + k.nome);
  }
});

test('o navegador e o servidor respondem igual na mesma tabela', () => {
  const LW = carregarComum();
  for (const k of CASOS) {
    assert.equal(LW.pagoPeloCliente(k.c), k.pagou, 'pagou no navegador — ' + k.nome);
    assert.equal(LW.saldoDoCliente(k.c), k.deve, 'deve no navegador — ' + k.nome);
    assert.equal(LW.entrouNaConta(k.c), k.caixa, 'caixa no navegador — ' + k.nome);
  }
});

test('contrato quitado no cartão fecha em 100%, não em 98%', () => {
  // O caso dele, inteiro: US$ 900 em 3 parcelas de 300 pagas no cartão, mais
  // uma quarta parcela cancelada. Cancelada não conta — é cobrança desfeita.
  const parcelas = [
    { valor: 300, bruto: 300, taxa: 9.95, liquido: 290.05, valorRecebido: 290.05, status: 'Pago' },
    { valor: 300, bruto: 300, taxa: 9.95, liquido: 290.05, valorRecebido: 290.05, status: 'Pago' },
    { valor: 300, bruto: 300, taxa: 9.95, liquido: 290.05, valorRecebido: 290.05, status: 'Pago' },
    { valor: 300, valorRecebido: 0, status: 'Cancelado' },
  ];
  const vivas = parcelas.filter((p) => p.status !== 'Cancelado');
  const pago = vivas.reduce((s, p) => s + pagoPeloCliente(p), 0);
  assert.equal(Math.round((pago / 900) * 100), 100);

  // E o caixa continua sabendo que entraram 870,15: as duas perguntas não se
  // misturam, e é por isso que o DRE não muda com este conserto.
  const caixa = Math.round(vivas.reduce((s, p) => s + entrouNaConta(p), 0) * 100) / 100;
  assert.equal(caixa, 870.15);
});

test('nenhuma tela pergunta "quanto o cliente pagou" direto a valorRecebido', () => {
  // O conserto só vale se ninguém refizer a subtração na mão depois. Estes são
  // os padrões que estavam errados em produção; se voltarem, este teste cai.
  const proibidos = [
    { re: /\.pago\s*\+=\s*Number\(\s*\w+\.valorRecebido/, porque: 'índice financeiro do card' },
    { re: /Number\(\s*\w+\.valor\s*\|\|\s*0\s*\)\s*-\s*Number\(\s*\w+\.valorRecebido/, porque: 'saldo na mão' },
    { re: /Number\(\s*\w+\.valor\s*\)\s*-\s*Number\(\s*\w+\.valorRecebido/, porque: 'saldo na mão' },
  ];
  for (const arq of ['docs/documentos.html', 'docs/financeiro.html', 'server/src/automacoes.js']) {
    const fonte = readFileSync(new URL('../../' + arq, import.meta.url), 'utf8');
    for (const p of proibidos) {
      assert.ok(!p.re.test(fonte), arq + ' voltou a calcular ' + p.porque + ' com valorRecebido cru');
    }
  }
});
