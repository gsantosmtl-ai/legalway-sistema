// O backup completo é a rede de segurança da migração de domingo. Se ele falha
// no meio, não existe rede.
//
// O limite que decide o tamanho do pedaço não é o corpo do HTTP: é o TAMANHO
// MÁXIMO DE UMA STRING no Node. Medido no servidor de produção em 31/10/2026:
// 512 MB (buffer.constants.MAX_STRING_LENGTH, Node 20.20.2).
//
// Base64 incha 33%, e o laço do lote sempre leva ao menos um arquivo a mais
// para não travar num arquivo gigante. Com 300 MB por lote isso dava:
//
//   340 MB de bytes → 453 MB de texto → 59 MB de folga
//
// E o navegador paga duas vezes — `resp.json()` monta o objeto e o Blob do
// download pede a string de novo. Mais de 1,4 GB numa aba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import buffer from 'node:buffer';

const fonte = readFileSync(new URL('../src/backup.js', import.meta.url), 'utf8');
const tela = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

function bytesPorLote() {
  const m = /const BYTES_POR_LOTE = (\d+) \* 1024 \* 1024;/.exec(fonte);
  assert.ok(m, 'não achei BYTES_POR_LOTE em backup.js');
  return Number(m[1]) * 1024 * 1024;
}

// O maior arquivo que o sistema aceita guardar — é o excedente que o lote pode
// levar a mais, porque "sempre leva ao menos um".
function tamanhoMaximoDeArquivo() {
  const arquivos = readFileSync(new URL('../src/arquivos.js', import.meta.url), 'utf8');
  const m = /const TAMANHO_MAX = (\d+) \* 1024 \* 1024;/.exec(arquivos);
  assert.ok(m, 'não achei TAMANHO_MAX em arquivos.js');
  return Number(m[1]) * 1024 * 1024;
}

const MAX_STRING = buffer.constants.MAX_STRING_LENGTH;

test('o limite de string do Node é o que eu achei que era', () => {
  // 536.870.888 — meio giga menos 24 bytes, que é o limite do V8. Se um dia o
  // Node mudar isso, quero saber por um teste e não por um backup que falhou
  // no domingo.
  assert.ok(MAX_STRING >= 500 * 1024 * 1024, `MAX_STRING_LENGTH caiu para ${MAX_STRING}`);
  assert.ok(MAX_STRING < 1024 * 1024 * 1024,
    'subiu muito: dá para rever o tamanho do lote, mas só depois de medir no servidor');
});

test('o pior lote possível cabe numa string, com folga de pelo menos 50%', () => {
  const pior = bytesPorLote() + tamanhoMaximoDeArquivo();   // o "sempre leva um a mais"
  const texto = Math.ceil(pior * 4 / 3);                    // base64
  assert.ok(texto * 1.5 <= MAX_STRING,
    `lote de ${(bytesPorLote()/1048576).toFixed(0)} MB vira ${(texto/1048576).toFixed(0)} MB de texto; `
    + `com o teto de ${(MAX_STRING/1048576).toFixed(0)} MB a folga é de só ${((MAX_STRING-texto)/1048576).toFixed(0)} MB`);
});

test('o lote cabe duas vezes na memória do navegador', () => {
  // A aba tem o objeto parseado E a string do Blob ao mesmo tempo. Dois lotes
  // de texto é o mínimo que ela precisa segurar.
  const texto = Math.ceil((bytesPorLote() + tamanhoMaximoDeArquivo()) * 4 / 3);
  assert.ok(texto * 2 <= 600 * 1024 * 1024,
    `o pico na aba seria ${((texto*2)/1048576).toFixed(0)} MB`);
});

test('o lote não ficou pequeno demais para ser prático', () => {
  // 3,3 GB de documentos: pedaço muito pequeno vira centena de downloads.
  const lotes = Math.ceil(3.3 * 1024 * 1024 * 1024 / bytesPorLote());
  assert.ok(lotes <= 40, `daria ${lotes} downloads`);
});

test('a tela conta os pedaços pelo que o servidor diz, não por número fixo', () => {
  // Se a tela tivesse o número escrito, mudar o lote deixaria o aviso mentindo.
  assert.match(fonte, /lotes: Math\.max\(1, Math\.ceil\(bytes \/ BYTES_POR_LOTE\)\)/);
  assert.match(tela, /r\.lotes/);
  assert.doesNotMatch(tela, /lotes de 300 MB/, 'o comentário da tela ficou falando do lote antigo');
});

test('o laço do lote sempre leva ao menos um arquivo', () => {
  // É o que impede um arquivo maior que o lote de travar o download para
  // sempre — e é o que faz o pior caso ser lote + arquivo.
  assert.match(fonte, /if \(lote\.length && soma \+ a\.tamanho > BYTES_POR_LOTE\)/);
});

test('a cópia automática continua SEM os bytes dos arquivos', () => {
  // Carregar os 3,3 GB na memória a cada seis horas derrubaria o servidor. A
  // cópia automática é inventário; a com documentos é a que se baixa.
  assert.match(fonte, /montarBackup\('automático'\)/);
  assert.match(fonte, /comArquivos = false/);
  assert.doesNotMatch(fonte, /montarBackup\('automático', \{ comArquivos: true/);
});

// ---------------------------------------------------------------------------
// E o defeito que tornava a rede de segurança inútil.
//
// A cópia automática vai de propósito só com o INVENTÁRIO dos documentos —
// carregar os 3,3 GB a cada seis horas derrubaria o servidor. O comentário no
// alto do backup.js sempre disse que "a restauração ignora os que não trazem
// bytes". O código não ignorava: `Buffer.from(undefined, 'base64')` levanta
// TypeError, e a restauração morria no primeiro arquivo — depois de já ter
// inserido os usuários.
//
// Ou seja: a única cópia que existe sem ninguém baixar nada era a única que
// não dava para restaurar. E é dela que a gente dependeria no domingo.
// ---------------------------------------------------------------------------
test('Buffer.from(undefined) realmente levanta — a premissa do defeito', () => {
  assert.throws(() => Buffer.from(undefined, 'base64'), TypeError);
  assert.throws(() => Buffer.from(null, 'base64'), TypeError);
  assert.equal(Buffer.from('', 'base64').length, 0);
});

test('a restauração pula arquivo sem bytes em vez de morrer', () => {
  const i = fonte.indexOf('for (const a of b.arquivos || [])');
  assert.ok(i > 0, 'o laço dos arquivos da restauração desapareceu');
  const corpo = fonte.slice(i, fonte.indexOf('for (const bl of b.armazenamento', i));
  assert.match(corpo, /if \(typeof a\.conteudo !== 'string' \|\| !a\.conteudo\) \{ n\.semBytes\+\+; continue; \}/);
  // e o teste de que o pulo vem ANTES do Buffer.from
  assert.ok(corpo.indexOf('n.semBytes++') < corpo.indexOf('Buffer.from(a.conteudo'),
    'o pulo tem de vir antes do Buffer.from, senão o TypeError acontece igual');
});

test('quem restaura fica sabendo quantos documentos não vieram', () => {
  assert.match(fonte, /let n = \{ usuarios: 0, blocos: 0, arquivos: 0, mensagens: 0, semBytes: 0 \};/);
  assert.match(tela, /semBytes:0/);
  assert.match(tela, /estavam só listados nesta cópia, sem o conteúdo/);
});
