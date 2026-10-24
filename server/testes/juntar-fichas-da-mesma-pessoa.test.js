// A Júlia Viana de Azevedo tinha três cartões: dois do contrato (Visto T e
// MOTION, vazios) e um importado do Trello, sem contrato, com os 12 anexos e os
// 3 documentos aprovados — o trabalho todo.
//
// O que estes testes guardam é uma frase dela: "nao podemos perder nada de
// anexos". Juntar COPIA, nunca move; o que não tem onde encaixar vira anexo
// solto em vez de sumir; e a ficha absorvida é cancelada, não apagada — porque
// enquanto ela existir no bloco os arquivos dela seguem referenciados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const ini = tela.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = tela.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < tela.length; i++) { if (tela[i] === '{') nivel++; else if (tela[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return tela.slice(ini, fim);
}

const ETAPAS = ['Aguardando boas-vindas', 'Documentação', 'Protocolado', 'I-797', 'Biometria', 'Em acompanhamento'];

// Roda a juntarFichas real contra uma lista de processos, com o "sim" já dado.
async function juntar(processos, destinoId, origemId, { falhaAoGravar = false } = {}) {
  const avisos = [];
  const ctx = {
    processos, ETAPAS, sessao: { nome: 'teste' },
    situacaoDe: p => (p && (p.situacao === 'cancelado' || p.situacao === 'pausado')) ? p.situacao : 'ativo',
    semAcDoc: x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(),
    esc: x => String(x || ''),
    now: () => new Date('2026-10-24T18:00:00Z'),
    toast: t => avisos.push(t),
    render: () => {}, renderDrawer: () => {},
    document: { getElementById: () => null, querySelectorAll: () => [] },
    LW: { confirmar: async () => true },
    saveProcessos: async () => (falhaAoGravar ? 'servidor fora' : null),
    console,
  };
  vm.createContext(ctx);
  new vm.Script([
    corpoDe('function arquivosDoItem(d)'),
    corpoDe('function temAnexo(d)'),
    corpoDe('function trabalhoDaFicha(p)'),
    corpoDe('function fichasParecidas(p)'),
    corpoDe('async function juntarFichas('),
    'var pronto = juntarFichas(DESTINO, ORIGEM);',
  ].join('\n').replace('DESTINO', JSON.stringify(destinoId)).replace('ORIGEM', JSON.stringify(origemId)))
    .runInContext(ctx);
  await ctx.pronto;
  return { processos, avisos };
}

const ficha = (id, extra = {}) => ({
  id, clienteNome: 'Júlia Viana de Azevedo', servico: 'Visto T',
  status: 'Aguardando boas-vindas', checklist: [], anexos: [], historico: [], ...extra,
});

test('os anexos soltos da ficha velha chegam na ficha do contrato', async () => {
  const { processos } = await juntar([
    ficha('contrato', { contratoId: 'c1', telefone: '(856) 979-5980' }),
    ficha('trello', { clienteNome: 'JULIA VIANA DE AZEVEDO',
      anexos: [{ url: '/a/1', nome: 'SSN - JULIA' }, { url: '/a/2', nome: 'WORK PERMIT - JULIA' }] }),
  ], 'contrato', 'trello');
  const d = processos.find(p => p.id === 'contrato');
  assert.deepEqual(d.anexos.map(a => a.nome), ['SSN - JULIA', 'WORK PERMIT - JULIA']);
});

test('copia, não move: a ficha absorvida continua com os anexos dela', async () => {
  const { processos } = await juntar([
    ficha('contrato', { contratoId: 'c1' }),
    ficha('trello', { anexos: [{ url: '/a/1', nome: 'SSN' }] }),
  ], 'contrato', 'trello');
  const o = processos.find(p => p.id === 'trello');
  assert.equal(o.anexos.length, 1, 'esvaziar a de origem deixaria o arquivo pendurado num só lugar');
});

test('a ficha absorvida é CANCELADA, nunca apagada', async () => {
  const { processos } = await juntar([
    ficha('contrato', { contratoId: 'c1' }),
    ficha('trello', { anexos: [{ url: '/a/1', nome: 'SSN' }] }),
  ], 'contrato', 'trello');
  assert.equal(processos.length, 2, 'apagar levaria junto os arquivos que só ela referencia');
  assert.equal(processos.find(p => p.id === 'trello').situacao, 'cancelado');
});

test('documento com arquivo encaixa no item de mesmo nome', async () => {
  const { processos } = await juntar([
    ficha('contrato', { contratoId: 'c1', checklist: [{ nome: 'FOTO EM FUNDO BRANCO', status: 'Não solicitado' }] }),
    ficha('trello', { checklist: [{ nome: 'Foto em fundo branco', status: 'Aprovado', arquivo: '/f.jpg', nomeArquivo: 'foto.jpg' }] }),
  ], 'contrato', 'trello');
  const d = processos.find(p => p.id === 'contrato').checklist[0];
  assert.equal(d.arquivo, '/f.jpg');
  assert.equal(d.status, 'Aprovado');
});

test('item sem equivalente aqui vira anexo solto — o arquivo não some', async () => {
  const { processos } = await juntar([
    ficha('contrato', { contratoId: 'c1', checklist: [{ nome: 'FORM I-914' }] }),
    ficha('trello', { checklist: [{ nome: 'AUTOMATED CASE INFO', status: 'Aprovado', arquivo: '/aci.pdf', nomeArquivo: 'aci.pdf' }] }),
  ], 'contrato', 'trello');
  const d = processos.find(p => p.id === 'contrato');
  assert.equal(d.checklist.length, 1, 'não inventa item no checklist do serviço');
  assert.deepEqual(d.anexos.map(a => a.url), ['/aci.pdf']);
  assert.match(d.anexos[0].nome, /AUTOMATED CASE INFO/);
});

