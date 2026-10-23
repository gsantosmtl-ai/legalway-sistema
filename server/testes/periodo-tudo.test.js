// "Aqui também, no filtro, ter o filtro todo o período."
//
// Dia, Semana, Mês e Período respondiam recortes. Faltava a pergunta inteira —
// "quanto este escritório já fez" — e nenhum dos quatro alcançava: o mês mais
// cheio ainda é um mês, e marcar "Período" de 2020 a 2030 à mão é trabalho
// toda vez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');

function filtro() {
  const i = comum.indexOf('const ARTIGOS =');
  const fim = comum.indexOf('\n  };', comum.indexOf('navHtml()')) + 4;
  const ctx = { document: { querySelectorAll: () => [] } };
  vm.createContext(ctx);
  // As ajudantes de data que o filtro usa.
  const ajudantes = comum.slice(comum.indexOf('const hojeIso'), i);
  vm.runInContext(ajudantes + comum.slice(i, fim) + '\nglobalThis.P = P;', ctx);
  return ctx.P;
}

test('"Tudo" aceita qualquer data', () => {
  const P = filtro();
  P.modo = 'tudo';
  for (const d of ['2019-01-01', '2026-10-23', '2031-12-31', '2026-10-23T14:00:00Z']) {
    assert.equal(P.dentro(d), true, `${d} tem que entrar`);
  }
  assert.equal(P.dentro(''), false, 'registro sem data continua de fora');
  assert.equal(P.dentro(null), false);
});

test('com "Tudo" não existe período anterior', () => {
  // Comparar "o tempo todo" com "o tempo antes de tudo" não quer dizer nada —
  // os cartões deixam de mostrar a variação.
  const P = filtro();
  P.modo = 'tudo';
  assert.equal(P.anterior('2020-05-05'), false);
  assert.equal(P.anterior('2026-10-23'), false);
});

test('as setas de navegar não fazem nada no modo Tudo', () => {
  const P = filtro();
  P.modo = 'tudo';
  const antes = P.mes;
  P.andar(1); P.andar(-5);
  assert.equal(P.mes, antes, 'não há mês anterior nem seguinte em "tudo"');
});

test('o texto dos títulos fica em português', () => {
  // "no tempo todo" soa errado; os cartões dizem "Contratos assinados ...".
  const P = filtro();
  P.modo = 'tudo';
  assert.equal(P.com('no'), 'em todo o período');
  assert.equal(P.rotulo(), 'tempo todo');
  P.modo = 'semana';
  assert.equal(P.com('no'), 'na semana', 'os outros modos não mudam');
  P.modo = 'mes';
  assert.equal(P.com('no'), 'no mês');
});

test('o botão entra na barra, depois de Período', () => {
  assert.match(comum, /\[\['dia','Dia'\],\['semana','Semana'\],\['mes','Mês'\],\['personalizado','Período'\],\['tudo','Tudo'\]\]/,
    'o modo novo vai no fim: os recortes do dia a dia continuam na frente');
  assert.match(comum, /if\(this\.modo === 'tudo'\)\{\s*\n\s*return `<div class="mes-label">Desde o começo<\/div>`;/,
    'sem setas nem calendário — não há o que navegar');
});
