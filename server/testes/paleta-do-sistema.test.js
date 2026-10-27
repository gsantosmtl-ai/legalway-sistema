// Auditoria de design, a pedido dela: "melhoria de botões, de cores, de
// layout — apenas layout e designer, sem mexer nas etapas dos funis."
//
// Duas coisas deram para medir, e as duas estavam erradas:
//
//  1. o --amber tinha DOIS valores no sistema (#9A6B12 em 22 telas, #B7791F
//     em 6). A mesma cor semântica mudava de tela para tela — e a segunda
//     reprovava feio em contraste;
//  2. 230 cores estavam escritas na mão, a maioria cópia de um token que já
//     existia. A paleta existia e era contornada: mudá-la não mudava nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../../docs/', import.meta.url);
const TELAS = readdirSync(DIR).filter(a => a.endsWith('.html'));
const ler = (a) => readFileSync(new URL(a, DIR), 'utf8');

// ---------------------------------------------------------------- contraste
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function luz(h) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb(h);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contraste = (a, b) => {
  const [la, lb] = [luz(a), luz(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

test('toda cor de texto da paleta passa no contraste mínimo', () => {
  // 4.5:1 é o mínimo para texto normal. Abaixo disso, quem lê no celular no
  // sol ou tem vista cansada simplesmente não enxerga.
  const css = ler('index.html');
  const tok = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2]]));
  const fundos = [tok.paper, tok['paper-dim'], '#FFFFFF', tok['amber-bg']];
  const ruins = [];
  for (const nome of ['ink', 'ink-soft', 'navy', 'gold', 'red', 'amber', 'green-tag', 'blue-tag', 'purple']) {
    const cor = tok[nome];
    assert.ok(cor, 'falta o token --' + nome);
    for (const f of fundos) {
      const c = contraste(cor, f);
      if (c < 4.5) ruins.push(`--${nome} ${cor} sobre ${f} = ${c.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(ruins, []);
});

test('o âmbar tem UM valor só, em todas as telas', () => {
  // Eram dois. "Atrasada" saía de uma cor no Financeiro e de outra no SDR.
  const valores = new Set();
  for (const a of TELAS) {
    for (const m of ler(a).matchAll(/--amber:\s*(#[0-9A-Fa-f]{6});/g)) valores.add(m[1].toUpperCase());
  }
  assert.equal(valores.size, 1, 'achei: ' + [...valores].join(', '));
  assert.equal([...valores][0], '#8E5F06');
});

// ------------------------------------------------------------- disciplina
test('nenhum token da paleta aponta para si mesmo', () => {
  // Na primeira tentativa de arrumar isto eu criei "--navy: var(--navy)" em
  // cinco telas, o que apagaria a cor delas inteiras. Revertido e refeito.
  const ruins = [];
  for (const a of TELAS) {
    for (const m of ler(a).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}\n]+)/g)) {
      if (m[2].trim().startsWith('var(')) ruins.push(`${a}: ${m[1]} = ${m[2].trim()}`);
    }
  }
  assert.deepEqual(ruins, []);
});

test('var() não aparece onde o navegador não resolve', () => {
  // <meta name="theme-color" content="var(--navy)"> não pinta nada.
  const ruins = [];
  for (const a of TELAS) {
    for (const m of ler(a).matchAll(/(?:content|theme-color)="[^"]*var\(--[^"]*"/g)) ruins.push(`${a}: ${m[0]}`);
  }
  assert.deepEqual(ruins, []);
});

test('as cores da paleta não são reescritas na mão nas telas principais', () => {
  // Cópia de token espalhada pelo código é a razão de mudar a paleta não
  // mudar nada. Teto medido depois da limpeza, para não voltar a crescer.
  const PALETA = ['#16204F', '#6B6558', '#DEDAD1', '#2F6F4E', '#3A5A8C', '#A5402E', '#1A1A1A'];
  for (const a of ['funil-comercial.html', 'sdr.html', 'financeiro.html', 'documentos.html', 'index.html']) {
    const corpo = ler(a).replace(/--[a-z0-9-]+\s*:\s*[^;}\n]+/g, '');
    const copias = PALETA.reduce((s, c) => s + (corpo.match(new RegExp(c, 'gi')) || []).length, 0);
    assert.ok(copias <= 6, `${a}: ${copias} cores da paleta escritas na mão — use var(--token)`);
  }
});

// ------------------------------------------------- revisão de design externa
// Levei a medição a um segundo olhar (ChatGPT) com a regra de não mexer em
// estrutura nem nas etapas dos funis. De quatro alertas de cor que ele deu,
// DOIS não se confirmaram quando medidos — as etiquetas coloridas passam
// todas, e o menu escuro usa branco a 68% (8,55:1). Os outros dois eram
// reais, e viraram estes testes.

test('toda etiqueta tem contraste no PRÓPRIO fundo colorido', () => {
  // O alerta dele foi legítimo: meu número original era só sobre o fundo
  // claro, e etiqueta tem fundo próprio. Medido: todas passam. O teste fica
  // para que continuem passando quando alguém mexer numa das cores.
  const css = readFileSync(new URL('index.html', DIR), 'utf8');
  const tok = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2]]));
  const pares = [['green-tag', 'green-tag-bg'], ['red', 'red-bg'], ['amber', 'amber-bg'],
    ['blue-tag', 'blue-tag-bg'], ['purple', 'purple-bg'], ['gold', 'gold-soft']];
  const ruins = [];
  for (const [t, f] of pares) {
    const c = contraste(tok[t], tok[f]);
    if (c < 4.5) ruins.push(`${t} sobre ${f} = ${c.toFixed(2)}:1`);
  }
  assert.deepEqual(ruins, []);
});

test('o magenta da marca não representa status', () => {
  // Era o segundo alerta, e procedia: "Pendente" saía no magenta da marca.
  // Cor de marca marca a ação principal; quando ela também significa um
  // estado, a pessoa deixa de saber o que o magenta quer dizer.
  const rel = readFileSync(new URL('relatorios.html', DIR), 'utf8');
  const m = /const cores = \{([^}]*)\}/.exec(rel);
  assert.ok(m, 'não achei o mapa de cores de status');
  assert.doesNotMatch(m[1], /var\(--gold\)/, 'cor de marca não é estado');
  // E dois estados não podem sair da mesma cor: o legenda fica ambígua.
  const usadas = [...m[1].matchAll(/'[^']+':'(var\(--[a-z-]+\))'/g)].map((x) => x[1]);
  assert.equal(new Set(usadas).size, usadas.length, 'dois status com a mesma cor: ' + usadas.join(', '));
});

test('botão só de ícone tem nome para quem não vê o ícone', () => {
  // Leitor de tela anuncia "botão" e mais nada. E um ⋮ sozinho também não
  // diz nada a quem entrou na equipe esta semana.
  const semNome = [];
  for (const arq of ['financeiro.html', 'documentos.html', 'agenda.html', 'funil-comercial.html', 'contratos.html']) {
    const html = readFileSync(new URL(arq, DIR), 'utf8');
    for (const m of html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)) {
      const dentro = m[2].replace(/<[^>]+>/g, '').trim();
      if (!dentro || /[A-Za-zÀ-ÿ]/.test(dentro)) continue;
      if (!/aria-label|title=/.test(m[1])) semNome.push(`${arq}: "${dentro.slice(0, 10)}"`);
    }
  }
  assert.deepEqual(semNome, []);
});
