// "precisamos deixar o sistema mais fluido e sem travas, sem refresh, sem bug
//  de mudar o card e ele voltar, sem delay de descer e ele voltar, mas rápido"
//  — ela, 30/10/2026.
//
// As três queixas tinham a MESMA causa. Seis telas tinham o próprio
// setInterval chamando loadAll() cru, em paralelo com o recarregador do
// storage.js, que já faz isso direito. A volta do relógio caía no meio de uma
// gravação, lia o estado ANTIGO e redesenhava: o card voltava, a rolagem ia
// para o topo, e tudo isso enquanto a tela baixava os blocos de novo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TELAS, lerTela, scriptsDa, semComentarios, RAIZ } from './_base.js';
import path from 'node:path';

const storage = readFileSync(path.join(RAIZ, 'docs/assets/storage.js'), 'utf8');

// O WAHA é exceção legítima: enquanto a pessoa parea o número, a tela precisa
// perguntar pelo QR de poucos em poucos segundos, e isso acaba quando parear.
const PERMITIDOS = /atualizarBadgeChat|pollWaha|buscar, 5000|sincronizar/;

test('existe UM recarregador protegido, e ele é exposto às telas', () => {
  assert.match(storage, /recarregarSePuder:\s*\(\)\s*=>\s*recarregarSePossivel\(\)/);
});

test('o recarregador espera a gravação em voo terminar', () => {
  const fn = storage.slice(storage.indexOf('async function recarregarSePossivel'));
  assert.match(fn.slice(0, 900), /emVoo > 0/,
    'sem isto ele lê o estado antigo no meio da gravação — é o card que volta');
  assert.match(fn.slice(0, 900), /ultimoSet/, 'nem logo depois de gravar');
  assert.match(fn.slice(0, 900), /ultimaRolagem/, 'nem no meio de uma rolagem');
  assert.match(fn.slice(0, 900), /digitandoAgora\(\)/, 'nem com alguém digitando');
  assert.match(fn.slice(0, 900), /modalAberto/, 'nem com um modal aberto');
});

test('o recarregador devolve a rolagem depois de redesenhar', () => {
  const fn = storage.slice(storage.indexOf('async function recarregar()'));
  assert.match(fn.slice(0, 600), /guardarRolagem\(\)/);
  assert.match(fn.slice(0, 600), /devolverRolagem\(onde\)/);
});

test('a rede de segurança é uma só, e não roda com a aba escondida', () => {
  assert.match(storage, /setInterval\([\s\S]{0,80}?recarregarSePossivel\(\)[\s\S]{0,20}?60000\)/,
    'a rede de 60s sumiu');
  assert.match(storage, /if\(!document\.hidden\)/,
    'aba escondida não precisa recarregar — era parte do tráfego de fundo');
});

for (const tela of TELAS) {
  test(`${tela} · não recarrega sozinha por fora do caminho protegido`, () => {
    const js = semComentarios(scriptsDa(lerTela(tela)).join('\n'));
    const laços = [...js.matchAll(/setInterval\(\s*([\s\S]{0,60}?),\s*(\d+)\s*\)/g)]
      .map((m) => ({ o: m[1].replace(/\s+/g, ' ').trim(), ms: Number(m[2]) }))
      .filter((x) => !PERMITIDOS.test(x.o) && !PERMITIDOS.test(String(x.ms)))
      .filter((x) => /loadAll|carregar|render|recarregar|sincroniz/i.test(x.o))
      .map((x) => `${x.o} a cada ${x.ms / 1000}s`);
    assert.deepEqual(laços, [],
      'esta tela tem o próprio laço de recarga: ele atropela gravação, rolagem e modal');
  });

  test(`${tela} · não recarrega tudo ao voltar para a aba`, () => {
    const js = semComentarios(scriptsDa(lerTela(tela)).join('\n'));
    const cru = [...js.matchAll(/addEventListener\(\s*'focus'[\s\S]{0,90}?\)/g)]
      .map((m) => m[0].replace(/\s+/g, ' '))
      .filter((x) => /loadAll|carregar\(/.test(x));
    assert.deepEqual(cru, [],
      'voltar para a aba disparava um loadAll cru, que joga a rolagem para o topo');
  });
}
