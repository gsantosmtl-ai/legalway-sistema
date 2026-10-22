// O painel "Fechados no mês" conta contrato assinado por vendedor. Nenhum dos contratos de
// outubro nasceu no funil (vieram da importação), então a conta é pelo nome do vendedor no
// contrato — e a data vem em dois formatos no banco real: '2026-10-20' e ISO com hora.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');
function extrair(nome){
  const ini = html.indexOf('function ' + nome + '(');
  assert.ok(ini > 0, 'não achei ' + nome);
  let i = html.indexOf('{', ini), nivel = 0;
  for(; i < html.length; i++){
    if(html[i] === '{') nivel++;
    else if(html[i] === '}'){ nivel--; if(nivel === 0) return html.slice(ini, i + 1); }
  }
  throw new Error('chaves abertas em ' + nome);
}

const CONTRATOS = [
  { cliente:'Cleber',  vendedor:'Renato',  valor:5990, etapa:'Assinado',  dataAssinatura:'2026-10-19' },
  { cliente:'Maria',   vendedor:'Renato',  valor:6100, etapa:'Assinado',  dataAssinatura:'2026-10-21T16:29:17.590Z' },
  { cliente:'Fábio',   vendedor:'Adriano', valor:5490, etapa:'Assinado',  dataAssinatura:'2026-10-20' },
  { cliente:'Desistiu',vendedor:'Renato',  valor:9000, etapa:'Cancelado', dataAssinatura:'2026-10-05' },
  { cliente:'Setembro',vendedor:'Renato',  valor:4000, etapa:'Assinado',  dataAssinatura:'2026-09-30' },
  { cliente:'A gerar', vendedor:'Renato',  valor:7000, etapa:'A gerar',   dataAssinatura:null },
];

function rodar(vendedor){
  const ctx = { contratos: CONTRATOS, now: () => new Date('2026-10-22T12:00:00Z') };
  vm.createContext(ctx);
  new vm.Script(extrair('mesCorrente') + '\n' + extrair('fechadosNoMes')
    + `\nvar r = fechadosNoMes(${JSON.stringify(vendedor)});`).runInContext(ctx);
  return ctx.r;
}

test('conta só os assinados do mês corrente', () => {
  assert.deepEqual(rodar('').map(c => c.cliente), ['Cleber', 'Maria', 'Fábio']);
});

test('contrato cancelado não entra', () => {
  assert.ok(!rodar('').some(c => c.cliente === 'Desistiu'), 'contou um contrato cancelado');
});

test('assinatura de outro mês não entra', () => {
  assert.ok(!rodar('').some(c => c.cliente === 'Setembro'), 'contou assinatura de setembro');
});

test('contrato sem assinatura não entra', () => {
  assert.ok(!rodar('').some(c => c.cliente === 'A gerar'), 'contou contrato ainda não assinado');
});

test('as duas formas de data funcionam', () => {
  // '2026-10-19' e '2026-10-21T16:29:17.590Z' convivem no banco real.
  const nomes = rodar('Renato').map(c => c.cliente);
  assert.deepEqual(nomes, ['Cleber', 'Maria']);
});

test('filtra pelo vendedor do funil aberto', () => {
  assert.deepEqual(rodar('Adriano').map(c => c.cliente), ['Fábio']);
  assert.deepEqual(rodar('Ninguém'), []);
});

test('o total em dinheiro é a soma dos valores', () => {
  const soma = rodar('Renato').reduce((s, c) => s + Number(c.valor || 0), 0);
  assert.equal(soma, 12090);
});

// ---- Os contratos como cards na coluna Ganho ----
// A Tatiane abriu o funil do Renato, viu "16 contratos · US$ 88.090" na faixa e a coluna
// Ganho zerada. Os dois estão certos: a faixa lê contratos, a coluna lia só cards. Agora
// a coluna mostra o contrato que não tem card — que são quase todos, vindos da importação.
function rodarGanhosSemCard(contratos, leads, tab, vendedor){
  const ctx = {
    contratos, leads, currentTab: tab,
    vendedorDoFunilAtual: () => vendedor,
    now: () => new Date('2026-10-22T12:00:00Z'),
  };
  vm.createContext(ctx);
  new vm.Script(extrair('mesCorrente') + '\n' + extrair('fechadosNoMes') + '\n' + extrair('ganhosSemCard')
    + '\nvar r = ganhosSemCard();').runInContext(ctx);
  return ctx.r;
}

