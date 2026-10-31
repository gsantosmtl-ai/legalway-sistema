// "tem que limpar um pouco as telas, principalmente pensando em usar no
//  celular... aparece um monte de coisa no final, últimas atividades, casos no
//  USCIS, acesso rápido aos módulos, tudo isso polui demais o sistema."
//                                                          — 31/10/2026
//
// A resposta foi `data-celular`: no telefone, o painel secundário fecha e o
// cabeçalho vira o botão que abre. Nada some; o que some é o atropelo.
//
// O jeito como isso foi feito tem uma armadilha, e é dela que esta bateria
// cuida: o CSS esconde TODO filho do bloco fechado menos o cabeçalho. Se o
// bloco não tiver um cabeçalho que o seletor reconheça — `.panel-head`, `h3`,
// `h2` ou algo marcado com `data-celular-cabeca`, e como FILHO DIRETO — o
// bloco inteiro desaparece do celular, título e tudo, sem erro nenhum no
// console. Num sistema que a equipe começa a usar no telefone na segunda, um
// painel que some em silêncio é pior do que um painel feio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TELAS, lerTela, RAIZ } from './_base.js';

const comum = readFileSync(path.join(RAIZ, 'docs/assets/comum.js'), 'utf8');

const VAZIAS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr']);

/**
 * Os filhos DIRETOS do elemento que começa em `i`, por contagem de tags.
 *
 * Nada de regex de "pega até o próximo </div>": o painel tem div dentro de div
 * e a primeira que fecha é a de dentro. Contar abre e fecha é o único jeito
 * que sobrevive ao HTML real destas telas.
 */
function filhosDiretos(html, i) {
  const fim = html.indexOf('>', i);
  if (fim < 0) return null;
  const tagPai = (html.slice(i + 1).match(/^[a-zA-Z0-9]+/) || [''])[0].toLowerCase();
  if (html[fim - 1] === '/' || VAZIAS.has(tagPai)) return [];
  const re = /<\/?([a-zA-Z0-9]+)([^>]*)>/g;
  re.lastIndex = fim + 1;
  let nivel = 1, m;
  const filhos = [];
  while ((m = re.exec(html))) {
    const nome = m[1].toLowerCase();
    const fecha = m[0][1] === '/';
    const soZinha = m[0].endsWith('/>') || VAZIAS.has(nome);
    if (fecha) { nivel--; if (!nivel) return filhos; continue; }
    if (nivel === 1) filhos.push({ nome, attrs: m[2] });
    if (!soZinha) nivel++;
  }
  return null;   // não fechou: HTML quebrado, outro teste cuida disso
}

function blocosMarcados(html, valor) {
  const out = [];
  const re = new RegExp('<[a-zA-Z0-9]+[^>]*\\bdata-celular="' + valor + '"', 'g');
  let m;
  while ((m = re.exec(html))) out.push({ i: m.index, trecho: html.slice(m.index, m.index + 160) });
  return out;
}

const ehCabecalho = (f) =>
  f.nome === 'h2' || f.nome === 'h3'
  || /\bclass="[^"]*\bpanel-head\b/.test(f.attrs)
  || /\bdata-celular-cabeca\b/.test(f.attrs);

test('todo bloco que fecha no celular tem um cabeçalho que o CSS enxerga', () => {
  const culpados = [];
  for (const tela of TELAS) {
    const html = lerTela(tela);
    for (const b of blocosMarcados(html, 'fechado')) {
      const filhos = filhosDiretos(html, b.i);
      if (filhos === null) continue;
      // Bloco vazio no HTML é preenchido por JS; aí o cabeçalho tem de vir de
      // lá, e a tela precisa dizer isso em algum lugar.
      if (filhos.length === 0) {
        if (!html.includes('data-celular-cabeca')) culpados.push(tela + ' :: ' + b.trecho.slice(0, 80));
        continue;
      }
      if (!filhos.some(ehCabecalho)) culpados.push(tela + ' :: ' + b.trecho.slice(0, 80));
    }
  }
  assert.deepEqual(culpados, [],
    'bloco fechado sem cabeçalho de filho direto: no celular ele some inteiro, em silêncio');
});

test('data-celular só aceita as três palavras que o CSS conhece', () => {
  // Um "data-celular=fechada" não quebra nada: simplesmente não faz nada, e
  // quem escreveu acha que fez.
  const validas = new Set(['fechado', 'oculto', 'filtros']);
  const erradas = [];
  for (const tela of TELAS) {
    for (const m of lerTela(tela).matchAll(/\bdata-celular="([^"]*)"/g)) {
      if (!validas.has(m[1])) erradas.push(tela + ' :: ' + m[1]);
    }
  }
  assert.deepEqual(erradas, []);
  for (const v of validas) {
    assert.ok(comum.includes('[data-celular="' + v + '"]'),
      'o CSS do comum.js não trata data-celular="' + v + '"');
  }
});

test('os números do Dashboard nunca nascem fechados', () => {
  // O motivo de abrir o sistema no celular é ver quanto entrou. Se um dia
  // alguém fechar a faixa de indicadores "para limpar mais", a tela perde a
  // razão de existir.
  const html = lerTela('index.html');
  for (const bloco of ['kpi-strip', 'hero', 'period-bar', 'o-que-precisa-da-minha-atencao', 'minha-agenda-hoje']) {
    const i = html.indexOf('data-bloco="' + bloco + '"');
    assert.ok(i > 0, 'sumiu o bloco ' + bloco + ' do Dashboard');
    const linha = html.slice(html.lastIndexOf('<', i), html.indexOf('>', i));
    assert.ok(!/data-celular="(fechado|oculto)"/.test(linha),
      'o bloco "' + bloco + '" é do primeiro olhar: não pode nascer fechado nem sumir no celular');
  }
});

