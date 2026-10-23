// "Testa todos os botões."
//
// Num dia só, quatro defeitos do MESMO tipo chegaram à produção: um botão
// chamando algo que não existe naquela tela.
//
//   canal is not defined     → a tela de departamentos não abria
//   fmtData is not defined   → o detalhe do contrato não abria
//   abrirDrawer(...)         → clicar numa linha do painel "O dia" não fazia nada
//   LW.gravar em comentário  → o guarda aceitou o comentário no lugar da chamada
//
// Todos passaram por testes que LEEM o código. Nenhum seria pego lendo. Estes
// três testes varrem as 28 telas e reprovam dizendo a tela e o nome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpar, declarados, chamados, BUILTIN, DE_FORA, scriptsDa, telasHtml, htmlDe, globaisCompartilhadas }
  from './ajuda/analisar-tela.js';

const globais = globaisCompartilhadas();

test('nenhuma tela chama função que não existe', () => {
  const quebrados = [];
  for (const tela of telasHtml()) {
    const codigo = limpar(scriptsDa(tela));
    if (!codigo.trim()) continue;
    const dec = declarados(codigo);
    for (const nome of chamados(codigo)) {
      if (dec.has(nome) || globais.has(nome) || BUILTIN.has(nome) || DE_FORA.has(nome)) continue;
      quebrados.push(`${tela}: ${nome}()`);
    }
  }
  assert.deepEqual(quebrados.sort(), [],
    'essas chamadas estouram em tempo de execução — a tela ou o botão simplesmente não funciona');
});

test('todo botão com id tem alguém escutando o clique', () => {
  // Botão desenhado e sem handler é o defeito mais silencioso que existe: a
  // pessoa clica, nada acontece, e ninguém reporta porque "deve ser normal".
  const mudos = [];
  for (const tela of telasHtml()) {
    const html = htmlDe(tela);
    const codigo = scriptsDa(tela);
    for (const m of html.matchAll(/<button[^>]*\bid="([a-zA-Z][\w-]*)"/g)) {
      const id = m[1];
      const escutado = new RegExp(`['"\`]${id}['"\`]`).test(codigo)
        || new RegExp(`id="${id}"[^>]*\\bonclick=`).test(html);
      // Botão dentro de <a href>: quem navega é o link, e o botão é só a
      // aparência. "Abrir em Contratos →" funciona assim.
      const dentroDeLink = /<a\s[^>]*href=/.test(html.slice(Math.max(0, m.index - 220), m.index));
      if (!escutado && !dentroDeLink) mudos.push(`${tela}: #${id}`);
    }
  }
  assert.deepEqual(mudos.sort(), [], 'botão que ninguém escuta não faz nada quando clicado');
});

test('getElementById sem "?" aponta para id que existe', () => {
  // `document.getElementById('x').addEventListener` com id errado estoura e
  // mata o resto do script da tela — tudo abaixo dele para de funcionar.
  const fantasmas = [];
  for (const tela of telasHtml()) {
    const html = htmlDe(tela);
    const codigo = scriptsDa(tela);
    const idsNoHtml = new Set([...html.matchAll(/\bid="([a-zA-Z][\w-]*)"/g)].map(m => m[1]));
    // só os que o código usa SEM proteção e encadeando logo em seguida
    for (const m of codigo.matchAll(/document\.getElementById\('([a-zA-Z][\w-]*)'\)\s*\./g)) {
      const id = m[1];
      if (idsNoHtml.has(id)) continue;
      // pode ser criado em tempo de execução pelo próprio script
      if (new RegExp(`id="?\\$?\\{?${id}`).test(codigo) || codigo.includes(`"${id}"`)) continue;
      fantasmas.push(`${tela}: #${id}`);
    }
  }
  assert.deepEqual(fantasmas.sort(), [],
    'esse getElementById devolve null e a linha estoura, matando o resto do script da tela');
});
