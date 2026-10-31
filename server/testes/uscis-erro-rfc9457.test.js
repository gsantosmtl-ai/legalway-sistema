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

test('também lê o formato SINGULAR, que é o do sandbox fora do ar', () => {
  // O corpo real, lido do banco em 31/10/2026: `error` no singular, e sem
  // `message` no topo. Era por isso que os 82 processos com recibo guardavam
  // 226 caracteres de JSON picado em vez da frase.
  const resposta = { error: { code: '503',
    message: 'The Case Status API Sandbox is unavailable at this time. Please retry your API call later.' } };
  assert.equal(mensagemDoErro(resposta),
    'The Case Status API Sandbox is unavailable at this time. Please retry your API call later. (503)');
});

test('`error` que não é objeto não quebra nem inventa frase', () => {
  assert.equal(mensagemDoErro({ error: 'algo' }), '');
  assert.equal(mensagemDoErro({ error: null }), '');
});

test('errors no plural ganha do singular', () => {
  assert.equal(mensagemDoErro({ errors: [{ message: 'A' }], error: { message: 'B' } }), 'A');
});

test('corpo que não dá para interpretar vai para a tela em UMA linha', () => {
  // JSON com recuo dentro da célula da tabela da tela inicial sumia com o
  // layout — e são até 82 linhas.
  const ini2 = fonte.indexOf('const umaLinha =');
  assert.ok(ini2 > 0, 'não achei umaLinha no uscis.js');
  const ctx2 = {};
  vm.createContext(ctx2);
  new vm.Script(fonte.slice(ini2, fonte.indexOf('\n', ini2)) + '\nvar g = umaLinha;').runInContext(ctx2);
  const umaLinha = ctx2.g;
  const corpo = '\n                {\n                    "error":{\n                        "code":"503"';
  const r = umaLinha(corpo);
  assert.equal(r.includes('\n'), false, 'deixou a quebra de linha passar');
  assert.ok(!/\s\s/.test(r), 'deixou espaço duplo passar: ' + JSON.stringify(r));
  assert.ok(r.length <= 200);
});

test('o erro HTTP prefere a frase e só cai no corpo cru se não houver', () => {
  assert.match(fonte, /USCIS respondeu HTTP \$\{r\.status\}: \$\{mensagemDoErro\(j\) \|\| umaLinha\(txt\)\}/);
  assert.doesNotMatch(fonte, /\(txt \|\| ''\)\.slice\(0, 200\)/,
    'o corte cru sem limpar espaços era o que guardava JSON picado em 82 processos');
});
