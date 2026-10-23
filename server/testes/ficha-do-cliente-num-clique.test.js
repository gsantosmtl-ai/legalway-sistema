// "Clicar e já ver a parte inteira do cliente: financeiro, processo, uma aba
// que traz todos os resumos desse cliente — extrato, status do processo,
// status do contrato."
//
// Essa ficha JÁ EXISTE, em Clientes: um painel com Resumo, Comercial,
// Contratos, Financeiro, Documentos, Processos, Tarefas, Comunicação e
// Timeline. O que faltava não era a tela — era chegar nela. De "Contratos
// assinados no mês" ela via o nome e tinha de ir até Clientes procurar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const clientes = readFileSync(new URL('../../docs/clientes.html', import.meta.url), 'utf8');

test('a ficha continua tendo as abas que ela descreveu', () => {
  for (const aba of ['resumo', 'financeiro', 'processos', 'contratos', 'documentos', 'timeline']) {
    assert.match(clientes, new RegExp(`data-dtab="${aba}"`), `a ficha precisa ter a aba ${aba}`);
  }
});

test('a linha do contrato leva para a ficha', () => {
  assert.match(comum, /<tr data-ficha="\$\{esc\(c\.id\)\}" title="Abrir a ficha de \$\{esc\(c\.cliente\)\}"/,
    'a linha precisa ser clicável e dizer para onde vai');
  assert.match(comum, /cursor:pointer;/, 'e parecer clicável');
  assert.match(comum, /window\.location\.href = 'clientes\.html\?contrato=' \+ encodeURIComponent/,
    'leva pelo id do contrato, que é o que a lista tem à mão');
  assert.match(comum, /Clique num cliente para abrir a ficha completa dele\./,
    'sem o aviso, ninguém descobre que a linha clica');
});

test('a ficha abre sozinha quando chega pela URL', () => {
  assert.match(clientes, /function abrirPelaUrl\(\)/, 'falta a abertura por URL');
  const i = clientes.indexOf('function abrirPelaUrl()');
  const corpo = clientes.slice(i, clientes.indexOf('\n}', i));
  assert.match(corpo, /q\.get\('cliente'\)/, 'aceita o id do cliente');
  assert.match(corpo, /q\.get\('contrato'\)/, 'e o id do contrato');
  assert.match(corpo, /if\(alvo\) openDrawer\(alvo\.id\);/, 'e abre a ficha');
  // Depois de os dados carregarem, senão não há cliente para achar.
  assert.match(clientes, /renderUltimosClientes\(\);\s*\n\s*abrirPelaUrl\(\);/,
    'tem que ser a última coisa do carregamento');
});

test('contrato sem vínculo de cliente ainda acha pelo nome', () => {
  // Contrato importado do Bling antes de o cliente ganhar contratoIds: sem esta
  // saída, clicar não abriria nada e pareceria que a ficha não existe.
  const i = clientes.indexOf('function abrirPelaUrl()');
  const corpo = clientes.slice(i, clientes.indexOf('\n}', i));
  assert.match(corpo, /\(c\.contratoIds\|\|\[\]\)\.some\(id=> String\(id\) === String\(porContrato\)\)/,
    'primeiro pelo vínculo, que é o certo');
  assert.match(corpo, /String\(c\.nome\|\|''\)\.trim\(\)\.toLowerCase\(\) === n/,
    'depois pelo nome do contrato');
});

test('cliente que não existe avisa, em vez de abrir em branco', () => {
  const i = clientes.indexOf('function abrirPelaUrl()');
  const corpo = clientes.slice(i, clientes.indexOf('\n}', i));
  assert.match(corpo, /else if\(porCliente \|\| porContrato\) toast\(/,
    'quem veio de um link quebrado precisa saber o que houve');
  assert.match(corpo, /importado sem cadastro de cliente/, 'com o motivo provável');
  // E quem entra em Clientes sem parâmetro nenhum não vê aviso nenhum.
  assert.ok(/else if\(porCliente \|\| porContrato\)/.test(corpo),
    'o aviso não pode aparecer na visita normal');
});
