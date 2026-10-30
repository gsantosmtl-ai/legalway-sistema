// O aviso no celular é a ÚLTIMA coisa que acontece quando entra um lead. Se
// ele explodir, o lead já está salvo — mas uma exceção aqui vira erro 500 no
// webhook da Meta, e a Meta para de mandar lead depois de errar demais.
//
// Ou seja: um push quebrado poderia fechar a torneira de leads inteira. Este
// teste existe para isso não passar despercebido.
//
// Leio a função do arquivo real contando chaves — fatiar por número fixo de
// caracteres já me enganou duas vezes, porque a função cresce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const fonte = readFileSync(path.join(raiz, '../src/leads-entrada.js'), 'utf8');

function extrair(codigo, assinatura) {
  const ini = codigo.indexOf(assinatura);
  assert.notEqual(ini, -1, `não achei "${assinatura}" — a função foi renomeada?`);
  let i = codigo.indexOf('{', ini), nivel = 0;
  for (let j = i; j < codigo.length; j++) {
    if (codigo[j] === '{') nivel++;
    else if (codigo[j] === '}' && --nivel === 0) return codigo.slice(ini, j + 1);
  }
  throw new Error('chaves não fecharam');
}

const corpo = extrair(fonte, 'export function avisarVendas').replace(/^export /, '');

function rodar({ canalFalha = false, celularFalha = false } = {}) {
  const chamadas = { canal: [], celular: [] };
  const ctx = {
    avisarCanal: (c, t) => {
      chamadas.canal.push([c, t]);
      return canalFalha ? Promise.reject(new Error('chat fora do ar')) : Promise.resolve();
    },
    avisarTodosNoCelular: (d) => {
      chamadas.celular.push(d);
      return celularFalha ? Promise.reject(new Error('push fora do ar')) : Promise.resolve({});
    },
  };
  vm.createContext(ctx);
  // `function` declarada em vm não aparece no contexto sozinha — por isso a
  // atribuição explícita no globalThis.
  vm.runInContext(corpo + '\nglobalThis.avisarVendas = avisarVendas;', ctx);
  const lead = { id: 'lead-1', nome: 'Maria Souza', servico: 'Visto T', telefone: '(407) 555-0199', origens: ['Facebook'] };
  ctx.avisarVendas({ lead, novo: true }, 'Facebook');
  return chamadas;
}

test('o aviso no celular sai junto com o aviso no chat', () => {
  const c = rodar();
  assert.equal(c.canal.length, 1, 'o chat interno continua sendo avisado');
  assert.equal(c.celular.length, 1, 'o celular também é avisado');
  assert.match(c.celular[0].titulo, /Lead novo/);
  assert.match(c.celular[0].texto, /Maria Souza/);
  assert.equal(c.celular[0].url, '/entrada-leads.html', 'tocar no aviso leva para a Entrada de Leads');
});

test('dois leads diferentes viram dois avisos, não um sobrescrevendo o outro', () => {
  const c = rodar();
  assert.match(String(c.celular[0].grupo), /lead-1/,
    'a etiqueta tem que variar por lead — etiqueta fixa faz o segundo aviso apagar o primeiro');
});

test('push fora do ar NÃO derruba a entrada do lead', async () => {
  // Se faltar o .catch, isto vira "unhandled rejection" e o processo morre.
  let morreu = null;
  const pega = (e) => { morreu = e; };
  process.once('unhandledRejection', pega);
  assert.doesNotThrow(() => rodar({ celularFalha: true }),
    'avisarVendas lançou quando o push falhou — o webhook da Meta devolveria 500');
  await new Promise((r) => setImmediate(r));
  process.off('unhandledRejection', pega);
  assert.equal(morreu, null, 'a promessa do push ficou sem .catch');
});

test('chat fora do ar também não derruba', async () => {
  let morreu = null;
  const pega = (e) => { morreu = e; };
  process.once('unhandledRejection', pega);
  assert.doesNotThrow(() => rodar({ canalFalha: true }));
  await new Promise((r) => setImmediate(r));
  process.off('unhandledRejection', pega);
  assert.equal(morreu, null);
});
