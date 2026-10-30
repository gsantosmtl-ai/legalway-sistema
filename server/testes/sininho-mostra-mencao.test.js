// Pedido dela em 30/10/2026: "quando tem o @ tem que aparecer no sininho lá em
// cima, que alguém marcou".
//
// Antes o sino existia em duas telas, só a Dashboard tinha conta (leads,
// contratos, pedidos de ajuda), menção não entrava e clicar não abria nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../../docs/index.html', import.meta.url), 'utf8');

test('o sino come da mesma fonte dos lembretes, que já traz as menções', () => {
  assert.match(comum, /_sinoItens\s*=\s*\(r\.lembretes/,
    'o sino não é alimentado pelo /api/lembretes');
  assert.match(comum, /i\.tipo === 'mencao'/, 'o sino não separa as menções');
});

test('o sino nasce sozinho nas telas que não têm o HTML dele', () => {
  assert.match(comum, /function _sinoGarantirHtml/);
  assert.match(comum, /id="bell-badge"/, 'o sino criado por JS precisa do mesmo id');
});

test('clicar no sino abre a lista', () => {
  assert.match(comum, /_sinoPainel\(\)\.style\.display/, 'o sino não abre nada ao clicar');
  assert.match(comum, /document\.addEventListener\('click'/, 'clicar fora precisa fechar');
});

test('só um dono escreve o número do sino', () => {
  // Dois dedos no mesmo badge se sobrescrevem, e o número fica dançando.
  assert.doesNotMatch(index, /getElementById\('bell-badge'\)\.(textContent|style)/,
    'a Dashboard voltou a escrever o badge direto, por cima do sino');
  assert.match(index, /LW\.sinoExtras\(/, 'a Dashboard precisa entregar a conta dela ao sino');
});

test('a primeira busca enche o sino SEM jogar popup na cara', () => {
  // Decisão antiga do arquivo: abrir a tela já com uma caixa na frente
  // atrapalha. O sino não tem esse problema, então ele vem antes.
  assert.match(comum, /buscarLembretes\(false\), 300\)/, 'o sino demora a aparecer');
  assert.match(comum, /buscarLembretes\(true\), 4000\)/, 'o popup perdeu a espera dele');
  const fn = comum.slice(comum.indexOf('async function buscarLembretes'));
  assert.match(fn.slice(0, 900), /if\(!comPopup\) continue;/,
    'sem popup, o aviso não pode ser marcado como visto — morreria sem aparecer');
});
