// Toda vez que alguém baixa um arquivo, o servidor confere se aquele arquivo
// pertence mesmo ao processo de quem está pedindo. A conferência lia o bloco
// INTEIRO da Documentação — 263 processos, 2,3 MB — e procurava em JavaScript.
//
// Uma vez por arquivo. O cliente abrindo os documentos dele no portal, ou a
// tradutora montando o ZIP de dez documentos, pagava isso dez vezes.
//
// Medido em produção: 53 ms por chamada daquele jeito, 6 ms deixando o
// Postgres devolver só o processo pedido. Conferido contra os 263 processos
// reais: o resultado é idêntico em todos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/arquivos.js', import.meta.url), 'utf8');

function corpo(assinatura) {
  const i = fonte.indexOf(assinatura);
  assert.ok(i > 0, `não achei ${assinatura}`);
  const abre = fonte.indexOf('{', i);
  let nivel = 0;
  for (let k = abre; k < fonte.length; k++) {
    if (fonte[k] === '{') nivel++;
    else if (fonte[k] === '}') { nivel--; if (!nivel) return fonte.slice(abre, k + 1); }
  }
  throw new Error('não fechei as chaves');
}

test('a conferência pede UM processo ao banco, não o bloco', () => {
  const c = corpo('async function lerProcesso(processoId)');
  assert.match(c, /jsonb_array_elements\(a\.valor\) p/);
  assert.match(c, /p->>'id' = \$1/);
  assert.match(c, /LIMIT 1/);
  assert.doesNotMatch(c, /SELECT valor FROM armazenamento WHERE chave = 'legalway-processos-documentacao-v1'`\)/,
    'puxar o bloco inteiro custa 2,3 MB e 53 ms por arquivo baixado');
});

test('bloco que não for lista não derruba o download', () => {
  // `jsonb_array_elements` levanta erro se o valor não for um array. Já
  // aconteceu de uma chave estar gravada na forma errada — foi o que fez o
  // resumo diário sair a cada minuto.
  assert.match(corpo('async function lerProcesso(processoId)'), /jsonb_typeof\(a\.valor\) = 'array'/);
});

test('processo inexistente devolve null, não explode', () => {
  const c = corpo('async function lerProcesso(processoId)');
  assert.match(c, /return rows\[0\] \? rows\[0\]\.p : null;/);
  assert.match(c, /if \(!processoId\) return null;/);
});

test('o id vai como texto, para não virar comparação de tipos', () => {
  assert.match(corpo('async function lerProcesso(processoId)'), /\[String\(processoId\)\]/);
});

test('quem usa lerProcesso continua sendo só a porta de download', () => {
  // Se alguém passar a usar isto para GRAVAR, o processo volta recortado.
  const usos = [...fonte.matchAll(/lerProcesso\(/g)].length;
  assert.equal(usos, 3, 'a definição e as duas conferências — nada mais');
  assert.match(fonte, /async function arquivoEstaNoProcesso\(id, processoId\) \{[\s\S]*?lerProcesso\(processoId\)/);
  assert.match(fonte, /async function arquivoDoPacoteDeTraducao\(id, processoId\) \{[\s\S]*?lerProcesso\(processoId\)/);
});
