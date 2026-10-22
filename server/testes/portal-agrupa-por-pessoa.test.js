// "Documentos dependentes estranho assim."
//
// O portal listava tudo em fila única. Com dependentes, o cliente via
// "Passaporte" três vezes seguidas e não sabia de quem era cada um — o nome da
// pessoa estava no dado (`grupo`) e a tela não usava.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tela = readFileSync(new URL('../../docs/portal-cliente.html', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');

function agrupar() {
  const i = tela.indexOf('function agruparPorPessoa(lista){');
  const fim = tela.indexOf('\n}', i) + 2;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(tela.slice(i, fim) + '\nglobalThis.f = agruparPorPessoa;', ctx);
  return ctx.f;
}

test('o servidor manda de quem é cada documento', () => {
  assert.match(portal, /grupo: d\.grupo \|\| '',/,
    'o portal precisa saber a que pessoa o documento pertence');
});

test('só do titular: nenhum título em cima', () => {
  // Carimbar "Seus documentos (titular)" em quem não tem dependente é ruído.
  const r = Array.from(agrupar()([{ nome: 'Passaporte', grupo: '' }, { nome: 'RG', grupo: '' }]));
  assert.equal(r.length, 1);
  assert.equal(r[0].grupo, '');
  assert.deepEqual(Array.from(r[0].itens).map(d => d.nome), ['Passaporte', 'RG']);
});

test('com dependentes, cada bloco diz de quem é', () => {
  const r = Array.from(agrupar()([
    { nome: 'Passaporte', grupo: '' },
    { nome: 'Passaporte', grupo: 'Dependente 1' },
    { nome: 'Certidão', grupo: 'Dependente 1' },
    { nome: 'Passaporte', grupo: 'Dependente 2' },
  ]));
  assert.deepEqual(r.map(g => g.grupo), ['Seus documentos (titular)', 'Dependente 1', 'Dependente 2']);
  assert.deepEqual(Array.from(r[1].itens).map(d => d.nome), ['Passaporte', 'Certidão']);
});

test('a ordem do checklist é respeitada', () => {
  // Os do titular primeiro porque é assim que o checklist é montado — ordenar
  // por conta própria embaralharia o que a documentação organizou.
  const r = Array.from(agrupar()([
    { nome: 'A', grupo: 'Dependente 1' },
    { nome: 'B', grupo: '' },
    { nome: 'C', grupo: 'Dependente 1' },
  ]));
  assert.deepEqual(r.map(g => g.grupo), ['Dependente 1', 'Seus documentos (titular)']);
  assert.deepEqual(Array.from(r[0].itens).map(d => d.nome), ['A', 'C'], 'itens do mesmo grupo ficam juntos');
});

test('a tela usa o agrupamento', () => {
  assert.match(tela, /agruparPorPessoa\(p\.checklist\)\.map\(\(\{grupo, itens\}\)=>`/,
    'a lista precisa ser desenhada a partir dos grupos');
  assert.match(tela, /\$\{grupo \? `<div[^`]*>\$\{esc\(grupo\)\}<\/div>` : ''\}/,
    'o título do grupo só aparece quando existe');
});
