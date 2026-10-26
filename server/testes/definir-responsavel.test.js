// Definir o responsável dos cards sem dono — e, principalmente, NÃO mexer nos
// que já têm.
//
// 78 dos 87 contratos "aguardando decisão" são só isto: card sem responsável,
// 53 deles em Visto T. Clicar 78 vezes não é conserto, então existe uma porta
// que faz o mês inteiro de uma vez. Operação em massa num bloco de produção só
// é aceitável com uma garantia dura, e é esta: ela PREENCHE VAZIO, nunca troca
// um nome que alguém pôs de propósito.
//
// Estes testes rodam a regra de verdade, extraída do arquivo de rotas, porque
// reescrevê-la aqui faria o teste conferir a imitação. O arquivo importa banco,
// então o recorte é do trecho puro.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/conciliacao-rotas.js', import.meta.url), 'utf8');

// Recorta o bloco puro (do MAX_NOME até o fim de porDono) e o executa com um
// dublê de limparTexto igual ao de sanitizar.js para os casos que importam.
function regras() {
  const i = fonte.indexOf('const MAX_NOME');
  const f = fonte.indexOf('\n}\n', fonte.indexOf('function porDono'));
  assert.ok(i >= 0 && f > i, 'não achei o bloco das regras no arquivo de rotas');
  const corpo = fonte.slice(i, f + 2);
  return new Function('limparTexto',
    corpo + '; return { nomeDeResponsavel, fichaSemDono, porDono, MAX_NOME };'
  )((s) => String(s).replace(/<[^>]*>/g, ''));
}
const R = regras();

const ficha = (extra = {}) => ({ id: 'p' + Math.random(), contratoId: 'c1', servico: 'Visto T',
  situacao: 'ativo', responsavel: '', historico: [], ...extra });

test('preenche só quem está sem dono', () => {
  const comDono = ficha({ responsavel: 'Elaine' });
  const sem1 = ficha(), sem2 = ficha({ servico: 'MOTION' });
  const processos = [comDono, sem1, sem2];
  const feitos = R.porDono(processos, 'Vitória', 'tati', (p) => R.fichaSemDono(p, 'c1'));

  assert.equal(feitos.length, 2);
  assert.equal(sem1.responsavel, 'Vitória');
  assert.equal(sem2.responsavel, 'Vitória');
  assert.equal(comDono.responsavel, 'Elaine', 'quem já tinha dono NÃO pode ser trocado');
  assert.equal(comDono.historico.length, 0, 'e nem ganha linha de histórico');
});

test('card cancelado não ganha responsável', () => {
  // Card cancelado não está na fila de ninguém; pôr dono nele devolveria o
  // card para a fila de alguém que não pediu por ele.
  const cancelado = ficha({ situacao: 'cancelado' });
  const feitos = R.porDono([cancelado], 'Vitória', 'tati', (p) => R.fichaSemDono(p, 'c1'));
  assert.equal(feitos.length, 0);
  assert.equal(cancelado.responsavel, '');
});

test('o filtro por contrato não vaza para outro contrato', () => {
  const meu = ficha({ contratoId: 'c1' }), alheio = ficha({ contratoId: 'c2' });
  R.porDono([meu, alheio], 'Vitória', 'tati', (p) => R.fichaSemDono(p, 'c1'));
  assert.equal(meu.responsavel, 'Vitória');
  assert.equal(alheio.responsavel, '', 'card de outro contrato não pode ser tocado');
});

test('cada card alterado fica com rastro de quem e quando', () => {
  const p1 = ficha();
  R.porDono([p1], 'Vitória', 'tatiane', (p) => R.fichaSemDono(p, 'c1'));
  assert.equal(p1.historico.length, 1);
  assert.match(p1.historico[0].texto, /Vitória/);
  assert.match(p1.historico[0].texto, /Conciliação de Fluxo/);
  assert.equal(p1.historico[0].quem, 'tatiane');
  assert.ok(p1.historico[0].quando, 'sem data não dá para auditar depois');
});

