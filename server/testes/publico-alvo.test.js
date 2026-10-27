// O pedido dela, literal: "quero enviar uma mensagem somente para quem está no
// funil de documentos / que não faz processo externo / que está na etapa de
// recebendo documentações... e assim por diante para o comercial também."
//
// Mensagem em massa é o tipo de função em que errar custa caro de verdade: o
// erro não fica numa tela, ele chega no celular de um cliente. Por isso o
// módulo só DECIDE QUEM — não envia — e por isso estes testes olham com mais
// atenção para quem fica de FORA do que para quem entra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicoAlvo, mensagemPara, DEPARTAMENTOS, execucaoDoProcesso } from '../src/publico-alvo.js';

const doc = (extra) => ({ id: 'p' + Math.random().toString(36).slice(2, 7),
  clienteNome: 'Fulano', status: 'Recebendo documentos', telefone: '+1 407 555 0100',
  servico: 'Visto T', vendedor: 'Renato', ...extra });

// ------------------------------------------------------- o exemplo dela
test('o recorte exato que ela pediu', () => {
  const r = publicoAlvo([
    doc({ clienteNome: 'Ana', telefone: '+1 407 555 0101' }),
    doc({ clienteNome: 'Bruno', telefone: '+1 407 555 0102', status: 'Protocolado' }),
    doc({ clienteNome: 'Carla', telefone: '+1 407 555 0103', execucao: { tipo: 'externo', escritorio: 'Parceiro' } }),
    doc({ clienteNome: 'Davi', telefone: '+1 407 555 0104' }),
  ], { departamento: 'documentos', etapas: ['Recebendo documentos'], execucao: 'interno' });

  assert.deepEqual(r.pessoas.map(p => p.nome), ['Ana', 'Davi']);
  assert.equal(r.total, 2);
});

test('processo sem marcação de execução conta como interno', () => {
  // Decisão dela: "manter como padrão sempre Legal Way; quando não for, a
  // Vitória altera". Se o sem-marcação caísse fora, o disparo "só interno"
  // deixaria de alcançar quase toda a base.
  assert.equal(execucaoDoProcesso({}).tipo, 'interno');
  assert.equal(execucaoDoProcesso({}).padrao, true);
  const r = publicoAlvo([doc({ clienteNome: 'Sem marca' })],
    { departamento: 'documentos', execucao: 'interno' });
  assert.equal(r.total, 1);
});

test('"externo" traz só quem tem escritório de fora', () => {
  const r = publicoAlvo([
    doc({ clienteNome: 'Interna', telefone: '+1 407 555 0201' }),
    doc({ clienteNome: 'Externa', telefone: '+1 407 555 0202', execucao: { tipo: 'externo', escritorio: 'Parceiro' } }),
  ], { departamento: 'documentos', execucao: 'externo' });
  assert.deepEqual(r.pessoas.map(p => p.nome), ['Externa']);
});

// ------------------------------------------------------- quem fica de fora
test('quem não tem telefone é CONTADO à parte, não sumido', () => {
  // Dizer "3 pessoas" quando são 4 e uma não tem número faz a equipe achar
  // que falou com todo mundo. O que não dá para enviar tem que aparecer.
  const r = publicoAlvo([
    doc({ clienteNome: 'Com', telefone: '+1 407 555 0301' }),
    doc({ clienteNome: 'Sem', telefone: '' }),
    doc({ clienteNome: 'Lixo', telefone: '---' }),
  ], { departamento: 'documentos' });
  assert.equal(r.total, 1);
  assert.deepEqual(r.semTelefone.map(p => p.nome), ['Sem', 'Lixo']);
  assert.equal(r.candidatos, 3, 'os três se encaixavam no recorte');
});

test('a mesma pessoa em dois processos recebe UMA vez', () => {
  // E o teste usa grafias diferentes do mesmo número de propósito: é assim
  // que ele aparece na base. Deduplicar pelo texto cru deixaria passar.
  const r = publicoAlvo([
    doc({ clienteNome: 'Joana Silva', telefone: '+1 (407) 555-0400', servico: 'Visto T' }),
    doc({ clienteNome: 'Joana Silva', telefone: '4075550400', servico: 'MOTION' }),
    doc({ clienteNome: 'Joana S.', telefone: '1 407 555 0400', servico: 'RFE' }),
  ], { departamento: 'documentos' });
  assert.equal(r.total, 1, 'um número, uma mensagem');
  assert.equal(r.repetidos.length, 2);
  assert.equal(r.repetidos[0].mesmoQue, 'Joana Silva', 'precisa dizer com quem repetiu');
});

test('sem escolher etapa, cancelado e encerrado ficam de fora', () => {
  // Ninguém dispara em massa querendo falar com quem já saiu. Para falar com
  // eles, a pessoa escolhe a etapa — aí é intenção, não descuido.
  const r = publicoAlvo([
    { id: '1', cliente: 'Ativo', etapa: 'Assinado', telefone: '+1 407 555 0501' },
    { id: '2', cliente: 'Fora', etapa: 'Cancelado', telefone: '+1 407 555 0502' },
  ], { departamento: 'contratos' });
  assert.deepEqual(r.pessoas.map(p => p.nome), ['Ativo']);

  const escolhido = publicoAlvo([
    { id: '2', cliente: 'Fora', etapa: 'Cancelado', telefone: '+1 407 555 0502' },
  ], { departamento: 'contratos', etapas: ['Cancelado'] });
  assert.equal(escolhido.total, 1, 'escolhendo a etapa, aí sim');
});

