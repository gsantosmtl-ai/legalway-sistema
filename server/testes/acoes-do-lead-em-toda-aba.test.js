// "Tem que estar em anotações, pois é a primeira tela que se abre: se ele
// quiser mover no funil, se quiser transferir, se quiser sair do funil."
//
// As ações do lead — mover etapa, transferir, tirar do funil — só existiam na
// aba Resumo. E a aba que abre primeiro é a Anotação: quem abria o lead para
// registrar a conversa tinha que trocar de aba para mover o funil. Na prática,
// ou não movia, ou anotava e esquecia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fc = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');

test('a barra de ações existe fora do rodapé da aba', () => {
  assert.match(fc, /<div class="drawer-foot" id="d-acoes"/, 'uma barra própria');
  assert.match(fc, /<div class="drawer-foot" id="d-foot"/, 'e o rodapé da aba continua');
  assert.match(fc, /visíveis em qualquer aba/, 'o porquê fica escrito');
});

test('ela é desenhada em TODA aba, não só no Resumo', () => {
  const i = fc.indexOf("const foot = document.getElementById('d-foot');");
  const trecho = fc.slice(i, i + 200);
  assert.match(trecho, /pintarAcoesDoLead\(l\);/,
    'a chamada vem antes de qualquer if de aba — vale para todas');
  const iResumo = fc.indexOf("if(activeDtab === 'resumo')");
  assert.ok(fc.indexOf('pintarAcoesDoLead(l);') < iResumo, 'fora do if do Resumo');
});

test('os quatro botões continuam existindo', () => {
  const i = fc.indexOf('function pintarAcoesDoLead(l)');
  const corpo = fc.slice(i, fc.indexOf('\n}', fc.indexOf('barra.innerHTML', i)));
  assert.match(corpo, /id="btn-voltar"/);
  assert.match(corpo, /id="btn-avancar"/);
  assert.match(corpo, /id="btn-transferir"/);
  assert.match(corpo, /id="btn-sair"/);
  assert.match(corpo, /Mover p\/ "\$\{ETAPAS\[nextIdx\]\}"/, 'o botão diz para onde vai');
});

test('lead perdido mostra Reabrir, não as ações normais', () => {
  const i = fc.indexOf('function pintarAcoesDoLead(l)');
  const corpo = fc.slice(i, i + 900);
  assert.match(corpo, /if\(l\.perda\)\{/);
  assert.match(corpo, /↩︎ Reabrir em "\$\{ETAPAS\[0\]\}"/);
  assert.match(corpo, /return;/);
});

test('o lead ganho não oferece "mover para a próxima" — oferece o contrato', () => {
  const i = fc.indexOf('function pintarAcoesDoLead(l)');
  const corpo = fc.slice(i, i + 1600);
  assert.match(corpo, /l\.contratoGeradoId \? `<a href="contratos\.html\?abrir=\$\{l\.contratoGeradoId\}"/);
  assert.match(corpo, /🎉 Ganho/);
});

test('o clique é ligado UMA vez só', () => {
  // A função desenha e o bloco "wire actions", no fim de renderDrawer, liga.
  // Ligar nos dois faria cada clique mover duas etapas de uma vez.
  const i = fc.indexOf('function pintarAcoesDoLead(l)');
  const corpo = fc.slice(i, fc.indexOf('\nfunction renderDrawer', i));
  assert.ok(!/btn-avancar'\)\?\.addEventListener/.test(corpo), 'a função não pode ligar o clique');
  assert.match(corpo, /Quem liga os cliques é o bloco "wire actions"/);
  const iWire = fc.indexOf('// wire actions');
  assert.ok(iWire > fc.indexOf('pintarAcoesDoLead(l);'), 'e ele roda depois de a barra existir');
  assert.equal((fc.match(/const btnAvancar = document\.getElementById\('btn-avancar'\)/g) || []).length, 1);
});
