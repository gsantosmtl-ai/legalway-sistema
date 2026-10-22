// O USCIS exige, na demo de acesso à produção, que a error.message da resposta deles
// apareça para o usuário. O formato é RFC-9457: a mensagem mora em errors[0].message,
// não num campo "message" solto. Ler o campo errado faz a tela mostrar JSON cru — e é
// um dos itens que eles pontuam como Pass/Fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Extraído do texto do módulo: importar uscis.js acorda a conexão com o banco.
const fonte = readFileSync(new URL('../src/uscis.js', import.meta.url), 'utf8');
const ini = fonte.indexOf('export function mensagemDoErro(j) {');
assert.ok(ini > 0, 'não achei mensagemDoErro no uscis.js');
const fim = fonte.indexOf('\n}', ini) + 2;
const ctx = {};
vm.createContext(ctx);
new vm.Script(fonte.slice(ini, fim).replace('export function', 'function') + '\nvar f = mensagemDoErro;').runInContext(ctx);
const mensagemDoErro = ctx.f;

test('lê a mensagem do formato oficial do USCIS', () => {
  const resposta = { errors: [{ code: 'CASE_NOT_FOUND', message: 'Receipt number not found.',
                                category: 'NOT_FOUND', status: '404', traceId: 'abc-123' }] };
  assert.equal(mensagemDoErro(resposta), 'Receipt number not found. (CASE_NOT_FOUND)');
});

test('ainda aceita um "message" solto, se vier', () => {
  assert.equal(mensagemDoErro({ message: 'Service unavailable' }), 'Service unavailable');
});

test('resposta sem erro devolve vazio, não "undefined"', () => {
  assert.equal(mensagemDoErro({}), '');
  assert.equal(mensagemDoErro(null), '');
  assert.equal(mensagemDoErro({ errors: [] }), '');
});

test('mensagem gigante é cortada em vez de inundar a tela', () => {
  const r = mensagemDoErro({ errors: [{ message: 'x'.repeat(900) }] });
  assert.ok(r.length <= 300, 'não cortou: ' + r.length);
});
