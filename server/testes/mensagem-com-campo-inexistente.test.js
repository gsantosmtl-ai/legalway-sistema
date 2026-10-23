// Se ela editar uma mensagem automática e escrever {nome} em vez de {cliente},
// o cliente recebia literalmente:
//
//     "Olá, {nome}! 👋"
//
// O preenchimento devolvia a própria chave quando não conhecia o campo. Ia
// para gente de verdade, pelo WhatsApp, e ninguém no escritório ficava sabendo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const av = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');

test('campo desconhecido não vai para o cliente', () => {
  const i = av.indexOf('const faltando = [];');
  assert.notEqual(i, -1, 'é preciso saber quais campos ficaram sem valor');
  const corpo = av.slice(i, i + 1600);
  assert.match(corpo, /: \(faltando\.push\(k\), m\)\)/, 'registra em vez de só devolver a chave');
  assert.match(corpo, /if \(faltando\.length\) \{/);
  assert.match(corpo, /continue;/, 'não envia');
});

test('a mensagem que não saiu é dita, e diz como consertar', () => {
  const i = av.indexOf('if (faltando.length) {');
  const corpo = av.slice(i, i + 1300);
  assert.match(corpo, /NÃO enviado para/);
  assert.match(corpo, /que não existe neste aviso\. Corrija em Configurações → Mensagens automáticas/);
  assert.match(corpo, /avisarCanal\(/, 'no chat do setor, não só no log do servidor');
  assert.match(corpo, /setorKey === 'financeiro' \? 'financeiro' : setorKey === 'comercial' \? 'vendas' : 'documentacao'/,
    'no canal de quem cuida daquela mensagem');
  assert.match(corpo, /avisoDoDiaChave\('texto-quebrado:' \+ aviso\.id\)/,
    'uma vez por dia por mensagem: a rodada roda de minuto em minuto');
});

test('{empresa} e {setor} continuam sendo preenchidos', () => {
  const i = av.indexOf("const texto = String(aviso.template || gat.padrao || '')");
  const corpo = av.slice(i, i + 500);
  assert.match(corpo, /k === 'empresa' \? \(\(R\.empresa && R\.empresa\.nome\) \|\| ''\)/);
  assert.match(corpo, /k === 'setor' \? \(setor\.nome \|\| ''\)/);
});

test('nenhum texto padrão usa campo que o sistema não preenche', () => {
  // A varredura dos 12 gatilhos: todo {campo} do texto padrão tem que ter
  // valor, senão a mensagem nasce quebrada e nunca sai.
  const GLOBAIS = ['empresa', 'setor', 'link', 'email', 'senha', 'login'];
  const marcos = [...av.matchAll(/^ {2}(\w+): \{$/gm)];
  assert.ok(marcos.length >= 12, 'esperava os doze gatilhos');
  for (let k = 0; k < marcos.length; k++) {
    const ini = marcos[k].index;
    const fim = k + 1 < marcos.length ? marcos[k + 1].index : av.indexOf('\n};', ini);
    const corpo = av.slice(ini, fim);
    const padrao = (corpo.match(/padrao: `([\s\S]*?)`,/) || [])[1] || '';
    const usados = [...new Set([...padrao.matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
    const bloco = (corpo.match(/valores: \{([\s\S]*?)\n\s{10}\}/) || corpo.match(/valores: \{([\s\S]*?)\},/) || [])[1] || '';
    const temValor = new Set([...bloco.matchAll(/(\w+):/g)].map(m => m[1]));
    const faltam = usados.filter(c => !temValor.has(c) && !GLOBAIS.includes(c));
    assert.deepEqual(faltam, [], `o gatilho "${marcos[k][1]}" usa {${faltam.join('}, {')}} no texto padrão e não preenche`);
  }
});
