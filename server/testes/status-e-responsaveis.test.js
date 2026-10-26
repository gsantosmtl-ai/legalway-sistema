// §4, §5, §6 e §7 da lista dela.
//
// §6: "o status deverá ser obtido da fonte oficial do contrato, e não de um
// texto independente salvo no card". O card mostrava a situação da FICHA, que é
// outra coisa — dá para ter ficha cancelada em contrato vivo (card duplicado
// que alguém cancelou) e contrato cancelado com ficha ativa, e era este o caso
// que fazia alguém trabalhar num processo que não existe mais.
//
// §5: onde cada status aparece. Pausado continua na Documentação (o processo
// anda) e sai do Contas a Receber (a cobrança está suspensa). Cancelado sai dos
// dois, sem nada ser apagado.
//
// §4: dois responsáveis que não se confundem — quem EXECUTA e quem ACOMPANHA.
//
// §7: filtrar por interno/externo sem mexer na posição dos cards.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { statusDoContrato, motivoDoStatus, noFunilDeDocumentos, noContasAReceber }
  from '../src/status-contrato.js';

const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const fin = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');
const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const corpoDe = (fonte, de, ate) => {
  const i = fonte.indexOf(de);
  assert.ok(i >= 0, 'não achei: ' + de);
  return fonte.slice(i, fonte.indexOf(ate, i));
};

// ---------------------------------------------------------------- §5 e §6
const CASOS = [
  { nome: 'assinado', c: { etapa: 'Assinado' }, status: 'ativo', doc: true, receber: true },
  { nome: 'pausado', c: { etapa: 'Assinado', pausa: { desde: '2026-10-01', motivo: 'cliente sem renda' } },
    status: 'pausado', doc: true, receber: false },
  { nome: 'cancelado', c: { etapa: 'Cancelado' }, status: 'cancelado', doc: false, receber: false },
  { nome: 'pausado e depois cancelado', c: { etapa: 'Cancelado', pausa: { desde: 'x' } },
    status: 'cancelado', doc: false, receber: false },
  { nome: 'contrato ausente', c: null, status: 'ativo', doc: true, receber: true },
  { nome: 'pausa com formato errado', c: { etapa: 'Assinado', pausa: 'texto' },
    status: 'ativo', doc: true, receber: true },
];

test('o status sai do contrato, e cancelado ganha da pausa', () => {
  for (const k of CASOS) {
    assert.equal(statusDoContrato(k.c), k.status, k.nome);
    assert.equal(noFunilDeDocumentos(k.c), k.doc, 'documentação — ' + k.nome);
    assert.equal(noContasAReceber(k.c), k.receber, 'contas a receber — ' + k.nome);
  }
  assert.equal(motivoDoStatus(CASOS[1].c), 'cliente sem renda', 'o motivo da pausa aparece');
});

test('o navegador responde igual ao servidor', () => {
  const ctx = createContext({ window: { LW: {} }, String, Object });
  ctx.LW = ctx.window.LW;
  for (const nome of ['STATUS_CONTRATO', 'statusDoContrato', 'motivoDoStatus',
                      'noFunilDeDocumentos', 'noContasAReceber']) {
    const ini = 'window.LW.' + nome + ' =';
    const i = comum.indexOf(ini);
    assert.ok(i >= 0, 'não achei ' + ini);
    let j = i + ini.length, ch = 0, pa = 0;
    for (; j < comum.length; j++) {
      const x = comum[j];
      if (x === '{') ch++; else if (x === '}') ch--;
      else if (x === '(') pa++; else if (x === ')') pa--;
      else if (x === ';' && !ch && !pa) break;
    }
    runInContext(comum.slice(i, j + 1), ctx);
  }
  for (const k of CASOS) {
    assert.equal(ctx.LW.statusDoContrato(k.c), k.status, k.nome + ' (navegador)');
    assert.equal(ctx.LW.noContasAReceber(k.c), k.receber, k.nome + ' (navegador)');
  }
});

test('a pausa é declarada, não deduzida de inadimplência', () => {
  // "Não considerar todo cliente inadimplente automaticamente como pausado."
  const fonte = readFileSync(new URL('../src/status-contrato.js', import.meta.url), 'utf8');
  assert.match(fonte, /c\.pausa && typeof c\.pausa === 'object'/);
  assert.ok(!/Atrasado|inadimpl/i.test(fonte.replace(/^\s*\/\/.*$/gm, '')),
    'o status não pode olhar para atraso de parcela');
});

test('o card lê o status do contrato, não da ficha', () => {
  const corpo = corpoDe(tela, 'function seloDeStatus(fin, p)', '\n}\n');
  assert.match(corpo, /fin && fin\.status/, 'o selo vem do índice do contrato');
  assert.match(corpo, /LW\.STATUS_CONTRATO/);
  // A ficha continua aparecendo quando DIVERGE — esconder isso faria o quadro
  // mentir sobre um card cancelado dentro de contrato vivo.
  assert.match(corpo, /sf !== 'ativo' && sf !== st/);
  // Ativo não ganha selo: quadro com etiqueta em todo card é quadro sem
  // etiqueta nenhuma.
  assert.match(corpo, /if\(st !== 'ativo'\)/);
});

test('o selo fica no TOPO do card, antes do nome', () => {
  const corpo = corpoDe(tela, 'function renderCard(p){', 'card-meta');
  const iSelo = corpo.indexOf('seloDeStatus(fin, p)');
  const iNome = corpo.indexOf('card-name');
  assert.ok(iSelo > 0 && iNome > iSelo, 'o status tem que vir antes do nome');
});

