// O log da produção, 27/10/2026, três ciclos seguidos:
//
//   [automações/agendado] stripe: não consegui ler os eventos — Event
//   'evt_1UHvfH0mB8PWBSessntv69rd' is no longer available because it's aged
//   out of our retention policy.
//
// O Stripe guarda evento por cerca de 30 dias. A varredura guarda o id do
// último que tratou e pede "os de depois deste". Quando esse id envelhece e
// sai do Stripe, a leitura falha — e como o marcador só avança depois de uma
// leitura boa, ela falha para sempre. A rede que garante que nenhum pagamento
// se perde morreu calada, e a única pista era uma linha no log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonteCliente = readFileSync(new URL('../src/stripe.js', import.meta.url), 'utf8');
const fonteRotas = readFileSync(new URL('../src/stripe-rotas.js', import.meta.url), 'utf8');

function corpoDe(fonte, assinatura) {
  const ini = fonte.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  // A lista de parâmetros pode ter chaves — `({ apos, desde, tipos })`. Pular
  // para o primeiro `{` pegaria a desestruturação e devolveria meia função,
  // calada. Primeiro fechamos os parênteses; o corpo começa depois deles.
  let j = fonte.indexOf('(', ini), par = 0;
  for (; j < fonte.length; j++) {
    if (fonte[j] === '(') par++;
    else if (fonte[j] === ')') { par--; if (!par) break; }
  }
  let i = fonte.indexOf('{', j), nivel = 0, fim = -1;
  for (; i < fonte.length; i++) {
    if (fonte[i] === '{') nivel++;
    else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } }
  }
  return fonte.slice(ini, fim).replace('export ', '');
}

const MSG_VELHO = "Event 'evt_1UHvfH0mB8PWBSessntv69rd' is no longer available "
  + "because it's aged out of our retention policy.";

// --------------------------------------------------------------- o cliente

test('a montagem da consulta aceita data quando não há marcador', () => {
  const corpo = corpoDe(fonteCliente, 'export async function listarEventos(');
  assert.match(corpo, /created\[gte\]/, 'sem isto não há como reler sem o marcador');
  assert.match(corpo, /else if \(desde\)/,
    'data e marcador são excludentes: mandar os dois é pedir a interseção e vir vazio');
});

test('a resposta do Stripe marca o caso "o teu marcador envelheceu"', () => {
  // Sem distinguir isto de "o Stripe caiu", quem chama não tem como saber que
  // tentar de novo igual nunca vai funcionar.
  const re = /marcadorVelho: (\/[^/]+\/i)\.test\(motivo\)/.exec(fonteCliente);
  assert.ok(re, 'não achei a marcação do erro de marcador velho');
  const padrao = new RegExp(re[1].slice(1, -2), 'i');
  assert.ok(padrao.test(MSG_VELHO), 'a mensagem real da produção precisa casar');
  assert.ok(!padrao.test('Your card was declined.'), 'não pode casar com erro comum');
  assert.ok(!padrao.test('Stripe respondeu 500'), 'nem com o Stripe fora do ar');
});

// --------------------------------------------------------------- a varredura

// Roda conferirStripe de verdade, com dublês, e conta as chamadas.
async function varrer({ falhaInicial, segundaFalha = false }) {
  const chamadas = [];
  const gravacoes = [];
  const ctx = {
    console,
    TIPOS: ['charge.succeeded'],
    DIAS_DE_RELEITURA: Number(/const DIAS_DE_RELEITURA = (\d+);/.exec(fonteRotas)[1]),
    stripeConfigurado: () => true,
    obterRegras: async () => ({}),
    agora: () => '2026-10-27T12:00:00.000Z',
    estado: async () => ({ ultimoEvento: 'evt_velho', tratados: [], conferidoEm: null }),
    salvarEstado: async (mudar) => {
      gravacoes.push(mudar({ ultimoEvento: 'evt_velho', tratados: [] }));
    },
    tratarEvento: async () => ({ acao: 'baixa', parcelaId: 'p1' }),
    listarEventos: async (opcoes) => {
      chamadas.push(opcoes);
      if (chamadas.length === 1 && falhaInicial) {
        return { ok: false, marcadorVelho: true, motivo: MSG_VELHO };
      }
      if (chamadas.length === 2 && segundaFalha) {
        return { ok: false, motivo: 'Stripe respondeu 500' };
      }
      return { ok: true, eventos: [{ id: 'evt_novo', type: 'charge.succeeded' }], temMais: false };
    },
  };
  vm.createContext(ctx);
  new vm.Script(corpoDe(fonteRotas, 'export async function conferirStripe(log)')
    + '\nvar log = []; var pronto = conferirStripe(log);').runInContext(ctx);
  await ctx.pronto;
  return { chamadas, gravacoes, log: ctx.log };
}

