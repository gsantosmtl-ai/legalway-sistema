// Há quanto tempo a ficha está parada na etapa em que está.
//
// A pergunta dela foi literal: "data de inicio do processo (quanto tempo esta o
// processo no funil de documentos)". O card já mostrava um "há 34d", mas contado
// desde a ASSINATURA do contrato — número certo para outra pergunta.
//
// O risco deste cálculo é inventar: a maioria das fichas veio do Trello e do
// Bling e nunca foi arrastada no quadro, então não tem histórico de movimento.
// Para essas, a resposta certa é "não sei", e o card não mostra nada.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const TELA = join(AQUI, '../../docs/documentos.html');

function extrair(nomes) {
  const html = readFileSync(TELA, 'utf8');
  let fonte = '';
  for (const nome of nomes) {
    const i = html.indexOf(`function ${nome}(`);
    assert.ok(i > 0, `não achei a função ${nome} em documentos.html`);
    // Fecha por contagem de chaves, pulando o que estiver dentro de parênteses
    // (a lista de parâmetros pode ter chaves de desestruturação).
    let j = html.indexOf('{', i), nivel = 0, fim = -1;
    for (let k = j; k < html.length; k++) {
      if (html[k] === '{') nivel++;
      else if (html[k] === '}') { nivel--; if (nivel === 0) { fim = k + 1; break; } }
    }
    assert.ok(fim > 0, `não consegui fechar a função ${nome}`);
    fonte += html.slice(i, fim) + '\n';
  }
  const re = readFileSync(TELA, 'utf8').match(/const RE_MOVIDO = [^\n]+/);
  assert.ok(re, 'não achei a expressão RE_MOVIDO');
  const ctx = createContext({ Date, Number, Array, String, Math, JSON });
  runInContext(re[0] + '\n' + fonte + '\nglobalThis.API = { entrouNaEtapa, diasNaEtapa };', ctx);
  return ctx.API;
}

const { entrouNaEtapa, diasNaEtapa } = extrair(['entrouNaEtapa', 'diasNaEtapa']);

// Ancorado ao MEIO-DIA local, de propósito.
//
// `entrouNaEtapa` guarda o instante inteiro, mas `diasNaEtapa` corta só a
// parte do dia e ancora em T12:00 para contar. Se o teste montasse a data com
// a hora de AGORA, a conta mudaria conforme a hora em que o teste roda: este
// arquivo passava à tarde e falhava às nove da noite, acusando o sistema por
// um defeito do próprio teste. Com o meio-dia como âncora dos dois lados, o
// resultado é o mesmo a qualquer hora.
const diasAtras = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

test('pega a data em que a ficha foi arrastada para a etapa de hoje', () => {
  const p = {
    status: 'Recebendo documentação',
    historico: [
      { quando: diasAtras(40), texto: 'Processo criado automaticamente — contrato assinado' },
      { quando: diasAtras(12), texto: 'Movido de "Aguardando início" para "Recebendo documentação" (arrastado no quadro)' },
    ],
  };
  assert.equal(diasNaEtapa(p), 12, 'são 12 dias nesta etapa, não 40 desde a assinatura');
});

test('entende também o movimento registrado pela ficha, junto com outras mudanças', () => {
  const p = {
    status: 'I-797',
    historico: [
      { quando: diasAtras(9), texto: 'recibo IOE0912345678 anotado · movido para "I-797"' },
    ],
  };
  assert.equal(diasNaEtapa(p), 9);
});

test('se a ficha voltou e foi de novo, vale a ÚLTIMA entrada na etapa', () => {
  const p = {
    status: 'Biometria',
    historico: [
      { quando: diasAtras(50), texto: 'Movido de "I-797" para "Biometria" (arrastado no quadro)' },
      { quando: diasAtras(30), texto: 'Movido de "Biometria" para "I-797" (arrastado no quadro)' },
      { quando: diasAtras(4),  texto: 'Movido de "I-797" para "Biometria" (arrastado no quadro)' },
    ],
  };
  assert.equal(diasNaEtapa(p), 4, 'tem que contar da volta, não da primeira vez');
});

test('movimento para OUTRA etapa não conta', () => {
  const p = {
    status: 'Recebendo documentação',
    historico: [{ quando: diasAtras(3), texto: 'Movido de "Biometria" para "I-797" (arrastado no quadro)' }],
  };
  assert.equal(diasNaEtapa(p), null);
});

test('ficha que veio do Trello e nunca foi movida responde "não sei", não um número', () => {
  const p = {
    status: 'Recebendo documentação',
    historico: [{ quando: diasAtras(200), texto: 'Processo criado automaticamente — contrato assinado' }],
  };
  assert.equal(entrouNaEtapa(p), '', 'sem registro de movimento não há data de entrada');
  assert.equal(diasNaEtapa(p), null, 'melhor não mostrar nada do que mostrar um número errado');
});

test('ficha sem histórico nenhum não quebra', () => {
  assert.equal(diasNaEtapa({ status: 'I-797' }), null);
  assert.equal(diasNaEtapa({}), null);
  assert.equal(diasNaEtapa(null), null);
});

test('data no futuro não vira dia negativo', () => {
  const p = {
    status: 'I-797',
    historico: [{ quando: diasAtras(-5), texto: 'Movido de "Biometria" para "I-797" (arrastado no quadro)' }],
  };
  assert.equal(diasNaEtapa(p), null);
});

// --- o que o card mostra -----------------------------------------------------

test('o card mostra o status do processo, o protocolo e o tempo na etapa', () => {
  const html = readFileSync(TELA, 'utf8');
  const i = html.indexOf('<div class="checklist-progress">');
  const card = html.slice(Math.max(0, i - 4000), i + 200);
  assert.ok(/statusMigratorio/.test(card), 'o card precisa mostrar o status do processo');
  assert.ok(/diasNaEtapa\(p\)/.test(card), 'o card precisa mostrar há quanto tempo está na etapa');
  assert.ok(/card-protocolo/.test(card), 'o card precisa mostrar o número do protocolo');
});

test('o protocolo não é mais escondido quando existe status do USCIS', () => {
  const html = readFileSync(TELA, 'utf8');
  // O defeito antigo era um ternário: status do USCIS OU recibo, nunca os dois.
  assert.ok(
    !/p\.uscis && p\.uscis\.status \?[\s\S]{0,400}?: \(p\.protocolo && p\.protocolo\.recibo/.test(html),
    'voltou o "ou um ou outro": com status do USCIS o número do protocolo some do card',
  );
});

test('o tempo na etapa não ganha cor de alerta sem prazo combinado', () => {
  const html = readFileSync(TELA, 'utf8');
  const i = html.indexOf('há quanto tempo parada');
  const j = html.indexOf('diasNaEtapa(p)', i > 0 ? i : 0);
  const trecho = html.slice(j, j + 500);
  assert.ok(!/pill (red|amber)/.test(trecho),
    'ninguém definiu a partir de quantos dias é demais — pintar seria inventar prazo');
});
