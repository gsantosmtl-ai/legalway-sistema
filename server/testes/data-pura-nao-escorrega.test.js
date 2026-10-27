// Data pura não pode escorregar para o dia vizinho.
//
// `new Date("2026-10-20")` é meia-noite UTC — que em Orlando é o DIA ANTERIOR
// às 20h. Dezesseis horas de diferença, e isso muda resposta.
//
// Os contratos importados do Bling gravam `dataAssinatura: "2026-10-20"`, data
// pura. Os criados pelas telas gravam ISO completo. Os dois convivem no mesmo
// bloco, e o servidor lia os dois com `new Date` cru.
//
// O jeito certo (`+ 'T12:00:00'`) já existia em três telas. É a MESMA CLASSE do
// gerador de id, do dia em UTC e do telefone: a regra certa existe num canto e
// uma cópia ingênua sobrevive noutro.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { instanteDe, hojeNoFuso, FUSO_ESCRITORIO } from '../src/datas.js';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';  // db.js só exige que exista
const { assinadoHaPoucoTempo } = await import('../src/automacoes.js');

test('data pura vira meio-dia, não meia-noite UTC', () => {
  const d = instanteDe('2026-10-20');
  assert.equal(hojeNoFuso(FUSO_ESCRITORIO, d), '2026-10-20', 'tem que continuar dia 20 em Orlando');
  // A prova do contrário: o jeito ingênuo cai no dia 19.
  assert.equal(hojeNoFuso(FUSO_ESCRITORIO, new Date('2026-10-20')), '2026-10-19');
});

test('data com hora é respeitada como está', () => {
  const d = instanteDe('2026-10-20T15:30:00.000Z');
  assert.equal(d.toISOString(), '2026-10-20T15:30:00.000Z');
});

test('vazio e lixo devolvem null, em vez de Invalid Date', () => {
  // `new Date('lixo')` devolve um objeto que parece data e envenena toda conta
  // que encostar nele, virando NaN sem erro nenhum.
  for (const v of ['', null, undefined, 'lixo', {}, '2026-13-45']) {
    const r = instanteDe(v);
    assert.ok(r === null || Number.isFinite(r.getTime()), JSON.stringify(v));
  }
  assert.equal(instanteDe(''), null);
  assert.equal(instanteDe('lixo'), null);
});

test('a rede de 7 dias alcança o contrato assinado há 7 dias', () => {
  // Era aqui que doía: com a data lida como meia-noite UTC, "assinado há 7
  // dias" virava "7 dias e 16 horas" e o contrato ficava de fora EM SILÊNCIO.
  const agora = new Date('2026-10-27T12:00:00.000Z').getTime();
  const seteDiasAtras = '2026-10-20';
  assert.equal(assinadoHaPoucoTempo({ dataAssinatura: seteDiasAtras }, agora), true);

  // E o de oito dias continua de fora, que é o certo.
  assert.equal(assinadoHaPoucoTempo({ dataAssinatura: '2026-10-19' }, agora), false);
  // sete dias é a janela; oito já é tarde
});

test('contrato sem data fica de fora, sem quebrar', () => {
  const agora = Date.now();
  for (const c of [{}, { dataAssinatura: '' }, { dataAssinatura: 'lixo' }, { dataAssinatura: null }]) {
    assert.equal(assinadoHaPoucoTempo(c, agora), false, JSON.stringify(c));
  }
});

test('o servidor não lê mais data de contrato com new Date cru', () => {
  for (const f of ['automacoes.js', 'lembretes.js']) {
    const fonte = readFileSync(new URL('../src/' + f, import.meta.url), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(fonte, /new Date\(c\.dataAssinatura\)/,
      f + ': data pura precisa passar por instanteDe');
    assert.match(fonte, /instanteDe/, f);
  }
});

test('as telas que já faziam certo continuam fazendo', () => {
  // Três telas já usavam `+ 'T12:00:00'`. Se alguém "simplificar", o dia
  // volta a escorregar — desta vez no navegador.
  const docs = new URL('../../docs/', import.meta.url);
  for (const f of ['agenda.html', 'contratos.html']) {
    const fonte = readFileSync(new URL(f, docs), 'utf8');
    assert.match(fonte, /T12:00:00/, f + ' perdeu a proteção do meio-dia');
  }
});
