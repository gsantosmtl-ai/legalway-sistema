// O fechamento do mês: todos os departamentos num documento só.
//
// O pedido: "fazer algo bem mais completo com dados, gráficos... e que tenha a
// possibilidade de gerar pdf, gerar apresentação, gerar planilha, tudo. que
// possa gerar um relatório único do fechamento do mês de todos os
// departamentos".
//
// O desenho: nada aqui recalcula nada. Cada aba já sabe fazer a conta dela;
// o fechamento roda as nove e junta o que cada uma desenhou. Número calculado
// duas vezes acaba divergindo, e correção numa aba entra no fechamento sozinha.
//
// O risco que este arquivo guarda é outro, e é o sério: o fechamento NÃO PODE
// herdar filtro nem busca da tela. Um documento de fechamento com linhas
// escondidas em silêncio não é um documento incompleto — é um número errado
// com cara de certo, e é com ele que o escritório fecha o mês.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TELA = join(dirname(fileURLToPath(import.meta.url)), '../../docs/relatorios.html');
const html = readFileSync(TELA, 'utf8');

function corpo(nome) {
  const i = html.indexOf(`function ${nome}(`);
  assert.ok(i > 0, `não achei ${nome}`);
  let nivel = 0, fim = -1;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') nivel++;
    else if (html[k] === '}') { nivel--; if (nivel === 0) { fim = k + 1; break; } }
  }
  return html.slice(i, fim);
}

test('o fechamento cobre os nove departamentos', () => {
  const i = html.indexOf('const SECOES_FECHAMENTO = [');
  const bloco = html.slice(i, html.indexOf('];', i));
  for (const dep of ['geral', 'comercial', 'conversao', 'leads', 'sdr',
    'receber', 'pagar', 'fluxo', 'documentos']) {
    assert.ok(bloco.includes(`'${dep}'`), `faltou ${dep} no fechamento`);
  }
  // Todas as abas da tela precisam estar no fechamento: uma aba que existe e
  // fica de fora é um departamento que some do fechamento sem aviso.
  const abas = [...html.matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1])
    .filter((t) => t !== 'fechamento');
  for (const aba of new Set(abas)) {
    assert.ok(bloco.includes(`'${aba}'`), `a aba "${aba}" existe na tela e não entra no fechamento`);
  }
});

test('o fechamento não recalcula nada — reaproveita o render de cada aba', () => {
  const f = corpo('renderFechamento');
  assert.match(f, /fns\[chave\]\(\)/, 'tem que chamar o render da própria aba');
  assert.ok(!/reduce\(|filter\(.*dataAssinatura/.test(f),
    'conta refeita aqui diverge da aba — o fechamento só junta');
});

test('o fechamento ignora o filtro de categoria e devolve ele depois', () => {
  const f = corpo('renderFechamento');
  assert.match(f, /filtroCategoria = ''/, 'o filtro tem que sair');
  assert.match(f, /filtroCategoria = categoriaGuardada/, 'e voltar como estava');
});

test('a busca não esconde linha nenhuma do fechamento', () => {
  const b = corpo('aplicarBuscaNaTabela');
  const i = b.indexOf("currentTab === 'fechamento'");
  assert.ok(i > 0, 'a busca precisa tratar o fechamento à parte');
  assert.ok(i < b.indexOf('tr.style.display'),
    'a saída pelo fechamento tem que vir ANTES de esconder qualquer linha');
  assert.match(b, /não se aplica ao fechamento/, 'e precisa avisar quem digitou');
});

test('uma seção que quebra não derruba o documento inteiro', () => {
  const f = corpo('renderFechamento');
  assert.match(f, /catch\s*\(e\)/, 'cada seção roda protegida');
  assert.match(f, /As demais continuam no documento/,
    'o documento sai com as outras e diz qual faltou');
});

test('controle de tela não entra num documento que vai ser impresso', () => {
  const f = corpo('renderFechamento');
  assert.match(f, /querySelectorAll\('\.side-panel-geral[^']*'\)\.forEach\(el => el\.remove\(\)\)/);
  for (const t of ['button', 'input', 'select']) {
    assert.ok(f.includes(t), `${t} precisa ser removido da cópia`);
  }
});

test('a planilha nomeia as abas pelo departamento, não "Tabela 1"', () => {
  const e = corpo('exportarExcel');
  assert.match(e, /getAttribute\('data-planilha'\)/);
  assert.match(e, /wb\.SheetNames\.includes\(nomeAba\)/,
    'dois departamentos com o mesmo nome de aba quebram o arquivo do Excel');
  assert.match(corpo('renderFechamento'), /setAttribute\('data-planilha', titulo\)/);
});

test('a apresentação sai deitada, uma seção por página', () => {
  const a = corpo('exportarApresentacao');
  assert.match(a, /orientation:\s*'landscape'/);
  assert.match(a, /before:\s*'\.fm-sec'/, 'cada departamento começa numa página');
  assert.match(a, /fm-slides/, 'o modo apresentação precisa do estilo próprio');
});

test('o documento diz de que período é e quando foi gerado', () => {
  const f = corpo('renderFechamento');
  assert.match(f, /periodoPorExtenso\(\)/, 'relatório sem período é relatório de nada');
  assert.match(f, /Gerado em/);
  assert.match(corpo('periodoPorExtenso'), /mesSelecionado/, 'tem que ler o mês escolhido na tela');
});

test('o botão falso "em breve" saiu', () => {
  assert.ok(!/em breve/.test(html),
    'um botão desligado que promete algo que nunca chega ensina a não confiar na tela');
});

test('o fechamento não chama função que não existe nesta tela', () => {
  for (const fn of ['renderGeral', 'renderReceber', 'renderPagar', 'renderFluxo', 'renderLeads',
    'renderComercial', 'renderConversao', 'renderSdr', 'renderDocumentos',
    'periodoPorExtenso', 'registrarRelatorioGerado']) {
    assert.ok(new RegExp(`function ${fn}\\(`).test(html), `${fn} não existe em relatorios.html`);
  }
  assert.ok(!/mesAtual/.test(html), 'a variável do mês é mesSelecionado, não mesAtual');
});
