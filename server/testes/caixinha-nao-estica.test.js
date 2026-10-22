// "Bagunçado" — a seção "Portal do cliente" das regras, com as caixinhas de
// marcar soltas no meio da tela e o texto empurrado para a outra ponta.
//
// A causa é uma regra que parece inofensiva: `input { width: 100% }`. Ela vale
// para TODO input, inclusive checkbox e radio, que então ocupam a linha inteira
// e jogam o rótulo para onde sobrou espaço.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DOCS = new URL('../../docs/', import.meta.url).pathname;

test('nenhuma tela estica caixinha de marcar', () => {
  const culpadas = [];
  for (const tela of readdirSync(DOCS).filter(f => f.endsWith('.html'))) {
    const src = readFileSync(join(DOCS, tela), 'utf8');
    // Regra que alcança todo input (não um seletor específico como .busca input).
    const geral = /(^|\n)\s*input(,[^{\n]*)?\{[^}]*width:\s*100%/.test(src);
    if (!geral) continue;
    const conserto = /input\[type="checkbox"\][^{]*\{[^}]*width:\s*auto/.test(src);
    if (!conserto) culpadas.push(tela);
  }
  assert.deepEqual(culpadas, [],
    'width:100% em todo input estica checkbox e radio — some o alinhamento e o rótulo vai parar longe:\n  '
    + culpadas.join('\n  '));
});

test('o booleano das regras é uma frase com a caixinha na frente', () => {
  const cfg = readFileSync(join(DOCS, 'configuracoes.html'), 'utf8');
  const i = cfg.indexOf("if(c.tipo === 'booleano')");
  const linha = cfg.slice(i, cfg.indexOf('\n', i));
  assert.match(linha, /<label class="field-row" for="\$\{id\}"/,
    'a linha inteira tem que ser clicável — alvo de 14px é alvo de quem não erra nunca');
  assert.match(linha, /display:flex; align-items:flex-start/, 'texto de duas linhas não pode desalinhar a caixinha');
  assert.match(linha, /font-size:13px; color:var\(--ink\)/,
    'é uma frase que se lê, não um rótulo de campo em cinza miúdo');
});