test('o botão de filtros nasce FORA da barra, senão o redesenho o leva junto', () => {
  // A barra de Documentação é refeita por innerHTML a cada tecla da busca.
  // Um botão criado dentro dela viveria menos de um segundo.
  const i = comum.indexOf('function aplicarBotaoDeFiltros');
  assert.ok(i > 0, 'sumiu aplicarBotaoDeFiltros');
  const corpo = comum.slice(i, comum.indexOf('\n  }', comum.indexOf('barra.parentNode', i)));
  assert.match(corpo, /barra\.parentNode\.insertBefore\(b, barra\)/,
    'o botão tem de ser irmão da barra, não filho');
  assert.match(corpo, /previousElementSibling/, 'e tem de ser reencontrado pelo lugar onde foi posto');
  assert.match(corpo, /classList\.contains\('lw-botao-filtros'\)/,
    'a guarda olha o BOTÃO, não uma marca à parte — foi a lição dos dois sinos');
  assert.match(corpo, /conta\.hidden = n === 0/,
    'a conta só aparece quando há filtro ligado');
});

test('fechar a barra não esconde a busca nem o número de filtros ligados', () => {
  // Esconder filtro sem dizer que ele está ligado faz a lista aparecer curta
  // sem explicação — é o jeito mais rápido de alguém concluir que o sistema
  // perdeu processo.
  assert.match(comum, /\[data-celular="filtros"\][^{]*input\[type="search"\][^{]*\{[^}]*flex:1 1 100%/,
    'a busca continua visível com a barra fechada');
  assert.match(comum, /:not\(\[data-aberto="sim"\]\) > \* > \*:not\(input\[type="search"\]\)/,
    'o resto da barra sai, a busca fica');
  const i = comum.indexOf('function filtrosLigados');
  const corpo = comum.slice(i, comum.indexOf('\n  }', i));
  assert.match(corpo, /selectedIndex > 0/, 'select fora do padrão conta como filtro ligado');
  assert.match(corpo, /\.fsel-btn\.ativo/, 'os menus de marcar vários também contam');
  assert.ok(!/input\[type="search"\]/.test(corpo.replace(/:not\(input\[type="search"\]\)/g, '')),
    'a busca não entra na conta: ela fica visível, quem digita já a vê');
});

test('no celular a tela cheia fica desligada', () => {
  // Documentação, Funil e SDR nascem em tela cheia, e o estilo dela diz
  // `body.lw-tela-cheia .kpi-strip{ display:flex !important }` — que vence a
  // regra de duas colunas do celular por vir depois na mesma folha. Medido:
  // os seis indicadores da Documentação com 53px cada.
  const i = comum.indexOf('function aplicarTelaCheia');
  assert.ok(i > 0, 'sumiu aplicarTelaCheia');
  const corpo = comum.slice(i, comum.indexOf('\n  }', i));
  assert.match(corpo, /classList\.contains\('lw-celular'\)\) ligado = false;/,
    'no celular a tela cheia tem de ser desligada antes de qualquer coisa');
  assert.ok(corpo.indexOf('ligado = false') < corpo.indexOf("classList.toggle('lw-tela-cheia'"),
    'desligar depois de aplicar não adianta nada');
  // e girar o aparelho tem de tirá-la também
  assert.match(comum, /if\(ehCelular && document\.body && document\.body\.classList\.contains\('lw-tela-cheia'\)\)/,
    'atravessar o corte de largura precisa tirar a tela cheia');
});

test('o que está aberto é lembrado, e a tela abre mesmo sem poder lembrar', () => {
  // localStorage estoura em aba anônima e com dados do site bloqueados. Já
  // derrubou tela inteira aqui antes.
  const i = comum.indexOf('function dobrasAbertas');
  const corpo = comum.slice(i, comum.indexOf('function aplicarDobras'));
  assert.match(corpo, /try\{[\s\S]*localStorage\.getItem[\s\S]*catch\(e\)\{ return new Set\(\); \}/,
    'ler o que estava aberto não pode derrubar a tela');
  assert.match(corpo, /try\{ localStorage\.setItem[\s\S]*catch\(e\)\{\}/, 'gravar também não');
  const j = comum.indexOf('function nomeDaDobra');
  const nome = comum.slice(j, comum.indexOf('\n  }', j));
  assert.ok(!/indexOf|children\[|\bi\b *\+\+/.test(nome),
    'a identidade do bloco não pode ser a posição: a ordem muda quando um bloco some por falta de permissão');
  assert.match(nome, /data-bloco/, 'o id que a tela já usa em "Personalizar" serve aqui também');
});

test('o link dentro do cabeçalho leva para a outra tela, não abre o bloco', () => {
  // "Ver todos", "Ver documentação" e "Ver detalhes" moram dentro do
  // cabeçalho que virou botão.
  const i = comum.indexOf("document.addEventListener('click'");
  const corpo = comum.slice(i, comum.indexOf('\n    });', i));
  assert.match(corpo, /if\(e\.target\.closest\('a, button'\)\) return;/,
    'clique num link do cabeçalho não pode dobrar o bloco de passagem');
});
