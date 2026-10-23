// "29 contratos assinados" sem os nomes é um número em que ninguém confia. O cartão do
// Dashboard abre a mesma lista que o Financeiro já abria — e a lista mora no comum.js
// para as duas telas mostrarem a mesma coisa em vez de duas versões que vão divergir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../../docs/index.html', import.meta.url), 'utf8');

test('a lista de contratos é compartilhada, não copiada na tela', () => {
  assert.match(comum, /window\.LW\.listaDeContratos = \(titulo, lista, aviso, acao\)/,
    'a lista deveria morar no comum.js, aceitar um aviso explicativo e uma ação opcional por linha');
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

// O texto da função inteira, do começo até a próxima função exportada.
function corpoDaLista() {
  const ini = comum.indexOf('window.LW.listaDeContratos');
  const fim = comum.indexOf('window.LW.', ini + 30);
  return comum.slice(ini, fim > ini ? fim : comum.length);
}

test('a lista fecha por botão, por fora e pelo Esc', () => {
  // Até o fim da função, não um pedaço de tamanho fixo: a janela cresce (ganhou
  // status e exportação) e um corte em 7000 caracteres passa a mentir que o
  // código sumiu.
  const corpo = corpoDaLista();
  assert.match(corpo, /lw-lc-fechar'\)\.addEventListener\('click'/, 'falta o botão Fechar');
  assert.match(corpo, /if\(e\.target === modal\) modal\.remove\(\)/, 'clicar fora deveria fechar');
  assert.match(corpo, /e\.key === 'Escape'/, 'Esc deveria fechar');
});

test('o filtro por vendedor pode ser desfeito', () => {
  // Até o fim da função, não um pedaço de tamanho fixo: a janela cresce (ganhou
  // status e exportação) e um corte em 7000 caracteres passa a mentir que o
  // código sumiu.
  const corpo = corpoDaLista();
  assert.match(corpo, /filtro = \(filtro === v\) \? null : v/,
    'clicar no mesmo vendedor deveria tirar o filtro, senão quem filtra fica preso');
});

// ---- Contratos cancelados ----
// 43 dos 47 cancelados vieram já cancelados do Bling, importados em bloco em 11/10. A
// "data de cancelamento" no sistema é a da importação. Filtrar por período diria
// "47 cancelados em outubro", que é falso — então o cartão mostra o total e explica.
const financeiro = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');

test('o cartão de cancelados não finge saber a data do cancelamento', () => {
  for(const [nome, tela] of [['Dashboard', index], ['Financeiro', financeiro]]){
    assert.match(tela, /const cancelados\s*=\s*contratos\.filter\(c\s*=>\s*c\.etapa === 'Cancelado'\)/,
      `${nome}: os cancelados deveriam sair do estado, sem filtro de data`);
    assert.ok(!/cancelados[^\n]*P\.dentro|cancelados[^\n]*noPeriodoSelecionado/.test(tela),
      `${nome}: cancelados não pode entrar no filtro de período — a data é a da importação`);
    assert.match(tela, /Contratos cancelados \(total\)/,
      `${nome}: o rótulo precisa dizer que é o total, senão o número engana`);
  }
});

test('o cartão mostra quantidade E valor, e abre a lista', () => {
  for(const [nome, tela] of [['Dashboard', index], ['Financeiro', financeiro]]){
    assert.match(tela, /valorCancelado/, `${nome}: falta somar o valor dos cancelados`);
    assert.match(tela, /que deixaram de entrar/, `${nome}: o valor precisa estar explicado`);
    assert.match(tela, /LW\.listaDeContratos\('Contratos cancelados', cancelados, AVISO_CANCELADOS/,
      `${nome}: clicar deveria abrir a lista com o aviso`);
  }
});

test('o aviso explica por que a data não é a do cancelamento', () => {
  for(const tela of [index, financeiro]){
    assert.match(tela, /AVISO_CANCELADOS = /);
    assert.match(tela, /j[áa] veio cancelada do Bling/,
      'o aviso tem que dizer de onde veio, senão o usuário acha que o sistema errou');
  }
});
