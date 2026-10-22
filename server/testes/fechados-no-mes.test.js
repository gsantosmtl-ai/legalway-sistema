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
