// O defeito real que a Tatiane pegou testando com o Neilson:
// "lead assina o contrato mas nao e gerado, cliente, nao gerou financeiro e
// nao gerou documentacao."
//
// A tela de Contratos confirma a assinatura de 8 em 8 segundos e marca a etapa
// como "Assinado". Quando ela ganhava essa corrida, a automação do servidor
// pulava o contrato ("já está Assinado, já foi tratado") e NUNCA criava o
// cliente nem as parcelas. O processo nascia, porque aquela automação varre
// todos os assinados; o resto não.
//
// Por isso os testes abaixo partem sempre de um contrato que JÁ chegou
// marcado como Assinado — é o estado em que a tela o deixa.
import { test } from 'node:test';
import assert from 'node:assert';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { encaixarCliente, encaixarContas, assinadoHaPoucoTempo } = await import('../src/automacoes.js');
// A varredura roda num contexto isolado (vm) mais abaixo: tudo que o código de
// produção importa precisa chegar lá com a implementação DE VERDADE — um dublê
// aqui esconderia justamente o defeito que o teste existe para pegar.
const { instanteDe } = await import('../src/datas.js');

const contrato = (extra = {}) => ({
  id: 'c-teste-neilson', cliente: 'Teste neilson A', telefone: '+1 407 555 0199',
  servico: 'EB-2 NIW', vendedor: 'Renato', etapa: 'Assinado',
  dataAssinatura: '2026-10-22T23:08:55.000Z', valor: 900000, entrada: 200000,
  numParcelas: 2, recorrencia: 'mensal', pagamento: 'Cartão', ...extra,
});

test('contrato já marcado Assinado pela tela ainda gera o cliente', () => {
  const clientes = [], log = [];
  assert.equal(encaixarCliente(clientes, contrato(), log), true);
  assert.equal(clientes.length, 1);
  assert.equal(clientes[0].nome, 'Teste neilson A');
  assert.deepEqual(clientes[0].contratoIds, ['c-teste-neilson']);
});

test('contrato já marcado Assinado pela tela ainda gera as parcelas', () => {
  const contas = [], log = [];
  assert.equal(encaixarContas(contas, contrato(), log), true);
  const descricoes = contas.map(c => c.descricao);
  assert.equal(JSON.stringify(descricoes), JSON.stringify(['Entrada', 'Parcela 1/2', 'Parcela 2/2']));
  assert.equal(contas.reduce((s, c) => s + c.valor, 0), 900000);
  assert.ok(contas.every(c => c.contratoId === 'c-teste-neilson'));
});

test('varrer de novo não duplica nada', () => {
  const clientes = [], contas = [], log = [];
  encaixarCliente(clientes, contrato(), log);
  encaixarContas(contas, contrato(), log);
  assert.equal(encaixarCliente(clientes, contrato(), log), false);
  assert.equal(encaixarContas(contas, contrato(), log), false);
  assert.equal(clientes.length, 1);
  assert.equal(clientes[0].historico.length, 1);
  assert.equal(contas.length, 3);
});

test('cliente que já existe na base ganha o elo com o contrato novo', () => {
  const clientes = [{ id: 'cl1', nome: 'Teste neilson A', telefone: '14075550199', contratoIds: ['antigo'] }];
  const log = [];
  assert.equal(encaixarCliente(clientes, contrato(), log), true);
  assert.equal(clientes.length, 1, 'não cria pessoa duplicada');
  assert.deepEqual(clientes[0].contratoIds, ['antigo', 'c-teste-neilson']);
  // e na varredura seguinte não repete
  assert.equal(encaixarCliente(clientes, contrato(), log), false);
});

test('contrato sem entrada e sem parcelas não inventa conta', () => {
  // o estado em que o contrato do Neilson foi gravado: entrada 0, 0 parcelas
  const contas = [], log = [];
  assert.equal(encaixarContas(contas, contrato({ entrada: 0, numParcelas: 0 }), log), false);
  assert.equal(contas.length, 0);
});

test('parcela que já existe não é recriada', () => {
  const contas = [{ id: 'fr1', contratoId: 'c-teste-neilson', descricao: 'Entrada', valor: 200000 }];
  const log = [];
  assert.equal(encaixarContas(contas, contrato(), log), false, 'já tem conta deste contrato: não mexe');
  assert.equal(contas.length, 1);
});

// ---------------------------------------------------------------------------
// A varredura em si. Os testes acima provam que as duas funções fazem o
// trabalho; estes provam que ELAS SÃO CHAMADAS para todo contrato assinado, e
// não só para os que a rodada acabou de marcar — que era o defeito.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');
function corpoDe(assinatura) {
  const ini = fonte.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < fonte.length; i++) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return fonte.slice(ini, fim).replace('export ', '');
}

// Roda a varredura de verdade, com dublês no lugar do banco, e devolve para
// quais contratos cada função de criação foi chamada.
function corpoDaVarredura() { return corpoDe('async function clientesEContasDeAssinados(log)'); }

