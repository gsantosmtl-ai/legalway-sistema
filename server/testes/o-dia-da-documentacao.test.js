// "Precisamos criar uma forma rápida para documentos visualizar todo dia."
//
// O quadro mostra 263 cartões e responde "como está tudo". Não responde "o que
// eu faço agora". Este painel responde — e resolve, junto, o buraco que já
// estava anotado: para saber o que está parado com os prestadores era preciso
// abrir processo por processo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

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

test('o botão está no topo e mostra quantos itens há', () => {
  assert.match(docs, /id="btn-o-dia"[^>]*>📋 O dia <span id="dia-conta">/);
  assert.match(docs, /document\.getElementById\('btn-o-dia'\)\.addEventListener\('click', abrirODia\)/);
  assert.match(docs, /elConta\.textContent = totalDoDia \? '· ' \+ totalDoDia : ''/,
    'ela precisa ver que há trabalho sem abrir nada');
});

function palco() {
  const ctx = {
    now: () => new Date('2026-10-23T12:00:00Z'),
    hoje: () => '2026-10-23',
    processoAtivo: (p) => !p.situacao,
    temNovidade: (p) => !!(p && p.novidadeCliente && !p.novidadeCliente.visto),
    console,
  };
  vm.createContext(ctx);
  // A constante mora fora das funções: sem ela, `pendenciasDePrestador`
  // explode em tempo de execução e o teste não chega a medir nada.
  const linhaConst = docs.match(/const DIAS_PARA_COBRAR_PRESTADOR = \d+;/)[0];
  assert.ok(linhaConst, 'falta a constante de dias');
  vm.runInContext(
    linhaConst + '\n' +
    corpoDe('function diasDesde(iso)') + '\n' +
    corpoDe('function pendenciasDePrestador(lista)') + '\n' +
    corpoDe('function oQuePrecisaDeMimHoje()'), ctx);
  return ctx;
}

const base = (extra) => ({ id: 'p' + Math.random(), clienteNome: 'Cliente', status: 'Recebendo documentos',
  boasVindasEnviada: true, prazos: [], ...extra });

test('junta só o que precisa de alguém hoje', () => {
  const ctx = palco();
  ctx.processos = [
    base({ clienteNome: 'Prazo', prazos: [{ tipo: 'RFE', data: '2026-10-25' }] }),
    base({ clienteNome: 'Venceu', prazos: [{ tipo: 'RFE', data: '2026-10-01' }] }),
    base({ clienteNome: 'Longe', prazos: [{ tipo: 'RFE', data: '2026-12-01' }] }),
    base({ clienteNome: 'Feito', prazos: [{ tipo: 'RFE', data: '2026-10-24', concluidoEm: '2026-10-20' }] }),
    base({ clienteNome: 'SemBoasVindas', boasVindasEnviada: false }),
    base({ clienteNome: 'SemRetorno', semRetorno: true, semRetornoDesde: '2026-10-01' }),
    base({ clienteNome: 'Autorizacao', status: 'Aguardando autorização financeira' }),
    base({ clienteNome: 'Protocolar', status: 'Liberado para protocolo' }),
    base({ clienteNome: 'SemRecibo', status: 'Protocolado' }),
    base({ clienteNome: 'ComRecibo', status: 'Protocolado', protocolo: { recibo: 'IOE123' } }),
    base({ clienteNome: 'Pausado', situacao: 'pausado', semRetorno: true }),
  ];
  const d = ctx.oQuePrecisaDeMimHoje();
  assert.equal(JSON.stringify(d.prazos.map(x => x.p.clienteNome)), '["Venceu","Prazo"]',
    'o que venceu vem primeiro; o que está longe e o concluído ficam de fora');
  assert.equal(d.boasVindas.length, 1);
  assert.equal(d.autorizacao.length, 1);
  assert.equal(d.protocolar.length, 1);
  assert.equal(JSON.stringify(d.semRecibo.map(x => x.clienteNome)), '["SemRecibo"]',
    'quem já tem recibo não é pendência');
  assert.equal(JSON.stringify(d.semRetorno.map(x => x.clienteNome)), '["SemRetorno"]',
    'processo pausado não entra no dia de ninguém');
});

test('pendência de prestador: só depois de 7 dias, e o mais antigo primeiro', () => {
  const ctx = palco();
  const ha = (n) => new Date(Date.UTC(2026, 9, 23 - n, 12)).toISOString();
  ctx.processos = [
    base({ clienteNome: 'Trad10', traducao: { status: 'enviado', enviadoEm: ha(10), prestadorNome: 'Ana', prestadorId: 'a1' } }),
    base({ clienteNome: 'Trad3', traducao: { status: 'enviado', enviadoEm: ha(3), prestadorNome: 'Ana', prestadorId: 'a1' } }),
    base({ clienteNome: 'TradOk', traducao: { status: 'enviado', enviadoEm: ha(20), prestadorNome: 'Ana', confirmadoPeloPrestador: true } }),
    base({ clienteNome: 'TradVolta', traducao: { status: 'recebido', enviadoEm: ha(30), prestadorNome: 'Ana' } }),
    base({ clienteNome: 'Laudo15', avaliacaoPsicologica: { necessaria: true, status: 'agendada', dataConsulta: ha(15), prestadorNome: 'Cláudia', prestadorId: 'c1' } }),
    base({ clienteNome: 'LaudoPronto', avaliacaoPsicologica: { necessaria: true, status: 'laudo_recebido', dataConsulta: ha(30) } }),
  ];
  const r = ctx.pendenciasDePrestador();
  assert.equal(JSON.stringify(r.map(x => x.p.clienteNome)), '["Laudo15","Trad10"]');
  assert.equal(r[0].tipo, 'Laudo');
  assert.equal(r[1].dias, 10);
  assert.ok(!r.some(x => x.p.clienteNome === 'TradOk'), 'prestador que já confirmou não é cobrado');
  assert.ok(!r.some(x => x.p.clienteNome === 'TradVolta'), 'tradução que já voltou não é cobrada');
});

