// Regra que ela ensinou em 27/10/2026:
//
//   "O contrato foi de 5 mil e o cliente pagou 5.105 — foi porque ele está
//    pagando a tradução. Pode ter sido taxa, SEVIS, laudo. Antigamente eles
//    juntavam ali no número da parcela; agora vão registrar itens separados.
//    Cobrança do contrato é uma coisa, cobranças adicionais ao serviço
//    contratado são outra, e não vão juntar no número da parcela."
//
// Sem essa separação, três coisas saem erradas ao mesmo tempo: a numeração
// ("parcela 3/16" num contrato de 15), a conciliação (contrato de 5.000 com
// 5.105 cobrados vira divergência que não existe) e a mensagem (o cliente
// recebe "parcela 5/5" para uma tradução).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoDeCobranca, itemAdicional, ehDoContrato, rotuloDaCobranca, somaDoContrato, ADICIONAIS }
  from '../src/cobranca.js';

const p = (e) => ({ id: 'f' + Math.random().toString(36).slice(2, 7), contratoId: 'c1',
  descricao: '', observacao: 'Ref. ao pedido de venda nº 256', valor: 1000, ...e });

// ------------------------------------------------------------ classificação
test('parcela do contrato é contrato; tradução, taxa e laudo são adicional', () => {
  assert.equal(tipoDeCobranca(p()), 'contrato');
  assert.equal(tipoDeCobranca(p({ observacao: 'Tradução juramentada' })), 'adicional');
  assert.equal(tipoDeCobranca(p({ observacao: 'SEVIS I-901' })), 'adicional');
  assert.equal(tipoDeCobranca(p({ observacao: 'Laudo médico' })), 'adicional');
  assert.equal(tipoDeCobranca(p({ descricao: 'Parcela 3/15' })), 'contrato');
});

test('"Restante da entrada" é do CONTRATO, não adicional', () => {
  // Caso real do Ronaldo: a entrada de 600 virou 250 + 350. Os 350 são
  // contrato, e classificá-los como adicional faria o contrato dele deixar
  // de fechar em 6.990.
  assert.equal(tipoDeCobranca(p({ observacao: 'RESTANTE DA ENTRADA' })), 'contrato');
  assert.equal(tipoDeCobranca(p({ observacao: 'Restante da Entrada' })), 'contrato');
});

test('o campo gravado ganha da dedução pelo texto', () => {
  // Para o que entrar daqui para frente, quem decide é o registro, não a
  // adivinhação. Se alguém marcar "contrato" numa linha que fala em tradução,
  // vale o que foi marcado.
  const marcado = p({ observacao: 'Tradução juramentada', cobranca: { tipo: 'contrato' } });
  assert.equal(tipoDeCobranca(marcado), 'contrato');
  const outro = p({ observacao: 'Ref. ao pedido de venda nº 1', cobranca: { tipo: 'adicional', item: 'laudo' } });
  assert.equal(tipoDeCobranca(outro), 'adicional');
  assert.equal(itemAdicional(outro), 'laudo');
});

test('marcação inválida não é obedecida às cegas', () => {
  assert.equal(tipoDeCobranca(p({ cobranca: { tipo: 'qualquer coisa' } })), 'contrato');
  assert.equal(itemAdicional(p({ observacao: 'Tradução', cobranca: { tipo: 'adicional', item: 'inventado' } })),
    'tradução', 'item inválido cai para o que o texto diz');
});

test('o caso real do Tiago: taxas do F1 fora do contrato', () => {
  const taxa = p({ observacao: 'PAGAMENTO DAS TAXAS PARA APLICAÇÃO DO F1 - SEVIS $350 E FAMILIAR $470', valor: 820 });
  assert.equal(tipoDeCobranca(taxa), 'adicional');
  assert.equal(itemAdicional(taxa), 'taxa');
  assert.ok(!ehDoContrato(taxa));
});

// ------------------------------------------------------------ o número
test('o adicional NÃO empurra a contagem das parcelas', () => {
  // É o coração do pedido. Com a taxa contando, as quatro parcelas do Tiago
  // virariam 1/5..5/5 e a última nem existiria.
  const quatro = [
    p({ id: 'a', vencimento: '2026-11-15', valor: 325 }),
    p({ id: 'b', vencimento: '2026-12-15', valor: 325 }),
    p({ id: 'c', vencimento: '2027-01-15', valor: 325 }),
    p({ id: 'd', vencimento: '2027-02-15', valor: 325 }),
  ];
  const taxa = p({ id: 'tx', vencimento: '2026-10-22', valor: 820, observacao: 'SEVIS' });
  const todas = [taxa, ...quatro];
  assert.equal(rotuloDaCobranca(quatro[0], todas), 'parcela 1/4');
  assert.equal(rotuloDaCobranca(quatro[3], todas), 'parcela 4/4');
  assert.equal(rotuloDaCobranca(taxa, todas), 'taxa', 'o adicional diz o que é, não um número');
});

test('a descrição que já existe manda sobre o cálculo', () => {
  assert.equal(rotuloDaCobranca(p({ descricao: 'Entrada' }), []), 'Entrada');
  assert.equal(rotuloDaCobranca(p({ descricao: 'Parcela 7/15' }), []), 'Parcela 7/15');
});

test('adicional sem pista reconhecível não vira "parcela"', () => {
  const x = p({ observacao: '', cobranca: { tipo: 'adicional' } });
  assert.equal(rotuloDaCobranca(x, [x]), 'cobrança adicional');
  assert.doesNotMatch(rotuloDaCobranca(x, [x]), /parcela/);
});

test('contrato com uma cobrança só não vira "parcela 1/1"', () => {
  const unica = p({ id: 'u', vencimento: '2026-11-15' });
  assert.equal(rotuloDaCobranca(unica, [unica]), 'parcela única');
});

test('a mensagem nunca mostra o texto interno do Bling', () => {
  const f = p({ observacao: 'Ref. ao pedido de venda nº 253', contratoId: null });
  assert.doesNotMatch(rotuloDaCobranca(f, []), /pedido de venda/);
});

// ------------------------------------------------------------ a conciliação
test('contrato de 5.000 com tradução de 105 soma 5.000, não 5.105', () => {
  // O exemplo dela, literal. Sem a separação isto aparece como divergência de
  // 105 — e alguém vai atrás de um erro que não existe.
  const todas = [
    p({ id: '1', valor: 2500, vencimento: '2026-11-01' }),
    p({ id: '2', valor: 2500, vencimento: '2026-12-01' }),
    p({ id: '3', valor: 105, vencimento: '2026-11-01', observacao: 'Tradução de documentos' }),
  ];
  assert.equal(somaDoContrato(todas, 'c1'), 5000);
});

test('a lista de tipos de adicional é a que ela nomeou', () => {
  for (const t of ['tradução', 'taxa', 'laudo', 'outro']) assert.ok(ADICIONAIS.includes(t), t);
});

test('palavra solta não classifica errado', () => {
  // "extra" e "adicional" aparecem em frase comum e não podem, sozinhas,
  // tirar uma parcela do contrato.
  assert.equal(tipoDeCobranca(p({ observacao: 'Parcela extra combinada com o cliente' })), 'contrato');
  assert.equal(tipoDeCobranca(p({ observacao: 'Cobrança adicional do contrato' })), 'contrato');
});
