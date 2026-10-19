#!/usr/bin/env node
// O QUE ENTROU NAS ORIGENS DEPOIS QUE O SISTEMA JÁ ESTAVA RODANDO.
//
//   node ferramentas/delta.cjs --sistema ~/Downloads/backup.json
//   node ferramentas/delta.cjs --sistema ~/Downloads/backup.json --origem trello
//   node ferramentas/delta.cjs --sistema ... --corte 2026-10-12
//
// Uma origem por vez: trello, bling, kommo, meta. Sem --origem, roda todas.
//
// Os importadores de ferramentas/ são de CARGA INICIAL: geram ids novos a cada
// execução e o restore substitui o bloco inteiro. Rodar de novo apagaria tudo
// que a equipe fez no sistema desde a virada. Este aqui faz o contrário: olha o
// que o sistema já tem, olha o que a origem tem hoje, e separa só o que é novo.
//
// A âncora de cada bloco (medida no sistema real, 12/10):
//
//   leads            kommoId                   1156/1156
//   sdr              kommoId                    777/777
//   clientes         blingId                    236/249
//   contratos        pedidoBling                233/233
//   financeiro       blingId                  2810/2810
//   contas a pagar   blingId                    533/533
//   processos        origemTrello.cartaoId      203/237
//
// Registro do sistema sem âncora foi criado dentro do sistema (ou veio do
// Drive) — nunca é tocado. Registro que existe nos dois lados mas mudou na
// origem vira DIVERGENTE: entra no relatório e não é alterado, porque a versão
// do sistema pode ser a corrigida. Só o que é inédito conta como novo.
//
// ARMADILHA QUE JÁ PEGOU UMA VEZ: um registro que está na origem e não está no
// sistema pode ser duas coisas muito diferentes — algo que nasceu depois da
// virada (delta de verdade), ou algo que foi deixado de fora de propósito na
// migração. Os 1.053 leads do Kommo que não entraram são do segundo tipo. Por
// isso tudo é separado pela data de criação, e a ferramenta avisa quando a
// própria exportação é velha demais para conter o delta.
//
// Este script não grava nada. Ele responde "quanto tem para subir" antes de
// qualquer decisão.

const fs = require('fs');
const path = require('path');

const P = path.join(__dirname, 'planilhas');
const arg = (n, padrao) => {
  const i = process.argv.indexOf(n);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
};
const existe = f => { try { return fs.existsSync(f); } catch (e) { return false; } };
const CORTE = arg('--corte', '2026-10-12');            // dia da virada
const SO = (arg('--origem', '') || '').toLowerCase();  // trello | bling | kommo | meta
const quer = fonte => !SO || SO === fonte;
const dia = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v * (v > 1e11 ? 1 : 1000)).toISOString().slice(0, 10);
  const s = String(v).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return br[3] + '-' + br[2] + '-' + br[1];
  return s.slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? s.slice(0, 10) : null;
};
const lerJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const digitos = s => String(s == null ? '' : s).replace(/\D/g, '');

// ---------- lado do sistema ----------
const caminhoSistema = arg('--sistema',
  path.join(__dirname, 'auditoria', 'instantaneo', 'destino-20261012-1001.json'));
if (!existe(caminhoSistema)) {
  console.error('Não achei o retrato do sistema:', caminhoSistema);
  console.error('Baixe em Configurações → Backup → "só os dados, sem documentos" e passe com --sistema.');
  process.exit(1);
}
const S = lerJson(caminhoSistema);
const blocoSistema = chave => {
  const b = (S.armazenamento || []).find(x => x.chave === chave);
  if (!b) return [];
  let v = b.valor;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
  return Array.isArray(v) ? v : [];
};

// ---------- lado das origens ----------
const origem = rel => {
  const f = path.join(P, rel);
  return existe(f) ? lerJson(f) : null;
};

// Compara um bloco do sistema com uma lista da origem pela âncora.
//   ancoraSistema  como achar a âncora num registro do sistema
//   ancoraOrigem   como achar a âncora num registro da origem
function comparar({ nome, sistema, origem: orig, ancoraSistema, ancoraOrigem, rotulo, quando }) {
  if (!orig) return { nome, indisponivel: true, rotulo };
  const noSistema = new Set();
  let semAncora = 0;
  for (const r of sistema) {
    const a = ancoraSistema(r);
    if (a == null || a === '') { semAncora++; continue; }
    noSistema.add(String(a));
  }
  const novos = [], antigosDeFora = [], jaTem = [];
  let maisRecente = null;
  for (const o of orig) {
    const q = quando ? dia(quando(o)) : null;
    if (q && (!maisRecente || q > maisRecente)) maisRecente = q;
    const a = ancoraOrigem(o);
    if (a == null || a === '') continue;
    if (noSistema.has(String(a))) { jaTem.push(o); continue; }
    // Fora do sistema: é novo só se nasceu depois da virada. O resto foi
    // decisão da migração e não se mexe sem alguém mandar.
    ((!q || q >= CORTE) ? novos : antigosDeFora).push(o);
  }
  return {
    nome, rotulo, sistema: sistema.length, semAncora, maisRecente,
    origem: orig.length, jaTem: jaTem.length,
    novos: novos.length, antigosDeFora: antigosDeFora.length, exemplos: novos.slice(0, 5),
  };
}

const linhas = [];

