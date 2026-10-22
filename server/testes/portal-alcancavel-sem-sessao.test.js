// O portal do cliente ficou fechado para os clientes de 10/10 até hoje, e
// ninguém viu.
//
// A causa: `rotasCaixaEntrada.use(exigirLogin)` dentro de um Router montado em
// '/api'. Um `use` sem caminho vale para TUDO que passa pelo router, e um
// router montado em '/api' vê toda requisição que chega em /api — então o
// guarda de funcionário respondia 401 antes de a requisição chegar nas rotas
// montadas depois. Entre elas o portal, que por definição não tem sessão de
// funcionário.
//
// Passou despercebido porque quem testava estava logado no sistema na mesma
// aba: o cookie de funcionário fazia o guarda deixar passar.
//
// Este teste não prova que o portal funciona; prova que nada montado antes
// dele fecha a porta. É um guarda de ordem de montagem, e é de propósito: o
// erro não foi de lógica, foi de arquitetura, e esse tipo volta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;
const index = readFileSync(join(SRC, 'index.js'), 'utf8');

// Os `app.use('<caminho>', <router>)` na ordem em que o Express vai percorrê-los.
function montagens() {
  return [...index.matchAll(/^app\.use\('([^']+)',\s*(rotas[A-Za-z]+)\);/gm)]
    .map(m => ({ caminho: m[1], router: m[2] }));
}

// Um router que chama `.use(guarda)` sem caminho barra tudo que passa por ele.
function guardaDeTudo(router) {
  for (const arquivo of readdirSync(SRC).filter(f => f.endsWith('.js'))) {
    const src = readFileSync(join(SRC, arquivo), 'utf8');
    if (!src.includes(`export const ${router} = Router()`)) continue;
    const m = src.match(new RegExp(`^${router}\\.use\\((exigir[A-Za-z]+|[a-z][A-Za-z]*)\\);`, 'm'));
    return m ? { arquivo, guarda: m[1] } : null;
  }
  return null;
}

test('nada montado em /api antes do portal barra quem não é funcionário', () => {
  const lista = montagens();
  const iPortal = lista.findIndex(x => x.router === 'rotasPortalCliente');
  assert.ok(iPortal > 0, 'o portal precisa estar montado em index.js');

  const culpados = [];
  for (const m of lista.slice(0, iPortal)) {
    if (m.caminho !== '/api') continue;          // montado no caminho dele, não atrapalha
    const g = guardaDeTudo(m.router);
    if (g) culpados.push(`${m.router} (${g.arquivo}) aplica ${g.guarda} em tudo`);
  }
  assert.deepEqual(culpados, [],
    'router com guarda geral montado em /api antes do portal — o cliente leva 401 antes de chegar na rota dele:\n  '
    + culpados.join('\n  '));
});

test('a caixa de entrada mora no caminho dela', () => {
  assert.match(index, /app\.use\('\/api\/caixa', rotasCaixaEntrada\)/,
    "a caixa de entrada não pode voltar para o '/api' pelado");
  const caixa = readFileSync(join(SRC, 'caixa-entrada.js'), 'utf8');
  for (const rota of [...caixa.matchAll(/rotasCaixaEntrada\.(get|post|put|delete)\('([^']+)'/g)]) {
    assert.ok(!rota[2].startsWith('/caixa/'),
      `${rota[2]} ficaria /api/caixa/caixa/... — o prefixo agora vem da montagem`);
  }
});

test('as telas continuam chamando as mesmas URLs', () => {
  // A correção não pode ter quebrado a caixa de entrada: montagem + rota têm
  // que dar exatamente o endereço que as telas já chamam.
  const DOCS = new URL('../../docs/', import.meta.url).pathname;
  const chamadas = new Set();
  for (const tela of readdirSync(DOCS).filter(f => f.endsWith('.html'))) {
    const src = readFileSync(join(DOCS, tela), 'utf8');
    for (const m of src.matchAll(/api\('(\/caixa\/[a-z]+)/g)) chamadas.add(m[1]);
  }
  assert.ok(chamadas.size >= 4, 'esperava achar as chamadas da caixa de entrada nas telas');

  const caixa = readFileSync(join(SRC, 'caixa-entrada.js'), 'utf8');
  const servidas = new Set([...caixa.matchAll(/rotasCaixaEntrada\.(?:get|post|put|delete)\('([^']+)'/g)]
    .map(m => '/caixa' + m[1].split('/:')[0]));
  for (const c of chamadas) {
    assert.ok(servidas.has(c), `a tela chama ${c} e o servidor não serve mais esse endereço`);
  }
});

test('as rotas do portal do cliente têm o guarda do CLIENTE, não o do funcionário', () => {
  // O inverso do mesmo erro: uma rota do portal guardada por exigirLogin
  // exigiria do cliente uma conta de funcionário.
  const portal = readFileSync(join(SRC, 'portal-cliente.js'), 'utf8');
  for (const m of portal.matchAll(/rotasPortalCliente\.(?:get|post)\('(\/portal\/[^']*)',\s*([a-zA-Z]+)/g)) {
    const [, rota, guarda] = m;
    if (rota === '/portal/login' || rota === '/portal/logout') continue;   // a porta é aberta
    assert.equal(guarda, 'exigirCliente', `${rota} tem que usar exigirCliente`);
  }
});
