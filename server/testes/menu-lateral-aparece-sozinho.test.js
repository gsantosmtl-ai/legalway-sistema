// O menu lateral não pode depender dos dados da tela.
//
// Relato dela, em uma linha: "entrada de lead sai o menu lateral".
//
// O que acontecia: cada tela desenhava o próprio menu DEPOIS de terminar de
// carregar os dados. Na Entrada de Leads isso eram seis idas ao servidor em
// fila — e uma delas uma GRAVAÇÃO. Até a última terminar, a coluna da esquerda
// ficava vazia; e se qualquer uma falhasse, o menu não vinha nunca e a pessoa
// ficava presa na tela, sem link nenhum para sair.
//
// Agora o menu desenha assim que a página abre, no comum.js, antes de qualquer
// busca. A tela redesenha depois só para pôr o contador no próprio item.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DOCS = join(AQUI, '../../docs');
const comum = readFileSync(join(DOCS, 'assets/comum.js'), 'utf8');

test('o comum.js desenha o menu assim que a página abre', () => {
  const i = comum.indexOf("document.addEventListener('DOMContentLoaded'");
  assert.ok(i > 0, 'não achei o bloco que roda quando a página termina de abrir');
  const bloco = comum.slice(i);
  assert.ok(/getElementById\('side-nav'\)[\s\S]{0,200}LW\.menuLateral\(\)/.test(bloco),
    'o menu lateral deixou de ser desenhado na abertura da página');
});

// A proteção contra desenhar duas vezes: se a tela já montou o menu (com o
// contador), o comum.js não apaga o que ela fez.
test('não redesenha por cima do menu que a tela já montou', () => {
  assert.ok(/const temMenu = nav && nav\.querySelector\(/.test(comum) && /!temMenu && LW\.menuLateral/.test(comum),
    'o menu da abertura passou a sobrescrever o menu da tela');
});

// O link "Como usar" é pendurado no fim do menu por outro trecho, que roda
// ANTES deste. Se "vazio" fosse só "sem filhos", esse único link faria o menu
// parecer pronto — e a tela abria com ele e mais nada. Foi o que aconteceu na
// primeira tentativa.
test('o link Como usar sozinho não conta como menu montado', () => {
  assert.ok(/:not\(\[href="ajuda\.html"\]\)/.test(comum),
    'o "Como usar" voltou a contar como menu montado');
});

// Abrir uma tela não grava nada.
//
// A Entrada de Leads tinha um `await saveLeads()` no carregamento — gravava a
// lista inteira toda vez que alguém abria, sem nada ter mudado. Além de
// segurar o menu por mais uma ida ao servidor, era perigoso: a leitura logo
// acima tem um `catch` que deixa a lista VAZIA, e a gravação em seguida
// escreveria essa lista vazia por cima da lista real.
test('a Entrada de Leads não grava nada ao abrir', () => {
  const html = readFileSync(join(DOCS, 'entrada-leads.html'), 'utf8');
  const i = html.indexOf('async function loadAll(');
  assert.ok(i > 0, 'não achei o loadAll da Entrada de Leads');
  let nivel = 0, fim = -1;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') nivel++;
    else if (html[k] === '}') { nivel--; if (nivel === 0) { fim = k + 1; break; } }
  }
  // Tira os comentários antes de procurar: o motivo da remoção está escrito
  // ali dentro, e o próprio texto citaria a chamada que o teste proíbe.
  const corpo = html.slice(i, fim).replace(/\/\/[^\n]*/g, '');
  assert.ok(!/\bsave[A-Z]\w*\s*\(/.test(corpo) && !/LW\.gravar\s*\(/.test(corpo),
    'o carregamento da Entrada de Leads voltou a gravar ao abrir a tela');
});

// Toda tela interna tem o lugar do menu. Sem o `#side-nav` no HTML, o
// comum.js não tem onde desenhar e a tela abre sem navegação.
//
// Era exatamente o caso da Caixa de entrada e dos Usuários: as duas ESTÃO no
// menu lateral e não tinham menu lateral nenhum. Quem clicava nelas só
// voltava pelo botão do navegador.
const FORA_DO_SISTEMA = ['login.html', 'primeiro-acesso.html', 'verificar.html',
  'portal-cliente.html', 'portal-prestador.html', 'ajuda.html'];
// Páginas de dentro de outra tela, que não estão no menu e têm "← Voltar"
// para a tela de onde vieram. O teste abaixo cobra esse link delas.
const SUBPAGINAS = ['auditoria.html', 'conciliacao.html', 'importar.html', 'seguranca.html'];

test('toda tela do sistema tem o lugar do menu no HTML', () => {
  const isenta = new Set([...FORA_DO_SISTEMA, ...SUBPAGINAS]);
  const faltando = readdirSync(DOCS)
    .filter(f => f.endsWith('.html') && !isenta.has(f))
    .filter(f => !readFileSync(join(DOCS, f), 'utf8').includes('id="side-nav"'));
  assert.deepStrictEqual(faltando, [], `telas sem o menu lateral: ${faltando.join(', ')}`);
});

// Nenhuma tela pode ficar sem saída: ou tem menu, ou tem o caminho de volta.
test('as páginas sem menu têm link de voltar', () => {
  const semSaida = SUBPAGINAS.filter(f => !/class="voltar"/.test(readFileSync(join(DOCS, f), 'utf8')));
  assert.deepStrictEqual(semSaida, [], `páginas sem menu e sem volta: ${semSaida.join(', ')}`);
});

// ---- O que NÃO fica no menu ----
//
// Pedido dela em 30/10/2026: "retirar do menu lateral bling, conciliacao".
// São telas de conferência, de usar de vez em quando — no menu competiam com
// as telas de trabalho do dia. As duas continuam existindo e abrem pelo
// endereço; só saíram da lateral.
//
// Sem este teste, a volta delas é o tipo de coisa que entra de carona numa
// mexida de layout e ninguém percebe.
const FORA_DO_MENU = ['bling.html', 'conciliacao-fluxo.html'];

test('as telas de conferência não voltam para o menu lateral', () => {
  const i = comum.indexOf('const items = [');
  assert.ok(i > 0, 'não achei a lista de itens do menu lateral');
  const lista = comum.slice(i, comum.indexOf('];', i));
  for (const tela of FORA_DO_MENU) {
    assert.ok(!lista.includes(tela),
      `${tela} voltou para o menu lateral — ela foi tirada de lá a pedido dela`);
  }
});

// A contrapartida: tirar do menu não pode virar tirar do ar. Se alguém apagar a
// tela achando que ela não serve mais, quem tinha o endereço salvo perde o
// acesso sem aviso.
test('as telas tiradas do menu continuam existindo', () => {
  for (const tela of FORA_DO_MENU) {
    assert.ok(readdirSync(DOCS).includes(tela),
      `${tela} sumiu da pasta: sair do menu é uma coisa, deixar de existir é outra`);
  }
});
