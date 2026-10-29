// Nenhuma aba da ficha pode ficar fora do alcance.
//
// Relato dela: "portal do cliente não está abrindo". Não era que não abria —
// é que não dava para CHEGAR nela.
//
// A faixa de abas era uma fila única com rolagem na horizontal e a barra de
// rolagem escondida (`scrollbar-width:none`). Medido no navegador, com a fonte
// e o espaçamento reais: a faixa pedia 1.289px e o painel da ficha tem 480px.
// Sete abas ficavam fora da vista — Protocolo, Acompanhamento, Tradução,
// Psicológica, Portal do cliente, Credenciais e Histórico — e nada na tela
// dizia que elas existiam. Quem não soubesse arrastar de lado nunca as via.
//
// Agora a faixa quebra linha: toda aba aparece, sem precisar descobrir nada.
//
// Este teste falha se alguém voltar a rolagem escondida, tirar a quebra de
// linha, ou acrescentar uma aba sem ter escrito o que ela mostra.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = (f) => readFileSync(join(AQUI, '../../docs/', f), 'utf8');
const html = ler('documentos.html');

// As duas telas que abrem ficha em painel lateral. O Funil tem cinco abas, que
// pediam 495px num painel de 480: o "Histórico" ficava cortado.
const TELAS = ['documentos.html', 'funil-comercial.html'];

function regraDaFaixa(f) {
  const m = /\.drawer-tabs\{([^}]*)\}/.exec(ler(f));
  assert.ok(m, `${f}: não achei a faixa de abas da ficha`);
  return m[1];
}

test('a faixa de abas quebra linha em vez de esconder aba', () => {
  for (const f of TELAS) {
    assert.ok(/flex-wrap: *wrap/.test(regraDaFaixa(f)),
      `${f}: a faixa de abas voltou a ser uma fila única — as últimas abas somem do painel de 480px`);
  }
});

test('a faixa nunca rola de lado com a barra escondida', () => {
  for (const f of TELAS) {
    const regra = regraDaFaixa(f);
    const rola = /overflow-x: *(auto|scroll)/.test(regra);
    const escondeBarra = /scrollbar-width: *none/.test(regra);
    assert.ok(!(rola && escondeBarra),
      `${f}: a faixa rola na horizontal E esconde a barra de rolagem: a aba que sobra`
      + ' fica invisível e sem nenhum sinal de que existe — foi exatamente este o defeito');
  }
});

test('toda aba da ficha tem o que mostrar quando é clicada', () => {
  const faixa = html.slice(html.indexOf('<div class="drawer-tabs">'));
  const abas = [...faixa.slice(0, faixa.indexOf('</div>\n  <div class="drawer-body"'))
    .matchAll(/data-dtab="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(abas.length >= 12, `esperava ao menos 12 abas, achei ${abas.length}`);
  assert.ok(abas.includes('portal'), 'a aba do Portal do cliente sumiu da ficha');
  for (const aba of abas) {
    const temRamo = new RegExp(`activeDtab *=== *'${aba}'`).test(html)
      || new RegExp(`activeDtab *== *'${aba}'`).test(html);
    assert.ok(temRamo,
      `a aba "${aba}" existe na ficha mas não há nada escrito para ela: abre em branco`);
  }
});
