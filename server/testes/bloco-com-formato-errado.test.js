// Achado na bateria dos 30 fluxos, logo ao subir o servidor: a comissão do SDR
// morria em "sdrLeads.filter is not a function", rodada após rodada, porque o
// bloco legalway-sdr-v1 tinha virado o TEXTO "[]" em vez da lista vazia —
// codificado duas vezes por um script avulso.
//
// O defeito não é o script: é a automação parar um passo inteiro porque um
// bloco veio torto. Comissão que o SDR ganhou e não recebe é o pior jeito de
// descobrir um problema de formato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');
const ini = fonte.indexOf('async function bloco(');
assert.ok(ini > 0, 'não achei a função bloco em automacoes.js');
let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
for (; i < fonte.length; i++) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }

function comBanco(valorGuardado) {
  const erros = [];
  const ctx = {
    ler: async () => (valorGuardado === undefined ? null : { valor: valorGuardado, versao: 7 }),
    console: { error: m => erros.push(String(m)) },
  };
  vm.createContext(ctx);
  new vm.Script(fonte.slice(ini, fim) + '\nvar chamar = (c, p) => bloco(c, p);').runInContext(ctx);
  return { chamar: ctx.chamar, erros };
}

test('bloco que virou texto não derruba o passo — vira lista vazia', async () => {
  const { chamar, erros } = comBanco('[]');            // o caso real: "[]" como string
  const r = await chamar('legalway-sdr-v1');
  assert.equal(JSON.stringify(r.valor), '[]');
  assert.equal(r.versao, 7, 'a versão continua valendo, senão a gravação seguinte sobrescreveria tudo');
  assert.match(erros.join(' '), /legalway-sdr-v1/);
  assert.match(erros.join(' '), /não é uma lista/);
});

test('objeto onde se esperava lista também é contido', async () => {
  const { chamar } = comBanco({ qualquer: 'coisa' });
  assert.equal(JSON.stringify((await chamar('legalway-contratos-v1')).valor), '[]');
});

test('lista de verdade passa intacta e sem reclamar', async () => {
  const { chamar, erros } = comBanco([{ id: 'a' }, { id: 'b' }]);
  const r = await chamar('legalway-contratos-v1');
  assert.equal(JSON.stringify(r.valor), '[{"id":"a"},{"id":"b"}]');
  assert.deepEqual(erros, []);
});

test('chave que não existe devolve o padrão, sem reclamar', async () => {
  const { chamar, erros } = comBanco(undefined);
  const r = await chamar('legalway-nova-v1');
  assert.equal(JSON.stringify(r.valor), '[]');
  assert.equal(r.versao, null, 'versão nula é o que diz à gravação que a chave é nova');
  assert.deepEqual(erros, []);
});

test('quando o padrão NÃO é lista, o objeto guardado passa', async () => {
  // há blocos que são objeto de propósito (configuração, por exemplo)
  const { chamar, erros } = comBanco({ ligado: true });
  const r = await chamar('legalway-automacoes-config-v1', {});
  assert.equal(JSON.stringify(r.valor), '{"ligado":true}');
  assert.deepEqual(erros, []);
});
