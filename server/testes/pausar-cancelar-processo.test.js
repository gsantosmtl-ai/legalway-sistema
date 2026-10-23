// "Nos processos tem que ter as opções: pausar processo, cancelar processo,
// reativar processo."
//
// E, nas mensagens seguintes, o que cada uma significa na prática:
//   "quando pausar — ficar amarelo no documentos o card correspondente"
//   "quando cancelado — sai do funil de documentos, e sai do financeiro a
//    receber futuro"
//
// Situação é diferente de ETAPA. Pausar não pode fazer o processo esquecer
// onde estava: reativar devolve para a mesma coluna.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const avisos = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const i = docs.indexOf(assinatura);
  assert.notEqual(i, -1, 'não achei ' + assinatura);
  let n = 0;
  for (let k = docs.indexOf('{', i); k < docs.length; k++) {
    if (docs[k] === '{') n++;
    else if (docs[k] === '}') { n--; if (n === 0) return docs.slice(i, k + 1); }
  }
  throw new Error('chaves não fecham');
}

test('as três opções existem na ficha', () => {
  assert.match(docs, /id="btn-pausar"[^>]*>⏸ Pausar processo</);
  assert.match(docs, /id="btn-cancelar-proc"[^>]*>✖ Cancelar processo</);
  assert.match(docs, /id="btn-reativar"[^>]*>▶ Reativar processo</);
  assert.match(docs, /mudarSituacao\(p\.id, 'pausado'\)/);
  assert.match(docs, /mudarSituacao\(p\.id, 'cancelado'\)/);
  assert.match(docs, /mudarSituacao\(p\.id, 'ativo'\)/);
});

