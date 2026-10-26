// Conciliação MÊS A MÊS, que é o método dela: fechar dezembro, ajustar, e
// seguir para janeiro. Entrar pela lista de anomalias não permite dizer
// "terminei dezembro", porque uma lista por gravidade mistura todos os meses.
//
// O que estes testes protegem é a separação das duas contas do mês. Um
// contrato assinado em fevereiro com parcela vencendo em agosto pertence ao
// FLUXO de fevereiro e ao DINHEIRO de agosto. Somar os dois na mesma linha é
// exatamente o que faz um painel mensal não fechar — e painel que não fecha é
// painel em que ninguém confia.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumoPorMes, conciliar } from '../src/conciliacao.js';

// `hoje` é sempre explícito nestes testes. A função aceita o padrão do
// relógio, mas teste que depende do relógio de verdade muda de resposta sozinho
// com o passar dos meses — e aí ninguém sabe se quebrou o código ou o calendário.
const HOJE = '2026-10-25';
const resumo = (linhas, contas, hoje = HOJE) => resumoPorMes(linhas, contas, hoje);
const achar = (r, mes) => r.meses.find((m) => m.mes === mes);

test('o contrato cai no mês da assinatura, a parcela no mês do vencimento', () => {
  const linhas = [
    { id: 'c1', cliente: 'A', valor: 900, etapa: 'Assinado', dataAssinatura: '2026-02-03', situacao: 'ok', problemas: 0 },
  ];
  const contas = [
    { contratoId: 'c1', valor: 300, vencimento: '2026-02-03', status: 'Pago', valorRecebido: 300, dataRecebimento: '2026-02-03' },
    { contratoId: 'c1', valor: 600, vencimento: '2026-08-15', status: 'A vencer', valorRecebido: 0 },
  ];
  const r = resumo(linhas, contas);

  const fev = achar(r, '2026-02');
  assert.equal(fev.contratos.total, 1, 'o contrato é de fevereiro');
  assert.equal(fev.cobranca.previsto, 300, 'em fevereiro só vencia a primeira');

  const ago = achar(r, '2026-08');
  assert.equal(ago.contratos.total, 0, 'agosto não ganha o contrato de fevereiro');
  assert.equal(ago.cobranca.previsto, 600);
  assert.equal(ago.cobranca.emAberto, 600);
});

test('a parcela paga com atraso conta na cobrança de um mês e no caixa de outro', () => {
  // Venceu em março, foi paga em maio. São dois fatos em dois meses, e o
  // painel precisa dizer os dois sem inventar um terceiro.
  const contas = [
    { contratoId: 'c1', valor: 225, vencimento: '2026-03-20', status: 'Pago',
      bruto: 225, taxa: 8.03, liquido: 216.97, valorRecebido: 216.97, dataRecebimento: '2026-05-04' },
  ];
  const r = resumo([], contas);

  const mar = achar(r, '2026-03');
  assert.equal(mar.cobranca.previsto, 225, 'março cobrava 225');
  assert.equal(mar.cobranca.pago, 225, 'e o cliente pagou os 225 — a taxa não é dívida dele');
  assert.equal(mar.cobranca.emAberto, 0);
  assert.equal(mar.caixa.entrouNaConta, 0, 'mas nada entrou em março');

  const mai = achar(r, '2026-05');
  assert.equal(mai.cobranca.previsto, 0, 'maio não cobrava nada');
  assert.equal(mai.caixa.pagoPelosClientes, 225);
  assert.equal(mai.caixa.entrouNaConta, 216.97, 'em maio entraram os 216,97');
  assert.equal(mai.caixa.taxas, 8.03, 'e a taxa fica visível, com nome');
});

