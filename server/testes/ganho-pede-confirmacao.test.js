// Arrastar um card é fácil de errar, e "Ganho" é o único movimento do funil que CRIA
// coisa em outra tela: um contrato no nome do cliente. Este teste roda a função real
// moverParaEtapa do funil-comercial.html e exige que, sem confirmação, nada aconteça.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');

function extrairFuncao(nome){
  const ini = html.indexOf('async function ' + nome + '(');
  assert.ok(ini > 0, 'não achei a função ' + nome);
  let i = html.indexOf('{', ini), nivel = 0;
  for(; i < html.length; i++){
    if(html[i] === '{') nivel++;
    else if(html[i] === '}'){ nivel--; if(nivel === 0) return html.slice(ini, i + 1); }
  }
  throw new Error('não fechei as chaves de ' + nome);
}

// Roda um arrasto para "Ganho" com a confirmação respondendo `resposta`.
async function arrastarParaGanho(resposta, leadExtra = {}){
  const lead = { id:'l1', nome:'Cliente Teste', etapa:'Proposta', vendedor:'Renato',
                 servico:'EB2-NIW', valorPotencial:5000, comercial:{}, historico:[], ...leadExtra };
  const gravacoes = [];
  const ctx = {
    leads: [lead],
    contratos: [],
    CONTRATOS_KEY: 'legalway-contratos-v1',
    ETAPA_GANHO: 'Ganho',
    ETAPA_PERDIDO: 'Perdido',
    openLeadId: null,
    confirmarGanho: async () => resposta,
    perguntarMotivoPerda: async () => null,
    mandarPerdidoParaSdr: async () => {},
    mostrarModalGanho: () => {},
    saveLeads: () => {}, renderBoard: () => {}, renderDrawer: () => {}, closeDrawer: () => {},
    toast: () => {},
    now: () => new Date('2026-10-22T12:00:00Z'),
    fmtMoney: (v) => 'US$ ' + v,
    LW: { novoId: () => 'c-novo', gravar: async (k, v) => { gravacoes.push(k); return null; } },
    document: { getElementById: () => ({ value: 'Renato' }) },
    console,
  };
  vm.createContext(ctx);
  await new vm.Script(extrairFuncao('moverParaEtapa') + "\nvar __p = moverParaEtapa('l1','Ganho');")
    .runInContext(ctx), await ctx.__p;
  return { lead, contratos: ctx.contratos, gravacoes };
}

test('cancelar a confirmação não cria contrato nem move o lead', async () => {
  const r = await arrastarParaGanho(null);
  assert.equal(r.contratos.length, 0, 'criou contrato mesmo com a confirmação cancelada');
  assert.equal(r.lead.etapa, 'Proposta', 'moveu o lead mesmo com a confirmação cancelada');
  assert.equal(r.lead.contratoGeradoId, undefined);
  assert.deepEqual(r.gravacoes, [], 'gravou algo mesmo com a confirmação cancelada');
});

test('cancelar continua sem criar nada quando os dependentes já estão preenchidos', async () => {
  // Esse era o caso pior: com dependentes já informados na aba Comercial, o sistema
  // não perguntava nada e o contrato nascia no instante do arrasto.
  const r = await arrastarParaGanho(null, { dependentes: 3 });
  assert.equal(r.contratos.length, 0);
  assert.equal(r.lead.etapa, 'Proposta');
});

test('confirmando, o contrato é criado com os dependentes informados', async () => {
  const r = await arrastarParaGanho({ dependentes: 2 });
  assert.equal(r.contratos.length, 1);
  assert.equal(r.contratos[0].cliente, 'Cliente Teste');
  assert.equal(r.contratos[0].dependentes, 2);
  assert.equal(r.contratos[0].etapa, 'A gerar');
  assert.equal(r.lead.etapa, 'Ganho');
  assert.equal(r.lead.contratoGeradoId, 'c-novo');
});

test('voltar para Ganho não cria um segundo contrato', async () => {
  const r = await arrastarParaGanho({ dependentes: 0 }, { contratoGeradoId: 'c-antigo' });
  assert.equal(r.contratos.length, 0, 'criou contrato duplicado');
  assert.equal(r.lead.etapa, 'Ganho');
});
