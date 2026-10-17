#!/usr/bin/env node
// CAMADA 6 — saldo por conta. O sistema não guarda o extrato: ele CALCULA
// o saldo com saldoInicial + recebido − pago + transferências. Então a
// conciliação honesta é comparar esse cálculo com o extrato do Bling.
const C = require('./comum.cjs');
const { num, data, txt } = C;
const { arq, bloco } = C.instantaneo();
const E = C.origem('bling/bling-extrato.json');

const receber = bloco('legalway-financeiro-v1');
const pagar   = bloco('legalway-contas-pagar-v1');
const transf  = bloco('legalway-transferencias-v1');
const contas  = bloco('legalway-contas-bancarias-v1');

// mesma fórmula da tela, copiada de docs/financeiro.html
const saldoSistema = nome => {
  const ini = Number((contas.find(cb => cb.nome === nome) || {}).saldoInicial || 0);
  const rec = receber.filter(c => c.conta === nome).reduce((s,c)=>s+Number(c.valorRecebido||0),0);
  const pag = pagar.filter(c => c.conta === nome && c.status === 'Pago').reduce((s,c)=>s+Number(c.valor||0),0);
  const ent = transf.filter(t => t.para === nome).reduce((s,t)=>s+Number(t.valor||0),0);
  const sai = transf.filter(t => t.de === nome).reduce((s,t)=>s+Number(t.valor||0),0);
  return { saldo: ini + rec - pag + ent - sai, ini, rec, pag, ent, sai };
};

// nome da conta no Bling → nome no sistema
const DE_PARA = { 'TRUIST - EUA':'Truist', 'WISE USD':'Wise', 'Caixa':'Caixa',
                  'INVESTIMENTO TRUIST':'Investimento Truist', 'C6 PIX BR':'C6 PIX BR (Brasil)', 'Nubank':null };

const linhas = [];
for (const [contaBling, lancs] of Object.entries(E.extrato)) {
  const nome = DE_PARA[contaBling];
  const entra = lancs.reduce((s,l)=>s+(l.debCred==='C' ? (num(l.valor)||0) : 0), 0);
  const sai   = lancs.reduce((s,l)=>s+(l.debCred==='D' ? (num(l.valor)||0) : 0), 0);
  const movimento = entra - sai;
  const s = nome ? saldoSistema(nome) : null;
  linhas.push({ contaBling, contaSistema: nome, lancamentos: lancs.length,
    entradasBling: +entra.toFixed(2), saidasBling: +sai.toFixed(2), movimentoBling: +movimento.toFixed(2),
    recebidoSistema: s ? +s.rec.toFixed(2) : null, pagoSistema: s ? +s.pag.toFixed(2) : null,
    transfLiquidaSistema: s ? +(s.ent - s.sai).toFixed(2) : null,
    movimentoSistema: s ? +(s.rec - s.pag + s.ent - s.sai).toFixed(2) : null,
    saldoInicial: s ? s.ini : null, saldoFinalSistema: s ? +s.saldo.toFixed(2) : null });
}

// moeda: o C6 é conta em real somando num total em dólar (pendência conhecida)
const totalSistema = contas.reduce((s,cb)=>s+saldoSistema(cb.nome).saldo, 0);

C.gravar('bling-extrato-saldos.json', { instantaneo: arq, extraidoEm: E.geradoEm,
  observacao: 'O sistema não armazena o extrato; o saldo é calculado. A comparação é de MOVIMENTO, não lançamento a lançamento.',
  contas: linhas, totalSistema: +totalSistema.toFixed(2) });

console.log('BLING · EXTRATO BANCÁRIO → SALDO POR CONTA\n');
console.log('   O sistema NÃO guarda o extrato (2.042 lançamentos). Ele calcula o saldo.');
console.log('   Logo: não há conciliação lançamento a lançamento possível aqui —');
console.log('   o que dá para conferir é o MOVIMENTO de cada conta.\n');
const f = n => n == null ? '      —' : String(n.toFixed(2)).padStart(12);
console.log('   conta                 lanç.   movim. Bling   movim. sistema     diferença');
for (const l of linhas) {
  const d = (l.movimentoSistema == null) ? null : l.movimentoSistema - l.movimentoBling;
  console.log('   ' + (l.contaBling + (l.contaSistema ? '' : ' (sem par)')).padEnd(22)
    + String(l.lancamentos).padStart(5) + f(l.movimentoBling) + f(l.movimentoSistema)
    + (d == null ? '          —' : (Math.abs(d) < 0.005 ? '            ✓' : f(d))));
}
// ─── o saldo NÃO é verificável com esta extração ─────────────────────────
const comSaldo = Object.values(E.extrato).flat().filter(l => String(l.saldo||'').trim()).length;

