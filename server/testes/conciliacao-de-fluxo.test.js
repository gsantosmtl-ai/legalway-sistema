// O motor da Conciliação de Fluxo. Função pura de propósito: a tela, a rota e
// estes testes rodam exatamente o mesmo código, e o teste não precisa de banco.
//
// Cada caso aqui nasceu de algo que aconteceu de verdade na base da Legal Way
// em 24/10/2026 — não são hipóteses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conciliar, servicosQueViramCard } from '../src/conciliacao.js';

const CHECKLISTS = [
  { servico: 'Visto T', documentos: [{ nome: 'Passaporte' }, { nome: 'Foto' }] },
  { servico: 'MOTION', documentos: [{ nome: 'Peticao' }] },
  { servico: 'Mudança de Endereço EOIR', documentos: [{ nome: 'Comprovante' }] },
];
const base = (extra = {}) => ({
  contratos: [], clientes: [], contas: [], processos: [], checklists: CHECKLISTS, ...extra,
});
const contrato = (x = {}) => ({
  id: 'c1', cliente: 'Fulana de Tal', etapa: 'Assinado', valor: 1000, entrada: 0,
  numParcelas: 2, servico: 'Visto T', dataAssinatura: '2026-10-01T12:00:00Z', ...x,
});
const cliente = (x = {}) => ({ id: 'cl1', nome: 'Fulana de Tal', contratoIds: ['c1'], ...x });
const parcela = (n, x = {}) => ({ id: 'f' + n, contratoId: 'c1', clienteNome: 'Fulana de Tal',
  descricao: 'Parcela ' + n + '/2', valor: 500, valorRecebido: 0, status: 'A vencer',
  vencimento: '2026-1' + n + '-01', ...x });
const ficha = (x = {}) => ({ id: 'd1', contratoId: 'c1', clienteNome: 'Fulana de Tal',
  servico: 'Visto T', status: 'Documentação', responsavel: 'Vitória',
  checklist: [{ nome: 'Passaporte' }, { nome: 'Foto' }], anexos: [], ...x });

const achar = (r, chave) => r.contratos[0].verificacoes.find((v) => v.chave === chave);
const tudoCerto = () => base({ contratos: [contrato()], clientes: [cliente()],
  contas: [parcela(1), parcela(2)], processos: [ficha()] });

test('contrato inteiro e certo não acusa nada', () => {
  const r = conciliar(tudoCerto());
  assert.equal(r.contratos[0].situacao, 'ok', JSON.stringify(r.contratos[0].verificacoes.filter(v=>v.situacao!=='ok'), null, 1));
  assert.equal(r.resumo.conciliados, 1);
  assert.equal(r.resumo.comDivergencia, 0);
});

test('contrato com dois serviços espera DOIS cards', () => {
  // o caso da Barbara Hellen: um contrato de US$ 1.500 com MOTION + mudança de endereço
  const d = base({
    contratos: [contrato({ servico: 'MOTION', valor: 1500, numParcelas: 2,
      servicos: [{ nome: 'MOTION' }, { nome: 'Mudança de Endereço EOIR' }] })],
    clientes: [cliente()], contas: [parcela(1, { valor: 750 }), parcela(2, { valor: 750 })],
    processos: [ficha({ servico: 'MOTION', checklist: [{ nome: 'Peticao' }] })],
  });
  const r = conciliar(d);
  const falta = achar(r, 'doc.card:Mudança de Endereço EOIR');
  assert.equal(falta.situacao, 'divergencia');
  assert.equal(falta.encontrado, 'nenhum');
  assert.equal(r.resumo.documentacaoPendente, 1);
});

test('tradução marcada como "sem ficha" NÃO cobra card', () => {
  const d = base({
    contratos: [contrato({ servicos: [{ nome: 'Visto T' }, { nome: 'Tradução', semFicha: true }] })],
    clientes: [cliente()], contas: [parcela(1), parcela(2)], processos: [ficha()],
  });
  const r = conciliar(d);
  assert.equal(r.contratos[0].situacao, 'ok');
  assert.equal(servicosQueViramCard({ servicos: [{ nome: 'A' }, { nome: 'B', semFicha: true }] }).length, 1);
});

