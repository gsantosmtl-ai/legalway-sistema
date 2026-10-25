// "Agora sinto que o sistema está travando muito, muitos refresh, falhas."
//
// A tela de Documentação tinha isto no fim do arquivo:
//
//     setInterval(async ()=>{ await loadAll(); }, 10000);
//
// A cada DEZ SEGUNDOS, cada aba aberta baixava tudo de novo — inclusive o
// bloco de fichas, que na Legal Way carrega milhares de anexos — e ainda
// regravava dois blocos (checklists e prestadores) sem nada ter mudado.
//
// Duas consequências:
//   · a tela travava, e parecia estar "dando refresh sozinha"
//   · uma gravação a cada 10s queima o histórico de versões (ficam as 30
//     últimas) em cinco minutos. Foi assim que a versão base de uma aba saiu
//     do histórico e abriu caminho para a perda dos 3.509 anexos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

test('o relógio não baixa tudo às cegas', () => {
  assert.doesNotMatch(tela, /setInterval\(\s*async\s*\(\s*\)\s*=>\s*\{\s*await loadAll\(\)/,
    'recarregar o bloco inteiro a cada 10 segundos é o que travava a tela');
  assert.match(tela, /setInterval\(recarregarSeMudou/);
});

test('a volta do relógio pergunta só as versões', () => {
  const f = tela.slice(tela.indexOf('async function recarregarSeMudou'));
  assert.match(f.slice(0, 900), /\/storage\?prefixo=/,
    'a listagem de versões é uma resposta de poucas linhas; o bloco inteiro não');
  assert.match(f.slice(0, 900), /if\(mudou\) await loadAll\(\)/,
    'só recarrega quando alguma versão mudou de verdade');
});

test('a primeira volta não recarrega: ela só anota onde as versões estavam', () => {
  const f = tela.slice(tela.indexOf('async function recarregarSeMudou'));
  assert.match(f.slice(0, 900), /versoesVistas === null.*return/s,
    'sem isso, a primeira volta sempre recarregaria sem necessidade');
});

test('nenhuma gravação solta dentro do carregamento', () => {
  const ini = tela.indexOf('async function loadAll(');
  let i = tela.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < tela.length; i++) { if (tela[i] === '{') nivel++; else if (tela[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  const corpo = tela.slice(ini, fim);
  const soltas = corpo.split('\n').filter(l => /^\s*await save[A-Za-z]*\(\s*\)\s*;?\s*$/.test(l));
  assert.deepEqual(soltas, [],
    'gravação incondicional dentro do loadAll roda a cada volta do relógio e queima o histórico:\n' + soltas.join('\n'));
});

test('o índice financeiro é montado uma vez por desenho, não por card', () => {
  // dadosFinanceiros() varria contratos e contasReceber INTEIROS a cada
  // chamada; com a ordenação por data o comparador passou a chamá-la também,
  // e n·log(n) varreduras completas travavam o quadro
  assert.match(tela, /function montarIndiceFinanceiro\(\)/);
  assert.match(tela, /function render\(\)\{\s*\n\s*montarIndiceFinanceiro\(\)/);
  const f = tela.slice(tela.indexOf('function dadosFinanceiros'), tela.indexOf('function renderCard'));
  assert.doesNotMatch(f, /contasReceber\.filter/,
    'voltar a filtrar as parcelas dentro de dadosFinanceiros traz a lentidão de volta');
});
