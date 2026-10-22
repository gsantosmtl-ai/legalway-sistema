// A ordem das abas da ficha do lead é uma decisão de trabalho, não estética: o vendedor
// abre o card para registrar o follow-up, montar a proposta ou anotar a conversa. Resumo,
// Agenda e Histórico são consulta. E a ficha tem que abrir na primeira aba — senão a
// "primeira" é só enfeite e o vendedor continua clicando para chegar no que usa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');
const abas = [...html.matchAll(/data-dtab="([a-z-]+)"[^>]*>([^<]+)</g)].map(m => ({ id: m[1], rotulo: m[2].trim() }));

test('as três primeiras abas são follow-up, proposta e comunicação', () => {
  assert.deepEqual(abas.slice(0, 3).map(a => a.id), ['followup', 'comercial', 'comunicacao'],
    'ordem encontrada: ' + abas.map(a => a.id).join(', '));
});

test('a aba do comercial se chama Proposta na tela', () => {
  const comercial = abas.find(a => a.id === 'comercial');
  assert.equal(comercial.rotulo, 'Proposta');
});

test('consulta fica atrás: resumo, agenda e histórico', () => {
  assert.deepEqual(abas.slice(3).map(a => a.id), ['resumo', 'agenda', 'historico']);
});

test('a ficha abre na primeira aba', () => {
  const m = html.match(/const ABA_INICIAL = '([a-z-]+)'/);
  assert.ok(m, 'não achei ABA_INICIAL');
  assert.equal(m[1], abas[0].id,
    `abre em "${m[1]}" mas a primeira aba é "${abas[0].id}"`);
});
