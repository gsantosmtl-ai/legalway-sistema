#!/usr/bin/env node
// SOBE O QUE ENTROU NO KOMMO DEPOIS DA VIRADA.
//
//   node ferramentas/importar-kommo-delta.cjs --sistema ~/Downloads/backup.json
//   node ferramentas/importar-kommo-delta.cjs --sistema ~/Downloads/backup.json --gravar
//   ... --com-perdidos    inclui também os que o Kommo marcou como perdidos
//
// Faz duas coisas diferentes, e a distinção importa:
//
//   INSERE  quem não existe em lugar nenhum — vira lead novo na caixa de entrada.
//   LIGA    quem já existe (mesmo telefone) mas sem kommoId — só carimba o id.
//
// A segunda é a que evita o problema de amanhã. A maioria dos leads novos do
// Kommo são as mesmas pessoas que já subiram pelo Meta: o formulário entregou
// para os dois lados. Sem o carimbo, a próxima sincronização do Kommo não
// reconheceria ninguém e criaria tudo de novo, em dobro.
//
// Ligar NÃO sobrescreve nada: só preenche kommoId quando está vazio, acrescenta
// a origem se faltar e escreve uma linha no histórico. Nenhum campo existente
// com conteúdo é alterado — é a mesma regra do registrarToque do servidor.
//
// Perdidos ficam de fora por padrão, seguindo a decisão da migração (os 1.053
// que não entraram). Entram com --com-perdidos, se alguém decidir isso.

const fs = require('fs');
const path = require('path');

const P = path.join(__dirname, 'planilhas');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const GRAVAR = process.argv.includes('--gravar');
const COM_PERDIDOS = process.argv.includes('--com-perdidos');
const CHAVE = 'legalway-leads-v1';

const dig = s => { const d = String(s == null ? '' : s).replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : null; };
const mail = v => { const s = String(v == null ? '' : v).trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : null; };
const categoria = etapa => {
  const e = String(etapa || '').toLowerCase();
  if (/closed - won|ganho/.test(e)) return 'ganho';
  if (/lost|perdid/.test(e)) return 'perdido';
  return 'em andamento';
};

const caminho = arg('--sistema', '');
if (!caminho || !fs.existsSync(caminho)) { console.error('Passe o backup com --sistema.'); process.exit(1); }
const fonte = path.join(P, 'kommo-delta', 'kommo-novos.json');
if (!fs.existsSync(fonte)) { console.error('Falta ' + fonte); process.exit(1); }

const S = JSON.parse(fs.readFileSync(caminho, 'utf8'));
const bloco = (S.armazenamento || []).find(x => x.chave === CHAVE);
if (!bloco) { console.error('Backup sem o bloco ' + CHAVE); process.exit(1); }
let leads = bloco.valor;
if (typeof leads === 'string') leads = JSON.parse(leads);
// cópia profunda: o original fica intacto para a conferência do fim
const resultado = JSON.parse(JSON.stringify(leads));

const { leads: doKommo } = JSON.parse(fs.readFileSync(fonte, 'utf8'));

// índices do que já existe
const porTel = new Map(), porMail = new Map(), kommoIds = new Set();
resultado.forEach((l, i) => {
  const t = dig(l.telefone); if (t && !porTel.has(t)) porTel.set(t, i);
  const m = mail(l.email); if (m && !porMail.has(m)) porMail.set(m, i);
  if (l.kommoId) kommoIds.add(String(l.kommoId));
});

const inseridos = [], ligados = [], pulados = { jaTemKommoId: 0, perdido: 0, semContato: 0 };
const agora = new Date().toISOString();

