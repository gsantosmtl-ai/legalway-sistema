// "Colocar um botão para exportar tanto as opções: contratos assinados,
// inadimplência, contratos cancelados, tudo para exportar e gerar PDF."
//
// O PDF sai pela impressão do próprio navegador ("Salvar como PDF"). Nenhuma
// biblioteca entra no sistema por isso: o arquivo que ela manda para o contador
// ou para o sócio não vale uma dependência nova em sete telas, e o sistema
// inteiro roda sem passo de build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const fin = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');

function csvDe(colunas, linhas) {
  const i = comum.indexOf('const escCsv = (v)=>');
  const fim = comum.indexOf('window.LW.imprimirPdf');
  const ctx = { window: { LW: {} }, URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} },
    Blob: function (partes) { this.texto = partes[0]; }, document: null };
  ctx.window.LW = {};
  vm.createContext(ctx);
  let capturado = null;
  ctx.Blob = function (partes) { capturado = partes[0]; };
  ctx.document = { createElement: () => ({ click() {}, remove() {}, style: {} }), body: { appendChild() {} } };
  ctx.setTimeout = () => {};
  vm.runInContext(comum.slice(i, fim), ctx);
  ctx.window.LW.baixarCsv('x', colunas, linhas);
  return capturado;
}

test('o CSV abre no Excel em português com as colunas separadas', () => {
  const t = csvDe(['Cliente', 'Valor'], [['Maria', 'US$ 1.000,00']]);
  assert.ok(t.startsWith('﻿'), 'sem o BOM o Excel estraga os acentos');
  assert.match(t, /Cliente;Valor/, 'ponto e vírgula, senão o Excel-pt joga tudo numa célula só');
  assert.match(t, /\r\n/, 'quebra de linha do Windows');
});

test('vírgula, aspas e quebra de linha no texto não partem a coluna', () => {
  // Nome de cliente com vírgula é comum; observação com aspas também.
  const t = csvDe(['A', 'B'], [['Silva, Maria', 'ele disse "ok"'], ['com\nquebra', 'x']]);
  assert.match(t, /"Silva, Maria"/, 'vírgula no texto precisa de aspas');
  assert.match(t, /"ele disse ""ok"""/, 'aspas se escapam dobrando');
  assert.match(t, /"com\nquebra"/, 'quebra de linha dentro do campo fica entre aspas');
});

test('o PDF é a impressão do navegador, sem biblioteca nova', () => {
  assert.match(comum, /window\.LW\.imprimirPdf = \(titulo, subtitulo, colunas, linhas, resumo\)=>/,
    'falta o exportador');
  assert.match(comum, /janela\.print\(\)/, 'é a impressão do navegador');
  assert.ok(!/jspdf|pdfmake|html2pdf/i.test(comum), 'nenhuma biblioteca de PDF pode ter entrado');
});

test('a folha repete o cabeçalho e não corta linha no meio', () => {
  // Numa lista de 200 contratos, a partir da página 2 ninguém sabe mais qual
  // coluna é qual.
  const i = comum.indexOf('window.LW.imprimirPdf');
  const corpo = comum.slice(i, comum.indexOf('window.LW.botoesDeExportar'));
  assert.match(corpo, /thead\{ display:table-header-group; \}/, 'o cabeçalho precisa repetir');
  assert.match(corpo, /tr\{ page-break-inside:avoid; \}/, 'linha partida entre páginas é ilegível');
  assert.match(corpo, /@page \{ size: A4 landscape/, 'tabela larga em retrato não cabe');
});

test('coluna de dinheiro sai alinhada à direita', () => {
  // É assim que se confere uma coluna de valores; desalinhada ninguém soma.
  const i = comum.indexOf('const numerica = colunas.map');
  const linha = comum.slice(i, comum.indexOf('const janela', i));
  assert.match(linha, /\^\[-\+\]\?\(US\\\$\\s\*\)\?\[\\d\.,\]\+%\?\$/, 'precisa reconhecer US$ e porcentagem');
  assert.match(linha, /t === '' \|\|/, 'célula vazia não desclassifica a coluna');
  assert.match(comum, /class="\$\{numerica\[i\]\?'num':''\}"/, 'a classe tem que chegar na célula');
});

test('o pop-up bloqueado avisa em vez de não fazer nada', () => {
  assert.match(comum, /if\(!janela\)\{[^}]*bloqueou a janela de impressão/,
    'botão que não faz nada é pior do que botão que não existe');
});

test('as três listas que ela pediu têm os botões', () => {
  // Contratos assinados e cancelados usam a janela compartilhada; a
  // inadimplência tem a dela.
  assert.match(comum, /\$\{LW\.botoesDeExportar\('lw-lc'\)\}/, 'falta na lista de contratos');
  assert.match(comum, /LW\.ligarExportar\(modal, 'lw-lc'/, 'e ligar os botões');
  assert.match(fin, /\$\{LW\.botoesDeExportar\('in-exp'\)\}/, 'falta na lista de inadimplência');
  assert.match(fin, /LW\.ligarExportar\(modal, 'in-exp'/, 'e ligar os botões');
});

test('exporta o que está na tela, não a lista inteira', () => {
  // Se ela filtrou por um vendedor, o arquivo é daquele vendedor. Exportar
  // outra coisa do que se vê é a forma mais rápida de mandar o número errado
  // para fora do escritório.
  const i = comum.indexOf("LW.ligarExportar(modal, 'lw-lc'");
  const corpo = comum.slice(i, comum.indexOf('});', i));
  assert.match(corpo, /const visiveis = \(filtro \? lista\.filter\(c => nomeDe\(c\) === filtro\) : lista\)/,
    'a lista de contratos precisa respeitar o filtro');
  assert.match(corpo, /subtitulo: filtro \? 'Vendedor: ' \+ filtro : 'Todos os vendedores'/,
    'e dizer no papel qual recorte é');

  const j = fin.indexOf("LW.ligarExportar(modal, 'in-exp'");
  const corpo2 = fin.slice(j, fin.indexOf('});', j));
  assert.match(corpo2, /filtroVend \? grupos\.filter\(g=> vendDe\(g\) === filtroVend\) : grupos/,
    'a inadimplência também');
});

test('a inadimplência sai parcela a parcela, com o atraso', () => {
  // Um cliente com cinco parcelas em aberto é cinco linhas: o contador precisa
  // saber qual venceu quando.
  const j = fin.indexOf("LW.ligarExportar(modal, 'in-exp'");
  const corpo = fin.slice(j, fin.indexOf('});', j));
  assert.match(corpo, /for\(const p2 of g\.parcelas\)/, 'uma linha por parcela');
  assert.match(corpo, /diasAtraso\(p2\.vencimento\) \+ 'd'/, 'com os dias de atraso');
  assert.match(corpo, /fmtMoney\(saldoDe\(p2\)\)/, 'e o que ainda falta, não o valor cheio');
});
