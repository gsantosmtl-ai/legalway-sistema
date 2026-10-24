// "rodar 10 testes diretos de todo o fluxo, criar 10 leads testes e seguir com
//  eles dentro de todo o processo, todas as possibilidades para identificar
//  qualquer falha."
//
// Dez leads, dez caminhos diferentes, do Ganho até cliente, financeiro e
// documentação. O contrato nasce com o código que está na tela do Funil e o
// resto roda com o `automacoes.js` de verdade, contra um banco em memória —
// então o que está sendo testado é o sistema, não uma imitação dele escrita
// aqui dentro.
//
// Cada caminho roda a bateria DUAS vezes e confere que a segunda não mexe em
// nada: automação que roda a cada minuto não pode ir somando parcela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoDeEnsaio, contratoDoGanho } from './ajuda/banco-de-ensaio.js';

const HOJE = '2026-10-24';
const AGORA = '2026-10-24T12:00:00.000Z';

const lead = (n, extra = {}) => ({
  id: 'ld' + n, nome: 'Teste ' + n, telefone: '+1 407 555 01' + String(n).padStart(2, '0'),
  vendedor: n % 2 ? 'Renato' : 'Adriano', servico: 'EB-2 NIW', valorPotencial: 5000,
  email: 't' + n + '@exemplo.com', endereco: String(n) + ' Orange Ave, Orlando FL',
  comercial: { servicoOferecido: 'EB-2 NIW', valorNegociado: 9000, entrada: 2000, parcelas: 7 },
  ...extra,
});

// Monta o banco com um contrato assinado e roda tudo. `jaAssinado` simula a
// tela de Contratos tendo marcado a etapa antes do servidor — a corrida real.
async function fluxo(contrato, { confirmacao = {}, blocos = {}, jaAssinado = true } = {}) {
  const base = {
    'legalway-contratos-v1': [contrato],
    'legalway-clientes-v1': [], 'legalway-financeiro-v1': [],
    'legalway-processos-documentacao-v1': [], 'legalway-checklists-v1': [
      { servico: 'EB-2 NIW', documentos: [{ nome: 'Passaporte' }, { nome: 'Currículo' }] },
    ],
    'legalway-sdr-v1': [], 'legalway-contas-pagar-v1': [], 'legalway-tarefas-v1': [],
    ...blocos,
  };
  if (jaAssinado) {
    base['legalway-contratos-v1'][0].etapa = 'Assinado';
    base['legalway-contratos-v1'][0].dataAssinatura = AGORA;
  }
  base['legalway-contrato-assinado-' + contrato.id] = {
    assinadoEm: AGORA, nome: contrato.cliente, pdf: '/api/arquivos/x.pdf', anexos: [], ...confirmacao,
  };
  const b = bancoDeEnsaio(base, { hoje: HOJE });
  const r1 = await b.rodar();
  assert.deepEqual(r1.falhas, [], 'alguma automação quebrou: ' + r1.falhas.join(' · '));
  const depoisDaPrimeira = JSON.stringify(b.dados);
  const r2 = await b.rodar();
  assert.deepEqual(r2.falhas, [], 'segunda rodada quebrou: ' + r2.falhas.join(' · '));
  return { b, mudouNaSegunda: JSON.stringify(b.dados) !== depoisDaPrimeira,
    clientes: b.bloco('legalway-clientes-v1'),
    contas: b.bloco('legalway-financeiro-v1'),
    processos: b.bloco('legalway-processos-documentacao-v1'),
    contratos: b.bloco('legalway-contratos-v1') };
}

const descr = (contas) => contas.map(c => c.descricao);

// ---------------------------------------------------------------------------
test('1 · caminho feliz: entrada e sete parcelas', async () => {
  const c = contratoDoGanho(lead(1));
  const r = await fluxo(c);
  assert.equal(r.clientes.length, 1, 'cliente criado');
  assert.equal(r.clientes[0].nome, 'Teste 1');
  assert.deepEqual(descr(r.contas), ['Entrada', 'Parcela 1/7', 'Parcela 2/7', 'Parcela 3/7',
    'Parcela 4/7', 'Parcela 5/7', 'Parcela 6/7', 'Parcela 7/7']);
  assert.equal(r.contas.reduce((s, x) => s + x.valor, 0), 9000, 'entrada + parcelas = o valor do contrato');
  assert.equal(r.processos.length, 1, 'ficha de documentação criada');
  assert.equal(r.processos[0].status, 'Aguardando boas-vindas');
  assert.equal(r.mudouNaSegunda, false, 'a segunda rodada não pode mexer em nada');
});

test('2 · à vista: entrada é o valor inteiro, nenhuma parcela', async () => {
  const c = contratoDoGanho(lead(2, { comercial: { servicoOferecido: 'EB-2 NIW', valorNegociado: 6000, entrada: 6000, parcelas: 0 } }));
  const r = await fluxo(c);
  assert.deepEqual(descr(r.contas), ['Entrada']);
  assert.equal(r.contas[0].valor, 6000);
  assert.equal(r.mudouNaSegunda, false);
});