// ------------------------------------------------------- os departamentos
test('cada departamento lê a etapa do campo certo', () => {
  // Funil e Contratos guardam em `etapa`; SDR e Processos, em `status`.
  // Trocar isso faria o recorte voltar vazio, calado.
  assert.equal(DEPARTAMENTOS.comercial.campoEtapa, 'etapa');
  assert.equal(DEPARTAMENTOS.contratos.campoEtapa, 'etapa');
  assert.equal(DEPARTAMENTOS.sdr.campoEtapa, 'status');
  assert.equal(DEPARTAMENTOS.documentos.campoEtapa, 'status');

  const com = publicoAlvo([{ id: '1', nome: 'Lead', etapa: 'Reunião agendada', telefone: '+1 407 555 0601' }],
    { departamento: 'comercial', etapas: ['Reunião agendada'] });
  assert.equal(com.total, 1);
});

test('departamento que não existe devolve erro, não lista vazia', () => {
  // Lista vazia pareceria "ninguém se encaixa" e a pessoa reescreveria a
  // mensagem achando que o problema era o filtro.
  const r = publicoAlvo([doc({})], { departamento: 'marketing' });
  assert.match(r.erro, /Departamento desconhecido/);
  assert.equal(r.total, 0);
});

test('só o departamento de Documentos tem interno/externo', () => {
  // Oferecer esse filtro no Comercial seria prometer um recorte que não existe.
  assert.ok(DEPARTAMENTOS.documentos.temExecucao);
  for (const d of ['comercial', 'sdr', 'contratos']) {
    assert.ok(!DEPARTAMENTOS[d].temExecucao, d + ' não tem execução interna/externa');
  }
  const r = publicoAlvo([{ id: '1', nome: 'Lead', etapa: 'Ganho', telefone: '+1 407 555 0701' }],
    { departamento: 'comercial', execucao: 'externo' });
  assert.equal(r.total, 1, 'o filtro de execução é ignorado onde não se aplica');
});

test('as etapas listadas são as que as telas usam de verdade', () => {
  assert.ok(DEPARTAMENTOS.documentos.etapas.includes('Recebendo documentos'));
  assert.ok(DEPARTAMENTOS.comercial.etapas.includes('Negociação/Fechamento'));
  assert.ok(DEPARTAMENTOS.contratos.etapas.includes('Aguardando assinatura'));
  assert.equal(DEPARTAMENTOS.documentos.etapas.length, 11);
});

// ------------------------------------------------------- serviço e vendedor
test('dá para cortar por serviço e por vendedor juntos', () => {
  const r = publicoAlvo([
    doc({ clienteNome: 'A', telefone: '+1 407 555 0801', servico: 'Visto T', vendedor: 'Renato' }),
    doc({ clienteNome: 'B', telefone: '+1 407 555 0802', servico: 'Visto T', vendedor: 'Adriano' }),
    doc({ clienteNome: 'C', telefone: '+1 407 555 0803', servico: 'F1', vendedor: 'Renato' }),
  ], { departamento: 'documentos', servicos: ['Visto T'], vendedores: ['Renato'] });
  assert.deepEqual(r.pessoas.map(p => p.nome), ['A']);
});

test('acento e caixa não derrubam o filtro', () => {
  const r = publicoAlvo([doc({ clienteNome: 'A', telefone: '+1 407 555 0901', servico: 'Visto T' })],
    { departamento: 'documentos', servicos: ['visto t'] });
  assert.equal(r.total, 1);
});

// ------------------------------------------------------- a mensagem
test('as variáveis viram o que a pessoa tem', () => {
  const texto = mensagemPara('Olá, {cliente}! Seu processo de {servico} está em {etapa}.',
    { nome: 'Maria Souza Lima', servico: 'Visto T', etapa: 'Recebendo documentos' });
  assert.equal(texto, 'Olá, Maria! Seu processo de Visto T está em Recebendo documentos.');
});

test('variável que não existe fica como está, em vez de virar "undefined"', () => {
  // "Olá, undefined" chegando no cliente é o pior resultado possível.
  const texto = mensagemPara('Oi {cliente}, {inventada} aqui', { nome: 'Ana' });
  assert.equal(texto, 'Oi Ana, {inventada} aqui');
});

test('pessoa sem nome não vira "Olá, !"', () => {
  assert.equal(mensagemPara('Olá, {cliente}!', { nome: '' }), 'Olá, !');
  assert.equal(mensagemPara('{nomeCompleto}', { nome: '  ' }), '');
});

// ------------------------------------------------------- o que ele NÃO faz
test('o módulo não envia nada — só decide quem', () => {
  // A trava mais importante do arquivo. Se um dia alguém puser o envio aqui
  // dentro, um teste que roda sem rede passa a mandar mensagem de verdade.
  const fonte = readFileSync(new URL('../src/publico-alvo.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fonte, /enviarTexto|fetch\(|sendMessage/,
    'quem envia é a rota, depois que uma pessoa olhou a lista');
});
import { readFileSync } from 'node:fs';
