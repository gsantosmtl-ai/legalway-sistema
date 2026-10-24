// 24/10: o incidente das 13h02 esvaziou 266 fichas. A automação leu o bloco
// NAQUELE estado, concluiu que 241 contratos estavam sem ficha e criou todas —
// enquanto, em paralelo, a recuperação devolvia as originais. A mescla do
// servidor é por id e nenhuma ponta apaga a outra, então o quadro ficou com 241
// cartões fantasma: cada um irmão exato de uma ficha real, mesmo contratoId e
// mesmo serviço, escrito idêntico.
//
// A trava "já existe ficha para este contrato e serviço" não estava errada —
// ela só valia no instante da LEITURA. Esta poda roda dentro da transação, com
// a linha travada, e é a última palavra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Importar automacoes.js de verdade puxaria o banco junto. A função real é
// recortada do arquivo pelo nome e roda num contexto limpo — se ela sumir ou
// mudar de nome, o recorte falha e o teste acusa.
const fonte = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');
const ini = fonte.indexOf('export function podarFichasQueJaExistem');
assert.ok(ini > 0, 'não achei podarFichasQueJaExistem em automacoes.js');
let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
for (; i < fonte.length; i++) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
const ctx = {};
vm.createContext(ctx);
new vm.Script(fonte.slice(ini, fim).replace('export function', 'function')
  + '\nvar fn = podarFichasQueJaExistem;').runInContext(ctx);
const podarFichasQueJaExistem = ctx.fn;

const ficha = (id, contratoId, servico) => ({ id, contratoId, servico, clienteNome: 'Barbara Hellen' });

test('a ficha recém-criada não entra se a real reapareceu no banco', () => {
  const podar = podarFichasQueJaExistem(new Set(['nova']));
  const meu = [ficha('nova', 'c1', 'Visto T')];
  const noBanco = [ficha('real', 'c1', 'Visto T')];
  assert.deepEqual(podar(meu, noBanco).map(p => p.id), []);
});

test('se o banco realmente não tem, a ficha nova entra', () => {
  const podar = podarFichasQueJaExistem(new Set(['nova']));
  assert.deepEqual(podar([ficha('nova', 'c1', 'Visto T')], []).map(p => p.id), ['nova']);
});

test('serviço diferente no mesmo contrato continua passando', () => {
  // o contrato de US$ 1.500 da Barbara é MOTION + mudança de endereço: dois cards
  const podar = podarFichasQueJaExistem(new Set(['motion']));
  const noBanco = [ficha('mudanca', 'c2', 'Mudança de Endereço EOIR')];
  assert.deepEqual(podar([ficha('motion', 'c2', 'MOTION')], noBanco).map(p => p.id), ['motion']);
});

test('ficha antiga do meu payload nunca é podada', () => {
  // só o que ESTA rodada criou é candidato; o resto do bloco passa inteiro
  const podar = podarFichasQueJaExistem(new Set(['nova']));
  const meu = [ficha('antiga', 'c1', 'Visto T'), ficha('nova', 'c9', 'Visto U')];
  const noBanco = [ficha('antiga', 'c1', 'Visto T')];
  assert.deepEqual(podar(meu, noBanco).map(p => p.id), ['antiga', 'nova']);
});

test('a ficha nova não poda a si mesma numa regravação', () => {
  const criados = new Set(['nova']);
  const podar = podarFichasQueJaExistem(criados);
  const meu = [ficha('nova', 'c1', 'Visto T')];
  // o banco já tem a que esta rodada gravou: ela não pode contar como "já existe"
  assert.deepEqual(podar(meu, [ficha('nova', 'c1', 'Visto T')]).map(p => p.id), ['nova']);
});

test('ficha órfã no banco não bloqueia — ela não tem contrato', () => {
  const podar = podarFichasQueJaExistem(new Set(['nova']));
  const noBanco = [{ id: 'trello', contratoId: null, servico: 'Visto T', clienteNome: 'Barbara Hellen' }];
  assert.deepEqual(podar([ficha('nova', 'c1', 'Visto T')], noBanco).map(p => p.id), ['nova']);
});

test('banco vazio ou ilegível não derruba a gravação', () => {
  const podar = podarFichasQueJaExistem(new Set(['nova']));
  assert.deepEqual(podar([ficha('nova', 'c1', 'Visto T')], null).map(p => p.id), ['nova']);
  // o array vazio nasce dentro do vm: comparar por JSON evita o atrito de realm
  assert.equal(JSON.stringify(podar(null, [])), '[]');
});

test('o caso real: 3 fantasmas podados de uma vez, as reais intactas', () => {
  const criados = new Set(['f1', 'f2', 'f3']);
  const podar = podarFichasQueJaExistem(criados);
  const reais = [ficha('r1', 'c1', 'Visto T'), ficha('r2', 'c2', 'MOTION'), ficha('r3', 'c3', 'Visto U')];
  const meu = reais.concat([ficha('f1', 'c1', 'Visto T'), ficha('f2', 'c2', 'MOTION'), ficha('f3', 'c3', 'Visto U')]);
  assert.deepEqual(podar(meu, reais).map(p => p.id), ['r1', 'r2', 'r3']);
});