test('parcela cancelada não é cobrança, mas o dinheiro que entrou continua entrado', () => {
  const contas = [
    // Cobrança desfeita, nunca paga: sai da previsão de abril.
    { contratoId: 'c1', valor: 300, vencimento: '2026-04-10', status: 'Cancelado', valorRecebido: 0 },
    // Cancelada DEPOIS de ter sido paga: cancelar a cobrança não desfaz o
    // depósito no banco, então o caixa de abril continua com ele.
    { contratoId: 'c1', valor: 300, vencimento: '2026-04-10', status: 'Cancelado',
      bruto: 300, taxa: 9.95, liquido: 290.05, valorRecebido: 290.05, dataRecebimento: '2026-04-12' },
  ];
  const r = resumo([], contas);
  const abr = achar(r, '2026-04');
  assert.equal(abr.cobranca.previsto, 0, 'nenhuma das duas é cobrança viva');
  assert.equal(abr.cobranca.canceladas, 2);
  assert.equal(abr.caixa.entrouNaConta, 290.05, 'o depósito continua no caixa de abril');
});

test('os três baldes do mês são exclusivos e somam o total do mês', () => {
  const linhas = [
    { id: '1', valor: 100, dataAssinatura: '2026-01-05', situacao: 'ok', problemas: 0 },
    { id: '2', valor: 100, dataAssinatura: '2026-01-09', situacao: 'critico', problemas: 3 },
    { id: '3', valor: 100, dataAssinatura: '2026-01-20', situacao: 'divergencia', problemas: 1 },
    { id: '4', valor: 100, dataAssinatura: '2026-01-28', situacao: 'revisao', problemas: 1 },
  ];
  const jan = achar(resumo(linhas, []), '2026-01');
  const { total, conciliados, comDivergencia, aguardandoRevisao } = jan.contratos;
  assert.equal(conciliados + comDivergencia + aguardandoRevisao, total,
    'se os baldes não somam o total, a tela mente');
  assert.equal(conciliados, 1);
  assert.equal(comDivergencia, 2, 'crítico e divergência caem no mesmo balde');
  assert.equal(aguardandoRevisao, 1);
  assert.equal(jan.problemas, 5);
  assert.equal(jan.situacao, 'critico', 'o mês herda a pior situação dos contratos dele');
});

test('contrato sem data de assinatura é contado, não escondido', () => {
  // Esconder um contrato porque falta a data é como o buraco começa: ele
  // simplesmente não aparece em nenhum mês e ninguém nunca o audita.
  const r = resumo([
    { id: '1', valor: 100, dataAssinatura: '2026-01-05', situacao: 'ok', problemas: 0 },
    { id: '2', valor: 100, dataAssinatura: null, situacao: 'critico', problemas: 2 },
    { id: '3', valor: 100, dataAssinatura: 'nao-e-data', situacao: 'critico', problemas: 2 },
  ], []);
  assert.equal(r.contratosSemDataDeAssinatura, 2);
  assert.equal(r.meses.length, 1);
});

test('os meses vêm em ordem, e diz por qual começar', () => {
  const r = resumo([
    { id: '1', valor: 1, dataAssinatura: '2026-03-01', situacao: 'critico', problemas: 1 },
    { id: '2', valor: 1, dataAssinatura: '2025-12-01', situacao: 'ok', problemas: 0 },
    { id: '3', valor: 1, dataAssinatura: '2026-01-01', situacao: 'divergencia', problemas: 1 },
  ], []);
  assert.deepEqual(r.meses.map((m) => m.mes), ['2025-12', '2026-01', '2026-03']);
  assert.equal(r.primeiroComPendencia, '2026-01', 'o mais ANTIGO com pendência, não o pior');
});

test('mês inteiro limpo não aponta pendência nenhuma', () => {
  const r = resumo([{ id: '1', valor: 1, dataAssinatura: '2026-01-01', situacao: 'ok', problemas: 0 }], []);
  assert.equal(r.primeiroComPendencia, null);
});

