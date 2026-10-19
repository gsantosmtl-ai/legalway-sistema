#!/usr/bin/env node
// QUANTOS LEADS DO META NUNCA CHEGARAM EM LUGAR NENHUM.
//
//   node ferramentas/cruzar-meta.cjs --sistema ~/Downloads/backup.json
//
// O Meta guarda todo lead de formulário. O Kommo só tem o que a integração
// conseguiu entregar, e o sistema só tem o que veio do Kommo. Quem caiu no
// meio do caminho nunca foi atendido — e ninguém sabia quantos eram.
//
// Casamento por telefone e por e-mail, nessa ordem. Telefone é a chave forte:
// o formulário do Meta pede WhatsApp e o Kommo guarda o mesmo número. O e-mail
// pega o resto. Nome NÃO entra: homônimo é comum e o mandato da auditoria é
// explícito — não criar vínculo por semelhança de nome.
//
// Os CSV do Meta são UTF-16 com tabulação. Não são vírgula, não são UTF-8.
//
// Não grava nada. Só conta e lista.

const fs = require('fs');
const path = require('path');

const P = path.join(__dirname, 'planilhas');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const existe = f => { try { return fs.existsSync(f); } catch (e) { return false; } };

// ---- normalização das chaves ----
// O Meta devolve +1 407 555 0110; o Kommo guarda (407) 555-0110. Os últimos
// 10 dígitos são o que sobra igual nos dois — e bastam nos EUA e no Brasil.
const tel = v => { const d = String(v == null ? '' : v).replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : null; };
const mail = v => { const s = String(v == null ? '' : v).trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : null; };

// ---- leitura do CSV do Meta ----
function lerMeta(arquivo) {
  const buf = fs.readFileSync(arquivo);
  // UTF-16LE: ou tem o BOM FF FE na frente, ou tem byte zero depois do 1º caractere.
  const utf16 = (buf.length > 1 && buf[0] === 0xFF && buf[1] === 0xFE)
             || (buf.length > 2 && buf[1] === 0 && buf[0] !== 0);
  const txt = (utf16 ? buf.toString('utf16le') : buf.toString('utf8')).replace(/^﻿/, '');
  const linhas = txt.split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return [];
  const cab = linhas[0].split('\t').map(c => c.replace(/^"|"$/g, '').trim());
  // Cada formulário nomeia as perguntas do seu jeito: o "Formulario Captacao"
  // usa whatsapp_number/Email/Nome completo, os três "EB" usam phone_number/
  // email/full_name. Procurar por apelido em vez de nome exato, senão o
  // formulário inteiro entra sem telefone e vira falso "não verificável".
  const col = (...nomes) => {
    for (const n of nomes) { const i = cab.findIndex(c => c.toLowerCase() === n.toLowerCase()); if (i > -1) return i; }
    return -1;
  };
  const iId = col('id'), iQuando = col('created_time');
  const iNome = col('Nome completo', 'full_name', 'nome', 'name');
  const iTel  = col('whatsapp_number', 'phone_number', 'telefone', 'phone');
  const iMail = col('Email', 'email', 'e-mail');
  const iForm = col('form_name'), iCamp = col('campaign_name');
  return linhas.slice(1).map(l => {
    const c = l.split('\t').map(x => x.replace(/^"|"$/g, ''));
    return {
      id: c[iId], quando: (c[iQuando] || '').slice(0, 10),
      nome: c[iNome] || '', telefone: c[iTel] || '', email: c[iMail] || '',
      formulario: c[iForm] || '', campanha: c[iCamp] || '',
    };
  }).filter(l => l.id);
}

// ---- lado do destino ----
const caminhoSistema = arg('--sistema', '');
if (!caminhoSistema || !existe(caminhoSistema)) {
  console.error('Passe o backup do sistema com --sistema (Configurações → Backup → "só os dados").');
  process.exit(1);
}
const S = JSON.parse(fs.readFileSync(caminhoSistema, 'utf8'));
const bloco = chave => {
  const b = (S.armazenamento || []).find(x => x.chave === chave);
  if (!b) return [];
  let v = b.valor;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
  return Array.isArray(v) ? v : [];
};

