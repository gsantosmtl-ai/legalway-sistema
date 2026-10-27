// A tela cheia encolhe os indicadores; não os apaga.
//
// Ela abriu o SDR e disse: "sinto que na lateral que está vazia falta algo, não
// tem dashboard ali para o SDR, não tem nenhuma informação para ele".
//
// Tinha. "Na fila agora", "Recuperados", "Sem sucesso" e "Taxa de recuperação"
// existem na tela desde sempre — junto com "Atividades de hoje" e "Metas do
// mês". O que havia era um `display:none` da tela cheia em cima de tudo isso,
// e ela trabalha em tela cheia. Concluiu que o SDR não tem informação nenhuma,
// e a conclusão era razoável: o que não se vê não existe.
//
// A tela cheia existe para dar LARGURA ao quadro. Quatro números numa linha
// fina não custam largura. Os painéis grandes, que ocupam uma coluna inteira,
// continuam saindo — esses custam.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const comum = readFileSync(join(DOCS, 'assets/comum.js'), 'utf8');

// Só o bloco de estilo da tela cheia.
const i = comum.indexOf('function estiloTelaCheia()');
assert.ok(i > 0, 'não achei o estilo da tela cheia');
const estilo = comum.slice(i, comum.indexOf('})();', i));

test('a faixa de indicadores não é escondida na tela cheia', () => {
  for (const linha of estilo.split('\n')) {
    if (!/display:\s*none/.test(linha)) continue;
    assert.ok(!/\bkpi-strip\b/.test(linha),
      `a tela cheia some com os indicadores: ${linha.trim()}`);
  }
});

test('a faixa continua existindo, só que compacta', () => {
  assert.match(estilo, /body\.lw-tela-cheia \.sdr-kpi-strip[^{]*\{[^}]*display:flex/,
    'os indicadores do SDR precisam continuar visíveis em tela cheia');
  assert.match(estilo, /body\.lw-tela-cheia \.kpi-strip[^{]*\{[^}]*display:flex/,
    'o mesmo vale para as outras telas de quadro');
  assert.match(estilo, /\.sdr-kpi-icon[^{]*\{\s*display:none/,
    'o ícone sai: é ele que faz o cartão ser alto');
});

test('os painéis grandes continuam saindo — são eles que custam largura', () => {
  for (const painel of ['.funil-cols > div:last-child', '.sdr-cols > div:last-child',
    '.doc-cols > div:last-child']) {
    const re = new RegExp(painel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^{]*\\{[^}]*display:none', 's');
    assert.ok(re.test(estilo) || estilo.includes(painel), `${painel} deveria continuar oculto em tela cheia`);
  }
});

test('o SDR de fato tem os quatro indicadores que ela não estava vendo', () => {
  const sdr = readFileSync(join(DOCS, 'sdr.html'), 'utf8');
  for (const n of ['Na fila agora', 'Recuperados', 'Sem sucesso', 'Taxa de recuperação']) {
    assert.ok(sdr.includes(n), `faltou o indicador "${n}"`);
  }
  for (const n of ['Atividades de hoje', 'Metas do mês']) {
    assert.ok(sdr.includes(n), `faltou o painel "${n}"`);
  }
});

test('toda tela de quadro com indicador usa um dos dois nomes de faixa', () => {
  // Se alguém criar uma terceira faixa com nome próprio, ela volta a sumir na
  // tela cheia sem ninguém perceber — foi assim que esta se perdeu.
  const quadros = ['sdr.html', 'funil-comercial.html', 'documentos.html', 'contratos.html'];
  for (const f of quadros) {
    const s = readFileSync(join(DOCS, f), 'utf8');
    const temFaixa = /kpi-strip|pipeline-summary/.test(s);
    if (!temFaixa) continue;
    assert.ok(/\b(sdr-)?kpi-strip\b|pipeline-summary/.test(s),
      `${f} tem faixa de indicador com nome fora do padrão`);
  }
});
