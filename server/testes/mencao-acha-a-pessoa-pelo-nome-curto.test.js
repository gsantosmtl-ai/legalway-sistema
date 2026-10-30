// Medido na produção em 30/10/2026, nas 30 menções já gravadas:
//
//   "Vitória" (15x) -> chegava
//   "Bruno"   (13x) -> NUNCA CHEGOU
//   "Renato"  (1x)  -> chegava
//   "neilson flores" (1x) -> chegava
//
// O sistema tem DUAS listas de nomes: o cadastro de usuários ("Bruno Carvalho
// Maciel") e a lista de responsáveis de Documentação ("Bruno"). As menções
// usam a curta, e a comparação era exata — então o recado sumia sem erro
// nenhum. 13 de 30 menções perdidas, em silêncio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';
const { mesmaPessoa } = await import('../src/lembretes.js');

const ATIVOS = ['Adriano', 'Bruno Carvalho Maciel', 'neilson flores', 'Peterson', 'Renato', 'Tatiane', 'Vitória'];

test('o nome curto acha a pessoa cadastrada com nome completo', () => {
  assert.ok(mesmaPessoa('Bruno', 'Bruno Carvalho Maciel', ATIVOS),
    'é exatamente o caso das 13 menções que sumiram');
});

test('o nome completo também acha, no sentido contrário', () => {
  assert.ok(mesmaPessoa('Bruno Carvalho Maciel', 'Bruno', ATIVOS));
});

test('acento continua não importando', () => {
  assert.ok(mesmaPessoa('Vitoria', 'Vitória', ATIVOS));
  assert.ok(mesmaPessoa('Vitória', 'Vitoria', ATIVOS));
});

test('pessoas diferentes não se confundem', () => {
  assert.ok(!mesmaPessoa('Bruno', 'Renato', ATIVOS));
  assert.ok(!mesmaPessoa('Peterson', 'Vitória', ATIVOS));
  assert.ok(!mesmaPessoa('', 'Bruno', ATIVOS));
  assert.ok(!mesmaPessoa('Bruno', '', ATIVOS));
});

test('com DOIS do mesmo primeiro nome, o atalho é desligado', () => {
  // Avisar o Bruno errado é pior do que não avisar ninguém.
  const dois = [...ATIVOS, 'Bruno Alves de Lima'];
  assert.ok(!mesmaPessoa('Bruno', 'Bruno Carvalho Maciel', dois),
    'com dois Brunos o primeiro nome deixa de ser suficiente');
  // mas o nome completo continua funcionando
  assert.ok(mesmaPessoa('Bruno Carvalho Maciel', 'Bruno Carvalho Maciel', dois));
});

test('dois nomes compostos com o mesmo primeiro nome não casam', () => {
  const lista = ['Ana Paula Souza', 'Ana Clara Dias'];
  assert.ok(!mesmaPessoa('Ana Paula Souza', 'Ana Clara Dias', lista));
});

test('o chat também procura pela forma curta', async () => {
  const { readFileSync } = await import('node:fs');
  const chat = readFileSync(new URL('../src/chat.js', import.meta.url), 'utf8');
  assert.match(chat, /split\(\/\\s\+\/\)\[0\] === alvo/, 'avisarPessoa não tenta o primeiro nome');
  assert.match(chat, /mesmos\.length === 1/, 'e precisa desistir quando houver dois iguais');
});
