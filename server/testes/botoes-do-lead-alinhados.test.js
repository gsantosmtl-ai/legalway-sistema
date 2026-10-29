// Os botões da coluna Ações têm que cair sempre na mesma posição.
//
// Relato dela, olhando a Entrada de Leads: "layout bagunçado, botões fora de
// ordem".
//
// O que acontecia: a coluna era um flex e os botões entravam na fila conforme
// existissem. O ✉️ (copiar a mensagem pronta) só aparece para alguns leads e
// entra NO MEIO, empurrando o 📅 e o ✓ para a direita. E lead com dono ganha
// dois botões (⇄ ↩) onde o lead sem dono tem um (✓). Resultado: nenhuma linha
// alinhava com a de cima, e como a coluna não tinha largura reservada, os
// botões ainda vazavam para fora do cartão branco.
//
// Agora a coluna é uma grade de seis lugares fixos e cada botão declara o seu
// lugar. Botão que não existe deixa o lugar vazio em vez de empurrar os outros.
//
// Este teste falha se alguém voltar o flex, acrescentar um botão sem lugar, ou
// puser dois botões diferentes no mesmo lugar.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(AQUI, '../../docs/entrada-leads.html'), 'utf8');

// O único lugar que DOIS botões podem dividir: o lead ou tem dono ou não tem,
// então "assumir" e "transferir" nunca aparecem na mesma linha.
const DIVIDEM = { 'sl-posse': ['data-assumir', 'data-transferir'] };

function botoesDaColuna() {
  const i = html.indexOf('<div class="acoes-row">');
  assert.ok(i > 0, 'não achei a coluna de ações da Entrada de Leads');
  const bloco = html.slice(i, html.indexOf('</div></td>', i));
  const achados = [];
  for (const m of bloco.matchAll(/class="acao-btn([^"]*)"([^>]*)>/g)) {
    const classes = m[1].trim().split(/\s+/).filter(Boolean);
    const atrib = /data-(\w+)=/.exec(m[2]);
    achados.push({ classes, acao: atrib ? 'data-' + atrib[1] : 'link' });
  }
  return achados;
}

test('a coluna de ações é uma grade de lugares fixos, não uma fila', () => {
  assert.ok(/\.acoes-row\{[^}]*display:grid/.test(html),
    'a coluna de ações voltou a ser uma fila — os botões vão desalinhar de novo');
  assert.ok(/\.acoes-row\{[^}]*grid-template-columns:repeat\((\d+), *\d+px\)/.test(html),
    'a grade perdeu o número fixo de lugares');
});

test('todo botão da coluna declara em que lugar ele fica', () => {
  const botoes = botoesDaColuna();
  assert.ok(botoes.length >= 6, `esperava pelo menos 6 botões, achei ${botoes.length}`);
  for (const b of botoes) {
    const lugar = b.classes.filter((c) => c.startsWith('sl-'));
    assert.strictEqual(lugar.length, 1,
      `o botão ${b.acao} tem ${lugar.length} lugar(es) declarado(s) — tem que ter exatamente 1`);
    assert.ok(new RegExp('\\.' + lugar[0] + '\\{[^}]*grid-column:\\d+').test(html),
      `o lugar ${lugar[0]} do botão ${b.acao} não existe no CSS`);
  }
});

test('dois botões só dividem um lugar quando nunca aparecem juntos', () => {
  const porLugar = new Map();
  for (const b of botoesDaColuna()) {
    const lugar = b.classes.find((c) => c.startsWith('sl-'));
    if (!porLugar.has(lugar)) porLugar.set(lugar, []);
    porLugar.get(lugar).push(b.acao);
  }
  for (const [lugar, acoes] of porLugar) {
    if (acoes.length === 1) continue;
    const esperado = DIVIDEM[lugar];
    assert.ok(esperado, `o lugar ${lugar} ficou com ${acoes.length} botões (${acoes.join(', ')})`
      + ' e não está na lista dos que podem dividir — eles vão se sobrepor na tela');
    assert.strictEqual([...acoes].sort().join(','), [...esperado].sort().join(','),
      `o lugar ${lugar} devia ser dividido por ${esperado.join(' e ')}, mas está com ${acoes.join(', ')}`);
  }
});

test('a coluna tem largura reservada para todos os lugares', () => {
  const grade = /grid-template-columns:repeat\((\d+), *(\d+)px\)/.exec(html);
  const vao = /\.acoes-row\{[^}]*gap:(\d+)px/.exec(html);
  const col = /th:last-child, *\.leads-table td:last-child\{ *width:(\d+)px/.exec(html);
  assert.ok(grade && vao && col, 'faltou a grade, o espaçamento ou a largura da coluna');
  const [, n, largura] = grade.map(Number);
  const preciso = n * largura + (n - 1) * Number(vao[1]);
  assert.ok(Number(col[1]) >= preciso,
    `a coluna tem ${col[1]}px mas os ${n} botões precisam de ${preciso}px — eles vão vazar para fora do cartão`);
});
