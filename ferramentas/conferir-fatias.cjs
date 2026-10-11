#!/usr/bin/env node
// Confere as fatias de um lote antes de subir: nenhum documento repetido,
// nenhum sem dono, nenhum dono sem documento.
//
//   node ferramentas/conferir-fatias.cjs lote2
const fs = require('fs');
const path = require('path');
const AQUI = __dirname;

const rotulo = process.argv[2];
if (!rotulo) { console.error('Uso: node ferramentas/conferir-fatias.cjs lote2'); process.exit(1); }

const docs = fs.readdirSync(AQUI)
  .filter(f => f.startsWith(`importar-trello-${rotulo}-doc`) && f.endsWith('.json')).sort();
const registros = path.join(AQUI, `importar-trello-${rotulo}-registros.json`);
if (!docs.length || !fs.existsSync(registros)) { console.error('não achei as fatias de ' + rotulo); process.exit(1); }

const arquivos = new Map();
let repetidos = 0, bytes = 0;
for (const f of docs) {
  const b = JSON.parse(fs.readFileSync(path.join(AQUI, f), 'utf8'));
  if (b.armazenamento.length) console.log('⚠ ' + f + ' traz bloco de registro — deveria trazer só documento');
  for (const a of b.arquivos) {
    if (arquivos.has(a.id)) repetidos++;
    arquivos.set(a.id, a);
    bytes += Buffer.from(String(a.conteudo || ''), 'base64').length;
  }
}

const r = JSON.parse(fs.readFileSync(registros, 'utf8'));
if (r.arquivos.length) console.log('⚠ registros traz documento — deveria trazer só os registros');
const procs = (r.armazenamento.find(x => x.chave === 'legalway-processos-documentacao-v1') || {}).valor || [];
const clientes = (r.armazenamento.find(x => x.chave === 'legalway-clientes-v1') || {}).valor || [];

const citados = new Map();
for (const p of procs) {
  for (const a of p.anexos || []) citados.set(a.arquivoId, p.clienteNome);
  for (const d of p.checklist || []) if (typeof d.arquivo === 'string') citados.set(d.arquivo.split('/').pop(), p.clienteNome);
}

const semDono = [...arquivos.keys()].filter(id => !citados.has(id));
const semArquivo = [...citados].filter(([id]) => !arquivos.has(id));
const ids = new Map();
procs.forEach(p => ids.set(p.id, (ids.get(p.id) || 0) + 1));

console.log(`\n${rotulo}: ${docs.length} fatias de documento + 1 de registros`);
console.log(`  documentos        : ${arquivos.size}  ·  ${(bytes / 1048576).toFixed(1)} MB  (repetidos entre fatias: ${repetidos})`);
console.log(`  processos         : ${procs.length}  (ids repetidos: ${[...ids.values()].filter(v => v > 1).length})`);
console.log(`  clientes          : ${clientes.length}`);
console.log(`  documento sem dono: ${semDono.length}`);
semDono.forEach(id => console.log('     ' + (arquivos.get(id).nome || id)));
console.log(`  dono sem documento: ${semArquivo.length}` +
            (semArquivo.length ? '   (normal se já foram em um lote anterior)' : ''));
semArquivo.forEach(([id, quem]) => console.log('     ' + id + '  ' + quem));

const tudoBem = !repetidos && !semDono.length && ![...ids.values()].some(v => v > 1);
console.log('\n' + (tudoBem ? '✓ pode subir' : '⚠ confira os avisos acima antes de subir') + '\n');
