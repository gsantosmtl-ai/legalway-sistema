// A tela da conciliação tem que ENTRAR pelo mês.
//
// O motor estar certo não garante isso: dá para ter resumoPorMes perfeito e uma
// tela que continua abrindo a lista inteira ordenada por gravidade. O pedido
// dela foi exatamente o contrário — "preciso conciliação por mês e não por
// inconstância" —, então o que estes testes travam é o caminho da tela, não a
// aritmética.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/conciliacao-fluxo.html', import.meta.url), 'utf8');
const rotas = readFileSync(new URL('../src/conciliacao-rotas.js', import.meta.url), 'utf8');

test('a tela abre pedindo a régua de meses, não o diagnóstico inteiro', () => {
  // O diagnóstico inteiro é a leitura pesada: todos os contratos com todas as
  // verificações. Ele não pode acontecer só para a tela abrir.
  const i = tela.indexOf('async function carregar(');
  const corpo = tela.slice(i, tela.indexOf('\n}', i));
  assert.match(corpo, /LW\.api\('\/conciliacao\/meses'/, 'carregar() tem que pedir a régua');
  assert.ok(!/LW\.api\('\/conciliacao'/.test(corpo),
    'carregar() não pode puxar o diagnóstico inteiro');
});

test('abre sozinha no mês mais antigo com pendência', () => {
  // É onde o trabalho dela parou. Perguntar "qual mês?" numa tela que já sabe
  // a resposta é jogar a decisão de volta para ela sem motivo.
  const i = tela.indexOf('async function carregar(');
  const corpo = tela.slice(i, tela.indexOf('\n}', i));
  assert.match(corpo, /regua\.primeiroComPendencia/);
  assert.match(rotas, /primeiroComPendencia/, 'e a rota tem que devolver esse campo');
});

test('recalcular não joga ela de volta para outro mês', () => {
  const i = tela.indexOf('async function carregar(');
  const corpo = tela.slice(i, tela.indexOf('\n}', i));
  assert.match(corpo, /mesAtual !== null && regua\.meses\.some/,
    'se um mês está aberto, recalcular tem que continuar nele');
});

test('o mês traz só o mês: a rota existe e filtra pela data de assinatura', () => {
  assert.match(rotas, /rotasConciliacao\.get\('\/conciliacao\/mes\/:mes'/);
  const i = rotas.indexOf("'/conciliacao/mes/:mes'");
  const corpo = rotas.slice(i, i + 2600);
  assert.match(corpo, /doMes\(c\.dataAssinatura\)/, 'o fluxo do mês é pela assinatura');
  assert.match(corpo, /AAAA-MM/, 'mês inválido tem que ser recusado com recado claro');
  // Os soltos do mês entram, senão o mês não fecha: parcela órfã vencendo em
  // dezembro é problema de dezembro.
  assert.match(corpo, /parcelasSemContrato: d\.soltos\.parcelasSemContrato\.filter/);
  assert.match(corpo, /vizinhos/, 'precisa dizer qual é o mês anterior e o seguinte');
});

test('as três rotas de leitura dividem um cache só', () => {
  // Abrir a tela dispara a régua e o mês quase juntos. Sem cache compartilhado
  // isso recalcula o diagnóstico duas vezes, e o diagnóstico lê os blocos
  // grandes — foi leitura pesada que já derrubou o container.
  assert.match(rotas, /async function diagnostico\(recalcular = false\)/);
  const chamadas = (rotas.match(/await diagnosticoAgora\(\)/g) || []).length;
  assert.equal(chamadas, 1, 'só o helper do cache pode chamar diagnosticoAgora()');
});

test('a tela mostra o que a régua deixou de fora', () => {
  // A régua para no mês corrente e ignora datas de assinatura ausentes ou no
  // futuro. Nenhum dos três pode sumir calado.
  const i = tela.indexOf('function pintarCabecaDoMes');
  const corpo = tela.slice(i, tela.indexOf('\n}', i));
  assert.match(corpo, /contratosSemDataDeAssinatura/);
  assert.match(corpo, /contratosComDataNoFuturo/);
  assert.match(corpo, /regua\.futuro/);
});

test('o placar do mês separa cobrança de caixa, com rótulo', () => {
  // Somar "o que vencia no mês" com "o que entrou no mês" dá número errado:
  // parcela de março paga em maio entra nas duas contas, em meses diferentes.
  const i = tela.indexOf('function pintarPlacarDoMes');
  const corpo = tela.slice(i, tela.indexOf('\n}\n', i));
  assert.match(corpo, /cobrança que vencia no mês/);
  assert.match(corpo, /entrou na conta no mês/);
  assert.ok(!/cb\.previsto \+ cx\./.test(corpo), 'as duas contas não podem ser somadas');
});

test('a régua de meses rola na horizontal e não quebra no celular', () => {
  // Onze meses e contando: empilhado virava uma parede antes do primeiro
  // número. E a regra de celular vai em html.lw-celular, não em @media —
  // numa tela estourada o innerWidth cresce e a media query para de valer
  // justamente onde ela é necessária.
  assert.match(tela, /\.meses\{[^}]*overflow-x:auto/);
  assert.match(tela, /html\.lw-celular \.meses/);
});
