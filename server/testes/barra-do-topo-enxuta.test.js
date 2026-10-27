// "Acho muito botão em cima em documentos, mesma coisa em vendas."
//
// Medido antes de mexer, contando tudo que fica entre o título e o primeiro
// cartão: Documentação tinha CINCO botões na linha de frente, e três deles
// eram configuração — responsáveis, checklists e prestadores externos. Coisa
// que se mexe uma vez por mês disputando espaço com o trabalho do dia.
//
// Nada foi removido. Os três moraram para trás de um "⚙ Ajustes", com o mesmo
// id e a mesma ação, e o botão de teste desceu para a faixa de testes, como já
// era no Comercial.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const ler = (f) => readFileSync(join(DOCS, f), 'utf8');

function barraDoTopo(arquivo) {
  const s = ler(arquivo);
  const i = s.indexOf('class="page-head-row"');
  assert.ok(i > 0, `${arquivo} não tem barra de topo`);
  const ini = s.lastIndexOf('<div', i);
  let nivel = 0, fim = -1;
  for (const m of s.slice(ini).matchAll(/<div\b|<\/div>/g)) {
    nivel += m[0] === '<div' ? 1 : -1;
    if (nivel === 0) { fim = ini + m.index + m[0].length; break; }
  }
  return s.slice(ini, fim);
}

test('a Documentação tem dois botões na linha de frente, não cinco', () => {
  const barra = barraDoTopo('documentos.html');
  // Só os do primeiro nível: os de dentro do menu não contam, estão guardados.
  const semMenu = barra.replace(/<div id="menu-ajustes-doc"[\s\S]*?<\/div>\s*<\/div>/, '');
  const botoes = (semMenu.match(/<button\b/g) || []).length;
  assert.ok(botoes <= 2, `ainda são ${botoes} botões na linha de frente`);
});

test('os três ajustes continuam existindo, com o mesmo id e a mesma ação', () => {
  const s = ler('documentos.html');
  for (const id of ['btn-config-extra', 'btn-checklists', 'btn-visao-prestadores']) {
    assert.equal((s.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1,
      `${id} deveria existir uma vez`);
    assert.match(s, new RegExp(`getElementById\\('${id}'\\)`),
      `${id} perdeu a ação que tinha`);
  }
  const menu = s.slice(s.indexOf('id="menu-ajustes-doc"'), s.indexOf('id="menu-ajustes-doc"') + 1400);
  for (const id of ['btn-config-extra', 'btn-checklists', 'btn-visao-prestadores']) {
    assert.ok(menu.includes(id), `${id} precisa estar dentro do menu de ajustes`);
  }
});

test('o menu de ajustes fecha sozinho — com Esc, clicando fora e ao escolher', () => {
  const s = ler('documentos.html');
  const i = s.indexOf("const bt = document.getElementById('btn-ajustes-doc')");
  assert.ok(i > 0, 'o menu precisa estar ligado');
  const bloco = s.slice(i, i + 1100);
  assert.match(bloco, /Escape/, 'Esc tem que fechar — é o padrão do sistema');
  assert.match(bloco, /!menu\.contains\(e\.target\)/, 'clicar fora fecha');
  assert.match(bloco, /menu\.addEventListener\('click'/, 'escolher uma opção fecha o menu');
});

test('o botão que cria dado de verdade saiu da linha de frente', () => {
  const barra = barraDoTopo('documentos.html');
  assert.ok(!barra.includes('btn-cliente-teste-completo'),
    'botão de teste não fica ao lado da ação do dia');
  const s = ler('documentos.html');
  const i = s.indexOf('id="btn-cliente-teste-completo"');
  const antes = s.lastIndexOf('test-panel', i);
  assert.ok(antes > 0 && i - antes < 400, 'ele mora na faixa de testes, como nas outras telas');
});

test('a proteção de administrador está no BOTÃO, não só na faixa', () => {
  // Se estiver só no container, alguém que mova o botão leva a proteção embora
  // sem perceber. Foi o que eu quase fiz.
  const s = ler('documentos.html');
  const i = s.indexOf('id="btn-cliente-teste-completo"');
  const tag = s.slice(s.lastIndexOf('<button', i), s.indexOf('>', i) + 1);
  assert.match(tag, /data-so-admin/, 'o botão precisa carregar a própria proteção');
});

test('o Comercial continua com uma ação só na linha de frente', () => {
  const barra = barraDoTopo('funil-comercial.html');
  const botoes = (barra.match(/<button\b/g) || []).length;
  assert.ok(botoes <= 2, `o Comercial ficou com ${botoes} botões em cima`);
  assert.match(barra, /\+ Adicionar lead/, 'a ação principal continua ali');
});
