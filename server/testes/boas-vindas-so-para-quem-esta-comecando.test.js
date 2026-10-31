// O que protege 263 clientes reais de receber "seja bem-vindo, vamos precisar
// destes documentos" é a marca `semAvisoAutomatico`. E NENHUM código escreve
// essa marca: ela foi posta uma vez, por script, em 30/10/2026.
//
// A última puxada do Kommo é no domingo, 01/11, e ela reescreve o bloco de
// processos. Se a marca for embora junto, às 08h da segunda saem 263
// mensagens — 98 para quem está em acompanhamento, 30 para quem já está
// protocolado, 3 para quem tem o I-797 na mão.
//
// Estas duas guardas não dependem de marca nem de data. Medido no banco em
// 30/10: se a marca desaparecesse, elas levariam 263 candidatos para 27, e
// esses 27 são clientes que de fato estão esperando as boas-vindas.
//
// Roda o gatilho de verdade, não lê o código.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';
const { GATILHOS } = await import('../src/avisos-automaticos.js');

const agora = { data: '2026-11-02', minutos: 480, dia: 'seg' };
const d = (extra) => ({ processos: [{
  id: 'p1', clienteNome: 'Maria Silva', servico: 'Visto T', telefone: '+14075550110',
  status: 'Aguardando boas-vindas', responsavel: 'Bruno',
  checklist: [{ nome: 'Passaporte', status: 'Solicitado' }, { nome: 'Carta pessoal', status: 'Não solicitado' }],
  ...extra,
}] });
const candidatos = (extra) => GATILHOS.boasVindasDocumentos.candidatos(d(extra), {}, agora);

test('cliente novo, esperando as boas-vindas, recebe', () => {
  assert.equal(candidatos().length, 1);
});

test('"Documentos solicitados" ainda recebe — é o começo também', () => {
  assert.equal(candidatos({ status: 'Documentos solicitados' }).length, 1);
});

for (const status of ['Em acompanhamento', 'Protocolado', 'I-797', 'Biometria',
                      'Documento finalizado', 'Documentação completa',
                      'Aguardando autorização financeira', 'Liberado para protocolo',
                      'Recebendo documentos', 'Cancelado']) {
  test(`"${status}" não recebe boas-vindas`, () => {
    assert.equal(candidatos({ status }).length, 0,
      'dizer "vamos precisar destes documentos" aqui avisa o cliente que o escritório perdeu o caso dele');
  });
}

test('quem já anexou algum documento não recebe, mesmo com status de começo', () => {
  // O status dos antigos pode estar errado — é o que ela diz: "não sabemos o
  // real status deles". Um anexo no checklist é prova de que a conversa já
  // começou. Na base, 180 dos 263 já mandaram algo.
  assert.equal(candidatos({ checklist: [{ nome: 'Passaporte', status: 'Solicitado', arquivo: '/api/arquivos/' + 'a'.repeat(32) }] }).length, 0);
});

test('anexo na forma nova (lista) também conta', () => {
  assert.equal(candidatos({ checklist: [{ nome: 'RG', status: 'Solicitado', arquivos: [{ nome: 'frente.jpg', url: '/x' }] }] }).length, 0);
});

test('lista de anexos VAZIA não conta como já começou', () => {
  assert.equal(candidatos({ checklist: [{ nome: 'RG', status: 'Solicitado', arquivos: [] }] }).length, 1);
});

for (const status of ['Recebido', 'Aprovado', 'Em revisão', 'Incorreto']) {
  test(`documento em "${status}" já conta como conversa começada`, () => {
    assert.equal(candidatos({ checklist: [{ nome: 'Passaporte', status }] }).length, 0);
  });
}

test('as guardas antigas continuam valendo', () => {
  assert.equal(candidatos({ semAvisoAutomatico: true }).length, 0, 'a marca da virada');
  assert.equal(candidatos({ boasVindasEnviada: '2026-10-30T12:00:00Z' }).length, 0, 'uma vez por cliente');
});

test('o acesso ao portal herda as guardas, por exigir as boas-vindas', () => {
  // acessoPortal exige `boasVindasEnviada`, e esse campo só nasce quando as
  // boas-vindas saem. Então toda guarda das boas-vindas vale para ele também.
  const semBoasVindas = GATILHOS.acessoPortal.candidatos(
    { ...d({ email: 'maria@exemplo.com' }), comPortal: new Set(), linkDoPortal: '/portal-cliente.html' }, {}, agora);
  assert.equal(semBoasVindas.length, 0);
});

// ---------------------------------------------------------------------------
// E a lista vazia.
//
// Três serviços estão sem checklist nenhum: MOTION WEBEX, Suplemento B e
// Resposta de RFE. O processo nasce com zero itens, e a mensagem sairia com um
// buraco no meio:
//
//   "Para começar, estes são os documentos que vamos precisar:
//
//
//    Pode mandar por aqui mesmo, um por um, sem pressa."
//
// A Greice fechou Suplemento B em 30/10 e é exatamente este caso. O aviso de
// cobrança semanal já pulava lista vazia; este não pulava.
// ---------------------------------------------------------------------------
const semInterno = () => false;
const comDocs = (checklist, extra) => GATILHOS.boasVindasDocumentos.candidatos(
  { processos: [{ id: 'p1', clienteNome: 'Greice Oliveira', servico: 'Suplemento B',
    telefone: '+14075550110', status: 'Aguardando boas-vindas', responsavel: 'Vitória',
    checklist, ...extra }], internoNoServico: semInterno }, {}, agora);

test('serviço sem checklist não vira mensagem com buraco', async () => {
  const c = comDocs([]);
  assert.equal(c.length, 1, 'continua candidato — quem decide é o preparar');
  const r = await c[0].preparar();
  assert.ok(r.erroPreparo, 'tinha de recusar o envio');
  assert.match(r.erroPreparo, /Suplemento B/);
  assert.match(r.erroPreparo, /sem checklist/);
  assert.match(r.erroPreparo, /Configurações → Serviços/, 'o log tem de dizer o que fazer');
});

test('checklist só com item interno também não vira mensagem', async () => {
  // O cliente não tem o que anexar num I-914. Se tudo que falta é interno, a
  // lista para ele é vazia do mesmo jeito.
  const c = comDocs([{ nome: 'FORM I-914', status: 'Não solicitado', interno: true }]);
  const r = await c[0].preparar();
  assert.ok(r.erroPreparo, 'lista vazia por ser tudo interno passou assim mesmo');
});

test('com um documento a pedir, a mensagem sai', async () => {
  const c = comDocs([{ nome: 'Passaporte', status: 'Não solicitado' }]);
  const r = await c[0].preparar();
  assert.equal(r.erroPreparo, undefined);
  assert.equal(c[0].valores.documentos, '• Passaporte');
  assert.equal(c[0].valores.quantidade, '1');
});

test('o preparar não mexe em nada — só decide', async () => {
  const c = comDocs([{ nome: 'Passaporte', status: 'Não solicitado' }]);
  const antes = JSON.stringify(c[0].alvo);
  await c[0].preparar();
  assert.equal(JSON.stringify(c[0].alvo), antes);
});
