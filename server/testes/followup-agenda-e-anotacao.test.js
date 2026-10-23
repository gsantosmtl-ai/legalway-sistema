// Lista de defeitos que a Tatiane levantou testando o fluxo inteiro:
//
//  · "aba agenda - nao esta aparecendo atualizado quando tem um compromisso"
//  · "follow up - nao esta marcando certinho na parte de agenda, ele marca
//     como ligacao, mas nao marca 1 ligacao e 1 follow up por exemplo, ou
//     4 follow up - 2 ligacoes - 2 chamadas de video"
//  · "follow up quando marcar feito - abrir um popup de anotacoes, deixe
//     registrado a conversa e deixa salvo na anotacoes"
//  · "aba follow up - botao de adicionar follow up esta muito embaixo"
//  · "aba anotacoes - as anotacoes tem que ser editaveis"
//  · "no card do lead - o valor da proposta nao aparece no card"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fc = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');
const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');

function corpoDe(fonte, assinatura) {
  const ini = fonte.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < fonte.length; i++) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return fonte.slice(ini, fim);
}

// ---------- um evento de agenda por follow-up ----------
function montarEvento(lead, followup, regras) {
  const ctx = {
    window: { LW: { regrasAgora: () => regras || {} } },
    LW: { novoId: (p) => p + '-novo' },
  };
  vm.createContext(ctx);
  new vm.Script(corpoDe(fc, 'function eventoDoFollowup(l, f)')
    + `\nvar r = JSON.stringify(eventoDoFollowup(${JSON.stringify(lead)}, ${JSON.stringify(followup)}));`)
    .runInContext(ctx);
  return JSON.parse(ctx.r);
}

const LEAD = { id: 'ld1', nome: 'Neilson', vendedor: 'Renato' };

test('cada follow-up vira um compromisso com o próprio tipo', () => {
  // era isto que estava errado: "Reunião" era regravada como "Videochamada"
  for (const tipo of ['Ligação', 'Videochamada', 'Reunião', 'WhatsApp', 'Outro']) {
    const ev = montarEvento(LEAD, { id: 'fu1', data: '2026-10-28', hora: '10:00', tipo });
    assert.equal(ev.tipo, tipo, `o tipo ${tipo} não pode ser trocado por outro`);
  }
});

test('o compromisso aponta para o lead E para o follow-up', () => {
  // o elo ficava em `l.agendaEventoId`: UM por lead, sobrescrito a cada
  // follow-up novo. Era a causa de "4 follow up" aparecerem como um só.
  const ev = montarEvento(LEAD, { id: 'fu7', data: '2026-10-28', hora: '10:00', tipo: 'Ligação' });
  assert.equal(ev.leadId, 'ld1');
  assert.equal(ev.followupId, 'fu7');
  assert.equal(ev.status, 'Agendada');
});

test('ligação usa a duração de ligação das regras; o resto, a padrão', () => {
  const regras = { agenda: { duracaoPadraoMin: 45, duracaoLigacaoMin: 10 } };
  assert.equal(montarEvento(LEAD, { id: 'f', data: '2026-10-28', hora: '9:00', tipo: 'Ligação' }, regras).duracaoMin, 10);
  assert.equal(montarEvento(LEAD, { id: 'f', data: '2026-10-28', hora: '9:00', tipo: 'Videochamada' }, regras).duracaoMin, 45);
});

test('sem regras configuradas o compromisso ainda nasce com duração', () => {
  const ev = montarEvento(LEAD, { id: 'f', data: '2026-10-28', hora: '9:00', tipo: 'Reunião' }, {});
  assert.equal(ev.duracaoMin, 30);
});

test('salvar follow-up cria um evento novo, não reaproveita o do lead', () => {
  const corpo = corpoDe(fc, 'async function salvarFollowup(id)');
  assert.match(corpo, /agenda\.push\(evento\)/, 'um evento novo entra na agenda');
  assert.match(corpo, /novoFu\.agendaEventoId = evento\.id/, 'o elo fica no follow-up');
  assert.doesNotMatch(corpo, /l\.agendaEventoId\s*=/, 'o elo não volta a ser um por lead');
  assert.doesNotMatch(corpo, /\['Reunião','Videochamada','Ligação'\]\.includes/,
    'todo follow-up entra na agenda, não só três tipos');
});

test('o rollback da gravação também tira o compromisso', () => {
  // se o lead não gravou, o compromisso não existe
  const corpo = corpoDe(fc, 'async function salvarFollowup(id)');
  assert.match(corpo, /agenda\.splice\(fora, 1\)/);
});

// ---------- a aba Agenda ----------
test('a aba Agenda lista os compromissos de verdade', () => {
  assert.doesNotMatch(fc, /Integração com a Agenda entra na próxima fase/,
    'a aba era um aviso de "próxima fase" e nunca mostrou nada');
  assert.match(fc, /function compromissosDoLead\(l\)/);
  const corpo = corpoDe(fc, 'function compromissosDoLead(l)');
  assert.match(corpo, /a\.leadId === l\.id/, 'acha pelos eventos novos');
  assert.match(corpo, /l\.agendaEventoId && a\.id === l\.agendaEventoId/, 'e pelo elo antigo, dos leads que já existiam');
});

test('a aba Agenda realmente chama a lista, e mostra data, tipo e situação', () => {
  // Sem isto, trocar a origem da lista por um array vazio passava calado: a
  // aba voltava a não mostrar nada e nenhum teste reclamava.
  const i = fc.indexOf("else if(activeDtab === 'agenda')");
  assert.ok(i > 0, 'não achei a aba Agenda');
  const ramo = fc.slice(i, fc.indexOf("else if(activeDtab ===", i + 10));
  assert.match(ramo, /compromissosDoLead\(l\)/, 'a aba tem que ler os compromissos do lead');
  assert.match(ramo, /a\.data/, 'mostra a data');
  assert.match(ramo, /a\.tipo/, 'mostra o tipo');
  assert.match(ramo, /a\.status/, 'e se está em aberto');
  assert.match(ramo, /em aberto/, 'com a contagem de quantos faltam');
});

