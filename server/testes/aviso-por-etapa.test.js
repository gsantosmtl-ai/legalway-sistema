// "A ideia é ter as mensagens automáticas, que o sistema fará."
//
// Os doze gatilhos que já existiam disparam por EVENTO (protocolou, pagou,
// reunião chegando) ou por TEMPO (semanal, a cada N dias). Nenhum disparava
// por ETAPA — e era esse o pedido: "só para quem está no funil de documentos /
// que não faz processo externo / que está na etapa de recebendo documentações".
//
// Mensagem automática é o que mais assusta: ninguém aperta o botão, então o
// erro vira mensagem enviada antes de alguém perceber. Por isso a maior parte
// destes testes é sobre NÃO disparar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';
const { GATILHOS } = await import('../src/avisos-automaticos.js');

const G = GATILHOS.etapaDocumentos;
const C = GATILHOS.etapaComercial;
const proc = (e) => ({ id: 'p1', clienteNome: 'Ana Paula', status: 'Recebendo documentos',
  telefone: '+1 407 555 0101', servico: 'Visto T', ...e });

test('os dois gatilhos novos existem e seguem o contrato dos outros', () => {
  for (const [k, g] of [['etapaDocumentos', G], ['etapaComercial', C]]) {
    assert.ok(g, k + ' não existe');
    for (const campo of ['nome', 'sobre', 'quando', 'setorSugerido', 'ajuda', 'chaves', 'padrao', 'candidatos']) {
      assert.ok(g[campo] !== undefined, `${k} sem ${campo}`);
    }
    assert.equal(typeof g.candidatos, 'function');
  }
  // `sobre` decide qual bloco o servidor carrega. Marcar o de documentação
  // como 'lead' faria ler milhares de leads a cada minuto por nada.
  assert.equal(G.sobre, 'processo');
  assert.equal(C.sobre, 'lead');
});

// ----------------------------------------------------------- não disparar
test('SEM etapa escolhida não dispara para ninguém', () => {
  // É a trava mais importante. Um aviso ligado e sem etapa não pode virar
  // "manda para a base inteira" — que é exatamente o acidente possível aqui.
  assert.deepEqual(G.candidatos({ processos: [proc(), proc({ id: 'p2' })] }, {}), []);
  assert.deepEqual(G.candidatos({ processos: [proc()] }, { etapa: '   ' }), []);
  // E o caso que prova a trava de verdade: processo com etapa em branco.
  // Sem a trava, "nenhuma etapa escolhida" casaria com "etapa vazia" e o
  // aviso sairia para registros pela metade — que existem na base.
  assert.deepEqual(G.candidatos({ processos: [proc({ status: '' })] }, {}), []);
  assert.deepEqual(G.candidatos({ processos: [proc({ status: '  ' })] }, { etapa: '' }), []);
  assert.deepEqual(C.candidatos({ leads: [{ id: 'l1', nome: 'X', etapa: 'Ganho', telefone: '1' }] }, {}), []);
});

test('quem está em OUTRA etapa não recebe', () => {
  const r = G.candidatos({ processos: [
    proc({ id: 'p1', clienteNome: 'Fica', status: 'Recebendo documentos' }),
    proc({ id: 'p2', clienteNome: 'Sai', status: 'Protocolado' }),
  ] }, { etapa: 'Recebendo documentos' });
  assert.deepEqual(r.map(x => x.valores.cliente), ['Fica']);
});

test('"só interno" não alcança quem é tocado por escritório de fora', () => {
  const r = G.candidatos({ processos: [
    proc({ id: 'p1', clienteNome: 'Casa' }),
    proc({ id: 'p2', clienteNome: 'Fora', execucao: { tipo: 'externo', escritorio: 'Parceiro' } }),
  ] }, { etapa: 'Recebendo documentos', execucao: 'interno' });
  assert.deepEqual(r.map(x => x.valores.cliente), ['Casa']);
});

test('processo sem marcação conta como interno, como nas telas', () => {
  // Decisão dela: o padrão é Legal Way. Se o sem-marcação caísse fora, o
  // aviso "só interno" não alcançaria quase ninguém — e ninguém notaria,
  // porque não disparar não dá erro.
  const r = G.candidatos({ processos: [proc()] }, { etapa: 'Recebendo documentos', execucao: 'interno' });
  assert.equal(r.length, 1);
});

test('sem filtro de execução, os dois tipos recebem', () => {
  const r = G.candidatos({ processos: [
    proc({ id: 'p1' }), proc({ id: 'p2', execucao: { tipo: 'externo', escritorio: 'P' } }),
  ] }, { etapa: 'Recebendo documentos' });
  assert.equal(r.length, 2);
});

// ----------------------------------------------------------- repetição
test('a etapa entra na chave: não repete a cada ciclo', () => {
  // Sem isto o aviso sairia de minuto em minuto enquanto a pessoa estivesse
  // na etapa. É o pesadelo clássico de automação de mensagem.
  const [x] = G.candidatos({ processos: [proc()] }, { etapa: 'Recebendo documentos' });
  assert.equal(x.chaveUnica, 'etapa:recebendo documentos');
});

