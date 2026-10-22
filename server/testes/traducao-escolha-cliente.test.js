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

// Ela abriu o portal e viu a mesma pergunta repetida em cada documento:
// "o certo é ter lá em cima uma única pergunta". A escolha passou a ser do
// PROCESSO — uma pergunta, uma resposta, válida para tudo que precisa de
// tradução. Continua gravada em cada documento porque é de lá que o pacote da
// tradutora é montado.
test('a pergunta é uma só, no alto da lista', () => {
  assert.match(portal, /const precisamTraducao = checklist\.filter\(d => d\.traduz\)/,
    'o servidor precisa dizer quantos documentos precisam de tradução');
  assert.match(portal, /peloCliente: escolhas\.size === 1 \? \[\.\.\.escolhas\]\[0\] : null/,
    'só conta como respondida quando todos concordam');
  assert.match(tela, /p\.traducao && p\.traducao\.precisa \? `/, 'a tela mostra uma pergunta só');
  assert.ok(!/data-trad="\$\{d\.indice\}/.test(tela),
    'não pode sobrar a pergunta dentro de cada documento');
});

test('quem não escolheu aparece como não escolhido, não como "escritório traduz"', () => {
  // Mostrar uma resposta que o cliente nunca deu é pior que mostrar a pergunta.
  assert.match(portal, /d\.traducaoPeloCliente === undefined \? null : !!d\.traducaoPeloCliente/,
    'sem escolha, o valor tem que ser null');
  assert.match(tela, /Enquanto você não escolher, seguimos com a tradução por nossa conta\./,
    'a tela deveria tratar o caso de ainda não ter escolhido');
});

test('uma resposta vale para todos os documentos que traduzem', () => {
  const i = portal.indexOf("'/portal/traducao'");
  const trecho = portal.slice(i, i + 2200);
  assert.match(trecho, /for \(const d of alvo\) d\.traducaoPeloCliente = peloCliente/,
    'a escolha tem que descer para cada documento — é de lá que sai o pacote da tradutora');
  assert.match(trecho, /p\.traducaoPeloCliente = peloCliente/,
    'e ficar gravada no processo, que é onde a pergunta mora agora');
  assert.match(trecho, /await gravar\(K_PROCESSOS, processos, versao, 'portal do cliente'\)/,
    'a escolha precisa ir para o banco');
});

test('a escolha vira histórico e aviso para a equipe', () => {
  // Some dinheiro do pacote da tradutora: ninguém pode descobrir isso por acaso.
  const i = portal.indexOf("'/portal/traducao'");
  const trecho = portal.slice(i, i + 2200);
  assert.match(trecho, /Cliente escolheu providenciar a tradução por conta/, 'falta o histórico');
  assert.match(trecho, /avisarCanal\('documentacao'/, 'a documentação precisa ser avisada');
  assert.match(trecho, /não entram no pacote da tradutora/, 'o aviso tem que dizer o que muda');
});

test('item interno e documento que não traduz ficam de fora da escolha', () => {
  const i = portal.indexOf("'/portal/traducao'");
  const trecho = portal.slice(i, i + 1200);
  assert.match(trecho, /\.filter\(d => d && !d\.interno && d\.precisaTraducao !== false\)/,
    'formulário do escritório não é do cliente, e quem não traduz não entra');
  assert.match(trecho, /if \(!alvo\.length\) return res\.status\(409\)/,
    'sem nada para traduzir, a pergunta não existe');
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
