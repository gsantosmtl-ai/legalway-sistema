// "o vendedor podera adicionar 1 ou mais servicos na proposta, no contrato. o
//  contrato tem que mencionar todos os servicos contratados, porem apos a
//  assinatura, sera gerado 1 unico cliente, 1 unico financeiro, e cards no
//  funil de documentos individuais de cada servico."
//
// Exemplo dela: Motion + mudança de endereço — um contrato, um pagamento, dois
// processos que andam separados e têm checklist diferente.
//
// Roda o `automacoes.js` inteiro contra um banco em memória, como o servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoDeEnsaio } from './ajuda/banco-de-ensaio.js';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';
const { servicosDoContrato, fichaDoMesmoCliente, outraFichaDaPessoa } = await import('../src/automacoes.js');

const AGORA = new Date().toISOString();
const CHECKLISTS = [
  { servico: 'Visto T + MOTION', documentos: [{ nome: 'Passaporte' }, { nome: 'Carta pessoal' }] },
  { servico: 'Mudança de Endereço', documentos: [{ nome: 'Comprovante novo' }] },
];

function contrato(extra = {}) {
  return { id: 'c1', cliente: 'Cliente Teste', telefone: '+1 407 555 0150', vendedor: 'Renato',
    etapa: 'Assinado', dataAssinatura: AGORA, valor: 3800, entrada: 800, numParcelas: 3, ...extra };
}

async function rodar(contratos, processos = []) {
  const b = bancoDeEnsaio({
    'legalway-contratos-v1': contratos,
    'legalway-clientes-v1': [], 'legalway-financeiro-v1': [],
    'legalway-processos-documentacao-v1': processos,
    'legalway-checklists-v1': CHECKLISTS,
    'legalway-sdr-v1': [], 'legalway-contas-pagar-v1': [], 'legalway-tarefas-v1': [],
    'legalway-contrato-assinado-c1': { assinadoEm: AGORA, pdf: '/x.pdf', anexos: [] },
  });
  const r = await b.rodar();
  assert.deepEqual(r.falhas, [], 'automação quebrou: ' + r.falhas.join(' · '));
  return { b, fichas: b.bloco('legalway-processos-documentacao-v1'),
    clientes: b.bloco('legalway-clientes-v1'), contas: b.bloco('legalway-financeiro-v1') };
}

// ---------------------------------------------------------------- a lista
test('contrato antigo, de um serviço só, vira uma lista de um item', () => {
  assert.deepEqual(servicosDoContrato({ servico: 'Visto T', dependentes: 2 }),
    [{ nome: 'Visto T', dependentes: 2 }]);
});

test('a lista aceita texto solto e número bagunçado', () => {
  assert.deepEqual(servicosDoContrato({ servicos: ['Motion', { nome: ' Mudança ', dependentes: '2' }] }),
    [{ nome: 'Motion', dependentes: 0 }, { nome: 'Mudança', dependentes: 2 }]);
});

test('serviço sem nome não vira ficha', () => {
  assert.deepEqual(servicosDoContrato({ servicos: [{ nome: '  ' }, { nome: 'Motion' }] }),
    [{ nome: 'Motion', dependentes: 0 }]);
  assert.deepEqual(servicosDoContrato({}), []);
  assert.deepEqual(servicosDoContrato(null), []);
});

// ---------------------------------------------------------------- o fluxo
test('dois serviços: duas fichas, um cliente, um financeiro', async () => {
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 2 }, { nome: 'Mudança de Endereço', dependentes: 0 }],
  })]);
  assert.equal(r.fichas.length, 2, 'uma ficha por serviço');
  assert.equal(JSON.stringify(r.fichas.map(f => f.servico)),
    JSON.stringify(['Visto T + MOTION', 'Mudança de Endereço']));
  assert.equal(r.clientes.length, 1, 'um cliente só');
  assert.equal(JSON.stringify(r.contas.map(x => x.descricao)),
    JSON.stringify(['Entrada', 'Parcela 1/3', 'Parcela 2/3', 'Parcela 3/3']),
    'um financeiro só, do contrato inteiro');
  assert.equal(r.contas.reduce((s, x) => s + x.valor, 0), 3800);
});

