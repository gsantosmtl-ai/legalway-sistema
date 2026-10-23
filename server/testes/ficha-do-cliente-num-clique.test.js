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
  assert.match(comum, /LW\.fichaDoCliente\(\{ contratoId: id, nome: ct && ct\.cliente \}\)/,
    'abre o popup pelo id do contrato, que é o que a lista tem à mão');
  assert.ok(!/window\.location\.href = 'clientes\.html/.test(comum),
    'não pode mais navegar para fora: ela pediu para não sair da tela');
  assert.match(comum, /Clique num cliente para abrir a ficha completa dele\./,
    'sem o aviso, ninguém descobre que a linha clica');
});

test('a ficha é uma tela só, não um monte de abas', () => {
  // "Quero ver situação financeira, contrato, processos, de uma forma
  // unificada. Quero ver tudo sobre a Edna." Unificada quer dizer lendo de cima
  // a baixo — não nove abas em que é preciso clicar uma a uma para descobrir se
  // o cliente deve alguma coisa.
  assert.match(comum, /window\.LW\.fichaDoCliente = async \(\{ contratoId, clienteId, nome \}\)=>/, 'falta a ficha');
  for (const bloco of ['Contratos', 'Processos', 'Extrato — todas as parcelas']) {
    assert.ok(comum.includes("titulo('" + bloco + "')"), 'falta o bloco ' + bloco);
  }
  for (const c of ['Contratado', 'Já recebido', 'Em aberto', 'Atrasado']) {
    assert.ok(comum.includes("cartao('" + c + "'"), 'falta o número de ' + c);
  }
  assert.ok(!/<iframe/.test(comum), 'o iframe da página de Clientes saiu — abria a lista, não a ficha');
});

test('junta o cliente mesmo sem vínculo de contrato', () => {
  const i = comum.indexOf('const ehDele = (x, campoNome)=>');
  const corpo = comum.slice(i, comum.indexOf('const meusContratos', i));
  assert.match(corpo, /if\(n && n === normal\(nomeAlvo\)\) return true;/, 'pelo nome');
  assert.match(corpo, /tel\.length >= 10 && soDig\(x\.telefone\)\.slice\(-10\) === tel\.slice\(-10\)/,
    'e pelo telefone, só com dígitos e a partir de 10');
});

test('parcela cancelada não entra nas contas, e isso é dito', () => {
  assert.match(comum, /const vivas = minhasParcelas\.filter\(f=> f\.status !== 'Cancelado'\)/);
  assert.match(comum, /parcela\(s\) cancelada\(s\) não entram nas contas acima/,
    'o número tem que bater com a lista, ou a pessoa desconfia dos dois');
});

test('fechar enquanto carrega não quebra', () => {
  assert.match(comum, /if\(!document\.getElementById\('lw-ficha-cliente'\)\) return;/);
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
