// O filtro de Dia/Semana/Mês/Período da tela do Financeiro.
//
// O teste lê as funções da PRÓPRIA tela, em vez de guardar uma cópia: cópia
// envelhece em silêncio e passaria a testar código que não roda mais.
//
// Vale testar porque é comparação de dinheiro: um "↓ 40% vs mês anterior"
// errado faz alguém tomar decisão sobre um número inventado, e ninguém
// desconfia de um gráfico.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tela = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');
const pega = (nome) => {
  const m = tela.match(new RegExp(`(function ${nome}\\([^)]*\\)\\{[\\s\\S]*?\\n\\})`));
  assert.ok(m, `não achei ${nome}() em docs/financeiro.html — a tela mudou?`);
  return m[1];
};

const dir = mkdtempSync(join(tmpdir(), 'lw-periodo-'));
const arquivo = join(dir, 'periodo.mjs');
writeFileSync(arquivo,
  `export let modoPeriodo='mes', diaSelecionado='2026-10-20', mesSelecionado='2026-10', periodoDe='', periodoAte='';
   export function set(o){ ({modoPeriodo=modoPeriodo, diaSelecionado=diaSelecionado, mesSelecionado=mesSelecionado, periodoDe=periodoDe, periodoAte=periodoAte} = o); }
   ${pega('semanaDoDia')}
   ${pega('noPeriodoSelecionado')}
   ${pega('noPeriodoAnterior')}
   export { noPeriodoSelecionado, noPeriodoAnterior };`);
const P = await import(arquivo);

test('mês: o anterior é o mês de trás, inclusive virando o ano', () => {
  P.set({ modoPeriodo: 'mes', mesSelecionado: '2026-10' });
  assert.equal(P.noPeriodoSelecionado('2026-10-15'), true);
  assert.equal(P.noPeriodoSelecionado('2026-09-15'), false);
  assert.equal(P.noPeriodoAnterior('2026-09-15'), true);
  assert.equal(P.noPeriodoAnterior('2026-10-15'), false);
  P.set({ modoPeriodo: 'mes', mesSelecionado: '2026-01' });
  assert.equal(P.noPeriodoAnterior('2025-12-10'), true, 'janeiro tem de comparar com dezembro do ano anterior');
  assert.equal(P.noPeriodoAnterior('2026-12-10'), false);
});

test('dia: o anterior é a véspera, inclusive virando o mês', () => {
  P.set({ modoPeriodo: 'dia', diaSelecionado: '2026-10-20' });
  assert.equal(P.noPeriodoAnterior('2026-10-19'), true);
  assert.equal(P.noPeriodoAnterior('2026-10-18'), false);
  assert.equal(P.noPeriodoAnterior('2026-10-20'), false);
  P.set({ modoPeriodo: 'dia', diaSelecionado: '2026-11-01' });
  assert.equal(P.noPeriodoAnterior('2026-10-31'), true, 'a véspera de 01/11 é 31/10');
});

test('semana: domingo a sábado, e a anterior são os 7 dias de trás', () => {
  P.set({ modoPeriodo: 'semana', diaSelecionado: '2026-10-20' });   // terça
  assert.equal(P.noPeriodoSelecionado('2026-10-18'), true);          // domingo
  assert.equal(P.noPeriodoSelecionado('2026-10-24'), true);          // sábado
  assert.equal(P.noPeriodoAnterior('2026-10-11'), true);
  assert.equal(P.noPeriodoAnterior('2026-10-17'), true);
  assert.equal(P.noPeriodoAnterior('2026-10-18'), false, 'o domingo atual não pode cair na semana anterior');
  assert.equal(P.noPeriodoAnterior('2026-10-10'), false);
});

test('período: o anterior tem o MESMO tamanho, logo antes', () => {
  // 10 dias (01 a 10) → os 10 dias anteriores são 21/09 a 30/09.
  // Comparar uma janela de 3 dias com um mês daria variação sem sentido.
  P.set({ modoPeriodo: 'personalizado', periodoDe: '2026-10-01', periodoAte: '2026-10-10' });
  assert.equal(P.noPeriodoSelecionado('2026-10-05'), true);
  assert.equal(P.noPeriodoAnterior('2026-09-30'), true);
  assert.equal(P.noPeriodoAnterior('2026-09-21'), true);
  assert.equal(P.noPeriodoAnterior('2026-09-20'), false);
  assert.equal(P.noPeriodoAnterior('2026-10-01'), false);
});

test('sem data não entra em período nenhum', () => {
  P.set({ modoPeriodo: 'personalizado', periodoDe: '2026-10-01', periodoAte: '' });
  assert.equal(P.noPeriodoAnterior('2026-09-30'), false, 'sem as duas pontas não há como comparar');
  assert.equal(P.noPeriodoAnterior(''), false);
  assert.equal(P.noPeriodoAnterior(null), false);
});
