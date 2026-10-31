// Medido no navegador, numa tela de 375x812 (iPhone): o campo de usuário da
// tela de entrada ficava em y=838 — logo ABAIXO da dobra. Quem abre o sistema
// no telefone tinha de rolar o banner inteiro antes de conseguir digitar, toda
// vez. A página tem 1.395px de altura.
//
// Segunda é o primeiro dia de operação e sete pessoas entram, várias pelo
// telefone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/login.html', import.meta.url), 'utf8');

// Recorta um bloco @media contando chaves — o conteúdo tem chaves dentro.
function media(consulta) {
  const i = tela.indexOf('@media ' + consulta);
  assert.ok(i > 0, `não achei @media ${consulta} em login.html`);
  const abre = tela.indexOf('{', i);
  let nivel = 0;
  for (let k = abre; k < tela.length; k++) {
    if (tela[k] === '{') nivel++;
    else if (tela[k] === '}') { nivel--; if (!nivel) return tela.slice(abre, k + 1); }
  }
  throw new Error('não fechei as chaves do @media');
}

test('no celular o cartão de entrar vem antes da marca', () => {
  const m = media('(max-width:640px)');
  assert.match(m, /\.form-side\{[^}]*order:-1/);
});

test('a marca continua na página — só mudou de lugar', () => {
  // Tirar o banner seria outra decisão, e não é minha.
  assert.match(tela, /class="brand-side"/);
  assert.match(tela, /Mais que imigração/);
  assert.doesNotMatch(media('(max-width:640px)'), /\.brand-side\{[^}]*display:\s*none/);
});

test('no computador a ordem não muda', () => {
  // A regra vive só dentro do @media estreito. Se escapar para fora, o
  // desenho de duas colunas inverte no monitor da equipe.
  const i = tela.indexOf('order:-1');
  const abreMedia = tela.lastIndexOf('@media (max-width:640px)', i);
  const fechaMedia = tela.indexOf('\n  }', i);
  assert.ok(abreMedia > 0 && abreMedia < i && fechaMedia > i,
    'a troca de ordem escapou do @media de celular');
});

test('o @media de 900px continua lá, com a coluna única', () => {
  // O de 640 é um ajuste em cima do de 900, não um substituto.
  assert.match(media('(max-width:900px)'), /\.page\{ flex-direction:column; \}/);
});

test('a tela de entrar não ganhou rolagem lateral', () => {
  // Largura fixa em px num container é o jeito clássico de criar isso.
  const estilo = tela.slice(tela.indexOf('<style'), tela.indexOf('</style>'));
  assert.doesNotMatch(estilo, /\.page\{[^}]*width:\s*\d{3,}px/);
});
