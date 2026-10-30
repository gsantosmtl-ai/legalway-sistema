// BATERIA POR TELA — estrutura e referências mortas.
//
// Uma pergunta só, feita a todas as 28 telas. É assim que se acha o que
// ninguém procurou: a tela que esqueceu é apanhada pela pergunta que outra
// tela respondeu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TELAS, lerTela, scriptsDa, marcacaoDe, semComentarios, rotulosDeBotao } from './_base.js';

for (const tela of TELAS) {
  const html = lerTela(tela);
  const js = semComentarios(scriptsDa(html).join('\n'));
  const marcacao = marcacaoDe(html);
  // Todo id que EXISTE em algum momento: no HTML fixo, dentro de template de
  // JavaScript, ou criado na mão com `el.id = '...'`.
  const ids = new Set([
    ...[...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
    ...[...js.matchAll(/\.id\s*=\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
  ].filter((i) => !i.includes('${')));

  test(`${tela} · tem título`, () => {
    assert.match(html, /<title>[^<]{3,}<\/title>/, 'a aba do navegador fica sem nome');
  });

  test(`${tela} · nenhum id repetido`, () => {
    // Só o HTML FIXO. Dentro de template de JavaScript o mesmo id aparece em
    // ramos de if/else que nunca renderizam juntos — contar ali daria falso
    // positivo em Contratos, Documentos e Financeiro, conferidos um a um.
    const todos = [...marcacao.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
      .filter((i) => !i.includes('${'));
    const vistos = new Set(), repetidos = new Set();
    for (const i of todos) (vistos.has(i) ? repetidos : vistos).add(i);
    assert.deepEqual([...repetidos], [], 'ids repetidos: o segundo nunca é encontrado');
  });

  test(`${tela} · todo getElementById aponta para um id que existe`, () => {
    const mortos = [];
    for (const m of js.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (!ids.has(m[1])) mortos.push(m[1]);
    }
    assert.deepEqual([...new Set(mortos)], [],
      'estes ids são procurados e não existem no HTML — o código devolve null em silêncio');
  });

  test(`${tela} · nenhum endereço interno com "?t="`, () => {
    // `t` é o parâmetro do TOKEN PÚBLICO. Pôr ?t= num endereço do sistema faz a
    // tela ser tratada como acesso por link de cliente e recusar tudo.
    // Descoberto em 30/10/2026, quando usei ?t= como quebra-cache num teste.
    const achados = [...html.matchAll(/(href|src)="([^"]*\?[^"]*\bt=)[^"]*"/g)].map((m) => m[2]);
    assert.deepEqual(achados, [], 'use outro nome de parâmetro');
  });

  test(`${tela} · nenhum endereço fixo de localhost ou http://`, () => {
    const ruins = [...html.matchAll(/(?:href|src|url\(|fetch\(\s*)['"(]?(http:\/\/[^'")\s]+|https?:\/\/localhost[^'")\s]*)/g)]
      .map((m) => m[1])
      .filter((u) => !/^http:\/\/www\.w3\.org/.test(u));   // namespace de SVG é só identificador
    assert.deepEqual([...new Set(ruins)], [], 'endereço de desenvolvimento ficou na tela');
  });

  test(`${tela} · nenhum botão sem texto`, () => {
    const vazios = [...marcacao.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)]
      .filter((m) => {
        const dentro = m[1];
        const texto = dentro.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, 'x').trim();
        const temIcone = /<svg|<img|class="[^"]*icon/i.test(dentro);
        return !texto && !temIcone;
      })
      .map((m) => m[0].slice(0, 70));
    assert.deepEqual(vazios, [], 'botão sem texto e sem ícone: ninguém sabe o que ele faz');
  });
}