function varrer(contratos) {
  const vistos = { cliente: [], contas: [], gravou: [] };
  const ctx = {
    K: { contratos: 'kc', clientes: 'kcli', receber: 'krec' },
    bloco: async (chave) => ({ valor: chave === 'kc' ? contratos : [], versao: 1 }),
    salvar: async (chave) => { vistos.gravou.push(chave); },
    encaixarCliente: (_arr, c) => { vistos.cliente.push(c.id); return true; },
    encaixarContas: (_arr, c) => { vistos.contas.push(c.id); return true; },
    instanteDe,
    console,
  };
  vm.createContext(ctx);
  // a janela vive numa função ao lado, com a sua constante; sem as duas o
  // contexto isolado não resolve
  const janela = /const DIAS_PARA_RECONCILIAR = (\d+);/.exec(fonte);
  assert.ok(janela, 'não achei a janela de dias');
  new vm.Script(`const DIAS_PARA_RECONCILIAR = ${janela[1]};\n`
    + corpoDe('export function assinadoHaPoucoTempo(c, agoraMs)').replace('export ', '')
    + '\n' + corpoDe('async function clientesEContasDeAssinados(log)')
    + '\nvar pronto = clientesEContasDeAssinados([]);').runInContext(ctx);
  return ctx.pronto.then(() => vistos);
}

// ---------------------------------------------------------------------------
// A janela. A varredura conserta a corrida entre quem marca o contrato como
// assinado — ela não pode sair criando registro financeiro de contrato velho.
const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.parse('2026-10-23T12:00:00.000Z');

test('contrato assinado hoje entra na reconciliação', () => {
  assert.equal(assinadoHaPoucoTempo({ dataAssinatura: '2026-10-23T09:00:00.000Z' }, AGORA), true);
});

test('contrato assinado há meses NÃO entra', () => {
  // Sem esta trava, o primeiro ciclo depois do deploy passaria pelos quase
  // duzentos contratos assinados da base. Para os importados do Bling, cujas
  // parcelas podem não estar ligadas pelo `contratoId`, a varredura concluiria
  // "não tem parcelas" e geraria cobrança nova em cima de contrato antigo.
  assert.equal(assinadoHaPoucoTempo({ dataAssinatura: '2026-06-01T09:00:00.000Z' }, AGORA), false);
});

test('a borda da janela', () => {
  assert.equal(assinadoHaPoucoTempo({ dataAssinatura: new Date(AGORA - 7 * DIA + 1000).toISOString() }, AGORA), true);
  assert.equal(assinadoHaPoucoTempo({ dataAssinatura: new Date(AGORA - 7 * DIA - 1000).toISOString() }, AGORA), false);
});

test('sem data, ou com data estragada, fica de fora', () => {
  // não dá para saber se é recente: o seguro é não mexer
  assert.equal(assinadoHaPoucoTempo({}, AGORA), false);
  assert.equal(assinadoHaPoucoTempo({ dataAssinatura: '' }, AGORA), false);
  assert.equal(assinadoHaPoucoTempo({ dataAssinatura: 'ontem' }, AGORA), false);
});

test('a varredura aplica a janela', () => {
  const corpo = corpoDaVarredura();
  assert.match(corpo, /assinadoHaPoucoTempo\(c, agoraMs\)/,
    'sem isto a varredura passa pela base inteira no primeiro ciclo');
});

test('a varredura passa por TODO contrato assinado recente, não só pelos recém-marcados', async () => {
  // É este o cenário da Tatiane: o contrato do Neilson já estava "Assinado"
  // (a tela marcou) quando a automação rodou.
  const recente = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const vistos = await varrer([
    { id: 'neilson', etapa: 'Assinado', dataAssinatura: recente },
    { id: 'outro-de-ontem', etapa: 'Assinado', dataAssinatura: new Date(Date.now() - DIA).toISOString() },
    { id: 'de-meses-atras', etapa: 'Assinado', dataAssinatura: '2026-06-01T10:00:00.000Z' },
    { id: 'em-negociacao', etapa: 'Enviado', dataAssinatura: recente },
    { id: 'cancelado', etapa: 'Cancelado', dataAssinatura: recente },
  ]);
  assert.equal(JSON.stringify(vistos.cliente), JSON.stringify(['neilson', 'outro-de-ontem']),
    'os assinados recentes são conferidos mesmo que outro lugar os tenha marcado; os velhos não');
  assert.equal(JSON.stringify(vistos.contas), JSON.stringify(['neilson', 'outro-de-ontem']));
});

test('a varredura grava uma vez por bloco, não uma vez por contrato', async () => {
  // Gravar por contrato estouraria o histórico da chave: ele guarda só as 30
  // últimas versões, e 200 contratos assinados apagariam todo o resto.
  const recente = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const assinados = Array.from({ length: 50 }, (_, i) => ({ id: 'c' + i, etapa: 'Assinado', dataAssinatura: recente }));
  const vistos = await varrer(assinados);
  assert.equal(vistos.cliente.length, 50);
  assert.equal(vistos.gravou.length, 2, 'uma gravação para clientes, uma para o financeiro');
  assert.equal(JSON.stringify(vistos.gravou), JSON.stringify(['kcli', 'krec']));
});

test('sem contrato assinado a varredura não grava nada', async () => {
  const vistos = await varrer([{ id: 'x', etapa: 'Enviado', dataAssinatura: new Date().toISOString() }]);
  assert.equal(vistos.gravou.length, 0);
});

test('a varredura está ligada na lista de automações', () => {
  // Sem isto ela nunca roda, e o defeito volta sem nenhum teste reclamar.
  assert.match(fonte, /\[\s*'cliente e parcelas dos assinados'\s*,\s*clientesEContasDeAssinados\s*\]/);
});

test('a confirmação de assinatura não cria mais cliente nem parcelas por conta própria', () => {
  // Era de lá que vinha a dependência de "eu acabei de marcar este contrato".
  const corpo = corpoDe('async function assinaturasPendentes(');
  assert.doesNotMatch(corpo, /encaixarCliente|encaixarContas|clienteDoContrato|contasDoContrato/,
    'assinaturasPendentes não deve criar cliente/parcelas: quem faz isso é a varredura');
});
