// Parcela com vencimento no futuro não pode estar "Atrasado".
//
// Relato dela: "02/11 não está em atraso, hoje é dia 30/10".
//
// A rotina que marca atraso só andava para a frente: promovia "A vencer" a
// "Atrasado" e nunca desfazia. Quando o vencimento era REMARCADO para o
// futuro — foi o que eu fiz em 29/10 ao igualar as datas ao Bling — a parcela
// ficava "Atrasado" com data futura, e o cliente aparecia inadimplente sem
// dever nada.
//
// Eram 9 parcelas, duas delas vencendo em 2028.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');
const i = fonte.indexOf('async function marcarAtrasadas');
assert.ok(i > 0, 'não achei marcarAtrasadas');
const corpo = fonte.slice(i, fonte.indexOf('\n}', i));
const semComent = corpo.replace(/^\s*\/\/.*$/gm, '');

test('marca como atrasada o que venceu', () => {
  assert.match(semComent, /status === 'A vencer'[\s\S]{0,60}vencimento < h[\s\S]{0,60}'Atrasado'/,
    'a rotina deixou de marcar atraso');
});

test('DESMARCA quando o vencimento foi remarcado para o futuro', () => {
  assert.match(semComent, /status === 'Atrasado'[\s\S]{0,80}vencimento >= h[\s\S]{0,120}'A vencer'/,
    'a rotina não desfaz o atraso — parcela com data futura continua marcada como inadimplente');
});

test('não desfaz atraso de parcela que já recebeu alguma coisa', () => {
  assert.match(semComent, /!Number\(c\.valorRecebido \|\| 0\)/,
    'parcela com dinheiro em cima e data remarcada não é assunto desta rotina');
});

test('grava quando desfaz, não só quando marca', () => {
  assert.match(semComent, /if \(n \|\| d\)/,
    'se gravar só quando marca, o desfazer se perde a cada rodada e volta no minuto seguinte');
});
