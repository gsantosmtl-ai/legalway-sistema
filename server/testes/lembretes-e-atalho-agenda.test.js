// Dois itens da lista dela:
//
//  · "precisamos colocar um popup que sempre vai subir uma notificacao para
//     todo mundo quando tiver uma atividade, por exemplo; follow up agora,
//     ligacao em 15 minutos, como se fosse lembretes, cliente assinou o
//     contrato, (como se fosse antigamente do MSN que subia o popup no canto
//     da tela)"
//  · "no funil comercial tem que ter um atalho de agenda que abra de forma
//     resumida no canto aparecendo quais ligacoes, follow up compromissos tem
//     para hoje"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { montarLembretes, minutosAgora, ANTES_MIN, DEPOIS_MIN, ASSINADO_MIN } =
  await import('../src/lembretes.js');

const fc = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');
const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');

function corpoDe(fonte, assinatura) {
  const ini = fonte.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < fonte.length; i++) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return fonte.slice(ini, fim);
}

// 14:30 em Nova York, num dia de horário de verão (UTC-4) -> 18:30 UTC
const AGORA = new Date('2026-10-23T18:30:00.000Z');
const HOJE = '2026-10-23';
const evento = (extra) => ({ id: 'ag1', data: HOJE, status: 'Agendada', tipo: 'Ligação',
  cliente: 'Neilson', vendedor: 'Renato', leadId: 'ld1', ...extra });

// ---------- o que merece aviso ----------
test('a hora é a do escritório, não a do relógio UTC do servidor', () => {
  // Orlando está 4 horas atrás: em UTC já seriam 18:30, e um compromisso das
  // 14:45 pareceria ter passado há quase quatro horas.
  assert.equal(minutosAgora(AGORA), 14 * 60 + 30);
});

test('ligação daqui a 15 minutos avisa, com o texto que ela pediu', () => {
  const [l] = montarLembretes([evento({ hora: '14:45' })], [], AGORA);
  assert.equal(l.titulo, 'Ligação em 15 minutos');
  assert.equal(l.texto, 'Neilson');
  assert.equal(l.para, 'Renato', 'é compromisso dele, não de todo mundo');
  assert.equal(l.link, 'funil-comercial.html?abrir=ld1');
  assert.equal(l.urgente, false);
});

test('compromisso na hora exata é urgente e fala "agora"', () => {
  const [l] = montarLembretes([evento({ hora: '14:30', tipo: 'Videochamada' })], [], AGORA);
  assert.equal(l.titulo, 'Videochamada agora');
  assert.equal(l.urgente, true);
});

test('quem acabou de perder a hora ainda é avisado', () => {
  const [l] = montarLembretes([evento({ hora: '14:25' })], [], AGORA);
  assert.equal(l.urgente, true, 'já passou: não pode sumir sozinho da tela');
});

test('fora da janela não avisa', () => {
  const longe = montarLembretes([evento({ hora: '14:46' })], [], AGORA);   // 16 min
  const velho = montarLembretes([evento({ hora: '14:19' })], [], AGORA);   // 11 min atrás
  assert.equal(longe.length, 0, `a janela para frente é de ${ANTES_MIN} minutos`);
  assert.equal(velho.length, 0, `e para trás, de ${DEPOIS_MIN}`);
});

test('compromisso de outro dia, cancelado ou já feito não avisa', () => {
  assert.equal(montarLembretes([evento({ hora: '14:35', data: '2026-10-24' })], [], AGORA).length, 0);
  assert.equal(montarLembretes([evento({ hora: '14:35', status: 'Cancelada' })], [], AGORA).length, 0);
  assert.equal(montarLembretes([evento({ hora: '14:35', status: 'Realizada' })], [], AGORA).length, 0);
});

test('compromisso sem hora não avisa em vez de quebrar', () => {
  assert.equal(montarLembretes([evento({ hora: '' })], [], AGORA).length, 0);
  assert.equal(montarLembretes([evento({ hora: null })], [], AGORA).length, 0);
});

test('bloco vindo bagunçado não derruba o aviso', () => {
  assert.deepEqual(montarLembretes(null, null, AGORA), []);
  assert.deepEqual(montarLembretes([null, undefined], [null], AGORA), []);
});

