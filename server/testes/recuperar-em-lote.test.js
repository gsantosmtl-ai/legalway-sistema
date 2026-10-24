// Um módulo inteiro foi substituído por engano: 266 fichas de documentação,
// com checklist e anexos, saíram da lista. A tela de recuperação já existia,
// mas devolvia UM registro por clique — e devolver 266 clicando um a um não é
// caminho de volta, é castigo.
//
// A rota sempre aceitou uma lista de ids. Era a tela que mandava um por vez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tela = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
const rotas = readFileSync(new URL('../src/armazenamento.js', import.meta.url), 'utf8');

function corpoDe(fonte, assinatura) {
  const ini = fonte.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < fonte.length; i++) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return fonte.slice(ini, fim);
}

test('a rota já aceitava lista de ids', () => {
  const corpo = corpoDe(rotas, "rotasArmazenamento.post('/storage/:chave/recuperar'");
  assert.match(corpo, /ids/, 'o corpo do pedido traz ids');
});

test('a devolução só acrescenta, nunca apaga', () => {
  // uma recuperação que apaga alguma coisa é pior do que não ter recuperação
  const corpo = corpoDe(rotas, 'export function devolverItens(atual, voltam)');
  assert.match(corpo, /if \(existem\.has\(id\)\) continue;/, 'id que já está lá não entra de novo');
  assert.match(corpo, /lista\.concat\(devolvidos\)/, 'o que existe hoje é preservado inteiro');
});

test('o botão de lote só conta quem tem trabalho feito', () => {
  const corpo = corpoDe(tela, 'function pintarApagados(chave, lista)');
  assert.match(corpo, /lista\.filter\(a => \(Number\(a\.documentos\)\|\|0\) > 0 \|\| \(Number\(a\.anexos\)\|\|0\) > 0\)/,
    'ficha vazia não precisa voltar — ela é recriada sozinha');
  assert.match(corpo, /id="rec-lote"/);
});

test('o lote é agrupado por versão, porque a rota devolve de uma versão por vez', () => {
  const corpo = corpoDe(tela, 'function pintarApagados(chave, lista)');
  assert.match(corpo, /porVersao\[a\.versao\] = porVersao\[a\.versao\] \|\| \[\]/);
  const lote = corpoDe(tela, 'async function devolverLote(chave, porVersao, quantos, btn)');
  assert.match(lote, /for\(const \[versao, ids\] of Object\.entries\(porVersao\)\)/);
  assert.match(lote, /versao: Number\(versao\), ids/);
});

test('sem nada com trabalho, o botão não aparece', () => {
  const corpo = corpoDe(tela, 'function pintarApagados(chave, lista)');
  assert.match(corpo, /\$\{comTrabalho\.length \? `<button class="primary" id="rec-lote"/);
});

test('o lote avisa o que conseguiu antes de parar no erro', () => {
  // devolver 180 e falhar na 181 não pode virar "deu erro" e ponto
  const corpo = corpoDe(tela, 'async function devolverLote(chave, porVersao, quantos, btn)');
  assert.match(corpo, /Devolvi \$\{total\} e parei no erro/);
  assert.match(corpo, /total \+= Number\(r\.devolvidos\)/);
});

test('o aviso diz que nada do que está lá hoje é apagado', () => {
  const corpo = corpoDe(tela, 'async function devolverLote(chave, porVersao, quantos, btn)');
  assert.match(corpo, /Nada do que existe hoje é alterado ou apagado/);
});

// A contagem, rodando de verdade.
test('conta certo quem tem documento, anexo, ou os dois', () => {
  const ctx = { lista: [
    { id: 'a', documentos: 14, anexos: 25, versao: 214 },
    { id: 'b', documentos: 0, anexos: 0, versao: 214 },
    { id: 'c', documentos: 0, anexos: 3, versao: 214 },
    { id: 'd', documentos: 2, anexos: 0, versao: 210 },
    { id: 'e', versao: 214 },
  ] };
  vm.createContext(ctx);
  new vm.Script(`
    const comTrabalho = lista.filter(a => (Number(a.documentos)||0) > 0 || (Number(a.anexos)||0) > 0);
    const porVersao = {};
    for(const a of comTrabalho) (porVersao[a.versao] = porVersao[a.versao] || []).push(a.id);
    var r = JSON.stringify({ n: comTrabalho.length, porVersao });
  `).runInContext(ctx);
  const r = JSON.parse(ctx.r);
  assert.equal(r.n, 3, 'a, c e d');
  assert.deepEqual(r.porVersao, { 214: ['a', 'c'], 210: ['d'] });
});
