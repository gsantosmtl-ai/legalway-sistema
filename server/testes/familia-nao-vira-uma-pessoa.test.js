// Telefone igual NÃO quer dizer mesma pessoa.
//
// Susto de 30/10/2026. Ela viu "Elisângela de Brito Matos" duas vezes na lista de
// clientes e ia usar Configurações → "Juntar registros duplicados". Antes de
// mandar clicar, medi o que a ferramenta faria com a base real: ela juntaria
// CINCO grupos, e dois não eram duplicados — eram famílias:
//
//   Marcelo Lorenzo Ribalta  +  Bianca Bastos Ribalta      (614) 368-3550
//   Simone Andrade Sampaio   +  Joao Vitor Sampaio de Oliveira   4846877361
//
// Quatro pessoas, dois celulares compartilhados, cada uma com contrato
// próprio. A régua antiga era `telefone || nome`: bastava o telefone bater.
//
// O sistema já sabia disso noutro canto — portal-cliente.js escreve que
// "família que compartilha celular" é caso normal. A limpeza é que não tinha
// recebido o recado.
//
// Agora o NOME manda, e o telefone é desempate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// O módulo importa o banco, então não dá para importá-lo aqui. Tiro as funções
// do próprio arquivo e rodo isoladas — assim o teste confere o código que vai
// para produção, e não uma cópia dele que eu teria escrito à mão.
const fonte = readFileSync(new URL('../src/limpar-duplicados.js', import.meta.url), 'utf8');

// Pega do `de` até fechar as chaves que ele abre. Marcador de texto para o FIM
// é frágil: basta alguém escrever um comentário no meio e o teste passa a
// medir outro pedaço do arquivo.
function bloco(de) {
  const i = fonte.indexOf(de);
  assert.ok(i >= 0, 'não achei no fonte: ' + de);
  let nivel = 0, j = fonte.indexOf('{', i);
  for (; j < fonte.length; j++) {
    if (fonte[j] === '{') nivel++;
    else if (fonte[j] === '}') { nivel--; if (!nivel) break; }
  }
  return fonte.slice(i, j + 1);
}
const linha = (de) => {
  const i = fonte.indexOf(de);
  assert.ok(i >= 0, 'não achei no fonte: ' + de);
  return fonte.slice(i, fonte.indexOf('\n', i));
};

const ctx = createContext({ String, Object, Array, Date, Set, Map, Number });
runInContext([
  linha('const soDigitos ='),
  linha('const semAcento ='),
  bloco('const chaveCliente =') + ';',
  linha('const quando ='),
  bloco('function juntarClientes('),
  // `const` no vm não vira propriedade do contexto; só `function` vira.
  'globalThis.chaveCliente = chaveCliente;',
].join('\n'), ctx);
const { juntarClientes, chaveCliente } = ctx;

const nomes = (r) => r.lista.map((c) => c.id).sort().join(',');

test('duas pessoas que dividem o celular continuam duas', () => {
  // o caso real, com os nomes e o telefone que estavam na base
  const base = [
    { id: 'a', nome: 'Marcelo Lorenzo Ribalta', telefone: '(614) 368-3550', criadoEm: '2026-01-01' },
    { id: 'b', nome: 'Bianca Bastos Ribalta', telefone: '(614) 368-3550', criadoEm: '2026-02-01' },
    { id: 'c', nome: 'Simone Andrade Sampaio', telefone: '4846877361', criadoEm: '2026-01-01' },
    { id: 'd', nome: 'Joao Vitor Sampaio de Oliveira', telefone: '4846877361', criadoEm: '2026-02-01' },
  ];
  const r = juntarClientes(base);
  assert.equal(r.removidos.length, 0,
    'juntou gente que só divide o telefone — são quatro pessoas, duas famílias');
  assert.equal(nomes(r), 'a,b,c,d');
});

test('o mesmo nome com o mesmo telefone é duplicado de verdade', () => {
  // Elisângela de Brito Matos, o caso que ela trouxe: dois cadastros, mesmo tudo
  const base = [
    { id: 'v', nome: 'Elisângela Brito Matos', telefone: '(407) 468-9539', criadoEm: '2026-01-01', contratoIds: ['ct1'] },
    { id: 'u', nome: 'Elisângela Brito Matos', telefone: '(407) 468-9539', criadoEm: '2026-02-01', contratoIds: ['ct2'] },
  ];
  const r = juntarClientes(base);
  assert.equal(r.removidos.length, 1, 'não juntou um duplicado óbvio');
  assert.equal(r.lista.length, 1);
  assert.equal(r.lista[0].id, 'v', 'tem de ficar o mais antigo');
  assert.equal([...r.lista[0].contratoIds].sort().join(','), 'ct1,ct2',
    'o que fica herda os contratos do outro — perder contrato aqui seria perder dinheiro');
});

test('telefone escrito de outro jeito ainda é o mesmo telefone', () => {
  // Camila Neiva Souza: "(407) 955-8496" e "(40) 7955-8496" — mesmos dígitos
  const base = [
    { id: '1', nome: 'Camila Neiva Souza', telefone: '(407) 955-8496', criadoEm: '2026-01-01' },
    { id: '2', nome: 'Camila Neiva Souza', telefone: '(40) 7955-8496', criadoEm: '2026-02-01' },
  ];
  assert.equal(juntarClientes(base).removidos.length, 1);
});

test('acento não cria pessoa nova', () => {
  const base = [
    { id: '1', nome: 'Elisangela Brito Matos', telefone: '4074689539', criadoEm: '2026-01-01' },
    { id: '2', nome: 'Elisângela Brito Matos', telefone: '4074689539', criadoEm: '2026-02-01' },
  ];
  assert.equal(juntarClientes(base).removidos.length, 1, 'o acento separou a mesma pessoa em duas');
});

test('registro sem nome não se junta a ninguém', () => {
  assert.equal(chaveCliente({ nome: '', telefone: '4074689539' }), '',
    'sem nome não há chave — senão todo registro sem nome com o mesmo telefone viraria um só');
  const base = [
    { id: '1', nome: '', telefone: '4074689539', criadoEm: '2026-01-01' },
    { id: '2', nome: '', telefone: '4074689539', criadoEm: '2026-02-01' },
  ];
  assert.equal(juntarClientes(base).removidos.length, 0);
});
