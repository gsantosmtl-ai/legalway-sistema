// Em 24/10/2026 eu criei `juntarFichas` em documentos.html sem notar que já
// existia outra função com esse nome no MESMO arquivo. Em JavaScript a última
// declaração vence: a minha ficou morta desde que subiu, e o botão "Trazer
// tudo para esta ficha" chamava a outra, com argumentos errados — sem fazer
// nada e sem dar erro.
//
// O pior: os testes passavam. Eles recortam a função do arquivo PELO NOME e
// achavam a minha, que o navegador nunca executava. Teste que lê o código não
// prova qual declaração vence em tempo de execução.
//
// Este aqui fecha a classe inteira: nenhuma tela pode declarar duas funções de
// mesmo nome no escopo de topo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../../docs/', import.meta.url);
const telas = readdirSync(dir).filter(f => f.endsWith('.html'));

function declaracoesDeTopo(html) {
  // só o que está na coluna zero de um <script> da própria tela: função
  // aninhada pode repetir nome sem conflito, porque vive em outro escopo
  const nomes = [];
  for (const m of html.matchAll(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)) nomes.push(m[1]);
  return nomes;
}

test('nenhuma tela declara duas funções com o mesmo nome', () => {
  const problemas = [];
  for (const tela of telas) {
    const html = readFileSync(new URL(tela, dir), 'utf8');
    const contagem = {};
    for (const nome of declaracoesDeTopo(html)) contagem[nome] = (contagem[nome] || 0) + 1;
    for (const [nome, n] of Object.entries(contagem)) {
      if (n > 1) problemas.push(`${tela}: function ${nome}() declarada ${n} vezes`);
    }
  }
  assert.deepEqual(problemas, [],
    'a última declaração vence e a primeira morre em silêncio — foi assim que o botão de juntar fichas ficou sem efeito:\n'
    + problemas.join('\n'));
});

test('o botão de juntar chama a função que realmente existe', () => {
  const html = readFileSync(new URL('documentos.html', dir), 'utf8');
  const chamada = html.match(/data-juntar[\s\S]{0,400}?\)\s*=>\s*([A-Za-z0-9_$]+)\(/);
  assert.ok(chamada, 'não achei quem o botão chama');
  const nome = chamada[1];
  const declarada = new RegExp(`^(?:async\\s+)?function\\s+${nome}\\s*\\(`, 'm').test(html);
  assert.ok(declarada, `o botão chama ${nome}(), que não está declarada nesta tela`);
  const vezes = (html.match(new RegExp(`^(?:async\\s+)?function\\s+${nome}\\s*\\(`, 'gm')) || []).length;
  assert.equal(vezes, 1, `${nome}() está declarada ${vezes} vezes: a última vence e o botão pode chamar a errada`);
});
