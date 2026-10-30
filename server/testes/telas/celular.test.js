// BATERIA POR TELA — o celular.
//
// A equipe inteira vai usar o sistema no telefone a partir de 02/11. O
// comentário do comum.js explica a armadilha: quando a página estoura, o
// Chrome do celular ESTICA a janela, e aí o @media de max-width deixa de valer
// justamente onde mais precisa. Por isso a régua aqui é a classe lw-celular.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TELAS, lerTela, marcacaoDe, RAIZ } from './_base.js';
import path from 'node:path';

const comum = readFileSync(path.join(RAIZ, 'docs/assets/comum.js'), 'utf8');
const regraCelular = comum.slice(comum.indexOf('lw-celular'), comum.indexOf('/* ===================== O SININHO'));
const LARGURA = 375;

/**
 * A menor largura que a grade pode assumir.
 *
 * `1fr`, `auto` e `minmax(0, …)` encolhem até nada — não travam a tela. O que
 * trava é px fixo. Contar colunas em vez de medir dava falso positivo no
 * calendário (`repeat(7, 1fr)`) e na fileira de botões (`repeat(6, 24px)`,
 * que são 144px e cabem).
 */
function larguraMinima(cols) {
  let total = 0;
  // repeat(k, X) conta k vezes o mínimo de X
  const comRepeat = cols.replace(/repeat\(\s*(\d+)\s*,\s*([^)]*(?:\([^)]*\))?[^)]*)\)/g, (_, k, x) =>
    new Array(Number(k)).fill(x.trim()).join(' '));
  for (const parte of comRepeat.split(/\s+(?![^(]*\))/).filter(Boolean)) {
    const mm = parte.match(/^minmax\(\s*([^,]+),/);
    const alvo = mm ? mm[1].trim() : parte;
    const px = alvo.match(/^(\d+(?:\.\d+)?)px$/);
    if (px) total += Number(px[1]);
    // 1fr, auto, %, min-content, 0 — tudo isso pode encolher
  }
  return Math.round(total);
}

/** As regras CSS da própria tela (dentro de <style>). */
function cssDa(html) {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
}

for (const tela of TELAS) {
  const html = lerTela(tela);
  const css = cssDa(html);
  const marcacao = marcacaoDe(html);

  test(`${tela} · a página se declara para o celular`, () => {
    assert.match(html, /<meta[^>]+name="viewport"[^>]+width=device-width/i,
      'sem viewport o celular renderiza como se fosse um monitor e encolhe tudo');
  });

  test(`${tela} · nenhuma grade mais larga que a tela sem rede no comum.js`, () => {
    const culpadas = [];
    for (const m of css.matchAll(/\.([a-z][\w-]*)\s*\{[^}]*grid-template-columns:\s*([^;}]+)/gi)) {
      const classe = m[1], cols = m[2].trim();
      if (larguraMinima(cols) <= LARGURA) continue;
      const coberta = new RegExp('lw-celular[^{]*\\.' + classe + '\\b').test(regraCelular)
        || new RegExp('\\.' + classe + '\\s*[,{]').test(regraCelular);
      if (!coberta) culpadas.push(`.${classe} = ${cols.slice(0, 48)} (mínimo ${larguraMinima(cols)}px)`);
    }
    assert.deepEqual(culpadas, [],
      'estas grades não cabem em 375px nem encolhendo, e não têm regra de celular');
  });

  test(`${tela} · tabela larga rola dentro da própria caixa`, () => {
    if (!/<table/i.test(marcacao) && !/<table/i.test(html)) { assert.ok(true, 'sem tabela'); return; }
    const temRolagem = /overflow-x:\s*(auto|scroll)/i.test(css)
      || /lw-celular[^{]*table/.test(regraCelular)
      || /overflow-x:\s*(auto|scroll)/i.test(regraCelular);
    assert.ok(temRolagem, 'tabela larga sem caixa de rolagem empurra a página inteira para o lado');
  });
}
