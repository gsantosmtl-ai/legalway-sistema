// O escritório atende muita gente que não usa e-mail. Exigir e-mail para entrar no
// portal deixava a ferramenta inacessível justamente para quem mais precisa dela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const avisos = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');
const tela = readFileSync(new URL('../../docs/portal-cliente.html', import.meta.url), 'utf8');
const migracao = readFileSync(new URL('../src/migrations/011_portal_login_telefone.sql', import.meta.url), 'utf8');

test('a coluna do telefone existe e é única quando preenchida', () => {
  assert.match(migracao, /ADD COLUMN IF NOT EXISTS telefone TEXT/, 'falta a coluna');
  assert.match(migracao, /CREATE UNIQUE INDEX[\s\S]{0,160}WHERE telefone IS NOT NULL/,
    'dois clientes com o mesmo número tornariam o login ambíguo');
});

test('o telefone é guardado só com dígitos', () => {
  // Guardar formatado faria o login depender de o cliente lembrar se tinha parênteses.
  assert.match(portal, /export const soDigitos = \(t\) => String\(t \|\| ''\)\.replace\(\/\\D\/g, ''\)/,
    'falta a normalização');
  assert.match(portal, /let tel = soDigitos\(telefone\)/, 'o acesso deveria normalizar antes de gravar');
});

test('o login aceita telefone e também e-mail', () => {
  // Quem não tem telefone no cadastro (35 dos 264) continua entrando pelo e-mail.
  assert.match(portal, /const digitado = String\(req\.body\?\.login \?\? req\.body\?\.email \?\? ''\)/,
    'o login deveria aceitar os dois');
  assert.match(portal, /SELECT \* FROM portal_clientes WHERE email = \$1/, 'o e-mail precisa continuar valendo');
});

test('casa pelo final do número', () => {
  // O cadastro pode ter +55 e o cliente digitar sem, ou o contrário.
  assert.match(portal, /telefone LIKE \$2 OR \$1 LIKE/, 'deveria casar por sufixo, não exato');
});

test('número repetido não abre o processo de outra pessoa', () => {
  assert.match(portal, /if \(rows\.length > 1\)/, 'falta tratar o número ambíguo');
  assert.match(portal, /está em mais de um cadastro/, 'o cliente precisa saber o que fazer');
});

test('telefone já usado não impede o acesso de existir', () => {
  // Família que compartilha celular: o segundo acesso nasce só com e-mail em vez de
  // falhar e deixar o cliente sem portal nenhum.
  const i = portal.indexOf('const dono = await query');
  const trecho = portal.slice(i - 200, i + 200);
  assert.match(trecho, /if \(dono\.rows\[0\]\) tel = ''/, 'deveria cair para o e-mail em vez de recusar');
});

test('a mensagem manda o login certo', () => {
  assert.match(avisos, /Login: \{login\}/, 'a mensagem deveria usar o login, não o e-mail fixo');
  assert.match(avisos, /criarAcessoDoProcesso\(String\(p\.id\), p\.clienteNome \|\| 'Cliente', p\.email, QUEM, p\.telefone\)/,
    'o telefone do processo precisa chegar na criação do acesso');
  assert.match(portal, /login: numeroTexto/, 'o login que vai na mensagem é o número do cliente');
});

test('a tela de entrada pede o número, e aceita os outros', () => {
  assert.match(tela, /Seu número de cliente/, 'o rótulo deveria pedir o número');
  assert.match(tela, /telefone ou e-mail/, 'a tela precisa dizer que os outros também valem');
  assert.match(tela, /body:\{ login: \$\('email'\)\.value\.trim\(\)/, 'a tela precisa mandar o campo login');
});

// ---- Número do cliente como login ----
// 00032 é fácil de ditar por telefone, não depende de o cliente ter e-mail nem de
// lembrar como o telefone foi cadastrado, e serve de referência para o escritório.
test('o número existe, é único e foi dado a quem já tinha acesso', () => {
  const m = readFileSync(new URL('../src/migrations/012_portal_numero_cliente.sql', import.meta.url), 'utf8');
  assert.match(m, /ADD COLUMN IF NOT EXISTS numero INTEGER/, 'falta a coluna');
  assert.match(m, /CREATE UNIQUE INDEX[\s\S]{0,140}WHERE numero IS NOT NULL/, 'dois clientes com o mesmo número seria ambíguo');
  assert.match(m, /UPDATE portal_clientes p SET numero = o\.n/, 'quem já tem acesso precisa receber número');
});

test('renovar a senha não troca o número que o cliente anotou', () => {
  assert.match(portal, /let numero = rows\[0\] && rows\[0\]\.numero;\s*\n\s*if \(!numero\)/,
    'o número só deveria nascer quando o cliente ainda não tem');
});

test('o número é o login que vai na mensagem', () => {
  assert.match(portal, /const numeroTexto = String\(numero\)\.padStart\(5, '0'\)/, 'falta o formato 00032');
  assert.match(portal, /login: numeroTexto/, 'a mensagem deveria mandar o número');
});

test('o sistema distingue número de telefone sozinho', () => {
  // O cliente não precisa dizer qual está usando: até 6 dígitos é número, 8 ou mais
  // é telefone.
  assert.match(portal, /digitos\.length <= 6[\s\S]{0,120}WHERE numero = \$1/, 'falta a busca por número');
  assert.match(portal, /digitos\.length >= 8/, 'o telefone precisa continuar funcionando');
});

test('a trava por origem impede varrer a sequência', () => {
  // Sem ela, alguém tentaria 00001, 00002, 00003… e nenhum contador dispararia:
  // os outros dois só contam erros do MESMO login.
  assert.match(portal, /portal-origem:\$\{req\.ip\}/, 'falta a chave por origem');
  assert.match(portal, /max: 30/, 'o limite por origem tem que ser maior que o da conta');
});

test('acertar a senha não zera a trava por origem', () => {
  // Senão bastaria um acerto no meio da varredura para recomeçar do zero.
  const t = readFileSync(new URL('../src/tentativas.js', import.meta.url), 'utf8');
  assert.match(t, /filter\(n => !n\.startsWith\('portal-origem:'\)\)/,
    'a chave por origem não pode ser apagada num acerto');
});

test('travar um endereço com 6 erros derrubaria inocente', () => {
  // Operadora de celular põe milhares de clientes atrás do mesmo IP.
  const t = readFileSync(new URL('../src/tentativas.js', import.meta.url), 'utf8');
  assert.match(t, /const partes = \(c\) => \(typeof c === 'string'/, 'falta o limite por chave');
  assert.match(t, /\[chave, max\]/, 'o limite precisa ir para o banco, não ficar fixo');
});
