// Visto num print da produção, não lido no código: a tela do SDR mostrava uma
// caixa "Testes:" com "+ Lead enviado pro SDR" para qualquer pessoa logada.
// O mesmo em mais cinco telas, com "+ Contrato de teste", "+ Lead assumido
// (de teste)", "+ Compromisso de teste" e "+ Tarefa de teste".
//
// Foi por aí que nasceram os quatro contratos e as 27 parcelas de teste que
// precisaram ser apagados da produção em 27/10. Com a equipe inteira entrando
// no sistema em 1º de novembro, isso volta a acontecer na primeira semana.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../../docs/', import.meta.url);
const comum = readFileSync(new URL('assets/comum.js', DIR), 'utf8');

test('os botões de teste somem para quem não tem acesso total', () => {
  assert.match(comum, /if\(!LW\.ehAdministrador\(\)\)\{/);
  assert.match(comum, /querySelectorAll\('\.test-panel'\)\.forEach/);
});

test('a trava roda sozinha, sem cada tela precisar lembrar', () => {
  // Deixar para cada tela chamar significaria lembrar em seis arquivos — e
  // esquecer na sétima que alguém criar depois.
  // Procurar "ehAdministrador" no arquivo inteiro acha a DEFINIÇÃO dela, que
  // mora bem antes. O que importa é a CHAMADA, dentro do arranque.
  const i = comum.indexOf("ligarFechamentoPadrao();");
  assert.ok(i > 0, 'não achei o arranque compartilhado');
  const arranque = comum.slice(i, i + 900);
  assert.match(arranque, /if\(!LW\.ehAdministrador\(\)\)/,
    'a trava tem que rodar no mesmo arranque, não em cada tela');
});

test('todo bloco de teste usa a mesma classe', () => {
  // Se um usar outro nome de classe, ele continua à mostra e ninguém nota.
  const problemas = [];
  for (const arq of readdirSync(DIR).filter(a => a.endsWith('.html'))) {
    const html = readFileSync(new URL(arq, DIR), 'utf8');
    for (const m of html.matchAll(/<div[^>]*>\s*<span class="label">Testes:/g)) {
      const abertura = html.slice(Math.max(0, m.index - 220), m.index + 40);
      if (!/class="[^"]*\btest-panel\b/.test(abertura)) problemas.push(arq);
    }
  }
  assert.deepEqual(problemas, [], 'bloco de teste sem a classe test-panel fica visível');
});

test('as seis telas que têm bloco de teste continuam tendo a classe', () => {
  const comBloco = [];
  for (const arq of readdirSync(DIR).filter(a => a.endsWith('.html'))) {
    if (/class="[^"]*\btest-panel\b/.test(readFileSync(new URL(arq, DIR), 'utf8'))) comBloco.push(arq);
  }
  for (const a of ['sdr.html', 'agenda.html', 'contratos.html', 'funil-comercial.html', 'tarefas.html']) {
    assert.ok(comBloco.includes(a), a + ' perdeu a marcação');
  }
});