test('3 · sem entrada: só parcelas, e elas fecham o valor até o centavo', async () => {
  // 10.000 em 3 não dá divisão exata: 3.333,33 três vezes deixa um centavo
  // para trás. É a última parcela que tem de absorver a diferença — senão o
  // cliente fica devendo um centavo para sempre e a conta nunca fecha.
  const c = contratoDoGanho(lead(3, { comercial: { servicoOferecido: 'EB-2 NIW', valorNegociado: 10000, entrada: 0, parcelas: 3 } }));
  const r = await fluxo(c);
  assert.deepEqual(descr(r.contas), ['Parcela 1/3', 'Parcela 2/3', 'Parcela 3/3']);
  assert.deepEqual(r.contas.map(x => x.valor), [3333.33, 3333.33, 3333.34],
    'a sobra vai na última');
  assert.equal(r.contas.reduce((s, x) => s + x.valor, 0), 10000, 'as parcelas somam o contrato inteiro');
  assert.equal(r.mudouNaSegunda, false);
});

test('4 · com dependentes: cada um ganha a própria seção no checklist', async () => {
  const c = contratoDoGanho(lead(4), 2);
  const r = await fluxo(c);
  assert.equal(r.processos[0].dependentes, 2);
  const grupos = [...new Set(r.processos[0].checklist.map(d => d.grupo).filter(Boolean))];
  assert.deepEqual(grupos, ['Dependente 1', 'Dependente 2'],
    'sem seção por pessoa, o passaporte do filho sobrescreve o do titular');
  assert.equal(r.mudouNaSegunda, false);
});

test('5 · a corrida: a tela marcou "Assinado" antes do servidor', async () => {
  // o defeito que ela pegou com o Neilson: o contrato já chegava marcado e o
  // servidor pulava — sem cliente, sem financeiro
  const c = contratoDoGanho(lead(5));
  const r = await fluxo(c, { jaAssinado: true });
  assert.equal(r.clientes.length, 1, 'cliente tem que nascer mesmo assim');
  assert.ok(r.contas.length > 0, 'e as parcelas também');
  assert.equal(r.processos.length, 1);
});

test('6 · o anexo que o cliente mandou entra, e não duplica', async () => {
  const c = contratoDoGanho(lead(6));
  const r = await fluxo(c, { confirmacao: { anexos: [{ nome: 'cartao.jpg', arquivo: 'a1.jpg' }] } });
  assert.equal(r.contratos[0].anexosCliente.length, 1);
  assert.equal(r.contratos[0].anexosCliente[0].arquivo, 'a1.jpg');
  assert.equal(r.mudouNaSegunda, false, 'rodar de novo não pode anexar o mesmo arquivo outra vez');
});

test('7 · cliente que já existe: liga o contrato, não cria pessoa nova', async () => {
  const c = contratoDoGanho(lead(7));
  const r = await fluxo(c, { blocos: { 'legalway-clientes-v1': [
    { id: 'cl-velho', nome: 'Teste 7', telefone: '14075550107', contratoIds: ['contrato-antigo'], historico: [] },
  ] } });
  assert.equal(r.clientes.length, 1, 'a mesma pessoa, não duas');
  assert.deepEqual(r.clientes[0].contratoIds, ['contrato-antigo', c.id]);
  assert.equal(r.mudouNaSegunda, false);
});

test('8 · ficha que já existia é adotada, em vez de virar uma segunda', async () => {
  // foi assim que o Lucas acabou com três fichas
  const c = contratoDoGanho(lead(8));
  const r = await fluxo(c, { blocos: { 'legalway-processos-documentacao-v1': [
    { id: 'doc-velho', contratoId: null, clienteNome: 'Teste 8', telefone: '14075550108',
      status: 'Aguardando boas-vindas', checklist: [], historico: [] },
  ] } });
  assert.equal(r.processos.length, 1, 'uma ficha só');
  assert.equal(r.processos[0].id, 'doc-velho', 'a que já existia');
  assert.equal(r.processos[0].contratoId, c.id, 'agora ligada ao contrato');
});

test('9 · contrato antigo não ganha cobrança inventada', async () => {
  // a trava: a varredura conserta a corrida, não refaz o passado
  const c = contratoDoGanho(lead(9));
  c.etapa = 'Assinado';
  c.dataAssinatura = '2026-06-01T10:00:00.000Z';   // meses atrás
  const b = bancoDeEnsaio({
    'legalway-contratos-v1': [c], 'legalway-clientes-v1': [], 'legalway-financeiro-v1': [],
    'legalway-processos-documentacao-v1': [], 'legalway-checklists-v1': [],
    'legalway-sdr-v1': [], 'legalway-contas-pagar-v1': [], 'legalway-tarefas-v1': [],
  }, { hoje: HOJE });
  const r = await b.rodar();
  assert.deepEqual(r.falhas, []);
  assert.equal(b.bloco('legalway-financeiro-v1').length, 0, 'nenhuma parcela inventada');
  assert.equal(b.bloco('legalway-clientes-v1').length, 0, 'nenhum cliente inventado');
});

test('10 · contrato cancelado: as parcelas futuras não ficam cobrando', async () => {
  const c = contratoDoGanho(lead(10));
  const r = await fluxo(c);
  const antes = r.contas.filter(x => x.status !== 'Cancelada').length;
  assert.ok(antes > 1, 'tinha parcela em aberto');

  // agora cancela e roda de novo
  r.b.dados['legalway-contratos-v1'][0].etapa = 'Cancelado';
  r.b.dados['legalway-contratos-v1'][0].canceladoEm = AGORA;
  const r2 = await r.b.rodar();
  assert.deepEqual(r2.falhas, []);
  const depois = r.b.bloco('legalway-financeiro-v1');
  const emAberto = depois.filter(x => x.status === 'A vencer' || x.status === 'Atrasada');
  assert.equal(emAberto.length, 0,
    'contrato cancelado não pode continuar gerando cobrança: ' + JSON.stringify(depois.map(x => [x.descricao, x.status])));
});
