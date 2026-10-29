// Lead no funil que ninguém assumiu vai para a fila do SDR.
//
// Regra dela, em 29/10/2026: "leads sem contato até 15 dias de entrada, fila;
// mais do que isso, SDR, se não tiver no funil de ninguém."
//
// Ela existe porque a conta não fecha sozinha. Quando isso dependia de alguém
// lembrar, Guinho Passos ficou 178 dias no quadro sem dono — com uma anotação
// de vendedor pedindo "Adriano, já atendi esse cliente. Tente por favor."
//
// A primeira rodada manual também revelou 57 pessoas que estavam ao mesmo
// tempo no funil e na fila do SDR. O SDR ligaria para quem também aparecia no
// quadro de alguém.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const automacoes = readFileSync(join(AQUI, '../src/automacoes.js'), 'utf8');
const regras = readFileSync(join(AQUI, '../src/regras.js'), 'utf8');

const corpo = (() => {
  const i = automacoes.indexOf('async function semDonoParaSdr(');
  assert.ok(i > 0, 'a automação semDonoParaSdr não existe');
  let nivel = 0, fim = -1;
  for (let k = automacoes.indexOf('{', i); k < automacoes.length; k++) {
    if (automacoes[k] === '{') nivel++;
    else if (automacoes[k] === '}') { nivel--; if (nivel === 0) { fim = k + 1; break; } }
  }
  return automacoes.slice(i, fim);
})();

test('o prazo vem das Regras, não está chumbado no código', () => {
  assert.ok(/diasSemDonoAteSdr: 15/.test(regras), 'o prazo de 15 dias saiu das Regras');
  assert.ok(/mandarSemDonoParaSdr: true/.test(regras), 'falta a chave que liga e desliga a regra');
  assert.ok(/Number\(cfg\.diasSemDonoAteSdr\)/.test(corpo),
    'a automação voltou a usar um prazo fixo em vez de ler as Regras');
  assert.ok(/mandarSemDonoParaSdr === false\) return;/.test(corpo),
    'não dá mais para desligar a regra sem mexer no código');
});

// A trava que protege o trabalho do vendedor. Sem ela, um lead parado há
// meses sairia da mão de quem é responsável por ele.
test('card COM vendedor nunca é tocado', () => {
  assert.ok(/if \(!f \|\| f\.saida \|\| String\(f\.vendedor \|\| ''\)\.trim\(\)\) continue;/.test(corpo),
    'a automação passou a mexer em card que tem dono');
});

test('quem já está na fila do SDR não entra duas vezes', () => {
  assert.ok(/jaNoSdr/.test(corpo) && /const repetido = t && jaNoSdr\.has\(t\)/.test(corpo),
    'sem essa checagem a pessoa vai para a fila do SDR de novo a cada rodada');
  assert.ok(/if \(t\) jaNoSdr\.add\(t\)/.test(corpo),
    'quem acabou de entrar precisa entrar no índice, senão duplica dentro da mesma rodada');
});

// Rodar duas vezes no mesmo dia tem que dar o mesmo resultado: o card sai do
// funil na primeira, e na segunda o `f.saida` já o exclui do laço.
test('rodar de novo não repete o trabalho', () => {
  assert.ok(/f\.saida = \{/.test(corpo), 'o card precisa sair do funil, senão é reprocessado todo dia');
  assert.ok(/f\.saida \|\|/.test(corpo), 'card que já saiu precisa ser pulado');
});

test('sem data de entrada, não adivinha a idade', () => {
  assert.ok(/if \(!base\) continue;/.test(corpo),
    'sem data de entrada a automação estaria chutando a idade do lead');
});

test('nada é apagado, e o motivo fica escrito', () => {
  assert.ok(!/\.splice\(|delete f\./.test(corpo), 'a automação não pode remover registro nenhum');
  assert.ok(/Nada foi apagado/.test(corpo), 'o histórico precisa dizer que o card continua no sistema');
  assert.ok(/historico\.push/.test(corpo), 'sem rastro ninguém entende por que o card sumiu do quadro');
});

test('entra na lista de passos diários', () => {
  assert.ok(/\['sem dono para o SDR', semDonoParaSdr\]/.test(automacoes),
    'a automação existe mas não é executada');
});
