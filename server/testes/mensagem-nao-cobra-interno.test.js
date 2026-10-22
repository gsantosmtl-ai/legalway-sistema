// "Precisamos apenas confirmar que 'documentos que faltam' seja somente aqueles
// que não estão marcados como interno."
//
// Confirmado — e travado aqui. Formulário interno é trabalho do escritório: o
// cliente não tem o que anexar num I-914 ou num G-1145. Em produção são 3.753
// itens de checklist e mais de 800 são formulário; se eles entrassem na
// cobrança semanal, o cliente receberia toda sexta uma lista de documentos que
// ele não tem como mandar.
//
// Este teste roda o gatilho de verdade, não lê o código: é a mensagem que
// precisa sair limpa, não a linha do filtro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { GATILHOS } = await import('../src/avisos-automaticos.js');

const agora = { data: '2026-10-22', minutos: 600, dia: 'qui' };
const processo = () => ({
  id: 1, clienteNome: 'Maria Silva', servico: 'Visto T', telefone: '+14075550110',
  responsavel: 'Vitória',
  checklist: [
    { nome: 'Passaporte', status: 'Solicitado' },
    { nome: 'FORM I-914', status: 'Solicitado', interno: true },
    { nome: 'G-1145', status: 'Não solicitado', interno: true },
    { nome: 'I-914 SUPA', status: 'Incorreto', interno: true },
    { nome: 'Certidão de nascimento', status: 'Incorreto' },
    { nome: 'Carta pessoal', status: 'Recebido' },           // já chegou, espera conferência
    { nome: 'RG', status: 'Solicitado', arquivo: '/api/arquivos/1' }, // já anexado
  ],
});

test('o follow-up de documentos não cobra formulário interno', () => {
  const c = GATILHOS.documentosPendentes.candidatos({ processos: [processo()] }, {}, agora)[0];
  assert.equal(c.valores.documentos, '• Passaporte\n• Certidão de nascimento');
  for (const interno of ['I-914', 'G-1145', 'SUPA']) {
    assert.ok(!c.valores.documentos.includes(interno), `${interno} é do escritório — não pode ser cobrado do cliente`);
  }
});

test('a conta bate com a lista', () => {
  // "Faltam 5 documentos" seguido de uma lista de 2 faz o cliente ligar para
  // perguntar quais são os outros três.
  const c = GATILHOS.documentosPendentes.candidatos({ processos: [processo()] }, {}, agora)[0];
  assert.equal(c.valores.quantidade, '2');
  assert.equal(c.titulo, 'Faltam 2 documento(s)');
  assert.equal(Number(c.valores.quantidade), c.valores.documentos.split('\n').length);
});

test('as boas-vindas pedem a mesma lista', () => {
  // Se as duas discordassem, o cliente receberia o I-914 na primeira mensagem e
  // nunca mais ouviria falar dele.
  const p = processo();
  const faltam = GATILHOS.documentosPendentes.candidatos({ processos: [p] }, {}, agora)[0];
  const bv = GATILHOS.boasVindasDocumentos.candidatos({ processos: [p] }, {}, agora)[0];
  assert.equal(bv.valores.documentos, faltam.valores.documentos);
  assert.equal(bv.valores.quantidade, faltam.valores.quantidade);
});

test('processo que só deve formulário interno não recebe cobrança nenhuma', () => {
  // Sem isto, o cliente que já mandou tudo receberia toda sexta uma mensagem
  // com uma lista vazia.
  const p = processo();
  p.checklist = p.checklist.filter(d => d.interno);
  assert.equal(GATILHOS.documentosPendentes.candidatos({ processos: [p] }, {}, agora).length, 0,
    'nada a cobrar do cliente = nenhuma mensagem');
});

test('"Recebido" e item já anexado também ficam de fora', () => {
  // Cobrar o que já chegou faz a pessoa mandar duas vezes.
  const c = GATILHOS.documentosPendentes.candidatos({ processos: [processo()] }, {}, agora)[0];
  assert.ok(!c.valores.documentos.includes('Carta pessoal'), 'já chegou, espera conferência nossa');
  assert.ok(!c.valores.documentos.includes('RG'), 'já tem arquivo anexado');
});

test('o item interno volta a contar se alguém desmarcar', () => {
  // O marcador é por processo: um documento pode ser interno num serviço e do
  // cliente em outro. Desmarcou, volta para a cobrança.
  const p = processo();
  p.checklist.find(d => d.nome === 'FORM I-914').interno = false;
  const c = GATILHOS.documentosPendentes.candidatos({ processos: [p] }, {}, agora)[0];
  assert.ok(c.valores.documentos.includes('FORM I-914'));
  assert.equal(c.valores.quantidade, '3');
});
