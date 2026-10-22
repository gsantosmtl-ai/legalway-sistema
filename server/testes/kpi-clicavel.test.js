// "29 contratos assinados" sem os nomes é um número em que ninguém confia. O cartão do
// Dashboard abre a mesma lista que o Financeiro já abria — e a lista mora no comum.js
// para as duas telas mostrarem a mesma coisa em vez de duas versões que vão divergir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../../docs/index.html', import.meta.url), 'utf8');

test('a lista de contratos é compartilhada, não copiada na tela', () => {
  assert.match(comum, /window\.LW\.listaDeContratos = \(titulo, lista\)/,
    'a lista deveria morar no comum.js');
  assert.match(index, /LW\.listaDeContratos\(/,
    'o Dashboard deveria chamar a lista compartilhada');
});

test('o cartão de contratos assinados é clicável e leva a lista certa', () => {
  assert.match(index, /Contratos assinados[\s\S]{0,320}abrir: contratosMes\.length \? \(\)=> LW\.listaDeContratos/,
    'o cartão deveria abrir a lista dos contratos do período');
  assert.match(index, /c\.abrir\?' kpi-clicavel'/, 'o cartão clicável precisa da classe que muda o cursor');
  assert.match(index, /\.kpi-card\.kpi-clicavel\{ cursor:pointer/, 'falta o estilo do cursor');
  assert.match(index, /if\(card && card\.abrir\) el\.addEventListener\('click', card\.abrir\)/,
    'o clique precisa estar ligado ao cartão');
});

test('cartão sem contrato no período não fica clicável', () => {
  // Clicar e não abrir nada é pior do que não poder clicar.
  assert.match(index, /abrir: contratosMes\.length \?/,
    'com zero contratos o cartão não deveria convidar ao clique');
});

test('a lista fecha por botão, por fora e pelo Esc', () => {
  const ini = comum.indexOf('window.LW.listaDeContratos');
  const corpo = comum.slice(ini, ini + 7000);
  assert.match(corpo, /lw-lc-fechar'\)\.addEventListener\('click'/, 'falta o botão Fechar');
  assert.match(corpo, /if\(e\.target === modal\) modal\.remove\(\)/, 'clicar fora deveria fechar');
  assert.match(corpo, /e\.key === 'Escape'/, 'Esc deveria fechar');
});

test('o filtro por vendedor pode ser desfeito', () => {
  const ini = comum.indexOf('window.LW.listaDeContratos');
  const corpo = comum.slice(ini, ini + 7000);
  assert.match(corpo, /filtro = \(filtro === v\) \? null : v/,
    'clicar no mesmo vendedor deveria tirar o filtro, senão quem filtra fica preso');
});
