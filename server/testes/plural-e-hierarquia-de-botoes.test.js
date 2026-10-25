// Dois achados da revisão de usabilidade, vindos de um print que ela mandou da
// gaveta do lead.
//
// 1) "0 anotaçãoões". O texto era `anotação${n===1?'':'ões'}` — o radical já
//    terminava em "ção" e o plural era emendado por cima. Aparecia em duas
//    telas.
//
// 2) A aba aberta era "Anotação" e o botão "Salvar anotação" era o QUARTO do
//    rodapé, abaixo de "Mover p/...", "Transferir" e "Sair do funil" — três
//    ações que não têm a ver com anotar. Quem escreve a conversa procura o
//    salvar no fim de uma pilha de outra natureza.
//
//    A regra que saiu daí, e que este teste guarda: a ação principal da aba
//    aberta nunca fica depois das ações secundárias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../../docs/', import.meta.url);
const telas = readdirSync(dir).filter(f => f.endsWith('.html'));

test('nenhum plural é emendado por cima do radical', () => {
  // o erro: "ção" seguido de um ternário que acrescenta "ões"
  const ruins = [];
  for (const t of telas) {
    const html = readFileSync(new URL(t, dir), 'utf8');
    for (const m of html.matchAll(/(ç|s)ão\$\{[^}]*'ões'[^}]*\}/g)) {
      ruins.push(`${t}: ${m[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(ruins, [],
    'o radical já termina em "ão" e o ternário emenda "ões" — vira "anotaçãoões":\n' + ruins.join('\n'));
});

test('e o singular não perde o "ão" na correção', () => {
  // a primeira tentativa de conserto tirou o "ão" e deixou "0 anotaç"
  const ruins = [];
  for (const t of telas) {
    const html = readFileSync(new URL(t, dir), 'utf8');
    for (const m of html.matchAll(/anotaç\$\{[^}]*\}/g)) {
      if (!/'ão'/.test(m[0])) ruins.push(`${t}: ${m[0].slice(0, 70)}`);
    }
  }
  assert.deepEqual(ruins, [], 'o ternário precisa carregar as duas formas:\n' + ruins.join('\n'));
});

test('na gaveta do lead, a ação da aba vem antes das ações de etapa', () => {
  const html = readFileSync(new URL('funil-comercial.html', dir), 'utf8');
  const acaoDaAba = html.indexOf('id="d-foot"');
  const acoesDoLead = html.indexOf('id="d-acoes"');
  assert.ok(acaoDaAba > 0 && acoesDoLead > 0, 'não achei os dois rodapés da gaveta');
  assert.ok(acaoDaAba < acoesDoLead,
    '"Salvar anotação" voltaria a ficar depois de "Mover p/...", "Transferir" e "Sair do funil"');
});

test('as ações de etapa ficam rotuladas, para não se misturarem com a da aba', () => {
  const html = readFileSync(new URL('funil-comercial.html', dir), 'utf8');
  assert.match(html, /O que fazer com este lead/,
    'sem rótulo, os dois grupos de botão viram uma pilha só');
});

test('botão que cria dado de verdade só aparece para sócio e pede confirmação', () => {
  // Os dois criam contrato com valor e parcelas que entram no Financeiro, e
  // ficavam soltos na tela, sem trava de perfil e sem aviso.
  const casos = [
    ['contratos.html', 'sim-contrato'],
    ['documentos.html', 'btn-cliente-teste-completo'],
  ];
  for (const [tela, id] of casos) {
    const html = readFileSync(new URL(tela, dir), 'utf8');
    const botao = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`));
    assert.ok(botao, `${tela}: não achei o botão ${id}`);
    assert.match(botao[0], /data-so-admin/, `${tela}: ${id} precisa sumir para quem não é sócio`);
    const handler = html.slice(html.indexOf(`getElementById('${id}').addEventListener`));
    assert.match(handler.slice(0, 700), /LW\.confirmar/,
      `${tela}: ${id} cria dado de verdade e precisa confirmar antes`);
  }
});

test('a regra de esconder por perfil é compartilhada, não copiada em cada tela', () => {
  const comum = readFileSync(new URL('assets/comum.js', dir), 'utf8');
  assert.match(comum, /ehAdministrador/);
  assert.match(comum, /\[data-so-admin\]/);
  assert.match(comum, /acessoTotal/);
});