test('dois cards do mesmo serviço e contrato é crítico', () => {
  const d = tudoCerto();
  d.processos.push(ficha({ id: 'd2' }));
  const r = conciliar(d);
  const v = achar(r, 'doc.card:Visto T');
  assert.equal(v.situacao, 'critico');
  assert.equal(v.encontrado, '2 cards');
  assert.equal(r.resumo.cardsDuplicados, 1);
});

test('financeiro que não fecha com o contrato é crítico, e diz para que lado', () => {
  const d = tudoCerto();
  d.contas = [parcela(1, { valor: 500 }), parcela(2, { valor: 800 })];  // soma 1300, contrato 1000
  const r = conciliar(d);
  const v = achar(r, 'financeiro.valor');
  assert.equal(v.situacao, 'critico');
  assert.equal(v.esperado, 1000);
  assert.equal(v.encontrado, 1300);
  assert.match(v.detalhe, /a MAIS/);
});

test('um centavo de arredondamento não vira divergência', () => {
  const d = tudoCerto();
  d.contratos[0].valor = 1000;
  d.contas = [parcela(1, { valor: 333.33 }), parcela(2, { valor: 333.33 }), parcela(3, { valor: 333.34 })];
  d.contratos[0].numParcelas = 3;
  const r = conciliar(d);
  assert.equal(achar(r, 'financeiro.valor').situacao, 'ok');
});

test('recebido maior que a parcela é crítico', () => {
  const d = tudoCerto();
  d.contas[0] = parcela(1, { valorRecebido: 900, status: 'Pago', dataRecebimento: '2026-11-02' });
  const r = conciliar(d);
  const v = achar(r, 'financeiro.pagamentos');
  assert.equal(v.situacao, 'critico');
  assert.match(v.detalhe, /recebido US\$ 900 numa parcela de US\$ 500/);
});

test('cobrança duplicada: mesma descrição e mesmo vencimento', () => {
  const d = tudoCerto();
  d.contas = [parcela(1), { ...parcela(1), id: 'f1b' }];
  d.contratos[0].valor = 1000;
  const r = conciliar(d);
  const v = achar(r, 'financeiro.duplicado');
  assert.equal(v.situacao, 'critico');
});

test('contrato assinado sem nenhum lançamento: ninguém vai cobrar', () => {
  const d = tudoCerto();
  d.contas = [];
  const r = conciliar(d);
  assert.equal(achar(r, 'financeiro.existe').situacao, 'critico');
});

test('contrato assinado sem cliente cadastrado é crítico', () => {
  const d = tudoCerto();
  d.clientes = [];
  const r = conciliar(d);
  assert.equal(achar(r, 'cliente.cadastro').situacao, 'critico');
});

test('cliente existe mas o contrato não está ligado a ele', () => {
  const d = tudoCerto();
  d.clientes = [cliente({ contratoIds: [] })];
  const r = conciliar(d);
  assert.equal(achar(r, 'cliente.vinculo').situacao, 'divergencia');
});

test('cancelado com parcela a vencer: o cliente pode ser cobrado', () => {
  const d = tudoCerto();
  d.contratos[0].etapa = 'Cancelado';
  const r = conciliar(d);
  const v = achar(r, 'cancelado.parcelas');
  assert.equal(v.situacao, 'critico');
  assert.match(v.detalhe, /US\$ 1000/);
});

test('cancelado com parcela PAGA não acusa — pago é histórico', () => {
  const d = tudoCerto();
  d.contratos[0].etapa = 'Cancelado';
  d.contas = [parcela(1, { status: 'Pago', valorRecebido: 500, dataRecebimento: '2026-11-02' }),
              parcela(2, { status: 'Cancelado' })];
  const r = conciliar(d);
  assert.equal(achar(r, 'cancelado.parcelas').situacao, 'ok');
});

