// O número que a gente fala em voz alta.
//
// "importante que tudo tenha número de proposta, número de contrato, número de
// cliente, número de processo... tenha uma lógica para não se perder as
// informações."
//
// Cada registro tinha um id tipo `cbrsdlduk74ur`. Isso serve ao banco e não
// serve a ninguém: não dá para ditar no telefone, nem anotar num papel, nem
// procurar.
//
// As três decisões que estes testes guardam:
//
//  1. O código entra AO LADO do id, nunca no lugar. Todos os vínculos entre
//     blocos são por id — trocar isso quebraria tudo de uma vez.
//  2. Uma vez dado, NUNCA muda. Número que se mexe é pior que nenhum: a pessoa
//     anotou CT-0042 e amanhã é outro contrato.
//  3. O campo é `codigo`, não `numero` — `numero` já é o da parcela, o do
//     protocolo e o do telefone do setor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { formatarCodigo, numeroDoCodigo, maiorCodigo, numerar, codigoDe, PREFIXO }
  from '../src/numeracao.js';

test('cada coisa tem seu prefixo', () => {
  assert.deepEqual(PREFIXO, { cliente:'CL', proposta:'PR', contrato:'CT', processo:'PC' });
  assert.equal(formatarCodigo('contrato', 42), 'CT-0042');
  assert.equal(formatarCodigo('cliente', 1), 'CL-0001');
  assert.equal(formatarCodigo('processo', 12345), 'PC-12345', 'passar de 9999 cresce, não corta');
});

test('entrada inválida não vira código', () => {
  for (const [t, n] of [['contrato', 0], ['contrato', -1], ['contrato', null],
                        ['inventado', 1], ['contrato', 'x']]) {
    assert.equal(formatarCodigo(t, n), '', `${t}/${n}`);
  }
});

test('o mais antigo fica com o menor número', () => {
  // É o que qualquer pessoa espera ao ver a lista.
  const l = [{ id:'b', criadoEm:'2026-03-01' }, { id:'a', criadoEm:'2026-01-01' },
             { id:'c', criadoEm:'2026-02-01' }];
  assert.equal(numerar(l, 'contrato'), 3);
  assert.equal(l.find(x=>x.id==='a').codigo, 'CT-0001');
  assert.equal(l.find(x=>x.id==='c').codigo, 'CT-0002');
  assert.equal(l.find(x=>x.id==='b').codigo, 'CT-0003');
});

test('quem já tem número não é tocado, nem para arrumar a ordem', () => {
  // O número é um endereço, não uma classificação.
  const l = [{ id:'a', criadoEm:'2026-01-01' }, { id:'c', codigo:'CT-0042', criadoEm:'2026-02-01' }];
  numerar(l, 'contrato');
  assert.equal(l.find(x=>x.id==='c').codigo, 'CT-0042', 'não pode ser renumerado para 0001');
  assert.equal(l.find(x=>x.id==='a').codigo, 'CT-0043', 'o novo continua de onde parou');
});

test('o próximo sai do MAIOR usado, não da quantidade', () => {
  // Com três registros e o maior sendo CT-0042, usar `length+1` daria CT-0004
  // — um número que já pode ter sido de um contrato apagado.
  const l = [{ id:'a', codigo:'CT-0042' }, { id:'b', codigo:'CT-0007' }, { id:'c' }];
  numerar(l, 'contrato');
  assert.equal(l[2].codigo, 'CT-0043');
  assert.equal(maiorCodigo(l), 43);
});

test('rodar de novo não faz nada', () => {
  // A automação roda o tempo todo. Se numerar de novo a cada rodada, ela grava
  // os quatro blocos para sempre, sem motivo.
  const l = [{ id:'a', criadoEm:'2026-01-01' }];
  assert.equal(numerar(l, 'contrato'), 1);
  assert.equal(numerar(l, 'contrato'), 0);
  assert.equal(numerar(l, 'contrato'), 0);
});

test('registro sem data vai para o fim, não para o começo', () => {
  // Data ausente ordenada como '' viraria o registro mais antigo de todos, e
  // roubaria o CT-0001 de quem é realmente o primeiro.
  const l = [{ id:'semData' }, { id:'tem', criadoEm:'2026-01-01' }];
  numerar(l, 'contrato');
  assert.equal(l.find(x=>x.id==='tem').codigo, 'CT-0001');
  assert.equal(l.find(x=>x.id==='semData').codigo, 'CT-0002');
});

test('lixo na lista não derruba a numeração', () => {
  const l = [null, 'texto', { id:'ok', criadoEm:'2026-01-01' }, { id:'b', codigo:{} }];
  assert.doesNotThrow(() => numerar(l, 'contrato'));
  assert.equal(l[2].codigo, 'CT-0001');
  assert.equal(numerar(null, 'contrato'), 0);
  assert.equal(numerar([], 'inventado'), 0);
});

test('codigoDe só devolve código de verdade', () => {
  assert.equal(codigoDe({ codigo:'CT-0042' }), 'CT-0042');
  for (const r of [{ codigo:'' }, { codigo:'lixo' }, { codigo:{} }, {}, null]) {
    assert.equal(codigoDe(r), '');
  }
});

