// "Está escrevendo de trás para frente."
//
// Campo de busca que redesenha a tela a cada tecla: o redesenho troca o input
// por um novo, o cursor nasce na posição 0, e cada letra vai parar ANTES da
// anterior — "Edna" vira "andE". Quando o campo nem é refocado, a digitação
// simplesmente sai dali depois da primeira letra.
//
// Três campos do sistema fazem isso, e os três precisam devolver o foco E a
// posição do cursor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const fin = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');

// Um campo está correto quando, no mesmo trecho: guarda selectionStart,
// redesenha, e devolve foco e posição no campo NOVO.
function conferir(fonte, ancora, fim, nome) {
  const i = fonte.indexOf(ancora);
  assert.ok(i > 0, `não achei ${nome}`);
  const corpo = fonte.slice(i, fonte.indexOf(fim, i));
  assert.match(corpo, /selectionStart/, `${nome}: precisa guardar a posição do cursor`);
  assert.match(corpo, /\.focus\(\)/, `${nome}: precisa devolver o foco`);
  assert.match(corpo, /setSelectionRange\(pos, pos\)/, `${nome}: precisa devolver a posição`);
  assert.match(corpo, /try\{[^}]*setSelectionRange|try\s*\{/, `${nome}: setSelectionRange quebra em alguns tipos de input`);
  return corpo;
}

test('a busca da unificação não escreve ao contrário', () => {
  // Foi onde ela viu: o nome do processo saía invertido.
  const corpo = conferir(docs, "campo.addEventListener('input', ()=>{", '});', 'busca da unificação');
  assert.ok(corpo.indexOf('const pos') < corpo.indexOf('pintar()'),
    'a posição tem que ser lida ANTES de redesenhar — depois o campo já é outro');
});

test('a busca da Documentação também devolve o cursor', () => {
  conferir(docs, "campoBusca.addEventListener('input', ()=>{", '}, 180);', 'busca da Documentação');
});

test('a busca do Financeiro também', () => {
  // Esta estava quebrada desde antes: o campo é redesenhado junto com a barra
  // e nada devolvia o foco — a digitação saía do campo na primeira letra.
  const corpo = conferir(fin, "document.getElementById('busca-fin').addEventListener('input'", '}, 180);', 'busca do Financeiro');
  assert.match(corpo, /clearTimeout\(window\.__buscaFinTimer\)/,
    'com 3.818 contas, redesenhar a cada tecla trava a tela');
});

test('o valor digitado vai para o estado antes de qualquer espera', () => {
  // Se o desenho atrasar e a pessoa parar de digitar, o que ela escreveu não
  // pode se perder.
  for (const [fonte, ancora, fim, nome] of [
    [docs, "campoBusca.addEventListener('input', ()=>{", '}, 180);', 'Documentação'],
    [fin, "document.getElementById('busca-fin').addEventListener('input'", '}, 180);', 'Financeiro'],
  ]) {
    const corpo = fonte.slice(fonte.indexOf(ancora), fonte.indexOf(fim, fonte.indexOf(ancora)));
    const iValor = Math.max(corpo.indexOf('buscaDoc = '), corpo.indexOf('busca = '));
    assert.ok(iValor > 0 && iValor < corpo.indexOf('setTimeout'),
      `${nome}: o texto digitado tem que ser guardado antes da espera`);
  }
});
