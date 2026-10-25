// "layout não está organizando nada. cortado, não está organizado"
// "sem opção também de tela cheia"
//
// Três coisas, e as duas primeiras eram defeito antigo:
//
// 1) O botão de tela cheia só aparecia em telas com uma das classes de quadro
//    originais. Contratos, Processos, Financeiro e Clientes ficavam sem —
//    justamente onde o conteúdo corta na borda.
//
// 2) O clique estourava "Cannot read properties of null" quando a preferência
//    ainda não tinha sido carregada. Sem erro visível: o botão simplesmente
//    não fazia nada. Só acontecia em tela SEM preferência salva, ou seja,
//    exatamente nas que acabaram de ganhar o botão.
//
// 3) O quadro rolava de lado, mas nada dizia isso. A última coluna aparecia
//    pela metade na borda e parecia defeito, não continuação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dir = new URL('../../docs/', import.meta.url);
const comum = readFileSync(new URL('assets/comum.js', dir), 'utf8');

test('o clique não quebra quando a preferência ainda não carregou', () => {
  const f = comum.slice(comum.indexOf('function ligarTelaCheia'));
  const clique = f.slice(f.indexOf("b.addEventListener('click'"), f.indexOf('topo.insertBefore'));
  assert.match(clique, /if\(!prefs\) prefs = \{\};/,
    'prefs nulo estourava no clique e o botão ficava sem efeito, sem erro visível');
});

test('toda tela com conteúdo largo pede o botão', () => {
  // marcadas com [data-tela-cheia] num contêiner que existe no HTML desde o
  // início — marcar algo criado por JS depois não funciona, porque a decisão
  // de criar o botão acontece antes
  for (const tela of ['contratos', 'processos', 'financeiro', 'clientes', 'agenda', 'relatorios', 'tarefas']) {
    const html = readFileSync(new URL(`${tela}.html`, dir), 'utf8');
    assert.match(html, /data-tela-cheia/, `${tela}.html ficaria sem o botão de tela cheia`);
  }
});

test('a marcação está em elemento estático, não em HTML gerado por JS', () => {
  for (const tela of ['processos', 'financeiro', 'clientes']) {
    const html = readFileSync(new URL(`${tela}.html`, dir), 'utf8');
    const emTemplate = /innerHTML\s*=\s*`[^`]*data-tela-cheia/.test(html);
    const estatico = /<div class="content2"[^>]*data-tela-cheia/.test(html)
                  || /<div class="board-wrap"[^>]*data-tela-cheia/.test(html);
    assert.ok(estatico, `${tela}.html precisa da marca num elemento que já existe no HTML`);
    if (emTemplate) assert.ok(estatico, `${tela}.html: a marca dentro de innerHTML sozinha não vale`);
  }
});

test('a borda avisa quando ainda tem conteúdo para o lado', () => {
  assert.match(comum, /lw-tem-mais-direita/);
  assert.match(comum, /function marcarRolagemLateral\s*\(/, 'a função precisa existir com esse nome exato');
  assert.match(comum, /window\.LW\.marcarRolagemLateral = marcarRolagemLateral;/, 'e ser a mesma que a tela chama');
  const f = comum.slice(comum.indexOf('function marcarRolagemLateral'));
  assert.match(f.slice(0, 500), /scrollWidth - \w+\.clientWidth/);
  assert.match(f.slice(0, 500), /lw-tem-mais-esquerda/, 'o aviso some ao chegar no fim, e aparece do outro lado');
});