test('contrato assinado avisa TODO MUNDO', () => {
  const assinado = new Date(AGORA.getTime() - 5 * 60000).toISOString();
  // O contrato TEM vendedor: é justamente por isso que o teste prova algo.
  // Sem este campo, "avisa só o vendedor" daria no mesmo que "avisa todos" e o
  // teste passaria dos dois jeitos.
  const [l] = montarLembretes([], [{ id: 'c1', cliente: 'Neilson', servico: 'EB-2 NIW',
    vendedor: 'Renato', etapa: 'Assinado', dataAssinatura: assinado }], AGORA);
  assert.equal(l.titulo, 'Contrato assinado 🎉');
  assert.match(l.texto, /Neilson assinou — EB-2 NIW/);
  assert.equal(l.para, null, 'notícia do escritório, não só de quem vendeu');
  assert.equal(l.link, 'contratos.html?abrir=c1');
});

test('assinatura de ontem não sobe na tela hoje', () => {
  const antigo = new Date(AGORA.getTime() - (ASSINADO_MIN + 5) * 60000).toISOString();
  assert.equal(montarLembretes([], [{ id: 'c1', etapa: 'Assinado', dataAssinatura: antigo }], AGORA).length, 0);
});

test('contrato sem data de assinatura não avisa', () => {
  assert.equal(montarLembretes([], [{ id: 'c1', etapa: 'Assinado' }], AGORA).length, 0);
});

test('o id do lembrete é estável — o popup não sobe de novo a cada busca', () => {
  const a = montarLembretes([evento({ hora: '14:40' })], [], AGORA)[0].id;
  const b = montarLembretes([evento({ hora: '14:40' })], [], new Date(AGORA.getTime() + 30000))[0].id;
  assert.equal(a, b, 'meio minuto depois é o MESMO lembrete');
});

test('os avisos saem na ordem das horas', () => {
  const itens = montarLembretes([
    evento({ id: 'b', hora: '14:40' }),
    evento({ id: 'a', hora: '14:32' }),
  ], [], AGORA);
  assert.equal(JSON.stringify(itens.map(i => i.hora)), JSON.stringify(['14:32', '14:40']));
});

