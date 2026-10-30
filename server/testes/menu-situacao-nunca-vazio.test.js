// O menu "Situação do contrato" tem de oferecer alguma coisa, sempre.
//
// Relato dela: "preciso pausar o contrato da Monica Kramer e não aparece a
// função". O menu abria com a frase "Não há nada para mudar na situação deste
// contrato agora" — e não havia mesmo: pausar exige contrato assinado,
// cancelar já estava feito, e reativar não achava parcela para devolver.
//
// A causa: a regra que diz o que o cancelamento derrubou olhava só a
// OBSERVAÇÃO da parcela ("contrato cancelado"), escrita por quem cancela
// nesta tela. Contrato que chegou já cancelado do Bling não tem essa frase em
// parcela nenhuma. Eram 6 contratos presos assim — Monica Kramer, Zsolt
// Laszlo, Jhonnye Stephonnye, Esdras Gonçalves e Lucas Moisés (dois).
//
// Agora, num contrato cancelado, qualquer parcela cancelada e não recebida
// conta. Fora dele, continua valendo só a marca explícita — senão uma parcela
// que alguém cancelou a dedo, de propósito, voltaria sozinha.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const tela = readFileSync(new URL('../../docs/contratos.html', import.meta.url), 'utf8');

const ctx = createContext({ Number, String });
const i = tela.indexOf('function suspensaPeloCancelamento(');
assert.ok(i > 0, 'não achei a regra suspensaPeloCancelamento');
runInContext(tela.slice(i, tela.indexOf('\n}', i) + 2)
  + '\nglobalThis.f = suspensaPeloCancelamento;', ctx);
const suspensa = ctx.f;

test('parcela cancelada do Bling conta quando o contrato está cancelado', () => {
  // é o caso da Monica: nenhuma parcela dela diz "contrato cancelado"
  const p = { status: 'Cancelado', observacao: 'Ref. ao pedido de venda nº 18', valorRecebido: 0 };
  assert.equal(suspensa(p, true), true,
    'num contrato cancelado, a parcela cancelada e não paga tem de poder voltar — '
    + 'sem isso o menu da Situação abre vazio');
  assert.equal(suspensa(p, false), false,
    'fora de um contrato cancelado, parcela cancelada a dedo NÃO pode voltar sozinha');
});

test('parcela com a marca explícita conta nos dois casos', () => {
  const p = { status: 'Cancelado', observacao: 'Suspensa: contrato cancelado', valorRecebido: 0 };
  assert.equal(suspensa(p, true), true);
  assert.equal(suspensa(p, false), true, 'a marca escrita aqui vale sempre');
});

test('parcela PAGA nunca volta', () => {
  // dinheiro recebido não se desfaz por correção de status
  for (const cancelado of [true, false]) {
    assert.equal(suspensa({ status: 'Cancelado', observacao: '', valorRecebido: 305 }, cancelado), false);
    assert.equal(suspensa({ status: 'Pausado', observacao: '', valorRecebido: 0.01 }, cancelado), false);
  }
});

test('parcela pausada conta sempre', () => {
  assert.equal(suspensa({ status: 'Pausado', valorRecebido: 0 }, false), true);
});

test('a regra mora num lugar só', () => {
  const soltas = (tela.match(/contrato cancelado\/i\.test/g) || []).length;
  assert.equal(soltas, 1,
    `a expressão "contrato cancelado" aparece ${soltas} vezes — ela tem de existir só dentro de `
    + 'suspensaPeloCancelamento, senão um dos três lugares que decidem isso fica para trás de novo');
  for (const trecho of ['const temSuspensa', 'const derrubadas', 'const suspensas']) {
    const j = tela.indexOf(trecho);
    assert.ok(j > 0, 'não achei ' + trecho);
    assert.match(tela.slice(j, j + 220), /suspensaPeloCancelamento\(/,
      `${trecho} decide por conta própria em vez de usar a regra`);
  }
});
