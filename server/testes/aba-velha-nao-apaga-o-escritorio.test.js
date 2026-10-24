// 24/10/2026, duas vezes no mesmo dia: o bloco de Documentação foi de 260
// fichas com 3.509 anexos para 201 fichas com ZERO anexo. A auditoria apontou
// uma sessão de gente, não a automação.
//
// A causa não era a pessoa. Quando uma aba grava, ela manda a versão que leu,
// e o servidor usa essa versão como base para mesclar. Se a aba está aberta há
// muito tempo, essa versão já saiu do histórico (ficam as 30 últimas) — e aí o
// código caía em:
//
//     mesclar(atual, atual, meu)   // "base antiga demais: meus itens vencem"
//
// Com a base igual ao atual, TUDO que a aba velha tem conta como alteração
// dela e sobrescreve o servidor; tudo que ela não tem conta como apagado por
// ela. Uma aba parada desde a manhã apagou o trabalho do escritório inteiro.
//
// A trava de redução em massa não pegou: 59 de 260 é 22,7%, abaixo dos 30% —
// e ela conta registros, não enxerga que os 201 que sobraram ficaram ocos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../src/armazenamento.js', import.meta.url), 'utf8');
function recortar(assinatura){
  const ini = fonte.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < fonte.length; i++) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return fonte.slice(ini, fim).replace('export function', 'function');
}
const ctx = {};
vm.createContext(ctx);
new vm.Script(recortar('export function comoGravar') + '\nvar fn = comoGravar;').runInContext(ctx);
const comoGravar = ctx.fn;

test('aba em dia: grava direto', () => {
  assert.equal(comoGravar(231, 231, true), 'substituir');
});

test('outra pessoa salvou no meio, mas a base ainda existe: mescla', () => {
  assert.equal(comoGravar(229, 231, true), 'mesclar');
});

test('base já saiu do histórico: RECUSA — era aqui que o estrago acontecia', () => {
  assert.equal(comoGravar(180, 231, false), 'recusar',
    'mesclar sem base deixa a aba velha vencer e apagar o que o escritório fez');
});

test('sem base declarada continua substituindo (é o caminho das restaurações)', () => {
  assert.equal(comoGravar(null, 231, false), 'substituir');
  assert.equal(comoGravar(undefined, 231, false), 'substituir');
});

test('versão como texto conta igual a número', () => {
  // o corpo do pedido chega em JSON e já veio string em algumas telas
  assert.equal(comoGravar('231', 231, true), 'substituir');
});

test('o caminho de recusa está mesmo ligado dentro de gravar()', () => {
  // a função pura pode continuar certa enquanto alguém volta o ponto de
  // chamada para a mescla de duas vias. Este é o teste que guarda a chamada.
  const corpo = fonte.slice(fonte.indexOf('export async function gravar('));
  assert.doesNotMatch(corpo, /mesclar\(atual\.valor, atual\.valor, valor\)/,
    'a mescla de duas vias com "meus itens vencem" não pode voltar: foi ela que apagou os 3.509 anexos');
  assert.match(corpo, /comoGravar\(/, 'gravar() precisa decidir por comoGravar()');
  assert.match(corpo, /base-antiga/, 'a recusa precisa chegar à tela com um código que a rota reconheça');
});

test('a rota devolve 409 e registra, em vez de estourar 500', () => {
  // só o corpo DESTA rota: pegar o arquivo inteiro encontrava o 409 de outra
  const ini = fonte.indexOf("rotasArmazenamento.put('/storage/:chave'");
  const rota = fonte.slice(ini, fonte.indexOf('\n});', ini));
  const trecho = rota.slice(rota.indexOf("codigo === 'base-antiga'"));
  assert.match(rota, /codigo === 'base-antiga'/);
  assert.match(trecho, /status\(409\)/, 'a aba precisa receber 409, não um 500 genérico');
  assert.match(trecho, /anotar\('base-antiga'/, 'o caso precisa ficar registrado para a gente ver se repete');
});