// ---------- a rota ----------
test('a rota existe, exige login e guarda em cache', () => {
  const fonte = readFileSync(new URL('../src/lembretes.js', import.meta.url), 'utf8');
  assert.match(fonte, /rotasLembretes\.get\('\/lembretes', exigirLogin/, 'lembrete é dado de pessoa logada');
  assert.match(fonte, /agora - cache\.quando > CACHE_MS/, 'sem cache, cada aba aberta leria os blocos inteiros');
  assert.match(fonte, /filter\(\(i\) => !i\.para \|\| i\.para === nome\)/, 'filtrado por quem pede');
  const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(index, /app\.use\('\/api', rotasLembretes\)/, 'e está ligada no servidor');
});

// ---------- o popup ----------
test('o popup liga sozinho, e só nas telas internas', () => {
  assert.match(comum, /LW\.ligarLembretes = function/);
  assert.match(comum, /document\.getElementById\('side-nav'\) && LW\.sessaoAtual\(\) && LW\.ligarLembretes/,
    'no login e nos portais não há sessão: a busca daria 401 em ciclo');
});

test('o popup fica abaixo das caixas de pergunta', () => {
  // as caixas de pergunta são a última palavra e não podem ser cobertas
  const corpo = corpoDe(comum, 'function pilhaDeLembretes()');
  assert.match(corpo, /z-index:8000/);
  assert.ok(comum.includes('z-index:9000'), 'as caixas de pergunta continuam em 9000');
});

test('lembrete urgente não se apaga sozinho', () => {
  const corpo = corpoDe(comum, 'function mostrarLembrete(l)');
  assert.match(corpo, /if\(!l\.urgente\) setTimeout\(sair/,
    'o que já está na hora é justamente o que não pode passar batido');
  assert.match(corpo, /lw-lembrete-x/, 'mas sempre dá para fechar na mão');
});

test('o mesmo lembrete não sobe duas vezes, nem depois de recarregar', () => {
  const corpo = corpoDe(comum, 'async function buscarLembretes()');
  assert.match(corpo, /vistos\.has\(l\.id\)/);
  assert.match(corpo, /marcarLembreteVisto\(l\.id\)/);
  const guarda = corpoDe(comum, 'function marcarLembreteVisto(id)');
  assert.match(guarda, /localStorage/, 'recarregar a página não repete o aviso');
  assert.match(guarda, /slice\(-60\)/, 'e a chave não cresce para sempre');
  assert.match(guarda, /catch/, 'aba privada não derruba o aviso');
});

test('o texto do lembrete é escapado', () => {
  const corpo = corpoDe(comum, 'function mostrarLembrete(l)');
  assert.match(corpo, /esc\(l\.titulo\)/);
  assert.match(corpo, /esc\(l\.texto\)/);
  assert.match(corpo, /esc\(l\.link\)/);
});

// ---------- o atalho da agenda no funil ----------
function doDiaNoFunil(leads, agenda, eu) {
  const ctx = {
    agenda, leads,
    visibleLeads: () => leads,
    euSou: () => eu,
    hoje: () => HOJE,
  };
  vm.createContext(ctx);
  new vm.Script(corpoDe(fc, 'function compromissosDeHoje()')
    + '\nvar r = JSON.stringify(compromissosDeHoje());').runInContext(ctx);
  return JSON.parse(ctx.r);
}

test('o atalho existe no canto, e abaixo do drawer', () => {
  assert.match(fc, /id="atalho-agenda"/);
  assert.match(fc, /id="painel-agenda-hoje"/);
  const i = fc.indexOf('id="atalho-agenda"');
  assert.match(fc.slice(i - 400, i + 400), /z-index:35/,
    'acima do quadro, abaixo do drawer (40) e dos modais (50)');
});

test('o atalho mostra as ligações, follow-ups e compromissos de hoje, por hora', () => {
  const itens = doDiaNoFunil(
    [{ id: 'ld1', nome: 'Neilson', followups: [] }],
    [ { id: 'a', data: HOJE, hora: '16:00', tipo: 'Videochamada', cliente: 'Neilson', leadId: 'ld1', status: 'Agendada' },
      { id: 'b', data: HOJE, hora: '09:30', tipo: 'Ligação', cliente: 'Neilson', leadId: 'ld1', status: 'Agendada' } ],
    'Renato');
  assert.equal(JSON.stringify(itens.map(i => i.hora)), JSON.stringify(['09:30', '16:00']));
  assert.equal(itens[0].tipo, 'Ligação');
});

test('compromisso de lead de outro vendedor não entra', () => {
  const itens = doDiaNoFunil(
    [{ id: 'ld1', nome: 'Neilson', followups: [] }],
    [{ id: 'a', data: HOJE, hora: '10:00', tipo: 'Ligação', cliente: 'Outro', leadId: 'ld-do-adriano', status: 'Agendada' }],
    'Renato');
  assert.equal(itens.length, 0);
});

test('follow-up sem compromisso próprio ainda aparece', () => {
  // lead criado antes de cada follow-up ganhar o seu evento de agenda
  const itens = doDiaNoFunil(
    [{ id: 'ld1', nome: 'Neilson', followups: [{ id: 'f1', data: HOJE, hora: '11:00', tipo: 'WhatsApp', status: 'pendente' }] }],
    [], 'Renato');
  assert.equal(itens.length, 1);
  assert.equal(itens[0].tipo, 'WhatsApp');
});

test('o follow-up que já tem compromisso não aparece duas vezes', () => {
  const itens = doDiaNoFunil(
    [{ id: 'ld1', nome: 'Neilson', followups: [{ id: 'f1', data: HOJE, hora: '11:00', tipo: 'Ligação', status: 'pendente', agendaEventoId: 'a' }] }],
    [{ id: 'a', data: HOJE, hora: '11:00', tipo: 'Ligação', cliente: 'Neilson', leadId: 'ld1', status: 'Agendada' }],
    'Renato');
  assert.equal(itens.length, 1);
});

test('lead antigo, com proximaAcao e sem lista, também aparece', () => {
  const itens = doDiaNoFunil(
    [{ id: 'ld1', nome: 'Antigo', proximaAcao: { data: HOJE, hora: '15:00', tipo: 'Contato' } }],
    [], 'Renato');
  assert.equal(itens.length, 1);
  assert.equal(itens[0].tipo, 'Contato');
});

test('compromisso cancelado e de outro dia ficam fora', () => {
  const itens = doDiaNoFunil([{ id: 'ld1', nome: 'N', followups: [] }],
    [ { id: 'a', data: HOJE, hora: '10:00', leadId: 'ld1', status: 'Cancelada' },
      { id: 'b', data: '2026-10-24', hora: '10:00', leadId: 'ld1', status: 'Agendada' } ],
    'Renato');
  assert.equal(itens.length, 0);
});

test('o compromisso já realizado aparece marcado como feito, não escondido', () => {
  const itens = doDiaNoFunil([{ id: 'ld1', nome: 'N', followups: [] }],
    [{ id: 'a', data: HOJE, hora: '10:00', tipo: 'Ligação', cliente: 'N', leadId: 'ld1', status: 'Realizada' }],
    'Renato');
  assert.equal(itens.length, 1, 'ver o que já foi feito é parte de saber como vai o dia');
  assert.equal(itens[0].feito, true);
});
