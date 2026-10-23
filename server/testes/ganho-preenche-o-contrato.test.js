// "na hora do ganho -> os dados da proposta ja tem que vir pre preenchido no
// contrato, o vendedor pode editar mas tem que vir como padrao o valor da
// proposta negociado" — e, junto: "contrato nao puxa o email", "nao puxa o
// endereco".
//
// O contrato nascia zerado: entrada 0, 0 parcelas, e-mail e endereço vazios.
// Era por isso que o contrato de teste do Neilson, depois de assinado, não
// tinha uma única parcela para o financeiro gerar.
//
// A entrada, as parcelas e o valor já eram preenchidos na aba Comercial do
// lead e salvos; só não eram levados. O endereço não existia em lugar nenhum
// do sistema — passou a ser coletado na mesma aba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tela = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');

// Pega o literal do contrato como ele está na tela e monta de verdade.
const ini = tela.indexOf('const novoContrato = {');
assert.ok(ini > 0, 'não achei o contrato gerado no Ganho');
let i = tela.indexOf('{', ini), nivel = 0, fim = -1;
for (; i < tela.length; i++) { if (tela[i] === '{') nivel++; else if (tela[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
const literal = tela.slice(ini, fim) + ';';

function gerar(lead, dependentes = 0) {
  const ctx = {
    l: lead, dependentes,
    LW: { novoId: () => 'c-novo', escaparHtml: (x) => x },
    now: () => new Date('2026-10-23T12:00:00.000Z'),
  };
  vm.createContext(ctx);
  new vm.Script(literal + '\nvar pronto = JSON.stringify(novoContrato);').runInContext(ctx);
  return JSON.parse(ctx.pronto);
}

const LEAD = {
  id: 'ld1', nome: 'Teste neilson A', telefone: '+1 407 555 0199', vendedor: 'Renato',
  servico: 'EB-2 NIW', valorPotencial: 5000, email: 'neilson@exemplo.com',
  endereco: '123 Orange Ave, Orlando, FL 32801',
  comercial: { servicoOferecido: 'EB-2 NIW', valorNegociado: 9000, entrada: 2000, parcelas: 7,
    negociacao: 'Combinado: entrada por Zelle, resto no cartão.' },
};

test('o valor negociado vira o valor do contrato', () => {
  assert.equal(gerar(LEAD).valor, 9000, 'não o valorPotencial de 5000: o que vale é o negociado');
});

test('a entrada e as parcelas da proposta vão para o contrato', () => {
  const c = gerar(LEAD);
  assert.equal(c.entrada, 2000);
  assert.equal(c.numParcelas, 7);
});

test('o contrato puxa o e-mail do lead', () => {
  assert.equal(gerar(LEAD).email, 'neilson@exemplo.com');
});

test('o contrato puxa o endereço do lead', () => {
  assert.equal(gerar(LEAD).endereco, '123 Orange Ave, Orlando, FL 32801');
});

test('o que foi combinado na negociação vai nas observações', () => {
  // o vendedor fecha e some; quem monta o contrato precisa ler o acordo
  assert.match(gerar(LEAD).observacoes, /entrada por Zelle, resto no cartão/);
});

test('lead sem nada preenchido não quebra e nasce zerado', () => {
  const c = gerar({ id: 'x', nome: 'Sem Dados', vendedor: 'Adriano', servico: 'Visto T', comercial: {} });
  assert.equal(c.valor, 0);
  assert.equal(c.entrada, 0);
  assert.equal(c.numParcelas, 0);
  assert.equal(c.email, '');
  assert.equal(c.endereco, '');
  assert.doesNotMatch(c.observacoes, /combinado na negociação/);
});

test('o contrato continua nascendo em "A gerar", editável', () => {
  // ela foi explícita: "o vendedor pode editar"
  assert.equal(gerar(LEAD).etapa, 'A gerar');
});

// --- a coleta, na aba Comercial ---
test('a aba Comercial pede e-mail e endereço', () => {
  assert.match(tela, /id="com-email"/, 'sem campo de e-mail o vendedor não tem onde preencher');
  assert.match(tela, /id="com-endereco"/, 'o endereço não existia em lugar nenhum do sistema');
});

test('e-mail e endereço são gravados no lead ao salvar o Comercial', () => {
  const iniF = tela.indexOf('async function salvarComercial(id)');
  const corpo = tela.slice(iniF, tela.indexOf('\n}', tela.indexOf('const erro = await saveLeads()', iniF)));
  assert.match(corpo, /l\.email\s*=/, 'o e-mail digitado tem que ficar no lead');
  assert.match(corpo, /l\.endereco\s*=/, 'o endereço digitado tem que ficar no lead');
});
