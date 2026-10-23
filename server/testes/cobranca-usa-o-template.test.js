// "Aqui cobrar tem que ser também a mensagem automática."
//
// O botão Cobrar da tela de Inadimplência tinha um texto próprio, escrito
// dentro do código — com "Legal Way Group" cravado. Era o mesmo recado da
// mensagem automática "Cobrança não entrou", em outro lugar: exatamente o que
// ela já tinha apontado nas Configurações, quando o mesmo texto morava em duas
// abas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { GATILHOS } = await import('../src/avisos-automaticos.js');

const fin = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');

test('a tela lê o texto da mensagem automática', () => {
  assert.match(fin, /const AVISOS_KEY = 'legalway-avisos-automaticos-v1'/, 'falta ler o bloco das mensagens');
  assert.match(fin, /avisos\.find\(x=> x && x\.gatilho === 'cobrancaAtrasada' && \(x\.template\|\|''\)\.trim\(\)\)/,
    'o texto tem que vir do gatilho de cobrança atrasada');
  assert.match(fin, /if\(modelo\) return modelo\.replace\(\/\\\{\(\\w\+\)\\\}\/g/,
    'as chaves do texto precisam ser preenchidas');
});

test('mensagem desligada ainda serve de texto para a cobrança da mão', () => {
  // Desligada quer dizer "não sai sozinha", não "não existe". Se a tela exigisse
  // `ativo`, ela teria de ligar o envio automático só para poder copiar o texto.
  const i = fin.indexOf('function templateDaCobranca()');
  const corpo = fin.slice(i, fin.indexOf('\n}', i));
  assert.ok(!/\.ativo/.test(corpo), 'não pode exigir que a mensagem esteja ligada');
});

test('sem mensagem cadastrada, o texto de sempre continua saindo', () => {
  // Nunca deixar a pessoa com a mão vazia na frente do cliente.
  assert.match(fin, /\/\/ Sem mensagem automática cadastrada, o texto de sempre\./);
  assert.match(fin, /Estamos passando para falar sobre/, 'o texto de reserva precisa continuar ali');
});

test('o nome do escritório deixa de estar cravado no código', () => {
  const i = fin.indexOf('const mensagemDe = (g)=>');
  const corpo = fin.slice(i, fin.indexOf('\n  };', i));
  assert.match(corpo, /empresa: \(\(LW\.regrasAgora\(\) \|\| \{\}\)\.empresa \|\| \{\}\)\.nome \|\| ''/,
    'o nome tem que vir das regras do escritório');
});

test('o mesmo texto serve para uma parcela e para várias', () => {
  // A mensagem automática dispara por parcela; a da mão junta as parcelas de um
  // cliente. A chave {parcelas} é o que faz um texto só atender aos dois.
  assert.ok(GATILHOS.cobrancaAtrasada.chaves.includes('parcelas'),
    'o gatilho precisa oferecer a lista de parcelas');
  assert.match(GATILHOS.cobrancaAtrasada.padrao, /\{parcelas\}/, 'e usá-la no texto padrão');
  assert.match(GATILHOS.cobrancaAtrasada.padrao, /\{valor\}/, 'com o total');

  // No automático, a lista é a única parcela daquele disparo.
  const f = { id: 'f1', clienteNome: 'Antônio Silva', status: 'Atrasado', valor: 1000,
    vencimento: '2026-10-10', descricao: 'Parcela 2/3', servico: 'Visto T' };
  const c = GATILHOS.cobrancaAtrasada.candidatos({ financeiro: [f], telefoneDoCliente: () => '+1407' })[0];
  assert.match(c.valores.parcelas, /^• Parcela 2\/3 — .+, vencida em 10\/10\/2026$/);
  assert.equal(c.valores.cliente, 'Antônio', 'trata pelo primeiro nome');
});

test('a tela preenche todas as chaves que o texto padrão usa', () => {
  // Chave sem valor sai crua para o cliente: "Total: {valor}".
  const chaves = [...new Set([...GATILHOS.cobrancaAtrasada.padrao.matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
  const i = fin.indexOf('const valores = {');
  const bloco = fin.slice(i, fin.indexOf('};', i));
  for (const k of chaves) {
    assert.match(bloco, new RegExp(`\\b${k}:`), `{${k}} ficaria cru na mensagem`);
  }
});
