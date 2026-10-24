// O que impede o cliente de receber a mesma mensagem todo dia é uma linha:
//
//     if (c.alvo[marca][chave]) continue;   // já mandou isso
//
// onde `chave` é o id do aviso + o `chaveUnica` do candidato. A garantia só
// vale se o `chaveUnica` de um aviso de EVENTO vier do evento — o número do
// recibo, o id da parcela — e nunca do relógio. Se alguém trocar por data ou
// hora, o guarda passa a comparar chaves sempre diferentes e a mensagem
// reenvia para sempre, para gente de verdade.
//
// Dois gatilhos são de repetição de propósito (o follow-up semanal de
// documentos e o "sem contato" diário) e por isso carregam a data na chave.
// Esses estão na lista de exceções, nomeados, para a exceção ser uma escolha
// e não um descuido.
//
// Este teste lê o código-fonte em vez de rodar os gatilhos: eles dependem do
// banco e de meia dúzia de ajudantes. É uma rede mais rasa que um teste de
// comportamento, e está aqui porque a alternativa era não ter rede nenhuma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');

// Os que PODEM repetir, e por quê.
const REPETEM = {
  'semana:': 'follow-up de documentos: uma vez por semana, de propósito',
  'semcontato:': 'lead sem contato: uma vez por dia, de propósito',
};

function chavesUnicas(){
  return [...fonte.matchAll(/chaveUnica:\s*([^,\n]+)/g)].map(m => m[1].trim());
}

test('todo gatilho declara um chaveUnica', () => {
  const achadas = chavesUnicas();
  const gatilhos = (fonte.match(/^  [a-zA-Z]+: \{$/gm) || []).length;
  assert.ok(achadas.length >= 10, `só achei ${achadas.length} chaves — o recorte quebrou?`);
  assert.ok(gatilhos > 0, 'não achei os gatilhos no arquivo');
});

test('aviso de evento não pode tirar a chave do relógio', () => {
  const culpados = [];
  for (const expr of chavesUnicas()) {
    const ehDeRepeticao = Object.keys(REPETEM).some(p => expr.includes(p));
    if (ehDeRepeticao) continue;
    if (/agora|Date\.now|new Date|toISOString|hoje/.test(expr)) culpados.push(expr);
  }
  assert.deepEqual(culpados, [],
    'chave de aviso de evento montada com data/hora: o guarda de "já mandou isso" para de funcionar e a mensagem reenvia para sempre:\n'
    + culpados.join('\n'));
});

test('os dois que repetem continuam sendo só esses dois', () => {
  // se um terceiro aviso virar "de repetição", que seja uma decisão explícita
  const comData = chavesUnicas().filter(e => Object.keys(REPETEM).some(p => e.includes(p)));
  assert.equal(comData.length, 2,
    'mudou a quantidade de avisos que repetem por data. Se foi de propósito, atualize REPETEM com o motivo.');
});

test('o guarda de "já mandou isso" continua no lugar', () => {
  assert.match(fonte, /if \(c\.alvo\[marca\]\[chave\]\) continue;/,
    'sem essa linha, todo aviso sai de novo a cada rodada da automação');
  assert.match(fonte, /const chave = aviso\.id \+ '\|' \+ c\.chaveUnica;/,
    'a marca precisa juntar o aviso e o evento: só o evento faria dois avisos diferentes se atropelarem');
});
