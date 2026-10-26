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
import { planoDoBling, planoDoTrello, fotoDosCards, compararFotos } from '../src/sincronizacao.js';

const PEDIDOS = [
  { numero:'256', idPedido:'900000001', cliente:'Fulano Primeiro', email:'fulano@exemplo.com',
    idContato:'800000001', servico:'F1 - Estudante', valor:1300, data:'2026-10-22' },
  { numero:'255', idPedido:'900000002', cliente:'Beltrano Segundo', email:'beltrano@exemplo.com',
    idContato:'800000002', servico:'Visto T + MOTION', valor:6990, data:'2026-10-22' },
];
const CONTAS = [
  { pedido:'256', blingId:'900000101', vencimento:'15/11/2026', valor:325, taxa:0.3, liquido:315.27, pago:0, situacao:'aberto', forma:'Stripe' },
  { pedido:'256', blingId:'900000102', vencimento:'15/12/2026', valor:325, taxa:0.3, liquido:315.27, pago:0, situacao:'aberto', forma:'Stripe' },
  { pedido:'256', blingId:'900000103', vencimento:'15/01/2027', valor:325, taxa:0.3, liquido:315.27, pago:0, situacao:'aberto', forma:'Stripe' },
  { pedido:'256', blingId:'900000104', vencimento:'15/02/2027', valor:325, taxa:0.3, liquido:315.27, pago:0, situacao:'aberto', forma:'Stripe' },
  { pedido:'255', blingId:'900000201', vencimento:'24/10/2026', valor:250, taxa:0.3, liquido:242.45, pago:0, situacao:'aberto', forma:'Stripe' },
  { pedido:'255', blingId:'900000202', vencimento:'22/11/2026', valor:375.88, taxa:0.3, liquido:364.68, pago:0, situacao:'aberto', forma:'Stripe' },
];

test('pedido inédito entra inteiro', () => {
  const p = planoDoBling({ pedidos:PEDIDOS, contas:CONTAS });
  assert.equal(p.resumo.contratos, 2);
  assert.equal(p.resumo.parcelas, 6);
  assert.equal(p.resumo.clientesNovos, 2);
  // 4x325 do 256 mais 250 + 375,88 do 255.
  assert.equal(p.resumo.dinheiro, 1925.88);
});

test('rodar de novo não cria nada — é a garantia inteira', () => {
  // O sistema já tem o pedido 256 e as duas parcelas dele.
  const p = planoDoBling({
    pedidos: PEDIDOS, contas: CONTAS,
    contratos: [{ pedidoBling:'256' }],
    financeiro: [{ blingId:'900000101' }, { blingId:'900000102' }],
  });
  assert.equal(p.resumo.contratos, 1, 'só o 255 sobra');
  assert.ok(p.ignorados.some(i => i.o === 'pedido já no sistema' && i.pedido === '256'));
  assert.ok(!p.parcelas.some(x => x.pedidoBling === '256'), 'nenhuma parcela do 256 volta');
});

test('a parcela é reconhecida pelo id da CONTA, não pelo do pedido', () => {
  // Os dois existem e são diferentes. Confundir foi o que custou uma manhã no
  // importador antigo: o detalhe do pedido traz um id, a conta a receber traz
  // outro, e o sistema guarda o da conta.
  const p = planoDoBling({ pedidos:PEDIDOS, contas:CONTAS,
    financeiro: [{ blingId:'900000001' }] });  // o id do PEDIDO, não o da conta
  assert.equal(p.resumo.parcelas, 6, 'nada pode ser reconhecido pelo id errado');
});

test('pedido novo com parcela que já existe é dito, não escondido', () => {
  // Sinal de importação pela metade. Entra, mas quem olha precisa saber.
  const p = planoDoBling({ pedidos:PEDIDOS, contas:CONTAS,
    financeiro: [{ blingId:'900000101' }] });
  assert.ok(p.ignorados.some(i => i.o === 'parcela já existia' && i.pedido === '256' && i.quantas === 1));
  assert.equal(p.parcelas.filter(x=>x.pedidoBling==='256').length, 3, 'só as inéditas entram');
});

test('o que não fecha aparece com o número, em vez de sumir', () => {
  // O 255: pedido de 6.990 e parcelas somando 625,88 neste recorte. Importar
  // calado um contrato que não bate é criar uma divergência invisível.
  const p = planoDoBling({ pedidos:PEDIDOS, contas:CONTAS });
  const d = p.resumo.naoBatem.find(x => x.pedido === '255');
  assert.ok(d, 'a diferença tem que ser relatada');
  assert.equal(d.contrato, 6990);
  assert.equal(d.parcelas, 625.88);
  assert.equal(d.diferenca, 6364.12);
  assert.ok(!p.resumo.naoBatem.some(x => x.pedido === '256'), 'o que fecha não vira alarme');
});

test('cliente que já existe é LIGADO, não duplicado', () => {
  const p = planoDoBling({ pedidos:PEDIDOS, contas:CONTAS,
    clientes: [{ id:'cl1', nome:'Fulano Primeiro' }] });
  assert.equal(p.resumo.clientesNovos, 1, 'só o segundo é novo');
  assert.ok(p.clientesLigados.some(c => c.id === 'cl1'));
});

test('acento e caixa não criam cliente repetido', () => {
  const p = planoDoBling({ pedidos:[{ numero:'1', cliente:'JOÃO DA SILVA', valor:100 }],
    clientes: [{ id:'x', nome:'joao da silva' }] });
  assert.equal(p.resumo.clientesNovos, 0);
});

test('dois pedidos do mesmo cliente novo criam UM cliente', () => {
  const p = planoDoBling({ pedidos:[
    { numero:'1', cliente:'Fulano', valor:100 }, { numero:'2', cliente:'Fulano', valor:200 }] });
  assert.equal(p.resumo.clientesNovos, 1);
  assert.equal(p.resumo.contratos, 2);
});

test('pedido sem número não entra, e diz por quê', () => {
  const p = planoDoBling({ pedidos:[{ cliente:'Sem Numero', valor:10 }] });
  assert.equal(p.resumo.contratos, 0);
  assert.ok(p.ignorados.some(i => i.o === 'pedido sem número'));
});

test('lixo não derruba o plano', () => {
  assert.doesNotThrow(() => planoDoBling());
  assert.doesNotThrow(() => planoDoBling({ pedidos:null, contas:'texto' }));
  assert.equal(planoDoBling({}).resumo.contratos, 0);
});

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
