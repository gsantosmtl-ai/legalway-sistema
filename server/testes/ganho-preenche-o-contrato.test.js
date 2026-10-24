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

function corpoDe(assinatura) {
  const ini = tela.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = tela.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < tela.length; i++) { if (tela[i] === '{') nivel++; else if (tela[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return tela.slice(ini, fim);
}

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

// ---------------------------------------------------------------------------
// "servico entra na proposta tipo de servico ja cadastrado, nao pode digitar
//  tem que buscar nos servicos cadastrados"
//
// A aba Proposta tinha um "+ Cadastrar novo serviço…" com campo de texto
// livre. O serviço digitado ali entrava no catálogo com um modelo de contrato
// ADIVINHADO por uma regra de uma linha: se o nome tivesse "EB-2", usava
// eb2niw.html; senão, visto-t.html. Um serviço escrito com outro nome gerava
// contrato do modelo errado — e ninguém percebia até o cliente receber.
test('a aba Proposta não deixa mais digitar serviço novo', () => {
  assert.equal(tela.indexOf('__novo__'), -1, 'a opção de cadastrar na hora saiu');
  assert.equal(tela.indexOf('com-servico-novo'), -1, 'e o campo de texto livre também');
});

test('o serviço sai da lista dos cadastrados', () => {
  const i = tela.indexOf('<label>Serviços contratados</label>');
  assert.ok(i > 0, 'não achei o campo de serviços');
  const bloco = tela.slice(i, i + 1200);
  assert.match(bloco, /SERVICOS_CONHECIDOS\.map/, 'as opções vêm do cadastro');
  assert.match(bloco, /contratos\.html/, 'e diz onde cadastrar o que falta');
});

test('o modelo de contrato não é mais adivinhado pelo nome', () => {
  assert.doesNotMatch(tela, /EB-\?2\/i\.test\(servico\)/,
    'escolher o modelo por regex no nome do serviço era o que gerava contrato errado');
});

test('serviço antigo fora do cadastro continua na proposta', () => {
  // Leads antigos têm serviço que já não está no catálogo. Com a lista, o que
  // vale é o que está gravado no lead — o cadastro só alimenta o "+ adicionar".
  // Então nada se perde, e não é mais preciso o truque do sufixo "(fora do
  // cadastro)", que podia acabar gravado como se fosse parte do nome.
  const corpo = corpoDe('function servicosDoLead(l)');
  assert.match(corpo, /com\.servicos/, 'lê a lista gravada no lead');
  assert.match(corpo, /com\.servicoOferecido \|\| l\.servico/, 'e o serviço único dos leads antigos');
  assert.doesNotMatch(tela, /\(fora do cadastro\)/, 'o sufixo deixou de existir');
});

test('a lista da proposta aceita mais de um serviço, com dependentes de cada', () => {
  assert.match(tela, /id="com-servicos-lista"/);
  assert.match(tela, /id="com-servico-add"/);
  const corpo = corpoDe('function pintarServicosDaProposta()');
  assert.match(corpo, /data-sv-dep=/, 'dependentes por serviço');
  assert.match(corpo, /data-sv-rm=/, 'e dá para tirar da lista');
  assert.match(corpo, /principal/, 'o primeiro é marcado como principal');
});

test('o mesmo serviço não entra duas vezes', () => {
  const i = tela.indexOf("if(selAdd) selAdd.addEventListener('change'");
  const corpo = tela.slice(i, i + 600);
  assert.match(corpo, /servicosDaProposta\.some\(x => x\.nome === nome\)/);
});

test('o Ganho leva a lista inteira para o contrato', () => {
  const c = gerar(Object.assign({}, LEAD, { comercial: Object.assign({}, LEAD.comercial, {
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 2 }, { nome: 'Mudança de Endereço', dependentes: 0 }] }) }));
  assert.equal(c.servicos.length, 2);
  assert.equal(c.servicos[0].nome, 'Visto T + MOTION');
  assert.equal(c.servicos[0].dependentes, 2);
  assert.equal(c.servicos[1].dependentes, 0);
  assert.equal(c.servico, 'EB-2 NIW', 'o campo antigo continua com o principal, para quem lê só ele');
});

test('lead de um serviço só continua gerando contrato de um serviço', () => {
  const c = gerar(LEAD, 1);
  assert.equal(c.servicos.length, 1);
  assert.equal(c.servicos[0].nome, 'EB-2 NIW');
  assert.equal(c.servicos[0].dependentes, 1, 'os dependentes informados no Ganho');
});

test('salvar a proposta grava a lista de serviços no lead', () => {
  // sem isto a lista vive só enquanto a aba está aberta, e o Ganho não acha
  // nada para levar ao contrato
  const corpo = corpoDe('async function salvarComercial(id)');
  assert.match(corpo, /const servicos = servicosDaProposta\.map/, 'lê a lista da aba');
  assert.match(corpo, /l\.comercial = \{[\s\S]{0,200}servicos,/, 'e grava no lead');
  assert.match(corpo, /const servico = servicos\.length \? servicos\[0\]\.nome : ''/,
    'o principal é o primeiro da lista');
  assert.match(corpo, /const dependentes = servicos\.reduce/,
    'os dependentes do lead somam os de todos os serviços');
});
