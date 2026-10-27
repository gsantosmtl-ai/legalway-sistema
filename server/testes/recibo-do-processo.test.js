// O número do recibo do USCIS no quadro de Processos.
//
// No ar, o card da Karen mostrava "Visto T · Nº undefined" para o escritório
// inteiro. A causa: a tela lia `protocolo.numero`, campo ANTIGO que ninguém
// escreve mais. O sistema passou a guardar em `protocolo.recibos` — uma lista,
// porque um caso pode ter I-765 e I-914 ao mesmo tempo — e repete o primeiro
// em `protocolo.recibo`. Quem foi protocolado antes da mudança tinha `numero`
// e aparecia certo; quem veio depois virava "undefined".
//
// É o mesmo defeito que ela vem apontando em outro nível: duas telas lendo
// campos diferentes para a mesma coisa.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TELA = join(dirname(fileURLToPath(import.meta.url)), '../../docs/processos.html');
const html = readFileSync(TELA, 'utf8');

function pegar(nome) {
  const i = html.indexOf(`function ${nome}(`);
  assert.ok(i > 0, `não achei ${nome} em processos.html`);
  let nivel = 0, fim = -1;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') nivel++;
    else if (html[k] === '}') { nivel--; if (nivel === 0) { fim = k + 1; break; } }
  }
  return html.slice(i, fim);
}

const ctx = createContext({ Array, String, Number, Math });
runInContext(
  pegar('numeroDoProtocolo') + '\n' + pegar('outrosRecibos')
  + '\nglobalThis.API = { numeroDoProtocolo, outrosRecibos };', ctx);
const { numeroDoProtocolo, outrosRecibos } = ctx.API;

test('lê o campo novo, que é onde o sistema escreve hoje', () => {
  assert.equal(numeroDoProtocolo({ protocolo: { recibo: 'EAC9100000011' } }), 'EAC9100000011');
});

test('lê da lista quando há mais de um formulário', () => {
  const p = { protocolo: { recibos: [{ form: 'I-765', numero: 'IOE0912345678' }, { form: 'I-914', numero: 'IOE0999999999' }] } };
  assert.equal(numeroDoProtocolo(p), 'IOE0912345678', 'mostra o primeiro');
  assert.equal(outrosRecibos(p), 1, 'e avisa que existe mais um');
});

test('ainda entende o campo antigo, de quem foi protocolado antes da mudança', () => {
  assert.equal(numeroDoProtocolo({ protocolo: { numero: 'EAC9100000022' } }), 'EAC9100000022');
});

test('sem recibo nenhum devolve vazio — NUNCA a palavra "undefined"', () => {
  for (const p of [{ protocolo: {} }, { protocolo: { recibos: [] } }, {}, null, { protocolo: null }]) {
    const r = numeroDoProtocolo(p);
    assert.equal(r, '', `devolveu "${r}"`);
    assert.ok(!/undefined|null/.test(r));
  }
  assert.equal(outrosRecibos({ protocolo: { recibos: [{ numero: 'X' }] } }), 0, 'um recibo só não tem "mais"');
});

test('o card nunca imprime o campo antigo direto', () => {
  const card = pegar('cardHtml');
  assert.ok(!/\$\{p\.protocolo\.numero\}/.test(card),
    'imprimir p.protocolo.numero direto é o que colocou "undefined" no quadro');
  assert.ok(/numeroDoProtocolo\(p\)/.test(card), 'o card tem que passar pela função');
});

test('protocolado sem data não vira "há NaN dias"', () => {
  const card = pegar('cardHtml');
  assert.ok(/sem data registrada/.test(card),
    'sem data de protocolo, dizer isso — a conta dos dias não tem de onde sair');
});
