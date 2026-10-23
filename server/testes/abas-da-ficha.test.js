// A ordem das abas da ficha do lead é uma decisão de trabalho, não estética: o vendedor
// abre o card para registrar o follow-up, montar a proposta ou anotar a conversa. Agenda
// e Histórico são consulta. E a ficha tem que abrir na primeira aba — senão a
// "primeira" é só enfeite e o vendedor continua clicando para chegar no que usa.
//
// A aba "Resumo" era a quarta e saiu: o que ela mostrava — trilha de etapas,
// e-mail, endereço, origem — virou uma faixa fixa, visível em qualquer aba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');
const abas = [...html.matchAll(/data-dtab="([a-z-]+)"[^>]*>([^<]+)</g)].map(m => ({ id: m[1], rotulo: m[2].trim() }));

test('as três primeiras abas são anotação, proposta e follow-up', () => {
  assert.deepEqual(abas.slice(0, 3).map(a => a.id), ['comunicacao', 'comercial', 'followup'],
    'ordem encontrada: ' + abas.map(a => a.id).join(', '));
});

test('os rótulos são os que a equipe usa', () => {
  assert.equal(abas.find(a => a.id === 'comercial').rotulo, 'Proposta');
  assert.equal(abas.find(a => a.id === 'comunicacao').rotulo, 'Anotação');
});

test('consulta fica atrás: agenda e histórico', () => {
  assert.deepEqual(abas.slice(3).map(a => a.id), ['agenda', 'historico']);
});

test('a aba Resumo não existe mais', () => {
  assert.ok(!abas.some(a => a.id === 'resumo'), 'abas: ' + abas.map(a => a.id).join(', '));
  assert.equal(html.indexOf("activeDtab === 'resumo'"), -1, 'e nem o ramo que a desenhava');
});

test('a ficha abre na primeira aba', () => {
  const m = html.match(/const ABA_INICIAL = '([a-z-]+)'/);
  assert.ok(m, 'não achei ABA_INICIAL');
  assert.equal(m[1], abas[0].id,
    `abre em "${m[1]}" mas a primeira aba é "${abas[0].id}"`);
});
