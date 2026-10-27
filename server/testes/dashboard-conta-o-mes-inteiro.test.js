// O Peterson conferiu pelo Bling e disse que outubro tinha mais contrato do que
// os 30 que o dashboard mostrava. Tinha mesmo, por dois motivos diferentes:
//
//  1. contrato assinado no mês e CANCELADO depois sumia do cartão, porque a
//     etapa virava 'Cancelado' e o cartão só conta etapa === 'Assinado';
//  2. quatro pedidos de 22 a 24/10 nunca foram importados do Bling (isso é
//     dado, não código — está no plano de sincronização).
//
// Este arquivo cobre o item 1: a conta do cartão, extraída da tela de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/index.html', import.meta.url), 'utf8');

// Reproduz as duas filtragens exatamente como a tela as declara. Se alguém
// mexer na linha, o teste para de achar e reclama — é esse o ponto.
function filtroDaTela(nome) {
  const re = new RegExp('const ' + nome + '\\s*=\\s*contratos\\.filter\\(([\\s\\S]*?)\\);\\n');
  const m = re.exec(tela);
  assert.ok(m, 'não achei a declaração de ' + nome + ' em docs/index.html');
  return m[1];
}

const PERIODO = { dentro: (d) => String(d || '').slice(0, 7) === '2026-10' };
function rodar(corpo, contratos) {
  const assinado = (c) => c.etapa === 'Assinado' && c.dataAssinatura;
  // eslint-disable-next-line no-new-func
  const fn = new Function('contratos', 'P', 'assinado', 'return contratos.filter(' + corpo + ');');
  return fn(contratos, PERIODO, assinado);
}

const BASE = [
  { id: 'a', etapa: 'Assinado',  dataAssinatura: '2026-10-05', valor: 5490 },
  { id: 'b', etapa: 'Assinado',  dataAssinatura: '2026-10-22', valor: 1300 },
  { id: 'c', etapa: 'Cancelado', dataAssinatura: '2026-10-19', valor: 6490 }, // assinado em out., cancelado depois
  { id: 'd', etapa: 'Cancelado', dataAssinatura: '2026-07-02', valor: 2500 }, // cancelado, mas de julho
  { id: 'e', etapa: 'Assinado',  dataAssinatura: '2026-09-28', valor: 5490 }, // setembro
  { id: 'f', etapa: 'Aguardando assinatura', dataAssinatura: '', valor: 800 },
  { id: 'g', etapa: 'Cancelado', valor: 999 },                                 // sem data nenhuma
];

test('o cartão de assinados continua contando só os assinados do mês', () => {
  const r = rodar(filtroDaTela('contratosMes'), BASE).map(c => c.id);
  assert.deepEqual(r, ['a', 'b']);
});

test('o que foi assinado no mês e cancelado depois é CONTADO à parte, não some', () => {
  // Era aqui que o número ficava menor que o do Bling: o contrato existiu,
  // entrou em outubro, e o dashboard fazia de conta que não.
  const r = rodar(filtroDaTela('canceladosNoPeriodo'), BASE);
  assert.deepEqual(r.map(c => c.id), ['c'], 'só o que foi assinado DENTRO do período');
  assert.equal(r.reduce((s, c) => s + c.valor, 0), 6490);
});

test('cancelado de outro mês não é puxado para dentro do período', () => {
  const r = rodar(filtroDaTela('canceladosNoPeriodo'), BASE).map(c => c.id);
  assert.ok(!r.includes('d'), 'julho não é outubro');
});

test('cancelado sem data de assinatura fica de fora, em vez de cair no mês corrente', () => {
  // Sem data não dá para dizer de que mês é. Chutar o mês atual inflaria
  // outubro com contrato de qualquer época.
  const r = rodar(filtroDaTela('canceladosNoPeriodo'), BASE).map(c => c.id);
  assert.ok(!r.includes('g'));
});

test('a tela mostra esse número ao lado dos assinados', () => {
  // Sem isto a conta existe e ninguém vê — que é o mesmo que não existir.
  assert.match(tela, /canceladosNoPeriodo\.length \?/,
    'o cartão de assinados precisa exibir os assinados-e-cancelados do período');
  assert.match(tela, /valorCanceladoNoPeriodo/,
    'o valor também: contrato cancelado é dinheiro que deixou de entrar');
});

test('o cartão de cancelados do lado continua sendo o TOTAL, não o do período', () => {
  // A data de cancelamento veio da importação do Bling e não é confiável;
  // filtrar aquele cartão por mês diria uma mentira. São dois números
  // diferentes de propósito.
  const corpo = filtroDaTela('cancelados');
  assert.doesNotMatch(corpo, /P\.dentro|P\.anterior/);
});
