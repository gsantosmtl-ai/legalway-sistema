#!/usr/bin/env node
// Lê o extrato do Bling e monta as transferências entre contas, mais o saldo
// inicial que falta para cada conta bater com o saldo real.
//
//   node ferramentas/importar-transferencias.cjs            → simula
//   node ferramentas/importar-transferencias.cjs --gravar   → gera o arquivo
const fs = require('fs');
const P = 'ferramentas/planilhas';
const n = v => Number(String(v ?? '0').replace(/\./g,'').replace(',','.')) || 0;
const data = s => { const t=String(s||'').trim(); return /^\d{2}\/\d{2}\/\d{4}$/.test(t) ? t.split('/').reverse().join('-') : t.slice(0,10); };
let seq = 0; const uid = p => `${p}bl${Date.now().toString(36)}${(seq++).toString(36)}`;

// Nome da conta no Bling → nome no sistema.
const CONTA = {
  'TRUIST - EUA': 'Truist',
  'WISE USD': 'Wise',
  'Caixa': 'Caixa',
  'INVESTIMENTO TRUIST': 'Investimento Truist',
  'C6 PIX BR': 'C6 PIX BR (Brasil)',
  'Nubank': 'Nubank (Brasil)',
};
// O histórico do Bling diz a origem e o destino em texto:
// "Transferência Truist - EUA -> Wise USD". É daí que sai o par.
const APELIDO = [
  [/truist\s*-?\s*eua/i,       'Truist'],
  [/investimento\s*truist/i,   'Investimento Truist'],
  [/wise/i,                    'Wise'],
  [/c6/i,                      'C6 PIX BR (Brasil)'],
  [/caixa/i,                   'Caixa'],
  [/nubank/i,                  'Nubank (Brasil)'],
];
function qualConta(texto){
  // "Investimento Truist" contém "Truist": o mais específico vem primeiro.
  for (const [re, nome] of APELIDO) if (re.test(texto)) return nome;
  return null;
}

const ext = JSON.parse(fs.readFileSync(`${P}/bling/bling-extrato.json`,'utf8')).extrato;

// Cada transferência aparece duas vezes, uma em cada conta. Fica a perna de
// SAÍDA, que é a que sabe de onde o dinheiro saiu.
const transferencias = [];
const semPar = [];
for (const [contaBling, movs] of Object.entries(ext)) {
  const nomeConta = CONTA[contaBling] || contaBling;
  for (const m of movs) {
    if (!/transfer/i.test(m.descricao || '')) continue;
    const saida = n(m.saida);
    if (saida <= 0) continue;                 // a perna de entrada é a outra metade
    const hist = String(m.observacoes || m.nome || '');
    const seta = hist.split(/->|→/);
    const destino = seta.length > 1 ? qualConta(seta[1]) : null;
    if (!destino) { semPar.push({ conta: nomeConta, data: m.data, valor: saida, hist }); continue; }
    transferencias.push({
      id: uid('tr'), de: nomeConta, para: destino, valor: saida, data: data(m.data),
      observacao: hist.replace(/^Transfer[êe]ncia\s*/i,'').trim(),
      criadoEm: new Date().toISOString(), origemBling: m.id,
    });
  }
}

// Saldo real de cada conta = entradas − saídas do extrato.
const saldoReal = {};
for (const [contaBling, movs] of Object.entries(ext)) {
  if (!movs.length) continue;
  saldoReal[CONTA[contaBling] || contaBling] =
    movs.reduce((s,m)=>s+n(m.entrada),0) - movs.reduce((s,m)=>s+n(m.saida),0);
}

console.log('TRANSFERÊNCIAS ENCONTRADAS:', transferencias.length);
const pares = {};
transferencias.forEach(t => { const k = t.de+' → '+t.para; pares[k] = pares[k] || {n:0,v:0}; pares[k].n++; pares[k].v += t.valor; });
Object.entries(pares).sort((a,b)=>b[1].v-a[1].v).forEach(([k,o]) =>
  console.log('  ' + k.padEnd(38) + String(o.n).padStart(3) + 'x   $' + o.v.toFixed(2).padStart(11)));
if (semPar.length) {
  console.log('\nSAÍDAS MARCADAS COMO TRANSFERÊNCIA SEM DESTINO NO TEXTO:', semPar.length,
              '· $' + semPar.reduce((s,x)=>s+x.valor,0).toFixed(2));
  semPar.slice(0,8).forEach(x => console.log('  ' + x.conta.padEnd(12) + x.data + '  $' + String(x.valor.toFixed(2)).padStart(10) + '  ' + x.hist.slice(0,52)));
  console.log('  (estas NÃO viram transferência — ficam como saída, que é o que o extrato diz)');
}
console.log('\nSALDO REAL (entradas − saídas do extrato):');
Object.entries(saldoReal).forEach(([k,v]) => console.log('  ' + k.padEnd(24) + '$' + v.toFixed(2).padStart(12)));

if (!process.argv.includes('--gravar')) {
  console.log('\nSimulação. Rode com --gravar para gerar o arquivo.\n');
  process.exit(0);
}
fs.writeFileSync('ferramentas/importar-transferencias.json', JSON.stringify({
  formato: 'legalway-backup-v1',
  gerado: new Date().toISOString(),
  observacao: 'Transferências entre contas, extraídas do extrato do Bling',
  armazenamento: [{ chave: 'legalway-transferencias-v1', valor: transferencias }],
}, null, 1));
console.log('\nArquivo: ferramentas/importar-transferencias.json\n');
