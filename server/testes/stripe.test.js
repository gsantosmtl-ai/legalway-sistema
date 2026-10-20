// O que dá para testar sem rede: conversão de dinheiro e — o que mais importa
// num módulo de cobrança — a conferência da assinatura do webhook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.STRIPE_SECRET_KEY = 'sk_test_naoUsada';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_segredoDeTeste';

const { centavos, dolares, assinaturaConfere, ambienteStripe } = await import('../src/stripe.js');

test('dinheiro vai e volta em centavo inteiro', () => {
  assert.equal(centavos(341.55), 34155);
  assert.equal(centavos(6490), 649000);
  assert.equal(centavos(0.5), 50);
  // O caso que justifica a função existir: 19.99 * 100 em ponto flutuante dá
  // 1998.9999999999998, e truncar perderia um centavo por parcela.
  assert.equal(centavos(19.99), 1999);
  assert.equal(centavos(8.115), 812);
  assert.equal(dolares(34155), 341.55);
  assert.equal(centavos(null), 0);
});

test('o ambiente sai da própria chave', () => {
  assert.equal(ambienteStripe(), 'teste');
});

const assinar = (corpo, t, segredo = 'whsec_segredoDeTeste') =>
  `t=${t},v1=` + createHmac('sha256', segredo).update(`${t}.${corpo}`).digest('hex');

test('assinatura válida passa', () => {
  const corpo = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
  const t = Math.floor(Date.now() / 1000);
  assert.equal(assinaturaConfere(corpo, assinar(corpo, t)).ok, true);
});

test('assinatura com outro segredo é recusada', () => {
  const corpo = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const r = assinaturaConfere(corpo, assinar(corpo, t, 'whsec_outro'));
  assert.equal(r.ok, false);
  assert.match(r.motivo, /não confere/);
});

test('corpo alterado depois de assinado é recusado', () => {
  const corpo = '{"valor":100}';
  const t = Math.floor(Date.now() / 1000);
  const cab = assinar(corpo, t);
  // É este o ataque que importa: trocar o valor pago mantendo a assinatura.
  assert.equal(assinaturaConfere('{"valor":999}', cab).ok, false);
});

test('evento velho é recusado — barra reenvio', () => {
  const corpo = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000) - 3600;
  const r = assinaturaConfere(corpo, assinar(corpo, t));
  assert.equal(r.ok, false);
  assert.match(r.motivo, /janela/);
});

test('cabeçalho malformado não derruba nada', () => {
  for (const cab of ['', 'lixo', 't=,v1=', 'v1=abc', undefined, null]) {
    assert.equal(assinaturaConfere('{}', cab).ok, false);
  }
});

test('corpo como Buffer confere igual ao texto', () => {
  const corpo = '{"id":"evt_buffer"}';
  const t = Math.floor(Date.now() / 1000);
  const cab = assinar(corpo, t);
  assert.equal(assinaturaConfere(Buffer.from(corpo), cab).ok, true);
});