test('contrato cancelado sai do funil; pausado fica', () => {
  const corpo = corpoDe(tela, 'const fora = (p)=>', 'let lista =');
  assert.match(corpo, /\(indiceFin\.get\(p\.contratoId\) \|\| \{\}\)\.status === 'cancelado'/);
  assert.ok(!/'pausado'/.test(corpo), 'pausado não pode sair do quadro: o processo continua andando');
});

test('contrato pausado e cancelado saem do Contas a Receber operacional', () => {
  const corpo = corpoDe(fin, 'function cobravel(parcela)', '\n}\n');
  assert.match(corpo, /st === undefined \|\| st === 'ativo'/);
  // Parcela avulsa não depende de contrato nenhum e continua cobrável.
  assert.match(corpo, /if\(!parcela \|\| !parcela\.contratoId\) return true;/);
  assert.match(fin, /contasReceber\.filter\(c=> c\.status!=='Cancelado' && cobravel\(c\)\)/);
});

test('nada é apagado — só some da VISÃO operacional', () => {
  const corpo = corpoDe(fin, 'function cobravel(parcela)', 'function renderResumo');
  for (const re of [/\.splice\(/, /\bdelete \w+\[/]) {
    assert.doesNotMatch(corpo, re, 'o filtro não pode apagar parcela');
  }
});

// ------------------------------------------------------------------- §4
test('os dois responsáveis são campos diferentes', () => {
  const corpo = corpoDe(tela, 'function execucaoDoProcesso(p)', '\n}\n');
  assert.match(corpo, /p\.execucao/);
  // `p.responsavel`, que já existia, continua sendo o ACOMPANHAMENTO: é o que
  // a regra dela descreve e o que o botão da Conciliação já preenche. Trocar o
  // significado agora jogaria Vitória para "executa" em 171 cards.
  assert.match(tela, /Responsável pelo acompanhamento/);
  assert.match(tela, /Responsável pelo processo/);
  assert.match(tela, /p\.responsavel = e\.target\.value/);
});

test('a execução começa indefinida, em vez de chutar "interno"', () => {
  // Marcar todo processo como feito em casa esconderia dezenas que são de
  // escritório terceirizado, e ninguém saberia quais.
  const corpo = corpoDe(tela, 'function execucaoDoProcesso(p)', '\n}\n');
  assert.match(corpo, /return \{ tipo:'indefinido'/);
});

test('externo sem nome de escritório não vira registro', () => {
  // "Externo" sozinho não diz nada a quem for cobrar depois.
  const corpo = corpoDe(tela, 'async function salvarExecucao(', '\n}\n');
  assert.match(corpo, /if\(novo\.tipo === 'externo' && !novo\.escritorio\) return;/);
  assert.match(corpo, /if\(novo\.tipo === 'interno' && !novo\.pessoa\) return;/);
});

test('trocar o responsável pelo processo fica no histórico, com o anterior', () => {
  const corpo = corpoDe(tela, 'async function salvarExecucao(', '\n}\n');
  assert.match(corpo, /Responsável pelo processo: \$\{depois\}\$\{antes \? ` \(antes: \$\{antes\}\)` : ''\}/);
  assert.match(corpo, /if\(depois === antes\) return;/, 'sem mudança, sem linha de histórico');
});

test('falha ao gravar o responsável não fica fantasma na tela', () => {
  const corpo = corpoDe(tela, 'async function salvarExecucao(', '\n}\n');
  assert.match(corpo, /NÃO gravei o responsável pelo processo/);
});

test('o card mostra os dois', () => {
  const corpo = corpoDe(tela, 'function renderCard(p){', 'card-data');
  assert.match(corpo, /p\.responsavel \? ' · ' \+ esc\(p\.responsavel\)/);
  assert.match(corpo, /textoDaExecucao\(p\)/);
});

// ------------------------------------------------------------------- §7
test('o filtro de execução tem as quatro opções', () => {
  const corpo = corpoDe(tela, 'id="f-execucao"', '</select>');
  for (const v of ['Execução: todos', 'Interno', 'Externo', 'Sem responsável definido']) {
    assert.ok(corpo.includes(v), 'faltou a opção ' + v);
  }
});

test('filtrar muda só quais cards aparecem, nunca a posição salva', () => {
  // A regra crítica dela. O filtro entra na MESMA lista que o "ver cancelados"
  // já usava — ele não ordena, não grava e não toca em etapa.
  const corpo = corpoDe(tela, "if(filtroExecucao)", '\n  if(buscaDoc');
  assert.match(corpo, /lista\.filter\(p=>execucaoDoProcesso\(p\)\.tipo === filtroExecucao\)/);
  for (const re of [/\.sort\(/, /save\w*\(/, /\.status *=/, /ordem/]) {
    assert.doesNotMatch(corpo, re, 'o filtro não pode mexer em ordem, etapa nem gravar');
  }
});

test('o filtro entra no "limpar filtros" e no aviso de filtro ativo', () => {
  assert.match(tela, /filtroResponsaveis\.clear\(\); filtroServicos\.clear\(\); filtroExecucao = ''/);
  assert.match(tela, /filtroResponsaveis\.size \|\| filtroServicos\.size \|\| filtroExecucao \|\| buscaDoc/);
});
