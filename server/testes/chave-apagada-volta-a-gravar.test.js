// Achado na bateria dos 30 fluxos: a tela do Financeiro abria em branco e
// mostrava "Contratos assinados no mês: 0" — número falso, com cara de dado.
//
// A causa não era a tela. A chave legalway-contas-bancarias-v1 não existia
// mais em `armazenamento`, mas o histórico dela ainda tinha a versão 1. Ao
// tentar criá-la, gravar() calculava "primeira gravação = versão 1", inseria no
// histórico e batia na chave primária (chave, versao). HTTP 500. Toda vez.
// Para sempre — uma chave que sumiu de `armazenamento` mas deixou histórico
// ficava impossível de gravar.
//
// Isso acontece exatamente depois de recuperação, limpeza ou importação, que é
// o que mais fizemos nos últimos dias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Importar armazenamento.js de verdade puxaria a conexão com o banco. A função
// real é recortada do arquivo pelo nome: se sumir ou mudar de nome, o recorte
// falha e o teste acusa.
const fonte = readFileSync(new URL('../src/armazenamento.js', import.meta.url), 'utf8');
const ini = fonte.indexOf('export function versaoDepoisDoHistorico');
assert.ok(ini > 0, 'não achei versaoDepoisDoHistorico em armazenamento.js');
let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
for (; i < fonte.length; i++) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
const ctx = {};
vm.createContext(ctx);
new vm.Script(fonte.slice(ini, fim).replace('export function', 'function')
  + '\nvar fn = versaoDepoisDoHistorico;').runInContext(ctx);
const versaoDepoisDoHistorico = ctx.fn;

test('histórico com versão 1 órfã: a nova gravação vai para a 2', () => {
  assert.equal(versaoDepoisDoHistorico(1), 2);
});

test('chave de verdade nova, sem histórico nenhum, começa na 1', () => {
  assert.equal(versaoDepoisDoHistorico(null), 1);
  assert.equal(versaoDepoisDoHistorico(undefined), 1);
});

test('histórico longo: entra depois da maior versão, nunca no meio', () => {
  assert.equal(versaoDepoisDoHistorico(228), 229);
});

test('o que o banco devolve como texto também conta', () => {
  // max() em coluna inteira volta como string em alguns drivers
  assert.equal(versaoDepoisDoHistorico('30'), 31);
});

test('valor sem sentido não gera versão negativa nem zero', () => {
  assert.equal(versaoDepoisDoHistorico(0), 1);
  assert.equal(versaoDepoisDoHistorico(-5), 1);
  assert.equal(versaoDepoisDoHistorico('abacaxi'), 1);
});

test('gravar() usa o histórico para escolher a versão, não o literal 1', () => {
  // A função pura acima continua certa mesmo se alguém voltar o ponto de
  // chamada para `: 1` — e aí o defeito volta inteiro. Este teste guarda a
  // chamada, que é onde ele morava.
  const corpo = fonte.slice(fonte.indexOf('export async function gravar('));
  const linha = corpo.split('\n').find(l => /const versao = atual \?/.test(l));
  assert.ok(linha, 'não achei a linha que escolhe a versão dentro de gravar()');
  assert.match(linha, /proximaVersaoDoHistorico/,
    'primeira gravação voltando para a versão 1 torna impossível gravar qualquer chave que já teve histórico');
});
