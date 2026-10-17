#!/usr/bin/env node
// Fluxo de caixa dia a dia e semana a semana — 13 a 31 de outubro de 2026.
// Só leitura. É onde a decisão da antecipação do Adriano realmente aperta.
const fs = require('fs'); const path = require('path');
const C = require('./comum.cjs');
const { bloco } = C.instantaneo();
const receber = bloco('legalway-financeiro-v1');
const pagar   = bloco('legalway-contas-pagar-v1');

const HOJE = '2026-10-13', FIM = '2026-10-31';
const CAIXA_INICIAL = 26617.10;          // Truist + Wise + Caixa (sem o Investimento)
const INVESTIMENTO  = 20000.00;
const COBRANCA = 0.962;                  // histórico, 918 títulos vencidos
const TAXA_GATEWAY = 5719.09 / 311322.72;
const LIQUIDO = COBRANCA * (1 - TAXA_GATEWAY);
const SOCIOS = { 'Sousa & Morin LLC':'Adriano', 'Reinehr LLC':'Renato',
                 'MTL Oliveira CORP':'Peterson', 'Vika Services LLC':'Vitória' };
const num = v => Number(v) || 0;

// ─── eventos do período ──────────────────────────────────────────────────
const ev = {};   // data → { entra, sai, itens: [] }
const por = (d, campo, valor, texto) => { if (d < HOJE || d > FIM) return;
  ev[d] = ev[d] || { entra: 0, sai: 0, itens: [] };
  ev[d][campo] += valor; ev[d].itens.push({ campo, valor, texto }); };

for (const c of receber) {
  if (/pago|cancelad/i.test(c.status || '')) continue;
  por(c.vencimento, 'entra', num(c.valor) * LIQUIDO, (c.clienteNome || '').slice(0, 28));
}
for (const p of pagar) {
  if (/pago/i.test(p.status || '')) continue;
  const quem = SOCIOS[p.fornecedor];
  por(p.vencimento, 'sai', num(p.valor), (quem ? 'PRÓ-LABORE ' + quem : (p.fornecedor || p.descricao || '').slice(0, 28)));
}

// despesa do dia a dia que ainda não está lançada: a média jul–set é US$ 14.104
// e só US$ 7.703 estão agendados em outubro. A diferença some do radar se eu
// não espalhar — então distribuo nos dias úteis.
const agendadoOut = Object.values(ev).reduce((s, d) => s + d.sai, 0)
                  - Object.values(ev).reduce((s, d) => s + d.itens.filter(i => /PRÓ-LABORE/.test(i.texto)).reduce((t, i) => t + i.valor, 0), 0);
const FALTA = Math.max(0, 14104.32 * (19/31) - agendadoOut);   // proporcional aos 19 dias restantes
const dias = []; for (let d = new Date(HOJE + 'T12:00:00Z'); d <= new Date(FIM + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1))
  dias.push(d.toISOString().slice(0, 10));
const uteis = dias.filter(d => ![0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay()));
const porDiaUtil = FALTA / uteis.length;

// ─── cenários ────────────────────────────────────────────────────────────
const CENARIOS = {
  'A · sem antecipação':            { '2026-10-15': 0, '2026-10-29': 0 },
  'C · Adriano antecipa 40.000':    { '2026-10-15': 30000, '2026-10-29': 0 },
  'F · Adriano antecipa 20.000':    { '2026-10-15': 10000, '2026-10-29': 0 },
};

const linhas = [];
for (const [nome, extra] of Object.entries(CENARIOS)) {
  let caixa = CAIXA_INICIAL; const diario = [];
  for (const d of dias) {
    const e = ev[d] || { entra: 0, sai: 0, itens: [] };
    const desp = uteis.includes(d) ? porDiaUtil : 0;
    const ex = extra[d] || 0;
    caixa += e.entra - e.sai - desp - ex;
    diario.push({ d, entra: e.entra, sai: e.sai + desp + ex, caixa, itens: e.itens, extra: ex });
  }
  linhas.push({ nome, diario, menor: Math.min(...diario.map(x => x.caixa)), fim: diario[diario.length-1].caixa });
}

// ─── CSV para abrir na planilha ──────────────────────────────────────────
const csv = ['data;dia;entra;sai;saldo A (sem antecipação);saldo C (antecipa 40k);saldo F (antecipa 20k);o que acontece'];
const DIAS = ['dom','seg','ter','qua','qui','sex','sáb'];
for (let i = 0; i < dias.length; i++) {
  const d = dias[i], a = linhas[0].diario[i], c = linhas[1].diario[i], f = linhas[2].diario[i];
  const oque = (ev[d]?.itens || []).map(x => (x.campo === 'entra' ? '+' : '−') + x.valor.toFixed(0) + ' ' + x.texto)
    .filter(t => /PRÓ-LABORE/.test(t) || Math.abs(Number(t.slice(1).split(' ')[0])) > 900).join(' | ');
  csv.push([d, DIAS[new Date(d+'T12:00:00Z').getUTCDay()], a.entra.toFixed(2), a.sai.toFixed(2),
            a.caixa.toFixed(2), c.caixa.toFixed(2), f.caixa.toFixed(2), oque].join(';'));
}
const saida = path.join(__dirname, '..', 'planilhas', 'fluxo-outubro-2026.csv');
fs.writeFileSync(saida, csv.join('\n') + '\n');

// ─── impressão ───────────────────────────────────────────────────────────
const f = n => (n < 0 ? '-' : ' ') + String(Math.abs(n).toFixed(0)).padStart(7);
console.log('FLUXO DE CAIXA — 13 a 31 de outubro de 2026\n');
console.log('   caixa em 13/10: US$ ' + CAIXA_INICIAL.toFixed(2) + '   (+ US$ ' + INVESTIMENTO.toFixed(2) + ' no Investimento Truist)');
console.log('   a receber entra a ' + (LIQUIDO*100).toFixed(1) + '% do valor de face (96,2% de cobrança − 1,8% de taxa)');
console.log('   despesa não lançada distribuída nos dias úteis: US$ ' + FALTA.toFixed(2) + '  (US$ ' + porDiaUtil.toFixed(2) + '/dia)\n');
console.log('   data        dia      entra      sai    │  A sem ant.   C ant.40k   F ant.20k │ o que acontece');
for (let i = 0; i < dias.length; i++) {
  const d = dias[i], a = linhas[0].diario[i], c = linhas[1].diario[i], fa = linhas[2].diario[i];
  const dia = DIAS[new Date(d+'T12:00:00Z').getUTCDay()];
  const marcos = (ev[d]?.itens || []).filter(x => /PRÓ-LABORE/.test(x.texto) || x.valor > 1500)
    .map(x => (x.campo === 'entra' ? '+' : '−') + x.valor.toFixed(0) + ' ' + x.texto).join('  ');
  console.log('   ' + d + '  ' + dia + '  ' + f(a.entra) + ' ' + f(a.sai) + '   │ ' + f(a.caixa) + '   ' + f(c.caixa) + '   ' + f(fa.caixa)
    + ' │ ' + (marcos || ''));
}
console.log('\n   ────────────────────────────────────────────────────────────────');
for (const l of linhas) console.log('   ' + l.nome.padEnd(30) + ' menor saldo: ' + f(l.menor) + '    em 31/10: ' + f(l.fim)
  + (l.menor < 0 ? '   ✗ FURA' : l.menor < 5000 ? '   ⚠ no osso' : ''));
console.log('\n   planilha: ferramentas/planilhas/fluxo-outubro-2026.csv');