test('pausar e cancelar não aparecem juntos com reativar', () => {
  // Um processo pausado não se pausa de novo. O que ele precisa é de voltar.
  const corpo = corpoDe('function botoesDeSituacao(p)');
  assert.match(corpo, /\$\{sit === 'ativo' \? `/, 'é um ou outro, pelo estado atual');
  assert.match(corpo, /Volta para a etapa "\$\{esc\(p\.status \|\| ''\)\}", onde estava/,
    'a tela diz para onde ele volta — senão ninguém clica com confiança');
});

test('pausado fica amarelo no quadro; cancelado sai do quadro', () => {
  assert.match(docs, /\.card\.pausado\{ background:#FDF8EC; border-color:#D9A441/,
    '"quando pausar — ficar amarelo no documentos o card correspondente"');
  assert.match(docs, /situacaoDe\(p\)==='pausado' \? 'pausado' : ''/, 'a classe tem que chegar no cartão');
  assert.match(docs, /let lista = verCancelados \? processos : processos\.filter\(p=> situacaoDe\(p\) !== 'cancelado'\)/,
    '"quando cancelado — sai do funil de documentos"');
  assert.match(docs, /\$\{verCancelados \? 'esconder' : 'ver'\} \$\{n\} cancelado\(s\)/,
    'mas precisa haver como trazer de volta à vista, senão não há como reativar');
});

test('o cartão diz que está pausado, e por quê', () => {
  assert.match(docs, /SITUACAO\[p\.situacao\]\.icone\} \$\{SITUACAO\[p\.situacao\]\.rotulo\}/);
  assert.match(docs, /p\.situacaoMotivo \? ' · ' \+ esc\(p\.situacaoMotivo\)/,
    'amarelo sem motivo não diz nada a quem não pausou');
});

test('processo pausado ou cancelado não recebe mais mensagem automática', () => {
  // É o que "pausar" significa para quem usa: o cliente para de ser perseguido
  // por documento.
  const i = avisos.indexOf('const processosAtivos = processos.filter');
  assert.notEqual(i, -1, 'os gatilhos não podem enxergar processo parado');
  assert.match(avisos.slice(i, i + 400), /p\.situacao !== 'pausado' && p\.situacao !== 'cancelado'/);
  assert.match(avisos, /const dados = \{ processos: processosAtivos,/);
  assert.match(avisos, /gravar\(K\.processos, processos, vP, QUEM\)/,
    'o bloco inteiro continua sendo gravado: o filtro é só do que os gatilhos veem');
});

// ------------------------------------------------------- rodando de verdade
function palco() {
  const ctx = {
    now: () => new Date('2026-10-23T18:00:00Z'),
    hoje: () => '2026-10-23',
    sessao: { nome: 'Tatiane' }, console,
    render: () => {}, renderDrawer: () => {}, loadAll: async () => {},
    avisosNaTela: [], gravouProcessos: null, gravouFinanceiro: null,
    toast: (m) => ctx.avisosNaTela.push(m),
    saveProcessos: async () => { ctx.gravouProcessos = JSON.parse(JSON.stringify(ctx.processos)); return null; },
    FINANCEIRO_KEY: 'legalway-financeiro-v1',
    window: { storage: { set: async (k, corpo) => { ctx.gravouFinanceiro = JSON.parse(corpo); } } },
  };
  ctx.situacaoDe = (p) => (p && ['pausado', 'cancelado'].includes(p.situacao)) ? p.situacao : 'ativo';
  ctx.SITUACAO = { pausado: { rotulo: 'Pausado', icone: '⏸' }, cancelado: { rotulo: 'Cancelado', icone: '✖' } };
  vm.createContext(ctx);
  vm.runInContext(corpoDe('async function mudarSituacao(id, novaSituacao)') + '\n' +
                  corpoDe('async function cancelarParcelasFuturas(p, motivo)'), ctx);
  return ctx;
}

const PROC = () => ({ id: 'p1', clienteNome: 'Lucas', status: 'Protocolado', contratoId: 'c1', historico: [] });
const PARCELAS = () => ([
  { id: 'f1', contratoId: 'c1', vencimento: '2026-05-20', status: 'Pago', valor: 100 },
  { id: 'f2', contratoId: 'c1', vencimento: '2026-09-20', status: 'A vencer', valor: 100 },  // já venceu = dívida
  { id: 'f3', contratoId: 'c1', vencimento: '2026-11-20', status: 'A vencer', valor: 100 },  // futura
  { id: 'f4', contratoId: 'c1', vencimento: '2026-12-20', status: 'A vencer', valor: 100 },  // futura
  { id: 'f5', contratoId: 'c2', vencimento: '2026-12-20', status: 'A vencer', valor: 999 },  // outro contrato
]);

test('pausar guarda a etapa e o motivo, sem mexer em mais nada', async () => {
  const ctx = palco();
  ctx.processos = [PROC()];
  ctx.contasReceber = PARCELAS();
  ctx.LW = { pedirTexto: async () => 'cliente viajou' };
  await ctx.mudarSituacao('p1', 'pausado');

  const g = ctx.gravouProcessos[0];
  assert.equal(g.situacao, 'pausado');
  assert.equal(g.situacaoMotivo, 'cliente viajou');
  assert.equal(g.situacaoPor, 'Tatiane');
  assert.equal(g.status, 'Protocolado', 'a etapa do funil não muda ao pausar');
  assert.equal(ctx.gravouFinanceiro, null, 'pausar NÃO mexe no Financeiro');
  assert.match(g.historico.at(-1).texto, /Processo pausado na etapa "Protocolado" — cliente viajou/);
});

test('cancelar tira do quadro e cancela só as parcelas a vencer', async () => {
  const ctx = palco();
  ctx.processos = [PROC()];
  ctx.contasReceber = PARCELAS();
  ctx.LW = { pedirTexto: async () => 'desistiu' };
  await ctx.mudarSituacao('p1', 'cancelado');

  assert.equal(ctx.gravouProcessos[0].situacao, 'cancelado');
  const porId = Object.fromEntries(ctx.gravouFinanceiro.map(f => [f.id, f.status]));
  assert.equal(porId.f1, 'Pago', 'parcela paga é histórico: não se cancela');
  assert.equal(porId.f2, 'A vencer', 'parcela já vencida é dívida: continua a cobrar');
  assert.equal(porId.f3, 'Cancelado', 'a que ainda vai vencer sai');
  assert.equal(porId.f4, 'Cancelado');
  assert.equal(porId.f5, 'A vencer', 'contrato de outra pessoa não é tocado');
  const f3 = ctx.gravouFinanceiro.find(f => f.id === 'f3');
  assert.match(f3.canceladoMotivo, /Processo cancelado na Documentação — desistiu/,
    'quem olhar a parcela no Financeiro precisa saber de onde veio o cancelamento');
  assert.match(ctx.avisosNaTela.join(' '), /2 parcela\(s\) a vencer foram canceladas/);
});

test('sem permissão no Financeiro, avisa em voz alta em vez de falhar calado', async () => {
  const ctx = palco();
  ctx.processos = [PROC()];
  ctx.contasReceber = PARCELAS();
  ctx.window.storage.set = async () => { throw new Error('Sem permissão pra alterar esses dados.'); };
  ctx.LW = { pedirTexto: async () => '' };
  await ctx.mudarSituacao('p1', 'cancelado');

  assert.equal(ctx.gravouProcessos[0].situacao, 'cancelado', 'o processo foi cancelado assim mesmo');
  assert.match(ctx.avisosNaTela.join(' '), /ATENÇÃO: as 2 parcela\(s\) a vencer não foram canceladas/);
  assert.match(ctx.avisosNaTela.join(' '), /Peça ao Financeiro/);
  assert.match(ctx.gravouProcessos[0].historico.map(h => h.texto).join(' '), /NÃO foram canceladas/,
    'e fica no histórico, senão ninguém descobre depois');
});

test('reativar limpa a situação e mantém a etapa', async () => {
  const ctx = palco();
  ctx.processos = [{ ...PROC(), situacao: 'cancelado', situacaoMotivo: 'desistiu', situacaoEm: '2026-10-01' }];
  ctx.contasReceber = PARCELAS();
  ctx.LW = { confirmar: async () => true };
  await ctx.mudarSituacao('p1', 'ativo');

  const g = ctx.gravouProcessos[0];
  assert.equal(g.situacao, null);
  assert.equal(g.situacaoMotivo, '');
  assert.equal(g.status, 'Protocolado', 'volta para a coluna onde estava');
  assert.equal(ctx.gravouFinanceiro, null, 'reativar o PROCESSO não ressuscita parcela: isso é com o Financeiro');
  assert.match(g.historico.at(-1).texto, /Processo reativado \(estava cancelado\)/);
});

test('desistir da janela não muda nada', async () => {
  const ctx = palco();
  ctx.processos = [PROC()];
  ctx.contasReceber = PARCELAS();
  ctx.LW = { pedirTexto: async () => null };
  await ctx.mudarSituacao('p1', 'pausado');
  assert.equal(ctx.gravouProcessos, null);
  assert.equal(ctx.processos[0].situacao, undefined);
});

test('a lista trocada durante a pergunta não pausa a ficha errada', async () => {
  const ctx = palco();
  ctx.processos = [PROC()];
  ctx.contasReceber = PARCELAS();
  ctx.LW = { pedirTexto: async () => { ctx.processos = []; return 'x'; } };
  await ctx.mudarSituacao('p1', 'pausado');
  assert.equal(ctx.gravouProcessos, null);
  assert.match(ctx.avisosNaTela.join(' '), /A lista mudou enquanto você confirmava/);
});