for (const k of doKommo) {
  const cat = categoria(k.etapa);
  if (cat === 'perdido' && !COM_PERDIDOS) { pulados.perdido++; continue; }
  if (kommoIds.has(String(k.kommoId))) { pulados.jaTemKommoId++; continue; }

  const t = dig(k.telefone), m = mail(k.email);
  if (!t && !m) { pulados.semContato++; continue; }

  const i = (t && porTel.has(t)) ? porTel.get(t) : (m && porMail.has(m) ? porMail.get(m) : -1);

  if (i >= 0) {
    // LIGAR: a pessoa já está aqui, só não tinha o id do Kommo.
    const l = resultado[i];
    if (!l.kommoId) {
      l.kommoId = String(k.kommoId);
      l.origens = Array.from(new Set([...(l.origens || []), 'whatsapp']));
      l.historico = l.historico || [];
      l.historico.push({ tipo: 'Sistema', quando: agora,
        texto: `Encontrado também no Kommo (${k.etapa}). Ligado ao lead que já existia — mesmo telefone.` });
      ligados.push({ nome: l.nome, kommoId: k.kommoId, etapa: k.etapa });
    } else { pulados.jaTemKommoId++; }
    continue;
  }

  // INSERIR: ninguém com esse contato.
  const quando = k.criadoEm || agora;
  const novo = {
    id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    nome: (k.nome || '').trim() || '(sem nome)',
    telefone: k.telefone || '',
    email: k.email || '',
    servico: '',
    campanha: '',
    origens: ['whatsapp'],
    entrada: quando,
    responsavel: null,
    kommoId: String(k.kommoId),
    historico: [{ tipo: 'Sistema', quando,
      texto: `Veio do Kommo (${k.etapa}). Recuperado em ${agora.slice(0, 10)} — entrou lá depois da virada e não estava no sistema.` }],
  };
  resultado.push(novo);
  if (t) porTel.set(t, resultado.length - 1);
  if (m) porMail.set(m, resultado.length - 1);
  kommoIds.add(String(k.kommoId));
  inseridos.push(novo);
}

// ---- relatório ----
const pad = n => String(n).padStart(5);
console.log('');
console.log('KOMMO — O QUE ENTROU DEPOIS DA VIRADA' + (GRAVAR ? '' : '   (simulação)'));
console.log('');
console.log('  ' + pad(doKommo.length) + '  leads criados no Kommo a partir de 12/10');
console.log('  ' + pad(inseridos.length) + '  INSERIDOS como lead novo         ←');
console.log('  ' + pad(ligados.length) + '  LIGADOS a quem já estava aqui    ← só carimba o kommoId');
if (pulados.perdido) console.log('  ' + pad(pulados.perdido) + '  deixados de fora: perdidos no Kommo' + (COM_PERDIDOS ? '' : '  (use --com-perdidos para incluir)'));
if (pulados.jaTemKommoId) console.log('  ' + pad(pulados.jaTemKommoId) + '  pulados: já tinham kommoId');
if (pulados.semContato) console.log('  ' + pad(pulados.semContato) + '  pulados: sem telefone e sem e-mail');
console.log('');
console.log('  ' + pad(leads.length) + '  leads antes');
console.log('  ' + pad(resultado.length) + '  leads depois');
console.log('');

if (inseridos.length) {
  console.log('  OS QUE ENTRAM');
  for (const l of inseridos) console.log('    ' + (l.nome || '').slice(0, 26).padEnd(28) + (l.telefone || '').padEnd(16) + l.entrada.slice(0, 10));
  console.log('');
}

// conferência: nenhum lead existente pode ter perdido nada
let alterados = 0, quebrados = 0;
for (let i = 0; i < leads.length; i++) {
  const a = leads[i], b = resultado[i];
  if (a.id !== b.id) { quebrados++; continue; }
  const semHist = o => { const c = { ...o }; delete c.historico; delete c.kommoId; delete c.origens; return c; };
  if (JSON.stringify(semHist(a)) !== JSON.stringify(semHist(b))) quebrados++;
  else if (JSON.stringify(a) !== JSON.stringify(b)) alterados++;
}
console.log('  CONFERÊNCIA DOS QUE JÁ EXISTIAM');
console.log('    ' + pad(leads.length - alterados) + '  intocados');
console.log('    ' + pad(alterados) + '  só ganharam kommoId / origem / linha de histórico');
console.log('    ' + pad(quebrados) + '  com outro campo alterado' + (quebrados ? '   ✗ ERRO' : '   ✓'));
console.log('');
if (quebrados) { console.error('  Abortado: algum registro existente seria alterado além do previsto.'); process.exit(1); }

if (!GRAVAR) {
  console.log('  Para gerar:  ... --gravar');
  console.log('');
  process.exit(0);
}

const saida = { formato: 'legalway-backup-v1', geradoEm: agora, geradoPor: 'importar-kommo-delta.cjs',
  armazenamento: [{ chave: CHAVE, valor: resultado }] };
const arq = path.join(P, 'kommo-delta', 'subir-kommo.json');
fs.writeFileSync(arq, JSON.stringify(saida));
console.log('  Arquivo: ferramentas/planilhas/kommo-delta/subir-kommo.json  ('
  + (fs.statSync(arq).size / 1048576).toFixed(1) + ' MB, ' + resultado.length + ' leads)');
console.log('');
