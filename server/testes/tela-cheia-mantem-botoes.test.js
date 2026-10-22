// A tela cheia tira da frente tudo que não é o quadro. Mas a faixa do título carrega os
// botões de ação — "+ Adicionar lead", "+ Novo contrato", o seletor de vendedor — e escondê-la
// inteira faz o vendedor concluir que a função não existe. Foi o que aconteceu: a Tatiane
// pediu o botão de adicionar lead no funil que já estava no ar havia horas, invisível.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const ini = comum.indexOf('function estiloTelaCheia()');
assert.ok(ini > 0, 'não achei o bloco de estilo da tela cheia');
const css = comum.slice(ini, comum.indexOf('document.head.appendChild(css)', ini));

// Cada regra que termina em display:none, com os seletores que a antecedem.
const regrasQueEscondem = [...css.matchAll(/([^{}]+)\{[^{}]*display\s*:\s*none[^{}]*\}/g)].map(m => m[1]);

test('a tela cheia não esconde a faixa que tem os botões', () => {
  const culpada = regrasQueEscondem.find(sel => /\.page-head-row\s*(,|\{|$)/.test(sel));
  assert.equal(culpada, undefined,
    'a tela cheia voltou a esconder .page-head-row inteira — os botões de ação somem junto');
});

test('a faixa continua existindo na tela cheia, só sem o título', () => {
  assert.match(css, /body\.lw-tela-cheia \.page-head-row\{[^}]*display:flex/,
    'falta a regra que mantém a faixa visível na tela cheia');
  assert.match(css, /body\.lw-tela-cheia \.page-head-row h1[^{]*\{[^}]*display:none/,
    'o título deveria continuar escondido na tela cheia');
});

test('as telas realmente guardam botões nessa faixa', () => {
  // Se um dia ninguém mais puser botão ali, este teste perde o sentido e deve ser revisto.
  const dir = new URL('../../docs/', import.meta.url);
  const comControles = readdirSync(dir).filter(f => f.endsWith('.html')).filter(f => {
    const h = readFileSync(new URL(f, dir), 'utf8');
    const i = h.indexOf('class="page-head-row"');
    return i >= 0 && /<(button|select)\b/.test(h.slice(i, i + 900));
  });
  assert.ok(comControles.length >= 5,
    `só ${comControles.length} tela(s) com botão na faixa — era para serem várias`);
  assert.ok(comControles.includes('funil-comercial.html'),
    'o funil comercial deveria ter o "+ Adicionar lead" nessa faixa');
});
