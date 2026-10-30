// BATERIA POR TELA — as ligações com o servidor.
//
// Esta é a que mais pega bug de verdade: tela que chama rota que não existe,
// ou lê uma chave de armazenamento com o nome errado. Os dois falham em
// SILÊNCIO — a tela só fica vazia, e ninguém sabe por quê.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TELAS, lerTela, scriptsDa, semComentarios, rotasDoServidor, rotaExiste, chavesConhecidas } from './_base.js';

const ROTAS = rotasDoServidor();
const CHAVES = chavesConhecidas();
const PUBLICAS = new Set(['login.html', 'portal-cliente.html', 'portal-prestador.html',
  'primeiro-acesso.html', 'verificar.html']);

test('o índice de rotas do servidor foi lido', () => {
  assert.ok(ROTAS.size > 50, `só achei ${ROTAS.size} rotas — o recorte quebrou?`);
  assert.ok(CHAVES.size > 20, `só achei ${CHAVES.size} chaves`);
});

for (const tela of TELAS) {
  const html = lerTela(tela);
  const js = semComentarios(scriptsDa(html).join('\n'));

  test(`${tela} · toda rota chamada existe no servidor`, () => {
    const chamadas = new Set();
    for (const m of js.matchAll(/LW\.api\(\s*['"]([^'"${}]+)['"]/g)) chamadas.add(m[1]);
    for (const m of js.matchAll(/fetch\(\s*['"]\/api([^'"${}]+)['"]/g)) chamadas.add(m[1]);
    const mortas = [...chamadas].filter((c) => !rotaExiste(c, ROTAS));
    assert.deepEqual(mortas, [], 'a tela chama estas rotas e o servidor não as tem');
  });

  test(`${tela} · toda chave de armazenamento é conhecida`, () => {
    const usadas = new Set([...js.matchAll(/['"](legalway-[a-z0-9-]+)['"]/g)].map((m) => m[1]));
    // Chaves que vivem SÓ no navegador, de propósito: espelho da sessão,
    // estado de tela aberta, e o chat, cujos dados ficam no Postgres e não no
    // armazenamento. Conferi uma a uma: nenhuma delas é lida do servidor.
    const SO_NO_NAVEGADOR = new Set(['legalway-usuarios-v1', 'legalway-chat-mensagens-v1',
      'legalway-chat-presenca-v1', 'legalway-chat-lastread-v1', 'legalway-ck-abertos']);
    const desconhecidas = [...usadas].filter((k) => !CHAVES.has(k) && !SO_NO_NAVEGADOR.has(k)
      && !/^legalway-(pref|visao|idioma|sessao|.*-abertos$)/.test(k));
    assert.deepEqual(desconhecidas, [],
      'estas chaves não existem no servidor — a tela lê e vem vazio, sem erro');
  });

  test(`${tela} · carrega a ponte com o servidor antes de usá-la`, () => {
    if (!/LW\.api\(/.test(js)) { assert.ok(true, 'esta tela não fala com o servidor'); return; }
    const posApi = html.indexOf('assets/api.js');
    assert.notEqual(posApi, -1, 'usa LW.api mas não carrega assets/api.js');
    const primeiroUso = html.search(/LW\.api\(/);
    assert.ok(posApi < primeiroUso || primeiroUso === -1,
      'api.js é carregado depois do primeiro uso de LW.api');
  });

  test(`${tela} · dá para sair da tela`, () => {
    if (PUBLICAS.has(tela)) { assert.ok(true, 'tela pública não tem menu'); return; }
    const temMenu = /assets\/comum\.js/.test(html);
    // Sub-tela pode não ter menu, desde que tenha um caminho de volta visível.
    // É o caso de conciliacao.html ("Dinheiro na Stripe"), que sai do
    // Financeiro e tem o link "← Financeiro".
    const temVolta = /<a[^>]+href="[a-z-]+\.html"[^>]*>[^<]*←|class="voltar"/i.test(html);
    assert.ok(temMenu || temVolta,
      'sem menu e sem link de volta, a pessoa fica presa e só sai pelo botão do navegador');
  });
}
