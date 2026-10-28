// A ficha do cliente: trilha de etapas, dados em blocos, um destaque só.
//
// "Não gosto quando abre os cards comercial e documentos" — "sem graça, sem
// cor, sem organização". Ela pediu uma referência ao ChatGPT, aprovou o
// desenho, e isto é a aplicação dele com as etapas reais e os azuis que ela
// escolheu.
//
// O que mudou, e por quê:
//
//   · As etapas eram etiquetas soltas, do mesmo tamanho. Dava para ver em qual
//     o cliente está, mas não de onde veio nem o que falta. Viraram trilha.
//   · Os dados corriam como uma frase: "Proposta US$ 0 WhatsApp +1689...
//     Origem Facebook". Viraram quatro blocos.
//   · A gaveta tinha DOIS botões no azul principal — o "Salvar" da aba e o
//     "Mover p/" do rodapé — brigando no mesmo painel.
//
// Nenhuma etapa mudou e nenhuma informação saiu: o que não cabe nos quatro
// blocos continua logo abaixo, em linha.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const ler = (f) => readFileSync(join(DOCS, f), 'utf8');
const funil = ler('funil-comercial.html');
const docs = ler('documentos.html');

test('as etapas viram trilha nas duas fichas', () => {
  for (const [nome, s] of [['funil', funil], ['documentação', docs]]) {
    assert.match(s, /\.stage-dot::after\{[^}]*border-left-color/,
      `${nome}: a trilha precisa das setas entre os degraus`);
    assert.match(s, /\.stage-dot\.current\{[^}]*background:var\(--acao\)/,
      `${nome}: a etapa de hoje usa a cor da ação`);
    assert.match(s, /\.stage-dot\.done\{/, `${nome}: o que já passou precisa se distinguir`);
  }
});

test('a Documentação rola a trilha e vai sozinha até a etapa atual', () => {
  // São 11 etapas num painel de 520px: 47px por degrau seria ilegível.
  assert.match(docs, /\.stage-track\{[^}]*overflow-x:auto/);
  assert.match(docs, /\.stage-dot\{[^}]*min-width:104px/, 'cada degrau precisa de largura para ser lido');
  assert.match(docs, /trilha\.scrollLeft = Math\.max\(0, aqui\.offsetLeft/,
    'com 11 degraus, a etapa de hoje nasce fora da vista');
});

test('clicar na trilha da Documentação não move a ficha', () => {
  // Lá quem move é o arrasto no quadro. Dois jeitos de mover conviveriam mal
  // numa ficha aberta para leitura.
  const i = docs.indexOf("document.getElementById('d-trilha')");
  const bloco = docs.slice(i, i + 700);
  assert.ok(!/data-jump/.test(bloco), 'a trilha da Documentação é leitura');
});

test('os quatro dados do topo viram blocos, nas duas fichas', () => {
  for (const [nome, s] of [['funil', funil], ['documentação', docs]]) {
    assert.match(s, /\.dr-tiles\{[^}]*grid-template-columns:repeat\(4/, `${nome}: faltam os quatro blocos`);
    assert.match(s, /@media \(max-width:560px\)\{ \.dr-tiles\{ grid-template-columns:repeat\(2/,
      `${nome}: em tela estreita os quatro viram dois`);
  }
});

test('nenhuma informação saiu do topo da ficha do funil', () => {
  // O que não coube nos quatro blocos continua logo abaixo.
  const i = funil.indexOf('<div class="dr-resto">');
  assert.ok(i > 0, 'falta a linha com o resto dos dados');
  const resto = funil.slice(i, i + 600);
  for (const campo of ['E-mail', 'Endereço', 'Veio de', 'Assumido']) {
    assert.ok(resto.includes(campo), `${campo} sumiu da ficha`);
  }
});

test('a gaveta do funil tem UM botão no azul principal', () => {
  // O "Salvar" da aba e o "Mover p/" do rodapé saíam os dois em primary.
  const i = funil.indexOf("const barra = document.getElementById('d-acoes')");
  const rodape = funil.slice(i, funil.indexOf('// Quem liga os cliques', i));
  assert.ok(!/class="primary"/.test(rodape),
    'o rodapé de ações não pode disputar com o Salvar da aba');
  assert.match(rodape, /class="secundario" id="btn-avancar"/,
    'mover de etapa fica no azul de apoio');
  assert.match(funil, /<button class="primary" id="btn-salvar-nota">/,
    'o forte fica com quem grava o que foi digitado');
});

test('sair do funil continua em vermelho e separado dos demais', () => {
  const i = funil.indexOf("const barra = document.getElementById('d-acoes')");
  const rodape = funil.slice(i, funil.indexOf('// Quem liga os cliques', i));
  assert.match(rodape, /class="danger" id="btn-sair"[^>]*margin-left:auto/,
    'a ação sem volta fica em vermelho e longe das outras');
});

test('a ficha da Documentação responde "em que pé está" sem abrir aba', () => {
  // O bloco inteiro: o cálculo das cores vem ANTES do innerHTML, e uma janela
  // que começasse no innerHTML cortaria justamente a parte que decide o tom.
  const i = docs.indexOf("const trilha = document.getElementById('d-trilha')");
  const bloco = docs.slice(i, docs.indexOf('})();', i));
  for (const [o_que, re] of [
    ['tempo de casa', /Na casa/],
    ['documentos aprovados', /Documentos/],
    ['quanto foi pago', /Pago/],
    ['status do processo', /Processo/],
  ]) assert.match(bloco, re, `faltou ${o_que} nos blocos do topo`);
  // E com cor quando o número pede atenção.
  assert.match(bloco, /dias >= 180 \? ' vermelho'/, 'tempo longo demais precisa acusar');
});