test('contrato sem card no funil vira card na coluna Ganho', () => {
  const r = rodarGanhosSemCard(CONTRATOS, [], 'v:Renato', 'Renato');
  assert.deepEqual(r.map(c => c.cliente), ['Maria', 'Cleber'], 'mais recente primeiro');
});

test('contrato que JÁ tem card no funil não aparece duas vezes', () => {
  // Quando o Ganho passar a criar contrato pelo funil, o card do lead já está lá.
  const contratoComCard = { ...CONTRATOS[0], id: 'c-ligado' };
  const leads = [{ id: 'l1', nome: 'Cleber', etapa: 'Ganho', contratoGeradoId: 'c-ligado' }];
  const r = rodarGanhosSemCard([contratoComCard], leads, 'v:Renato', 'Renato');
  assert.deepEqual(r, [], 'o contrato já tinha card e foi duplicado na coluna');
});

test('na Visão Geral aparecem os de todo mundo', () => {
  const r = rodarGanhosSemCard(CONTRATOS, [], 'geral', 'Renato');
  assert.deepEqual(r.map(c => c.cliente), ['Maria', 'Fábio', 'Cleber']);
});

test('o card do contrato não arrasta e aponta para Contratos', () => {
  const html = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');
  const card = extrair('renderCardContrato');
  assert.ok(!/draggable/.test(card), 'contrato fechado não deveria ser arrastável');
  assert.match(card, /data-contrato=/, 'o card precisa carregar o id do contrato');
  assert.match(html, /data-contrato'\);\s*if\(contratoId\)\{[\s\S]{0,200}contratos\.html\?abrir=/,
    'clicar no card do contrato deveria abrir a tela de Contratos');
});

test('a coluna Ganho realmente usa os contratos, não só a função', () => {
  // Ter a função certa não adianta se o quadro não chamar. Este teste existe porque a
  // primeira versão passava com a coluna montada sem contrato nenhum.
  const html = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');
  assert.match(html, /const contratosDaColuna = ganha \? ganhosSemCard\(\) : \[\]/,
    'a coluna Ganho deveria buscar os contratos do mês');
  assert.match(html, /contratosDaColuna\.map\(renderCardContrato\)/,
    'os contratos deveriam virar cards dentro da coluna');
  assert.match(html, /inStage\.length \+ contratosDaColuna\.length/,
    'a contagem no topo da coluna precisa somar os contratos');
  assert.match(html, /contratosDaColuna\.reduce\(/,
    'o valor no topo da coluna precisa somar os contratos');
});

// ---- "Todos os ganhos" ----
// A coluna Ganho mostra só o mês, para o vendedor enxergar o próprio ritmo. Mas o que ele
// já fechou é dele: a faixa abre a lista completa, de qualquer mês, sem sair do funil.
function rodarTodos(vendedor){
  const ctx = { contratos: CONTRATOS };
  vm.createContext(ctx);
  new vm.Script(extrair('todosOsGanhos') + `\nvar r = todosOsGanhos(${JSON.stringify(vendedor)});`).runInContext(ctx);
  return ctx.r;
}

test('todos os ganhos passam do mês corrente', () => {
  const nomes = rodarTodos('Renato').map(c => c.cliente);
  assert.ok(nomes.includes('Setembro'), 'a lista completa deveria incluir meses anteriores');
  assert.deepEqual(nomes.sort(), ['Cleber', 'Maria', 'Setembro']);
});

test('todos os ganhos continuam sem cancelado e sem não-assinado', () => {
  const nomes = rodarTodos('Renato').map(c => c.cliente);
  assert.ok(!nomes.includes('Desistiu'), 'contrato cancelado entrou na lista completa');
  assert.ok(!nomes.includes('A gerar'), 'contrato sem assinatura entrou na lista completa');
});

test('a lista completa filtra por vendedor', () => {
  assert.deepEqual(rodarTodos('Adriano').map(c => c.cliente), ['Fábio']);
  assert.equal(rodarTodos('').length, 4, 'sem vendedor, traz os de todo mundo');
});

test('a faixa oferece os dois modos e as linhas abrem o contrato', () => {
  const html = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');
  assert.match(html, /id="btn-fechados-todos"/, 'falta o botão de ver todos os ganhos');
  assert.match(html, /fechadosModo === 'todos' \? fmtDataLonga/,
    'na lista completa a data precisa do ano — "12/03" não diz de que ano é');
  assert.match(html, /data-abrir-contrato=/, 'as linhas da lista precisam carregar o id do contrato');
  assert.match(html, /\[data-abrir-contrato\][\s\S]{0,300}contratos\.html\?abrir=/,
    'a tela promete que clicar no nome abre o contrato — tem que abrir');
});
