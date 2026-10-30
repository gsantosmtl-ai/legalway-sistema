// A limpeza de duplicados não pode apagar parcela de verdade.
//
// 30/10/2026, estrago real: ela usou Configurações → "Juntar registros
// duplicados" e a limpeza apagou 143 lançamentos de uma vez — US$ 43.103,47,
// sendo 46 já PAGOS, US$ 12.793,60 de dinheiro recebido. Foram recuperados do
// histórico do armazenamento.
//
// A chave era contrato + descrição. O comentário supunha descrições distintas
// como "Parcela 2/5", mas nesta base a maioria diz só "Parcela" (80 dos
// apagados) ou "Avulsa" (54). Todas as parcelas de um contrato viraram "o
// mesmo lançamento".
//
// Agora a chave leva também VENCIMENTO e VALOR.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const fonte = readFileSync(new URL('../src/limpar-duplicados.js', import.meta.url), 'utf8');
function pedaco(de) {
  const i = fonte.indexOf(de);
  assert.ok(i >= 0, 'não achei no fonte: ' + de);
  let nivel = 0, j = fonte.indexOf('{', i);
  for (; j < fonte.length; j++) {
    if (fonte[j] === '{') nivel++;
    else if (fonte[j] === '}') { nivel--; if (!nivel) break; }
  }
  return fonte.slice(i, j + 1);
}
const linha = (de) => { const i = fonte.indexOf(de); assert.ok(i >= 0, de); return fonte.slice(i, fonte.indexOf('\n', i)); };

const ctx = createContext({ String, Object, Array, Date, Set, Map, Number, Math });
runInContext([linha('const texto ='), linha('const dinheiro ='), linha('const quando ='),
  pedaco('function juntarContas(')].join('\n'), ctx);
const juntarContas = ctx.juntarContas;

const parcela = (e) => ({ contratoId: 'ct1', descricao: 'Parcela', vencimento: '2026-11-17',
  valor: 305, status: 'A vencer', valorRecebido: 0, criadoEm: '2026-10-01', ...e });

test('parcelas do mesmo contrato com descrição genérica NÃO são duplicadas', () => {
  // o caso real: "Parcela" repetido em todo o carnê, com vencimentos diferentes
  const contas = [
    parcela({ id: '1', vencimento: '2026-11-17' }),
    parcela({ id: '2', vencimento: '2026-12-17' }),
    parcela({ id: '3', vencimento: '2027-01-17' }),
  ];
  const r = juntarContas(contas);
  assert.equal(r.removidos.length, 0,
    'apagou parcela de verdade: são três vencimentos diferentes do mesmo carnê');
  assert.equal(r.lista.length, 3);
});

test('avulsas de valores diferentes no mesmo contrato ficam todas', () => {
  const contas = [
    parcela({ id: 'a', descricao: 'Avulsa', valor: 47, vencimento: '2026-11-17' }),
    parcela({ id: 'b', descricao: 'Avulsa', valor: 110, vencimento: '2026-11-17' }),
  ];
  assert.equal(juntarContas(contas).removidos.length, 0, 'mesmo vencimento, VALORES diferentes');
});

test('cópia de verdade — tudo igual — ainda é juntada', () => {
  const contas = [parcela({ id: 'x' }), parcela({ id: 'y' })];
  const r = juntarContas(contas);
  assert.equal(r.removidos.length, 1, 'duas contas idênticas continuam sendo uma só');
  assert.equal(r.lista.length, 1);
});

test('entre duas idênticas, fica a que tem dinheiro', () => {
  const contas = [
    parcela({ id: 'sem', criadoEm: '2026-01-01' }),
    parcela({ id: 'paga', status: 'Pago', valorRecebido: 305, criadoEm: '2026-06-01' }),
  ];
  const r = juntarContas(contas);
  assert.equal(r.lista.length, 1);
  assert.equal(r.lista[0].id, 'paga', 'descartou a que tinha a baixa — dinheiro recebido não se joga fora');
});

test('a chave leva vencimento e valor, não só contrato e descrição', () => {
  const corpo = pedaco('function juntarContas(');
  assert.match(corpo, /texto\(cr\.vencimento\)/, 'o vencimento saiu da chave');
  assert.match(corpo, /dinheiro\(cr\.valor\)/, 'o valor saiu da chave');
});
