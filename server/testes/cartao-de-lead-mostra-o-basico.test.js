// O que o vendedor precisa ver sem abrir o card.
//
// A pergunta dela: "não sei se falta informação nos cards de lead para os
// vendedores baterem os olhos e já verem". Faltava — e o dado já estava
// guardado, só não aparecia: `l.telefone` e `l.origem`/`l.campanha`.
//
// São justamente as duas primeiras coisas que o vendedor faz: pegar o número
// para ligar, e entender de onde a pessoa veio. Lead de anúncio e lead de
// indicação não se aborda igual.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TELA = join(dirname(fileURLToPath(import.meta.url)), '../../docs/funil-comercial.html');
const html = readFileSync(TELA, 'utf8');

function cartao() {
  const i = html.indexOf('function renderCard(l){');
  assert.ok(i > 0, 'não achei renderCard em funil-comercial.html');
  let nivel = 0, fim = -1;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') nivel++;
    else if (html[k] === '}') { nivel--; if (nivel === 0) { fim = k + 1; break; } }
  }
  return html.slice(i, fim);
}
const card = cartao();

test('o telefone aparece no card', () => {
  assert.match(card, /l\.telefone/, 'sem o número, ligar exige abrir o card antes');
});

test('a origem do lead aparece no card', () => {
  assert.match(card, /nomeDaOrigem\(l\.origem\)/,
    'de onde a pessoa veio muda a abordagem; ficava escondido na ficha');
});

test('a campanha aparece quando existe, e não estoura o card', () => {
  assert.match(card, /l\.campanha/);
  assert.match(card, /slice\(0,\s*34\)/, 'nome de campanha do Meta é longo e quebraria o cartão');
});

test('telefone e campanha passam pelo escape', () => {
  // Nome de campanha vem do Meta, digitado por gente de fora. Entra como texto.
  assert.match(card, /escaparHtml\(l\.telefone\)/);
  assert.match(card, /escaparHtml\(String\(l\.campanha\)/);
});

test('o card continua mostrando o que já mostrava', () => {
  for (const [o_que, re] of [
    ['nome', /l\.nome/],
    ['serviço e vendedor', /servicoExibido.*l\.vendedor/s],
    ['tempo na etapa', /timeInStage\(l\.entradaEtapa\)/],
    ['valor', /valorNegociado \|\| l\.valorPotencial/],
    ['tentativas de contato', /l\.tentativasContato/],
    ['próxima ação', /l\.proximaAcao/],
    ['motivo da perda', /l\.perda/],
  ]) assert.match(card, re, `sumiu do card: ${o_que}`);
});
