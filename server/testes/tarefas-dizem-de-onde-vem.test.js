// "Ainda não entendi a funcionalidade, tem algo aqui que é integrado com
// alguma parte do sistema? ou não."
//
// Está integrada por quatro caminhos, todos do servidor. A tela não contava
// nenhum: quem abria via quatro zeros, um quadro vazio e dois botões de teste,
// e concluía que não servia para nada.
//
// O cuidado deste arquivo é que o bloco não MINTA: cada fonte que aparece aqui
// tem que existir de verdade no servidor, e a contagem de cada uma tem que ler
// o campo que aquela fonte realmente grava.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');
const tela = readFileSync(join(RAIZ, 'docs/tarefas.html'), 'utf8');
const src = (f) => readFileSync(join(RAIZ, 'server/src', f), 'utf8');

test('a tela diz que se enche sozinha', () => {
  assert.match(tela, /Esta tela se enche sozinha/);
  assert.match(tela, /renderDeOndeVem\(\)/, 'o bloco precisa ser desenhado no render');
});

test('cada fonte que a tela promete existe mesmo no servidor', () => {
  assert.match(src('primeiro-contato.js'), /origem: 'primeiro-contato'/,
    'a tela promete tarefa de lead novo');
  assert.match(src('uscis.js'), /origem: 'uscis'/, 'a tela promete tarefa de status do USCIS');
  assert.match(src('prazos.js'), /origem: 'prazo'/, 'a tela promete tarefa de prazo');
  assert.match(src('automacoes.js'), /origemRecorrencia: t\.id/,
    'a tela promete que a recorrente gera a próxima sozinha');
});

test('a recorrente é contada pelo campo que ela realmente grava', () => {
  // `automacoes.js` copia a tarefa anterior com `...t`, então a recorrente
  // HERDA a origem da original e se marca com `origemRecorrencia`. Contar por
  // `origem === 'recorrencia'` mostraria zero para sempre.
  assert.ok(!/t\.origem === 'recorrencia'/.test(tela),
    'nenhuma tarefa grava origem "recorrencia" — essa contagem daria sempre zero');
  assert.match(tela, /t\.origemRecorrencia/, 'a recorrente se identifica por origemRecorrencia');
});

test('fonte que nunca disparou aparece apagada, não como se funcionasse', () => {
  assert.match(tela, /desligada/, 'a fonte sem nenhuma tarefa precisa se distinguir');
  assert.match(tela, /nenhuma at[ée] agora/i);
});

test('quadro vazio é explicado, não deixado no ar', () => {
  assert.match(tela, /não quer dizer que a tela não funciona/,
    'quatro zeros sem explicação é o que fez ela perguntar se aquilo serve para algo');
  assert.match(tela, /aplicativo criado/, 'diz o que falta ligar na Meta');
});
