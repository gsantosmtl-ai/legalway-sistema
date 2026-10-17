#!/usr/bin/env node
// CAMADAS 2, 3, 4 e 6 — Bling · pedidos de venda (233) e contatos (303).
const C = require('./comum.cjs');
const { num, data, cent, txt } = C;
const { lerCsv } = require('./csv.cjs');
const fs = require('fs'); const path = require('path');
const { arq, bloco } = C.instantaneo();

const lerP = f => lerCsv(fs.readFileSync(path.join(C.P, f), 'utf8'));

// ─── PEDIDOS DE VENDA → CONTRATOS ────────────────────────────────────────
// Uma linha por ITEM. Agrupo por número do pedido e somo os itens, que é o
// que vira o valor do contrato.
const ped = lerP('bling/pedidos-de-venda.csv').registros;
const porPedido = new Map();
for (const l of ped) {
  const n = String(l['Número pedido'] || '').trim(); if (!n) continue;
  if (!porPedido.has(n)) porPedido.set(n, { numero: n, comprador: l['Nome Comprador'], data: l['Data'],
    email: l['E-mail Comprador'], telefone: l['Celular Comprador'] || l['Telefone Comprador'], itens: [], total: 0 });
  const p = porPedido.get(n);
  const q = num(l['Quantidade']) || 1;
  const vu = num(l['Valor Unitário'] ?? l['Valor unitário'] ?? l['Valor']) || 0;
  p.itens.push({ produto: l['Produto'], q, vu });
  p.total += q * vu;
}
const pedidos = [...porPedido.values()];
const sit = C.origem('bling/situacao-pedidos.json').situacaoPorPedido || {};
const contratos = bloco('legalway-contratos-v1');

const rC = C.conciliar({
  origem: pedidos, destino: contratos,
  idOrigem: o => String(o.numero), idDestino: p => String(p.pedidoBling || ''),
  campos: [
    ['cliente',   o => txt(o.comprador),      p => txt(p.cliente)],
    ['valor',     o => cent(o.total),         p => cent(num(p.valor))],
    ['data',      o => data(o.data),          p => data(p.dataAssinatura)],
    ['email',     o => txt(o.email),          p => txt(p.email)],
    ['situacao',  o => txt(sit[o.numero]),    p => txt(p.situacaoBling)],
  ],
});
const totalPedidos = pedidos.reduce((s,p)=>s+p.total,0);
const totalContratos = contratos.reduce((s,c)=>s+(num(c.valor)||0),0);

// ─── CONTATOS → CLIENTES ─────────────────────────────────────────────────
const contatos = lerP('bling/contatos.csv').registros;
const clientes = bloco('legalway-clientes-v1');
const rK = C.conciliar({
  origem: contatos, destino: clientes,
  idOrigem: o => String(o['ID']), idDestino: p => String(p.blingId || ''),
  campos: [
    ['nome',     o => txt(o['Nome']),  p => txt(p.nome)],
    ['email',    o => txt(o['E-mail']),p => txt(p.email)],
    ['situacao', o => txt(o['Situação']), p => 'ativo'],
  ],
  regras: [
    { nome: 'situação do Bling não existe no destino', quando: c => c === 'situacao' },
  ],
});
const situacoes = {}; for (const o of contatos) situacoes[o['Situação']||'(vazia)'] = (situacoes[o['Situação']||'(vazia)']||0)+1;
const semBling = clientes.filter(c => !c.blingId);

C.gravar('bling-contratos-contatos.json', { instantaneo: arq,
  contratos: { camada2e3: rC, totalOrigem:+totalPedidos.toFixed(2), totalDestino:+totalContratos.toFixed(2) },
  contatos:  { camada2e3: rK, situacoesNaOrigem: situacoes,
               clientesSemBlingId: semBling.map(c => ({ id:c.id, nome:c.nome, criadoEm:c.criadoEm })) } });

C.imprimir('BLING · PEDIDOS DE VENDA → CONTRATOS', rC, {
  valorTotal: { origem: +totalPedidos.toFixed(2), destino: +totalContratos.toFixed(2) } });
C.imprimir('BLING · CONTATOS → CLIENTES', rK);
console.log('\n   situação dos contatos na origem: ' + JSON.stringify(situacoes));
console.log('   clientes no destino SEM blingId: ' + semBling.length);
for (const c of semBling) console.log('      ' + c.nome);
