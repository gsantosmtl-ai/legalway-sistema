// Do relatório de usabilidade, a única melhoria que ela mandou fazer:
//
//   "Hoje são duas telas para o mesmo assunto: Automações (2 botões) e
//    Configurações → Mensagens (as 19 mensagens). Nenhuma aponta para a
//    outra. E quando uma automação roda e não acha nada, ela não diz nada —
//    silêncio se parece com defeito."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/automacoes.html', import.meta.url), 'utf8');
const motor = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');
const rota = readFileSync(new URL('../src/waha-rotas.js', import.meta.url), 'utf8');

// ----------------------------------------------------------- o que guardou
test('a rodada passa a ficar registrada, não só no console', () => {
  assert.match(motor, /export function ultimaRodada\(\)/);
  assert.match(motor, /async function anotarExecucao\(motivo, log, falhas, comecou\)/);
  assert.match(motor, /await anotarExecucao\(motivo, log, falhas, comecou\);/,
    'sem a chamada, a função existe e nunca roda');
});

test('rodada silenciosa NÃO vira registro no banco', () => {
  // A automação dispara a cada gravação de contrato, parcela ou processo.
  // Um registro por rodada encheria o banco de "não fiz nada".
  const corpo = /async function anotarExecucao\([\s\S]*?\n\}/.exec(motor)[0];
  assert.match(corpo, /if \(!log\.length && !falhas\.length\) return;/);
  // Mas a última rodada é SEMPRE atualizada em memória — é ela que responde
  // "está vivo?", e essa pergunta não pode depender de ter acontecido algo.
  const ondeMemoria = corpo.indexOf('ultimaExecucao = {');
  const ondeCorta = corpo.indexOf('if (!log.length');
  assert.ok(ondeMemoria > 0 && ondeMemoria < ondeCorta,
    'a memória é atualizada antes do corte, senão rodada quieta parece servidor morto');
});

test('o histórico tem teto', () => {
  assert.match(motor, /const MAX_EXECUCOES = \d+;/);
  assert.match(motor, /\.slice\(-MAX_EXECUCOES\)/, 'sem teto a chave cresce para sempre');
});

test('falhar ao anotar não derruba a automação', () => {
  // Anotar é o menos importante que a rodada faz. Se o banco recusar, o
  // trabalho de verdade não pode cair junto.
  const corpo = /async function anotarExecucao\([\s\S]*?\n\}/.exec(motor)[0];
  assert.match(corpo, /try \{[\s\S]*catch \(e\)/);
});

// ----------------------------------------------------------- a rota
test('a rota entrega as duas metades juntas', () => {
  assert.match(rota, /rotasWaha\.get\('\/automacoes\/estado'/);
  assert.match(rota, /ultima: ultimaRodada\(\)/);
  assert.match(rota, /historico:/);
  assert.match(rota, /mensagens: avisos\.map/);
});

test('a rota avisa qual mensagem está ligada mas sem etapa', () => {
  // Um aviso ligado e sem etapa não alcança ninguém. A tela precisa poder
  // dizer isso, em vez de deixar a pessoa esperando mensagem que não vem.
  assert.match(rota, /semEtapa: !!\(g && \(g\.extras \|\| \[\]\)\.some/);
  assert.match(tela, /sem etapa escolhida: não envia para ninguém/);
});

// ----------------------------------------------------------- a tela
test('a tela diz quando rodou e o que fez', () => {
  assert.match(tela, /<h3>Está rodando\?<\/h3>/);
  assert.match(tela, /id="ultima-rodada"/);
  assert.match(tela, /function haQuantoTempo\(iso\)/);
});

test('"nada a fazer" é dito como normal, não como erro', () => {
  // É o ponto todo. A pessoa precisa distinguir "passou e não havia nada" de
  // "não rodou".
  assert.match(tela, /Passou por tudo e não havia nada a fazer\. É o normal\./);
  assert.match(tela, /Ainda não rodou desde que o servidor subiu/,
    'depois de um deploy, dizer "nunca rodou" seria mentira');
});

test('as mensagens aparecem aqui, e o caminho para editar também', () => {
  assert.match(tela, /<h3>O que o sistema escreve sozinho<\/h3>/);
  assert.match(tela, /configuracoes\.html#avisos/, 'as duas telas passam a se apontar');
  assert.match(tela, /nenhuma está enviando nada no momento/,
    'com tudo desligado a tela tem que dizer isso, não ficar muda');
});

test('a tela não diz mais que não há servidor rodando', () => {
  // Dizia "o sistema ainda não tem servidor rodando 24h". Tem, desde que foi
  // para o Railway. Tela que mente sobre o próprio sistema ensina errado.
  assert.doesNotMatch(tela, /ainda não tem servidor rodando/);
  assert.match(tela, /O sistema já faz isso sozinho a cada rodada/);
});
