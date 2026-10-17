#!/usr/bin/env node
// CAMADA 1 — quantidade, lado do destino. Só leitura do instantâneo.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'instantaneo');
const arq = fs.readdirSync(DIR).filter(f => f.startsWith('destino-')).sort().pop();
const d = JSON.parse(fs.readFileSync(path.join(DIR, arq), 'utf8'));
const bloco = k => { const b = d.armazenamento.find(x => x.chave === k); return b ? b.valor : null; };

const inv = { instantaneo: arq, geradoEm: d.geradoEm, destino: {} };
const conta = (nome, chave) => { const v = bloco(chave); inv.destino[nome] = { chave, n: Array.isArray(v) ? v.length : (v == null ? null : 1) }; };

conta('clientes',           'legalway-clientes-v1');
conta('contratos',          'legalway-contratos-v1');
conta('contasAReceber',     'legalway-financeiro-v1');
conta('contasAPagar',       'legalway-contas-pagar-v1');
conta('transferencias',     'legalway-transferencias-v1');
conta('processosDocumentacao','legalway-processos-documentacao-v1');
conta('servicos',           'legalway-servicos-v1');
conta('checklistsModelo',   'legalway-checklists-v1');
conta('leads',              'legalway-leads-v1');
conta('funilComercial',     'legalway-funil-v1');
conta('sdr',                'legalway-sdr-v1');
conta('tarefas',            'legalway-tarefas-v1');
conta('agenda',             'legalway-agenda-v1');
inv.destino.arquivos      = { tabela: 'arquivos',       n: d.arquivos.length,
                              bytes: d.arquivos.reduce((s,a)=>s+(Number(a.tamanho)||0),0) };
inv.destino.usuarios      = { tabela: 'usuarios',       n: d.usuarios.length };
inv.destino.chatMensagens = { tabela: 'chat_mensagens', n: d.chat_mensagens.length };

// Rastro de origem já gravado em cada registro — é o que permite a camada 2.
const marcas = {};
for (const [nome, { chave }] of Object.entries(inv.destino)) {
  if (!chave) continue;
  const v = bloco(chave); if (!Array.isArray(v) || !v.length) continue;
  const campos = {};
  for (const item of v) for (const k of Object.keys(item || {}))
    if (/^(blingId|kommoId|trelloId|pedidoBling|origem|origemTrello|idOrigem|externoId)$/i.test(k) && item[k] != null && item[k] !== '')
      campos[k] = (campos[k] || 0) + 1;
  if (Object.keys(campos).length) marcas[nome] = { total: v.length, comRastro: campos };
}
inv.rastroDeOrigem = marcas;

fs.writeFileSync(path.join(__dirname, 'relatorios', 'inventario-destino.json'), JSON.stringify(inv, null, 2));

console.log('INVENTÁRIO DO DESTINO — camada 1\n');
console.log('instantâneo: ' + arq + '   (' + d.geradoEm + ')\n');
for (const [nome, v] of Object.entries(inv.destino))
  console.log('   ' + String(v.n).padStart(6) + '  ' + nome + (v.bytes ? '   (' + (v.bytes/1073741824).toFixed(2) + ' GB)' : ''));
console.log('\nRASTRO DE ORIGEM gravado nos registros (permite conciliar por id, não por nome):');
for (const [nome, m] of Object.entries(marcas)) {
  const p = Object.entries(m.comRastro).map(([k,n]) => k + '=' + n + '/' + m.total).join('   ');
  console.log('   ' + nome.padEnd(22) + p);
}
console.log('\nGravado em auditoria/relatorios/inventario-destino.json');