test('cobrar todos manda UMA mensagem por prestador, com todos os casos dele', () => {
  // A tradutora com seis casos parados recebe um WhatsApp listando os seis,
  // não seis WhatsApps.
  const corpo = corpoDe('async function cobrarTodosOsPrestadores(botao, pendencias)');
  assert.match(corpo, /const porPrestador = new Map\(\)/);
  assert.match(corpo, /itens\.map\(x=> `• \$\{x\.p\.clienteNome\} \(\$\{x\.tipo\}, há \$\{x\.dias\} dias\)`\)\.join/,
    'a mensagem lista os casos, um por linha');
  assert.match(corpo, /setor:'documentacao'/, 'sai pelo número da Documentação');
  assert.match(corpo, /Cada um recebe UMA mensagem/, 'a confirmação diz exatamente o que vai acontecer');
  assert.match(corpo, /sem WhatsApp cadastrado/, 'prestador sem telefone é contado como falha, não ignorado');
  assert.match(corpo, /x\.p\.historico\.push/, 'a cobrança fica no histórico de cada ficha');
  assert.match(corpo, /falhas\.length \? ` \$\{falhas\.length\} não deu/,
    'envio em lote que falha pela metade precisa dizer quantos e por quê');
});

test('cobrar todos, rodando: uma mensagem por prestador, com todos os casos', async () => {
  const enviadas = [];
  const ctx = {
    now: () => new Date('2026-10-23T12:00:00Z'),
    sessao: { nome: 'Tatiane' }, console,
    DIAS_PARA_COBRAR_PRESTADOR: 7,
    toast: () => {}, saveProcessos: async () => null,
    LW: { confirmar: async () => true,
          api: async (_, o) => { enviadas.push(o.body); return { ok: true }; } },
    prestadores: [{ id: 'a1', nome: 'Ana', telefone: '+14075550110' },
                  { id: 'c1', nome: 'Cláudia', telefone: '+14075550222' },
                  { id: 'z9', nome: 'Zilda', telefone: '' }],
  };
  vm.createContext(ctx);
  vm.runInContext(corpoDe('async function cobrarTodosOsPrestadores(botao, pendencias)'), ctx);

  const ficha = (nome) => ({ clienteNome: nome, historico: [] });
  const maria = ficha('Maria'), joao = ficha('João'), edna = ficha('Edna'), bia = ficha('Bia');
  const botao = { disabled: false, textContent: '💬 Cobrar todos' };
  await ctx.cobrarTodosOsPrestadores(botao, [
    { p: maria, tipo: 'Tradução', quem: 'Ana', prestadorId: 'a1', dias: 12 },
    { p: joao,  tipo: 'Tradução', quem: 'Ana', prestadorId: 'a1', dias: 9 },
    { p: edna,  tipo: 'Laudo',    quem: 'Cláudia', prestadorId: 'c1', dias: 20 },
    { p: bia,   tipo: 'Laudo',    quem: 'Zilda', prestadorId: 'z9', dias: 8 },
  ]);

  assert.equal(enviadas.length, 2, 'Ana tem 2 casos e recebe UMA mensagem; Zilda não tem WhatsApp');
  const paraAna = enviadas.find(e => e.telefone === '+14075550110');
  assert.match(paraAna.texto, /• Maria \(Tradução, há 12 dias\)/);
  assert.match(paraAna.texto, /• João \(Tradução, há 9 dias\)/, 'os dois casos na mesma mensagem');
  assert.equal(paraAna.setor, 'documentacao');
  assert.equal(maria.historico.length, 1, 'cada ficha cobrada registra');
  assert.equal(joao.historico.length, 1);
  assert.equal(bia.historico.length, 0, 'prestador sem WhatsApp não gera registro de envio');
  assert.equal(botao.disabled, false, 'o botão volta ao fim');
});

test('o painel não inventa: sem pendência, diz que o dia está limpo', () => {
  const corpo = corpoDe('function abrirODia()');
  assert.match(corpo, /Nada pendente\. Dia limpo\./);
  assert.match(corpo, /Só o que precisa de alguém hoje/);
  // `openDrawer` é o nome real nesta tela. Escrevi `abrirDrawer` e clicar numa
  // linha do painel não fazia nada — nenhum teste pegou, porque nenhum rodava.
  assert.match(corpo, /openDrawer\(b\.getAttribute\("data-ir"\)\)/,
    'cada linha abre a ficha: senão ela tem que procurar o processo de novo');
  assert.ok(/function openDrawer/.test(docs), 'e a função tem que existir com esse nome');
});
