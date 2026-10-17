#!/usr/bin/env node
// Adriano fora do pró-labore de out a dez; retira em janeiro.
// Pró-labore passa a US$ 15.000 por data (3 sócios) = US$ 30.000/mês.
const C = require('./comum.cjs');
const { bloco } = C.instantaneo();
const receber = bloco('legalway-financeiro-v1');
const pagar   = bloco('legalway-contas-pagar-v1');
const f = n => (n < 0 ? '-' : ' ') + 'US$ ' + String(Math.abs(n).toFixed(2)).padStart(10);

const HOJE = '2026-10-13';
const CAIXA = 26617.10, INVEST = 20000;
const COB = 0.962, TAXA = 5719.09 / 311322.72, LIQ = COB * (1 - TAXA);
const DESPESA = 14104.32;
const SOCIOS = { 'Sousa & Morin LLC':'Adriano', 'Reinehr LLC':'Renato',
                 'MTL Oliveira CORP':'Peterson', 'Vika Services LLC':'Vitória' };
const num = v => Number(v) || 0;
const MESES = ['2026-10','2026-11','2026-12','2027-01'];

// carteira já vendida, por mês
const carteira = {}; for (const m of MESES) carteira[m] = 0;
for (const c of receber) { if (/pago|cancelad/i.test(c.status||'')) continue;
  if (c.vencimento < HOJE) continue;
  const m = String(c.vencimento).slice(0,7); if (m in carteira) carteira[m] += num(c.valor); }

// despesa não-sócio já agendada, por mês (uso o maior entre agendado e a média)
const agendado = {}; for (const m of MESES) agendado[m] = 0;
for (const p of pagar) { if (/pago/i.test(p.status||'')) continue; if (p.vencimento < HOJE) continue;
  if (SOCIOS[p.fornecedor]) continue;
  const m = String(p.vencimento).slice(0,7); if (m in agendado) agendado[m] += num(p.valor); }
const despesa = m => Math.max(agendado[m], DESPESA);

// venda nova: 20/mês x 5.400 em 15 vezes; outubro já tem 15 lançados
const PARC = 5400/15, novos = { '2026-10':5, '2026-11':20, '2026-12':20, '2027-01':20 };
const vendaNova = mes => { let n = 0; for (const m of MESES) { if (m > mes) break; n += novos[m]; } return n * PARC * COB; };
const entra = m => (carteira[m] * COB + vendaNova(m)) * (1 - TAXA);

const PL3 = 30000;            // 3 sócios x 10.000
const PL4 = 40000;            // com o Adriano de volta
const ADRIANO_ACUMULADO = 30000;   // out + nov + dez que ele não recebe
const BONUS = 10000;

function rodar(nome, plano) {
  let caixa = CAIXA; const linhas = [];
  for (const m of MESES) {
    const rec = entra(m), { pl, extra, nota } = plano(m);
    const d = despesa(m);
    caixa += rec - pl - d - extra;
    linhas.push({ m, rec, pl, d, extra, caixa, nota });
  }
  return { nome, linhas, menor: Math.min(...linhas.map(l=>l.caixa)), fim: linhas[linhas.length-1].caixa };
}

const cen = [
  rodar('G · Adriano acumula e saca em janeiro. Sem divisão de lucro.',
    m => m === '2027-01' ? { pl: PL4, extra: ADRIANO_ACUMULADO + BONUS, nota: 'Adriano saca 30.000 + bônus 10.000' }
       : { pl: PL3, extra: 0, nota: '3 sócios' }),
  rodar('H · Adriano saca em janeiro E os outros 3 recebem bônus em dezembro',
    m => m === '2026-12' ? { pl: PL3, extra: BONUS*3, nota: 'bônus dos 3' }
       : m === '2027-01' ? { pl: PL4, extra: ADRIANO_ACUMULADO + BONUS, nota: 'Adriano saca 40.000' }
       : { pl: PL3, extra: 0, nota: '3 sócios' }),
  rodar('I · todos os 4 recebem bônus, mas só em janeiro',
    m => m === '2027-01' ? { pl: PL4, extra: ADRIANO_ACUMULADO + BONUS*4, nota: 'Adriano 30.000 + bônus dos 4' }
       : { pl: PL3, extra: 0, nota: '3 sócios' }),
  rodar('J · Adriano saca em janeiro, bônus de 5.000 por sócio em janeiro',
    m => m === '2027-01' ? { pl: PL4, extra: ADRIANO_ACUMULADO + 5000*4, nota: 'Adriano 30.000 + bônus 5.000 x4' }
       : { pl: PL3, extra: 0, nota: '3 sócios' }),
];

console.log('PREMISSAS\n');
console.log('   caixa operacional em 13/10          ' + f(CAIXA) + '   (+ ' + f(INVEST) + ' no Investimento)');
console.log('   pró-labore out–dez: 3 sócios        ' + f(PL3) + '/mês   (15.000 no dia 15 + 15.000 no 29)');
console.log('   Adriano acumula e saca em janeiro   ' + f(ADRIANO_ACUMULADO) + ' + bônus');
console.log('   entra no caixa, por mês:');
for (const m of MESES) console.log('      ' + m + '   carteira ' + f(carteira[m]*COB) + '   venda nova ' + f(vendaNova(m)) + '   total ' + f(entra(m)));
console.log('   despesa sem sócios, por mês:');
for (const m of MESES) console.log('      ' + m + '   agendada ' + f(agendado[m]) + '   usada ' + f(despesa(m)));

for (const c of cen) {
  console.log('\n\n══ ' + c.nome);
  console.log('   mês        entra        pró-labore    despesa      extra         caixa no fim');
  for (const l of c.linhas)
    console.log('   ' + l.m + ' ' + f(l.rec) + ' ' + f(l.pl) + ' ' + f(l.d) + ' ' + f(l.extra) + '  ' + f(l.caixa)
      + (l.caixa < 0 ? '  ✗' : l.caixa < 20000 ? '  ⚠' : '  ✓') + '  ' + (l.nota||''));
  console.log('   menor saldo: ' + f(c.menor) + (c.menor < 0 ? '   ✗ FURA O CAIXA' : c.menor < 20000 ? '   ⚠ abaixo de 1 mês de custo' : '   ✓'));
}
