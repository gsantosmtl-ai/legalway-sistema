// "Entrada Lead — Filtro que mostra (no funil) - esta aparecendo de todo mundo
// e nao somente do usuario."
//
// O Renato abria a Entrada de Leads, clicava em "No Funil" e via o funil do
// escritório inteiro — o dele e o do Adriano misturados. Os chips filtravam só
// por status, nunca por responsável.
//
// O modelo de permissões do sistema é nenhum/visualizar/editar mais
// `acessoTotal` — não existe "só os meus". Então a tela passou a abrir já
// filtrada no nome de quem entrou, com a opção de ver todos à mão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tela = readFileSync(new URL('../../docs/entrada-leads.html', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const ini = tela.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = tela.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < tela.length; i++) { if (tela[i] === '{') nivel++; else if (tela[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return tela.slice(ini, fim);
}

test('o filtro de responsável existe na barra', () => {
  assert.match(tela, /<select id="filtro-responsavel">/);
  assert.match(tela, /getElementById\('filtro-responsavel'\)\.addEventListener\('change'/,
    'e muda a lista ao trocar');
});

test('a lista filtra por responsável', () => {
  const corpo = corpoDe('function listaFiltrada()');
  assert.match(corpo, /filtroResponsavel!=='todos'\) lista = lista\.filter\(l=>donoDoLead\(l\)===filtroResponsavel\)/);
});

// Roda popularFiltros de verdade, com dublês, e diz em que nome a tela abriu.
function abrirComo(sessaoFalsa, donosDosLeads) {
  const selResp = { innerHTML: '', value: '' };
  const outros = { innerHTML: '', value: '' };
  const ctx = {
    sessao: sessaoFalsa,
    leads: donosDosLeads.map((d, i) => ({ id: 'l' + i, dono: d })),
    filtroResponsavel: 'todos', jaEscolhiResponsavel: false,
    donoDoLead: (l) => l.dono,
    statusDoLead: () => 'Lead Assumido',
    ORIGEM_INFO: {},
    LW: { escaparHtml: (x) => String(x) },
    document: { getElementById: (id) => id === 'filtro-responsavel' ? selResp : outros },
  };
  vm.createContext(ctx);
  new vm.Script(corpoDe('function popularFiltros()') + '\npopularFiltros();').runInContext(ctx);
  return { escolhido: ctx.filtroResponsavel, html: selResp.innerHTML, valorDoSelect: selResp.value };
}

test('vendedor sem acesso total abre no próprio nome', () => {
  const r = abrirComo({ nome: 'Renato', acessoTotal: false }, ['Renato', 'Adriano', 'Renato']);
  assert.equal(r.escolhido, 'Renato', 'era este o problema do Renato');
  assert.equal(r.valorDoSelect, 'Renato');
});

test('quem tem acesso total abre vendo todos', () => {
  const r = abrirComo({ nome: 'Tatiane', acessoTotal: true }, ['Renato', 'Adriano']);
  assert.equal(r.escolhido, 'todos', 'ela precisa ver o escritório inteiro');
});

test('o próprio nome aparece na lista mesmo sem lead nenhum ainda', () => {
  const r = abrirComo({ nome: 'Renato', acessoTotal: false }, ['Adriano']);
  assert.match(r.html, /Renato \(eu\)/);
  assert.equal(r.escolhido, 'Renato');
});

test('a escolha do usuário sobrevive à recarga ao vivo', () => {
  // A tela se redesenha sozinha quando outro usuário grava algo. Sem a trava,
  // quem escolheu "Todos" voltaria para o próprio nome no meio do trabalho.
  const ctx = {
    sessao: { nome: 'Renato', acessoTotal: false },
    leads: [{ dono: 'Renato' }, { dono: 'Adriano' }],
    filtroResponsavel: 'todos', jaEscolhiResponsavel: true,   // ele já escolheu
    donoDoLead: (l) => l.dono, statusDoLead: () => 'x', ORIGEM_INFO: {},
    LW: { escaparHtml: (x) => String(x) },
    document: { getElementById: () => ({ innerHTML: '', value: '' }) },
  };
  vm.createContext(ctx);
  new vm.Script(corpoDe('function popularFiltros()') + '\npopularFiltros();').runInContext(ctx);
  assert.equal(ctx.filtroResponsavel, 'todos', 'não pode voltar para o nome dele sozinho');
});

test('"Limpar filtros" não vira "ver o de todo mundo"', () => {
  const i = tela.indexOf("getElementById('limpar-filtros')");
  const corpo = tela.slice(i, i + 900);
  assert.match(corpo, /filtroResponsavel = \(sessao && sessao\.nome && !sessao\.acessoTotal\) \? sessao\.nome : 'todos'/);
});
