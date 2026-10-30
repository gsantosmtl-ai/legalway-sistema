// A data da conta a pagar chama `dataPagamento`.
//
// Achado na auditoria de 30/10/2026: o cálculo de saldo lia `c.pagoEm`, que
// NÃO EXISTE em nenhum dos 488 registros pagos — todos têm `dataPagamento`.
//
// Não quebrava o saldo porque nenhuma conta tinha data de corte, e sem corte
// `dentroDoCorte` deixa tudo passar. Mas bastava alguém pôr um corte numa
// conta para todas as contas a pagar dela sumirem do saldo, em silêncio, e o
// saldo inflar — e saldo bancário é número que alguém confere contra o
// extrato.
//
// O aviso de "lançamentos sem data" tinha o mesmo erro, e por isso diria que
// as 488 estão sem data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');
const semComent = tela.replace(/^\s*\/\/.*$/gm, '');

test('o saldo da conta usa a data que existe no registro', () => {
  const i = semComent.indexOf('const pago = somaCent(contasPagar');
  assert.ok(i > 0, 'não achei a soma das contas a pagar no saldo');
  const linha = semComent.slice(i, semComent.indexOf('\n', i));
  assert.match(linha, /quandoPagou\(c\)/, 'voltou a ler um campo só');
  const j = semComent.indexOf('const quandoPagou');
  assert.match(semComent.slice(j, semComent.indexOf('\n', j)), /c\.dataPagamento/,
    '`dataPagamento` é o campo que os 488 registros pagos realmente têm');
});

test('o aviso de "sem data" também olha o campo certo', () => {
  const i = semComent.indexOf("const p = contasPagar.filter(c=>c.conta===nomeConta && c.status==='Pago'");
  assert.ok(i > 0, 'não achei o filtro de lançamentos sem data');
  const linha = semComent.slice(i, semComent.indexOf('\n', i));
  assert.match(linha, /c\.dataPagamento/,
    'sem isto o aviso diria que as 488 contas pagas estão sem data');
});

test('o saldo nunca lê pagoEm sozinho', () => {
  // `pagoEm` continua valendo como ALTERNATIVA dentro de quandoPagou — um
  // registro criado por outro caminho pode ter só ele. O que não pode voltar
  // é alguém filtrar direto por `c.pagoEm`, que foi o defeito.
  const i = semComent.indexOf('function calcularSaldoConta');
  const corpo = semComent.slice(i, semComent.indexOf('\n}', i));
  assert.ok(!/dentroDoCorte\(c\.pagoEm/.test(corpo),
    'o saldo voltou a filtrar por `c.pagoEm` direto — campo que nenhum registro pago tem');
  assert.match(corpo, /c\.dataPagamento \|\| c\.pagoEm/,
    'a alternativa tem de vir depois do campo que existe de verdade');
});