test('cada ficha nasce com o checklist do SEU serviço', async () => {
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 0 }, { nome: 'Mudança de Endereço', dependentes: 0 }],
  })]);
  const motion = r.fichas.find(f => f.servico === 'Visto T + MOTION');
  const mudanca = r.fichas.find(f => f.servico === 'Mudança de Endereço');
  assert.deepEqual(motion.checklist.map(d => d.nome), ['Passaporte', 'Carta pessoal']);
  assert.deepEqual(mudanca.checklist.map(d => d.nome), ['Comprovante novo']);
});

test('os dependentes são de cada serviço, não do contrato', async () => {
  // dois no visto principal e nenhum na mudança de endereço é o caso normal
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 2 }, { nome: 'Mudança de Endereço', dependentes: 0 }],
  })]);
  const motion = r.fichas.find(f => f.servico === 'Visto T + MOTION');
  const mudanca = r.fichas.find(f => f.servico === 'Mudança de Endereço');
  assert.equal(motion.dependentes, 2);
  assert.equal(mudanca.dependentes, 0);
  const grupos = [...new Set(motion.checklist.map(d => d.grupo).filter(Boolean))];
  assert.deepEqual(grupos, ['Dependente 1', 'Dependente 2']);
  assert.deepEqual(mudanca.checklist.filter(d => d.grupo), [], 'a mudança de endereço não ganha seção de dependente');
});

test('as fichas andam separadas', async () => {
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 0 }, { nome: 'Mudança de Endereço', dependentes: 0 }],
  })]);
  // ids diferentes, status próprio: mover uma não mexe na outra
  assert.notEqual(r.fichas[0].id, r.fichas[1].id);
  r.fichas[0].status = 'Protocolado';
  assert.equal(r.fichas[1].status, 'Aguardando boas-vindas');
});

test('rodar de novo não cria ficha repetida', async () => {
  const c = contrato({ servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 0 }, { nome: 'Mudança de Endereço', dependentes: 0 }] });
  const r = await rodar([c]);
  const antes = JSON.stringify(r.b.dados);
  await r.b.rodar();
  assert.equal(r.b.bloco('legalway-processos-documentacao-v1').length, 2);
  assert.equal(JSON.stringify(r.b.dados), antes, 'a segunda rodada não mexe em nada');
});

test('a ficha irmã não dispara o aviso de "já tem outra ficha"', async () => {
  // o aviso existe para o caso do Lucas — a mesma pessoa em contratos
  // diferentes. Duas fichas do MESMO contrato são de propósito.
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 0 }, { nome: 'Mudança de Endereço', dependentes: 0 }],
  })]);
  const avisos = r.fichas.flatMap(f => (f.historico || []).map(h => h.texto))
    .filter(t => /já tem outra ficha/.test(t));
  assert.deepEqual(avisos, [], 'nenhuma das duas pode acusar a outra');
});

test('mas a mesma pessoa em OUTRO contrato continua sendo avisada', () => {
  const processos = [{ id: 'd0', contratoId: 'contrato-antigo', clienteNome: 'Cliente Teste',
    telefone: '14075550150', servico: 'Asilo', status: 'Em acompanhamento' }];
  const nova = { id: 'd1', contratoId: 'c1', clienteNome: 'Cliente Teste', telefone: '14075550150' };
  const achou = outraFichaDaPessoa(processos.concat([nova]), contrato(), nova);
  assert.ok(achou, 'é o caso do Lucas e tem que continuar avisando');
  assert.equal(achou.servico, 'Asilo');
});

