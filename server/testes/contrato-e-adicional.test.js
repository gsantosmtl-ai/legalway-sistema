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
  // O nome dado à cobrança classifica; a observação, não.
  assert.equal(tipoDeCobranca(p({ descricao: 'Tradução juramentada' })), 'adicional');
  assert.equal(tipoDeCobranca(p({ descricao: 'SEVIS I-901' })), 'adicional');
  assert.equal(tipoDeCobranca(p({ descricao: 'Laudo médico' })), 'adicional');
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
  const marcado = p({ descricao: 'Tradução juramentada', cobranca: { tipo: 'contrato' } });
  assert.equal(tipoDeCobranca(marcado), 'contrato');
  const outro = p({ observacao: 'Ref. ao pedido de venda nº 1', cobranca: { tipo: 'adicional', item: 'laudo' } });
  assert.equal(tipoDeCobranca(outro), 'adicional');
  assert.equal(itemAdicional(outro), 'laudo');
});

test('marcação inválida não é obedecida às cegas', () => {
  assert.equal(tipoDeCobranca(p({ cobranca: { tipo: 'qualquer coisa' } })), 'contrato');
  assert.equal(itemAdicional(p({ descricao: 'Tradução', cobranca: { tipo: 'adicional', item: 'inventado' } })),
    'tradução', 'item inválido cai para o que o texto diz');
});

test('o caso real do Tiago: taxa do F1 só vira adicional se for MARCADA', () => {
  // Sem marcação, fica contrato. É deliberado: a observação é recado humano,
  // e deduzir dela foi de onde vieram todos os erros (ver o teste abaixo).
  const semMarca = p({ observacao: 'PAGAMENTO DAS TAXAS PARA APLICAÇÃO DO F1 - SEVIS $350', valor: 820 });
  assert.equal(tipoDeCobranca(semMarca), 'contrato', 'na dúvida, não mexe no financeiro');

  const marcada = p({ ...semMarca, cobranca: { tipo: 'adicional', item: 'taxa' } });
  assert.equal(tipoDeCobranca(marcada), 'adicional');
  assert.equal(itemAdicional(marcada), 'taxa');
  assert.ok(!ehDoContrato(marcada));
});

// ------------------------------------------------- os erros que ela pegou
test('parcela JÁ numerada é do contrato, diga o que disser a observação', () => {
  // Foi ela quem pegou: "tradução é bem barato, não há valor alto para estar
  // em vários números de parcela, acho que tem risco de estar errando."
  // Tinha. Estes quatro são lançamentos REAIS da base que a regra antiga
  // classificava como adicional, e os quatro são parcela de contrato.
  const reais = [
    // O que é CERTO em cada um destes: está numerado como parcela do
    // contrato. O que a nota quis dizer — se a tradução foi dividida, somada
    // por cima, abatida — ninguém sabe sem perguntar a quem escreveu. É
    // justamente por não saber que o sistema não classifica: na dúvida,
    // continua sendo o que já era.
    { descricao: 'Parcela 3/17', observacao: 'Ref. ao pedido de venda nº 171 (Metade da tradução $60)', valor: 426 },
    { descricao: 'Parcela 4/17', observacao: 'Ref. ao pedido de venda nº 171 (Outra metade da tradução $60)', valor: 426 },
    // Neste a regra antiga chegava a inverter o sentido: a nota fala em
    // ABATER, e ela lia como cobrança de taxa.
    { descricao: 'Parcela 3/14', observacao: 'Ref. ao pedido 162 (ABATER $300 PELA VALOR QUE SOBROU DA TAXA)', valor: 127.86 },
    { descricao: 'Parcela 1/17', observacao: 'Ref. ao pedido nº 186 - (TRADUÇÃO DOS DOCUMENTOS)', valor: 140 },
  ];
  for (const r of reais) {
    assert.equal(tipoDeCobranca(p(r)), 'contrato', `"${r.descricao}" com nota "${r.observacao}"`);
  }
});

test('a observação NÃO é consultada para classificar', () => {
  // A trava da trava. A observação é recado de gente para gente sobre aquele
  // lançamento — "metade da tradução", "abater o que sobrou". Ler isso como
  // definição do que a cobrança É foi a origem de todos os erros.
  const fonte = readFileSync(new URL('../src/cobranca.js', import.meta.url), 'utf8');
  const m = /const texto = \(f\) =>(.*)/.exec(fonte);
  assert.ok(m, 'não achei o que a dedução lê');
  assert.doesNotMatch(m[1], /observacao/, 'a dedução não pode voltar a ler a observação');
  assert.match(m[1], /descricao/);
});

test('nada do que já está na base muda de classificação', () => {
  // Conferido contra a produção em 27/10/2026: dos 3.911 lançamentos,
  // ZERO são classificados como adicional pela dedução. O financeiro fica
  // como está, e só o que for marcado daqui para frente vira adicional.
  // "Eu não quero bagunçar o financeiro" — ela, no mesmo dia.
  const comoNaBase = [
    { descricao: 'Parcela 1/15', observacao: 'Ref. ao pedido de venda nº 251' },
    { descricao: 'Entrada', observacao: 'Ref. ao pedido de venda nº 251' },
    { descricao: '', observacao: 'Ref. ao pedido de venda nº 256' },
    { descricao: '', observacao: 'RESTANTE DA ENTRADA' },
    { descricao: '', observacao: 'Parcela do contrato ainda não faturada no Bling' },
  ];
  for (const r of comoNaBase) assert.equal(tipoDeCobranca(p(r)), 'contrato', JSON.stringify(r));
});
import { readFileSync } from 'node:fs';

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
  const taxa = p({ id: 'tx', vencimento: '2026-10-22', valor: 820,
    observacao: 'SEVIS', cobranca: { tipo: 'adicional', item: 'taxa' } });
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
    p({ id: '3', valor: 105, vencimento: '2026-11-01', descricao: 'Tradução de documentos' }),
  ];
  assert.equal(somaDoContrato(todas, 'c1'), 5000);
});

test('a lista de tipos de adicional é a que ela nomeou', () => {
  for (const t of ['tradução', 'taxa', 'laudo', 'outro']) assert.ok(ADICIONAIS.includes(t), t);
});

test('palavra solta não classifica errado', () => {
  // "extra" e "adicional" aparecem em frase comum e não podem, sozinhas,
  // tirar uma parcela do contrato.
  assert.equal(tipoDeCobranca(p({ descricao: 'Parcela extra combinada com o cliente' })), 'contrato');
  assert.equal(tipoDeCobranca(p({ descricao: 'Cobrança adicional do contrato' })), 'contrato');
});