test('o número NÃO substitui o id', () => {
  // Os vínculos entre blocos são todos por id. Esta é a garantia que impede
  // alguém de "simplificar" trocando um pelo outro.
  const l = [{ id:'cbrsdlduk74ur', criadoEm:'2026-01-01' }];
  numerar(l, 'contrato');
  assert.equal(l[0].id, 'cbrsdlduk74ur', 'o id continua lá, intacto');
  assert.equal(l[0].codigo, 'CT-0001');
  const fonte = readFileSync(new URL('../src/numeracao.js', import.meta.url), 'utf8');
  assert.ok(!/\.id\s*=/.test(fonte), 'a numeração não pode escrever em id');
});

test('o campo é `codigo`, não `numero`', () => {
  // `numero` já significa três coisas no sistema.
  const l = [{ id:'a', criadoEm:'2026-01-01', numero: 'Parcela 3' }];
  numerar(l, 'contrato');
  assert.equal(l[0].numero, 'Parcela 3', 'não pode encostar no numero que já existe');
  assert.equal(l[0].codigo, 'CT-0001');
});

// --- o espelho do navegador e a busca --------------------------------------
function carregarLW() {
  const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
  const ctx = createContext({ window:{LW:{}}, Math, Number, String, JSON, RegExp });
  ctx.LW = ctx.window.LW;
  for (const nome of ['PREFIXO_CODIGO','formatarCodigo','numeroDoCodigo','codigoDe','casaCodigo']) {
    const ini = 'window.LW.' + nome + ' =';
    const i = comum.indexOf(ini);
    assert.ok(i >= 0, 'não achei ' + ini);
    let j = i + ini.length, c = 0, p = 0;
    for (; j < comum.length; j++) {
      const x = comum[j];
      if (x === '{') c++; else if (x === '}') c--;
      else if (x === '(') p++; else if (x === ')') p--;
      else if (x === ';' && !c && !p) break;
    }
    runInContext(comum.slice(i, j + 1), ctx);
  }
  return ctx.LW;
}

test('o navegador formata igual ao servidor', () => {
  const LW = carregarLW();
  for (const [t, n] of [['contrato',42],['cliente',1],['processo',12345],['proposta',7]]) {
    assert.equal(LW.formatarCodigo(t, n), formatarCodigo(t, n), `${t}/${n}`);
  }
  assert.deepEqual(Object.keys(LW.PREFIXO_CODIGO).sort(), Object.keys(PREFIXO).sort());
});

test('procurar acha sem os zeros e sem o traço', () => {
  // Ninguém digita "CT-0042". Digita "ct42", ou só "42".
  const LW = carregarLW();
  const r = { codigo:'CT-0042' };
  for (const q of ['CT-0042','ct-42','CT42','ct 42','42','0042']) {
    assert.equal(LW.casaCodigo(r, q), true, 'não achou com ' + JSON.stringify(q));
  }
  for (const q of ['43','CL-0042','','  ', null]) {
    assert.equal(LW.casaCodigo(r, q), false, 'achou errado com ' + JSON.stringify(q));
  }
  assert.equal(LW.casaCodigo({}, '42'), false, 'registro sem código não casa com nada');
});

// --- a automação -----------------------------------------------------------
const auto = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');
const semComent = (t) => t.replace(/^\s*\/\/.*$/gm, '');

test('quem numera é a automação, pelos quatro blocos', () => {
  assert.match(auto, /\['numerar registros', numerarRegistros\]/, 'tem que entrar na lista de passos');
  const h = semComent(auto.slice(auto.indexOf('const BLOCOS_NUMERADOS'), auto.indexOf('\n}\n', auto.indexOf('async function numerarRegistros'))));
  for (const [chave, tipo] of [['legalway-clientes-v1','cliente'], ['legalway-funil-v1','proposta'],
                               ['legalway-contratos-v1','contrato'], ['legalway-processos-documentacao-v1','processo']]) {
    assert.ok(h.includes(chave) && h.includes("'" + tipo + "'"), 'faltou ' + tipo);
  }
});

test('o número sai do que está no BANCO, dentro da transação', () => {
  // `transformar` roda com a linha travada. Numerar o que esta rodada leu
  // poderia repetir um número dado por outra rodada no meio do caminho — e
  // número repetido é pior do que número nenhum.
  const h = semComent(auto.slice(auto.indexOf('async function numerarRegistros'),
                                 auto.indexOf('\n}\n', auto.indexOf('async function numerarRegistros'))));
  assert.match(h, /\(_meu, noBanco\) =>/, 'o valor do banco é o SEGUNDO parâmetro');
  assert.match(h, /const lista = Array\.isArray\(noBanco\) \? noBanco : valor;/);
  assert.match(h, /await salvar\(chave, valor, null,/, 'com a linha travada não há o que mesclar');
});

test('bloco vazio não é gravado à toa', () => {
  const h = semComent(auto.slice(auto.indexOf('async function numerarRegistros'),
                                 auto.indexOf('\n}\n', auto.indexOf('async function numerarRegistros'))));
  assert.match(h, /if \(!Array\.isArray\(valor\) \|\| !valor\.length\) continue;/);
});

// --- as telas ---------------------------------------------------------------
test('o card mostra o número, e a busca acha por ele', () => {
  const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
  assert.match(tela, /LW\.codigoDe\(p\)/, 'o código do processo no card');
  assert.match(tela, /codigoContrato: LW\.codigoDe\(c\)/, 'e o do contrato');
  assert.match(tela, /LW\.casaCodigo\(p, buscaDoc\)/);
  assert.match(tela, /LW\.casaCodigo\(ct, buscaDoc\)/, 'procurar pelo número do contrato também');
});