test('cancelado com card ativo ainda aparece na fila de alguém', () => {
  const d = tudoCerto();
  d.contratos[0].etapa = 'Cancelado';
  d.contas = [];
  const r = conciliar(d);
  assert.equal(achar(r, 'cancelado.cards').situacao, 'divergencia');
});

test('card cancelado não conta como ativo', () => {
  const d = tudoCerto();
  d.contratos[0].etapa = 'Cancelado';
  d.contas = [];
  d.processos = [ficha({ situacao: 'cancelado' })];
  const r = conciliar(d);
  assert.equal(achar(r, 'cancelado.cards').situacao, 'ok');
});

test('o mesmo serviço repetido na lista do contrato abriria dois cards iguais', () => {
  const d = tudoCerto();
  d.contratos[0].servicos = [{ nome: 'Visto T' }, { nome: 'visto t' }];
  const r = conciliar(d);
  assert.equal(achar(r, 'contrato.servicos').situacao, 'divergencia');
});

test('card de serviço que o contrato não lista vai para revisão humana', () => {
  const d = tudoCerto();
  d.processos.push(ficha({ id: 'd9', servico: 'MOTION', checklist: [{ nome: 'Peticao' }] }));
  const r = conciliar(d);
  const v = r.contratos[0].verificacoes.find((x) => x.chave === 'doc.sobrando');
  assert.equal(v.situacao, 'revisao');
  assert.match(v.detalhe, /sobra de separação/);
});

test('serviço sem checklist cadastrado pede decisão, não acusa erro', () => {
  const d = tudoCerto();
  d.contratos[0].servico = 'Serviço Novo';
  d.processos = [ficha({ servico: 'Serviço Novo', checklist: [] })];
  const r = conciliar(d);
  assert.equal(achar(r, 'doc.checklist:Serviço Novo').situacao, 'revisao');
});

test('card sem responsável não aparece na fila de ninguém', () => {
  const d = tudoCerto();
  d.processos = [ficha({ responsavel: '' })];
  const r = conciliar(d);
  assert.equal(achar(r, 'doc.responsavel:Visto T').situacao, 'revisao');
});

test('registros soltos: parcela de contrato que não existe, card órfão, cliente repetido', () => {
  const d = tudoCerto();
  d.contas.push({ id: 'fx', contratoId: 'c-que-sumiu', clienteNome: 'Outro', descricao: 'Parcela 1/1', valor: 100 });
  d.contas.push({ id: 'fy', clienteNome: 'Avulso', descricao: 'Serviço extra', valor: 50 });
  d.processos.push({ id: 'dx', clienteNome: 'Sem Contrato', servico: 'Visto T', anexos: [{ nome: 'a' }] });
  d.clientes.push({ id: 'cl2', nome: 'fulana DE tal', contratoIds: [] });
  const r = conciliar(d);
  assert.equal(r.resumo.parcelasSemContrato, 1);
  assert.equal(r.resumo.parcelasAvulsas, 1);
  assert.equal(r.resumo.fichasSemContrato, 1);
  assert.equal(r.resumo.clientesDuplicados, 1);
  assert.equal(r.soltos.fichasSemContrato[0].anexos, 1, 'o órfão com anexo é o que não pode ser apagado sem olhar');
});

test('contrato não assinado não cobra cliente, financeiro nem card', () => {
  const d = base({ contratos: [contrato({ etapa: 'Enviado', dataAssinatura: null })] });
  const r = conciliar(d);
  assert.equal(r.contratos[0].situacao, 'ok');
});

test('assinado sem data de assinatura fica fora da rede de segurança', () => {
  const d = tudoCerto();
  d.contratos[0].dataAssinatura = null;
  const r = conciliar(d);
  assert.equal(achar(r, 'contrato.dataAssinatura').situacao, 'divergencia');
});

test('bloco vazio ou torto não derruba a conciliação', () => {
  assert.equal(conciliar({}).resumo.auditados, 0);
  assert.equal(conciliar({ contratos: 'nada disso' }).resumo.auditados, 0);
  assert.equal(conciliar(undefined).resumo.auditados, 0);
});

