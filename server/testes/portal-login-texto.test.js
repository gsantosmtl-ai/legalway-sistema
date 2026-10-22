// A porta de entrada do cliente prometia uma coisa e pedia outra: o subtítulo
// dizia "entre com o e-mail", e o campo logo abaixo pedia o número de cliente.
// O login aceita os três — número, telefone ou e-mail — desde que ela pediu
// ("podemos colocar então o número do cliente por exemplo 00032").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync(new URL('../../docs/portal-cliente.html', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../../docs/assets/i18n.js', import.meta.url), 'utf8');

test('o texto da entrada não promete e-mail quando o campo pede número', () => {
  assert.match(portal, /<p class="sub">Entre com os dados que o escritório enviou para você\.<\/p>/,
    'o subtítulo precisa falar dos dados, não só do e-mail');
  assert.ok(!portal.includes('<p class="sub">Entre com o e-mail e a senha que o escritório enviou para você.</p>'),
    'o texto antigo contradizia o campo logo abaixo');
  assert.match(portal, /<label for="email">Seu número de cliente<\/label>/,
    'o campo continua sendo o número do cliente');
});

test('a dica não sobe por cima do campo', () => {
  // margem negativa colava a dica no input e as duas linhas se encostavam.
  const i = portal.indexOf('É o número que veio na mensagem do escritório');
  const trecho = portal.slice(Math.max(0, i - 200), i);
  assert.ok(!/margin:-\d/.test(trecho), 'a dica não pode ter margem negativa');
});

test('o cliente que fala espanhol ou inglês lê a entrada no idioma dele', () => {
  // O portal atende cliente de fora. As três frases da tela de entrada não
  // tinham tradução e apareciam em português para todo mundo.
  for (const frase of [
    'Entre com os dados que o escritório enviou para você.',
    'Seu número de cliente',
    'É o número que veio na mensagem do escritório. Também dá para entrar com o seu telefone ou e-mail.',
  ]) {
    const i = i18n.indexOf(`'${frase}':`);
    assert.ok(i > 0, `falta a tradução de "${frase}"`);
    const linha = i18n.slice(i, i18n.indexOf('\n', i));
    assert.match(linha, /\[\s*'[^']+',\s*'[^']+'\s*\]/, `a tradução de "${frase}" precisa ter espanhol E inglês`);
  }
});