// ---- Kommo: leads e fila do SDR ----
const kommo = quer('kommo') ? origem('kommo-fechados/kommo-completo.json') : undefined;
const leadsKommo = kommo && Array.isArray(kommo.leads) ? kommo.leads : null;
linhas.push(comparar({
  nome: 'leads', rotulo: 'Kommo → funil comercial',
  sistema: blocoSistema('legalway-leads-v1'), origem: leadsKommo,
  ancoraSistema: r => r.kommoId, ancoraOrigem: o => o.id, quando: o => o.created_at,
}));

// ---- Bling: financeiro ----
const fin = quer('bling') ? origem('bling/bling-financeiro.json') : undefined;
const d = fin && fin.dados ? fin.dados : null;
const receber = d ? [].concat(d.receberAberto || [], d.receberPago || []) : null;
const pagar = d ? [].concat(d.pagarAberto || [], d.pagarPago || []) : null;
linhas.push(comparar({
  nome: 'financeiro', rotulo: 'Bling → contas a receber',
  sistema: blocoSistema('legalway-financeiro-v1'), origem: receber,
  ancoraSistema: r => r.blingId, ancoraOrigem: o => o.id, quando: o => o.dataEmissao || o.vencimento,
}));
linhas.push(comparar({
  nome: 'contas a pagar', rotulo: 'Bling → contas a pagar',
  sistema: blocoSistema('legalway-contas-pagar-v1'), origem: pagar,
  ancoraSistema: r => r.blingId, ancoraOrigem: o => o.id, quando: o => o.dataEmissao || o.vencimento,
}));

// ---- Bling: pedidos de venda → contratos ----
const sit = quer('bling') ? origem('bling/situacao-pedidos.json') : undefined;
const pedidos = sit && sit.situacaoPorPedido
  ? Object.keys(sit.situacaoPorPedido).map(id => ({ id })) : null;
linhas.push(comparar({
  nome: 'contratos', rotulo: 'Bling → contratos (pedidos de venda)',
  sistema: blocoSistema('legalway-contratos-v1'), origem: pedidos,
  ancoraSistema: r => r.pedidoBling, ancoraOrigem: o => o.id,
}));

// ---- Trello: cartões → processos ----
// Cada quadro exportado traz os cartões; a âncora é o id do cartão.
// A exportação do Trello vem agrupada por quadro em trello-organizar.json.
const cartoes = [];
let houveTrello = false;
if (quer('trello')) {
  const t = origem('trello/trello-organizar.json');
  for (const b of Object.values((t && t.quadros) || {})) {
    const lista = b.cartoes || b.cards || [];
    if (Array.isArray(lista) && lista.length) { houveTrello = true; cartoes.push(...lista); }
  }
}
linhas.push(comparar({
  nome: 'processos', rotulo: 'Trello → processos de documentação',
  sistema: blocoSistema('legalway-processos-documentacao-v1'),
  origem: houveTrello ? cartoes : null,
  ancoraSistema: r => (r.origemTrello || {}).cartaoId,
  ancoraOrigem: o => o.id || o.cartaoId, quando: o => o.ultimaAtividade,
}));

// ---- Meta: não se exporta, se liga ----
if (quer('meta')) {
  linhas.push({ nome: 'meta', rotulo: 'Meta → leads de formulário', indisponivel: true,
    nota: 'o Meta não tem exportação: ou o webhook está ligado e os leads entram sozinhos, ou eles passam pelo Kommo' });
}

// ---------- relatório ----------
const geradoEm = S.geradoEm ? String(S.geradoEm).slice(0, 16).replace('T', ' ') : '(sem data)';
console.log('');
console.log('DELTA DAS ORIGENS');
console.log('retrato do sistema: ' + path.basename(caminhoSistema) + '  ·  ' + geradoEm + ' UTC');
console.log('');
console.log('  ' + 'ORIGEM'.padEnd(36) + 'SISTEMA'.padStart(8) + 'ORIGEM'.padStart(8) + 'JÁ TEM'.padStart(8)
  + 'FICOU DE FORA'.padStart(14) + 'NOVOS'.padStart(7));
console.log('  ' + '-'.repeat(81));
let totalNovos = 0, faltando = [], velhas = [];
for (const l of linhas) {
  if (l.indisponivel) { faltando.push(l.rotulo + (l.nota ? ' — ' + l.nota : '')); continue; }
  totalNovos += l.novos;
  console.log('  ' + l.rotulo.padEnd(36) + String(l.sistema).padStart(8) + String(l.origem).padStart(8)
    + String(l.jaTem).padStart(8) + String(l.antigosDeFora).padStart(14) + String(l.novos).padStart(7)
    + (l.novos ? '  ←' : ''));
  if (l.semAncora) console.log('    ' + ' '.repeat(34) + l.semAncora + ' do sistema sem âncora — nasceram aqui, preservados');
  if (l.maisRecente && l.maisRecente < CORTE) {
    velhas.push(l.rotulo + ' (último registro: ' + l.maisRecente + ')');
  }
}
console.log('');
console.log('  TOTAL DE REGISTROS NOVOS: ' + totalNovos);
if (velhas.length) {
  console.log('');
  console.log('  ⚠ EXPORTAÇÃO VELHA — anterior ao corte de ' + CORTE + ':');
  for (const v of velhas) console.log('    · ' + v);
  console.log('  Esses arquivos não podem conter o delta. "0 novos" aqui não quer dizer');
  console.log('  que não há nada novo na origem — quer dizer que não dá para saber.');
}
if (faltando.length) {
  console.log('');
  console.log('  NÃO VERIFICÁVEL:');
  for (const f of faltando) console.log('    · ' + f);
  console.log('  (ausência de arquivo não é ausência de registro: esses não foram conferidos)');
}
console.log('');
