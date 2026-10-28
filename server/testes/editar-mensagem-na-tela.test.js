// Arrumar o texto das mensagens na própria tela de Automações.
//
// "Quero conseguir arrumar as configurações dos textos por aqui."
//
// A tela listava os 19 nomes e mandava para Configurações → Mensagens. Quem
// quisesse corrigir uma palavra tinha de sair, achar a mensagem de novo numa
// outra lista e voltar. Agora cada linha abre e edita ali.
//
// Três cuidados que este arquivo protege:
//   · a gravação não pode apagar o trabalho de quem mexeu em OUTRA mensagem;
//   · as chaves ({cliente}, {servico}…) precisam estar à mão, porque digitar
//     {clientte} e descobrir depois que saiu cru para o cliente é o erro caro;
//   · dá para voltar ao texto de fábrica.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');
const tela = readFileSync(join(RAIZ, 'docs/automacoes.html'), 'utf8');
const rota = readFileSync(join(RAIZ, 'server/src/waha-rotas.js'), 'utf8');

test('a rota manda o texto, o padrão e as chaves de cada mensagem', () => {
  const i = rota.indexOf('mensagens: avisos.map');
  const bloco = rota.slice(i, rota.indexOf('}),', i));
  assert.match(bloco, /template: a\.template \|\| \(g && g\.padrao\) \|\| ''/,
    'sem o texto, a tela não tem o que editar');
  assert.match(bloco, /padrao: \(g && g\.padrao\) \|\| ''/, 'para dar para voltar atrás');
  assert.match(bloco, /chaves: \(g && g\.chaves\) \|\| \[\]/, 'as variáveis daquele gatilho');
});

test('cada mensagem abre com texto, liga/desliga e botão de salvar', () => {
  for (const [o_que, re] of [
    ['a caixa de texto', /<textarea data-texto/],
    ['o liga/desliga', /<input type="checkbox" data-liga/],
    ['o botão de salvar', /<button class="primary" data-salvar>/],
    ['o voltar ao original', /data-padrao>Voltar ao texto original/],
  ]) assert.match(tela, re, `faltou ${o_que}`);
});

test('gravar uma mensagem não apaga o que foi feito nas outras', () => {
  // O erro clássico: montar a lista do que está na tela e gravar por cima.
  // Quem mexeu noutra mensagem nesse meio-tempo perde o trabalho.
  const i = tela.indexOf('async function salvarMensagem(');
  const fn = tela.slice(i, tela.indexOf('\n}', i));
  assert.match(fn, /await window\.storage\.get\(AVISOS_KEY, true\)/,
    'tem que reler o bloco na hora de gravar');
  assert.match(fn, /lista\.find\(a => a && a\.id === id\)/,
    'e mexer só no registro daquele id');
  assert.ok(!/lista = \[\];\s*$/m.test(fn) || /r && r\.value \? JSON\.parse/.test(fn),
    'a lista vem do servidor, não do que está desenhado na tela');
});

test('mensagem que não foi achada no bloco não grava nada', () => {
  const i = tela.indexOf('async function salvarMensagem(');
  const fn = tela.slice(i, tela.indexOf('\n}', i));
  assert.match(fn, /if\(!alvo\)\{[^}]*return false/,
    'sem o registro, gravar criaria lista nova e apagaria o resto');
});

test('a chave entra onde o cursor está, não no fim', () => {
  const i = tela.indexOf("bloco.querySelectorAll('[data-chave]')");
  const bloco = tela.slice(i, i + 700);
  assert.match(bloco, /area\.selectionStart/, 'quem escreve no meio da frase espera a chave ali');
  assert.match(bloco, /area\.selectionEnd = ini \+ chave\.length/,
    'e o cursor fica depois do que foi inserido');
});

test('salvar não fecha a mensagem que acabou de ser editada', () => {
  const i = tela.indexOf('[data-salvar]');
  const bloco = tela.slice(i, i + 900);
  assert.ok(!/pintarEstadoDasAutomacoes\(\)/.test(bloco),
    'redesenhar a lista inteira fecharia o item na cara de quem editou');
  assert.match(bloco, /bolinha\.style\.background/, 'repinta só o que mudou');
});

test('o texto da mensagem passa pelo escape ao ser desenhado', () => {
  // O texto vem do banco e pode ter sido digitado por qualquer pessoa.
  assert.match(tela, /<textarea data-texto[^>]*>\$\{LW\.escaparHtml\(x\.template\|\|''\)\}/);
  assert.match(tela, /data-padrao="\$\{LW\.escaparHtml\(x\.padrao\|\|''\)\}"/);
});
