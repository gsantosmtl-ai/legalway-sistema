// A coluna "Pausado" no quadro de Contratos.
//
// Pedido dela: "colocar uma etapa aqui dos contratos pausados".
//
// Pausar já existia — suspende as parcelas em aberto e grava `c.pausa`. O que
// não existia era VER: o contrato pausado ficava no meio dos assinados,
// idêntico a quem está pagando em dia.
//
// Pausado NÃO virou uma etapa nova do contrato. É um estado por cima da etapa,
// lido de `c.pausa`. Assim nada precisa ser migrado nos 253 contratos que já
// existem, e um contrato pausado continua sendo um contrato assinado para
// efeito de faturamento. Estes testes existem para que isso não se perca.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const TELA = join(AQUI, '../../docs/contratos.html');
const html = readFileSync(TELA, 'utf8');

function corpoDaFuncao(nome) {
  const i = html.indexOf(`function ${nome}(`);
  assert.ok(i > 0, `não achei a função ${nome} em contratos.html`);
  let nivel = 0, fim = -1;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') nivel++;
    else if (html[k] === '}') { nivel--; if (nivel === 0) { fim = k + 1; break; } }
  }
  assert.ok(fim > 0, `não consegui fechar a função ${nome}`);
  return html.slice(i, fim);
}

function montar(etapas) {
  const ctx = createContext({ Date, Number, Array, String, Math, JSON });
  runInContext(
    `let ETAPAS = ${JSON.stringify(etapas)};\n` +
    `const COL_PAUSADO = 'Pausado';\n` +
    corpoDaFuncao('estaPausado') + '\n' +
    corpoDaFuncao('colunasDoQuadro') + '\n' +
    `globalThis.API = { estaPausado, colunasDoQuadro };`, ctx);
  return ctx.API;
}

const PADRAO = ['A gerar', 'Em preparação', 'Aguardando assinatura', 'Assinado', 'Cancelado'];

test('a coluna Pausado entra logo depois de Assinado', () => {
  const { colunasDoQuadro } = montar(PADRAO);
  assert.strictEqual(colunasDoQuadro().join(' · '),
    'A gerar · Em preparação · Aguardando assinatura · Assinado · Pausado · Cancelado');
});

// As etapas vêm das Regras e ela pode renomeá-las. Se um dia não houver
// "Assinado", a coluna não some nem vai parar depois de "Cancelado".
test('sem a etapa Assinado, Pausado entra antes de Cancelado', () => {
  const { colunasDoQuadro } = montar(['Rascunho', 'Fechado', 'Cancelado']);
  assert.strictEqual(colunasDoQuadro().join(' · '), 'Rascunho · Fechado · Pausado · Cancelado');
});

test('se Pausado virar etapa de verdade nas Regras, não aparece duas vezes', () => {
  const { colunasDoQuadro } = montar(['Assinado', 'Pausado', 'Cancelado']);
  assert.strictEqual(colunasDoQuadro().join(' · '), 'Assinado · Pausado · Cancelado');
});

test('pausado é quem tem c.pausa — não quem tem uma etapa chamada assim', () => {
  const { estaPausado } = montar(PADRAO);
  assert.strictEqual(estaPausado({ etapa: 'Assinado', pausa: { desde: '2026-09-12' } }), true);
  assert.strictEqual(estaPausado({ etapa: 'Assinado' }), false);
  assert.strictEqual(estaPausado(null), false);
});

// Cancelar NÃO apaga `c.pausa`. Sem esta regra, todo contrato que foi pausado
// antes de ser cancelado sumiria da coluna Cancelado e reapareceria em
// Pausado — o quadro mostraria como parado o que na verdade acabou.
test('contrato cancelado continua em Cancelado, mesmo tendo sido pausado antes', () => {
  const { estaPausado } = montar(PADRAO);
  assert.strictEqual(estaPausado({ etapa: 'Cancelado', pausa: { desde: '2026-09-12' } }), false);
});

// A faixa do topo e os cartões do resumo contam "Assinados" incluindo os
// pausados, de propósito: um contrato pausado não deixou de ser assinado, e é
// esse número que vira faturamento. Quem garante isso é o filtro por etapa.
test('o total de assinados não é filtrado por pausa', () => {
  const trecho = html.slice(html.indexOf('function render()'), html.indexOf('renderResumoContratos();'));
  assert.ok(/const assinados = list\.filter\(c=>c\.etapa==='Assinado'\);/.test(trecho),
    'o total de assinados deixou de contar os pausados');
});

// O quadro tira o pausado da coluna da etapa dele; sem isso o mesmo contrato
// apareceria duas vezes.
test('a coluna da etapa exclui os pausados', () => {
  assert.ok(/c\.etapa === etapa && !estaPausado\(c\)/.test(html),
    'a coluna da etapa voltou a incluir os contratos pausados');
});
