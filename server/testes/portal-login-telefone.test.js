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
  assert.match(portal, /login: tel \|\| limpo/, 'o login é o telefone quando existe, senão o e-mail');
});

test('a tela de entrada pede telefone', () => {
  assert.match(tela, /Telefone ou e-mail/, 'o rótulo deveria mudar');
  assert.match(tela, /body:\{ login: \$\('email'\)\.value\.trim\(\)/, 'a tela precisa mandar o campo login');
});
