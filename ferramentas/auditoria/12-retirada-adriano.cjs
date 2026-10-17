#!/usr/bin/env node
// Pedido de antecipação do Adriano: 40.000 / 30.000 / 20.000, contra a opção
// aprovada (acumular e sacar em janeiro). Base: 3 sócios a US$ 30.000/mês.
const C = require('./comum.cjs');
const { bloco } = C.instantaneo();
const receber = bloco('legalway-financeiro-v1');
const pagar   = bloco('legalway-contas-pagar-v1');
const num = v => Number(v) || 0;
const HOJE = '2026-10-13';
const CAIXA = 26617.10, INVEST = 20000;
const COB = 0.962, TAXA = 5719.09 / 311322.72, LIQ = COB * (1 - TAXA);
const DESPESA = 14104.32, PL3 = 30000, PL4 = 40000;
const MESES = ['2026-10','2026-11','2026-12','2027-01'];
const SOCIOS = ['Sousa & Morin LLC','Reinehr LLC','MTL Oliveira CORP','Vika Services LLC'];

const carteira = {}; for (const m of MESES) carteira[m] = 0;
for (const c of receber) { if (/pago|cancelad/i.test(c.status||'') || c.vencimento < HOJE) continue;
  const m = String(c.vencimento).slice(0,7); if (m in carteira) carteira[m] += num(c.valor); }
const PARC = 5400/15, novos = { '2026-10':5,'2026-11':20,'2026-12':20,'2027-01':20 };
const vn = mes => { let n = 0; for (const m of MESES) { if (m > mes) break; n += novos[m]; } return n*PARC*COB; };
const entra = m => (carteira[m]*COB + vn(m)) * (1 - TAXA);

// Adriano antecipa X em outubro e só volta a receber quando X se esgota (10.000/mês)
function plano(X) {
  const sai = {}; let saldo = X;
  for (const m of MESES) {
    let v = (m === '2026-10') ? X : 0;
    if (m !== '2026-10') { if (saldo >= 10000) saldo -= 10000; else { v = 10000 - saldo; saldo = 0; } }
    else saldo -= 10000;
    sai[m] = v;
  }
  return sai;
}
function rodar(nome, extraPorMes) {
  let caixa = CAIXA; const l = [];
  for (const m of MESES) { const rec = entra(m), ex = extraPorMes[m] || 0;
    caixa += rec - PL3 - DESPESA - ex; l.push({ m, rec, pl: PL3, ex, caixa }); }
  return { nome, l, menor: Math.min(...l.map(x=>x.caixa)), fim: l[l.length-1].caixa };
}
const cen = {
  'pedido40': rodar('Pedido: US$ 40.000', plano(40000)),
  'alt30':    rodar('Alternativa: US$ 30.000', plano(30000)),
  'alt20':    rodar('Alternativa: US$ 20.000', plano(20000)),
  'aprovado': rodar('Aprovado: acumular e sacar em janeiro',
                { '2026-10':0, '2026-11':0, '2026-12':0, '2027-01':30000 + 10000 }),
};

// carteira a receber, por faixa
const abertos = receber.filter(c => !/pago|cancelad/i.test(c.status||''));
const total = abertos.reduce((s,c)=>s+num(c.valor),0);
const atrasado = abertos.filter(c=>c.vencimento < HOJE);
const prox90 = abertos.filter(c=>c.vencimento >= HOJE && c.vencimento <= '2027-01-11');
const depois = abertos.filter(c=>c.vencimento > '2027-01-11');

const saida = {
  geradoEm: new Date().toISOString(), caixa: CAIXA, investimento: INVEST,
  carteira: { total, atrasado: { n: atrasado.length, v: atrasado.reduce((s,c)=>s+num(c.valor),0) },
              prox90: { n: prox90.length, v: prox90.reduce((s,c)=>s+num(c.valor),0) },
              depois: { n: depois.length, v: depois.reduce((s,c)=>s+num(c.valor),0) } },
  entrada: Object.fromEntries(MESES.map(m => [m, { carteira: carteira[m]*COB, novo: vn(m), total: entra(m) }])),
  cenarios: cen, premissas: { COB, TAXA, DESPESA, PL3, PL4 },
};
C.gravar('retirada-adriano.json', saida);
require('fs').writeFileSync(require('path').join(__dirname, 'dados-relatorio.json'), JSON.stringify(saida));

const f = n => (n<0?'-':' ') + String(Math.abs(n).toFixed(0)).padStart(8);
console.log('CARTEIRA A RECEBER');
console.log('   total em aberto            US$ ' + total.toFixed(2));
console.log('   vencido e não recebido     US$ ' + saida.carteira.atrasado.v.toFixed(2) + '  (' + atrasado.length + ')');
console.log('   próximos 90 dias           US$ ' + saida.carteira.prox90.v.toFixed(2) + '  (' + prox90.length + ')');
console.log('   depois de 90 dias          US$ ' + saida.carteira.depois.v.toFixed(2) + '  (' + depois.length + ')');
for (const k of Object.keys(cen)) { const c = cen[k];
  console.log('\n══ ' + c.nome);
  for (const x of c.l) console.log('   ' + x.m + '  entra ' + f(x.rec) + '  pró-labore ' + f(x.pl) + '  Adriano ' + f(x.ex) + '  caixa ' + f(x.caixa) + (x.caixa<0?'  ✗':''));
  console.log('   menor saldo: ' + f(c.menor) + '   janeiro: ' + f(c.fim));
}
