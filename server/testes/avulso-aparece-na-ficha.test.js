// O que o cliente pagou aparece na ficha dele — mesmo sem contrato.
//
// Achado em 30/10/2026, puxando o fio das parcelas soltas: a ficha do cliente
// somava SÓ o que pertencia a um contrato. Quem comprou um serviço avulso —
// uma tradução, uma taxa, um reconhecimento de firma — não tem contrato, e o
// dinheiro dele sumia da própria ficha.
//
// Eram 8 pessoas e US$ 3.038,51 invisíveis. A Simone Gomes dos Santos tinha
// pago US$ 1.500 e a ficha dela aparecia vazia.
//
// Agora a ficha soma por contrato OU por cliente. O `||` não duplica, e este
// teste prova isso: é o erro fácil de cometer aqui, e dobraria o valor pago de
// todo mundo que tem os dois campos preenchidos — que é a maioria.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const tela = readFileSync(new URL('../../docs/clientes.html', import.meta.url), 'utf8');

// tira a função da tela por contagem de chaves, para testar a de verdade e
// não uma reescrita dela
function extrair(nome) {
  const ini = tela.indexOf('function ' + nome + '(');
  assert.ok(ini >= 0, 'não achei a função ' + nome);
  let i = tela.indexOf('{', ini), nivel = 0, j = i;
  for (; j < tela.length; j++) {
    if (tela[j] === '{') nivel++;
    else if (tela[j] === '}') { nivel--; if (!nivel) break; }
  }
  return tela.slice(ini, j + 1);
}

const CLIENTE = { id: 'cl1', contratoIds: ['ct1', 'ct2'] };
const OUTRO = { id: 'cl2', contratoIds: ['ct9'] };
const PARCELAS = [
  { id: 'p1', contratoId: 'ct1', clienteId: null, valor: 100 },   // do contrato
  { id: 'p2', contratoId: 'ct2', clienteId: 'cl1', valor: 200 },  // dos DOIS jeitos
  { id: 'p3', contratoId: null, clienteId: 'cl1', valor: 1500 },  // avulsa: só o cliente
  { id: 'p4', contratoId: 'ct9', clienteId: 'cl2', valor: 50 },   // de outra pessoa
  { id: 'p5', contratoId: null, clienteId: null, valor: 7 },      // solta de todo mundo
];

function rodar(cliente, parcelas = PARCELAS) {
  const ctx = createContext({ contasReceber: parcelas });
  runInContext(extrair('contasReceberDoCliente'), ctx);
  return ctx.contasReceberDoCliente(cliente);
}

test('o avulso do cliente aparece na ficha, mesmo sem contrato', () => {
  const ids = rodar(CLIENTE).map((x) => x.id).join(',');
  assert.ok(ids.includes('p3'),
    'parcela ligada só ao CLIENTE sumiu da ficha — foi este o defeito: '
    + 'quem comprou serviço avulso tinha a ficha vazia');
  assert.ok(ids.includes('p1'), 'parcela do contrato tem que continuar aparecendo');
});

test('não duplica quem tem contrato E cliente', () => {
  const todos = rodar(CLIENTE).map((x) => x.id);
  const p2 = todos.filter((x) => x === 'p2').length;
  assert.equal(p2, 1,
    `a parcela com os dois campos apareceu ${p2} vezes — duplicar aqui dobraria o valor pago `
    + 'de quase todo mundo, porque a maioria tem contrato e cliente preenchidos');
  assert.equal(todos.length, new Set(todos).size, 'alguma parcela veio repetida');
});

test('a ficha de um não mostra o dinheiro do outro', () => {
  const ids = rodar(CLIENTE).map((x) => x.id).join(',');
  assert.ok(!ids.includes('p4'), 'apareceu parcela de OUTRO cliente — isso é vazamento de dado');
  assert.ok(!ids.includes('p5'), 'parcela sem dono nenhum não pode entrar na ficha de ninguém');
  const doOutro = rodar(OUTRO).map((x) => x.id).join(',');
  assert.equal(doOutro, 'p4', 'a ficha do outro cliente mostra só o que é dele');
});

test('cliente sem contrato nenhum ainda vê o que pagou', () => {
  // É o caso da Simone: cadastro existe, contratoIds vazio, US$ 1.500 pagos.
  const simone = { id: 'cl1', contratoIds: [] };
  const ids = rodar(simone).map((x) => x.id).join(',');
  assert.ok(ids.includes('p3'), 'cliente sem contrato continuou com a ficha vazia');
});
