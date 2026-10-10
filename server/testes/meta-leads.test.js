// Testa a porta de entrada do webhook da Meta sem precisar de banco nem da Meta.
// O que importa aqui é a assinatura: sem ela, qualquer pessoa na internet
// conseguiria despejar lead falso direto no funil do escritório.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import express from 'express';

process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
process.env.META_VERIFY_TOKEN = 'frase-secreta-de-teste';
process.env.META_APP_SECRET = 'segredo-do-app';
delete process.env.META_PAGE_TOKEN;  // sem token: recebe, responde 200 e não grava

const { rotasMetaLeads } = await import('../src/meta-leads.js');

const app = express();
app.use('/api/publico/meta', express.json({ verify: (req, _r, buf) => { req.corpoBruto = buf; } }));
app.use('/api', rotasMetaLeads);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${servidor.address().port}/api/publico/meta/leads`;

const assinar = (corpo) =>
  'sha256=' + createHmac('sha256', 'segredo-do-app').update(corpo).digest('hex');

const CORPO = JSON.stringify({
  object: 'page',
  entry: [{ id: '905128782690235', time: Date.now(), changes: [
    { field: 'leadgen', value: { leadgen_id: '999', page_id: '905128782690235', form_id: '123' } }] }],
});

test('aperto de mão: token certo devolve o desafio', async () => {
  const r = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=frase-secreta-de-teste&hub.challenge=abc123`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'abc123');
});

test('aperto de mão: token errado é recusado', async () => {
  const r = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc123`);
  assert.equal(r.status, 403);
});

test('lead com assinatura válida é aceito', async () => {
  const r = await fetch(base, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': assinar(CORPO) }, body: CORPO });
  assert.equal(r.status, 200);
});

test('lead SEM assinatura é recusado', async () => {
  const r = await fetch(base, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: CORPO });
  assert.equal(r.status, 403);
});

test('lead com assinatura de outro segredo é recusado', async () => {
  const falsa = 'sha256=' + createHmac('sha256', 'segredo-errado').update(CORPO).digest('hex');
  const r = await fetch(base, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': falsa }, body: CORPO });
  assert.equal(r.status, 403);
});

test('corpo adulterado depois de assinado é recusado', async () => {
  const adulterado = CORPO.replace('999', '111');
  const r = await fetch(base, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': assinar(CORPO) }, body: adulterado });
  assert.equal(r.status, 403);
});

test('estado diz o que falta, sem vazar segredo', async () => {
  const r = await fetch(`http://127.0.0.1:${servidor.address().port}/api/publico/meta/estado`);
  const j = await r.json();
  assert.equal(j.verificacao, true);
  assert.equal(j.assinatura, true);
  assert.equal(j.token, false);       // não configuramos
  assert.equal(j.pronto, false);
  assert.ok(!JSON.stringify(j).includes('segredo-do-app'));
});

test.after(() => servidor.close());

// ---- junção de lead repetido ----
const { acharRepetido } = await import('../src/meta-leads.js');
const agora = () => new Date().toISOString();
const diasAtras = (d) => new Date(Date.now() - d * 864e5).toISOString();

test('mesmo telefone em formatos diferentes é a mesma pessoa', () => {
  const lista = [{ id: 'l1', nome: 'Ana', telefone: '+55 (11) 98765-4321', entrada: agora() }];
  assert.equal(acharRepetido(lista, '11987654321', '')?.id, 'l1');
  assert.equal(acharRepetido(lista, '987654321', '')?.id, 'l1');
  assert.equal(acharRepetido(lista, '+1 407 555 0123', ''), null); // outro número: não junta
});

test('mesmo e-mail, com maiúscula e espaço, é a mesma pessoa', () => {
  const lista = [{ id: 'l2', nome: 'Bia', email: 'bia@teste.com', entrada: agora() }];
  assert.equal(acharRepetido(lista, '', '  BIA@Teste.com ')?.id, 'l2');
});

test('lead antigo demais não é repetição, é oportunidade nova', () => {
  const lista = [{ id: 'l3', telefone: '11987654321', entrada: diasAtras(200) }];
  assert.equal(acharRepetido(lista, '11987654321', ''), null);
});

test('sem telefone e sem e-mail não junta com ninguém', () => {
  const lista = [{ id: 'l4', telefone: '11987654321', entrada: agora() }];
  assert.equal(acharRepetido(lista, '', ''), null);
});

test('telefone curto demais não serve de chave', () => {
  const lista = [{ id: 'l5', telefone: '4321', entrada: agora() }];
  assert.equal(acharRepetido(lista, '4321', ''), null);
});
