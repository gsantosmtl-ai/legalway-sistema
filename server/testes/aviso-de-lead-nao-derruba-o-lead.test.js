// O aviso é a ÚLTIMA coisa que acontece quando entra um lead. Se ele explodir,
// o lead já está salvo — mas uma exceção aqui vira erro 500 no webhook da
// Meta, e a Meta fecha a torneira depois de errar demais.
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
const leia = (f) => readFileSync(path.join(raiz, '../src/', f), 'utf8');

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

const corpo = extrair(leia('leads-entrada.js'), 'export function avisarVendas').replace(/^export /, '');

function rodar({ falha = false, lead } = {}) {
  const chamadas = [];
  const ctx = {
    avisarCanal: (canal, texto, extra) => {
      chamadas.push({ canal, texto, extra });
      return falha ? Promise.reject(new Error('chat fora do ar')) : Promise.resolve();
    },
  };
  vm.createContext(ctx);
  // `function` declarada em vm não aparece no contexto sozinha.
  vm.runInContext(corpo + '\nglobalThis.avisarVendas = avisarVendas;', ctx);
  ctx.avisarVendas({ lead: lead || {
    id: 'lead-1', nome: 'Maria Souza', servico: 'Visto T',
    telefone: '(407) 555-0199', origens: ['Facebook'],
  }, novo: true }, 'Facebook');
  return chamadas;
}

test('o lead é anunciado no canal de vendas, com destino no celular', () => {
  const c = rodar();
  assert.equal(c.length, 1);
  assert.equal(c[0].canal, 'vendas');
  assert.match(c[0].texto, /Maria Souza/);
  assert.equal(c[0].extra.url, '/entrada-leads.html',
    'tocar no aviso tem que levar para a Entrada de Leads, onde se assume o lead');
});

test('a etiqueta leva o id do lead, para o mesmo lead não buzinar duas vezes', () => {
  // O MESMO lead é anunciado por dois caminhos: aqui e na automação de
  // primeiro contato. Sem o id na etiqueta, o celular toca duas vezes.
  const c = rodar();
  assert.equal(c[0].extra.grupo, 'lead-lead-1');
  const outro = rodar({ lead: { id: 'lead-2', nome: 'João', origens: [] } });
  assert.notEqual(outro[0].extra.grupo, c[0].extra.grupo,
    'leads diferentes precisam de etiquetas diferentes, senão um apaga o outro');
});

test('a automação de primeiro contato usa a MESMA etiqueta do lead', () => {
  const pc = leia('primeiro-contato.js');
  const avisos = [...pc.matchAll(/avisarCanal\('vendas',[^;]*?Entrada de Leads esperando[^;]*?;/gs)];
  assert.ok(avisos.length >= 1, 'não achei os avisos de lead do primeiro contato');
  for (const a of avisos) {
    assert.match(a[0], /grupo: 'lead-' \+ lead\.id/,
      'este aviso não usa a etiqueta do lead — ele vai buzinar de novo pelo mesmo lead');
  }
});

test('aviso fora do ar NÃO derruba a entrada do lead', async () => {
  // Sem o .catch isto vira "unhandled rejection" e o processo morre.
  let morreu = null;
  const pega = (e) => { morreu = e; };
  process.once('unhandledRejection', pega);
  assert.doesNotThrow(() => rodar({ falha: true }),
    'avisarVendas lançou — o webhook da Meta devolveria 500 e ela fecharia a torneira');
  await new Promise((r) => setImmediate(r));
  process.off('unhandledRejection', pega);
  assert.equal(morreu, null, 'a promessa do aviso ficou sem .catch');
});

test('o avisarCanal empurra para o celular sem poder derrubar quem o chamou', () => {
  const chat = leia('chat.js');
  const fn = extrair(chat, 'export async function avisarCanal');
  assert.match(fn, /avisarCanalNoCelular\(/, 'avisarCanal não avisa o celular');
  assert.match(fn, /avisarCanalNoCelular\([\s\S]*?\}\)\.catch\(/,
    'o push dentro do avisarCanal está sem .catch — uma falha ali derruba quem disparou o aviso');
});

test('quem não escolheu departamento recebe tudo, e não nada', () => {
  // Errar para mais incomoda; errar para menos faz o lead passar batido sem
  // ninguém perceber que o aviso estava "ligado".
  const push = leia('push.js');
  const fn = extrair(push, 'export async function avisarCanalNoCelular');
  assert.match(fn, /canais IS NULL OR a\.canais = ''/,
    'aparelho sem departamento escolhido ficaria sem receber nada');
});
