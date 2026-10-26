// "Preciso que tenha uma aba após o Resumo: Anotações, e registre igual do
// comercial."
//
// O vendedor já tinha isso no funil: escreve o que conversou e fica datado e
// assinado. Quem cuida da documentação falava com o mesmo cliente e não tinha
// onde escrever — "ligou hoje, o passaporte da filha só fica pronto dia 10"
// vivia no WhatsApp de alguém.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const funil = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');

test('a aba fica logo depois do Resumo', () => {
  const i = docs.indexOf('data-dtab="resumo"');
  const j = docs.indexOf('data-dtab="anotacoes"');
  const k = docs.indexOf('data-dtab="checklist"');
  assert.ok(i > 0 && j > i && j < k, 'Resumo, depois Anotações, depois Checklist');
  assert.match(docs, /data-dtab="anotacoes">📝 Anotações<\/div>/);
});

test('registra do mesmo jeito que o comercial', () => {
  // Mesma forma no histórico: tipo, quando, texto e quem. É o que permite um
  // dia juntar as duas conversas numa linha do tempo só.
  // A quebra de linha entrou quando a anotação ganhou `mencoes` — quem foi
  // marcado com @. A FORMA é a mesma; o que mudou foi só onde o editor quebrou.
  const forma = /\{ ?tipo: ?'Anotação', quando: now\(\)\.toISOString\(\), texto,\s*quem/;
  assert.match(docs, forma, 'a anotação da documentação');
  assert.match(docs, /mencoes: marcados/, 'e guarda quem foi marcado com @');
  assert.match(funil, /\{tipo:'Anotação', quando: now\(\)\.toISOString\(\), texto, quem: euSou\(\)\}/,
    'a do comercial, que serviu de modelo');
});

test('é fato datado, não campo que se sobrescreve', () => {
  // Um campo "observações" guarda a última versão e perde a anterior — e a
  // conversa de ontem é justamente o que explica a de hoje.
  const i = docs.indexOf('async function salvarAnotacaoDoc(id)');
  const corpo = docs.slice(i, docs.indexOf('\n}', i));
  assert.match(corpo, /p\.historico\.push\(/, 'acrescenta');
  assert.ok(!/p\.observacao\s*=|p\.anotacao\s*=/.test(corpo), 'não sobrescreve nenhum campo');
});

test('se a gravação falhar, a anotação não fica fantasma na tela', () => {
  // Anotação que some em silêncio é pior do que anotação não escrita: a pessoa
  // acha que registrou.
  const i = docs.indexOf('async function salvarAnotacaoDoc(id)');
  const corpo = docs.slice(i, docs.indexOf('\n}', i));
  assert.match(corpo, /const erro = await saveProcessos\(\);/);
  assert.match(corpo, /if\(erro\)\{\s*\n\s*p\.historico\.pop\(\);/, 'desfaz da lista');
  assert.match(corpo, /toast\('NÃO registrei a anotação — ' \+ erro\)/, 'e avisa');
});

test('texto vazio não vira anotação', () => {
  const i = docs.indexOf('async function salvarAnotacaoDoc(id)');
  const corpo = docs.slice(i, docs.indexOf('\n}', i));
  assert.match(corpo, /if\(!texto\)\{ toast\('Escreva o que aconteceu antes de registrar\.'\); campo\.focus\(\); return; \}/,
    'e devolve o cursor para o campo');
});

test('a aba mostra só as conversas; o rastro do sistema fica no Histórico', () => {
  // Misturar "mudou de etapa" com "ligou hoje" faz as duas coisas sumirem uma
  // no meio da outra.
  const i = docs.indexOf("else if(activeDtab === 'anotacoes')");
  const corpo = docs.slice(i, docs.indexOf("else if(activeDtab === 'historico')", i));
  assert.match(corpo, /\(p\.historico\|\|\[\]\)\.filter\(h=> h\.tipo === 'Anotação'\)/);
  assert.match(corpo, /\.reverse\(\)/, 'a mais recente em cima');
  // `comMencoes` escapa o texto ANTES de destacar o @ — a garantia é a mesma,
  // e anotacao-com-arroba.test.js prova que o HTML digitado não sai vivo.
  assert.match(corpo, /comMencoes\(h\.texto\)/, 'o que a pessoa escreveu é escapado antes de virar HTML');
  const mc = docs.indexOf('function comMencoes(texto)');
  assert.match(docs.slice(mc, docs.indexOf('\n}', mc)), /let html = esc\(texto\);/,
    'escapar primeiro, destacar depois — nunca o contrário');
  assert.match(corpo, /Nenhuma anotação ainda\. Escreva a primeira acima\./);
});
