// Três formas de ver o quadro, e as abas da ficha com tamanho de gente.
//
// "Aqui começa a descer muito para visualizar, teria que ser uma forma que
// conseguisse ver na forma de kanban mas também ter outras formas de
// visualizar tudo, tanto no comercial como no documentos."
//
// O "desce muito" foi, em parte, obra minha: ao pôr o tempo de casa, o tempo na
// etapa e o protocolo no cartão, cada um ganhou linhas e a coluna cresceu.
// O compacto devolve a altura sem tirar nada — é só uma classe no quadro, e o
// cartão continua sendo montado de um jeito só.
//
// E: "não melhorou as abas dentro dos cards, tanto comercial quanto documento".
// Elas tinham 12,5px (abaixo do mínimo do padrão do próprio sistema) e 3px de
// folga lateral: a área de clique era o texto.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const ler = (f) => readFileSync(join(DOCS, f), 'utf8');
const comum = ler('assets/comum.js');
const QUADROS = ['documentos.html', 'funil-comercial.html'];

test('o seletor oferece kanban, compacto e lista', () => {
  assert.match(comum, /\['kanban',\s*'compacto',\s*'lista'\]/,
    'as três formas precisam estar no seletor');
  assert.match(comum, /compacto:'▤ Compacto'/);
});

test('o compacto é uma classe no quadro, não outro cartão', () => {
  // Dois jeitos de montar o mesmo cartão divergem com o tempo: um ganha um
  // campo novo e o outro não, e ninguém percebe até alguém reclamar.
  assert.match(comum, /quadro\.classList\.toggle\('compacto', atual === 'compacto'\)/);
  for (const f of QUADROS) {
    const s = ler(f);
    assert.match(s, /\.board\.compacto \.card\{/, `${f} precisa do estilo compacto`);
    assert.ok(!/visao\([^)]*\) === 'compacto'/.test(s),
      `${f} não deve montar cartão diferente no compacto`);
  }
});

test('o compacto esconde o detalhe e guarda o que faz escolher', () => {
  const doc = ler('documentos.html');
  const i = doc.indexOf('.board.compacto .card{');
  const bloco = doc.slice(i, i + 900);
  for (const escondido of ['.checklist-progress', '.fin-row', '.card-meta']) {
    assert.ok(bloco.includes(escondido), `${escondido} deveria sumir no compacto`);
  }
  // O que fica: nome, tempo e a barra do pago.
  assert.ok(!/\.board\.compacto \.card-name\{[^}]*display:none/.test(bloco), 'o nome fica');
  assert.ok(!/\.board\.compacto \.card-tempo\{[^}]*display:none/.test(bloco), 'o tempo fica');
  assert.ok(!/\.board\.compacto \.bar-fill\{[^}]*display:none/.test(bloco), 'a barra do pago fica');
});

test('o compacto não esconde o que pede ação', () => {
  const doc = ler('documentos.html');
  const i = doc.indexOf('.board.compacto .card{');
  const bloco = doc.slice(i, i + 900);
  assert.ok(!/\.board\.compacto[^{]*\.card-alert/.test(bloco), 'alerta não some');
  assert.ok(!/\.board\.compacto \.pill\{[^}]*display:none/.test(bloco),
    'o selo do contrato e o "sem retorno" continuam visíveis');
});

test('as abas da ficha têm tamanho e área de clique de gente', () => {
  for (const f of QUADROS) {
    const s = ler(f);
    const m = s.match(/\.dtab\{([^}]*)\}/);
    assert.ok(m, `${f}: não achei .dtab`);
    const tamanho = Number((m[1].match(/font-size:\s*([\d.]+)px/) || [])[1]);
    assert.ok(tamanho >= 13, `${f}: aba com ${tamanho}px — o mínimo do padrão é 13px`);
    const lados = Number((m[1].match(/padding:\s*[\d.]+px\s+([\d.]+)px/) || [])[1]);
    assert.ok(lados >= 10, `${f}: só ${lados}px de folga lateral — a área de clique vira o texto`);
  }
});

test('a aba escolhida se distingue por mais de uma coisa', () => {
  for (const f of QUADROS) {
    const m = ler(f).match(/\.dtab\.active\{([^}]*)\}/);
    assert.ok(m, `${f}: não achei .dtab.active`);
    const r = m[1];
    const sinais = ['color:', 'font-weight:', 'background:'].filter((x) => r.includes(x));
    assert.ok(sinais.length >= 3,
      `${f}: a aba ativa se marca só por ${sinais.length} sinal(is); um traço de 2px some de vista`);
  }
});

test('as duas telas usam exatamente as mesmas abas', () => {
  const [a, b] = QUADROS.map((f) => (ler(f).match(/\.dtab\{[^}]*\}/) || [''])[0]);
  assert.equal(a, b, 'aba da ficha diferente entre as telas é o que faz o sistema parecer remendado');
});

test('em tela cheia o canto de cima não amontoa', () => {
  const i = comum.indexOf('function estiloTelaCheia()');
  const estilo = comum.slice(i, comum.indexOf('})();', i));
  assert.match(estilo, /\.topbar-right\{[^}]*flex-wrap:wrap/,
    'sem quebra de linha os botões empilham sobre o nome do usuário');
  assert.match(estilo, /\.topbar-right button span\{\s*display:none/,
    'em tela cheia os botões viram ícone, como já fazem em tela estreita');
  assert.match(estilo, /\.user-meta \.urole\{\s*display:none/,
    'o cargo ocupa uma segunda linha que escapa por baixo da faixa');
});
