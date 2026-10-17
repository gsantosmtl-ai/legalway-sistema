// Peças compartilhadas da auditoria. Só leitura.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'instantaneo');
const P = path.join(__dirname, '..', 'planilhas');

// O Bling mistura dois formatos de número no MESMO registro:
//   "1.500,00" (brasileiro) em valor, "100.00" (americano) em valorPago.
// Decido pelo separador decimal: tem vírgula → o ponto é milhar.
const num = v => { if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const limpo = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(limpo); return Number.isFinite(n) ? n : null; };

const data = v => { if (!v) return null; const s = String(v).trim().slice(0, 10);
  if (/^0000/.test(s)) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (br) return br[3] + '-' + br[2] + '-' + br[1];
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

const cent = n => n == null ? null : Math.round(n * 100);
const txt = v => String(v == null ? '' : v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

function instantaneo() {
  const arq = fs.readdirSync(DIR).filter(f => f.startsWith('destino-')).sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(DIR, arq), 'utf8'));
  return { arq, d, bloco: k => { const b = d.armazenamento.find(x => x.chave === k); return b ? b.valor : null; } };
}
const origem = f => JSON.parse(fs.readFileSync(path.join(P, f), 'utf8'));
const gravar = (nome, obj) => fs.writeFileSync(path.join(__dirname, 'relatorios', nome), JSON.stringify(obj, null, 2));

// Conciliação genérica por identificador, campo a campo.
// `regras` deixa escrita cada equivalência semântica aceita — sem isso vira desculpa.
function conciliar({ origem, destino, idOrigem, idDestino, campos, regras = [] }) {
  const porId = new Map();
  for (const p of destino) { const k = idDestino(p); if (k == null || k === '') continue;
    if (!porId.has(k)) porId.set(k, []); porId.get(k).push(p); }
  const idsO = new Set(origem.map(idOrigem).map(String));
  const r = { origem: origem.length, destino: destino.length, casados: 0, conciliados: 0,
    ausentes: [], duplicados: [], sobrando: [], semId: destino.filter(p => !idDestino(p)).length,
    divergencias: [], equivalencias: {}, porCampo: {} };
  for (const [k, v] of porId) { if (v.length > 1) r.duplicados.push({ id: k, quantas: v.length }); if (!idsO.has(String(k))) r.sobrando.push(k); }
  for (const o of origem) {
    const lista = porId.get(String(idOrigem(o)));
    if (!lista) { r.ausentes.push(o); continue; }
    r.casados++;
    const p = lista[0], difs = [];
    for (const [nome, fo, fp] of campos) {
      const a = fo(o), b = fp(p);
      if (a == null && b == null) continue;
      if (a === b) continue;
      const regra = regras.find(x => x.quando(nome, a, b, o, p));
      if (regra) { r.equivalencias[regra.nome] = (r.equivalencias[regra.nome] || 0) + 1; continue; }
      difs.push({ campo: nome, origem: a, destino: b });
      r.porCampo[nome] = (r.porCampo[nome] || 0) + 1;
    }
    if (difs.length) r.divergencias.push({ id: String(idOrigem(o)), idSistema: p.id, difs });
    else r.conciliados++;
  }
  return r;
}

function imprimir(titulo, r, extra = {}) {
  const l = (a, b) => console.log('   ' + String(a).padEnd(40) + String(b).padStart(12));
  console.log('\n══ ' + titulo);
  console.log('── CAMADA 2 — identidade');
  l('na origem', r.origem); l('no destino', r.destino); l('casados por id', r.casados);
  l('AUSENTES no destino', r.ausentes.length);
  l('DUPLICADOS no destino', r.duplicados.length);
  l('no destino sem par na origem', r.sobrando.length);
  l('no destino sem id de origem', r.semId);
  console.log('── CAMADA 3 — conteúdo');
  l('CONCILIADOS (todos os campos)', r.conciliados);
  l('DIVERGENTES', r.divergencias.length);
  for (const [c, n] of Object.entries(r.porCampo).sort((a, b) => b[1] - a[1])) l('   divergem em ' + c, n);
  if (Object.keys(r.equivalencias).length) { console.log('── equivalências documentadas');
    for (const [k, n] of Object.entries(r.equivalencias)) l('   ' + k, n); }
  for (const [k, v] of Object.entries(extra)) {
    const d = v.origem - v.destino;
    console.log('   ' + k.padEnd(18) + 'origem ' + String(v.origem).padStart(12) + '   destino ' + String(v.destino).padStart(12)
      + '   ' + (Math.abs(d) < 0.005 ? '✓' : 'DIFERENÇA ' + d.toFixed(2)));
  }
}
module.exports = { num, data, cent, txt, instantaneo, origem, gravar, conciliar, imprimir, P };
