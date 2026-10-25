// As regras de celular vivem no comum.js e valem para as 22 telas de uma vez.
// Este teste guarda as três decisões que custaram caro para descobrir.
//
// A armadilha central: quando a página estoura, o Chrome do celular ESTICA a
// janela para caber o conteúdo. Medido em 24/10/2026 numa tela de 390px:
// Auditoria reportava innerWidth de 915, Agenda 933, Contratos 736. Com isso,
// `@media (max-width:820px)` deixa de valer e `innerWidth > 820` também — ou
// seja, toda defesa baseada neles desliga exatamente nas telas quebradas.
// Vira um laço: estoura, a regra não aplica, continua estourando.
//
// A medida que não mente é `screen.width`, o aparelho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');

test('a classe de celular vem da tela do aparelho, não da janela', () => {
  assert.match(comum, /window\.screen && window\.screen\.width/,
    'usar só innerWidth desliga as regras justamente nas telas que estouram');
  assert.match(comum, /classList\.toggle\('lw-celular'/);
});

test('a largura do aparelho vira variável de CSS', () => {
  assert.match(comum, /setProperty\('--lw-tela'/,
    'sem esse teto, nem 100% nem 100vw seguram: os dois sobem junto quando a janela estica');
  // o teto precisa estar nos CONTÊINERES, não só na tabela: foi tirando ele
  // do .main que o Financeiro saltou de 390 para 757
  assert.match(comum, /html\.lw-celular \.main,[\s\S]{0,200}max-width:var\(--lw-tela/,
    'sem teto no contêiner, qualquer filho largo estica a página inteira de novo');
  assert.match(comum, /html\.lw-celular table\{[^}]*max-width:var\(--lw-tela/,
    'a tabela virada bloco toma a largura do conteúdo se não tiver teto');
});

test('a barra lateral some no celular — e é regra compartilhada', () => {
  // Contratos, Clientes e Agenda nunca tiveram essa regra própria: no celular
  // a barra ocupava 250px e empurrava tudo. Contratos media 1.832px.
  assert.match(comum, /html\.lw-celular \.sidebar\{ display:none; \}/);
  assert.match(comum, /html\.lw-celular body\.lw-menu-aberto \.sidebar\{ display:flex !important/,
    'o menu aberto precisa continuar vencendo, senão o ☰ não abre nada');
});

test('coluna lateral de largura fixa vira linha de baixo', () => {
  // "1fr 300px" numa tela de 390 dá 1.582px de página
  assert.match(comum, /\.content-cols,[\s\S]{0,80}\.resumo-cols\{ grid-template-columns:1fr !important; \}/);
});

test('tabela larga rola dentro de si', () => {
  assert.match(comum, /html\.lw-celular table\{ display:block; overflow-x:auto/);
});

test('alvo de toque mínimo no celular', () => {
  assert.match(comum, /html\.lw-celular button,[\s\S]{0,60}min-height:40px/,
    '34 dos 37 botões do Funil eram menores que o mínimo para o dedo');
});

test('a gaveta fechada não estica a página', () => {
  // overflow:clip no body NÃO corta quem é position:fixed
  assert.match(comum, /html\.lw-celular \.drawer:not\(\.show\)\{ display:none; \}/);
});

test('as telas internas que faltavam agora carregam o comum.js', () => {
  for (const tela of ['auditoria', 'seguranca', 'importar', 'ajuda']) {
    const html = readFileSync(new URL(`../../docs/${tela}.html`, import.meta.url), 'utf8');
    assert.match(html, /assets\/comum\.js/, `${tela}.html não carrega o comum.js e fica sem nenhuma das regras`);
  }
});

test('as telas públicas continuam fora disso', () => {
  // login e portal do cliente não têm menu nem devem ganhar o ☰
  for (const tela of ['login', 'portal-cliente', 'verificar']) {
    const html = readFileSync(new URL(`../../docs/${tela}.html`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /assets\/comum\.js/, `${tela}.html não deveria carregar o comum.js`);
  }
});
