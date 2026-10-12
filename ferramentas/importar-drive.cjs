#!/usr/bin/env node
// Traz uma leva de pastas do Drive para dentro do sistema.
//
//   node ferramentas/importar-drive.cjs --pasta ~/drive-legalway            → simula
//   node ferramentas/importar-drive.cjs --pasta ~/drive-legalway --gravar   → gera os arquivos
//
// Cada pasta do Drive é um cliente. O nome da pasta carrega o estado:
//   "Fulano"              em andamento
//   "Fulano - OK"         processo concluído
//   "Fulano - CANCELADO"  cancelado
//
// Dentro, o arquivo "Contrato <Nome>" é o contrato assinado. "NOVO Contrato"
// é uma renegociação: vira o vigente, e o anterior fica no histórico do
// cliente (combinado com a Tatiane em 11/10/2026).
//
// O resto dos arquivos entra como anexo do processo do cliente. Quando ele
// tem mais de um processo, vai no do serviço que o contrato indica; sem isso,
// no único que existir.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = path.join(__dirname, 'planilhas');
const R = require('./regras-trello.cjs');

const arg = f => process.argv.includes(f);
const valor = f => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const n = v => Number(v || 0);

const RAIZ = (valor('--pasta') || '').replace(/^~/, process.env.HOME);
if (!RAIZ || !fs.existsSync(RAIZ)) { console.error('Use --pasta <caminho da leva descompactada>'); process.exit(1); }

const BASE = valor('--base') || 'importar-trello-lote5-parte15de15-registros.json';
const estado = JSON.parse(fs.readFileSync(path.join(__dirname, BASE), 'utf8'));
const bloco = k => (estado.armazenamento.find(x => x.chave === k) || {}).valor || [];
const processos = bloco('legalway-processos-documentacao-v1').map(p => ({ ...p }));
const clientes = bloco('legalway-clientes-v1').map(c => ({ ...c }));

const blingArq = path.join(__dirname, 'importar-bling-completo.json');
const contratos = fs.existsSync(blingArq)
  ? (JSON.parse(fs.readFileSync(blingArq, 'utf8')).armazenamento.find(x => x.chave === 'legalway-contratos-v1') || {}).valor || []
  : [];

let seq = 0;
const uid = p => `${p}dr${Date.now().toString(36)}${(seq++).toString(36)}`;
const idDeArquivo = (caminho) => crypto.createHash('sha256').update('drive:' + caminho).digest('hex').slice(0, 32);
const agora = () => new Date().toISOString();

// ─── ÍNDICES ───────────────────────────────────────────────────────────────
const porNome = new Map(), porFz = new Map();
for (const c of clientes) {
  porNome.set(R.norm(c.nome), c);
  const f = R.fuzzy(c.nome); if (f && !porFz.has(f)) porFz.set(f, c);
}
// impressões digitais que o processo já tem, para não duplicar com o Trello
const jaTem = new Map();
processos.forEach((p, i) => {
  const d = new Set();
  for (const a of p.anexos || []) if (a.digital) d.add(a.digital);
  for (const x of p.checklist || []) if (x.digital) d.add(x.digital);
  jaTem.set(i, d);
});

const TIPO = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic', '.tiff': 'image/tiff',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain', '.csv': 'text/csv', '.zip': 'application/zip',
  '.pages': 'application/x-iwork-pages-sffpages',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg',
};

const arquivos = [];
const rel = { clientesNovos: [], semCliente: [], contratos: [], novosContratos: [], cancelados: [],
              concluidos: [], anexos: 0, repetidos: 0, bytes: 0, semProcesso: [], tipoDesconhecido: [], grandes: [] };

// ─── VARREDURA ─────────────────────────────────────────────────────────────
for (const pasta of fs.readdirSync(RAIZ).filter(d => fs.statSync(path.join(RAIZ, d)).isDirectory())) {
  const marca = /\s*-\s*CANCELAD[OA]\s*$/i.test(pasta) ? 'cancelado'
              : /\s*-\s*OK\s*$/i.test(pasta) ? 'concluido' : null;
  const nome = pasta.replace(/\s*-\s*(OK|CANCELAD[OA])\s*$/i, '').trim();

  let cliente = porNome.get(R.norm(nome)) || porFz.get(R.fuzzy(nome));
  if (!cliente) {
    cliente = { id: uid('cl'), nome, telefone: '', email: '', endereco: '', criadoEm: agora(),
                contratoIds: [], historico: [{ quando: agora(), texto: 'Criado na importação do Drive' }] };
    clientes.push(cliente);
    porNome.set(R.norm(nome), cliente);
    rel.clientesNovos.push(nome);
  }
  if (marca === 'cancelado') rel.cancelados.push(cliente.nome);
  if (marca === 'concluido') rel.concluidos.push(cliente.nome);

  // em qual processo os arquivos entram
  const meus = processos.map((p, i) => ({ p, i })).filter(x => R.norm(x.p.clienteNome) === R.norm(cliente.nome));
  if (!meus.length) { rel.semProcesso.push(cliente.nome); }
  const alvo = meus.length === 1 ? meus[0] : null;

  for (const f of fs.readdirSync(path.join(RAIZ, pasta))) {
    if (f.startsWith('.')) continue;
    const cheio = path.join(RAIZ, pasta, f);
    if (!fs.statSync(cheio).isFile()) continue;
    const buf = fs.readFileSync(cheio);
    if (!buf.length) continue;

    const ext = path.extname(f).toLowerCase();
    const tipo = TIPO[ext] || (buf.slice(0,4).toString('latin1') === '%PDF' ? 'application/pdf' : null);
    if (!tipo) { rel.tipoDesconhecido.push(pasta + ' › ' + f); continue; }

    const LIMITE = Number(valor('--ate-mb') || 0) * 1048576;
    if (LIMITE && buf.length > LIMITE) { rel.grandes.push({ pasta, f, mb: +(buf.length/1048576).toFixed(1) }); continue; }

    const digital = crypto.createHash('sha1').update(buf.toString('base64')).digest('hex');
    const ehContrato = /^(novo\s+)?contrato\b/i.test(f);
    const ehNovo = /^novo\s+contrato\b/i.test(f);

    if (alvo) {
      if (jaTem.get(alvo.i).has(digital)) { rel.repetidos++; continue; }
      jaTem.get(alvo.i).add(digital);
    }

    const id = idDeArquivo(pasta + '/' + f);
    arquivos.push({ id, nome: f, tipo, tamanho: buf.length, conteudo: buf.toString('base64'),
                    criado_em: fs.statSync(cheio).mtime.toISOString(), criado_por: 'Importado do Drive' });
    rel.anexos++; rel.bytes += buf.length;

    const anexo = { arquivoId: id, nome: f, tipo, tamanho: buf.length, digital,
                    url: '/api/arquivos/' + id, origem: 'Drive', quando: fs.statSync(cheio).mtime.toISOString(),
                    pastaNoDrive: pasta };
    if (ehContrato) { anexo.eContrato = true; anexo.vigente = ehNovo || undefined;
                      (ehNovo ? rel.novosContratos : rel.contratos).push(cliente.nome); }

    if (alvo) { alvo.p.anexos = [...(alvo.p.anexos || []), anexo]; }
    else {
      // sem processo único: guarda no cliente, para a Vitória encaixar depois
      cliente.anexosSemProcesso = [...(cliente.anexosSemProcesso || []), anexo];
    }
  }
}