const leads = bloco('legalway-leads-v1');
const sdr = bloco('legalway-sdr-v1');
const clientes = bloco('legalway-clientes-v1');

const telsDestino = new Set(), mailsDestino = new Set();
const guardar = r => {
  for (const campo of ['telefone', 'tel', 'whatsapp', 'celular']) { const t = tel(r[campo]); if (t) telsDestino.add(t); }
  for (const campo of ['email', 'mail', 'eMail']) { const m = mail(r[campo]); if (m) mailsDestino.add(m); }
};
leads.forEach(guardar); sdr.forEach(guardar); clientes.forEach(guardar);

// ---- cruzamento ----
const arquivos = existe(path.join(P, 'meta')) ? fs.readdirSync(path.join(P, 'meta')).filter(f => f.endsWith('.csv')) : [];
if (!arquivos.length) { console.error('Nenhum CSV em ferramentas/planilhas/meta/'); process.exit(1); }

let todos = [];
const porArquivo = [];
for (const f of arquivos) {
  const l = lerMeta(path.join(P, 'meta', f));
  porArquivo.push({ arquivo: f, n: l.length });
  todos = todos.concat(l);
}

// O mesmo WhatsApp pode preencher o formulário mais de uma vez. Para "quantas
// PESSOAS ficaram sem atendimento", o que conta é o contato, não o envio.
const vistos = new Set();
const pessoas = [];
for (const l of todos) {
  const chave = tel(l.telefone) || mail(l.email) || ('id:' + l.id);
  if (vistos.has(chave)) continue;
  vistos.add(chave);
  pessoas.push(l);
}

const achados = [], perdidos = [], semChave = [];
for (const l of pessoas) {
  const t = tel(l.telefone), m = mail(l.email);
  if (!t && !m) { semChave.push(l); continue; }
  if ((t && telsDestino.has(t)) || (m && mailsDestino.has(m))) achados.push(l);
  else perdidos.push(l);
}

// ---- relatório ----
const fmt = n => String(n).padStart(6);
const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '—';
console.log('');
console.log('LEADS DO META × O QUE ESTÁ NO SISTEMA');
console.log('');
for (const a of porArquivo) console.log('  ' + fmt(a.n) + '  ' + a.arquivo.replace(/_Leads.*/, ''));
console.log('  ' + '-'.repeat(60));
console.log('  ' + fmt(todos.length) + '  envios de formulário');
console.log('  ' + fmt(pessoas.length) + '  pessoas distintas (mesmo WhatsApp conta uma vez)');
console.log('');
console.log('  ' + fmt(achados.length) + '  JÁ ESTÃO no sistema      ' + pct(achados.length, pessoas.length));
console.log('  ' + fmt(perdidos.length) + '  NUNCA CHEGARAM           ' + pct(perdidos.length, pessoas.length) + '   ←');
if (semChave.length) console.log('  ' + fmt(semChave.length) + '  sem telefone nem e-mail  (não verificável)');
console.log('');

if (perdidos.length) {
  const porAno = {};
  for (const l of perdidos) { const m = (l.quando || '').slice(0, 7); porAno[m] = (porAno[m] || 0) + 1; }
  console.log('  QUANDO SE PERDERAM');
  for (const [mes, n] of Object.entries(porAno).sort()) {
    console.log('    ' + mes + '  ' + String(n).padStart(4) + '  ' + '█'.repeat(Math.min(50, Math.round(n / 5))));
  }
  console.log('');
  const porForm = {};
  for (const l of perdidos) porForm[l.formulario || '(sem)'] = (porForm[l.formulario || '(sem)'] || 0) + 1;
  console.log('  POR FORMULÁRIO');
  for (const [f, n] of Object.entries(porForm).sort((a, b) => b[1] - a[1])) {
    console.log('    ' + String(n).padStart(5) + '  ' + f);
  }
  console.log('');
  const saida = path.join(P, 'meta', 'perdidos.json');
  fs.writeFileSync(saida, JSON.stringify({ geradoEm: new Date().toISOString(), total: perdidos.length, leads: perdidos }, null, 1));
  console.log('  Lista completa: ferramentas/planilhas/meta/perdidos.json');
  console.log('  (gitignorada — tem nome, telefone e e-mail de cliente)');
}
console.log('');
