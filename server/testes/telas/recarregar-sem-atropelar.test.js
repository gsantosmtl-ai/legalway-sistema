// "precisamos deixar o sistema mais fluido e sem travas, sem refresh, sem bug
//  de mudar o card e ele voltar, sem delay de descer e ele voltar, mas rápido"
//  — ela, 30/10/2026.
//
// As três queixas tinham a MESMA causa. Seis telas tinham o próprio
// setInterval chamando loadAll() cru, em paralelo com o recarregador do
// storage.js, que já faz isso direito. A volta do relógio caía no meio de uma
// gravação, lia o estado ANTIGO e redesenhava: o card voltava, a rolagem ia
// para o topo, e tudo isso enquanto a tela baixava os blocos de novo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TELAS, lerTela, scriptsDa, semComentarios, RAIZ } from './_base.js';
import path from 'node:path';

const storage = readFileSync(path.join(RAIZ, 'docs/assets/storage.js'), 'utf8');

// O WAHA é exceção legítima: enquanto a pessoa parea o número, a tela precisa
// perguntar pelo QR de poucos em poucos segundos, e isso acaba quando parear.
const PERMITIDOS = /atualizarBadgeChat|pollWaha|buscar, 5000|sincronizar/;

test('existe UM recarregador protegido, e ele é exposto às telas', () => {
  assert.match(storage, /recarregarSePuder:\s*\(\)\s*=>\s*recarregarSePossivel\(\)/);
});

test('o recarregador espera a gravação em voo terminar', () => {
  const fn = storage.slice(storage.indexOf('async function recarregarSePossivel'));
  assert.match(fn.slice(0, 900), /emVoo > 0/,
    'sem isto ele lê o estado antigo no meio da gravação — é o card que volta');
  assert.match(fn.slice(0, 900), /ultimoSet/, 'nem logo depois de gravar');
  assert.match(fn.slice(0, 900), /ultimaRolagem/, 'nem no meio de uma rolagem');
  assert.match(fn.slice(0, 900), /digitandoAgora\(\)/, 'nem com alguém digitando');
  assert.match(fn.slice(0, 900), /modalAberto/, 'nem com um modal aberto');
});

test('o recarregador devolve a rolagem depois de redesenhar', () => {
  const fn = storage.slice(storage.indexOf('async function recarregar()'));
  assert.match(fn.slice(0, 600), /guardarRolagem\(\)/);
  assert.match(fn.slice(0, 600), /devolverRolagem\(onde\)/);
});

test('a rede de segurança é uma só, e não roda com a aba escondida', () => {
  assert.match(storage, /setInterval\([\s\S]{0,80}?recarregarSePossivel\(\)[\s\S]{0,20}?60000\)/,
    'a rede de 60s sumiu');
  assert.match(storage, /if\(!document\.hidden\)/,
    'aba escondida não precisa recarregar — era parte do tráfego de fundo');
});

