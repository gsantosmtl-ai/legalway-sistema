// As correções da Conciliação. O que este teste guarda não é cada ação — é o
// contrato de segurança delas, que é o que torna aceitável um botão que
// escreve no banco da Legal Way:
//
//   1. nenhuma ação altera valor de contrato, parcela ou pagamento
//   2. nenhuma ação apaga registro
//   3. toda ação reconfere antes de escrever e não faz nada se já foi resolvida
//   4. prévia antes de aplicar, e auditoria depois
//
// Um teste de comportamento aqui exigiria Postgres. Este lê o código e cobra
// as regras — rede mais rasa, e melhor do que nenhuma para um caminho que
// escreve em dado de cliente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/conciliacao-rotas.js', import.meta.url), 'utf8');
const ini = fonte.indexOf('const ACOES = {');
const acoes = fonte.slice(ini, fonte.indexOf("rotasConciliacao.get('/conciliacao/acoes'"));
const rota = fonte.slice(fonte.indexOf("rotasConciliacao.post('/conciliacao/corrigir'"));

// A contagem é travada de propósito: ação nova aqui é botão novo que escreve
// no banco da Legal Way, e tem que passar por esta lista — e pelas regras
// abaixo — em vez de entrar de carona.
const SEGURAS = ['criar-cliente', 'gerar-financeiro', 'abrir-card', 'cancelar-cards',
  'definir-responsavel'];

test('as ações seguras existem, e são só estas', () => {
  for (const chave of SEGURAS) {
    assert.ok(acoes.includes(`'${chave}'`), `faltou a ação ${chave}`);
  }
  // cada uma precisa dizer o que faz, porque o botão aparece para gente que
  // não leu este arquivo
  const rotulos = (acoes.match(/rotulo:/g) || []).length;
  const explicas = (acoes.match(/explica:/g) || []).length;
  assert.equal(rotulos, SEGURAS.length, 'apareceu ação fora da lista revisada');
  assert.equal(explicas, SEGURAS.length, 'ação sem explicação vira botão que ninguém sabe o que faz');
});

test('definir responsável só preenche vazio — nunca troca quem já tem dono', () => {
  // A garantia que torna aceitável aplicar isto em 160 cards de uma vez.
  // Coberta a fundo em definir-responsavel.test.js; aqui fica junto das outras
  // regras de segurança para quem ler só este arquivo.
  assert.match(fonte, /!p\.responsavel/,
    'a regra de "sem dono" é o que impede apagar uma atribuição feita de propósito');
  assert.match(acoes, /definir-responsavel[\s\S]*?SEM responsável/,
    'a explicação tem que dizer que não toca em quem já tem dono');
});

test('nenhuma ação mexe em valor de dinheiro', () => {
  // `valor` como leitura é permitido; o que não pode é atribuir
  const proibido = [/\.valor\s*=[^=]/, /\.valorRecebido\s*=[^=]/, /\.entrada\s*=[^=]/, /\.numParcelas\s*=[^=]/];
  for (const re of proibido) {
    assert.doesNotMatch(acoes, re,
      `correção automática não pode escrever em campo de dinheiro: ${re}`);
  }
});

test('nenhuma ação apaga registro', () => {
  // `.filter()` sozinho é leitura — `const vivos = processos.filter(...)` é
  // justamente como se acham os cards a cancelar. O que apaga é tirar do
  // array (splice), remover a chave (delete) ou DEVOLVER uma lista filtrada
  // no lugar do bloco, que é o jeito silencioso de sumir com registro.
  for (const re of [/\.splice\(/, /\bdelete\s+\w+\[/]) {
    assert.doesNotMatch(acoes, re, 'correção automática não apaga nada — cancelar sim, apagar não');
  }
  assert.doesNotMatch(acoes, /valor:\s*\w+\.filter\(/,
    'devolver uma lista filtrada como novo valor do bloco apaga tudo que ficou de fora');
});

test('cancelar card é reversível, e diz isso', () => {
  assert.match(acoes, /situacao = 'cancelado'/);
  assert.match(acoes, /dá para reativar/);
  assert.doesNotMatch(acoes, /processos\.splice/);
});

test('toda ação devolve null quando não há o que fazer', () => {
  // é o que a torna idempotente: clicar duas vezes não cria duas coisas
  const retornos = (acoes.match(/return null;/g) || []).length;
  assert.ok(retornos >= 5, `só ${retornos} saídas por "nada a fazer" — alguma ação não reconfere`);
});

test('gerar financeiro só roda quando não existe lançamento nenhum', () => {
  assert.match(acoes, /if \(contas\.some\(x => x && x\.contratoId === c\.id\)\) return null;/,
    'sem essa trava, a ação criaria parcelas em cima das que já existem');
});

test('a rota lê tudo no instante da escrita, não confia no painel', () => {
  assert.match(rota, /await Promise\.all\(/);
  assert.match(rota, /ler\(k\)/);
});

test('prévia antes de aplicar', () => {
  assert.match(rota, /previa/);
  assert.match(rota, /return res\.json\(\{ previa: true/);
});

test('toda aplicação entra na auditoria', () => {
  assert.match(rota, /INSERT INTO auditoria/);
  assert.match(rota, /req\.usuario\.nome/);
});

test('grava com a versão lida, e trata a recusa da aba velha', () => {
  assert.match(rota, /gravar\(plano\.bloco, plano\.valor, base\.versao/,
    'gravar sem versão ignoraria o que outra pessoa salvou no meio');
  assert.match(rota, /codigo === 'base-antiga'/);
});

test('reaproveita as funções da automação em vez de reescrevê-las', () => {
  assert.match(fonte, /import \{ encaixarCliente, encaixarContas, novaFichaDeContrato \}/,
    'duas cópias da mesma regra divergem no primeiro ajuste');
});
