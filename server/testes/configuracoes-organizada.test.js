// Configurações, e as abas da ficha da Documentação.
//
// "Configurações tudo bagunçado, sem lógica, sem nada, sem cor, sem layout,
// sem designer, parece tudo jogado." Tinha razão, e era mensurável:
//
//   · cinco atalhos viviam como um PARÁGRAFO CORRIDO de links sublinhados,
//     quebrando em duas linhas logo abaixo do subtítulo;
//   · ONZE abas numa faixa horizontal que quebrava em duas linhas, cinco com
//     emoji e cinco sem;
//   · e um `max-width:680px` no painel que deixava metade da tela vazia.
//
// E a ficha da Documentação tinha doze abas em fila, sem agrupamento nenhum:
// "Credenciais" caía entre "Anexos" e "Protocolo".

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const cfg = readFileSync(join(DOCS, 'configuracoes.html'), 'utf8');
const doc = readFileSync(join(DOCS, 'documentos.html'), 'utf8');

test('o menu de Configurações fica em pé, ao lado do conteúdo', () => {
  assert.match(cfg, /\.config-grade\{[^}]*grid-template-columns:232px minmax\(0,1fr\)/,
    'menu à esquerda, conteúdo à direita');
  assert.match(cfg, /\.tabs2\{[^}]*flex-direction:column/,
    'onze abas deitadas quebravam em duas linhas');
  assert.match(cfg, /\.tabs2\{[^}]*position:sticky/,
    'o menu acompanha a rolagem: a lista de serviços é longa');
});

test('em tela estreita o menu volta a ser faixa, e rola', () => {
  const i = cfg.indexOf('@media (max-width:900px)');
  assert.ok(i > 0, 'falta o comportamento em tela estreita');
  const bloco = cfg.slice(i, i + 400);
  assert.match(bloco, /flex-direction:row/);
  assert.match(bloco, /overflow-x:auto/, 'rola em vez de quebrar em duas linhas');
});

test('o conteúdo deixa de ter teto de 680px', () => {
  assert.ok(!/\.panel\{[^}]*max-width:680px/.test(cfg),
    'era esse teto que deixava metade da tela vazia');
});

test('os cinco atalhos viram cartões, e nenhum se perdeu', () => {
  assert.match(cfg, /\.atalhos\{[^}]*grid-template-columns:repeat\(auto-fit/);
  for (const destino of ['importar.html', 'auditoria.html', 'seguranca.html',
    'ir-setores', 'ir-financeiro']) {
    assert.ok(cfg.includes(destino), `o atalho para ${destino} sumiu`);
  }
  const quantos = (cfg.match(/class="atalho"/g) || []).length;
  assert.equal(quantos, 5, `deveriam ser 5 atalhos, são ${quantos}`);
});

test('as abas de Configurações não têm mais emoji — nem algumas sim, outras não', () => {
  const abas = [...cfg.matchAll(/<div class="tab2[^"]*"[^>]*>([^<]*)<\/div>/g)].map((m) => m[1]);
  assert.ok(abas.length >= 9, `achei só ${abas.length} abas`);
  const comEmoji = abas.filter((t) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t));
  assert.deepEqual(comEmoji, [], 'cinco tinham e cinco não — era a mesma inconsistência dos títulos');
});

test('as doze abas da ficha da Documentação vão em grupos', () => {
  const i = doc.indexOf('<div class="drawer-tabs">');
  const faixa = doc.slice(i, doc.indexOf('</div>', doc.indexOf('data-dtab="historico"')) + 6);
  const abas = [...faixa.matchAll(/data-dtab="([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(abas.length, 12, `deveriam ser 12 abas, são ${abas.length}`);
  assert.equal(new Set(abas).size, 12, 'nenhuma aba pode aparecer duas vezes');
  const separadores = (faixa.match(/class="dtab-sep"/g) || []).length;
  assert.equal(separadores, 2, 'três grupos, logo dois traços');
  assert.match(doc, /\.dtab-sep\{[^}]*width:1px/, 'o separador é um traço, não uma aba');
});

test('Anotações continua logo depois de Resumo', () => {
  // Pedido dela, de antes: "preciso que tenha uma aba após o Resumo:
  // Anotações". O agrupamento não pode desfazer isso.
  const i = doc.indexOf('<div class="drawer-tabs">');
  const faixa = doc.slice(i, i + 1800);
  const abas = [...faixa.matchAll(/data-dtab="([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(abas[0], 'resumo');
  assert.equal(abas[1], 'anotacoes', 'Anotações tem que vir logo depois de Resumo');
});

test('o separador não é clicável nem é lido como aba', () => {
  const i = doc.indexOf('class="dtab-sep"');
  const tag = doc.slice(doc.lastIndexOf('<', i), doc.indexOf('>', i) + 1);
  assert.match(tag, /aria-hidden="true"/, 'leitor de tela não deve anunciar um traço');
  assert.ok(!/data-dtab/.test(tag), 'o separador não pode virar uma aba sem conteúdo');
});
