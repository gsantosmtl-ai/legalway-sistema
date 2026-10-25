// `anotar()` começa com `if (!e) return;` — tipo que não está no catálogo é
// ignorado em silêncio. Quem escreveu a chamada acha que registrou, e não
// registrou.
//
// Foi o que aconteceu com 'base-antiga': a recusa da aba velha funcionava, mas
// o evento nunca entrava na tabela, e a promessa de "fica registrado para a
// gente ver se repete" era falsa. Só apareceu porque o reteste conferiu a
// tabela em vez de confiar no código.
//
// Este teste varre as chamadas e exige que todo tipo usado exista.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../src/', import.meta.url);
const arquivos = readdirSync(dir).filter(f => f.endsWith('.js'));
const guardiao = readFileSync(new URL('guardiao.js', dir), 'utf8');

const catalogo = new Set([...guardiao.matchAll(/^\s*'([a-z-]+)':\s*\{\s*g:/gm)].map(m => m[1]));

test('o catálogo de eventos foi lido', () => {
  assert.ok(catalogo.size >= 10, `só achei ${catalogo.size} tipos — o recorte quebrou?`);
  assert.ok(catalogo.has('csrf') && catalogo.has('apagar-em-massa'));
});

test('todo tipo passado para anotar() existe no catálogo', () => {
  const faltando = [];
  for (const f of arquivos) {
    const txt = readFileSync(new URL(f, dir), 'utf8');
    for (const m of txt.matchAll(/anotar\(\s*'([^']+)'/g)) {
      if (!catalogo.has(m[1])) faltando.push(`${f}: anotar('${m[1]}')`);
    }
  }
  assert.deepEqual(faltando, [],
    'anotar() ignora tipo fora do catálogo em silêncio — estas chamadas acham que registram e não registram:\n'
    + faltando.join('\n'));
});

test('base-antiga está registrada e com peso zero', () => {
  // aba velha é gente trabalhando, não ataque: ninguém pode ser bloqueado
  const linha = guardiao.split('\n').find(l => l.includes("'base-antiga'"));
  assert.ok(linha, 'base-antiga saiu do catálogo e as recusas voltam a sumir');
  assert.match(linha, /peso:\s*0/, 'peso maior que zero bloquearia o IP de quem só estava com a aba aberta');
});

test('webhook de fora avisa mas NUNCA bloqueia o provedor', () => {
  // bloquear o endereço do Stripe por assinatura inválida derruba a
  // confirmação de pagamento; bloquear a Meta derruba a entrada de leads
  for (const tipo of ['stripe-assinatura', 'meta-assinatura-invalida', 'meta-verificacao-invalida']) {
    const linha = guardiao.split('\n').find(l => l.includes(`'${tipo}'`));
    assert.ok(linha, `${tipo} saiu do catálogo e volta a ser ignorado em silêncio`);
    assert.match(linha, /peso:\s*0/, `${tipo} com peso > 0 pode bloquear o provedor e cortar pagamento ou lead`);
  }
});

test('assinatura forjada de pagamento avisa na hora', () => {
  const linha = guardiao.split('\n').find(l => l.includes("'stripe-assinatura'"));
  assert.match(linha, /g:\s*3/, 'tentativa de dar baixa em parcela não paga precisa chegar a alguém na hora');
});
