// A cor da ação vem da marca, cada serviço tem a sua, e o fundo é cinza.
//
// "Pra mim tem uma única cor de botão, uma cor que não fala com a marca da
// Legalway." Fui medir o logo: ele é INTEIRAMENTE AZUL — #001888, #001880,
// #001878. O vinho #86285F não tinha relação nenhuma com a marca; entrou no
// sistema com o nome errado, `--gold`.
//
// O azul puro do logo também não servia de botão: 1,25:1 contra o fundo do
// menu, ele se dissolveria ali. A saída foi o mesmo azul, mais vivo — #2A4BE0,
// 2,67:1 — que separa MAIS que o vinho e continua sendo a marca.
//
// "Cada serviço poderia ter uma cor, para diferenciar": a cor nasce do NOME do
// serviço, então serviço novo já tem a sua e ninguém precisa configurar nada.
//
// "Queria um cinza clarinho": o fundo era um creme #FAFAF8 que puxava para o
// amarelo e brigava com o âmbar das etiquetas de espera.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const telas = readdirSync(DOCS).filter((f) => f.endsWith('.html'));
const ler = (f) => readFileSync(join(DOCS, f), 'utf8');
const comum = ler('assets/comum.js');

function luminancia(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contraste = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('os dois níveis de botão são azuis da marca e se separam', () => {
  // A dona escolheu o par, apontando a paleta: o azul escuro do menu como
  // ação principal (#03045E, o primeiro) e o terceiro (#0077B6) como apoio.
  //
  // Antes eu media a ação contra o FUNDO DO MENU e reprovava o azul escuro
  // por "se dissolver" nele — 1,01:1. A medida estava errada: o botão nunca
  // fica em cima do menu. Ele fica no corpo da página e dentro de cartão.
  // Onde ele de fato vive, o azul escuro dá 16,3:1 contra a página e 17,8:1
  // contra o cartão branco.
  const css = readFileSync(join(DOCS, 'assets/padrao.css'), 'utf8');
  assert.match(css, /--acao:\s*#03045E/, 'a ação principal é o azul escuro da marca');
  assert.match(css, /--acao-2:\s*#0077B6/, 'o apoio é o terceiro azul da paleta');

  // Onde o botão realmente aparece:
  assert.ok(contraste('#FFFFFF', '#03045E') >= 4.5, 'texto branco na ação principal');
  assert.ok(contraste('#FFFFFF', '#0077B6') >= 4.5, 'texto branco na ação de apoio');
  assert.ok(contraste('#03045E', '#F4F5F7') >= 3, 'a ação precisa se destacar do fundo da página');
  assert.ok(contraste('#0077B6', '#F4F5F7') >= 3, 'o apoio também');
  // E os dois níveis precisam se distinguir um do outro, senão não são dois.
  assert.ok(contraste('#03045E', '#0077B6') >= 1.8,
    'se os dois forem parecidos demais, voltamos a ter uma cor só de botão');
});

test('nenhuma tela ficou com a ação na cor antiga', () => {
  const fora = telas.filter((f) => {
    const m = ler(f).match(/button\.primary\s*\{[^}]*background:\s*var\((--[a-z-]+)\)/);
    return m && m[1] !== '--acao';
  });
  assert.deepEqual(fora, []);
});

test('a cor do serviço nasce do nome e é sempre a mesma', () => {
  const i = comum.indexOf('const CORES_DE_SERVICO');
  const j = comum.indexOf('window.LW.etiquetaDeServico');
  assert.ok(i > 0 && j > i, 'não achei a cor de serviço');
  const ctx = createContext({ String, Number });
  runInContext(comum.slice(i, j).replace(/window\.LW\./g, 'globalThis.'), ctx);
  const cor = ctx.corDoServico;

  assert.deepEqual(cor('Visto T'), cor('Visto T'), 'o mesmo nome tem que dar sempre a mesma cor');
  assert.deepEqual(cor('visto t'), cor('Visto T'), 'maiúscula não muda a cor');
  assert.deepEqual(cor(' Visto T '), cor('Visto T'), 'espaço sobrando não muda a cor');
  assert.notDeepEqual(cor('Visto T'), cor('GreenCard Casamento'), 'serviços diferentes se distinguem');
  // Serviço que o escritório cadastrar amanhã já nasce com cor.
  assert.ok(cor('Serviço Inventado Agora').bg.startsWith('#'));
  assert.equal(cor('').fg, 'var(--ink-soft)', 'sem serviço, nada de cor');
});

test('a cor do serviço não usa as cores que já têm outro significado', () => {
  const i = comum.indexOf('const CORES_DE_SERVICO');
  const bloco = comum.slice(i, comum.indexOf('];', i));
  // Verde, âmbar, vermelho e azul já querem dizer resolvido, esperando,
  // precisa de você e informação. Um serviço verde diria "pago" sem querer.
  for (const semantica of ['#2F6F4E', '#8E5F06', '#A5402E', '#3A5A8C', '#E4EFE8', '#F3E9D2', '#F6E7E3']) {
    assert.ok(!bloco.includes(semantica), `${semantica} já tem significado no sistema`);
  }
});

test('todo texto de etiqueta de serviço é legível no próprio fundo', () => {
  const i = comum.indexOf('const CORES_DE_SERVICO');
  const bloco = comum.slice(i, comum.indexOf('];', i));
  const pares = [...bloco.matchAll(/bg:'(#[0-9A-F]{6})',\s*fg:'(#[0-9A-F]{6})'/gi)];
  assert.ok(pares.length >= 6, `só achei ${pares.length} cores de serviço`);
  for (const [, bg, fg] of pares) {
    const c = contraste(fg, bg);
    assert.ok(c >= 4.5, `${fg} sobre ${bg} dá ${c.toFixed(2)}:1`);
  }
});

test('o fundo é cinza, e os três planos se distinguem', () => {
  const comCreme = telas.filter((f) => /--paper:\s*#FAFAF8/.test(ler(f)));
  assert.deepEqual(comCreme, [], 'o creme puxava para o amarelo e brigava com o âmbar');
  // página mais clara que a coluna, coluna mais escura que o cartão branco
  assert.ok(luminancia('#F4F5F7') > luminancia('#EAECF0'), 'a coluna tem que ser mais escura que a página');
  assert.ok(luminancia('#FFFFFF') > luminancia('#EAECF0'), 'o cartão tem que ser mais claro que a coluna');
  // e o texto continua legível no fundo novo
  for (const [cor, nome] of [['#1A1A1A', 'texto'], ['#6B6558', 'texto secundário'], ['#8E5F06', 'âmbar']]) {
    const c = contraste(cor, '#F4F5F7');
    assert.ok(c >= 4.5, `${nome} dá ${c.toFixed(2)}:1 no fundo novo`);
  }
});

test('Fechar e Cancelar deixaram de ser a mesma coisa', () => {
  // 24 "Fechar" e 35 "Cancelar" saíam todos em `ghost`. Fechar é sair;
  // Cancelar é abandonar o que estava sendo feito, e isso tem consequência.
  const iguais = [];
  for (const f of telas) {
    for (const m of ler(f).matchAll(/<button[^>]*class="([^"]*)"[^>]*>\s*Cancelar\s*<\/button>/g)) {
      if (/\bghost\b/.test(m[1])) iguais.push(`${f}: Cancelar como ghost`);
    }
  }
  assert.deepEqual(iguais, [], 'Cancelar usa .leve, que tem corpo; Fechar fica em só texto');
});

test('nenhum "Fechar" usa a cor da ação', () => {
  const fortes = [];
  for (const f of telas) {
    for (const m of ler(f).matchAll(/<button[^>]*class="([^"]*)"[^>]*>\s*Fechar\s*<\/button>/g)) {
      if (/\bprimary\b/.test(m[1])) fortes.push(f);
    }
  }
  assert.deepEqual(fortes, [],
    'com o azul vivo, um "Fechar" em destaque grita num botão que não faz nada');
});

test('o item escolhido do menu usa o azul da marca, não o magenta', () => {
  // Era o último lugar onde a cor fora da marca tinha sobrado: ela abriu o
  // menu, apontou e disse "cor".
  //
  // Tinha de ser o azul CLARO. O escuro, que é a ação principal, dá 1,01:1
  // contra o fundo do menu — sumiria lá dentro.
  const comMagenta = telas.filter((f) =>
    /\.side-link\.active\{[^}]*background:var\(--gold\)/.test(ler(f)));
  assert.deepEqual(comMagenta, [], 'o item do menu não pode ser magenta');

  const comAzul = telas.filter((f) =>
    /\.side-link\.active\{[^}]*background:var\(--acao-2/.test(ler(f)));
  assert.ok(comAzul.length >= 15, `só ${comAzul.length} telas com o menu em azul`);

  // E a escolha se sustenta na medida: destaca mais que o magenta destacava.
  assert.ok(contraste('#0077B6', '#0E1638') > contraste('#86285F', '#0E1638'),
    'se não destacasse mais que o magenta, a troca seria só de gosto');
  assert.ok(contraste('#FFFFFF', '#0077B6') >= 4.5,
    'o nome do módulo tem que continuar legível em cima dele');
});

test('nenhuma tela ficou com o bege antigo', () => {
  // Ela apontou: "tem algumas telas ainda com o bege feio ao invés do cinza
  // clarinho". A varredura anterior trocou só os TOKENS; sobraram 18 valores
  // escritos à mão e em fallbacks de var(), em 12 telas.
  const BEGES = /#FAFAF8|#F7F5F0|#F1EFEA|#F1EFE9|#FBFAF7/i;
  const sobrou = [];
  for (const f of [...telas, 'assets/padrao.css', 'assets/comum.css']) {
    let s;
    try { s = ler(f); } catch { continue; }
    for (const linha of s.split('\n')) {
      if (!BEGES.test(linha)) continue;
      // A cor da barra do navegador não é fundo de página.
      if (/theme-color|content=/.test(linha)) continue;
      sobrou.push(`${f}: ${linha.trim().slice(0, 64)}`);
    }
  }
  assert.deepEqual(sobrou, [], 'o bege puxava para o amarelo e brigava com o âmbar das etiquetas');
});