test('a transferência leva TODOS os compromissos do lead', () => {
  const corpo = corpoDe(fc, 'async function confirmarTransferencia()');
  assert.match(corpo, /for\(const ev of compromissosDoLead\(l\)\)/,
    'antes movia só um; quem tinha três deixava dois no nome de quem saiu');
});

// ---------- marcar feito abre a anotação ----------
test('marcar o follow-up como feito pergunta o que foi conversado', () => {
  const corpo = corpoDe(fc, 'async function concluirFollowup(id, fid)');
  assert.match(corpo, /LW\.pedirAnotacao\(/, 'abre o popup');
  assert.match(corpo, /if\(anotacao === null\) return;/, 'cancelar deixa o follow-up em aberto');
  assert.match(corpo, /tipo:'Anotação'/, 'o que ele escreve entra nas Anotações, não só no histórico');
});

test('marcar feito fecha o compromisso na agenda', () => {
  const corpo = corpoDe(fc, 'async function concluirFollowup(id, fid)');
  assert.match(corpo, /ev\.status = 'Realizada'/);
});

test('o diálogo de anotação existe e é área de texto', () => {
  assert.match(comum, /LW\.pedirAnotacao = function/);
  const corpo = corpoDe(comum, 'window.LW.pedirAnotacao = function');
  assert.match(corpo, /<textarea/, 'conversa não cabe numa linha');
  assert.match(corpo, /z-index:9000/, 'no mesmo nível dos outros diálogos');
  assert.match(corpo, /metaKey \|\| e\.ctrlKey/, 'Enter quebra linha; Ctrl+Enter confirma');
});

// ---------- botão no card ----------
test('o card tem o botão de marcar follow-up feito', () => {
  assert.match(fc, /data-fu-feito=/, 'para não precisar abrir o card inteiro');
  assert.match(fc, /function followupEmAberto\(l\)/);
  const corpo = corpoDe(fc, 'function followupEmAberto(l)');
  assert.match(corpo, /status !== 'feito'/, 'pega o em aberto mais próximo');
});

test('o botão do card não arrasta a coluna nem abre o card', () => {
  const i = fc.indexOf("board.querySelectorAll('[data-fu-feito]')");
  const trecho = fc.slice(i, i + 900);
  assert.match(trecho, /e\.stopPropagation\(\)/, 'não abre o card');
  assert.match(trecho, /addEventListener\('mousedown', \(e\)=> e\.stopPropagation\(\)\)/, 'não começa a arrastar');
});

test('os três botões do card são os que ela pediu', () => {
  const corpo = corpoDe(fc, 'function renderCard(l)');
  assert.match(corpo, /✓ Follow-up feito/);
  assert.match(corpo, /\+ Tentativa/);
  assert.match(corpo, /🔔 Agendar/);
});

// ---------- o resto da lista ----------
test('o card mostra o valor negociado, não o potencial', () => {
  const corpo = corpoDe(fc, 'function renderCard(l)');
  assert.match(corpo, /card-value">\$\{fmtMoney\(\(l\.comercial\|\|\{\}\)\.valorNegociado \|\| l\.valorPotencial\)\}/);
});

test('o botão de adicionar follow-up fica abaixo da descrição, no corpo da aba', () => {
  // Medir a distância em caracteres não bastava: do rodapé para o campo de
  // descrição também são poucos caracteres. O que importa é em QUAL elemento
  // o botão está — no corpo (`body.innerHTML`), onde o vendedor acaba de
  // digitar, e não no `foot`, que fica lá embaixo no fim do drawer.
  const i = fc.indexOf("else if(activeDtab === 'followup')");
  assert.ok(i > 0, 'não achei a aba de follow-up');
  const ramo = fc.slice(i, fc.indexOf("else if(activeDtab ===", i + 10));
  const iCorpo = ramo.indexOf('body.innerHTML');
  const iRodape = ramo.indexOf('foot.innerHTML');
  const iDesc = ramo.indexOf('id="fu-desc"');
  const iBotao = ramo.indexOf('id="btn-salvar-fu"');
  assert.ok(iCorpo >= 0 && iRodape > iCorpo, 'o corpo é montado antes do rodapé');
  assert.ok(iBotao > iDesc, 'o botão vem depois do campo de descrição');
  assert.ok(iBotao < iRodape, 'e dentro do corpo da aba, não no rodapé do drawer');
  assert.doesNotMatch(ramo.slice(iRodape), /btn-salvar-fu/, 'o rodapé não tem mais o botão');
});

test('as anotações são editáveis, e a correção fica visível', () => {
  assert.match(fc, /data-editar-nota=/);
  const corpo = corpoDe(fc, 'async function editarAnotacao(id, indice)');
  assert.match(corpo, /h\.textoOriginal = h\.texto/, 'o texto de antes não se perde');
  assert.match(corpo, /h\.editadoEm =/);
  assert.match(corpo, /Object\.assign\(h, antes\)/, 'e desfaz na tela se a gravação falhar');
});

test('mensagem realmente enviada ao cliente não é editável', () => {
  const corpo = corpoDe(fc, 'function podeEditarAnotacao(h)');
  assert.doesNotMatch(corpo, /WhatsApp oficial/,
    'reescrever o texto de um WhatsApp enviado falsificaria o que o cliente recebeu');
  assert.match(corpo, /'Anotação'/);
});
