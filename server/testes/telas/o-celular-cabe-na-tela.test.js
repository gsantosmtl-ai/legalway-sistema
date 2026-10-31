// A segunda camada do celular — 31/10/2026.
//
// A primeira camada (lá no alto do comum.js) já impedia a PÁGINA de estourar:
// medi 390px de largura em todas as 28 telas e nenhuma rola de lado. O que
// ficou faltando era o que acontece DENTRO desses 390px.
//
// O caso que explica a bateria inteira é a Caixa de entrada. A regra de
// empilhar as três colunas existia e funcionava — e mesmo assim metade da
// conversa era invisível no telefone. Motivo: numa grade, "1fr" tem mínimo
// automático de min-content. O conteúdo da coluna media 796px, então a coluna
// ficava com 796px dentro de uma caixa de 390, e o que passava disso era
// cortado pelo `overflow:clip` do body. Sem barra de rolagem, sem aviso: a
// data e a etiqueta de cada conversa simplesmente não existiam.
//
// Medido na bancada, com a sessão e os dados reais:
//   Caixa de entrada   3 blocos de 796px dentro de 390  ->  0
//   topo das telas     175px  ->  53     (21% da altura do aparelho)
//   Financeiro         8 abas em 3 linhas  ->  1 linha que desliza
//   Agenda             3 abas empilhadas, 180px  ->  1 linha
//   Clientes           531 alvos de toque abaixo de 32px  ->  1
//   Entrada de leads   2.062 alvos abaixo de 32px  ->  6
//
// Esta bateria não repete esses números: ela guarda as REGRAS que os
// produziram, para que a próxima tela não repita o mesmo engano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, DOCS, TELAS, lerTela } from './_base.js';

const comum = readFileSync(path.join(RAIZ, 'docs/assets/comum.js'), 'utf8');

/** Só o pedaço de CSS que vale no celular. */
function cssDoCelular() {
  const i = comum.indexOf('html.lw-celular');
  assert.ok(i > 0, 'a camada do celular sumiu do comum.js');
  const fim = comum.indexOf('.lw-carregando{ position:fixed');
  assert.ok(fim > i, 'não achei o fim do bloco de estilo');
  return comum.slice(i, fim);
}
const CSS = cssDoCelular();

/** Pares seletor/corpo de um CSS simples, sem aninhamento. */
function regras(css) {
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ seletor: m[1].replace(/\/\*[\s\S]*?\*\//g, ' ').trim(), corpo: m[2] });
  }
  return out;
}

test('nenhuma coluna do celular usa "1fr" cru', () => {
  // O erro de mil dólares desta noite. "1fr" não encolhe abaixo do
  // min-content do que está dentro — e no celular o que está dentro é largo.
  // minmax(0,1fr) é o mesmo "1fr" COM permissão de encolher.
  const culpadas = [];
  for (const r of regras(CSS)) {
    if (!r.seletor.includes('lw-celular')) continue;
    for (const d of r.corpo.matchAll(/grid-template-columns\s*:\s*([^;]+)/g)) {
      const valor = d[1];
      // tira os minmax já escritos e vê se ainda sobrou um fr solto
      const sobrou = valor.replace(/minmax\([^)]*\)/g, '');
      if (/\dfr|\bfr\b/.test(sobrou)) culpadas.push(r.seletor.split(',')[0].trim() + ' -> ' + valor.trim());
    }
  }
  assert.deepEqual(culpadas, [],
    'fr sem minmax(0,…) no celular: a coluna fica do tamanho do conteúdo e o resto some cortado');
});

test('toda tira de abas das telas está coberta pela regra que faz UMA linha', () => {
  // A regra do celular lista os nomes das tiras. Tela nova com tira nova e
  // nome novo volta a quebrar em três linhas, e ninguém percebe até alguém
  // abrir no telefone.
  const regraDaTira = regras(CSS).find((r) =>
    r.seletor.includes('lw-celular') && /overflow-x\s*:\s*auto/.test(r.corpo) && /flex-wrap\s*:\s*nowrap/.test(r.corpo));
  assert.ok(regraDaTira, 'sumiu a regra que transforma a tira de abas em uma linha só');
  const cobertas = new Set(
    [...regraDaTira.seletor.matchAll(/\.([a-z0-9-]+)/g)].map((m) => m[1]).filter((c) => c !== 'lw-celular'));

  const faltando = [];
  for (const tela of TELAS) {
    const html = lerTela(tela);
    const estilo = (html.match(/<style[\s\S]*?<\/style>/gi) || []).join('\n');
    for (const m of estilo.matchAll(/\.([a-z0-9-]*tabs?[a-z0-9-]*)\s*\{([^}]*)\}/gi)) {
      const nome = m[1], corpo = m[2];
      // só me interessa o CONTENEDOR: o que é flex e segura os botões
      if (!/display\s*:\s*flex/.test(corpo)) continue;
      if (/^(drawer-tabs|cc-tabs|modtabs|tabs|tabs2)$/.test(nome) && cobertas.has(nome)) continue;
      if (!cobertas.has(nome)) faltando.push(tela + ' .' + nome);
    }
  }
  assert.deepEqual(faltando, [],
    'tira de abas que o celular não conhece — vai quebrar em várias linhas');
});