// ---------------------------------------------------------------- adoção
test('ficha órfã só é adotada pelo serviço certo', () => {
  const processos = [{ id: 'd0', clienteNome: 'Cliente Teste', telefone: '14075550150', servico: 'Visto T + MOTION' }];
  const c = contrato();
  assert.equal(fichaDoMesmoCliente(processos, c, 'Mudança de Endereço'), null,
    'a ficha de Motion não pode ser adotada pela mudança de endereço');
  const certa = fichaDoMesmoCliente(processos, c, 'Visto T + MOTION');
  assert.ok(certa && certa.ficha.id === 'd0');
});

test('ficha órfã sem serviço serve para qualquer um', () => {
  // é o caso das 49 fichas que vieram do Trello sem serviço
  const processos = [{ id: 'd0', clienteNome: 'Cliente Teste', telefone: '14075550150', servico: '' }];
  const achou = fichaDoMesmoCliente(processos, contrato(), 'Mudança de Endereço');
  assert.ok(achou && achou.ficha.id === 'd0');
});

test('adotar uma não impede a outra de nascer', async () => {
  const orfa = [{ id: 'd0', contratoId: null, clienteNome: 'Cliente Teste', telefone: '14075550150',
    servico: 'Visto T + MOTION', status: 'Recebendo documentos', checklist: [], historico: [] }];
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 0 }, { nome: 'Mudança de Endereço', dependentes: 0 }],
  })], orfa);
  assert.equal(r.fichas.length, 2, 'a órfã é adotada e a outra é criada');
  const adotada = r.fichas.find(f => f.id === 'd0');
  assert.equal(adotada.contratoId, 'c1');
  assert.equal(adotada.status, 'Recebendo documentos', 'a órfã mantém onde estava');
  assert.ok(r.fichas.some(f => f.servico === 'Mudança de Endereço'));
});

// ---------------------------------------------------------------------------
// "o contrato tem que mencionar todos os servicos contratados"
import { readFileSync } from 'node:fs';
const contratosTela = readFileSync(new URL('../../docs/contratos.html', import.meta.url), 'utf8');
const MODELOS = ['eb2niw.html', 'visto-t.html', 'modelo.html'];
const tplUrl = new URL('../../docs/contratos-templates/', import.meta.url);

function corpoDaTela(fonte, assinatura) {
  const ini = fonte.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < fonte.length; i++) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return fonte.slice(ini, fim);
}

test('a tela de Contratos mostra todos os serviços, não só o principal', () => {
  assert.match(contratosTela, /function nomesDosServicos\(c\)/);
  for (const onde of ['card-meta', 'pendente-sub', "titulo:'Serviço'", "getElementById\\('dt-nome'\\)"]) {
    assert.match(contratosTela, new RegExp(onde + "[\\s\\S]{0,160}nomesDosServicos"),
      `${onde} ainda mostra só c.servico`);
  }
});

test('o link do contrato leva a lista para o modelo', () => {
  const corpo = corpoDaTela(contratosTela, 'async function gerarLinkContrato(c)');
  assert.match(corpo, /params\.set\('servicos', todosOsServicos\)/);
  assert.match(corpo, /params\.set\('servico', c\.servico\)/,
    'o principal continua indo: é ele que escolhe qual modelo abre');
});

test('os três modelos imprimem a lista no cabeçalho', () => {
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tplUrl), 'utf8');
    assert.match(html, /id="hdr-servicos"/, `${m}: falta a linha`);
    assert.match(html, /Serviços contratados: /, `${m}: falta o texto`);
    assert.match(html, /p\.get\("servicos"\)|p\.get\('servicos'\)/, `${m}: não lê o parâmetro`);
  }
});

test('com um serviço só, o contrato não muda', () => {
  // a linha fica escondida e o cabeçalho segue como sempre
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tplUrl), 'utf8');
    assert.match(html, /if\(!todos\) return;/, `${m}: deveria sair cedo sem a lista`);
    assert.match(html, /style="display:none;/, `${m}: a linha nasce escondida`);
  }
  const corpo = corpoDaTela(contratosTela, 'async function gerarLinkContrato(c)');
  assert.match(corpo, /todosOsServicos !== c\.servico/,
    'contrato de um serviço não manda o parâmetro à toa');
});
