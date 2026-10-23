// "Estou no módulo Documentos; quando vou indo para baixo, ele vai dando [lag]
// e volta tudo de novo."
//
// Não era lentidão. Quando outra tela — ou a automação do servidor, que roda a
// cada minuto — salva um bloco, as telas abertas se recarregam sozinhas. O
// redesenho joga a rolagem para o topo, e quem estava descendo os 263 cartões
// da Documentação voltava ao começo sem ter feito nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const storage = readFileSync(new URL('../../docs/assets/storage.js', import.meta.url), 'utf8');

function pegarFns() {
  const i = storage.indexOf("const CAIXAS_QUE_ROLAM =");
  const fim = storage.indexOf('\n  }', storage.indexOf('function devolverRolagem')) + 4;
  // Um DOM de mentira com três caixas que rolam.
  const caixas = [
    { scrollTop: 0, scrollLeft: 0 },
    { scrollTop: 420, scrollLeft: 0 },
    { scrollTop: 0, scrollLeft: 90 },
  ];
  const ctx = {
    document: { querySelectorAll: () => caixas },
    window: { scrollX: 0, scrollY: 1300, scrollTo(x, y) { ctx.window.scrollX = x; ctx.window.scrollY = y; } },
    caixas,
  };
  ctx.window.scrollTo = (x, y) => { ctx.rolou = [x, y]; };
  vm.createContext(ctx);
  vm.runInContext(storage.slice(i, fim) + '\nglobalThis.f = { guardarRolagem, devolverRolagem };', ctx);
  return { ...ctx.f, ctx, caixas };
}

test('guarda a posição da página e de cada caixa que rola', () => {
  const { guardarRolagem } = pegarFns();
  const r = guardarRolagem();
  assert.equal(r.y, 1300, 'a rolagem da página');
  // JSON porque o vm devolve arrays de outro realm e o deepEqual compara o protótipo.
  assert.equal(JSON.stringify(r.partes), JSON.stringify([[1, 420, 0], [2, 0, 90]]),
    'só as caixas que estavam roladas, pela ordem — redesenhar troca os elementos');
});

test('devolve a posição depois do desenho', () => {
  const { guardarRolagem, devolverRolagem, ctx, caixas } = pegarFns();
  const r = guardarRolagem();
  caixas.forEach(c => { c.scrollTop = 0; c.scrollLeft = 0; });   // o redesenho zerou tudo
  devolverRolagem(r);
  assert.equal(JSON.stringify(ctx.rolou), JSON.stringify([0, 1300]), 'a página volta para onde estava');
  assert.equal(caixas[1].scrollTop, 420);
  assert.equal(caixas[2].scrollLeft, 90);
});

test('caixa que sumiu no redesenho não quebra a volta', () => {
  const { guardarRolagem, devolverRolagem, caixas } = pegarFns();
  const r = guardarRolagem();
  caixas.length = 1;                                   // a tela mudou de forma
  assert.doesNotThrow(()=> devolverRolagem(r));
});

test('não redesenha no meio de uma rolagem', () => {
  // Redesenhar enquanto a pessoa rola é o que faz a tela "pular" na mão dela.
  assert.match(storage, /Date\.now\(\) - ultimaRolagem < 1500/, 'falta a espera');
  assert.match(storage, /window\.addEventListener\('scroll', \(\)=>\{ ultimaRolagem = Date\.now\(\); \}, \{ passive: true, capture: true \}\)/,
    'capture:true para pegar também a rolagem das caixas de dentro; passive para não atrapalhar a rolagem');
  assert.match(storage, /clearTimeout\(timer\); timer = setTimeout\(recarregarSePossivel, 2000\); return;/,
    'adiado, não descartado — a tela precisa se atualizar quando ela parar');
});

test('a volta acontece depois do desenho, não junto', () => {
  // Antes do desenho a página ainda não tem a altura toda e o navegador
  // ignora o scrollTo.
  const i = storage.indexOf('async function recarregar()');
  const corpo = storage.slice(i, storage.indexOf('\n  }', i));
  assert.match(corpo, /const onde = guardarRolagem\(\);/);
  assert.match(corpo, /requestAnimationFrame\(\(\)=> devolverRolagem\(onde\)\)/);
  assert.ok(corpo.indexOf('window.render()') < corpo.indexOf('requestAnimationFrame'),
    'primeiro desenha, depois devolve');
});