test('documento que já tem arquivo aqui não é sobrescrito — o de lá vira solto', async () => {
  const { processos } = await juntar([
    ficha('contrato', { contratoId: 'c1', checklist: [{ nome: 'Passaporte', arquivo: '/daqui.pdf', status: 'Aprovado' }] }),
    ficha('trello', { checklist: [{ nome: 'Passaporte', arquivo: '/dela.pdf', nomeArquivo: 'p.pdf', status: 'Recebido' }] }),
  ], 'contrato', 'trello');
  const d = processos.find(p => p.id === 'contrato');
  assert.equal(d.checklist[0].arquivo, '/daqui.pdf', 'o que já estava aqui manda');
  assert.deepEqual(d.anexos.map(a => a.url), ['/dela.pdf'], 'e o outro fica guardado como anexo');
});

test('o mesmo arquivo não é duplicado', async () => {
  const { processos } = await juntar([
    ficha('contrato', { contratoId: 'c1', anexos: [{ url: '/a/1', nome: 'SSN' }] }),
    ficha('trello', { anexos: [{ url: '/a/1', nome: 'SSN' }, { url: '/a/2', nome: 'RG' }] }),
  ], 'contrato', 'trello');
  assert.deepEqual(processos.find(p => p.id === 'contrato').anexos.map(a => a.url), ['/a/1', '/a/2']);
});

test('a coluna só anda para a frente', async () => {
  const { processos } = await juntar([
    ficha('contrato', { contratoId: 'c1', status: 'Em acompanhamento' }),
    ficha('trello', { status: 'Documentação', anexos: [{ url: '/a/1', nome: 'x' }] }),
  ], 'contrato', 'trello');
  assert.equal(processos.find(p => p.id === 'contrato').status, 'Em acompanhamento',
    'herdar a etapa mais atrasada devolveria o cartão para trás no quadro');
});

test('a etapa mais adiantada da ficha velha é herdada', async () => {
  const { processos } = await juntar([
    ficha('contrato', { contratoId: 'c1', status: 'Aguardando boas-vindas' }),
    ficha('trello', { status: 'Protocolado', protocolo: { numero: 'ABC' } }),
  ], 'contrato', 'trello');
  const d = processos.find(p => p.id === 'contrato');
  assert.equal(d.status, 'Protocolado');
  assert.deepEqual(d.protocolo, { numero: 'ABC' });
});

test('telefone e responsável só preenchem buraco, nunca atropelam', async () => {
  const { processos } = await juntar([
    ficha('contrato', { contratoId: 'c1', telefone: '(856) 979-5980', responsavel: '' }),
    ficha('trello', { telefone: '(111) 111-1111', responsavel: 'Bruno' }),
  ], 'contrato', 'trello');
  const d = processos.find(p => p.id === 'contrato');
  assert.equal(d.telefone, '(856) 979-5980');
  assert.equal(d.responsavel, 'Bruno');
});

test('fichas de contratos diferentes NÃO se juntam', async () => {
  const { processos, avisos } = await juntar([
    ficha('a', { contratoId: 'c1' }),
    ficha('b', { contratoId: 'c2', anexos: [{ url: '/x', nome: 'x' }] }),
  ], 'a', 'b');
  assert.equal(processos.find(p => p.id === 'a').anexos.length, 0);
  assert.equal(processos.find(p => p.id === 'b').situacao, undefined);
  assert.match(avisos.join(' '), /contratos diferentes/);
});

test('se a gravação falhar, nada fica pela metade', async () => {
  const { processos } = await juntar([
    ficha('contrato', { contratoId: 'c1', status: 'Aguardando boas-vindas' }),
    ficha('trello', { status: 'Protocolado', anexos: [{ url: '/a/1', nome: 'SSN' }] }),
  ], 'contrato', 'trello', { falhaAoGravar: true });
  const d = processos.find(p => p.id === 'contrato');
  const o = processos.find(p => p.id === 'trello');
  assert.equal(d.anexos.length, 0);
  assert.equal(d.status, 'Aguardando boas-vindas');
  assert.equal(o.situacao, undefined, 'cancelar a de origem sem ter gravado perderia a ficha boa');
});

test('fichasParecidas acha pelo nome mesmo com acento e caixa diferentes', async () => {
  const ctx = {
    processos: [
      ficha('contrato', { telefone: '(856) 979-5980' }),
      ficha('trello', { clienteNome: 'JULIA VIANA DE AZEVEDO', telefone: '' }),
      ficha('outra', { clienteNome: 'Juliana Oliveira' }),
    ],
    situacaoDe: () => 'ativo',
    semAcDoc: x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(),
  };
  vm.createContext(ctx);
  new vm.Script(corpoDe('function fichasParecidas(p)')
    + '\nvar r = JSON.stringify(fichasParecidas(processos[0]).map(p=>p.id));').runInContext(ctx);
  assert.deepEqual(JSON.parse(ctx.r), ['trello'],
    'era exatamente este o buraco: a ficha do Trello sem telefone nunca casava com a do contrato');
});

test('ficha já cancelada não aparece para juntar', async () => {
  const ctx = {
    processos: [ficha('a'), ficha('b', { situacao: 'cancelado' })],
    situacaoDe: p => (p && p.situacao === 'cancelado') ? 'cancelado' : 'ativo',
    semAcDoc: x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(),
  };
  vm.createContext(ctx);
  new vm.Script(corpoDe('function fichasParecidas(p)')
    + '\nvar r = JSON.stringify(fichasParecidas(processos[0]).map(p=>p.id));').runInContext(ctx);
  assert.deepEqual(JSON.parse(ctx.r), []);
});
