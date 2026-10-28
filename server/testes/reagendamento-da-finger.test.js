// O reagendamento da biometria ("finger").
//
// Pedido dela, em três partes: "na aba anotações tem que ter uma opção para
// marcar / tem reagendamento da finger e um campo sim ou não / e aparecer no
// card como lembrete / e um filtro na parte de documentos para filtrar
// somente quem tem reagendamento."
//
// É sim/não e não uma data, de propósito: a data do novo agendamento só chega
// depois, pela carta do USCIS. O que a equipe precisa guardar antes disso é
// que ESTE caso vai precisar remarcar — a conta que se perde entre 263 fichas.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(AQUI, '../../docs/documentos.html'), 'utf8');

function extrair(nome) {
  const i = html.indexOf(`function ${nome}(`);
  assert.ok(i > 0, `não achei a função ${nome}`);
  let nivel = 0, fim = -1;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') nivel++;
    else if (html[k] === '}') { nivel--; if (nivel === 0) { fim = k + 1; break; } }
  }
  const ctx = createContext({});
  runInContext(html.slice(i, fim) + `\nglobalThis.fn = ${nome};`, ctx);
  return ctx.fn;
}

const temReagendamentoFinger = extrair('temReagendamentoFinger');

test('só conta quem está marcado como sim', () => {
  assert.strictEqual(temReagendamentoFinger({ reagendamentoFinger: { tem: true } }), true);
  assert.strictEqual(temReagendamentoFinger({ reagendamentoFinger: { tem: false } }), false);
  assert.strictEqual(temReagendamentoFinger({}), false);
  assert.strictEqual(temReagendamentoFinger(null), false);
});

// Desmarcar precisa APAGAR o lembrete, não deixar o objeto lá. Foi o erro
// fácil: gravar `{tem:false}` e continuar lendo o objeto como verdadeiro.
test('ficha que já teve e foi desmarcada não aparece mais', () => {
  assert.strictEqual(temReagendamentoFinger(
    { reagendamentoFinger: { tem: false, desde: null, por: 'Vitória', desmarcadoEm: '2026-10-28' } }), false);
});

test('o lembrete aparece no cartão do quadro', () => {
  assert.ok(/temReagendamentoFinger\(p\) \? `<div class="pill amber"[^`]*reagendamento da finger/.test(html),
    'o cartão deixou de mostrar o lembrete do reagendamento');
});

test('a aba Anotações tem o sim e o não', () => {
  const i = html.indexOf("activeDtab === 'anotacoes'");
  const fim = html.indexOf("activeDtab === 'historico'", i);
  const aba = html.slice(i, fim);
  assert.ok(/id="reag-sim"/.test(aba) && /id="reag-nao"/.test(aba),
    'o sim/não do reagendamento saiu da aba Anotações');
  assert.ok(/marcarReagendamentoFinger\(p\.id, true\)/.test(aba)
         && /marcarReagendamentoFinger\(p\.id, false\)/.test(aba),
    'os botões do reagendamento não estão ligados');
});

test('o filtro existe e entra no Limpar filtros', () => {
  assert.ok(/if\(soComReagendamento\) lista = lista\.filter\(temReagendamentoFinger\);/.test(html),
    'o filtro de reagendamento não está sendo aplicado à lista');
  assert.ok(/id="f-reagendamento"/.test(html), 'falta o botão do filtro na barra');
  const i = html.indexOf("getElementById('limpar-filtros')?.addEventListener");
  assert.ok(/soComReagendamento = false/.test(html.slice(i, i + 400)),
    '"Limpar filtros" não desliga o filtro de reagendamento');
});

// Marcar é um fato com autor e data: três semanas depois alguém pergunta quem
// disse que ia remarcar.
test('marcar e desmarcar deixam rastro no histórico', () => {
  const i = html.indexOf('async function marcarReagendamentoFinger(');
  const trecho = html.slice(i, i + 1200);
  assert.ok(/p\.historico\.push/.test(trecho), 'marcar o reagendamento não escreve no histórico');
  assert.ok(/desmarcado/i.test(trecho), 'desmarcar não deixa rastro');
});
