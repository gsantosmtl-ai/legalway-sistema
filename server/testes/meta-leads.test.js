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
  assert.equal(j.tokenPagina, false); // não configuramos
  assert.equal(j.formularioPronto, false);
  assert.ok(!JSON.stringify(j).includes('segredo-do-app'));
});

test.after(() => servidor.close());

// ---- junção de lead repetido ----
const { acharRepetido } = await import('../src/leads-entrada.js');
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

// ---- reconhecimento dos campos do formulário ----
const { extrairCampos } = await import('../src/meta-leads.js');
const campo = (n, v) => ({ name: n, values: [v] });

test('campos padrão da Meta em inglês', () => {
  const c = extrairCampos([campo('full_name','Ana Silva'), campo('email','ana@x.com'), campo('phone_number','+5511999998888')]);
  assert.equal(c.nome, 'Ana Silva');
  assert.equal(c.email, 'ana@x.com');
  assert.equal(c.telefone, '+5511999998888');
});

test('campos em português e espanhol', () => {
  const c = extrairCampos([campo('nome_completo','João'), campo('correo','joao@x.com'), campo('celular','11988887777'), campo('tipo_de_visto','EB-2 NIW')]);
  assert.equal(c.nome, 'João');
  assert.equal(c.email, 'joao@x.com');
  assert.equal(c.telefone, '11988887777');
  assert.equal(c.servico, 'EB-2 NIW');
});

test('pergunta personalizada vira observação, não se perde', () => {
  const c = extrairCampos([campo('full_name','Ana'), campo('ja_tem_diploma','Sim, mestrado'), campo('quando_pretende_aplicar','Em 3 meses')]);
  assert.equal(c.extras.length, 2);
  assert.ok(c.extras.join(' ').includes('mestrado'));
  assert.ok(c.extras.join(' ').includes('3 meses'));
});

test('campo vazio não entra', () => {
  const c = extrairCampos([campo('full_name','Ana'), campo('email','   '), { name:'x', values: [] }]);
  assert.equal(c.email, '');
  assert.equal(c.extras.length, 0);
});

// ---- chegada de mensagem de WhatsApp pelo mesmo webhook ----
const corpoWhats = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ id: '123', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: '14075550123', phone_number_id: '999' },
    contacts: [{ profile: { name: 'Carlos' }, wa_id: '5511977776666' }],
    messages: [{ from: '5511977776666', id: 'wamid.ABC', timestamp: '1760000000', type: 'text', text: { body: 'Oi, quero saber do EB-2' } }],
  } }] }],
});

test('mensagem de WhatsApp assinada é aceita pelo mesmo endereço', async () => {
  const r = await fetch(base, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': assinar(corpoWhats) }, body: corpoWhats });
  assert.equal(r.status, 200);
});

test('aviso de entrega/leitura não vira lead', async () => {
  const statuses = JSON.stringify({ object:'whatsapp_business_account', entry:[{ id:'123', changes:[{ field:'messages',
    value:{ messaging_product:'whatsapp', metadata:{}, statuses:[{ id:'wamid.X', status:'delivered' }] } }] }] });
  const r = await fetch(base, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': assinar(statuses) }, body: statuses });
  assert.equal(r.status, 200);   // aceito e ignorado, sem erro
});

// ---- janela de 24 h do WhatsApp ----
const { dentroDaJanela } = await import('../src/whatsapp.js');
const horasAtras = (n) => new Date(Date.now() - n * 3600e3).toISOString();

test('quem mandou mensagem há 1 hora: pode receber texto livre', () => {
  assert.equal(dentroDaJanela({ whatsappUltimaEntrada: horasAtras(1) }), true);
});

test('quem mandou há 23 horas: ainda dá', () => {
  assert.equal(dentroDaJanela({ whatsappUltimaEntrada: horasAtras(23) }), true);
});

test('quem mandou há 25 horas: janela fechada, só modelo aprovado', () => {
  assert.equal(dentroDaJanela({ whatsappUltimaEntrada: horasAtras(25) }), false);
});

test('lead que só preencheu formulário nunca abriu janela', () => {
  assert.equal(dentroDaJanela({ nome: 'Ana', telefone: '11999998888' }), false);
});
