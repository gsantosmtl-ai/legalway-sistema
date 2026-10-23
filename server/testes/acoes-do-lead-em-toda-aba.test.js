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

test('ela é desenhada em TODA aba', () => {
  const i = fc.indexOf("const foot = document.getElementById('d-foot');");
  const trecho = fc.slice(i, i + 200);
  assert.match(trecho, /pintarAcoesDoLead\(l\);/,
    'a chamada vem antes de qualquer if de aba — vale para todas');
  // A aba "Resumo" não existe mais: o que ela mostrava virou a faixa fixa
  // `d-trilha`. O que este teste garante continua valendo — a chamada fica
  // antes do primeiro if de aba, então nenhuma aba fica sem as ações.
  assert.equal(fc.indexOf("activeDtab === 'resumo'"), -1, 'a aba Resumo foi removida');
  const iPrimeiraAba = fc.indexOf('if(activeDtab ===');
  assert.ok(iPrimeiraAba > 0 && fc.indexOf('pintarAcoesDoLead(l);') < iPrimeiraAba,
    'fora de qualquer if de aba');
});

test('a faixa fixa do lead também é desenhada em toda aba', () => {
  // A trilha de etapas e os dados de contato eram da aba Resumo. Agora são uma
  // faixa logo abaixo do cabeçalho, visível com qualquer aba aberta.
  assert.match(fc, /<div id="d-trilha"/, 'a faixa existe');
  const iPrimeiraAba = fc.indexOf('if(activeDtab ===');
  assert.ok(fc.indexOf('pintarTrilhaDoLead(l);') < iPrimeiraAba, 'pintada antes dos ifs de aba');
  const iFn = fc.indexOf('function pintarTrilhaDoLead(l)');
  const corpo = fc.slice(iFn, fc.indexOf('\nfunction renderDrawer', iFn));
  assert.match(corpo, /stage-dot/, 'a trilha de etapas continua clicável');
  assert.match(corpo, /data-jump/, 'e move o lead de etapa');
  assert.match(corpo, /mailto:/, 'o e-mail continua ali');
  assert.match(corpo, /l\.endereco/, 'e o endereço');
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