test('os três baldes somam o total auditado', () => {
  // painel cujo número não fecha é painel em que ninguém confia
  const d = base({
    contratos: [contrato({ id: 'c1' }), contrato({ id: 'c2', cliente: 'Beltrana' }), contrato({ id: 'c3', cliente: 'Cicrana' })],
    clientes: [cliente(), cliente({ id: 'cl2', nome: 'Beltrana', contratoIds: ['c2'] }),
               cliente({ id: 'cl3', nome: 'Cicrana', contratoIds: ['c3'] })],
    contas: [parcela(1), parcela(2),
             { ...parcela(1), id: 'g1', contratoId: 'c2' }, { ...parcela(2), id: 'g2', contratoId: 'c2' },
             { ...parcela(1), id: 'h1', contratoId: 'c3' }, { ...parcela(2), id: 'h2', contratoId: 'c3' }],
    processos: [ficha(),
                ficha({ id: 'd2', contratoId: 'c2', clienteNome: 'Beltrana', responsavel: '' }),   // só revisão
                ficha({ id: 'd3', contratoId: 'c3', clienteNome: 'Cicrana', checklist: [] })],      // divergência
  });
  const r = conciliar(d);
  const { auditados, conciliados, comDivergencia, aguardandoRevisao } = r.resumo;
  assert.equal(conciliados + comDivergencia + aguardandoRevisao, auditados,
    `não fecha: ${conciliados} + ${comDivergencia} + ${aguardandoRevisao} ≠ ${auditados}`);
  assert.equal(conciliados, 1);
  assert.equal(aguardandoRevisao, 1, 'só falta responsável: é revisão, não divergência');
  assert.equal(comDivergencia, 1, 'checklist vazio com modelo cadastrado: divergência');
});

test('id repetido dentro do bloco é apontado — a mescla apaga um deles em silêncio', () => {
  const d = tudoCerto();
  d.contas.push({ ...parcela(1), descricao: 'Parcela 2/2', vencimento: '2026-12-01' });  // mesmo id f1
  d.processos.push(ficha({ id: 'd1', servico: 'MOTION' }));                               // mesmo id d1
  const r = conciliar(d);
  assert.equal(r.resumo.idsRepetidos, 2);
  const blocos = r.soltos.idsRepetidos.map(x => x.bloco).sort();
  assert.deepEqual(blocos, ['documentação', 'financeiro']);
  assert.equal(r.soltos.idsRepetidos.find(x => x.bloco === 'financeiro').quantos, 2);
});

test('registro sem id é apontado — ele nunca é encontrado pela mescla', () => {
  const d = tudoCerto();
  d.contas.push({ contratoId: 'c1', descricao: 'Avulso', valor: 10 });
  d.clientes.push({ nome: 'Sem Identificador' });
  const r = conciliar(d);
  assert.equal(r.resumo.registrosSemId, 2);
});

test('bloco são não acusa id repetido', () => {
  assert.equal(conciliar(tudoCerto()).resumo.idsRepetidos, 0);
  assert.equal(conciliar(tudoCerto()).resumo.registrosSemId, 0);
});

test('parcela CANCELADA não entra na soma — é cobrança desfeita', () => {
  // Caso real da Jocastra: contrato de US$ 7.000, quatro parcelas pagas e uma
  // fileira de canceladas de US$ 500. Somando tudo dava US$ 12.650 e a
  // conciliação acusava US$ 5.650 "a mais" que não existiam.
  const d = tudoCerto();
  d.contratos[0].valor = 1000;
  d.contas = [
    parcela(1, { valor: 500, status: 'Pago', valorRecebido: 500, dataRecebimento: '2026-11-02' }),
    parcela(2, { valor: 500 }),
    { ...parcela(3), valor: 9000, status: 'Cancelado', descricao: 'Parcela antiga', vencimento: '2026-09-01' },
  ];
  const r = conciliar(d);
  const v = achar(r, 'financeiro.valor');
  assert.equal(v.situacao, 'ok', 'a cancelada de US$ 9.000 não pode entrar na conta');
  assert.equal(v.encontrado, 1000);
});

