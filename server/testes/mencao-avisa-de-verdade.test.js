// A menção tem que CHEGAR em quem foi marcado.
//
// Ela: "a funcionalidade de selecionar e marcar a pessoa já funciona. O
// problema é que a notificação não está chegando ao destinatário."
//
// Faltava o popup no canto da tela — o mesmo que já avisa compromisso e
// contrato assinado. A mensagem no chat já saía; o aviso visível, não.
//
// O aviso é DERIVADO da própria anotação (`historico[].mencoes`), não um
// registro novo. Assim não existe aviso órfão de anotação apagada, e quem
// estava offline recebe ao voltar — o item continua na lista enquanto estiver
// dentro da janela, e a tela guarda os ids já mostrados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// db.js só exige que a variável exista; nada aqui toca o banco.
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';
const { montarLembretes } = await import('../src/lembretes.js');

const AGORA = new Date('2026-10-26T12:00:00Z');
const anotacao = (extra = {}) => ({
  tipo: 'Anotação', quando: '2026-10-26T11:30:00Z', texto: 'cliente ligou hoje, @Vitória confere',
  quem: 'Tatiane', mencoes: ['Vitória'], ...extra,
});
const ficha = (extra = {}) => ({ id: 'p1', clienteNome: 'Monica Kramer', servico: 'Visto T',
  historico: [anotacao()], ...extra });

const mencoes = (processos) =>
  montarLembretes([], [], AGORA, undefined, processos).filter((i) => i.tipo === 'mencao');

test('quem foi marcado recebe o aviso', () => {
  const r = mencoes([ficha()]);
  assert.equal(r.length, 1);
  assert.equal(r[0].para, 'Vitória');
  assert.match(r[0].titulo, /Tatiane marcou você/);
  assert.match(r[0].texto, /Monica Kramer/, 'tem que dizer de qual cliente é');
  assert.match(r[0].texto, /cliente ligou hoje/, 'e trazer um trecho da anotação');
});

test('o link abre o card na aba Anotações', () => {
  // Largar a pessoa no quadro para procurar qual card era é o mesmo que não
  // avisar.
  const r = mencoes([ficha()]);
  assert.equal(r[0].link, 'documentos.html?abrir=p1&aba=anotacoes');
});

test('duas pessoas marcadas, dois avisos distintos', () => {
  const r = mencoes([ficha({ historico: [anotacao({ mencoes: ['Vitória', 'Elaine'] })] })]);
  assert.deepEqual(r.map((i) => i.para).sort(), ['Elaine', 'Vitória']);
  assert.notEqual(r[0].id, r[1].id, 'ids iguais fariam uma sumir na deduplicação da tela');
});

test('o id é estável: o mesmo aviso não sobe duas vezes', () => {
  // A tela guarda os ids já mostrados. Id que muda a cada busca faria o popup
  // subir de novo a cada meio minuto — foi por isso que o id dos compromissos
  // carrega a hora, e não o instante do aviso.
  const a = mencoes([ficha()])[0].id;
  const b = montarLembretes([], [], new Date('2026-10-26T12:05:00Z'), undefined, [ficha()])
    .filter((i) => i.tipo === 'mencao')[0].id;
  assert.equal(a, b);
  assert.match(a, /^mencao:p1:2026-10-26T11:30:00Z:Vitória$/);
});

test('quem marca a si mesmo RECEBE o lembrete — é follow-up', () => {
  // MUDOU em 30/10/2026, a pedido da equipe por áudio: "o Renato fez uma
  // simulação num dos clientes dele para fazer um follow-up, botando uma
  // anotação no arroba. Isso não está indo para o painelzinho dos lembretes".
  //
  // Antes isto esperava 0, pela regra "ninguém se avisa sozinho". A regra
  // continua certa no CHAT (mandar mensagem para si é eco), e estava errada
  // aqui: o painel de lembretes é justamente onde um recado para si serve.
  const r = mencoes([ficha({ historico: [anotacao({ quem: 'Vitória' })] })]);
  assert.equal(r.length, 1, 'o follow-up que a pessoa deixou para si sumiu');
  assert.match(r[0].titulo, /Seu lembrete/);
});

test('anotação antiga demais para de avisar', () => {
  // Três dias: quem estava de folga recebe ao voltar; o quadro não vira um
  // mural de avisos de um mês atrás.
  const velha = anotacao({ quando: '2026-10-20T11:30:00Z' });
  assert.equal(mencoes([ficha({ historico: [velha] })]).length, 0);
  const ontem = anotacao({ quando: '2026-10-25T11:30:00Z' });
  assert.equal(mencoes([ficha({ historico: [ontem] })]).length, 1, 'ontem ainda avisa');
});

