// Filtrar a cobrança pela SITUAÇÃO DO CONTRATO: ativo, pausado, cancelado.
//
// Pedido dela: "quero um filtro para buscar pela situação de contrato — ativo,
// cancelado ou pausado".
//
// É diferente do status da PARCELA (a vencer, atrasada, paga), e os dois se
// combinam. "Atrasadas de contrato pausado" é a pergunta que mostra quem o
// escritório decidiu não cobrar e mesmo assim aparece como devedor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fin = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');
const semComent = (t) => t.replace(/^\s*\/\/.*$/gm, '');
const corpoDe = (de, ate) => {
  const i = fin.indexOf(de);
  assert.ok(i >= 0, 'não achei: ' + de);
  return fin.slice(i, fin.indexOf(ate, i));
};

test('o filtro tem as três situações mais "todos"', () => {
  const bloco = corpoDe('id="f-situacao-contrato"', '</select>');
  for (const v of ['Contrato ativo', 'Pausado', 'Cancelado', 'Todos os contratos']) {
    assert.ok(bloco.includes(v), 'faltou ' + v);
  }
});

test('nasce em ATIVO — é a visão operacional', () => {
  // §5: cancelado e pausado não aparecem no Contas a Receber operacional. O
  // filtro é o caminho para trazê-los de volta quando ela quiser procurar.
  assert.match(fin, /let filtroSituacaoContrato = 'ativo';/);
});

test('a situação vem do CONTRATO, e parcela avulsa conta como ativa', () => {
  // Parcela sem contrato é cobrável por si — não pode sumir por não ter dono.
  const h = semComent(corpoDe('function situacaoDaParcela(c)', '\n}'));
  assert.match(h, /if\(!c \|\| !c\.contratoId\) return 'ativo';/);
  assert.match(h, /statusPorContrato \|\| montarStatusDosContratos\(\)/);
});

test('os cartões seguem o MESMO filtro da lista', () => {
  // Mostrar "A vencer US$ 10.334" num cartão e uma lista que soma outra coisa
  // é o jeito mais rápido de ninguém confiar na tela.
  const h = semComent(corpoDe('function renderReceber()', 'const totalGeral'));
  assert.match(h, /!filtroSituacaoContrato \|\| situacaoDaParcela\(c\) === filtroSituacaoContrato/);
});

test('o filtro se soma aos que já existiam, não os substitui', () => {
  const h = semComent(corpoDe('function listaReceberFiltrada()', '\n}'));
  const iChip = h.indexOf("filtroChip === 'abertas'");
  const iSituacao = h.indexOf('filtroSituacaoContrato');
  const iBusca = h.indexOf('busca.trim()');
  assert.ok(iChip > 0 && iSituacao > iChip && iBusca > iSituacao,
    'chip, situação e busca precisam todos entrar na mesma lista');
});

test('Contas a Pagar não ganha um seletor que não filtra nada', () => {
  // A barra é compartilhada. Lá não existe contrato de cliente, e um filtro
  // que não faz nada é pior do que filtro nenhum.
  assert.match(fin, /function renderChips\(labels, mostrarSituacaoDoContrato\)/);
  assert.match(fin, /mostrarSituacaoDoContrato \? `<select id="f-situacao-contrato"/);
  const chamadas = [...fin.matchAll(/renderChips\(\[[^\]]*\][^)]*\)/g)].map((m) => m[0]);
  const comSituacao = chamadas.filter((c) => /, *true\)/.test(c));
  assert.equal(comSituacao.length, 1, 'só a aba de Contas a Receber mostra o seletor');
});

test('o filtro não grava nada nem reordena', () => {
  const h = semComent(corpoDe('function listaReceberFiltrada()', '\n}'));
  assert.doesNotMatch(h, /save\w*\(/, 'filtrar não grava');
  assert.match(h, /lista\.sort\(\(a,b\)=> a\.vencimento\.localeCompare\(b\.vencimento\)\)/,
    'a ordenação continua sendo por vencimento, como antes');
});
