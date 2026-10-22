// Dois pedidos da Tatiane no mesmo lugar: documento que é FORMULÁRIO (o cliente preenche
// um link, não anexa arquivo) e a lista do dependente VISÍVEL em Configurações, para ela
// decidir o que acrescentar, trocar ou tirar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const tela = readFileSync(new URL('../../docs/portal-cliente.html', import.meta.url), 'utf8');
const automacoes = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');

test('o link do formulário se cadastra nas duas listas', () => {
  assert.match(cfg, /data-doc-url=/, 'falta o campo de link no checklist do titular');
  assert.match(cfg, /data-dep-url=/, 'falta o campo de link no checklist do dependente');
});

test('o link só aceita endereço de verdade', () => {
  // Um link sem https:// vira link relativo e abre dentro do próprio sistema.
  assert.match(cfg, /if\(valor && !\/\^https\?:\\\/\\\/\/i\.test\(valor\)\)/,
    'o campo deveria recusar o que não começa com http');
});

test('o link viaja do serviço para o processo e para o portal', () => {
  assert.match(automacoes, /url: d\.url \|\| '',/, 'o processo precisa herdar o link do serviço');
  assert.match(portal, /url: d\.url \|\| '',/, 'o portal precisa receber o link');
});

test('item com link vira "preencher", não "anexar"', () => {
  assert.match(tela, /\$\{d\.url\s*\n?\s*\? `/, 'o portal deveria trocar o botão quando há link');
  assert.match(tela, /Preencher formulário/, 'falta o botão de abrir o formulário');
  assert.match(tela, /data-formulario=/, 'falta o botão de avisar que preencheu');
});

test('avisar que preencheu grava e chama a equipe', () => {
  assert.match(portal, /rotasPortalCliente\.post\('\/portal\/formulario'/, 'falta a rota');
  assert.match(portal, /doc\.status = 'Recebido'/,
    'o formulário preenchido fica como Recebido — quem aprova é a documentação');
  assert.match(portal, /preencheu o formulário/, 'falta o aviso para a equipe');
});

test('só vale para item que é formulário e não é interno', () => {
  const i = portal.indexOf("'/portal/formulario'");
  const trecho = portal.slice(i, i + 900);
  assert.match(trecho, /!doc \|\| doc\.interno \|\| !doc\.url/,
    'sem essa guarda, o cliente marcaria qualquer item como preenchido');
});

test('a lista do dependente aparece em Configurações mesmo sem lista própria', () => {
  // Sem ver o que o dependente recebe hoje, não dá para decidir o que mudar.
  assert.match(cfg, /É esta, exatamente o que o dependente vai receber hoje/,
    'a tela deveria mostrar a lista herdada');
  assert.match(cfg, /modelo\.documentos\|\|\[\]\)\.map\(\(d,n\)=>/,
    'a lista herdada tem que ser desenhada item a item');
});

test('copiar do titular cria uma lista independente', () => {
  assert.match(cfg, /data-copiar-dep=/, 'falta o botão de copiar');
  assert.match(cfg, /m\.documentosDependente = base\.map/, 'copiar deveria materializar a lista');
  assert.match(cfg, /precisaTraducao: d\.precisaTraducao !== false, interno: !!d\.interno/,
    'a cópia precisa levar os marcadores junto, senão ela nasce diferente do que estava valendo');
});
