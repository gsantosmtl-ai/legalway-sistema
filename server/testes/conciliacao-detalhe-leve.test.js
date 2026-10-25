// A rota de detalhe existe para a tela NÃO precisar baixar os blocos inteiros.
// O bloco de fichas tem milhares de anexos, muitos deles arquivos embutidos;
// puxá-lo pelo navegador é a leitura pesada que já derrubou o servidor — e foi
// o que eu mesmo fiz, sem pensar, durante a auditoria mês a mês.
//
// Este teste guarda a única coisa que torna a rota leve: ela monta objetos
// campo a campo, nunca espalha o registro inteiro. Um `...p` descuidado aqui
// devolveria todos os anexos em base64 na resposta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/conciliacao-rotas.js', import.meta.url), 'utf8');
const ini = fonte.indexOf("rotasConciliacao.get('/conciliacao/contrato/:id'");
const rota = fonte.slice(ini, fonte.indexOf('\n});', ini));

test('a rota de detalhe existe', () => {
  assert.ok(ini > 0, 'sem ela, a tela volta a baixar os blocos inteiros');
});

test('nenhum registro é devolvido inteiro', () => {
  assert.doesNotMatch(rota, /\.\.\.(p|c|x)\b/,
    'espalhar o registro devolve os anexos embutidos junto — é a leitura pesada de volta');
});

test('de anexo só sai a contagem', () => {
  assert.match(rota, /anexos:\s*\(p\.anexos \|\| \[\]\)\.length/,
    'a resposta precisa levar quantos anexos existem, nunca os anexos');
  assert.doesNotMatch(rota, /anexos:\s*p\.anexos\b/);
});

test('o diagnóstico vem do mesmo motor do painel', () => {
  // se a tela de detalhe calculasse por conta própria, ela poderia discordar
  // do painel, e aí ninguém sabe em qual acreditar
  assert.match(rota, /conciliar\(\{/);
});

test('exige login', () => {
  assert.match(rota, /exigirLogin/);
});

test('os blocos são lidos de um cache curto, não a cada chamada', () => {
  // sem isto, abrir o painel e três contratos vira cinco leituras completas do
  // bloco de fichas — e foi o que começou a dar tempo esgotado na auditoria
  assert.match(fonte, /const BLOCOS_MS/);
  assert.match(fonte, /blocos\.set\(chave/);
  assert.match(fonte, /blocos\.get\(chave\)/);
});

test('corrigir limpa o cache, senão o painel segue mostrando o que já foi resolvido', () => {
  assert.match(fonte, /function esquecerCache\(\)/);
  const rotaCorrigir = fonte.slice(fonte.indexOf("rotasConciliacao.post('/conciliacao/corrigir'"));
  assert.match(rotaCorrigir, /esquecerCache\(\)/);
});

test('a correção decide sobre leitura direta do banco, não sobre cache', () => {
  const rotaCorrigir = fonte.slice(fonte.indexOf("rotasConciliacao.post('/conciliacao/corrigir'"),
                                   fonte.indexOf("rotasConciliacao.get('/conciliacao/contrato/:id'"));
  assert.match(rotaCorrigir, /await ler\(k\)/,
    'decidir uma escrita a partir de cache é decidir sobre o passado');
  assert.doesNotMatch(rotaCorrigir, /\blista\(/);
});