test('quando sobra diferença, o aviso diz quantas canceladas foram ignoradas', () => {
  const d = tudoCerto();
  d.contas = [parcela(1, { valor: 500 }), parcela(2, { valor: 800 }),
              { ...parcela(3), valor: 300, status: 'Cancelado', descricao: 'Antiga', vencimento: '2026-09-01' }];
  const r = conciliar(d);
  const v = achar(r, 'financeiro.valor');
  assert.equal(v.encontrado, 1300);
  assert.match(v.detalhe, /1 parcela\(s\) cancelada\(s\)/);
});

test('financeiro a MENOS também é apontado, com o texto certo', () => {
  const d = tudoCerto();
  d.contas = [parcela(1, { valor: 500 })];   // contrato 1000
  const r = conciliar(d);
  const v = achar(r, 'financeiro.valor');
  assert.equal(v.situacao, 'critico');
  assert.match(v.detalhe, /a MENOS/);
  assert.match(v.detalhe, /ninguém vai cobrar/);
});

test('a contagem de parcelas também ignora as canceladas', () => {
  const d = tudoCerto();
  d.contratos[0].numParcelas = 2;
  d.contas = [parcela(1), parcela(2),
              { ...parcela(3), status: 'Cancelado', descricao: 'Parcela 3/3', vencimento: '2026-09-01', valor: 0 }];
  const r = conciliar(d);
  const v = r.contratos[0].verificacoes.find(x => x.chave === 'financeiro.parcelas');
  assert.equal(v, undefined, 'duas parcelas vivas para duas combinadas: não há o que apontar');
});

test('entrada lançada como primeira parcela NÃO é divergência quando a soma fecha', () => {
  // Edna Ferreira da Silva: contrato US$ 5.490 com entrada de US$ 500, e no
  // financeiro a primeira parcela é exatamente US$ 500. O dinheiro está certo.
  const d = base({
    contratos: [contrato({ valor: 5490, entrada: 500, numParcelas: 13 })],
    clientes: [cliente()],
    contas: [parcela(1, { descricao: 'Parcela 1/13', valor: 500, status: 'Pago', valorRecebido: 500, dataRecebimento: '2026-01-05' }),
             parcela(2, { descricao: 'Parcela 2/13', valor: 4990 })],
    processos: [ficha()],
  });
  const r = conciliar(d);
  assert.equal(achar(r, 'financeiro.valor').situacao, 'ok');
  assert.equal(achar(r, 'financeiro.entrada'), undefined, 'não pode acusar entrada quando a soma fecha');
  assert.equal(achar(r, 'financeiro.parcelas'), undefined, 'nem a contagem');
  const nota = achar(r, 'financeiro.rotulo');
  assert.equal(nota.situacao, 'ok');
  assert.match(nota.detalhe, /O total fecha com o contrato/);
});

test('mas se a soma NÃO fecha, a entrada e a contagem voltam a ser apontadas', () => {
  const d = base({
    contratos: [contrato({ valor: 5490, entrada: 500, numParcelas: 13 })],
    clientes: [cliente()],
    contas: [parcela(1, { descricao: 'Parcela 1/13', valor: 500 })],   // só 500 de 5490
    processos: [ficha()],
  });
  const r = conciliar(d);
  assert.equal(achar(r, 'financeiro.valor').situacao, 'critico');
  assert.equal(achar(r, 'financeiro.entrada').situacao, 'divergencia');
  assert.equal(achar(r, 'financeiro.parcelas').situacao, 'divergencia');
  assert.equal(achar(r, 'financeiro.rotulo'), undefined);
});

test('contrato sem entrada e com a contagem certa não ganha observação nenhuma', () => {
  const r = conciliar(tudoCerto());
  assert.equal(achar(r, 'financeiro.rotulo'), undefined);
  assert.equal(r.contratos[0].situacao, 'ok');
});
