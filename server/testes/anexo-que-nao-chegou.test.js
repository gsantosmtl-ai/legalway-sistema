// Medido na produção em 30/10/2026: 89 anexos estão referenciados no LIV e o
// arquivo não existe. Quase todos são "Processo Concluído <cliente>.pdf" — os
// PDFs completos de caso, de 50 a 175 MB.
//
// A fronteira é nítida: o maior arquivo ÍNTEGRO tem 9,9 MB e o menor que falta
// tem 7,3 MB. A importação do Drive registrou o anexo e o arquivo não veio.
//
// Sem marca, a equipe clica num link que não abre e não sabe por quê. O
// registro NÃO é apagado: ele é a prova de que o documento existe, e o nome da
// pasta é o caminho para achá-lo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

// Recorta a expressão `anexos.map(...)` contando PARÊNTESES e roda de verdade.
//
// Procurar o terminador `).join('')} não funciona: o template tem crases e
// parênteses aninhados, e o recorte saía pela metade — "Unexpected end of
// input". Contar é a única forma que não depende de como o texto está escrito.
function expressaoDoMap() {
  const i = tela.indexOf('anexos.map((a,k)=>');
  assert.notEqual(i, -1, 'não achei o desenho dos anexos');
  const abre = tela.indexOf('(', i + 'anexos.map'.length);
  let nivel = 0;
  for (let k = abre; k < tela.length; k++) {
    if (tela[k] === '(') nivel++;
    else if (tela[k] === ')' && --nivel === 0) return tela.slice(i, k + 1);
  }
  throw new Error('parênteses não fecharam');
}

function desenhar(anexo) {
  const ctx = { anexos: [anexo], i: 0, esc: (v) => String(v ?? ''), Number };
  vm.createContext(ctx);
  return vm.runInContext('(' + expressaoDoMap() + ').join("")', ctx);
}

test('anexo normal continua sendo um link que abre', () => {
  const html = desenhar({ url: '/api/arquivos/' + 'a'.repeat(32), nome: 'Passaporte.pdf' });
  assert.match(html, /<a href="\/api\/arquivos\//);
  assert.match(html, /Passaporte\.pdf/);
  assert.doesNotMatch(html, /não foi copiado/);
});

test('anexo que não chegou NÃO vira link — ele se explica', () => {
  const html = desenhar({ url: '/api/arquivos/' + 'b'.repeat(32), naoChegou: true,
    nome: 'Processo concluído Deise.pdf', tamanho: 77373723, pastaNoDrive: 'Deise Conceicao Merces - OK' });
  assert.doesNotMatch(html, /<a href="\/api\/arquivos\//, 'continuar oferecendo o link é o problema');
  assert.match(html, /não foi copiado para o sistema/);
  assert.match(html, /está no Drive/);
});

test('ele diz o tamanho e a pasta, que é o que faz achar', () => {
  const html = desenhar({ url: '/x', naoChegou: true, nome: 'a.pdf',
    tamanho: 77373723, pastaNoDrive: 'Deise Conceicao Merces - OK' });
  assert.match(html, /74 MB/, 'sem o tamanho ninguém entende por que não coube');
  assert.match(html, /Deise Conceicao Merces - OK/, 'sem a pasta, achar no Drive vira caça');
});

test('sem o nome da pasta, não inventa pasta nenhuma', () => {
  const html = desenhar({ url: '/x', naoChegou: true, nome: 'a.pdf', tamanho: 1000 });
  assert.match(html, /está no Drive/);
  assert.doesNotMatch(html, /pasta «/, 'melhor não dizer do que dizer errado');
});

test('dá para remover mesmo o que não chegou', () => {
  // O registro é limpo pela equipe quando ela decidir; a tela não pode travar.
  const html = desenhar({ url: '/x', naoChegou: true, nome: 'a.pdf' });
  assert.match(html, /data-remover-anexo=/);
});
