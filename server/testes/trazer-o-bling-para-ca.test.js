// Trazer do Bling o que mudou depois que o registro já existia aqui.
//
// O relato dela, repetido com oito clientes: "pagou no bling e no liv nao esta
// atualizado". Camila Neves, Claudemir Lobo, Julia Maria, Rogerio Gomides…
//
// A causa não era de cada cliente: o sistema nunca teve por onde receber isso.
// A importação do Bling só enxerga o que é INÉDITO — contrato e parcela que
// ainda não existem aqui. Parcela que foi PAGA depois de entrar, contrato
// cancelado lá, vencimento remarcado: nada disso chegava, e o sistema seguia
// cobrando quem já tinha pagado.
//
// A comparação existia e era boa; faltava a outra metade — a rota que aplica, e
// a tela onde clicar.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { divergenciasDoBling } from '../src/sincronizacao.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const rotas = readFileSync(join(AQUI, '../src/sinc-rotas.js'), 'utf8');
const tela = readFileSync(join(AQUI, '../../docs/bling.html'), 'utf8');

const contrato = { id: 'c1', cliente: 'Rogerio Gomides', pedidoBling: '200', valor: 3000, etapa: 'Assinado' };
const parcela = (extra) => ({ id: 'f1', contratoId: 'c1', blingId: '9001', clienteNome: 'Rogerio Gomides',
  descricao: 'Parcela 3/9', valor: 332.67, vencimento: '2026-10-22', status: 'Atrasado', valorRecebido: 0, ...extra });
const contaBling = (extra) => ({ pedido: '200', blingId: '9001', vencimento: '22/10/2026',
  valor: 332.67, pago: 332.67, situacao: 'pago', forma: 'Stripe', ...extra });

test('paga no Bling e em aberto aqui é informação que falta, não conflito', () => {
  const d = divergenciasDoBling({ pedidos: [{ numero: '200', valor: 3000, situacao: 'atendido' }],
    contas: [contaBling()], contratos: [contrato], financeiro: [parcela()] });
  const achado = d.aplicavel.find(x => x.tipo === 'parcela.paga');
  assert.ok(achado, 'a parcela paga no Bling deveria estar no balde aplicável');
  assert.strictEqual(achado.cliente, 'Rogerio Gomides');
  assert.strictEqual(d.resumo.pagamentosQueFaltam, 1);
  assert.strictEqual(d.resumo.dinheiroQueFalta, 332.67);
});

// O contrário NUNCA é automático: alguém baixou à mão aqui e o Bling não sabe.
// Sobrescrever apagaria o trabalho dessa pessoa.
test('paga aqui e aberta no Bling vai para revisão, nunca para aplicar', () => {
  const d = divergenciasDoBling({ pedidos: [{ numero: '200', valor: 3000 }],
    contas: [contaBling({ pago: 0, situacao: 'aberto' })], contratos: [contrato],
    financeiro: [parcela({ status: 'Pago', valorRecebido: 332.67 })] });
  assert.strictEqual(d.aplicavel.filter(x => x.tipo === 'parcela.pagaSoAqui').length, 0);
  assert.ok(d.revisar.some(x => x.tipo === 'parcela.pagaSoAqui'),
    'baixa feita à mão aqui tem que esperar alguém olhar');
});

test('valores que não batem dos dois lados vão para revisão', () => {
  const d = divergenciasDoBling({ pedidos: [{ numero: '200', valor: 3000 }],
    contas: [contaBling({ pago: 200 })], contratos: [contrato],
    financeiro: [parcela({ status: 'Pago', valorRecebido: 332.67 })] });
  assert.ok(d.revisar.some(x => x.tipo === 'parcela.valorPago'));
  assert.strictEqual(d.resumo.pagamentosQueFaltam, 0);
});

// --- A rota que aplica ---

test('a rota aplica só o balde aplicável', () => {
  const i = rotas.indexOf("'/sinc/bling/aplicar-divergencias'");
  assert.ok(i > 0, 'a rota que aplica as divergências não existe');
  const corpo = rotas.slice(i, rotas.indexOf('// ----', i));
  assert.ok(/d\.aplicavel\.filter/.test(corpo), 'a rota não parte do balde aplicável');
  assert.ok(!/d\.revisar\.filter|for \(const x of d\.revisar\)/.test(corpo),
    'a rota passou a aplicar o balde que precisa de gente olhando');
});

// Refazer a conta no servidor é o que impede aplicar o que a tela viu minutos
// atrás, quando outra pessoa já pode ter baixado a mesma parcela.
test('a rota recalcula as divergências na hora de aplicar', () => {
  const i = rotas.indexOf("'/sinc/bling/aplicar-divergencias'");
  const corpo = rotas.slice(i, rotas.indexOf('// ----', i));
  assert.ok(/const d = divergenciasDoBling\(/.test(corpo),
    'a rota precisa recalcular, não confiar no que a tela mandou');
  assert.ok(/so: \[/.test(tela) || /so: marcadas/.test(tela),
    'a tela deveria mandar só QUAIS linhas, não os valores');
});

test('não remarca vencimento de parcela já paga', () => {
  const i = rotas.indexOf("'/sinc/bling/aplicar-divergencias'");
  const corpo = rotas.slice(i, rotas.indexOf('// ----', i));
  const j = corpo.indexOf("parcela.vencimento");
  assert.ok(/f\.status === 'Pago' \|\| Number\(f\.valorRecebido \|\| 0\) > 0/.test(corpo.slice(j, j + 400)),
    'remarcar vencimento de parcela paga reescreveria história');
});

test('não reduz valor já recebido nem apaga nada', () => {
  const i = rotas.indexOf("'/sinc/bling/aplicar-divergencias'");
  const corpo = rotas.slice(i, rotas.indexOf('// ----', i));
  assert.ok(!/\.splice\(|delete f\.|= \[\]/.test(corpo), 'a rota não pode remover registro nenhum');
  assert.ok(/if \(!f \|\| f\.status === 'Pago'\) continue;/.test(corpo),
    'parcela que já está paga aqui não pode ser reescrita');
});

// --- A tela ---

test('a tela diz o que falta quando o Bling não está autorizado', () => {
  assert.ok(/sinc\/bling\/autorizar/.test(tela), 'a tela precisa levar à autorização');
  assert.ok(/falta autorizar o bling/i.test(tela), 'a tela precisa explicar que falta autorizar');
});

test('a tela nunca aplica sozinha', () => {
  assert.ok(/confirm\(/.test(tela), 'aplicar sem confirmar mexe em dinheiro sem perguntar');
  assert.ok(!/mostrarEstado\(\);[\s\S]{0,80}aplicar\(\)/.test(tela),
    'a tela não pode aplicar nada ao abrir');
});
