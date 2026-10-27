// O PADRÃO VISUAL, em forma de teste.
//
// Ela pediu: "quero que envie todas as telas para o chatgpt sugerir melhorias
// — e criar um padrão." Conselho escrito num documento envelhece; o que não
// envelhece é a regra que falha a bateria quando alguém a quebra.
//
// A medição que originou tudo, nas 15 telas em produção:
//   27 tamanhos de fonte · 40% do texto abaixo de 12px · havia 8px
//   405 botões, 137 em destaque (33,8%), de 0% numa tela a 85% noutra
//   5 títulos de página com emoji decorativo e 10 sem
//
// A condição dela, que estes testes também guardam: isto é LAYOUT. Etapas de
// funil, campos e ações não mudam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../../docs/', import.meta.url);
const ler = (a) => readFileSync(new URL(a, DIR), 'utf8');
const TELAS = readdirSync(DIR).filter((a) => a.endsWith('.html'));
const INTERNAS = TELAS.filter((a) => /id="side-nav"/.test(ler(a)));

test('o padrão existe e tem os sete tamanhos', () => {
  const css = ler('assets/padrao.css');
  for (const t of ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl']) {
    assert.match(css, new RegExp('--texto-' + t.replace('2', '2') + ':\\s*\\d+px'), 'falta --texto-' + t);
  }
  // Sete, não oito: cada token a mais volta a fragmentar.
  const tokens = [...css.matchAll(/--texto-[a-z0-9]+:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.equal(tokens.length, 7);
  assert.equal(Math.min(...tokens), 12, 'o mínimo é 12px');
});

test('o padrão vale em toda tela interna', () => {
  // Deixar cada tela decidir é como o sistema chegou a 27 tamanhos.
  const fora = INTERNAS.filter((a) => !/assets\/padrao\.css/.test(ler(a)));
  assert.deepEqual(fora, []);
});

test('nenhum título de página tem emoji decorativo', () => {
  // O emoji no MENU ajuda a achar o item de relance. No título da página ele
  // é enfeite, e cinco telas tinham enquanto dez não.
  const comEmoji = [];
  for (const arq of TELAS) {
    for (const m of ler(arq).matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)) {
      const t = m[1].replace(/<[^>]+>/g, '').trim();
      if (/^[\u{1F000}-\u{1FAFF}←-⯿️]/u.test(t)) comEmoji.push(`${arq}: ${t.slice(0, 24)}`);
    }
  }
  assert.deepEqual(comEmoji, []);
});

test('a regra do botão em destaque está escrita onde quem mexe vai ler', () => {
  // Uma regra que mora só na cabeça de alguém não sobrevive à equipe nova.
  const css = ler('assets/padrao.css');
  assert.match(css, /Destaque é a ação que faz AVANÇAR no objetivo daquela região/);
  assert.match(css, /No máximo um por região funcional/);
  assert.match(css, /Consultar, abrir, copiar, baixar e imprimir são neutros/);
});

test('o padrão diz por que a serifada não entra nos dados', () => {
  const css = ler('assets/padrao.css');
  assert.match(css, /A serifada identifica a PÁGINA/);
  assert.match(css, /compete com o dado/);
});

test('dinheiro usa algarismo de largura fixa', () => {
  // Sem isto, numa coluna de valores o 1.111 parece mais curto que o 9.999 e
  // a conferência visual deixa de funcionar.
  const css = ler('assets/padrao.css');
  assert.match(css, /\.lw-dinheiro\{[^}]*tabular-nums/);
  assert.match(css, /\.lw-dinheiro\{[^}]*text-align:right/);
});

test('o padrão guarda a condição de quem usa o sistema', () => {
  // A frase precisa estar no arquivo: é ela que impede alguém, daqui a seis
  // meses, "melhorar" uma etapa de funil achando que é layout.
  const css = ler('assets/padrao.css');
  assert.match(css, /Etapas de funil, campos mostrados e\s*\n?\s*ações NÃO mudam/);
});

test('nenhuma tela interna usa fonte abaixo de 12px em texto de cartão', () => {
  // A trava que importa no dia a dia. Vale para as classes de cartão; o resto
  // do sistema migra por passagens.
  const ruins = [];
  for (const arq of ['sdr.html', 'funil-comercial.html', 'documentos.html', 'contratos.html']) {
    const html = ler(arq);
    for (const m of html.matchAll(/\.(card-[a-z]+)\{([^}]*)\}/g)) {
      const t = /font-size:\s*([\d.]+)px/.exec(m[2]);
      if (t && Number(t[1]) < 12) ruins.push(`${arq} .${m[1]} = ${t[1]}px`);
    }
  }
  assert.deepEqual(ruins, []);
});
