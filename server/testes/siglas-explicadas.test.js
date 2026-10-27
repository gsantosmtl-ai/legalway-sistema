// Medido nas oito telas: USCIS aparece 77 vezes, I-797 e RFE 27 cada,
// EB-2/NIW 39 — e nenhuma com uma linha de explicação em lugar nenhum.
//
// Quem já trabalha com imigração não sente falta. Quem entra na equipe semana
// que vem trava na primeira tela, e não tem a quem perguntar sem interromper
// alguém no meio do trabalho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const glossario = (() => {
  const m = /const GLOSSARIO = \{([\s\S]*?)\n  \};/.exec(comum);
  assert.ok(m, 'não achei o glossário');
  const fora = {};
  for (const l of m[1].matchAll(/'([^']+)':\s*'([^']+)'/g)) fora[l[1]] = l[2];
  return fora;
})();

test('as siglas que mais aparecem estão explicadas', () => {
  for (const s of ['USCIS', 'I-797', 'RFE', 'EB-2', 'NIW', 'I-765', 'I-914', 'SEVIS', 'Biometria']) {
    assert.ok(glossario[s], 'falta ' + s);
  }
});

test('a explicação é curta e em português de gente', () => {
  // Cabe num balão ao passar o mouse. Texto longo não é lido; texto com
  // jargão dentro não explica nada.
  for (const [sigla, texto] of Object.entries(glossario)) {
    assert.ok(texto.length <= 110, `${sigla}: ${texto.length} caracteres, longo demais para um balão`);
    assert.ok(/[.!]$/.test(texto), `${sigla}: termine a frase`);
    assert.doesNotMatch(texto, /\b(petition|adjudicat|waiver request|beneficiary)\b/i,
      `${sigla}: explicar jargão com jargão não explica`);
  }
});

test('o I-914 diz que o cliente não tem o que mandar', () => {
  // Formulário do escritório na lista do cliente já fez gente ligar
  // perguntando o que fazer. A explicação tem que matar essa dúvida.
  assert.match(glossario['I-914'], /escritório/);
  assert.match(glossario['I-914'], /não tem o que mandar/);
});

test('o SEVIS diz que é taxa do governo, não do escritório', () => {
  // É o caso do Tiago: 820 de taxas que não são receita do contrato. Quem lê
  // a cobrança precisa entender para quem o dinheiro vai.
  assert.match(glossario['SEVIS'], /governo/);
});

test('não mexe em campo que a pessoa está preenchendo', () => {
  // Reescrever o texto dentro de um input apagaria o que foi digitado.
  const corpo = /function explicarSiglas\(raiz\)\{([\s\S]*?)\n  \}/.exec(comum)[1];
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SCRIPT']) {
    assert.ok(corpo.includes(`'${tag}'`), 'precisa pular ' + tag);
  }
  assert.match(corpo, /isContentEditable/, 'campo rico também é campo');
});

test('sigla já marcada não é marcada de novo', () => {
  // A função roda a cada pintura de tela. Sem isto, cada passagem embrulharia
  // a anterior e o balão viraria uma boneca russa.
  const corpo = /function explicarSiglas\(raiz\)\{([\s\S]*?)\n  \}/.exec(comum)[1];
  assert.ok(corpo.includes("'ABBR'"), 'o <abbr> que ela mesma criou tem que ser pulado');
});

test('casa a sigla inteira, não pedaço de palavra', () => {
  // Sem a trava, "RFE" acharia "RFE" dentro de outra palavra e "I-94"
  // acharia o começo de "I-94X".
  const m = /const RE_SIGLAS = new RegExp\(([\s\S]*?)\);/.exec(comum);
  assert.ok(m, 'não achei a expressão');
  assert.match(m[1], /\(\?<!\[/, 'falta a trava antes');
  assert.match(m[1], /\(\?!\[/, 'falta a trava depois');
  assert.match(m[1], /sort\(\(a, b\) => b\.length - a\.length\)/,
    'as mais longas primeiro, senão "I-79" comeria "I-797"');
});

test('a marcação roda depois da tela pintar', () => {
  // Quase toda tela desenha o conteúdo depois de buscar os dados. Marcar
  // antes disso não acharia nada.
  assert.match(comum, /setTimeout\(\(\)=> explicarSiglas\(\), \d+\)/);
  assert.match(comum, /if\(document\.getElementById\('side-nav'\)\) setTimeout/,
    'só nas telas internas — login e portal do cliente ficam de fora');
});
