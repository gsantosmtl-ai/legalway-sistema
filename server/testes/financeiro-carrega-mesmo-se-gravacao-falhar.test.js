// A tela do Financeiro abriu em branco na bateria dos 30 fluxos, mostrando
// "Contratos assinados no mês: 0" quando havia 11. Um número falso com cara de
// dado — o pior defeito possível numa tela de dinheiro.
//
// A causa: dois `await save...()` soltos no meio do carregamento, fora de
// qualquer try. Quando um deles levou 500, a função de carregar morreu naquela
// linha e tudo o que vinha depois — contratos, sessão, avisos, menu lateral,
// render — nunca aconteceu.
//
// E gravavam a cada abertura, mesmo sem nada ter mudado: como o histórico
// guarda 30 versões, abrir a tela 30 vezes apagava o histórico útil da chave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tela = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');

function corpoDe(assinatura){
  const ini = tela.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = tela.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < tela.length; i++) { if (tela[i] === '{') nivel++; else if (tela[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return tela.slice(ini, fim);
}

function montar(){
  const chamadas = [];
  const ctx = { console: { error: (...a) => chamadas.push('log:' + a[0]) } };
  vm.createContext(ctx);
  new vm.Script(corpoDe('async function gravarSePrecisa(')
    + '\nvar fn = gravarSePrecisa;').runInContext(ctx);
  return { fn: ctx.fn, chamadas };
}

test('não grava quando nada mudou', async () => {
  const { fn } = montar();
  let gravou = 0;
  await fn(async () => { gravou++; }, '[{"a":1}]', '[{"a":1}]', 'k');
  assert.equal(gravou, 0, 'gravar sem mudança queima uma versão do histórico a cada abertura da tela');
});

test('grava quando mudou', async () => {
  const { fn } = montar();
  let gravou = 0;
  await fn(async () => { gravou++; }, '[]', '[{"nome":"Wise"}]', 'k');
  assert.equal(gravou, 1);
});

test('grava quando a chave ainda não existe no servidor', async () => {
  const { fn } = montar();
  let gravou = 0;
  await fn(async () => { gravou++; }, '', '[{"nome":"Truist"}]', 'k');
  assert.equal(gravou, 1);
});

test('gravação que falha NÃO derruba o carregamento', async () => {
  const { fn, chamadas } = montar();
  await fn(async () => { throw new Error('HTTP 500'); }, '[]', '[{"nome":"Wise"}]', 'legalway-contas-bancarias-v1');
  // chegou aqui = não propagou. Era isto que matava a tela.
  assert.match(chamadas.join(' '), /não consegui gravar legalway-contas-bancarias-v1/);
});

test('o carregamento não tem mais nenhum "await save" solto antes do render', () => {
  // o defeito era estrutural: basta uma dessas voltar para a tela morrer de novo
  const loadAll = corpoDe('async function loadAll(');
  const soltas = loadAll.split('\n')
    .filter(l => /^\s*await\s+save[A-Za-z]*\(\s*\)\s*;?\s*$/.test(l));
  assert.deepEqual(soltas, [], 'gravação solta no meio do carregamento mata tudo que vem depois:\n' + soltas.join('\n'));
});
