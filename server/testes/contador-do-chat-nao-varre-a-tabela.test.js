// Medido na produção em 30/10/2026. A consulta de "não lidas" faz varredura
// COMPLETA de chat_mensagens — 134.680 linhas, 12.193 blocos de disco, 33 ms
// por chamada — e rodava a cada 6 SEGUNDOS por aba visível, em 15 telas.
//
// Com sete pessoas e duas ou três abas cada, davam umas 200 varreduras
// completas por minuto só para desenhar um número no canto da tela. No log de
// segurança isso aparece como 190.894 batidas de "excesso de pedidos" em
// GET /chat/nao-lidas — 94% de todos os eventos de segurança do sistema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TELAS, lerTela, scriptsDa, semComentarios, RAIZ } from './telas/_base.js';
import path from 'node:path';

const comum = readFileSync(path.join(RAIZ, 'docs/assets/comum.js'), 'utf8');
const api = readFileSync(path.join(RAIZ, 'docs/assets/api.js'), 'utf8');

// Recorta o bloco da inscrição no WebSocket contando chaves. Janela de tamanho
// fixo quebra quando alguém acrescenta um comentário — já me enganou quatro
// vezes hoje, em testes diferentes.
function blocoDoOuvinte() {
  const i = comum.indexOf('if(window.LW && LW.tempoReal){');
  assert.notEqual(i, -1, 'não achei a inscrição no tempo real');
  let nivel = 0;
  for (let k = comum.indexOf('{', i); k < comum.length; k++) {
    if (comum[k] === '{') nivel++;
    else if (comum[k] === '}' && --nivel === 0) return comum.slice(i, k + 1);
  }
  throw new Error('chaves não fecharam');
}

test('nenhuma tela pergunta o contador de 6 em 6 segundos', () => {
  const culpadas = TELAS.filter((t) =>
    /setInterval\(\s*atualizarBadgeChat\s*,\s*(\d{1,4})\s*\)/.test(semComentarios(scriptsDa(lerTela(t)).join('\n'))));
  assert.deepEqual(culpadas, [], 'cada uma dessas faz uma varredura completa da tabela por volta');
});

test('o contador sobe pelo WebSocket, que já carrega a mensagem', () => {
  assert.match(comum, /ev\.tipo !== 'mensagem'/, 'o contador não ouve o WebSocket');
  assert.match(comum, /chat-badge/);
});

test('a própria mensagem da pessoa não incrementa o contador dela', () => {
  assert.match(blocoDoOuvinte(), /de === eu\.usuarioId/,
    'quem escreveu veria o próprio recado como não lido');
});

test('na tela de Chat o contador não sobe', () => {
  assert.match(blocoDoOuvinte(), /chat\.html/,
    'lá a mensagem já aparece na tela; contar de novo é ruído');
});

test('a rede de segurança é lenta e não roda com a aba escondida', () => {
  assert.match(comum, /setInterval\([\s\S]*?atualizarBadgeChat\(\)[\s\S]*?90000\)/,
    'a rede de 90s sumiu');
  const linha = comum.split('\n').find((l) => l.includes('90000'));
  assert.match(linha, /document\.hidden/, 'aba escondida não precisa do contador');
});

test('uma conexão de tempo real por aba, não uma por peça', () => {
  // storage.js abria uma, a tela de Chat abria outra, e qualquer peça nova
  // abriria a terceira.
  assert.match(api, /const ouvintes = new Set\(\)/, 'os ouvintes não são compartilhados');
  assert.match(api, /if \(conexao\) return/, 'a segunda chamada tem de reaproveitar a conexão');
  assert.match(api, /function abrirTempoReal/, 'a abertura precisa ficar separada da inscrição');
});
