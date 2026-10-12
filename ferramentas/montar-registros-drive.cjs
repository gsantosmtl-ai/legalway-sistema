#!/usr/bin/env node
// Monta o bloco de registros do Drive UMA VEZ, a partir do caderno de
// metadados que as levas foram acumulando.
//
//   node ferramentas/montar-registros-drive.cjs --base estado-atual.json
//
// Por que separado: na noite de 11/10 eu montei os registros leva a leva, cada
// uma em cima do estado anterior. A leva 2 partiu de uma foto tirada antes da
// leva 1 e sobrescreveu as referências dela — os arquivos continuaram no
// banco, invisíveis nos cards. Com o caderno, a ordem das levas deixa de
// importar: o id de cada arquivo vem do caminho no Drive, então reprocessar é
// idempotente.
const fs = require('fs');
const path = require('path');
const R = require('./regras-trello.cjs');

const valor = f => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const arg = f => process.argv.includes(f);
const agora = () => new Date().toISOString();

const caderno = JSON.parse(fs.readFileSync(path.join(__dirname, 'drive-metadados.json'), 'utf8'));
const base = JSON.parse(fs.readFileSync(path.join(__dirname, valor('--base') || 'estado-atual.json'), 'utf8'));
const bloco = k => (base.armazenamento.find(x => x.chave === k) || {}).valor || [];
const processos = bloco('legalway-processos-documentacao-v1').map(p => ({ ...p, anexos: (p.anexos || []).filter(a => a.origem !== 'Drive') }));
const clientes = bloco('legalway-clientes-v1').map(c => { const n = { ...c }; delete n.anexosSemProcesso; return n; });

let seq = 0;
const uid = p => `${p}dr${Date.now().toString(36)}${(seq++).toString(36)}`;

const porNome = new Map(), porFz = new Map();
for (const c of clientes) { porNome.set(R.norm(c.nome), c); const f = R.fuzzy(c.nome); if (f && !porFz.has(f)) porFz.set(f, c); }

const rel = { postos: 0, noCliente: 0, clientesNovos: [], cancelados: new Set(), concluidos: new Set() };

for (const [id, a] of Object.entries(caderno)) {
  let cliente = porNome.get(R.norm(a.cliente)) || porFz.get(R.fuzzy(a.cliente));
  if (!cliente) {
    cliente = { id: uid('cl'), nome: a.cliente, telefone: '', email: '', endereco: '', criadoEm: agora(),
                contratoIds: [], historico: [{ quando: agora(), texto: 'Criado na importação do Drive' }] };
    clientes.push(cliente); porNome.set(R.norm(a.cliente), cliente);
    rel.clientesNovos.push(a.cliente);
  }
  if (a.marca === 'cancelado') rel.cancelados.add(cliente.nome);
  if (a.marca === 'concluido') rel.concluidos.add(cliente.nome);

  const { cliente: _c, marca: _m, ...anexo } = a;
  const meus = processos.filter(p => R.norm(p.clienteNome) === R.norm(cliente.nome));
  if (meus.length === 1) { meus[0].anexos = [...(meus[0].anexos || []), anexo]; rel.postos++; }
  else { cliente.anexosSemProcesso = [...(cliente.anexosSemProcesso || []), anexo]; rel.noCliente++; }
}

// A lista do que ficou sem processo vira planilha: é o que alguém precisa
// olhar nome por nome, e ninguém faz isso lendo o terminal.
const soltos = [];
for (const c of clientes) for (const a of (c.anexosSemProcesso || []))
  soltos.push([c.nome, a.nome, a.pastaNoDrive || '', (a.tamanho/1024).toFixed(0) + ' KB',
               processos.filter(p => R.norm(p.clienteNome) === R.norm(c.nome)).length]);

console.log('REGISTROS DO DRIVE');
console.log('  arquivos no caderno    : ' + Object.keys(caderno).length);
console.log('  postos no processo     : ' + rel.postos);
console.log('  guardados no cliente   : ' + rel.noCliente + '  (mais de um processo, ou nenhum)');
console.log('  clientes criados       : ' + rel.clientesNovos.length);
rel.clientesNovos.forEach(x => console.log('     + ' + x));
console.log('  pastas concluídas      : ' + rel.concluidos.size);
console.log('  pastas canceladas      : ' + rel.cancelados.size);
if (rel.cancelados.size) [...rel.cancelados].forEach(x => console.log('     ' + x));

if (!arg('--gravar')) { console.log('\nSimulação. Rode com --gravar.\n'); process.exit(0); }

const saida = path.join(__dirname, 'drive-registros.json');
fs.writeFileSync(saida, JSON.stringify({
  formato: 'legalway-backup-v1', gerado: agora(), observacao: 'Drive — registros (montados do caderno)',
  arquivos: [], armazenamento: [
    { chave: 'legalway-processos-documentacao-v1', valor: processos },
    { chave: 'legalway-clientes-v1', valor: clientes },
  ] }));
const planilha = path.join(__dirname, 'planilhas', 'drive-anexos-sem-processo.csv');
fs.mkdirSync(path.dirname(planilha), { recursive: true });
fs.writeFileSync(planilha, 'cliente;arquivo;pasta no Drive;tamanho;processos do cliente\n' +
  soltos.map(l => l.map(x => String(x).replace(/;/g, ',')).join(';')).join('\n') + '\n');
console.log('\nPlanilha: ' + planilha + '  (' + soltos.length + ' linhas)');

console.log('\nArquivo: ' + saida + '  (' + (fs.statSync(saida).size / 1048576).toFixed(1) + ' MB)');
