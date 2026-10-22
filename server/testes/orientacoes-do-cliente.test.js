// "Preciso que tenha os modelos de arquivos, observações, tudo."
//
// A orientação é o que o cliente lê no portal embaixo do nome do documento.
// Sem ela "CARTA TESTEMUNHA" é só um título: ninguém sabe quem pode ser
// testemunha, o que a carta precisa conter, nem que pode escrever em português
// e o escritório traduz. O escritório já tinha esses textos escritos; faltava
// estarem dentro do sistema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { dicaDoDocumento, TODAS_AS_DICAS } = await import('../src/biblioteca-vistos.js');

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
const instalacao = readFileSync(new URL('../src/instalacao.js', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../../docs/portal-cliente.html', import.meta.url), 'utf8');

test('as orientações do escritório estão no sistema, pelos nomes que ele usa', () => {
  // O checklist dele diz "CARTA PESSOAL", não "Declaração pessoal detalhada".
  for (const nome of ['CARTA PESSOAL', 'CARTA TESTEMUNHA', 'FOTO EM FUNDO BRANCO']) {
    assert.ok(dicaDoDocumento(nome).length > 80, `${nome} precisa de uma orientação de verdade`);
  }
});

test('a carta de testemunha responde as perguntas que travam o cliente', () => {
  const t = dicaDoDocumento('CARTA TESTEMUNHA');
  assert.match(t, /não é necessário que seja cidadã americana/i, 'quem pode ser testemunha');
  assert.match(t, /Nome completo da testemunha/i, 'o que a carta precisa ter');
  assert.match(t, /Data e assinatura/i, 'como fechar a carta');
  assert.match(t, /pode escrever em português/i, 'o medo do idioma é o que mais trava');
});

test('a carta pessoal diz para não copiar o modelo', () => {
  // O modelo existe para o cliente entender o formato. Copiado, vira uma
  // história que não é a dele — e o caso cai.
  const t = dicaDoDocumento('CARTA PESSOAL');
  assert.match(t, /Não copie o modelo/i);
  assert.match(t, /não se preocupe[^.]*erros de português/i,
    'o cliente precisa saber que não é prova de redação');
});

test('a tela consegue casar a orientação com o nome do documento', () => {
  assert.match(instalacao, /dicasGerais: TODAS_AS_DICAS/, 'a rota precisa mandar o dicionário inteiro');
  assert.ok(Object.keys(TODAS_AS_DICAS).length > 50, 'o dicionário não pode ter encolhido');
  assert.match(cfg, /dicasGeraisCache = r\.dicasGerais \|\| \{\}/, 'a tela precisa guardar o dicionário');
  assert.match(cfg, /porNome\.get\(String\(nome\|\|''\)\.trim\(\)\.toLowerCase\(\)\)/,
    'a busca não pode depender de maiúscula ou espaço');
});

test('o botão só preenche o que está em branco', () => {
  // Sobrescrever o que ela escreveu à mão seria perder trabalho dela.
  const i = cfg.indexOf('async function preencherOrientacoes()');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /const preencher = \(d\)=>\{ if\(\(d\.dica\|\|''\)\.trim\(\)\) return 0;/,
    'documento com orientação escrita tem que ser pulado');
  assert.match(corpo, /const ok = await LW\.confirmar\(/, 'tem que confirmar antes');
  assert.match(corpo, /\[\.\.\.faltando\]\.join\(', '\)/, 'e listar quais documentos vão receber');
  assert.match(corpo, /processos\.forEach\(p=> \(p\.checklist\|\|\[\]\)\.forEach\(d=> nosProcessos \+= preencher\(d\)\)\)/,
    'os clientes de hoje também precisam da orientação, não só os futuros');
});

test('o portal mostra a orientação e o modelo', () => {
  assert.match(portal, /\$\{d\.dica \? `<div class="dica">💡 \$\{esc\(d\.dica\)\}<\/div>` : ''\}/,
    'a orientação precisa aparecer para o cliente');
  assert.match(portal, /📄 Ver um exemplo pronto — \$\{esc\(d\.modelo\.nome\)\}/,
    'e o modelo anexado também');
});
