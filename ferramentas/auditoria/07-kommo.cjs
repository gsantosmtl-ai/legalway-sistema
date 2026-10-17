#!/usr/bin/env node
// CAMADAS 2, 3, 4 e 5 — Kommo · 2.201 leads e 2.374 contatos.
// O destino espalha o Kommo em TRÊS blocos: leads, funil comercial e SDR.
// Então a identidade tem que ser feita contra a união dos três.
const C = require('./comum.cjs');
const { txt } = C;
const { arq, bloco } = C.instantaneo();
const K = C.origem('kommo-fechados/kommo-completo.json');

const leads = bloco('legalway-leads-v1');
const funil = bloco('legalway-funil-v1');
const sdr   = bloco('legalway-sdr-v1');

// ─── CAMADA 2: identidade ────────────────────────────────────────────────
const onde = new Map();                    // kommoId → [blocos onde aparece]
const por = (lista, nome) => { for (const r of lista) { const k = String(r.kommoId || '');
  if (!k) continue; if (!onde.has(k)) onde.set(k, []); onde.get(k).push({ bloco: nome, id: r.id, nome: r.nome }); } };
por(leads, 'leads'); por(sdr, 'sdr'); por(funil, 'funil');

const idsKommo = new Set(K.leads.map(l => String(l.id)));
const ausentes = K.leads.filter(l => !onde.has(String(l.id)));
const emMaisDeUm = [...onde.entries()].filter(([, v]) => v.length > 1);
const sobrando = [...onde.keys()].filter(k => !idsKommo.has(k));
const semKommoId = { leads: leads.filter(r => !r.kommoId).length,
                     sdr: sdr.filter(r => !r.kommoId).length,
                     funil: funil.filter(r => !r.kommoId).length };

// ─── o funil não tem id: tento casar por telefone e por nome ─────────────
const tel = s => String(s || '').replace(/\D/g, '').slice(-10);
const telKommo = new Map();
for (const c of K.contatos) for (const cf of (c.custom_fields_values || []))
  if (/PHONE/i.test(cf.field_code || '')) for (const v of (cf.values || []))
    { const t = tel(v.value); if (t) telKommo.set(t, c); }
const nomeKommo = new Map(K.contatos.map(c => [txt(c.name), c]));
let funilPorTel = 0, funilPorNome = 0, funilSemPar = 0;
for (const f of funil) {
  if (tel(f.telefone) && telKommo.has(tel(f.telefone))) funilPorTel++;
  else if (nomeKommo.has(txt(f.nome))) funilPorNome++;
  else funilSemPar++;
}

// ─── CAMADA 5: histórico e etapa ─────────────────────────────────────────
const stOrigem = {}; for (const l of K.leads) stOrigem[l.status_id] = (stOrigem[l.status_id] || 0) + 1;
const GANHO = 142, PERDIDO = 143;
const ganhos = K.leads.filter(l => l.status_id === GANHO);
const perdidos = K.leads.filter(l => l.status_id === PERDIDO);
const comHistorico = r => Array.isArray(r.historico) && r.historico.length > 0;
const hist = { leads: leads.filter(comHistorico).length, sdr: sdr.filter(comHistorico).length, funil: funil.filter(comHistorico).length };

// onde foram parar os ganhos e os perdidos?
const destinoDe = id => (onde.get(String(id)) || []).map(x => x.bloco).sort().join('+') || '(ausente)';
const ondeGanhos = {}, ondePerdidos = {};
for (const l of ganhos)   ondeGanhos[destinoDe(l.id)]   = (ondeGanhos[destinoDe(l.id)]   || 0) + 1;
for (const l of perdidos) ondePerdidos[destinoDe(l.id)] = (ondePerdidos[destinoDe(l.id)] || 0) + 1;

// ─── o que NÃO foi extraído do Kommo ─────────────────────────────────────
const naoExtraido = [];
if (!K.tarefas)   naoExtraido.push('tarefas');
if (!K.notas)     naoExtraido.push('notas (só as 78 de ganho vieram)');
if (!K.eventos)   naoExtraido.push('histórico de movimentação entre etapas');
if (!K.empresas)  naoExtraido.push('empresas');
if (!K.pipelines) naoExtraido.push('definição de funis e etapas (só os ids)');

C.gravar('kommo.json', { instantaneo: arq, extraidoEm: K.geradoEm,
  camada2: { origemLeads: K.leads.length, origemContatos: K.contatos.length,
             destino: { leads: leads.length, funil: funil.length, sdr: sdr.length, soma: leads.length + funil.length + sdr.length },
             casadosPorKommoId: onde.size, ausentes: ausentes.length,
             emMaisDeUmBloco: emMaisDeUm.length, sobrando: sobrando.length, semKommoId },
  funilSemId: { porTelefone: funilPorTel, porNome: funilPorNome, semPar: funilSemPar },
  camada5: { statusNaOrigem: stOrigem, ganhos: ganhos.length, perdidos: perdidos.length,
             ondeForamOsGanhos: ondeGanhos, ondeForamOsPerdidos: ondePerdidos, comHistorico: hist },
  naoExtraidoDaOrigem: naoExtraido,
  listas: { ausentes: ausentes.slice(0, 500).map(l => ({ id: l.id, nome: l.name, status: l.status_id, criadoEm: new Date(l.created_at*1000).toISOString().slice(0,10) })),
            emMaisDeUmBloco: emMaisDeUm.slice(0, 300).map(([k, v]) => ({ kommoId: k, blocos: v.map(x => x.bloco), nome: v[0].nome })) } });

const l = (a, b) => console.log('   ' + String(a).padEnd(42) + String(b).padStart(10));
console.log('KOMMO — conciliação\n');
console.log('   origem : kommo-completo.json (API v4, ' + K.geradoEm + ')');
console.log('   destino: ' + arq + '\n');
console.log('── CAMADA 2 — identidade');
l('leads na origem', K.leads.length);
l('contatos na origem', K.contatos.length);
l('destino: leads + funil + SDR', leads.length + ' + ' + funil.length + ' + ' + sdr.length);
l('kommoId distintos no destino', onde.size);
l('AUSENTES (lead do Kommo sem par)', ausentes.length);
l('em MAIS DE UM bloco do destino', emMaisDeUm.length);
l('no destino sem par na origem', sobrando.length);
console.log('   sem kommoId no destino: ' + JSON.stringify(semKommoId));
console.log('\n── o funil não guarda kommoId — casando por telefone/nome');
l('casam por telefone', funilPorTel);
l('casam por nome', funilPorNome);
l('sem par nenhum', funilSemPar);
console.log('\n── CAMADA 5 — etapa e histórico');
l('ganhos na origem (status 142)', ganhos.length);
console.log('      onde foram parar: ' + JSON.stringify(ondeGanhos));
l('perdidos na origem (status 143)', perdidos.length);
console.log('      onde foram parar: ' + JSON.stringify(ondePerdidos));
console.log('   registros com histórico no destino: ' + JSON.stringify(hist));
console.log('\n── NÃO EXTRAÍDO da origem (limitação, não perda medida)');
for (const x of naoExtraido) console.log('      • ' + x);
console.log('\nDetalhe em auditoria/relatorios/kommo.json');