// ─── mas o extrato traz a CATEGORIA real, que falta nas contas a pagar ────
const F = C.origem('bling/bling-financeiro.json').dados;
const pagarO = [...F.pagarAberto, ...F.pagarPago];
const abs = v => Math.abs(Math.round((num(v)||0) * 100));
const idx = new Map();
for (const l of Object.values(E.extrato).flat()) { const k = abs(l.valor) + '|' + data(l.data);
  if (!idx.has(k)) idx.set(k, []); idx.get(k).push(l); }
const nn = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const REGRAS_DO_IMPORTADOR = [/usps|correio|fedex|ups/, /traducao|tradutor|camila/, /psicolog|leticia/,
  /taxa|stripe|tarifa|square|wise/, /trafego|anuncio|meta|google|marketing/,
  /aluguel|regus|escritorio|material|amazon/, /sdr|jean paulo/, /owner draw|retirada|socio|llc|corp|inc/,
  /contabil|claudia lima|tax/];
const caiuNoPadrao = new Set(pagarO.filter(o => !REGRAS_DO_IMPORTADOR.some(re => re.test(nn((o.nome||'') + ' ' + (o.observacoes||''))))).map(o => o.id));
let unico = 0, ambiguo = 0, semPar = 0, recuperaveis = 0;
const categoriaReal = {}, proposta = {}, lista = [];
for (const o of pagarO) {
  const c = (idx.get(abs(o.valor)+'|'+data(o.liquidacao)) || idx.get(abs(o.valor)+'|'+data(o.vencimento)) || [])
            .filter(l => l.debCred === 'D' || l.debCred === 'S');
  if (!c.length) { semPar++; continue; }
  c.length === 1 ? unico++ : ambiguo++;
  const cat = c[0].descricao; if (!cat) continue;
  categoriaReal[cat] = (categoriaReal[cat]||0) + 1;
  if (caiuNoPadrao.has(o.id)) { recuperaveis++; proposta[cat] = (proposta[cat]||0)+1;
    lista.push({ blingId: o.id, fornecedor: o.nome, valor: o.valor, data: o.liquidacao || o.vencimento,
                 categoriaQueGravamos: 'Serviço de terceiros (padrão)', categoriaNoExtrato: cat }); }
}
C.gravar('bling-categorias-recuperaveis.json', { casamentoUnico: unico, ambiguo, semPar,
  categoriaRealNoExtrato: categoriaReal, dasQueCairamNoPadrao: { total: caiuNoPadrao.size, recuperaveis, proposta }, lista });

console.log('\n── CAMADA 6 — saldo bancário: NÃO VERIFICÁVEL');
console.log('   o campo "saldo" vem vazio em ' + (2042 - comSaldo) + ' dos 2.042 lançamentos');
console.log('   (o endpoint de listagem do Bling não devolve saldo corrido).');
console.log('   Sem o saldo de fechamento da origem, não dá para conciliar saldo.');
console.log('   Classificação honesta: NÃO VERIFICÁVEL — não "conciliado".');

console.log('\n── mas o extrato tem a CATEGORIA que falta nas contas a pagar');
console.log('   contas a pagar casadas com um lançamento: ' + (unico + ambiguo) + ' de ' + pagarO.length
          + '   (' + unico + ' únicas, ' + ambiguo + ' ambíguas, ' + semPar + ' sem par)');
console.log('   categoria real do plano de contas do Bling:');
Object.entries(categoriaReal).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([c,n]) => console.log('      ' + String(n).padStart(4) + '  ' + c));
console.log('\n   DAS ' + caiuNoPadrao.size + ' que o importador chutou, ' + recuperaveis + ' têm categoria na origem:');
Object.entries(proposta).sort((a,b)=>b[1]-a[1]).forEach(([c,n]) => console.log('      ' + String(n).padStart(4) + '  ' + c));

console.log('\n   saldo final calculado pelo sistema, por conta:');
for (const l of linhas) if (l.contaSistema)
  console.log('      ' + l.contaSistema.padEnd(24) + 'inicial ' + f(l.saldoInicial) + '   final ' + f(l.saldoFinalSistema));
console.log('\n   TOTAL somado pelo sistema: ' + totalSistema.toFixed(2));
