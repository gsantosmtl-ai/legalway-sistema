#!/usr/bin/env node
// Cenários de caixa out–dez/2026, COM a venda nova. Só leitura.
const B = require('./08-projecao-caixa.cjs');
const f = n => (n < 0 ? '-' : ' ') + 'US$ ' + String(Math.abs(n).toFixed(2)).padStart(10);

const CAIXA_OPERACIONAL = B.caixaUSD - 20000;
const COBRANCA = B.taxaValor;
const DESPESA = B.opSemSocios;
const PROLABORE_MES = 40000;
const BONUS_CADA = 10000;

// ─── venda nova ──────────────────────────────────────────────────────────
const META_MES = 20, TICKET = 5400, VEZES = 15;      // 1 entrada + 14 parcelas
const PARCELA = TICKET / VEZES;                       // US$ 360
// Outubro já tem 15 contratos assinados e lançados no sistema — as parcelas
// deles JÁ estão no "a receber". Só o que passa da meta é incremental.
const JA_EM_OUTUBRO = 15;
const novos = { '2026-10': META_MES - JA_EM_OUTUBRO, '2026-11': META_MES, '2026-12': META_MES };
const meses = B.meses;
// caixa que a venda nova traz em cada mês: entrada da safra do mês + parcela das safras anteriores
function vendaNova(mes) {
  let n = 0;
  for (const m of meses) { if (m > mes) break; n += novos[m]; }   // toda safra até aqui paga uma vez
  return n * PARCELA * COBRANCA;
}

// O sistema grava o BRUTO; no banco entra o líquido da taxa do gateway.
// Medido na auditoria: 557 dos 889 títulos pagos têm taxa, US$ 5.719,09 de
// diferença sobre US$ 311.322,72 recebidos = 1,84% médio sobre tudo que entra.
const TAXA_GATEWAY = 5719.09 / 311322.72;
const entra = m => (B.linha[m].receberBruto * COBRANCA + vendaNova(m)) * (1 - TAXA_GATEWAY);

function rodar(nome, ajuste) {
  let caixa = CAIXA_OPERACIONAL; const linhas = [];
  for (const m of meses) {
    const rec = entra(m); const { prolabore, extra } = ajuste(m);
    const saida = prolabore + DESPESA + extra;
    caixa += rec - saida;
    linhas.push({ m, rec, carteira: B.linha[m].receberBruto * COBRANCA, novo: vendaNova(m), prolabore, extra, caixa });
  }
  return { nome, linhas, fim: caixa, menor: Math.min(...linhas.map(l => l.caixa)) };
}

const cen = [
  rodar('A · como está (sem antecipação, sem divisão de lucro)', () => ({ prolabore: PROLABORE_MES, extra: 0 })),
  rodar('B · + divisão de lucro em dezembro (4 x 10.000)',
        m => ({ prolabore: PROLABORE_MES, extra: m === '2026-12' ? BONUS_CADA * 4 : 0 })),
  rodar('C · Adriano antecipa 40.000 em outubro, sem divisão para os outros',
        m => m === '2026-10' ? { prolabore: 30000 + 40000, extra: 0 } : { prolabore: 30000, extra: 0 }),
  rodar('D · Adriano antecipa E os outros 3 recebem bônus em dezembro',
        m => m === '2026-10' ? { prolabore: 30000 + 40000, extra: 0 }
           : m === '2026-12' ? { prolabore: 30000, extra: BONUS_CADA * 3 } : { prolabore: 30000, extra: 0 }),
  rodar('E · Adriano antecipa só out+nov (20.000), bônus de todos em dezembro',
        m => m === '2026-10' ? { prolabore: 30000 + 20000, extra: 0 }
           : m === '2026-11' ? { prolabore: 30000, extra: 0 }
           : { prolabore: 40000, extra: BONUS_CADA * 4 }),
  // F — o que o caixa aguenta sem ficar negativo nem furar a reserva mínima.
  // Reserva mínima = 1 mês de custo fixo (pró-labore + despesa) = US$ 54.104.
  rodar('F · RECOMENDADO: Adriano antecipa 20.000, bônus de 5.000 por sócio',
        m => m === '2026-10' ? { prolabore: 30000 + 20000, extra: 0 }
           : m === '2026-11' ? { prolabore: 30000, extra: 0 }
           : { prolabore: 40000, extra: 5000 * 4 }),
];
const RESERVA_MINIMA = PROLABORE_MES + DESPESA;

console.log('PREMISSAS\n');
console.log('   caixa operacional hoje (fora o Investimento de 20.000)  ' + f(CAIXA_OPERACIONAL));
console.log('   taxa de cobrança histórica                              ' + (COBRANCA*100).toFixed(1) + '%');
console.log('   despesa mensal sem sócios (média jul–set)               ' + f(DESPESA));
console.log('   pró-labore                                              ' + f(PROLABORE_MES) + '  (4 x 10.000)');
console.log('   venda nova: ' + META_MES + ' contratos/mês x US$ ' + TICKET + ' em ' + VEZES + ' vezes = ' + f(PARCELA) + ' por parcela');
console.log('   (outubro: ' + JA_EM_OUTUBRO + ' já assinados e lançados, só ' + novos['2026-10'] + ' são incrementais)');
console.log('\n   entrada de caixa por mês:');
for (const m of meses) console.log('      ' + m + '   carteira ' + f(B.linha[m].receberBruto*COBRANCA)
  + '   venda nova ' + f(vendaNova(m)) + '   total ' + f(entra(m)));
console.log('   atrasado em aberto, NÃO projetado: ' + f(B.valorAtrasado) + ' (' + B.atrasadoN + ' títulos)');

for (const c of cen) {
  console.log('\n\n══ ' + c.nome);
  console.log('   mês        entra         pró-labore    extra         caixa no fim');
  for (const l of c.linhas)
    console.log('   ' + l.m + ' ' + f(l.rec) + '  ' + f(l.prolabore) + ' ' + f(l.extra) + '  ' + f(l.caixa)
      + (l.caixa < 0 ? '   ← NEGATIVO' : l.caixa < 20000 ? '   ← apertado' : ''));
  console.log('   fim de dezembro: ' + f(c.fim) + '     menor saldo: ' + f(c.menor)
    + (c.menor < 0 ? '   ✗ FURA O CAIXA' : c.menor < RESERVA_MINIMA ? '   ⚠ abaixo da reserva de 1 mês' : '   ✓'));
}