// ─── RELATÓRIO ─────────────────────────────────────────────────────────────
const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
console.log('\nDRIVE — leva de ' + RAIZ);
console.log('  arquivos             : ' + rel.anexos + '  ·  ' + mb(rel.bytes) +
            (rel.repetidos ? '   (' + rel.repetidos + ' já estavam no sistema, pelo Trello)' : ''));
console.log('  contratos            : ' + rel.contratos.length + (rel.novosContratos.length ? '  (+' + rel.novosContratos.length + ' "NOVO Contrato")' : ''));
console.log('  pastas concluídas    : ' + rel.concluidos.length);
console.log('  pastas canceladas    : ' + rel.cancelados.length);
console.log('  clientes criados     : ' + rel.clientesNovos.length);
if (rel.clientesNovos.length) rel.clientesNovos.forEach(x => console.log('     + ' + x));
if (rel.novosContratos.length) { console.log('\n  CONTRATO RENEGOCIADO (o novo vira o vigente):'); rel.novosContratos.forEach(x => console.log('     ' + x)); }
if (rel.cancelados.length) { console.log('\n  CANCELADOS:'); rel.cancelados.forEach(x => console.log('     ' + x)); }
if (rel.semProcesso.length) { console.log('\n  ⚠ SEM UM PROCESSO ÚNICO — arquivos guardados no cliente, para encaixar depois:'); [...new Set(rel.semProcesso)].forEach(x => console.log('     ' + x)); }
if (rel.grandes.length) {
  console.log('\n  DEIXADOS PARA A SEGUNDA RODADA (grandes demais para a ponte do navegador):');
  rel.grandes.forEach(x => console.log('     ' + String(x.mb).padStart(6) + ' MB  ' + x.pasta + ' › ' + x.f));
}
if (rel.tipoDesconhecido.length) { console.log('\n  ⚠ TIPO NÃO RECONHECIDO (fora):'); rel.tipoDesconhecido.forEach(x => console.log('     ' + x)); }

if (!arg('--gravar')) { console.log('\nSimulação. Rode com --gravar para gerar os arquivos.\n'); process.exit(0); }

// ─── GRAVAÇÃO EM FATIAS ────────────────────────────────────────────────────
const rotulo = valor('--rotulo') || 'drive';
const LIM = Number(valor('--fatias') || 40) * 1048576;
const pedacos = [[]]; let peso = 0;
for (const a of arquivos) {
  const t = a.conteudo.length + 400;
  if (peso && peso + t > LIM) { pedacos.push([]); peso = 0; }
  pedacos[pedacos.length - 1].push(a); peso += t;
}
const saida = path.join(__dirname, 'saida-' + rotulo);
fs.rmSync(saida, { recursive: true, force: true }); fs.mkdirSync(saida, { recursive: true });
let i = 0;
for (const pedaco of pedacos) {
  if (!pedaco.length) continue;
  i++;
  fs.writeFileSync(path.join(saida, `${rotulo}-${String(i).padStart(3,'0')}.json`), JSON.stringify({
    formato: 'legalway-backup-v1', gerado: agora(), observacao: `Drive ${rotulo} — documentos ${i}`,
    arquivos: pedaco, armazenamento: [] }));
}
fs.writeFileSync(path.join(saida, 'zz-registros.json'), JSON.stringify({
  formato: 'legalway-backup-v1', gerado: agora(), observacao: `Drive ${rotulo} — registros`,
  arquivos: [], armazenamento: [
    { chave: 'legalway-processos-documentacao-v1', valor: processos },
    { chave: 'legalway-clientes-v1', valor: clientes },
  ] }));
console.log('\n' + (i + 1) + ' arquivos em ' + saida);
fs.readdirSync(saida).sort().forEach(f => console.log('   ' + (fs.statSync(path.join(saida,f)).size/1048576).toFixed(1).padStart(6) + ' MB  ' + f));
