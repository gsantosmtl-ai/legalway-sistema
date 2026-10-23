// Formulário é trabalho do escritório: o cliente não tem o que anexar num I-914 ou num
// G-1145. Em produção são 3.753 itens de checklist e mais de 800 deles são formulário —
// mostrar tudo no portal faz o cliente achar que está devendo documento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

test('o portal não mostra item marcado como interno', () => {
  // Marcado no processo OU no checklist do serviço: a cópia que o processo
  // guarda envelhece, e marcar no serviço tem de valer para quem já existe.
  assert.match(portal, /\.filter\(\(\{ d \}\) => !\(d\.interno \|\| \(noServico\(d\.nome\) \|\| \{\}\)\.interno\)\)/,
    'o checklist do cliente deveria esconder os itens internos');
});

test('o índice original é preservado ao esconder', () => {
  // O envio do cliente encontra o item pelo índice. Reindexar depois do filtro faria
  // o arquivo cair no documento errado — e aí o cliente manda o passaporte e ele
  // aparece como certidão de nascimento.
  const i = portal.indexOf('const checklist = (p.checklist || [])');
  const trecho = portal.slice(i, i + 420);
  assert.match(trecho, /\.map\(\(d, i\) => \(\{ d, i \}\)\)/,
    'o índice precisa ser capturado ANTES do filtro');
  assert.match(trecho, /indice: i,/, 'o índice original tem que viajar para o portal');
});

test('o envio recusa um item interno mesmo pelo índice', () => {
  // O item some da tela, mas o número viaja no pedido: sem a guarda, bastaria
  // trocar o índice para anexar num formulário do escritório. E a guarda precisa
  // enxergar o mesmo que a tela — incluindo o que o serviço marca.
  assert.match(portal, /const visto = await docDoCliente\(p, indice\);[\s\S]{0,120}?if \(!visto \|\| visto\.interno\) return res\.status\(400\)/,
    'falta a guarda no envio do cliente');
  assert.match(portal, /async function docDoCliente\(p, indice\)/, 'falta a função que junta processo e serviço');
});

test('o resumo do cliente conta só o que ele vê', () => {
  // "3 de 20 documentos" quando 12 são formulário do escritório é um número que
  // assusta o cliente à toa.
  const i = portal.indexOf('resumo: {');
  const trecho = portal.slice(i, i + 320);
  assert.match(trecho, /checklist\.filter/, 'o resumo deveria sair da lista já filtrada');
});

test('a equipe consegue marcar e desmarcar o item', () => {
  assert.match(docs, /data-doc-interno=/, 'falta o botão na tela de Documentação');
  assert.match(docs, /doc\.interno = !doc\.interno/, 'o botão precisa alternar o marcador');
  assert.match(docs, /interno: !!d\.interno/,
    'o padrão do item deveria vir do checklist do serviço, como o de tradução');
});

test('o marcador é por processo, não global', () => {
  // Um mesmo documento pode ser interno num serviço e do cliente em outro.
  // Procura no manipulador do botão, que fica longe da marcação na tela.
  const i = docs.indexOf("[data-doc-interno]').forEach");
  assert.ok(i > 0, 'não achei o manipulador do botão');
  const trecho = docs.slice(i, i + 600);
  assert.match(trecho, /p\.checklist\[idx\]/, 'tem que mexer no item deste processo');
  assert.match(trecho, /saveProcessos\(\)/, 'a mudança precisa ser gravada');
});
