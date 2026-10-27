// O dia é o do ESCRITÓRIO, não o do relógio UTC do navegador.
//
// Orlando está 4 horas atrás. A partir das 20h o UTC já virou o dia seguinte —
// e aí parcela que vence hoje aparece como atrasada, e conta a pagar criada à
// noite nasce datada de amanhã. Quem tem até o fim do dia para pagar não está
// devendo às 20h.
//
// O `comum.js` já tinha o `hoje()` certo, global, com esse comentário. O que
// faltava era ninguém poder sobrepor com uma cópia em UTC — e o portal do
// prestador fazia exatamente isso.
//
// É a MESMA CLASSE do defeito do gerador de id: consertado num lugar, deixado
// no outro. Por isso o teste varre as telas inteiras em vez de olhar uma.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { hojeNoFuso, FUSO_ESCRITORIO } from '../src/datas.js';

const docs = new URL('../../docs/', import.meta.url);
const semComent = (t) => t.replace(/^\s*\/\/.*$/gm, '');

test('nenhuma tela redefine hoje() em UTC', () => {
  const culpadas = [];
  for (const f of readdirSync(docs)) {
    if (!f.endsWith('.html')) continue;
    const fonte = semComent(readFileSync(new URL(f, docs), 'utf8'));
    // `new Date().toISOString().slice(0,10)` dentro de uma definição de hoje.
    if (/function hoje\s*\(\s*\)\s*\{[^}]*toISOString\(\)\.slice\(0\s*,\s*10\)/.test(fonte)
      || /\bhoje\s*=\s*\(\s*\)\s*=>[^;\n]*toISOString\(\)\.slice\(0\s*,\s*10\)/.test(fonte)) {
      culpadas.push(f);
    }
  }
  assert.deepEqual(culpadas, [], 'hoje() em UTC em: ' + culpadas.join(', '));
});

test('o hoje() do comum.js usa o fuso do escritório, e é global', () => {
  const comum = readFileSync(new URL('assets/comum.js', docs), 'utf8');
  const i = comum.indexOf('function hoje(){');
  assert.ok(i > 0, 'o hoje() global sumiu — as telas todas dependem dele');
  const corpo = comum.slice(i, comum.indexOf('\n}', i));
  assert.match(corpo, /timeZone:'America\/New_York'/);
  assert.match(corpo, /catch\(e\)\{ return new Date\(\)\.toISOString\(\)/,
    'com reserva, para navegador sem Intl não deixar a tela em branco');
  // Fora dos IIFEs: é isso que faz as telas enxergarem.
  const aberturas = [...comum.matchAll(/^\(function\(\)\{/gm)].map((m) => m.index);
  const fechamentos = [...comum.matchAll(/^\}\)\(\);/gm)].map((m) => m.index);
  const dentroDeAlgum = aberturas.some((a, k) => i > a && i < (fechamentos[k] ?? Infinity));
  assert.equal(dentroDeAlgum, false, 'hoje() precisa ficar FORA dos IIFEs, senão nenhuma tela o vê');
});

test('o servidor e as telas combinam o mesmo fuso', () => {
  assert.equal(FUSO_ESCRITORIO, 'America/New_York');
  const comum = readFileSync(new URL('assets/comum.js', docs), 'utf8');
  assert.ok(comum.includes("'America/New_York'"), 'as duas pontas têm que falar do mesmo lugar');
});

test('às 20h de Orlando ainda é hoje, não amanhã', () => {
  // 2026-10-26 20:30 em Nova York é 2026-10-27 00:30 UTC. O dia do escritório
  // ainda é 26 — e é por isso que quem vence hoje não está atrasado.
  const instante = new Date('2026-10-27T00:30:00.000Z');
  assert.equal(hojeNoFuso(FUSO_ESCRITORIO, instante), '2026-10-26');
  assert.equal(instante.toISOString().slice(0, 10), '2026-10-27', 'o UTC já virou — é essa a armadilha');
});

test('o portal do prestador data a conta a pagar pelo dia do escritório', () => {
  const portal = readFileSync(new URL('portal-prestador.html', docs), 'utf8');
  assert.match(portal, /vencimento: hoje\(\)/);
  assert.ok(!semComent(portal).includes('toISOString().slice(0,10)'),
    'a cópia em UTC não pode voltar');
  assert.match(portal, /assets\/comum\.js/, 'e ele precisa carregar o comum.js para ter o hoje()');
});
