// O que a Cleide via no portal, hoje, na aba Pagamentos:
//
//   Parcela · vence 14/02/2026   US$ 249,60   [a vencer]
//   Parcela · vence 14/03/2026   US$ 249,60   [a vencer]
//   Parcela · vence 28/03/2026   US$ 249,60   [a vencer]
//   Parcela · vence 09/05/2026   US$ 153,97   [a vencer]
//
// As quatro estão CANCELADAS no financeiro. A tela pinta de "a vencer" tudo
// que não é "Pago" nem "Atrasado", então cancelada virava cobrança futura —
// US$ 902,77 de dívida que não existe. E entravam no total, inflando o
// "pago US$ X de US$ Y".
//
// São 819 canceladas na base. Segunda é o primeiro dia com cliente entrando
// no portal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const tela = readFileSync(new URL('../../docs/portal-cliente.html', import.meta.url), 'utf8');

// Recorta o trecho que monta visao.pagamentos, contando chaves a partir do
// `if (P.mostrarFinanceiro !== false) {`. Fatia de tamanho fixo já me traiu
// quatro vezes: um comentário cresce e o alvo sai da janela.
function trechoDoFinanceiro() {
  const abre = fonte.indexOf('if (P.mostrarFinanceiro !== false)');
  assert.ok(abre > 0, 'o bloco do financeiro do portal desapareceu');
  const inicio = fonte.indexOf('{', abre);
  let nivel = 0;
  for (let i = inicio; i < fonte.length; i++) {
    if (fonte[i] === '{') nivel++;
    else if (fonte[i] === '}') { nivel--; if (!nivel) return fonte.slice(inicio + 1, i); }
  }
  throw new Error('não fechei as chaves');
}

// Roda o trecho de verdade, com um processo e um financeiro de mentira.
function pagamentosDe(contas, p) {
  const caixa = {
    P: {}, contas, p,
    visao: {},
    pagoPeloCliente: (c) => Number(c.valorRecebido != null ? c.valorRecebido : (c.status === 'Pago' ? c.valor : 0)) || 0,
    Number, String,
  };
  vm.createContext(caixa);
  vm.runInContext(trechoDoFinanceiro(), caixa);
  return caixa.visao.pagamentos;
}

const CLEIDE = { clienteNome: 'Cleide', contratoId: 'c1' };
const CONTAS = [
  { contratoId: 'c1', clienteNome: 'Cleide', vencimento: '2026-01-17', valor: 250, status: 'Pago', valorRecebido: 250, descricao: 'Parcela 1/9' },
  { contratoId: 'c1', clienteNome: 'Cleide', vencimento: '2026-02-14', valor: 249.6, status: 'Cancelado', descricao: '' },
  { contratoId: 'c1', clienteNome: 'Cleide', vencimento: '2026-03-14', valor: 249.6, status: 'Cancelado', descricao: '' },
  { contratoId: 'c1', clienteNome: 'Cleide', vencimento: '2026-11-16', valor: 303.09, status: 'A vencer', descricao: 'Parcela' },
];

test('parcela cancelada não aparece para o cliente', () => {
  const r = pagamentosDe(CONTAS, CLEIDE);
  assert.equal(r.parcelas.length, 2, 'as duas canceladas tinham que sair da lista');
  assert.equal(r.parcelas.some(x => x.status === 'Cancelado'), false);
});

test('parcela cancelada não entra no total', () => {
  const r = pagamentosDe(CONTAS, CLEIDE);
  assert.equal(r.total.toFixed(2), '553.09', 'total com as canceladas daria 1.052,29 — dívida que não existe');
  assert.equal(r.pago, 250);
});

test('descrição vazia vira "Parcela", não um ponto solto', () => {
  // A tela escreve `${descricao} · vence ...`. Com descrição vazia a linha
  // começava por "· vence". São 841 lançamentos sem descrição.
  const r = pagamentosDe([{ contratoId: 'c1', vencimento: '2026-05-01', valor: 10, status: 'A vencer', descricao: '   ' }], CLEIDE);
  assert.equal(r.parcelas[0].descricao, 'Parcela');
});

test('as parcelas saem em ordem de vencimento', () => {
  const r = pagamentosDe(CONTAS, CLEIDE);
  assert.equal(r.parcelas.map(x => x.vencimento).join('|'), '2026-01-17|2026-11-16');
});

test('sem contratoId o casamento é pelo nome — e cancelada sai também', () => {
  const semContrato = { clienteNome: 'Cleide', contratoId: null };
  const r = pagamentosDe(CONTAS, semContrato);
  assert.equal(r.parcelas.length, 2);
});

test('a tela dá nome próprio à parcela pausada', () => {
  // São 13 pausadas. Chamar de "a vencer" dá ao cliente uma data que o
  // escritório não vai cobrar.
  assert.match(tela, /c\.status === 'Pausado' \? '<span class="pill cinza">pausada<\/span>'/);
});
