// Medido em 30/10/2026 num viewport de 375px: a faixa de indicadores de
// Clientes pedia 4 colunas de ~107px cada, somando 472px, e sobrava 161px
// fora da tela.
//
// A correção NÃO pode ser um @media. O comentário do próprio comum.js explica
// por quê: quando a página estoura, o Chrome do celular ESTICA a janela para
// caber o conteúdo — a Agenda reportava innerWidth de 933 numa tela de 390 —
// e aí o @media de max-width deixa de valer justamente onde mais precisa.
// Vira um laço: estoura, a regra não aplica, continua estourando.
//
// Por isso a regra tem de estar presa à classe `lw-celular`, que é posta por
// JS a partir de screen.width (o aparelho, que não estica).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');

test('a faixa de KPI tem regra de celular presa à classe, não ao @media', () => {
  const regra = comum.match(/html\.lw-celular \.kpi-strip[\s\S]{0,160}?\}/);
  assert.ok(regra, 'não achei regra de celular para a faixa de KPI em comum.js');
  assert.match(regra[0], /kpi-strip2/, 'o .kpi-strip2 (tela de Clientes) ficou de fora');
  // 31/10: minmax(0,…) e não "1fr" cru. "1fr" tem mínimo automático de
  // min-content: a faixa vira duas colunas e, se o rótulo for comprido,
  // cada coluna fica maior do que a metade e a segunda sai da tela.
  assert.match(regra[0], /repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    'duas colunas é o que cabe em 375px — e com permissão de encolher');
  assert.match(regra[0], /!important/,
    'sem !important a regra da própria tela ganha, porque é mais específica no arquivo dela');
});

test('nenhuma tela declara a faixa de KPI com 4 colunas sem a rede do comum.js', () => {
  // Não proíbo 4 colunas no desktop — proíbo que isso fique sem a regra de
  // celular que a derruba para 2.
  const dir = new URL('../../docs/', import.meta.url);
  const culpadas = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    const txt = readFileSync(new URL(f, dir), 'utf8');
    const m = txt.match(/\.(kpi-strip\d*)\s*\{[^}]*grid-template-columns:\s*repeat\((\d+)/);
    if (!m) continue;
    if (Number(m[2]) < 3) continue;
    // a classe precisa estar coberta pela regra central
    const coberta = new RegExp('html\\.lw-celular[^{]*\\.' + m[1] + '\\b').test(comum)
      || new RegExp('\\.' + m[1] + '[,{]').test(comum.slice(comum.indexOf('lw-celular .kpi-strip')));
    if (!coberta) culpadas.push(`${f}: .${m[1]} com ${m[2]} colunas e sem regra de celular`);
  }
  assert.deepEqual(culpadas, [], culpadas.join('\n'));
});