test('todo nome de valor de indicador entra na regra que impede a quebra', () => {
  // "US$ 100,000" partido em duas linhas chega a parecer outro número.
  const regraDoValor = regras(CSS).find((r) =>
    r.seletor.includes('kpi-val') && /white-space\s*:\s*nowrap/.test(r.corpo));
  assert.ok(regraDoValor, 'sumiu a regra que segura o número do indicador numa linha');
  const cobertos = new Set([...regraDoValor.seletor.matchAll(/\.(kpi-val\d*)/g)].map((m) => m[1]));

  const usados = new Set();
  for (const tela of TELAS) {
    for (const m of lerTela(tela).matchAll(/["'\s](kpi-val\d*)["'\s]/g)) usados.add(m[1]);
  }
  const faltando = [...usados].filter((c) => !cobertos.has(c)).sort();
  assert.deepEqual(faltando, [], 'classe de valor que o celular não protege da quebra');
});

test('os botões que só servem no computador são marcados, e a marca esconde', () => {
  // Tela cheia ("esconde o menu da esquerda") não faz sentido num aparelho
  // onde o menu já é gaveta; "personalizar blocos" é trabalho de mesa. Os
  // dois juntos custavam uma linha inteira do topo.
  const comClasse = [...comum.matchAll(/b\.className\s*=\s*'lw-so-computador'/g)].length;
  assert.equal(comClasse, 2,
    'os dois botões de computador precisam da classe — sem ela a regra de esconder não acha ninguém');
  assert.match(CSS, /html\.lw-celular[^{]*\.lw-so-computador[^{]*\{[^}]*display\s*:\s*none/,
    'a classe existe nos botões mas o celular não a esconde');
  // E a marca tem de estar nos DOIS botões certos, não duas vezes no mesmo.
  for (const titulo of ['Esconde o menu da esquerda', 'Escolher o que aparece nesta tela']) {
    const i = comum.indexOf(titulo);
    assert.ok(i > 0, 'sumiu o botão: ' + titulo);
    assert.ok(comum.slice(i, i + 400).includes("'lw-so-computador'"),
      'o botão "' + titulo + '" perdeu a marca de só-computador');
  }
});

test('se o menu desceu para o polegar, o conteúdo ganhou rodapé', () => {
  // O botão do menu é fixed. Em cima cobria o título de toda tela sem barra
  // (na Caixa de entrada, a palavra "Caixa"). Embaixo não cobre título
  // nenhum — mas passa a cobrir a ÚLTIMA linha da página, e aí a pessoa não
  // alcança o último contrato da lista. As duas coisas andam juntas.
  const desceu = regras(CSS).some((r) =>
    r.seletor.includes('lw-menu-btn') && /bottom\s*:\s*\d/.test(r.corpo) && /top\s*:\s*auto/.test(r.corpo));
  if (!desceu) return;   // se um dia voltar para cima, esta regra não se aplica
  const comRodape = regras(CSS).find((r) =>
    r.seletor.includes('lw-celular') && /padding-bottom\s*:\s*(\d+)px/.test(r.corpo)
    && Number(r.corpo.match(/padding-bottom\s*:\s*(\d+)px/)[1]) >= 60);
  assert.ok(comRodape, 'o menu flutua embaixo e nada reserva espaço: a última linha fica debaixo dele');
  assert.match(comRodape.seletor, /\.main|\.content/,
    'o rodapé precisa estar na área de conteúdo, não num canto qualquer');
});

test('no celular o chat mostra a lista OU a conversa, e dá para voltar', () => {
  // .chat-list tem 280px fixos; sobravam 110px para a conversa numa tela de
  // 390. Dava para ver que havia mensagem, não para ler.
  const chat = lerTela('chat.html');
  assert.match(chat, /document\.body\.classList\.add\('lw-conversa-aberta'\)/,
    'abrir conversa precisa marcar o body, senão o celular nunca troca de painel');
  assert.match(chat, /classList\.remove\('lw-conversa-aberta'\)/,
    'sem tirar a marca não há caminho de volta para a lista');
  assert.match(chat, /class="lw-voltar-conversas"/, 'falta o botão de voltar');
  // os dois lados têm de falar o mesmo nome
  assert.match(CSS, /body\.lw-conversa-aberta\s+\.chat-list[^{]*\{[^}]*display\s*:\s*none/,
    'com a conversa aberta a lista sai');
  assert.match(CSS, /body\.lw-conversa-aberta\s+\.chat-area[^{]*\{[^}]*display\s*:\s*flex/,
    'com a conversa aberta a conversa entra');
  assert.match(CSS, /html\.lw-celular\s+\.chat-area\{[^}]*display\s*:\s*none/,
    'sem conversa escolhida o celular mostra a lista inteira');
  // e o botão só pode aparecer no celular: no computador os dois painéis
  // convivem e uma seta de "voltar" não quer dizer nada.
  assert.match(CSS, /\.lw-voltar-conversas\{\s*display:none;\s*\}/,
    'o botão de voltar não pode aparecer no computador');
});

test('a coluna do quadro encaixa inteira, não pela metade', () => {
  // Largura sem encaixe: a rolagem para onde o dedo soltou e fica sempre
  // meia coluna cortada. Encaixe sem largura: encaixa no lugar errado.
  const regraColuna = regras(CSS).find((r) => /\.board\s*>\s*\*/.test(r.seletor));
  assert.ok(regraColuna, 'sumiu a largura da coluna do quadro no celular');
  const largura = regraColuna.corpo.match(/flex\s*:\s*0\s+0\s+(\d+)vw/);
  assert.ok(largura, 'a coluna precisa de largura fixa em vw, senão volta a caber duas e meia na tela');
  const vw = Number(largura[1]);
  assert.ok(vw >= 80 && vw <= 92,
    'entre 80 e 92vw: abaixo cabem duas e o cartão aperta; em 100 nada espia e ninguém descobre que há mais colunas — veio ' + vw);
  assert.match(regraColuna.corpo, /scroll-snap-align\s*:\s*start/, 'falta o encaixe na coluna');
  const regraQuadro = regras(CSS).find((r) => /\.board\{/.test(r.seletor + '{') || /\.board$/.test(r.seletor.trim()));
  assert.ok(regraQuadro && /scroll-snap-type\s*:\s*x\s+mandatory/.test(regraQuadro.corpo),
    'falta o encaixe no quadro: a coluna tem largura mas a rolagem continua parando no meio');
});

test('a busca do topo continua no celular, e cabe', () => {
  // Tirar a busca economizaria o topo inteiro — e tiraria o ⌘K, que é como
  // ela acha cliente. A saída foi deixar a busca ESTICAR e cortar o resto.
  const r = regras(CSS).find((x) => x.seletor.includes('.search-wrap') && /flex\s*:\s*1/.test(x.corpo));
  assert.ok(r, 'a busca precisa esticar para ocupar o que sobra do topo');
  assert.match(r.corpo, /min-width\s*:\s*0/,
    'sem min-width:0 o campo não encolhe e empurra o avatar para fora da tela');
  const semBusca = regras(CSS).some((x) =>
    x.seletor.includes('lw-celular') && /(^|,)\s*html\.lw-celular \.search-wrap\s*$/m.test(x.seletor)
    && /display\s*:\s*none/.test(x.corpo));
  assert.equal(semBusca, false, 'a busca do topo não pode sumir no celular: é o atalho de achar cliente');
});

test('a faixa de boas-vindas empilha e solta o botão que só serve no celular', () => {
  // "Avisar neste celular" é o Web Push — a coisa mais útil da tela num
  // telefone — e ficava espremido num botão de 70px ao lado de uma frase
  // decorativa.
  const r = regras(CSS).find((x) => x.seletor.includes('lw-celular') && /\.hero\b/.test(x.seletor)
    && /flex-direction\s*:\s*column/.test(x.corpo));
  assert.ok(r, 'a faixa precisa empilhar no celular');
  assert.match(CSS, /\.hero-right \.quote[\s\S]{0,160}display\s*:\s*none/,
    'a frase de enfeite sai; o título e o botão ficam');
});