test('em dia normal a varredura usa o marcador e pronto', () => {
  return varrer({ falhaInicial: false }).then(({ chamadas }) => {
    assert.equal(chamadas.length, 1, 'não pode reler à toa');
    assert.equal(chamadas[0].apos, 'evt_velho');
    assert.equal(chamadas[0].desde, undefined);
  });
});

test('marcador envelhecido: ela relê pela data em vez de desistir', async () => {
  // Este é o defeito. Antes, o `return` aqui matava a varredura para sempre.
  const { chamadas, log } = await varrer({ falhaInicial: true });
  assert.equal(chamadas.length, 2, 'precisa tentar de novo, sem o marcador');
  assert.equal(chamadas[1].apos, undefined, 'o marcador morto não pode ir junto');
  assert.ok(chamadas[1].desde > 0, 'a segunda tentativa vai pela data');
  const dias = Math.round((Date.now() / 1000 - chamadas[1].desde) / 86400);
  assert.equal(dias, 30, 'relê a janela inteira que o Stripe guarda');
  assert.ok(log.some(l => /envelheceu/.test(l)), 'tem que ficar dito no log');
});

test('depois de reler, o marcador morto é jogado fora', async () => {
  // Sem isto o próximo ciclo tropeça exatamente no mesmo id.
  const { gravacoes } = await varrer({ falhaInicial: true });
  assert.ok(gravacoes.some(g => g.ultimoEvento === null),
    'o marcador velho precisa ser zerado');
});

test('se a releitura também falhar, ela sai sem zerar nada', async () => {
  // Zerar o marcador em cima de uma falha de rede perderia o ponto de retomada.
  const { gravacoes, log } = await varrer({ falhaInicial: true, segundaFalha: true });
  assert.deepEqual(gravacoes, [], 'nada é gravado quando a releitura não veio');
  assert.ok(log.some(l => /não consegui ler os eventos/.test(l)));
});

test('erro comum do Stripe NÃO dispara releitura', async () => {
  // Releitura é para marcador velho. Em queda do Stripe, insistir sem marcador
  // só troca um erro por outro, e ainda arrisca o ponto de retomada.
  const chamadas = [];
  const ctx = {
    console, TIPOS: [], DIAS_DE_RELEITURA: 30,
    stripeConfigurado: () => true, obterRegras: async () => ({}),
    agora: () => '2026-10-27T12:00:00.000Z',
    estado: async () => ({ ultimoEvento: 'evt_velho', tratados: [] }),
    salvarEstado: async () => { throw new Error('não devia gravar'); },
    tratarEvento: async () => ({}),
    listarEventos: async (o) => { chamadas.push(o); return { ok: false, motivo: 'Stripe respondeu 500' }; },
  };
  vm.createContext(ctx);
  new vm.Script(corpoDe(fonteRotas, 'export async function conferirStripe(log)')
    + '\nvar log = []; var pronto = conferirStripe(log);').runInContext(ctx);
  await ctx.pronto;
  assert.equal(chamadas.length, 1, 'uma tentativa só');
});

test('reaplicar evento é inofensivo — a baixa atribui, não soma', () => {
  // É o que torna a releitura segura. Se algum dia alguém trocar por `+=`,
  // a releitura passa a duplicar dinheiro, e este teste tem que gritar.
  const corpo = corpoDe(fonteRotas, 'async function aplicar(parcelaId, mudanca, rotulo)');
  assert.doesNotMatch(corpo, /valorRecebido\s*\+=|\+=\s*mudanca/,
    'baixa de pagamento não pode acumular: tem que atribuir');
  assert.match(corpo, /Object\.assign\(p, mudanca\.campos \|\| \{\}\)/);
});

test('repasse não vira "parcela undefined" no log', () => {
  // Cinco linhas assim saíram na produção de 27/10. Um log que mente sobre si
  // mesmo custa caro justamente aqui: ele é a única janela para esta
  // automação, e foi por ele que se descobriu que a varredura estava parada.
  const corpo = corpoDe(fonteRotas, 'export async function conferirStripe(log)');
  assert.doesNotMatch(corpo, /· parcela \$\{res\.parcelaId\}`\)/,
    'o trecho da parcela precisa ser condicional');
  assert.match(corpo, /res\.parcelaId \? ` · parcela \$\{res\.parcelaId\}` : ''/);
});
