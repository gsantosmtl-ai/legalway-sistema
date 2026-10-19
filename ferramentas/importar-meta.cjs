#!/usr/bin/env node
// SOBE OS LEADS DO META QUE NUNCA CHEGARAM.
//
//   node ferramentas/importar-meta.cjs --sistema ~/Downloads/backup.json            → só simula
//   node ferramentas/importar-meta.cjs --sistema ~/Downloads/backup.json --gravar   → gera o arquivo
//
// Roda depois de cruzar-meta.cjs, que separa quem já está no sistema de quem
// nunca chegou. Aqui só os que nunca chegaram viram lead.
//
// O lead sai no MESMO formato que o webhook da Meta produz (leads-entrada.js:
// registrarToque), inclusive com `metaLeadId`. Isso importa por um motivo
// prático: quando as variáveis da Meta entrarem no Railway e o webhook
// começar a entregar, a checagem de `metaLeadId` no topo do registrarToque
// reconhece o que já está aqui e não duplica.
//
// O restore do sistema SUBSTITUI o bloco inteiro. Por isso o arquivo de saída
// leva a lista completa — os 1.157 que já existem, intocados, mais os novos no
// fim. Nenhum registro existente é alterado, nem reordenado.

const fs = require('fs');
const path = require('path');

const P = path.join(__dirname, 'planilhas');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const GRAVAR = process.argv.includes('--gravar');
const CHAVE = 'legalway-leads-v1';

const tel = v => { const d = String(v == null ? '' : v).replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : null; };
const mail = v => { const s = String(v == null ? '' : v).trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : null; };

// ---- entrada ----
const caminho = arg('--sistema', '');
if (!caminho || !fs.existsSync(caminho)) {
  console.error('Passe o backup do sistema com --sistema.');
  process.exit(1);
}
const perdidosArq = path.join(P, 'meta', 'perdidos.json');
if (!fs.existsSync(perdidosArq)) {
  console.error('Rode antes: node ferramentas/cruzar-meta.cjs --sistema <backup>');
  process.exit(1);
}

const S = JSON.parse(fs.readFileSync(caminho, 'utf8'));
const blocoAtual = (S.armazenamento || []).find(x => x.chave === CHAVE);
if (!blocoAtual) { console.error('O backup não tem o bloco ' + CHAVE); process.exit(1); }
let existentes = blocoAtual.valor;
if (typeof existentes === 'string') existentes = JSON.parse(existentes);
if (!Array.isArray(existentes)) { console.error('Bloco ' + CHAVE + ' não é lista.'); process.exit(1); }

const { leads: perdidos } = JSON.parse(fs.readFileSync(perdidosArq, 'utf8'));

// ---- rede de segurança ----
// Entre o cruzamento e agora alguém pode ter cadastrado a pessoa à mão, e o
// webhook pode ter sido ligado. Conferir de novo contra o backup em mãos.
const jaTemTel = new Set(), jaTemMail = new Set(), jaTemMetaId = new Set();
for (const l of existentes) {
  const t = tel(l.telefone); if (t) jaTemTel.add(t);
  const m = mail(l.email); if (m) jaTemMail.add(m);
  if (l.metaLeadId) jaTemMetaId.add(String(l.metaLeadId));
}

const novos = [];
const pulados = { jaExiste: 0, semContato: 0, repetidoNoLote: 0 };
const noLote = new Set();

for (const l of perdidos) {
  const t = tel(l.telefone), m = mail(l.email);
  if (!t && !m) { pulados.semContato++; continue; }
  if (jaTemMetaId.has(String(l.id)) || (t && jaTemTel.has(t)) || (m && jaTemMail.has(m))) { pulados.jaExiste++; continue; }
  const chave = t || m;
  if (noLote.has(chave)) { pulados.repetidoNoLote++; continue; }
  noLote.add(chave);

  const quando = l.quando ? new Date(l.quando + 'T12:00:00Z').toISOString() : new Date().toISOString();
  novos.push({
    // mesmo gerador de id do servidor, para o formato não destoar
    id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    nome: (l.nome || '').trim() || '(sem nome)',
    telefone: l.telefone || '',
    email: l.email || '',
    servico: '',
    campanha: l.campanha || '',
    origens: ['facebook'],
    entrada: quando,
    responsavel: null,
    metaLeadId: String(l.id),
    historico: [{
      tipo: 'Sistema', quando,
      texto: `Preencheu o formulário "${l.formulario || 'do Meta'}"`
        + (l.campanha ? ` — campanha "${l.campanha}"` : '')
        + '. Recuperado do Meta em ' + new Date().toISOString().slice(0, 10)
        + ' — não havia chegado ao sistema.',
    }],
  });
}

// ---- relatório ----
const pad = n => String(n).padStart(6);
console.log('');
console.log('IMPORTAR LEADS DO META' + (GRAVAR ? '' : '   (simulação — nada foi gerado)'));
console.log('');
console.log('  ' + pad(existentes.length) + '  leads já no sistema (ficam intocados)');
console.log('  ' + pad(perdidos.length) + '  marcados como perdidos pelo cruzamento');
console.log('  ' + pad(novos.length) + '  ENTRAM como lead novo   ←');
if (pulados.jaExiste) console.log('  ' + pad(pulados.jaExiste) + '  pulados: já existem no backup atual');
if (pulados.repetidoNoLote) console.log('  ' + pad(pulados.repetidoNoLote) + '  pulados: repetidos dentro do próprio lote');
if (pulados.semContato) console.log('  ' + pad(pulados.semContato) + '  pulados: sem telefone e sem e-mail');
console.log('');
console.log('  ' + pad(existentes.length + novos.length) + '  total do bloco depois da importação');
console.log('');

if (novos.length) {
  const porMes = {};
  for (const l of novos) { const m = (l.entrada || '').slice(0, 7); porMes[m] = (porMes[m] || 0) + 1; }
  console.log('  POR MÊS DE ENTRADA');
  for (const [m, n] of Object.entries(porMes).sort()) console.log('    ' + m + '  ' + String(n).padStart(4));
  console.log('');
  console.log('  AMOSTRA (5 primeiros)');
  for (const l of novos.slice(0, 5)) {
    console.log('    ' + (l.nome || '').slice(0, 28).padEnd(30) + (l.telefone || '').padEnd(18) + (l.email || '').slice(0, 30));
  }
  console.log('');
}

if (!GRAVAR) {
  console.log('  Para gerar o arquivo:  node ferramentas/importar-meta.cjs --sistema <backup> --gravar');
  console.log('');
  process.exit(0);
}

// ---- saída ----
// Só o bloco de leads. Nenhum outro bloco entra, então nada mais é substituído.
const saida = {
  formato: 'legalway-backup-v1',
  geradoEm: new Date().toISOString(),
  geradoPor: 'importar-meta.cjs',
  armazenamento: [{ chave: CHAVE, valor: existentes.concat(novos) }],
};
const arq = path.join(P, 'meta', 'subir-leads-meta.json');
fs.writeFileSync(arq, JSON.stringify(saida));
const mb = (fs.statSync(arq).size / 1048576).toFixed(1);
console.log('  Arquivo gerado: ferramentas/planilhas/meta/subir-leads-meta.json  (' + mb + ' MB)');
console.log('  Contém o bloco ' + CHAVE + ' com ' + (existentes.length + novos.length) + ' leads.');
console.log('');
console.log('  Para subir: Configurações → Backup → "Restaurar de um backup…" e escolher esse arquivo.');
console.log('  Só esse bloco é tocado. Tenha o backup de hoje guardado antes.');
console.log('');
