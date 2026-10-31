// Dois sinos no topo, em cinco telas.
//
// `_sinoGarantirHtml()` não cria o sino quando já existe — mas a guarda
// procura o BADGE (`#bell-badge`), não o sino. Documentação, Financeiro,
// Clientes, Contratos e SDR já tinham no HTML um `<div class="bell-wrap">`
// com o desenho e sem badge: enfeite antigo, não abria nada. A guarda não via
// badge, criava o sino de verdade ao lado, e ficavam dois.
//
// No computador passa por detalhe. Num telefone de 390px são 34px a menos
// para o que importa, e a pessoa toca no que não faz nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TELAS, lerTela, RAIZ } from './_base.js';

const comum = readFileSync(path.join(RAIZ, 'docs/assets/comum.js'), 'utf8');

function corpoDoSino() {
  const i = comum.indexOf('function _sinoGarantirHtml()');
  assert.ok(i > 0, '_sinoGarantirHtml sumiu do comum.js');
  const abre = comum.indexOf('{', i);
  let n = 0;
  for (let k = abre; k < comum.length; k++) {
    if (comum[k] === '{') n++;
    else if (comum[k] === '}') { n--; if (!n) return comum.slice(i, k + 1); }
  }
  throw new Error('não fechei as chaves');
}

test('o sino antigo da tela é ADOTADO, não duplicado', () => {
  const c = corpoDoSino();
  assert.match(c, /document\.querySelector\('\.bell-wrap:not\(#bell-wrap\)'\)/,
    'precisa procurar o sino que a tela já desenhou');
  assert.match(c, /velho\.id = 'bell-wrap';/);
  assert.match(c, /b\.id = 'bell-badge';/, 'o adotado precisa ganhar o badge, senão a guarda falha de novo');
  assert.ok(c.indexOf('const velho') < c.indexOf('const wrap = document.createElement'),
    'a adoção tem de vir antes de criar um novo');
});

test('a adoção sai pela porta — não cria o segundo depois', () => {
  const c = corpoDoSino();
  const i = c.indexOf('velho.appendChild(b);');
  assert.ok(i > 0);
  assert.match(c.slice(i, i + 60), /return;/);
});

for (const tela of TELAS) {
  test(`${tela} · no máximo um sino no HTML`, () => {
    const html = lerTela(tela);
    const quantos = (html.match(/class="bell-wrap"/g) || []).length;
    assert.ok(quantos <= 1, `${tela} desenha ${quantos} sinos no próprio HTML`);
  });
}

test('quem já tinha badge continua igual — não ganhou um terceiro', () => {
  // index.html e entrada-leads.html já tinham sino COM badge; a guarda do
  // topo já os protegia e não pode mudar de comportamento.
  for (const tela of ['index.html', 'entrada-leads.html']) {
    const html = lerTela(tela);
    assert.equal((html.match(/id="bell-badge"/g) || []).length, 1, `${tela}`);
  }
});