for (const tela of TELAS) {
  test(`${tela} · não recarrega sozinha por fora do caminho protegido`, () => {
    const js = semComentarios(scriptsDa(lerTela(tela)).join('\n'));
    const laços = [...js.matchAll(/setInterval\(\s*([\s\S]{0,60}?),\s*(\d+)\s*\)/g)]
      .map((m) => ({ o: m[1].replace(/\s+/g, ' ').trim(), ms: Number(m[2]) }))
      .filter((x) => !PERMITIDOS.test(x.o) && !PERMITIDOS.test(String(x.ms)))
      .filter((x) => /loadAll|carregar|render|recarregar|sincroniz/i.test(x.o))
      .map((x) => `${x.o} a cada ${x.ms / 1000}s`);
    assert.deepEqual(laços, [],
      'esta tela tem o próprio laço de recarga: ele atropela gravação, rolagem e modal');
  });

  test(`${tela} · não recarrega tudo ao voltar para a aba`, () => {
    const js = semComentarios(scriptsDa(lerTela(tela)).join('\n'));
    const cru = [...js.matchAll(/addEventListener\(\s*'focus'[\s\S]{0,90}?\)/g)]
      .map((m) => m[0].replace(/\s+/g, ' '))
      .filter((x) => /loadAll|carregar\(/.test(x));
    assert.deepEqual(cru, [],
      'voltar para a aba disparava um loadAll cru, que joga a rolagem para o topo');
  });
}

// ---------------------------------------------------------------------------
// E o último relógio que ainda redesenhava a tela à toa.
//
// A tela de Contratos tinha `setInterval(… checar…(); render(); }, 8000)` —
// redesenhava a cada 8 segundos tivesse acontecido alguma coisa ou não, e
// também com a aba escondida. É da mesma família da queixa: a pessoa está no
// meio de uma edição e a tela se refaz embaixo dela.
// ---------------------------------------------------------------------------
test('Contratos só redesenha quando a assinatura realmente chegou', () => {
  const tela = lerTela('contratos.html');
  const i = tela.indexOf("setInterval(async ()=>{\n  if(document.hidden) return;");
  assert.notEqual(i, -1, 'o relógio da tela de Contratos voltou a rodar com a aba escondida');
  const bloco = tela.slice(i, tela.indexOf('}, 8000)', i));
  assert.match(bloco, /if\(await checarConfirmacoesDeAssinatura\(\)\) render\(\);/,
    'render() incondicional a cada 8 s é o card que volta');
  assert.doesNotMatch(bloco, /await checarConfirmacoesDeAssinatura\(\);\s*render\(\);/);
});

test('a função diz se mudou algo — senão não dá para decidir', () => {
  const tela = lerTela('contratos.html');
  const i = tela.indexOf('async function checarConfirmacoesDeAssinatura()');
  const corpo = tela.slice(i, tela.indexOf('\n}', i));
  assert.match(corpo, /return mudou;/);
});

test('voltar para a aba continua redesenhando sempre', () => {
  // No foco é o contrário: a pessoa acabou de chegar e quer ver o estado novo.
  assert.match(lerTela('contratos.html'),
    /window\.addEventListener\('focus', async \(\)=>\{ await checarConfirmacoesDeAssinatura\(\); render\(\); \}\)/);
});

test('nenhuma rede de segurança do comum.js roda com a aba escondida', () => {
  // O contador do chat e a busca de lembretes são os dois relógios que vivem
  // em TODAS as telas: o que custa ali, custa 28 vezes. Com a aba escondida
  // ninguém vê o resultado, e os dois já se atualizam no `focus`.
  const comum = readFileSync(path.join(RAIZ, 'docs/assets/comum.js'), 'utf8');
  const relogios = [...comum.matchAll(/setInterval\(([\s\S]{0,120}?),\s*(\d{4,})\)/g)];
  assert.ok(relogios.length >= 2, `só achei ${relogios.length} relógios — o recorte quebrou?`);
  const semGuarda = relogios
    .filter(([, corpo]) => !/document\.hidden/.test(corpo))
    .map(([todo]) => todo.replace(/\s+/g, ' ').slice(0, 70));
  assert.deepEqual(semGuarda, [], 'relógio do comum.js sem a trava de aba escondida');
});

test('os dois continuam se atualizando quando a pessoa volta para a aba', () => {
  // Sem isto, pôr a trava de aba escondida teria um custo: a pessoa voltaria
  // para a aba e veria um número velho até o próximo minuto.
  const comum = readFileSync(path.join(RAIZ, 'docs/assets/comum.js'), 'utf8');
  assert.match(comum, /window\.addEventListener\('focus', \(\)=> buscarLembretes\(true\)\)/,
    'os lembretes voltam no foco');
  assert.match(comum, /document\.addEventListener\('visibilitychange'[\s\S]{0,120}atualizarBadgeChat\(\);/,
    'o contador do chat volta quando a aba reaparece');
});