test('histórico que não era lista não quebra nem apaga o card', () => {
  // Veio assim da importação em alguns registros. Um push num não-array
  // derrubaria a rota no meio da gravação em massa.
  const p1 = ficha({ historico: null }), p2 = ficha({ historico: 'texto solto' });
  R.porDono([p1, p2], 'Vitória', 'tati', (p) => R.fichaSemDono(p, 'c1'));
  assert.equal(p1.responsavel, 'Vitória');
  assert.equal(p2.responsavel, 'Vitória');
  assert.ok(Array.isArray(p1.historico) && Array.isArray(p2.historico));
});

test('nome vazio, curto demais ou só espaço é recusado', () => {
  for (const ruim of [null, undefined, '', ' ', '  ', 'A', 7, {}, []]) {
    assert.equal(R.nomeDeResponsavel(ruim), null, 'aceitou ' + JSON.stringify(ruim));
  }
});

test('nome é limpo e normalizado, e nome gigante é recusado', () => {
  assert.equal(R.nomeDeResponsavel('  Vitória  '), 'Vitória');
  assert.equal(R.nomeDeResponsavel('Vitória   Santos'), 'Vitória Santos', 'espaço duplo vira um');
  assert.equal(R.nomeDeResponsavel('<b>Vitória</b>'), 'Vitória', 'tag HTML não entra no nome');
  assert.equal(R.nomeDeResponsavel('x'.repeat(R.MAX_NOME + 1)), null);
  assert.equal(R.nomeDeResponsavel('x'.repeat(R.MAX_NOME)), 'x'.repeat(R.MAX_NOME));
});

test('a rota em massa exige prévia e não escreve nada ao prever', () => {
  const i = fonte.indexOf("rotasConciliacao.post('/conciliacao/responsavel'");
  const corpo = fonte.slice(i, fonte.indexOf('\n});', i));
  // A prévia tem que sair ANTES do porDono e do gravar.
  const iPrevia = corpo.indexOf('previa: true');
  const iEscreve = corpo.indexOf('porDono(');
  assert.ok(iPrevia > 0 && iEscreve > iPrevia,
    'a prévia precisa retornar antes de qualquer escrita');
  assert.match(corpo, /await gravar\(K\.processos, bp\.valor, bp\.versao/,
    'tem que gravar com a versão lida agora, senão duas pessoas se sobrescrevem');
  assert.match(corpo, /INSERT INTO auditoria/, 'operação em massa sem auditoria não acontece');
  assert.match(corpo, /esquecerCache/);
  assert.match(corpo, /base-antiga/, 'conflito de versão tem que virar recado, não erro 500');
});

test('ficha sem contrato nenhum fica de fora da operação em massa', () => {
  // Ela não tem mês, então não dá para dizer que pertence ao mês que está
  // sendo fechado. Varrer o que não dá para datar é escrever em cima do que
  // ninguém auditou.
  const i = fonte.indexOf("rotasConciliacao.post('/conciliacao/responsavel'");
  const corpo = fonte.slice(i, fonte.indexOf('\n});', i));
  assert.match(corpo, /p\.contratoId && doMes\.has\(p\.contratoId\)/);
});

test('"todos" é o único jeito de passar de um mês, e é explícito', () => {
  const i = fonte.indexOf("rotasConciliacao.post('/conciliacao/responsavel'");
  const corpo = fonte.slice(i, fonte.indexOf('\n});', i));
  assert.match(corpo, /const todos = mes === 'todos'/);
  assert.match(corpo, /!todos && !MES\.test\(mes\)/, 'qualquer outro valor de mês é recusado');
});

test('a ação por contrato pede o campo "responsavel", não "servico"', () => {
  // Antes o extra vinha sempre de req.body.servico. Se isso voltar, a ação
  // nova recebe o serviço no lugar do nome e grava "Visto T" como responsável.
  assert.match(fonte, /precisa: 'responsavel'/);
  assert.match(fonte, /const campo = acao\.precisa \|\| null;/);
  assert.match(fonte, /req\.body\?\.\[campo\]/);
  assert.ok(!/const extra = req\.body\?\.servico == null/.test(fonte),
    'o extra não pode voltar a sair sempre de `servico`');
});
