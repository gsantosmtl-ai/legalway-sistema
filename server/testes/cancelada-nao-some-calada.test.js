// Parcela cancelada não pode sumir calada.
//
// Ela disse: "isso tudo que é cancelado não aparece no financeiro contas
// futuras". É a explicação de como 36 parcelas de três clientes — US$
// 18.710,00 — ficaram canceladas aqui e em aberto no Bling por meses, sem
// ninguém ver.
//
// Cancelar tirava a parcela da lista E do total, e não sobrava número nenhum
// dizendo que ela existiu. Dinheiro que deixa de ser cobrado é uma decisão;
// decisão sem rastro na tela vira esquecimento.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(AQUI, '../../docs/financeiro.html'), 'utf8');

const receber = (() => {
  const i = html.indexOf('function renderReceber()');
  assert.ok(i > 0, 'não achei renderReceber');
  return html.slice(i, html.indexOf('function renderPagar', i));
})();

test('o período mostra quanto foi cancelado, em dinheiro e em parcelas', () => {
  assert.ok(/const canceladasDoPeriodo = doMes\.filter\(c=>c\.status==='Cancelado'\)/.test(receber),
    'o Financeiro parou de contar as parcelas canceladas do período');
  assert.ok(/totalCancelado/.test(receber) && /card-canceladas-receber/.test(receber),
    'falta o cartão que mostra o valor cancelado');
  assert.ok(/deixaram de ser cobradas/.test(receber),
    'o cartão precisa dizer o que o número significa, não só mostrar um valor');
});

test('dá para ver quais são', () => {
  assert.ok(/\['canceladas','Canceladas'\]/.test(receber), 'falta o filtro "Canceladas"');
  assert.ok(/filtroChip = 'canceladas'/.test(receber), 'clicar no cartão precisa levar à lista');
  assert.ok(/filtroChip === 'canceladas'\) lista = lista\.filter\(c => c\.status==='Cancelado'\)/.test(html),
    'o filtro "Canceladas" não filtra nada');
});

// O cartão aparece sempre, mas apagado quando é zero — é a mesma regra dos
// outros indicadores da casa: zero não pode gritar igual a um problema.
test('zero não vira alarme', () => {
  assert.ok(/canceladasDoPeriodo\.length \? ' clicavel' : ' lw-zero'/.test(receber),
    'o cartão de canceladas precisa ficar apagado quando não há nenhuma');
});

// A lista de trabalho continua limpa: quem procura o que cobrar não quer
// cancelado no meio. Só "Todas" e "Canceladas" mostram.
test('os filtros de trabalho continuam sem as canceladas', () => {
  const i = html.indexOf('function listaReceberFiltrada');
  const corpo = html.slice(i, html.indexOf('}', html.indexOf('return lista', i)));
  assert.ok(/filtroChip !== 'todas'\) lista = lista\.filter\(c => c\.status!=='Cancelado'\)/.test(corpo),
    'cancelada voltou a aparecer no meio do que se cobra');
});