test('no comercial, voltar para a mesma etapa dispara de novo', () => {
  // Diferente da documentação de propósito: no funil, o lead voltar para
  // "Negociação" é um novo momento de venda, não repetição.
  const base = { id: 'l1', nome: 'Ana', etapa: 'Negociação/Fechamento', telefone: '1' };
  const [a] = C.candidatos({ leads: [{ ...base, entradaEtapa: '2026-10-01' }] }, { etapa: 'Negociação/Fechamento' });
  const [b] = C.candidatos({ leads: [{ ...base, entradaEtapa: '2026-10-20' }] }, { etapa: 'Negociação/Fechamento' });
  assert.notEqual(a.chaveUnica, b.chaveUnica, 'entrada nova, chave nova');
  assert.match(a.chaveUnica, /^etapa:negociação\/fechamento:/);
});

// ----------------------------------------------------------- o texto
test('o modelo só usa variáveis que o gatilho entrega', () => {
  // Uma variável a mais no texto chegaria no cliente como "{vendedor}".
  for (const g of [G, C]) {
    const usadas = [...g.padrao.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    for (const v of usadas) {
      assert.ok(g.chaves.includes(v) || v === 'empresa',
        `${g.nome}: o modelo usa {${v}} mas o gatilho não entrega`);
    }
  }
});

test('a etapa escrita pela pessoa é a que aparece na mensagem', () => {
  // Se a tela gravar "recebendo DOCUMENTOS", o cliente não pode ler isso.
  const [x] = G.candidatos({ processos: [proc()] }, { etapa: 'Recebendo documentos' });
  assert.equal(x.valores.etapa, 'Recebendo documentos');
  assert.equal(x.valores.cliente, 'Ana', 'trata a pessoa pelo primeiro nome');
});

test('maiúscula e minúscula não impedem o encontro', () => {
  const r = G.candidatos({ processos: [proc({ status: 'recebendo documentos' })] },
    { etapa: 'Recebendo Documentos' });
  assert.equal(r.length, 1);
});

test('o telefone vai junto — sem ele não há para quem enviar', () => {
  const [x] = G.candidatos({ processos: [proc()] }, { etapa: 'Recebendo documentos' });
  assert.equal(x.telefone, '+1 407 555 0101');
  assert.equal(x.onde, 'processo');
  assert.ok(x.alvo, 'o registro vai junto, para o histórico ser escrito nele');
});

// ------------------------------------------------- documentos: os três grupos
test('o follow-up diz o que CHEGOU, o que falta e o que foi recusado', () => {
  // Pedido dela: "tem um que é o documento sendo entregue — já recebemos esse
  // documento, estamos aguardando esse que ainda está pendente."
  //
  // E o terceiro grupo apareceu no caminho: o documento marcado "Incorreto"
  // com arquivo anexado não entrava em "faltam" (porque tem arquivo) nem em
  // "recebidos" (porque vai ter que vir de novo). Ficava invisível — e é
  // justamente o que mais precisa de ação do cliente.
  const g = GATILHOS.documentosPendentes;
  const p = { id: 'p1', clienteNome: 'Ana Paula', servico: 'Visto T', telefone: '+1 407 555 0101',
    checklist: [
      { nome: 'Passaporte', status: 'Aprovado', arquivo: 'a.pdf' },
      { nome: 'Certidão', status: 'Recebido', arquivo: 'b.pdf' },
      { nome: 'Comprovante', status: 'Incorreto', arquivo: 'c.pdf' },
      { nome: 'Foto 2x2', status: 'Solicitado' },
      { nome: 'I-914', status: 'Não solicitado', interno: true },
    ] };
  const [c] = g.candidatos({ processos: [p] }, {}, { data: '2026-10-27' });
  assert.equal(c.valores.quantosRecebidos, '2');
  assert.equal(c.valores.quantidade, '1', 'só a Foto está realmente faltando');
  assert.equal(c.valores.quantosRecusados, '1');
  assert.match(c.valores.recusados, /Comprovante/);
  assert.doesNotMatch(c.valores.recebidos, /Comprovante/, 'recusado não é "recebido"');
  assert.doesNotMatch(c.valores.recebidos, /I-914/, 'formulário interno não é do cliente');
});

test('sem nenhum recebido, a lista não sai em branco no meio do texto', () => {
  const g = GATILHOS.documentosPendentes;
  const [c] = g.candidatos({ processos: [{ id: 'p1', clienteNome: 'Ana', telefone: '1',
    checklist: [{ nome: 'Passaporte', status: 'Solicitado' }] }] }, {}, { data: '2026-10-27' });
  assert.equal(c.valores.recebidos, '—');
  assert.equal(c.valores.quantosRecebidos, '0');
});

// ------------------------------------------------- financeiro: qual parcela
test('a parcela se identifica mesmo quando veio do Bling', () => {
  // 949 das 3.911 parcelas (24%) têm `descricao` vazia: o texto mora em
  // `observacao`. Sem a queda de um campo para o outro, uma em cada quatro
  // mensagens do financeiro sairia com um buraco no lugar da parcela.
  const g = GATILHOS.cobrancaPaga;
  assert.ok(g.chaves.includes('parcela'));
  assert.match(g.padrao, /\{parcela\}/, 'o texto padrão precisa dizer QUAL parcela');
  assert.match(GATILHOS.parcelaVencendo.padrao, /\{parcela\}/);

  const fonte = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');
  const m = /const nomeDaParcela = \(f\) =>([\s\S]*?);\n/.exec(fonte);
  assert.ok(m, 'não achei a função que nomeia a parcela');
  assert.match(m[1], /descricao/);
  assert.match(m[1], /observacao/, 'sem a queda para observacao, 24% saem em branco');
  assert.doesNotMatch(fonte, /parcela: f\.descricao \|\| ''/,
    'nenhum gatilho pode mais ler descricao cru');
});
import { readFileSync } from 'node:fs';
