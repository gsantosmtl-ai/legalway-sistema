// Sem recarregar, sem demora, sem travar.
//
// Pedido dela: "importante deixar sem refresh, sem delay, sem travar o
// sistema". Fui medir no sistema no ar, com os dados reais, em vez de supor:
//
//   · redesenhar a tela do Financeiro inteira leva 9ms — NÃO era o problema;
//   · `/api/chat/nao-lidas` roda de 6 em 6 segundos em 15 telas e leva de 650
//     a 900ms cada, para trazer 0,3 KB;
//   · e o Financeiro baixava o bloco da Documentação — 410 KB — a cada 20
//     segundos. Mais de 70 MB por hora de tela aberta, para um bloco que muda
//     poucas vezes por dia.
//
// O que torna isso seguro de cortar: existe um canal de TEMPO REAL que avisa
// a versão nova assim que qualquer pessoa grava. Quem invalida o cache é ele,
// não o relógio.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const ler = (f) => readFileSync(join(DOCS, f), 'utf8');
const storage = ler('assets/storage.js');
const comum = ler('assets/comum.js');
const fin = ler('financeiro.html');

test('o cache só é servido quando a versão não mudou', () => {
  // A trava que torna o cache longo seguro. Sem esta comparação, aumentar o
  // tempo serviria dado velho depois de alguém gravar.
  assert.match(storage, /ultimaMudanca\[key\] > \(c\.resposta \? c\.resposta\.versao : 0\)/,
    'o cache precisa ser invalidado pela versão avisada pelo servidor');
  assert.match(storage, /ultimaMudanca\[ev\.chave\] = ev\.versao/,
    'e o canal de tempo real precisa alimentar essa versão');
});

test('o cache dura o suficiente para não baixar o mesmo bloco toda hora', () => {
  const m = storage.match(/const CACHE_MS = (\d+);/);
  assert.ok(m, 'não achei o tempo de cache');
  const ms = Number(m[1]);
  assert.ok(ms >= 5000, `${ms}ms é curto demais: toda consulta periódica rebaixa o bloco inteiro`);
  // E nem tão longo a ponto de, se o canal cair, o dado ficar muito atrás.
  assert.ok(ms <= 30000, `${ms}ms é longo demais se o canal de tempo real cair`);
});

test('o contador do chat não roda com a aba escondida', () => {
  const i = comum.indexOf('async function atualizarBadgeChat()');
  const fn = comum.slice(i, comum.indexOf('\n}', i));
  assert.match(fn, /if\(document\.hidden\) return;/,
    'aba escondida não precisa de contador — são 15 telas consultando de 6 em 6 segundos');
  assert.match(comum, /visibilitychange[\s\S]{0,120}atualizarBadgeChat\(\)/,
    'mas ao voltar para a aba precisa atualizar na hora, senão o número fica velho');
});

test('o Financeiro não rebaixa 410 KB a cada 20 segundos', () => {
  const m = fin.match(/setInterval\(\(\)=>\{\s*if\(document\.hidden\) return;[\s\S]*?\}, (\d+)\);/);
  assert.ok(m, 'o intervalo precisa pular quando a aba está escondida');
  const ms = Number(m[1]);
  assert.ok(ms >= 60000, `${ms}ms ainda é frequente demais para um bloco de 410 KB`);
  // A rede de segurança continua: o foco recarrega quando a pessoa volta.
  assert.match(fin, /addEventListener\('focus',[\s\S]{0,120}verificarNovasAutorizacoes\(\)/,
    'voltar para a aba precisa continuar recarregando');
});

test('nenhuma tela recarrega a página inteira para mostrar dado novo', () => {
  // `location.reload()` é o oposto de "sem refresh": perde rolagem, perde
  // filtro, perde o que a pessoa estava digitando.
  const telas = readdirSync(DOCS).filter((f) => f.endsWith('.html'));
  const comReload = [];
  for (const f of telas) {
    for (const linha of ler(f).split('\n')) {
      if (!/location\.reload\(\)/.test(linha)) continue;
      // Sair da conta e trocar de ambiente podem recarregar: ali a página
      // inteira muda mesmo.
      // Sair da conta, trocar de ambiente, restaurar backup e juntar
      // duplicados podem recarregar: nesses a página inteira muda mesmo, e
      // manter a tela velha seria pior.
      if (/sair|logout|sess[ãa]o|importar|restaurar/i.test(linha)) continue;
      const antes = ler(f).slice(0, ler(f).indexOf(linha));
      if (/duplicados\/limpar/.test(antes.slice(-400))) continue;
      comReload.push(`${f}: ${linha.trim().slice(0, 70)}`);
    }
  }
  assert.deepEqual(comReload, [], 'dado novo chega pelo canal de tempo real, sem recarregar a tela');
});
