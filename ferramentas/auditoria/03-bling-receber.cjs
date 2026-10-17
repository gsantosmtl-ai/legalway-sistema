#!/usr/bin/env node
// CAMADAS 2, 3 e 6 — identidade, conteúdo e financeiro.
// Bling · contas a receber · 2.810 títulos, um por um, pelo id do Bling.
// Só leitura. Não corrige nada: só classifica e mostra a evidência.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'instantaneo');
const P = path.join(__dirname, '..', 'planilhas');

const inst = fs.readdirSync(DIR).filter(f => f.startsWith('destino-')).sort().pop();
const D = JSON.parse(fs.readFileSync(path.join(DIR, inst), 'utf8'));
const destino = D.armazenamento.find(x => x.chave === 'legalway-financeiro-v1').valor;
const B = JSON.parse(fs.readFileSync(path.join(P, 'bling/bling-financeiro.json'), 'utf8')).dados;
const origem = [...B.receberAberto, ...B.receberPago];

// O Bling mistura DOIS formatos de número no MESMO registro:
//   valor, valorLiquido, aliquotaTaxa, valorTaxa → brasileiro  "1.500,00"
//   valorPago                                    → americano   "100.00"
// Um leitor só destrói um dos dois. Decido pelo separador decimal:
// se tem vírgula, o ponto é milhar; se não tem, o ponto é decimal.
const num = v => { if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const limpo = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(limpo); return Number.isFinite(n) ? n : null; };
// "20/09/2026" → "2026-09-20" ; "2026-01-08" fica ; "0000-00-00" → null
const data = v => { if (!v) return null; const s = String(v).trim().slice(0, 10);
  if (/^0000/.test(s)) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (br) return br[3] + '-' + br[2] + '-' + br[1];
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const cent = n => n == null ? null : Math.round(n * 100);

// ─── camada 2: identidade ────────────────────────────────────────────────
const porId = new Map();            // blingId → [parcelas do destino]
for (const p of destino) { const k = String(p.blingId || '');
  if (!k) continue; (porId.get(k) || porId.set(k, []).get(k)).push(p); }
const idsOrigem = new Set(origem.map(o => String(o.id)));
const semBlingId = destino.filter(p => !p.blingId);
const ausentes   = origem.filter(o => !porId.has(String(o.id)));
const duplicados = [...porId.entries()].filter(([, v]) => v.length > 1);
const extras     = [...porId.keys()].filter(k => !idsOrigem.has(k));

// ─── camadas 3 e 6: conteúdo e dinheiro, campo a campo ───────────────────
const CAMPOS = [
  ['valor',           o => cent(num(o.valor)),         p => cent(num(p.valor))],
  ['vencimento',      o => data(o.vencimento),         p => data(p.vencimento)],
  ['situacao',        o => (o.situacao || '').toLowerCase() === 'pago' ? 'pago' : 'aberto',
                      p => /pago/i.test(p.status || '') ? 'pago' : 'aberto'],
  ['valorPago',       o => cent(num(o.valorPago)),     p => cent(num(p.valorRecebido))],
  ['dataPagamento',   o => data(o.liquidacao),         p => data(p.dataRecebimento)],
  ['valorLiquido',    o => cent(num(o.valorLiquido)),  p => cent(num(p.valorLiquido))],
  ['taxaPercentual',  o => num(o.aliquotaTaxaNumeric ?? o.aliquotaTaxa), p => num(p.taxaPercentual)],
  ['taxaValor',       o => cent(num(o.valorTaxaNumeric ?? o.valorTaxa)), p => cent(num(p.taxaFixa))],
  ['clienteNome',     o => (o.nome || '').trim().toLowerCase(), p => (p.clienteNome || '').trim().toLowerCase()],
];

// REGRAS DE TRANSFORMAÇÃO documentadas. Equivalência semântica não é
// divergência — mas cada uma precisa estar escrita, senão vira desculpa.
const REGRAS = [
  { nome: 'naoPago: null ≡ 0',
    quando: (c, a, b, o) => c === 'valorPago' && (o.situacao||'').toLowerCase() !== 'pago'
                            && (a == null || a === 0) && (b == null || b === 0) },
  { nome: 'semTaxa: líquido/taxa em branco ≡ bruto',
    quando: (c, a, b, o) => ['valorLiquido','taxaPercentual','taxaValor'].includes(c) && b == null
                            && (num(o.valorTaxaNumeric ?? o.valorTaxa) || 0) === 0
                            && (num(o.aliquotaTaxaNumeric ?? o.aliquotaTaxa) || 0) === 0 },
];
const arredondamento = [];
const divergencias = [];
let conciliados = 0, porRegra = {};
for (const o of origem) {
  const lista = porId.get(String(o.id)); if (!lista) continue;
  const p = lista[0];
  const difs = [];
  for (const [nome, fo, fp] of CAMPOS) {
    const a = fo(o), b = fp(p);
    // campo ausente nos DOIS lados não é divergência
    if (a == null && b == null) continue;
    if (a === b) continue;
    const regra = REGRAS.find(r => r.quando(nome, a, b, o));
    if (regra) { porRegra[regra.nome] = (porRegra[regra.nome] || 0) + 1; continue; }
    // diferença de 1 centavo em valor derivado = arredondamento, não perda
    if (['valorLiquido'].includes(nome) && a != null && b != null && Math.abs(a - b) <= 1) {
      arredondamento.push({ blingId: String(o.id), cliente: o.nome, campo: nome, origem: a, destino: b });
      continue;
    }
    difs.push({ campo: nome, origem: a, destino: b });
  }
  if (difs.length) divergencias.push({ blingId: String(o.id), idSistema: p.id, cliente: o.nome, difs });
  else conciliados++;
}

// ─── camada 6: totais reconstruídos dos registros individuais ────────────
const somaO = f => origem.reduce((s, o) => s + (num(o[f]) || 0), 0);
const somaD = f => destino.reduce((s, p) => s + (num(p[f]) || 0), 0);
const pagasO = origem.filter(o => (o.situacao || '').toLowerCase() === 'pago');
const pagasD = destino.filter(p => /pago/i.test(p.status || ''));
const financeiro = {
  titulos:        { origem: origem.length, destino: destino.length },
  valorTotal:     { origem: +somaO('valor').toFixed(2), destino: +somaD('valor').toFixed(2) },
  titulosPagos:   { origem: pagasO.length, destino: pagasD.length },
  valorPago:      { origem: +pagasO.reduce((s,o)=>s+(num(o.valorPago)||0),0).toFixed(2),
                    destino: +pagasD.reduce((s,p)=>s+(num(p.valorRecebido)||0),0).toFixed(2) },
  valorEmAberto:  { origem: +origem.filter(o=>(o.situacao||'').toLowerCase()!=='pago').reduce((s,o)=>s+(num(o.valor)||0),0).toFixed(2),
                    destino: +destino.filter(p=>!/pago|cancelad/i.test(p.status||'')).reduce((s,p)=>s+(num(p.valor)||0),0).toFixed(2) },
};

// ─── saída ───────────────────────────────────────────────────────────────
const porCampo = {};
for (const d of divergencias) for (const f of d.difs) porCampo[f.campo] = (porCampo[f.campo] || 0) + 1;

const rel = { entidade: 'Bling · contas a receber', instantaneo: inst, origemExtraidaEm:
  JSON.parse(fs.readFileSync(path.join(P, 'bling/bling-financeiro.json'), 'utf8')).geradoEm,
  camada2: { origem: origem.length, destino: destino.length, conciliadosPorId: porId.size,
             ausentesNoDestino: ausentes.length, duplicadosNoDestino: duplicados.length,
             noDestinoSemOrigem: extras.length, destinoSemBlingId: semBlingId.length },
  camada3e6: { conciliadosIntegralmente: conciliados, comDivergencia: divergencias.length, porCampo },
  camada6: financeiro,
  equivalencias: porRegra, arredondamento,
  listas: { ausentes: ausentes.map(o => ({ blingId: o.id, cliente: o.nome, valor: o.valor, vencimento: o.vencimento, situacao: o.situacao })),
            duplicados: duplicados.map(([k, v]) => ({ blingId: k, quantas: v.length, ids: v.map(x => x.id) })),
            extras, divergencias },
};
fs.writeFileSync(path.join(__dirname, 'relatorios', 'bling-receber.json'), JSON.stringify(rel, null, 2));

const l = (a, b) => console.log('   ' + String(a).padEnd(38) + String(b).padStart(14));
console.log('BLING · CONTAS A RECEBER — conciliação registro a registro\n');
console.log('   origem : bling-financeiro.json  (' + rel.origemExtraidaEm + ')');
console.log('   destino: ' + inst + '\n');
console.log('── CAMADA 2 — identidade');
l('títulos na origem', origem.length);
l('títulos no destino', destino.length);
l('casados pelo id do Bling', porId.size);
l('AUSENTES no destino', ausentes.length);
l('DUPLICADOS no destino', duplicados.length);
l('no destino sem par na origem', extras.length);
l('no destino sem blingId', semBlingId.length);
console.log('\n── CAMADAS 3 e 6 — conteúdo, campo a campo');
l('CONCILIADOS (todos os campos)', conciliados);
l('DIVERGENTES', divergencias.length);
for (const [c, n] of Object.entries(porCampo).sort((a,b)=>b[1]-a[1])) l('   divergem em ' + c, n);
console.log('\n── equivalências aplicadas (regra documentada, não divergência)');
for (const [r, n] of Object.entries(porRegra)) l('   ' + r, n);
l('   arredondamento de 1 centavo', arredondamento.length);
console.log('\n── CAMADA 6 — totais reconstruídos dos registros');
for (const [k, v] of Object.entries(financeiro)) {
  const d = (v.origem - v.destino);
  console.log('   ' + k.padEnd(16) + 'origem ' + String(v.origem).padStart(12) + '   destino ' + String(v.destino).padStart(12)
    + '   ' + (Math.abs(d) < 0.005 ? '✓' : 'DIFERENÇA ' + d.toFixed(2)));
}
console.log('\nDetalhe em auditoria/relatorios/bling-receber.json');