test('anotação no futuro não avisa', () => {
  // Relógio errado em alguma máquina não pode gerar aviso perpétuo.
  const futura = anotacao({ quando: '2026-10-27T11:30:00Z' });
  assert.equal(mencoes([ficha({ historico: [futura] })]).length, 0);
});

test('ficha cancelada não gera aviso', () => {
  assert.equal(mencoes([ficha({ situacao: 'cancelado' })]).length, 0);
});

test('histórico comum não vira menção', () => {
  // Só `tipo: 'Anotação'` com `mencoes` conta. O rastro do sistema — mudou de
  // etapa, documento aprovado — não pode subir popup para ninguém.
  const f = ficha({ historico: [
    { quando: '2026-10-26T11:30:00Z', texto: 'Documentação marcada como completa' },
    { tipo: 'Anotação', quando: '2026-10-26T11:30:00Z', texto: 'sem marcação', quem: 'Tatiane' },
    { tipo: 'Anotação', quando: '2026-10-26T11:30:00Z', texto: 'lista errada', quem: 'T', mencoes: 'texto' },
  ] });
  assert.equal(mencoes([f]).length, 0);
});

test('lixo nos blocos não derruba a montagem', () => {
  // Esta função serve a TODO mundo que abre qualquer tela: se ela explodir,
  // ninguém recebe aviso nenhum, de nada.
  assert.doesNotThrow(() => montarLembretes([], [], AGORA, undefined, null));
  assert.doesNotThrow(() => montarLembretes([], [], AGORA, undefined, [null, 'texto', {}]));
  assert.doesNotThrow(() => montarLembretes([], [], AGORA, undefined, [{ id: 'x', historico: 'nao-e-lista' }]));
});

test('a rota passa os processos para a montagem', () => {
  // Sem isto a função receberia lista vazia e nenhuma menção viraria aviso —
  // exatamente o sintoma que ela relatou.
  const fonte = readFileSync(new URL('../src/lembretes.js', import.meta.url), 'utf8');
  assert.match(fonte, /ler\('legalway-processos-documentacao-v1'\)/);
  assert.match(fonte, /montarLembretes\(ag \? ag\.valor : \[\], ct \? ct\.valor : \[\],\s*new Date\(\), undefined, pr \? pr\.valor : \[\]\)/);
});

test('o link do endereço leva a aba, e insiste até a tela estar pronta', () => {
  // Já existia um mecanismo de `?abrir=<id>` no comum.js, usado pela busca
  // global e pelos links do chat. Eu tinha escrito um segundo dentro do
  // documentos.html, e os dois brigavam: o meu abria na aba certa e o de lá,
  // 900ms depois, reabria sem aba e jogava a pessoa no Resumo.
  //
  // Agora é um mecanismo só, e ele ganhou duas coisas: leva a aba, e insiste
  // em vez de confiar num timeout fixo — 900ms falha EM SILÊNCIO quando a tela
  // demora mais que isso para carregar os registros.
  const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
  const i = comum.indexOf("const alvo = q.get('abrir')");
  const corpo = comum.slice(i, comum.indexOf('\n    }', i));
  assert.match(corpo, /window\[fn\]\(alvo, aba\)/, 'a aba tem que ir junto');
  assert.match(corpo, /!== false/, 'a tela avisa quando ainda não está pronta');
  assert.match(corpo, /tentativas < 20/, 'insiste em vez de desistir calado');
  assert.match(corpo, /history\.replaceState/, 'recarregar não pode reabrir a ficha para sempre');

  const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
  assert.ok(!tela.includes('abrirPeloEndereco'),
    'o segundo mecanismo não pode voltar: eram dois abrindo a mesma ficha');
});

test('openDrawer devolve false enquanto a ficha não chegou', () => {
  // É isso que faz o "insiste" funcionar. Sem o aviso, o link abriria uma
  // gaveta vazia e a pessoa concluiria que o processo sumiu.
  const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
  const i = tela.indexOf('function openDrawer(id, aba)');
  const corpo = tela.slice(i, tela.indexOf('\n}', i));
  assert.match(corpo, /if\(!\(processos \|\| \[\]\)\.some\(x => x && x\.id === id\)\) return false;/);
});

test('openDrawer recusa aba que não existe, em vez de abrir em branco', () => {
  const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
  const i = tela.indexOf('function openDrawer(id, aba)');
  const corpo = tela.slice(i, tela.indexOf('\n}', i));
  assert.match(corpo, /abas\.includes\(aba\)\) \? aba : 'resumo'/);
});
