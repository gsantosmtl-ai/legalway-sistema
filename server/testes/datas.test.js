// O servidor roda em UTC. O escritório é em Orlando, 4 a 5 horas atrás.
// Sem isto, toda noite a partir das 20h a rotina de atraso tratava como
// vencida a parcela que vence HOJE — 21 parcelas e US$ 7.346 entrando na
// inadimplência todo fim de tarde, e saindo sozinhas de manhã.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hojeNoFuso } from '../src/datas.js';

test('devolve AAAA-MM-DD', () => {
  assert.match(hojeNoFuso(), /^\d{4}-\d{2}-\d{2}$/);
});

test('às 23h de Orlando ainda é o dia de Orlando, não o seguinte', () => {
  // 21/10/2026 03:00 UTC = 20/10/2026 23:00 em Orlando
  const real = Date.now;
  Date.now = () => new Date('2026-10-21T03:00:00Z').getTime();
  const Original = global.Date;
  global.Date = class extends Original {
    constructor(...a){ return a.length ? new Original(...a) : new Original('2026-10-21T03:00:00Z'); }
    static now(){ return new Original('2026-10-21T03:00:00Z').getTime(); }
  };
  try {
    assert.equal(hojeNoFuso('America/New_York'), '2026-10-20');
    assert.equal(hojeNoFuso('UTC'), '2026-10-21');   // o defeito que existia
  } finally { global.Date = Original; Date.now = real; }
});
