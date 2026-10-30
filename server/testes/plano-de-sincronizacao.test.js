// O plano de uma sincronização: o que entraria, antes de qualquer escrita.
//
// §8 e §9 da lista dela. A regra que atravessa tudo é a idempotência por
// identificador EXTERNO: rodar duas vezes tem que dar o mesmo resultado que
// rodar uma. Sem isso ninguém sincroniza sem medo, porque ninguém lembra se já
// rodou hoje — e o estrago é pagamento duplicado.
//
// Os casos aqui são os quatro pedidos REAIS levantados no Bling em 26/10/2026,
// incluindo o 255, que não fecha por 350 dentro do próprio Bling.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planoDoTrello, fotoDosCards, compararFotos } from '../src/sincronizacao.js';

// O BLING SAIU em 30/10/2026 ("não vamos mais usar"), e com ele os testes de
// `planoDoBling` e `divergenciasDoBling` — as funções não existem mais.
// O que ficou aqui é o Trello.
// --------------------------------------------------------------- Trello
const CARDS = [
  { idCard:'c1', titulo:'VISTO T — Fulano', quadro:'LWG VISA T', cliente:'Fulano',
    anexos:[{id:'a1',nome:'passaporte.pdf',url:'/x/1',bytes:100},
            {id:'a2',nome:'i94.pdf',url:'/x/2',bytes:200}] },
];

test('só entra anexo que a ficha ainda não tem', () => {
  const p = planoDoTrello({ cards:CARDS,
    processos:[{ id:'f1', clienteNome:'Fulano', servico:'Visto T', anexos:[{ idTrello:'a1' }] }] });
  assert.equal(p.resumo.anexosNovos, 1);
  assert.equal(p.resumo.jaTinham, 1);
  assert.equal(p.porFicha[0].novos[0].id, 'a2');
});

test('rodar de novo não traz nada', () => {
  const p = planoDoTrello({ cards:CARDS,
    processos:[{ id:'f1', clienteNome:'Fulano', anexos:[{ idTrello:'a1' },{ idTrello:'a2' }] }] });
  assert.equal(p.resumo.anexosNovos, 0);
  assert.equal(p.porFicha.length, 0);
});

test('nome repetido NÃO é adivinhado — vai para revisão', () => {
  // Anexo no cliente errado é pior do que anexo que falta: espalha documento
  // de uma pessoa na pasta de outra, e ninguém descobre.
  const p = planoDoTrello({ cards:CARDS, processos:[
    { id:'f1', clienteNome:'Fulano' }, { id:'f2', clienteNome:'Fulano' }] });
  assert.equal(p.resumo.anexosNovos, 0);
  assert.equal(p.resumo.paraRevisao, 1);
  assert.match(p.semFicha[0].porque, /2 fichas/);
});

test('card sem ficha nenhuma também vai para revisão', () => {
  const p = planoDoTrello({ cards:CARDS, processos:[] });
  assert.equal(p.resumo.paraRevisao, 1);
  assert.equal(p.resumo.anexosParaRevisao, 2);
  assert.match(p.semFicha[0].porque, /nenhuma ficha/);
});

test('ficha cancelada não recebe anexo', () => {
  const p = planoDoTrello({ cards:CARDS,
    processos:[{ id:'f1', clienteNome:'Fulano', situacao:'cancelado' }] });
  assert.equal(p.resumo.anexosNovos, 0);
  assert.equal(p.resumo.paraRevisao, 1);
});

test('anexo sem id ou sem url não entra', () => {
  // Sem id não dá para reconhecer na próxima rodada: viraria duplicata.
  const p = planoDoTrello({ cards:[{ idCard:'c', cliente:'Fulano',
    anexos:[{nome:'x',url:'/u'},{id:'b',nome:'y'},{id:'c',nome:'z',url:'/z'}] }],
    processos:[{ id:'f1', clienteNome:'Fulano' }] });
  assert.equal(p.resumo.anexosNovos, 1);
  assert.equal(p.porFicha[0].novos[0].id, 'c');
});

// ------------------------------------------------- a posição dos cards
test('a foto pega o que não pode mudar', () => {
  const foto = fotoDosCards([{ id:'a', status:'Protocolado', situacao:'ativo', ordem:3, responsavel:'Vitória' }]);
  assert.equal(foto.a, 'Protocolado|ativo|3|Vitória');
});

test('mexer em etapa, posição ou responsável é pego', () => {
  // A REGRA CRÍTICA dela: sincronizar anexo não pode mover card.
  const antes = fotoDosCards([{ id:'a', status:'Protocolado', ordem:1 }]);
  for (const depois of [
    [{ id:'a', status:'I-797', ordem:1 }],
    [{ id:'a', status:'Protocolado', ordem:2 }],
    [{ id:'a', status:'Protocolado', ordem:1, responsavel:'outro' }],
    [{ id:'a', status:'Protocolado', ordem:1, situacao:'cancelado' }],
  ]) {
    assert.equal(compararFotos(antes, fotoDosCards(depois)).length, 1, JSON.stringify(depois));
  }
});

test('card que some ou aparece também é pego', () => {
  const antes = fotoDosCards([{ id:'a', status:'X' }]);
  assert.deepEqual(compararFotos(antes, {}), [{ id:'a', o:'sumiu' }]);
  assert.deepEqual(compararFotos({}, antes), [{ id:'a', o:'apareceu' }]);
});

test('mudar só os anexos NÃO conta como movimento', () => {
  // É exatamente o que a sincronização faz, e tem que passar limpo.
  const antes = fotoDosCards([{ id:'a', status:'Protocolado', ordem:1, anexos:[] }]);
  const depois = fotoDosCards([{ id:'a', status:'Protocolado', ordem:1, anexos:[{id:1},{id:2}] }]);
  assert.deepEqual(compararFotos(antes, depois), []);
});