test('o diagnóstico completo já vem com os meses dentro', () => {
  // A tela pede o diagnóstico uma vez; se os meses não vierem junto, ela
  // acaba pedindo tudo de novo só para montar a régua de meses.
  const d = conciliar({
    contratos: [{ id: 'c1', cliente: 'A', servico: 'Asilo', valor: 500, etapa: 'Assinado',
      dataAssinatura: '2026-02-03', numParcelas: 1 }],
    clientes: [{ id: 'cl1', nome: 'A', contratoIds: ['c1'] }],
    contas: [{ id: 'f1', contratoId: 'c1', valor: 500, vencimento: '2026-02-03', status: 'Pago',
      valorRecebido: 500, dataRecebimento: '2026-02-03', descricao: 'Parcela 1/1' }],
    processos: [{ id: 'p1', contratoId: 'c1', servico: 'Asilo', status: 'Protocolado', responsavel: 'Vitória' }],
    checklists: [],
  });
  assert.ok(Array.isArray(d.meses), 'o diagnóstico tem que trazer `meses`');
  assert.equal(d.meses.length, 1);
  assert.equal(d.meses[0].mes, '2026-02');
  assert.equal(d.meses[0].contratos.total, 1);
  // E o total de contratos auditados tem que bater com a soma dos meses mais
  // os sem data, senão algum contrato caiu num vão entre as duas contas.
  const somaDosMeses = d.meses.reduce((a, m) => a + m.contratos.total, 0);
  assert.equal(somaDosMeses + d.contratosSemDataDeAssinatura, d.resumo.auditados);
});

test('a régua para no mês corrente — mês que não aconteceu não tem o que conciliar', () => {
  // O escritório tem parcela marcada até 2029. Sem o corte a régua nascia com
  // 33 meses, quase todos sem nenhum contrato para auditar, e a tela virava
  // uma parede de meses vazios antes do primeiro que importa.
  const contas = [
    { contratoId: 'c1', valor: 100, vencimento: '2026-09-10', status: 'Pago', valorRecebido: 100, dataRecebimento: '2026-09-10' },
    { contratoId: 'c1', valor: 200, vencimento: '2026-10-10', status: 'A vencer', valorRecebido: 0 },
    { contratoId: 'c1', valor: 300, vencimento: '2026-12-10', status: 'A vencer', valorRecebido: 0 },
    { contratoId: 'c1', valor: 400, vencimento: '2029-05-10', status: 'A vencer', valorRecebido: 0 },
  ];
  const r = resumo([], contas);
  assert.deepEqual(r.meses.map((m) => m.mes), ['2026-09', '2026-10'],
    'nada depois de outubro de 2026 ganha linha na régua');
  assert.equal(r.mesCorrente, '2026-10');

  // E o que ficou de fora NÃO desaparece: vira um resumo com nome.
  assert.equal(r.futuro.parcelas, 2);
  assert.equal(r.futuro.previsto, 700);
  assert.equal(r.futuro.emAberto, 700);
  assert.equal(r.futuro.primeiroMes, '2026-12');
  assert.equal(r.futuro.ultimoMes, '2029-05');
});

test('o mês corrente entra na régua, não é tratado como futuro', () => {
  // Outubro está acontecendo: é o mês que ela está fechando. Cortar "a partir
  // de hoje" em vez de "a partir do mês que vem" tirava da régua justamente o
  // mês em que ela está trabalhando.
  const r = resumo([], [
    { contratoId: 'c1', valor: 500, vencimento: '2026-10-31', status: 'A vencer', valorRecebido: 0 },
  ]);
  assert.deepEqual(r.meses.map((m) => m.mes), ['2026-10']);
  assert.equal(achar(r, '2026-10').cobranca.previsto, 500);
  assert.equal(r.futuro.parcelas, 0);
});

test('contrato assinado com data no futuro é contado, não jogado num mês invisível', () => {
  // Data de assinatura em 2027 é erro de digitação. Se eu criar o mês 2027-03
  // para ele, o contrato vai morar num mês que ninguém abre.
  const r = resumo([
    { id: '1', valor: 100, dataAssinatura: '2026-09-05', situacao: 'ok', problemas: 0 },
    { id: '2', valor: 100, dataAssinatura: '2027-03-05', situacao: 'critico', problemas: 2 },
  ], []);
  assert.equal(r.contratosComDataNoFuturo, 1);
  assert.deepEqual(r.meses.map((m) => m.mes), ['2026-09']);
});

test('parcela futura cancelada não infla a previsão do futuro', () => {
  const r = resumo([], [
    { contratoId: 'c1', valor: 900, vencimento: '2027-01-10', status: 'Cancelado', valorRecebido: 0 },
    { contratoId: 'c1', valor: 100, vencimento: '2027-01-10', status: 'A vencer', valorRecebido: 0 },
  ]);
  assert.equal(r.futuro.previsto, 100);
  assert.equal(r.futuro.parcelas, 1);
});
