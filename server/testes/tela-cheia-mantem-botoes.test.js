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
// Corpo de uma função do comum.js, delimitado por chaves — não por um limite de tamanho.
function trechoDaFuncao(nome){
  const ini = comum.indexOf('function ' + nome + '(');
  assert.ok(ini > 0, 'não achei a função ' + nome + ' no comum.js');
  let i = comum.indexOf('{', ini), nivel = 0;
  for(; i < comum.length; i++){
    if(comum[i] === '{') nivel++;
    else if(comum[i] === '}'){ nivel--; if(nivel === 0) return comum.slice(ini, i + 1); }
  }
  throw new Error('chaves abertas em ' + nome);
}

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

test('a tela cheia compacta as faixas num quadro com abas', () => {
  // Quatro faixas antes do primeiro card comiam 181px de 678. As ações sobem para a
  // linha das abas e o seletor de visão para a dos filtros: o quadro ganha ~100px.
  assert.match(css, /@media \(min-width: 900px\)/,
    'a compactação deveria valer só a partir de 900px — no celular as faixas ficam empilhadas');
  assert.match(css, /\.content2:has\(> \.tabs\) \.page-head-row\{[^}]*position:absolute/,
    'as ações deveriam subir para a linha das abas');
  // O seletor NÃO sobe mais para o canto. Ficava em position:absolute,
  // right:0 — exatamente onde moram o chip do usuário, o sino e o chat. Com
  // duas opções passava raspando; ao ganhar a terceira (Compacto) cobriu o
  // nome e saiu cortado pela borda. Encolher para ícones não bastou: o canto
  // continua ocupado. Ele voltou para o fluxo e custa ~30px — sobreposição é
  // pior que 30px. A compactação que importa, as ações subindo para a linha
  // das abas, continua valendo e está afirmada acima.
  assert.match(css, /body\.lw-tela-cheia \.lw-toggle-visao\{[^}]*position:static/,
    'o seletor não pode voltar para o canto: lá ele cobre o nome do usuário');
  // A reserva é medida, não fixa: o nome da pessoa e a quantidade de funis mudam a
  // largura da faixa, e um número chutado faria as abas passarem por baixo dos botões.
  // Lido do corpo da função, delimitado por chaves — um limite de caracteres quebraria
  // a cada linha nova lá dentro, e o teste acusaria o código por um defeito dele mesmo.
  const corpo = trechoDaFuncao('reservarEspacoDasAbas');
  assert.match(corpo, /faixa\.offsetWidth/,
    'a reserva de espaço das abas deveria sair da largura medida da faixa');
  assert.match(corpo, /getComputedStyle\(area\)\.paddingRight/,
    'o alinhamento à direita deveria sair do recuo real da tela, não de um número fixo');
});

test('a compactação não vale em tela sem abas', () => {
  // Fora do funil a faixa não tem para onde subir: solta no absoluto, ela cobriria o
  // conteúdo seguinte. Por isso toda regra de posição é presa ao :has(> .tabs).
  const posicionaSemAbas = /body\.lw-tela-cheia \.page-head-row\{[^}]*position:absolute/.test(css);
  assert.equal(posicionaSemAbas, false,
    '.page-head-row ficou absoluta sem exigir abas — vai cobrir o conteúdo em Documentação e SDR');
});

test('a barra de busca sai na tela cheia e os botões dela descem', () => {
  // Esconder a barra sem mover os botões prenderia a pessoa na tela cheia: o botão de
  // sair mora nela. Por isso o esconder e o mover andam juntos.
  assert.match(css, /body\.lw-tela-cheia \.topbar, body\.lw-tela-cheia \.topbar2\{[^}]*display:none/,
    'a barra de busca deveria sumir na tela cheia');
  assert.match(comum, /function moverAcoesDoTopo\(ligado\)/,
    'falta a função que desce os botões do topo para a faixa de ações');
  assert.match(comum, /moverAcoesDoTopo\(!!ligado\)/,
    'aplicarTelaCheia deveria mover os botões ao ligar e desligar');
  assert.match(comum, /topoDeOnde\.appendChild\(acoes\)/,
    'ao sair da tela cheia os botões têm que voltar para onde estavam');
});
