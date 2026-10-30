// Marcar alguém da equipe numa anotação com @.
//
// Pedido dela: "EM ANOTAÇÕES @ E NOME DE OUTRA PESSOA DA EMPRESA PARA VER ESSA
// ANOTAÇÃO". A anotação continua morando no histórico do processo — o @ é só o
// toque no ombro: a pessoa recebe a anotação no chat.
//
// O que estes testes guardam são as três coisas que, se saírem errado, fazem a
// marcação valer menos do que não ter:
//
//   1. nome com acento e espaço ("@Vitória Santos") tem que ser reconhecido;
//   2. o aviso sai DEPOIS de gravar, nunca antes;
//   3. nome que não bate com ninguém é DITO, não engolido — senão quem
//      escreveu fica achando que o recado chegou.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../src/chat.js', import.meta.url), 'utf8');
const corpoDe = (fonte, de, ate) => {
  const i = fonte.indexOf(de);
  assert.ok(i >= 0, 'não achei: ' + de);
  return fonte.slice(i, fonte.indexOf(ate, i));
};
const semComent = (t) => t.replace(/^\s*\/\/.*$/gm, '');
// Comparação por JSON: os arrays nascem DENTRO do vm, em outro realm, e
// deepEqual reprova dois iguais só por virem de Array.prototype diferentes.
const igual = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

// Roda as funções de verdade, recortadas da tela.
function palco(equipe) {
  const ctx = vm.createContext({
    equipeDoEscritorio: equipe, responsaveis: [], console,
    esc: (x) => String(x == null ? '' : x).replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  });
  for (const f of ['function nomesDaEquipe()', 'const semAcentoMin =',
                   'function mencoesNoTexto(texto)', 'function comMencoes(texto)']) {
    const i = tela.indexOf(f);
    assert.ok(i > 0, 'não achei ' + f);
    const fim = f.startsWith('const') ? tela.indexOf('\n', i) : tela.indexOf('\n}', i) + 2;
    vm.runInContext(tela.slice(i, fim), ctx);
  }
  return ctx;
}

const EQUIPE = ['Vitória', 'Ana Paula', 'Ana', 'Elaine', 'Adriano'];

test('acha o nome com acento', () => {
  const c = palco(EQUIPE);
  igual(c.mencoesNoTexto('falei com o cliente, @Vitória confere depois'), ['Vitória']);
  // Quem digita sem acento também tem que ser entendido: metade do escritório
  // escreve "Vitoria".
  igual(c.mencoesNoTexto('@Vitoria confere depois'), ['Vitória']);
});

test('nome com espaço não vira o nome curto', () => {
  // Com "@Ana Paula" no texto, quem foi marcada é a Ana Paula — avisar a Ana
  // seria tocar o ombro de quem não tem nada com isso.
  const c = palco(EQUIPE);
  igual(c.mencoesNoTexto('@Ana Paula vê isso por favor'), ['Ana Paula']);
  igual(c.mencoesNoTexto('@Ana vê isso'), ['Ana']);
});

test('marca mais de uma pessoa', () => {
  const c = palco(EQUIPE);
  const r = c.mencoesNoTexto('@Elaine e @Adriano, o cliente ligou hoje');
  igual([...r].sort(), ['Adriano', 'Elaine']);
});

test('arroba de e-mail não marca ninguém', () => {
  const c = palco(EQUIPE);
  igual(c.mencoesNoTexto('mandei pro ana@gmail.com ontem'), []);
  igual(c.mencoesNoTexto('sem marcação nenhuma aqui'), []);
});

test('o destaque escapa o HTML antes de marcar', () => {
  // Anotação é texto que gente digita. Marcar primeiro e escapar depois
  // transformaria o destaque em HTML executável.
  const c = palco(EQUIPE);
  const html = c.comMencoes('<img src=x onerror=alert(1)> @Vitória');
  assert.ok(!html.includes('<img'), 'o HTML digitado não pode sair vivo');
  assert.match(html, /<b style="color:var\(--navy\);">@Vitória<\/b>/);
});

test('o aviso sai depois de gravar, nunca antes', () => {
  const h = semComent(corpoDe(tela, 'async function salvarAnotacaoDoc(', '\n}\n'));
  const iGrava = h.indexOf('await saveProcessos()');
  const iAvisa = h.indexOf("LW.api('/mencoes'");
  assert.ok(iGrava > 0 && iAvisa > iGrava,
    'tocar o ombro por uma anotação que não ficou salva manda a pessoa procurar o que não existe');
});

test('a anotação guarda quem foi marcado', () => {
  const h = corpoDe(tela, 'async function salvarAnotacaoDoc(', '\n}\n');
  assert.match(h, /mencoes: marcados/);
});

test('falha no aviso não finge que deu certo', () => {
  const h = corpoDe(tela, 'async function salvarAnotacaoDoc(', '\n}\n');
  assert.match(h, /NÃO consegui avisar no chat/);
});

test('a rota diz quem NÃO foi avisado', () => {
  // Nome que não bate com ninguém ativo. Engolir isso é o pior resultado
  // possível: quem escreveu acha que o recado chegou.
  const r = semComent(corpoDe(chat, "rotasChat.post('/mencoes'", '\n});'));
  assert.match(r, /naoEncontrados/);
  assert.match(r, /avisarPessoa\(nome, linha\)\) \? avisados\.push\(nome\) : naoEncontrados\.push\(nome\)/);
  assert.match(tela, /Não achei no sistema/, 'e a tela precisa mostrar isso');
});

test('a rota não avisa a própria pessoa e não repete nome', () => {
  const r = semComent(corpoDe(chat, "rotasChat.post('/mencoes'", '\n});'));
  // A comparação passou a tirar acento dos DOIS lados em 30/10/2026: antes,
  // `k` já vinha sem acento e o nome cru não, então a "Vitória" recebia aviso
  // da própria anotação e a "Vitoria" não.
  assert.match(r, /if \(k === semAcento\(req\.usuario\.nome \|\| ''\)\) continue;/);
  assert.match(r, /vistos\.has\(k\)/);
  assert.match(r, /nomes\.slice\(0, 20\)/, 'uma anotação não pode disparar cem mensagens');
});

test('a rota exige login e permissão de chat, e limpa o texto', () => {
  const r = semComent(corpoDe(chat, "rotasChat.post('/mencoes'", '\n});'));
  assert.match(r, /podeEscreverChat\(req\.usuario\)/);
  assert.match(r, /limparTexto/);
});
