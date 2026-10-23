// "Travado." E, na vez seguinte, "ficou tudo preto".
//
// A confirmação saía em z-index 2000 e a janela de unificar em 2600: dava para
// LER o texto da pergunta através da camada translúcida e ver o botão
// Confirmar, mas o clique era interceptado pela janela de cima. Não era uma
// tela travada — era uma pergunta inalcançável, e não havia nada a fazer além
// de recarregar a página.
//
// Duas correções, e a segunda só existe por causa da primeira:
//  1. as caixas de pergunta sobem para 9000 — elas são a última palavra;
//  2. as janelas ganham Esc e clique no escuro, MAS essa saída fica desligada
//     enquanto há uma pergunta na frente. Fechar a janela de baixo com a
//     pergunta ainda pendente deixa quem perguntou falando com uma tela que já
//     não existe — foi por aí que a ficha do Jose Anselmo se perdeu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

test('as perguntas ficam acima de qualquer janela que as abriu', () => {
  // A janela mais alta do sistema é a de unificar, em 2600.
  const maisAlta = [...docs.matchAll(/style\.zIndex = (\d+)/g), ...cfg.matchAll(/style\.zIndex = (\d+)/g)]
    .map(m => Number(m[1])).reduce((a, b) => Math.max(a, b), 0);
  const perguntas = ['lw-confirmar', 'lw-confirmar-senha', 'lw-pedir-texto', 'lw-dependentes'];
  for (const id of perguntas) {
    const i = comum.indexOf(`fundo.id = '${id}'`);
    assert.notEqual(i, -1, `${id} precisa de id — é por ele que se sabe que há uma pergunta aberta`);
    const z = Number(/z-index:(\d+)/.exec(comum.slice(i, i + 400))[1]);
    assert.ok(z > maisAlta, `${id} em z-index ${z} fica atrás de uma janela em ${maisAlta}: dá para ler e não dá para clicar`);
  }
});

test('nenhuma caixa de pergunta ficou para trás em 2000', () => {
  assert.ok(!/id = 'lw-[a-z-]+';[\s\S]{0,200}z-index:2000/.test(comum),
    'uma só que sobre volta a travar a tela');
});

function palco() {
  const ouvintes = [];
  const perguntaAberta = { valor: false };
  const ctx = {
    window: { LW: {} },
    document: {
      addEventListener: (tipo, fn) => ouvintes.push([tipo, fn]),
      removeEventListener: (tipo, fn) => { const i = ouvintes.findIndex(([t, f]) => t === tipo && f === fn); if (i >= 0) ouvintes.splice(i, 1); },
      querySelector: (sel) => (perguntaAberta.valor && sel.includes('#lw-confirmar')) ? {} : null,
    },
  };
  vm.createContext(ctx);
  const i = comum.indexOf('window.LW.saidaDaJanela = (fundo, aoFechar)=>{');
  const fim = comum.indexOf('\n  };', i) + 5;
  vm.runInContext(comum.slice(i, fim), ctx);
  const esc = () => ouvintes.filter(([t]) => t === 'keydown').forEach(([, f]) => f({ key: 'Escape', stopPropagation() {} }));
  return { ctx, esc, perguntaAberta };
}

function janela() {
  const cliques = [];
  return { removida: false, remove() { this.removida = true; },
    addEventListener: (t, fn) => cliques.push(fn), cliques };
}

test('Esc e clique no escuro fecham a janela', () => {
  const { ctx, esc } = palco();
  const j = janela();
  ctx.window.LW.saidaDaJanela(j);
  esc();
  assert.equal(j.removida, true, 'sem saída, a pessoa só pode recarregar a página');

  const j2 = janela();
  ctx.window.LW.saidaDaJanela(j2);
  j2.cliques[0]({ target: j2 });
  assert.equal(j2.removida, true, 'clique no escuro');
  const j3 = janela();
  ctx.window.LW.saidaDaJanela(j3);
  j3.cliques[0]({ target: { outro: true } });
  assert.equal(j3.removida, false, 'clique DENTRO da caixa não fecha nada');
});

test('com uma pergunta na frente, Esc não fecha a janela de baixo', () => {
  // Este é o caminho que apagou a ficha: a janela some, a pergunta continua de
  // pé, ela responde "sim", e o código volta a escrever numa tela morta.
  const { ctx, esc, perguntaAberta } = palco();
  const j = janela();
  ctx.window.LW.saidaDaJanela(j);
  perguntaAberta.valor = true;
  esc();
  assert.equal(j.removida, false, 'quem responde ao Esc agora é a pergunta, não a janela');
  perguntaAberta.valor = false;
  esc();
  assert.equal(j.removida, true, 'respondida a pergunta, a saída volta a funcionar');
});

test('a janela de unificar usa a saída comum', () => {
  const i = docs.indexOf('function abrirUnificar(id)');
  assert.match(docs.slice(i, i + 1200), /LW\.saidaDaJanela\(fundo\)/);
});
