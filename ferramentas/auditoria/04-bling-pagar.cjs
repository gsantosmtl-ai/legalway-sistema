#!/usr/bin/env node
// CAMADAS 2, 3 e 6 — Bling · contas a pagar · 533 títulos, um a um.
const C = require('./comum.cjs');
const { num, data, cent, txt } = C;
const { arq, bloco } = C.instantaneo();
const fonte = C.origem('bling/bling-financeiro.json');
const origem = [...fonte.dados.pagarAberto, ...fonte.dados.pagarPago];
const destino = bloco('legalway-contas-pagar-v1');

const r = C.conciliar({
  origem, destino,
  idOrigem: o => String(o.id), idDestino: p => String(p.blingId || ''),
  campos: [
    ['valor',          o => cent(num(o.valor)),        p => cent(num(p.valor))],
    ['vencimento',     o => data(o.vencimento),        p => data(p.vencimento)],
    ['situacao',       o => (o.situacao||'').toLowerCase()==='pago' ? 'pago' : 'aberto',
                       p => /pago/i.test(p.status||'') ? 'pago' : 'aberto'],
    ['valorPago',      o => cent(num(o.valorPago)),    p => cent(num(p.valorPago))],
    ['dataPagamento',  o => data(o.liquidacao),        p => data(p.dataPagamento)],
    ['fornecedor',     o => txt(o.nome),               p => txt(p.fornecedor)],
    ['descricao',      o => txt(o.observacoes),        p => txt(p.descricao)],
    ['formaPagamento', o => txt(o.descricaoFormaPagamento), p => txt(p.formaPagamento)],
    ['categoria',      o => txt(o.categoria),          p => txt(p.categoria)],
  ],
  regras: [
    { nome: 'não pago: null ≡ 0', quando: (c,a,b,o) => c==='valorPago'
        && (o.situacao||'').toLowerCase()!=='pago' && (a==null||a===0) && (b==null||b===0) },
  ],
});

const somaO = l => l.reduce((s,o)=>s+(num(o.valor)||0),0);
const somaD = l => l.reduce((s,p)=>s+(num(p.valor)||0),0);
const pagoO = origem.filter(o=>(o.situacao||'').toLowerCase()==='pago');
const pagoD = destino.filter(p=>/pago/i.test(p.status||''));
const fin = {
  valorTotal:  { origem:+somaO(origem).toFixed(2),  destino:+somaD(destino).toFixed(2) },
  titulosPagos:{ origem: pagoO.length,              destino: pagoD.length },
  valorPago:   { origem:+pagoO.reduce((s,o)=>s+(num(o.valorPago)||0),0).toFixed(2),
                 destino:+pagoD.reduce((s,p)=>s+(num(p.valorPago)||0),0).toFixed(2) },
  emAberto:    { origem:+somaO(origem.filter(o=>(o.situacao||'').toLowerCase()!=='pago')).toFixed(2),
                 destino:+somaD(destino.filter(p=>!/pago/i.test(p.status||''))).toFixed(2) },
};

// Pendência histórica: "533 contas a pagar sem categoria" — recalculado da fonte.
const semCatO = origem.filter(o => !txt(o.categoria)).length;
const semCatD = destino.filter(p => !txt(p.categoria)).length;
const porCat = {}; for (const p of destino) porCat[p.categoria || '(vazia)'] = (porCat[p.categoria||'(vazia)']||0)+1;
const semCentro = destino.filter(p => !txt(p.centroCusto)).length;

C.gravar('bling-pagar.json', { entidade:'Bling · contas a pagar', instantaneo:arq,
  origemExtraidaEm: fonte.geradoEm, camada2e3: r, camada6: fin,
  categorias: { semCategoriaNaOrigem: semCatO, semCategoriaNoDestino: semCatD, distribuicao: porCat, semCentroDeCusto: semCentro } });

C.imprimir('BLING · CONTAS A PAGAR', r, fin);
console.log('\n── pendência histórica recalculada: "533 contas a pagar sem categoria"');
console.log('   sem categoria NA ORIGEM (Bling) : ' + semCatO + ' de ' + origem.length);
console.log('   sem categoria NO DESTINO        : ' + semCatD + ' de ' + destino.length);
console.log('   sem centro de custo no destino  : ' + semCentro + ' de ' + destino.length);
console.log('\n   distribuição por categoria no destino:');
for (const [c,n] of Object.entries(porCat).sort((a,b)=>b[1]-a[1])) console.log('      ' + String(n).padStart(4) + '  ' + c);
