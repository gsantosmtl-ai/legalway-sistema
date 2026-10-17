#!/usr/bin/env node
// Projeção de caixa out/nov/dez 2026. Só leitura do instantâneo.
const C = require('./comum.cjs');
const { bloco } = C.instantaneo();
const receber = bloco('legalway-financeiro-v1');
const pagar   = bloco('legalway-contas-pagar-v1');
const contas  = bloco('legalway-contas-bancarias-v1');
const transf  = bloco('legalway-transferencias-v1');

const HOJE = '2026-10-12';
const num = v => Number(v) || 0;

// ─── caixa hoje (mesma fórmula da tela) ──────────────────────────────────
const saldo = nome => {
  const ini = num((contas.find(c => c.nome === nome) || {}).saldoInicial);
  const rec = receber.filter(c => c.conta === nome).reduce((s,c)=>s+num(c.valorRecebido),0);
  const pag = pagar.filter(c => c.conta === nome && c.status === 'Pago').reduce((s,c)=>s+num(c.valor),0);
  const ent = transf.filter(t => t.para === nome).reduce((s,t)=>s+num(t.valor),0);
  const sai = transf.filter(t => t.de === nome).reduce((s,t)=>s+num(t.valor),0);
  return ini + rec - pag + ent - sai;
};
const caixaUSD = contas.filter(c => !/C6/i.test(c.nome)).reduce((s,c)=>s+saldo(c.nome),0);
const caixaBRL = saldo('C6 PIX BR (Brasil)');

// ─── taxa de cobrança histórica: do que venceu, quanto entrou? ───────────
const venceu = receber.filter(c => c.vencimento && c.vencimento < HOJE && !/cancelad/i.test(c.status||''));
const venceuPago = venceu.filter(c => /pago/i.test(c.status||''));
const taxaCobranca = venceu.length ? venceuPago.length / venceu.length : 0;
const valorVenceu = venceu.reduce((s,c)=>s+num(c.valor),0);
const valorEntrou = venceuPago.reduce((s,c)=>s+num(c.valorRecebido),0);
const taxaValor = valorVenceu ? valorEntrou / valorVenceu : 0;

// ─── a receber e a pagar por mês, de hoje até 31/12 ──────────────────────
const meses = ['2026-10','2026-11','2026-12'];
const mesDe = d => String(d||'').slice(0,7);
const futuro = c => c.vencimento >= HOJE && c.vencimento <= '2026-12-31';
const SOCIOS = { 'Sousa & Morin LLC':'Adriano', 'Reinehr LLC':'Renato',
                 'MTL Oliveira CORP':'Peterson', 'Vika Services LLC':'Vitória' };

const linha = {};
for (const m of meses) linha[m] = { receberBruto:0, receberN:0, atrasado:0, pagarSocios:0, pagarOutros:0, pagarN:0 };

// atrasado que ainda não entrou (antes de hoje, não pago, não cancelado)
const atrasado = receber.filter(c => c.vencimento < HOJE && !/pago|cancelad/i.test(c.status||''));
const valorAtrasado = atrasado.reduce((s,c)=>s+num(c.valor),0);

for (const c of receber) {
  if (/cancelad/i.test(c.status||'') || /pago/i.test(c.status||'')) continue;
  if (!futuro(c)) continue;
  const m = mesDe(c.vencimento); if (!linha[m]) continue;
  linha[m].receberBruto += num(c.valor); linha[m].receberN++;
}
for (const p of pagar) {
  if (/pago/i.test(p.status||'')) continue;
  if (!(p.vencimento >= HOJE && p.vencimento <= '2026-12-31')) continue;
  const m = mesDe(p.vencimento); if (!linha[m]) continue;
  if (SOCIOS[p.fornecedor]) linha[m].pagarSocios += num(p.valor); else linha[m].pagarOutros += num(p.valor);
  linha[m].pagarN++;
}

// ─── despesa operacional média dos últimos 3 meses (para checar realismo) ─
const pagos3m = pagar.filter(p => /pago/i.test(p.status||'') && p.dataPagamento >= '2026-07-01' && p.dataPagamento <= '2026-09-30');
const opSemSocios = pagos3m.filter(p => !SOCIOS[p.fornecedor]).reduce((s,p)=>s+num(p.valor),0) / 3;
const recebido3m = receber.filter(c => /pago/i.test(c.status||'') && c.dataRecebimento >= '2026-07-01' && c.dataRecebimento <= '2026-09-30')
                          .reduce((s,c)=>s+num(c.valorRecebido),0) / 3;

module.exports = { caixaUSD, caixaBRL, taxaCobranca, taxaValor, linha, meses, valorAtrasado, atrasadoN: atrasado.length,
                   opSemSocios, recebido3m, SOCIOS, saldo, contas, receber, pagar };

if (require.main === module) {
  const f = n => 'US$ ' + String(n.toFixed(2)).padStart(11);
  console.log('POSIÇÃO EM ' + HOJE + '\n');
  console.log('── caixa');
  for (const c of contas) console.log('   ' + c.nome.padEnd(24) + f(saldo(c.nome)) + (/C6/i.test(c.nome) ? '   ⚠ em REAL' : ''));
  console.log('   ' + 'CAIXA EM DÓLAR'.padEnd(24) + f(caixaUSD));
  console.log('\n── histórico de cobrança (do que já venceu)');
  console.log('   títulos vencidos        : ' + venceu.length + '   recebidos: ' + venceuPago.length
            + '   → ' + (taxaCobranca*100).toFixed(1) + '% em quantidade');
  console.log('   valor vencido           : ' + f(valorVenceu) + '   recebido: ' + f(valorEntrou)
            + '   → ' + (taxaValor*100).toFixed(1) + '% em valor');
  console.log('   atrasado ainda em aberto: ' + atrasado.length + ' títulos, ' + f(valorAtrasado));
  console.log('\n── média mensal dos últimos 3 meses (jul–set)');
  console.log('   recebido                : ' + f(recebido3m));
  console.log('   despesa sem sócios      : ' + f(opSemSocios));
  console.log('\n── agendado de hoje até 31/12');
  console.log('   mês        a receber (bruto)   nº    pró-labore   outras despesas   nº');
  for (const m of meses) { const l = linha[m];
    console.log('   ' + m + '   ' + f(l.receberBruto) + String(l.receberN).padStart(6)
      + '   ' + f(l.pagarSocios) + '   ' + f(l.pagarOutros) + String(l.pagarN).padStart(5)); }
}
