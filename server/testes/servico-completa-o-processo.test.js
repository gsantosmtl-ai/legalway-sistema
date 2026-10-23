// "Ainda está aparecendo no do cliente." / "Não apareceu o formulário que ele
// tem que preencher do Visto T e não apareceu os documentos modelos, cartas,
// nada."
//
// O processo guarda uma CÓPIA do checklist do serviço, feita no dia em que
// nasceu. Ela marcou os formulários como internos no Visto T, ligou o
// formulário, escreveu as orientações — e nada disso chegou aos 264 processos
// que já existiam. No banco: 5 itens internos no checklist do Visto T e ZERO
// nos 3.754 itens dos processos.
//
// A saída não é reescrever 3.754 itens a cada mudança (2 MB de gravação, e uma
// chance real de falhar pela metade): é o portal consultar o serviço na hora de
// montar a tela. O que o processo tem ganha — foi alguém decidindo para aquele
// cliente. O que o processo não tem, o serviço responde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const motor = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');

test('o portal lê o checklist do serviço', () => {
  assert.match(portal, /const K_CHECKLISTS = 'legalway-checklists-v1'/, 'falta a chave');
  assert.match(portal, /async function servicoPorNome\(servico\)/, 'falta a leitura');
  const i = portal.indexOf('async function servicoPorNome(servico)');
  const corpo = portal.slice(i, portal.indexOf('\n}', i));
  assert.match(corpo, /\[\.\.\.\(ck\.documentos \|\| \[\]\), \.\.\.\(ck\.documentosDependente \|\| \[\]\)\]/,
    'o do dependente conta igual');
  assert.match(corpo, /catch \{ return new Map\(\); \}/,
    'serviço ilegível não pode derrubar o portal');
  assert.match(corpo, /String\(c\.servico \|\| ''\)\.trim\(\)\.toLowerCase\(\) === alvo/,
    'o nome do serviço vem digitado por gente');
});

test('marcar no serviço esconde no processo que já existia', () => {
  assert.match(portal, /\.filter\(\(\{ d \}\) => !\(d\.interno \|\| \(noServico\(d\.nome\) \|\| \{\}\)\.interno\)\)/,
    'o filtro precisa olhar os dois');
});

test('a orientação e o formulário também vêm do serviço', () => {
  assert.match(portal, /dica: d\.dica \|\| \(noServico\(d\.nome\) \|\| \{\}\)\.dica \|\| ''/,
    'a orientação escrita no serviço tem que chegar ao cliente de hoje');
  assert.match(portal, /formularioId: d\.formularioId \|\| \(noServico\(d\.nome\) \|\| \{\}\)\.formularioId \|\| ''/,
    'ligar o formulário no serviço tem que valer para quem já existe');
});

test('o que decide o que o cliente PODE fazer enxerga o mesmo que a tela', () => {
  // Senão o cliente vê "Preencher formulário" e o botão responde 404 — ou pior,
  // um item escondido pela tela continua aceitando anexo pelo índice.
  assert.match(portal, /async function docDoCliente\(p, indice\)/, 'falta a função que junta os dois');
  const usos = (portal.match(/await docDoCliente\(p, indice\)/g) || []).length;
  assert.equal(usos, 3, 'envio de arquivo, abrir formulário e gravar formulário');
  assert.match(portal, /const alvo = \(p\.checklist \|\| \[\]\)\.filter\(d => d && !ehInterno\(d\)/,
    'a escolha da tradução também');
});

test('o que o processo tem ganha do serviço', () => {
  // Se alguém marcou algo naquele cliente, foi decisão para aquele cliente.
  const i = portal.indexOf('async function docDoCliente(p, indice)');
  const corpo = portal.slice(i, portal.indexOf('\n}', i));
  assert.match(corpo, /formularioId: doc\.formularioId \|\| doServico\.formularioId \|\| ''/,
    'o do processo vem primeiro');
  assert.match(corpo, /interno: !!\(doc\.interno \|\| doServico\.interno\)/,
    'interno em qualquer um dos dois é interno — esconder é o lado seguro');
});

test('a mensagem de boas-vindas também consulta o serviço', () => {
  // Foi o que ela viu primeiro: a Lais convidada a anexar FORM I-914.
  assert.match(motor, /checklists: 'legalway-checklists-v1'/, 'falta a chave no motor');
  assert.match(motor, /const pendentesDe = \(p, internoNoServico\) =>/, 'a função precisa receber a consulta');
  assert.match(motor, /&& !d\.interno && !\(internoNoServico && internoNoServico\(p\.servico, d\.nome\)\)/,
    'e usá-la no filtro');
  assert.equal((motor.match(/pendentesDe\(p, d\.internoNoServico\)/g) || []).length, 2,
    'boas-vindas e follow-up de documentos, os dois');
  assert.match(motor, /const internoNoServico = \(servico, nome\) =>/, 'falta montar a consulta');
  assert.match(motor, /normalize\('NFD'\)\.replace\(\/\[\\u0300-\\u036f\]\/g, ''\)/,
    'acento não pode separar "CERTIDAO" de "CERTIDÃO"');
});

test('o nome com descrição entre parênteses é o mesmo documento', () => {
  // O checklist do Visto T diz "FORM LINK (REGISTRO DE DADOS DO CLIENTE)" e o
  // processo da Lais, criado antes, diz só "FORM LINK". É o mesmo documento com
  // a descrição acrescentada depois — e, sem isto, ligar o formulário no
  // serviço não alcançava nenhum dos 264 processos.
  assert.ok(portal.includes(String.raw`const chaveSemDescricao = (n) => chaveDoNome(n).replace(/\s*\([^)]*\)\s*/g, ' ').trim();`),
    'falta a chave sem a descrição');
  assert.match(portal, /doServico\.get\(chaveDoNome\(nome\)\) \|\| doServico\.get\(chaveSemDescricao\(nome\)\)/,
    'a consulta precisa tentar as duas formas');
  assert.match(motor, /nomes\.has\(semAcento\(nome\)\) \|\| nomes\.has\(semDescricao\(nome\)\)/,
    'a mensagem de boas-vindas também');
});

test('o nome inteiro ganha da versão sem parênteses', () => {
  // Se os dois existirem no checklist, o que casa exato é o que vale.
  const i = portal.indexOf('const guardar = (k, v) =>');
  const corpo = portal.slice(i, portal.indexOf('return mapa;', i));
  const iInteiro = corpo.indexOf('guardar(chaveDoNome(d.nome)');
  const iSem = corpo.indexOf('guardar(chaveSemDescricao(d.nome)');
  assert.ok(iInteiro > 0 && iSem > iInteiro, 'o nome inteiro precisa ser guardado primeiro');
  assert.match(corpo, /if \(k && !mapa\.has\(k\)\) mapa\.set\(k, v\)/,
    'quem chegou primeiro fica — senão a segunda chance sobrescreveria o casamento exato');
});
