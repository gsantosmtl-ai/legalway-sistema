// "Tela de agenda também, não dá vontade nenhuma de usar."
//
// A semana estava vazia, quatro zeros na lateral e uma "Dica do dia" com frase
// motivacional ocupando o melhor pedaço. E a Agenda só lia a si mesma e as
// tarefas — era cega para tudo que já tem data no resto do sistema.
//
// No mesmo dia, no quadro do SDR, havia "Reunião 26/10/2026 11:00" e "Próxima
// tentativa 22/10/2026". A agenda não sabia de nada disso.
//
// Regra que este arquivo protege: a Agenda MOSTRA o que é das outras telas e
// nunca GRAVA nelas. Quem é dono do dado é a tela dele.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const tela = readFileSync(join(DOCS, 'agenda.html'), 'utf8');

function corpo(nome) {
  const i = tela.indexOf(`function ${nome}(`);
  assert.ok(i > 0, `não achei ${nome}`);
  let nivel = 0, fim = -1;
  for (let k = tela.indexOf('{', i); k < tela.length; k++) {
    if (tela[k] === '{') nivel++;
    else if (tela[k] === '}') { nivel--; if (nivel === 0) { fim = k + 1; break; } }
  }
  return tela.slice(i, fim);
}

function rodar(leadsSdr, leadsFunil) {
  const ctx = createContext({ Date, String, Number, Math, leadsSdr, leadsFunil });
  runInContext(corpo('compromissosDeOutrasTelas') + '\nglobalThis.R = compromissosDeOutrasTelas();', ctx);
  return ctx.R.itens;
}

const emDias = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test('a reunião marcada no SDR aparece na agenda', () => {
  const itens = rodar([{ nome: 'Ana', reuniaoAgendada: { data: emDias(3), horaFlorida: '11:00' } }], []);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].quem, 'Ana');
  assert.equal(itens[0].hora, '11:00');
  assert.equal(itens[0].onde, 'SDR');
});

test('próxima tentativa e follow-up do SDR também aparecem', () => {
  const itens = rodar([{ nome: 'Jo', proximaTentativa: emDias(1), proximoFollowup: emDias(5) }], []);
  assert.deepEqual(itens.map((i) => i.oque),
    ['Próxima tentativa de contato', 'Follow-up combinado']);
});

test('a próxima ação do funil aparece, com o tipo que o vendedor escolheu', () => {
  const itens = rodar([], [{ nome: 'Rui', proximaAcao: { data: emDias(2), hora: '09:00', tipo: 'Ligação' } }]);
  assert.equal(itens[0].oque, 'Ligação');
  assert.equal(itens[0].onde, 'Funil');
});

test('o que já passou não volta, e o que é longe demais não entope', () => {
  const itens = rodar([
    { nome: 'Passado', proximaTentativa: emDias(-3) },
    { nome: 'Longe', proximaTentativa: emDias(90) },
    { nome: 'Vale', proximaTentativa: emDias(7) },
  ], []);
  assert.deepEqual(itens.map((i) => i.quem), ['Vale']);
});

test('vem em ordem de quando acontece', () => {
  const itens = rodar([
    { nome: 'Depois', proximaTentativa: emDias(9) },
    { nome: 'Antes', proximaTentativa: emDias(2) },
  ], [{ nome: 'Meio', proximaAcao: { data: emDias(5), hora: '08:00' } }]);
  assert.deepEqual(itens.map((i) => i.quem), ['Antes', 'Meio', 'Depois']);
});

test('lead sem data nenhuma não vira linha vazia', () => {
  assert.deepEqual(rodar([{ nome: 'Sem nada' }, {}], [{ nome: 'Nada' }]), []);
});

test('a Agenda lê o funil e o SDR, e nunca grava neles', () => {
  assert.match(tela, /const FUNIL_KEY = 'legalway-funil-v1'/);
  assert.match(tela, /const SDR_KEY = 'legalway-sdr-v1'/);
  for (const chave of ['FUNIL_KEY', 'SDR_KEY']) {
    assert.ok(!new RegExp(`gravar\\(\\s*${chave}`).test(tela),
      `a Agenda não pode gravar em ${chave} — quem é dono do dado é a tela dele`);
  }
});

test('a frase motivacional saiu do melhor pedaço da lateral', () => {
  // Pela CLASSE, não pelas palavras: o comentário que explica a remoção
  // menciona a caixa, e procurar o texto faria o teste acusar o comentário.
  assert.ok(!/dica-box2/.test(tela),
    'a caixa da frase ocupava a lateral e ainda usava o vermelho de "precisa de você"');
  assert.match(tela, /Já marcado no sistema/);
});

test('o nome do lead passa pelo escape', () => {
  // Nome de lead vem de formulário do Meta, digitado por gente de fora.
  assert.match(corpo('renderJaMarcado'), /escaparHtml\(i\.quem/);
});
