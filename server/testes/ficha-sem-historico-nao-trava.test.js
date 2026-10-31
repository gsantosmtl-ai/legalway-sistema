// Ficha sem `historico` não pode travar o quadro.
//
// Relato dela: a ficha do Wellington Prado Matos não saía de "Aguardando
// boas-vindas". Arrastar não fazia nada — nem no card, nem em lugar nenhum.
// Nenhum erro aparecia na tela.
//
// A causa, achada nos dados: 17 fichas ativas vieram do Trello SEM o campo
// `historico`. A tela de Documentação tem 48 lugares que fazem
// `p.historico.push(...)` — mover de etapa, mandar para tradução, mudar
// dependentes, aprovar documento. Em todos eles o push estoura antes de
// qualquer gravação, e a ação morre em silêncio.
//
// A correção garante as listas UMA vez, quando a tela carrega, em vez de
// remendar os 48 pontos. Este teste prova que a garantia está lá e que ela
// vem ANTES de qualquer uso — uma garantia depois do primeiro push não serve
// de nada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
// Sem os comentários: o próprio comentário que explica a correção cita
// `p.historico.push(...)`, e sem isto o teste encontraria a explicação em vez
// do código e falharia dizendo que a garantia está no lugar errado.
const codigo = tela.replace(/^\s*\/\/.*$/gm, '');

test('as listas da ficha são garantidas quando a tela carrega', () => {
  const i = tela.indexOf('processos.forEach(p=>{');
  assert.ok(i > 0, 'não achei o bloco que normaliza as fichas ao carregar');
  const bloco = tela.slice(i, i + 1600);
  for (const campo of ['historico', 'checklist', 'anexos']) {
    assert.ok(new RegExp(`if\\(!Array\\.isArray\\(p\\.${campo}\\)\\) p\\.${campo} = \\[\\];`).test(bloco),
      `a tela não garante que p.${campo} é uma lista — uma ficha sem esse campo trava toda ação que mexe nele`);
  }
});

test('a garantia vem antes do primeiro uso do histórico', () => {
  const garantia = codigo.indexOf('if(!Array.isArray(p.historico)) p.historico = [];');
  const primeiroUso = codigo.indexOf('.historico.push');
  assert.ok(garantia > 0, 'a garantia do histórico sumiu');
  assert.ok(garantia < primeiroUso,
    'a garantia está DEPOIS do primeiro `historico.push` do arquivo — '
    + 'nessa ordem ela não protege nada');
});

// A função que move a ficha é a que ela usou e que falhava. Se um dia alguém
// tirar a garantia de cima, que pelo menos esta não estoure.
test('mover de etapa não confia num campo que pode não existir', () => {
  const i = tela.indexOf('async function moverParaEtapa(');
  assert.ok(i > 0, 'não achei moverParaEtapa');
  const corpo = tela.slice(i, tela.indexOf('\n}', i));
  assert.match(corpo, /\.historico\.push\(/, 'esperava que ela registrasse a movimentação');
  // o push só é seguro porque a carga garante a lista; o teste de cima cobre isso
  assert.ok(codigo.indexOf('if(!Array.isArray(p.historico)) p.historico = [];') < codigo.indexOf('async function moverParaEtapa('),
    'a garantia tem que ser carregada antes de moverParaEtapa existir');
});
