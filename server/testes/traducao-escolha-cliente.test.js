// O cliente escolhe quem traduz: o escritório ou ele mesmo. Dizer "eu providencio" tira
// o documento do pacote da tradutora — é dinheiro, então a escolha é gravada no servidor,
// registrada no histórico e avisada à equipe, não só pintada na tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const arquivos = readFileSync(new URL('../src/arquivos.js', import.meta.url), 'utf8');
const tela = readFileSync(new URL('../../docs/portal-cliente.html', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

test('o cliente vê a escolha só no documento que precisa de tradução', () => {
  assert.match(portal, /traduz: d\.precisaTraducao !== false/,
    'o portal precisa dizer quais documentos vão para tradução');
  assert.match(tela, /\$\{d\.traduz \? `/, 'a pergunta só deveria aparecer nesses documentos');
});

test('quem não escolheu aparece como não escolhido, não como "escritório traduz"', () => {
  // Mostrar uma resposta que o cliente nunca deu é pior que mostrar a pergunta.
  assert.match(portal, /d\.traducaoPeloCliente === undefined \? null : !!d\.traducaoPeloCliente/,
    'sem escolha, o valor tem que ser null');
  assert.match(tela, /d\.traducaoPeloCliente === null \? `/,
    'a tela deveria tratar o caso de ainda não ter escolhido');
});

test('a escolha é gravada no servidor', () => {
  assert.match(portal, /rotasPortalCliente\.post\('\/portal\/traducao'/, 'falta a rota');
  assert.match(portal, /doc\.traducaoPeloCliente = peloCliente/, 'falta gravar a escolha');
  assert.match(portal, /await gravar\(K_PROCESSOS, processos, versao, 'portal do cliente'\)/,
    'a escolha precisa ir para o banco');
});

test('a escolha vira histórico e aviso para a equipe', () => {
  // Some dinheiro do pacote da tradutora: ninguém pode descobrir isso por acaso.
  const i = portal.indexOf("'/portal/traducao'");
  const trecho = portal.slice(i, i + 2000);
  assert.match(trecho, /Cliente escolheu traduzir por conta própria/, 'falta o histórico');
  assert.match(trecho, /avisarCanal\('documentacao'/, 'a documentação precisa ser avisada');
});

test('o cliente não escolhe por item interno nem por quem não traduz', () => {
  const i = portal.indexOf("'/portal/traducao'");
  const trecho = portal.slice(i, i + 1200);
  assert.match(trecho, /if \(!doc \|\| doc\.interno\)/, 'item interno não é dele');
  assert.match(trecho, /doc\.precisaTraducao === false\) return res\.status\(409\)/,
    'não faz sentido escolher tradução de documento que não traduz');
});

test('o documento escolhido pelo cliente sai do pacote da tradutora', () => {
  assert.match(docs, /d\.precisaTraducao !== false && !d\.traducaoPeloCliente/,
    'o pacote não pode incluir o que o cliente vai traduzir');
  assert.match(arquivos, /!d\.traducaoPeloCliente/,
    'a tradutora não deveria conseguir baixar esse arquivo pelo link do pacote');
});

test('a equipe vê quais o cliente assumiu', () => {
  // Sair do pacote em silêncio faria a documentação achar que esqueceu o documento.
  assert.match(docs, /const clienteTraduz = aprovados\.filter/, 'falta separar os do cliente');
  assert.match(docs, /o cliente vai traduzir por conta/, 'falta mostrar isso na aba de Tradução');
});
