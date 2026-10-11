#!/usr/bin/env node
// Converte a exportação do Kommo no formato que o sistema carrega.
//
//   node ferramentas/importar-kommo.mjs ~/Downloads/kommo_export_leads.csv --simular
//   node ferramentas/importar-kommo.mjs ~/Downloads/kommo_export_leads.csv --lote "Proposta - Renato"
//   node ferramentas/importar-kommo.mjs ~/Downloads/kommo_export_leads.csv --todos
//
// Sem --lote nem --todos ele só simula: mostra para onde cada lead iria e não
// escreve nada. Rode assim na primeira vez.
//
// Importar em partes é seguro: a ferramenta guarda o que já foi importado em
// .kommo-importado.json e sempre gera o arquivo COMPLETO, com os lotes
// anteriores junto. Então carregar o arquivo novo no sistema nunca perde o que
// já estava lá, e rodar o mesmo lote duas vezes não duplica ninguém.
//
// O resultado sai em ferramentas/importar-no-sistema.json. No sistema:
// Configurações → Restaurar de um backup → escolher esse arquivo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ESTADO = path.join(AQUI, '.kommo-importado.json');
const SAIDA  = path.join(AQUI, 'importar-no-sistema.json');

// ─── REGRAS ────────────────────────────────────────────────────────────────
// Tudo o que você pode querer mudar está aqui em cima.

// Cada etapa do Kommo carrega DUAS informações: em que pé está o lead e de quem
// ele é. O campo "Usuário responsável" não serve — está 'Legalwaygroupllc' nos
// 1.487 leads.
const ETAPAS = {
  'Etapa de leads de entrada': { destino: 'entrada' },
  'Lead Novo':                 { destino: 'entrada' },

  // Perdido e sem contato não ficam parados no funil: vão para a fila do SDR
  // tentar recuperar. O vendedor que tinha o lead fica registrado em
  // vendedorOriginal, para o SDR saber com quem devolver se recuperar.
  'Sem Contato':               { destino: 'sdr', motivo: 'Sem contato' },
  'ENVIADOS SDR':              { destino: 'sdr', motivo: 'Já estava na fila do SDR' },
  'Adriano - Sem Contato':     { destino: 'sdr', motivo: 'Sem contato', vendedor: 'Adriano' },
  'Sem Contato - Renato':      { destino: 'sdr', motivo: 'Sem contato', vendedor: 'Renato' },
  'Lost adriano':              { destino: 'sdr', motivo: 'Perdido',     vendedor: 'Adriano' },
  'Lost Renato':               { destino: 'sdr', motivo: 'Perdido',     vendedor: 'Renato' },

  // Em andamento de verdade: ficam no funil, com dono.
  'Adriano':                   { destino: 'funil', etapa: 'Contato realizado', vendedor: 'Adriano' },
  'Adriano - EB1 - EB2':       { destino: 'funil', etapa: 'Qualificação',      vendedor: 'Adriano', servico: 'EB-2 NIW' },
  'Adriano Proposta':          { destino: 'funil', etapa: 'Proposta',          vendedor: 'Adriano' },
  'Contato ok - Renato':       { destino: 'funil', etapa: 'Contato realizado', vendedor: 'Renato' },
  'EB - Renato':               { destino: 'funil', etapa: 'Qualificação',      vendedor: 'Renato', servico: 'EB-2 NIW' },
  'Proposta - Renato':         { destino: 'funil', etapa: 'Proposta',          vendedor: 'Renato' },
  'Repasse - Renato':          { destino: 'funil', etapa: 'Negociação',        vendedor: 'Renato' },
};

// A Tag diz de qual formulário o lead veio. Dois formulários, dois públicos:
// o geral não faz pergunta de qualificação; o qualificado faz todas.
const FORMULARIOS = {
  fb993750886664880:  { tipo: 'geral' },
  fb4268492956814075: { tipo: 'qualificado' },
  fb1054088460548120: { tipo: 'qualificado' },
  fb1039829165174896: { tipo: 'geral' },
  fb945141608383753:  { tipo: 'geral' },
};

// Escolaridade que indica EB-2 NIW.
const ESCOLARIDADE_EB = ['pós_graduação', 'mestrado', 'doutorado'];

// O Meta grava com sublinhado no lugar de espaço.
const LIMPAR = {
  'pós_graduação': 'Pós-graduação', 'graduação': 'Graduação', 'mestrado_': 'Mestrado',
  'mestrado': 'Mestrado', 'doutorado': 'Doutorado',
  "'+_10_anos": 'Mais de 10 anos', "'+_de_10_anos": 'Mais de 10 anos',
  '5-10_anos_': '5 a 10 anos', '5_a_10_anos_': '5 a 10 anos',
  'não': 'Não', 'nunca_fui': 'Nunca foi aos EUA', 'sim_': 'Sim',
  'já_visitei_como_turista': 'Já visitou como turista',
  'já_morei,_mas_não_moro_mais': 'Já morou, não mora mais',
};
const limpar = (v) => {
  const t = String(v || '').trim();
  if (!t) return '';
  if (LIMPAR[t]) return LIMPAR[t];
  const s = t.replace(/_/g, ' ').replace(/^'/, '').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ─── leitura do CSV ────────────────────────────────────────────────────────
function lerCsv(arquivo) {
  const txt = fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '');
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const cab = linhas.shift();
  return linhas.filter(l => l.length > 1).map(l => Object.fromEntries(cab.map((c, i) => [c, l[i] ?? ''])));
}

const digitos = (s) => String(s || '').replace(/\D/g, '');
const fimTel  = (s) => { const d = digitos(s); return d.length >= 8 ? d.slice(-8) : ''; };
const primeiro = (l, cols) => { for (const c of cols) { const v = (l[c] || '').trim(); if (v) return v; } return ''; };

function dataIso(s) {
  const m = String(s || '').match(/^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return new Date().toISOString();
  const [, d, mo, a, h = '00', mi = '00', se = '00'] = m;
  return new Date(Date.UTC(+a, +mo - 1, +d, +h, +mi, +se)).toISOString();
}

// ─── conversão ─────────────────────────────────────────────────────────────
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function converter(l) {
  const etapaKommo = (l['Etapa do lead'] || '').trim();
  const regra = ETAPAS[etapaKommo];
  if (!regra) return { erro: `etapa desconhecida: "${etapaKommo}"` };

  const tag  = (l['Tags'] || '').trim();
  const form = FORMULARIOS[tag] || { tipo: 'desconhecido' };
  const esc  = (l['Qual seu grau de escolaridade?'] || '').trim();

  // Serviço: a etapa manda; depois o formulário qualificado + escolaridade alta.
  let servico = regra.servico || '';
  if (!servico && form.tipo === 'qualificado') {
    servico = ESCOLARIDADE_EB.some(e => esc.startsWith(e)) ? 'EB-2 NIW' : 'EB — a qualificar';
  }

  // "Qual sua área de formação?" vem contaminada com resposta de tempo em 33 dos
  // 120 preenchidos — erro de configuração do formulário no Meta. Separamos aqui.
  const campoFormacao = (l['Qual sua área de formação?'] || '').trim();
  const pareceTempo = /ano|^sim,/i.test(campoFormacao);

  const respostas = [
    ['Escolaridade', esc],
    ['Experiência', primeiro(l, ['Quantos anos de experiencia profissional na área?']) || (pareceTempo ? campoFormacao : '')],
    ['Área de formação', pareceTempo ? '' : campoFormacao],
    ['Já foi aos EUA', (l['Voce ja foi para os Estados Unidos?'] || '').trim()],
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${limpar(v)}`);

  const notas = ['Nota', 'Nota 2', 'Nota 3', 'Nota 4', 'Nota 5']
    .map(c => (l[c] || '').trim()).filter(Boolean);

  const entrada = dataIso(l['Criado em']);
  const historico = [{ tipo: 'Sistema', quando: entrada, texto:
    `Importado do Kommo (lead ${l['ID']}, etapa "${etapaKommo}")`
    + (tag ? ` · formulário ${form.tipo}` : '') }];
  if (respostas.length) historico.push({ tipo: 'Formulário', quando: entrada, texto: respostas.join('\n') });
  for (const n of notas) historico.push({ tipo: 'Anotação', quando: entrada, texto: n });

  return {
    lead: {
      id: uid('l'), kommoId: String(l['ID'] || ''),
      nome: (l['Nome completo'] || l['Pessoa de contato'] || '').trim() || '(sem nome)',
      telefone: primeiro(l, ['Celular', 'Telefone comercial', 'Tel. direto com.', 'Telefone residencial', 'Outro telefone']),
      email: primeiro(l, ['Email pessoal', 'Email comercial', 'Outro email']),
      servico, campanha: '',
      origens: [tag && form.tipo !== 'desconhecido' ? 'facebook' : 'outro'],
      entrada, responsavel: regra.vendedor || null,
      historico,
    },
    destino: regra.destino, etapa: regra.etapa, vendedor: regra.vendedor || null,
    motivo: regra.motivo || null,
    valor: Number(String(l['Lead venda $'] || '0').replace(/[^\d.]/g, '')) || 0,
  };
}

// ─── execução ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arquivo = args.find(a => !a.startsWith('--'));
const todos = args.includes('--todos');
const iLote = args.indexOf('--lote');
const lote = iLote >= 0 ? args[iLote + 1] : null;
const simular = !todos && !lote;

if (!arquivo || !fs.existsSync(arquivo)) {
  console.error('Informe o CSV exportado do Kommo.\n');
  console.error(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 18).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(1);
}

const linhas = lerCsv(arquivo);
const convertidos = [], problemas = [];
for (const l of linhas) {
  const r = converter(l);
  if (r.erro) problemas.push(`${l['ID']}: ${r.erro}`); else convertidos.push(r);
}

const porEtapa = {};
for (const l of linhas) {
  const e = (l['Etapa do lead'] || '(vazia)').trim();
  porEtapa[e] = (porEtapa[e] || 0) + 1;
}

if (simular) {
  console.log(`\n${linhas.length} leads lidos de ${path.basename(arquivo)}\n`);
  const porDestino = {};
  for (const c of convertidos) {
    const k = `${c.destino}${c.etapa ? ' · ' + c.etapa : ''}${c.vendedor ? ' · ' + c.vendedor : ''}`;
    porDestino[k] = (porDestino[k] || 0) + 1;
  }
  console.log('PARA ONDE CADA UM VAI');
  for (const [k, n] of Object.entries(porDestino).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
  const servicos = {};
  for (const c of convertidos) { const s = c.lead.servico || '(em branco)'; servicos[s] = (servicos[s] || 0) + 1; }
  console.log('\nTIPO DE VISTO');
  for (const [k, n] of Object.entries(servicos).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
  console.log('\nLOTES DISPONÍVEIS (use com --lote "nome exato")');
  for (const [k, n] of Object.entries(porEtapa).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
  if (problemas.length) { console.log(`\n⚠️  ${problemas.length} sem regra de etapa:`); problemas.slice(0, 10).forEach(p => console.log('   ' + p)); }
  console.log('\nNada foi gravado. Para valer, use --lote "nome" ou --todos.\n');
  process.exit(0);
}

const escolhidos = todos ? convertidos
  : convertidos.filter((_, i) => (linhas[i]['Etapa do lead'] || '').trim() === lote);
if (!escolhidos.length) { console.error(`Nenhum lead na etapa "${lote}". Rode sem --lote para ver a lista.`); process.exit(1); }

// acumula com o que já foi importado antes
const anterior = fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, 'utf8')) : { leads: [], funil: [], sdr: [] };
const jaTem = new Set(anterior.leads.map(l => l.kommoId));
const porTelefone = new Set(anterior.leads.map(l => fimTel(l.telefone)).filter(Boolean));

let novos = 0, repetidos = 0, juntados = 0;
for (const c of escolhidos) {
  if (jaTem.has(c.lead.kommoId)) { repetidos++; continue; }
  const tel = fimTel(c.lead.telefone);
  if (tel && porTelefone.has(tel)) { juntados++; continue; }   // mesma pessoa em dois lotes
  jaTem.add(c.lead.kommoId); if (tel) porTelefone.add(tel);
  anterior.leads.push(c.lead);
  novos++;
  if (c.destino === 'funil') {
    anterior.funil.push({
      id: uid('fl'), nome: c.lead.nome, telefone: c.lead.telefone, servico: c.lead.servico,
      origem: c.lead.origens[0], valorPotencial: c.valor, vendedor: c.vendedor,
      etapa: c.etapa, entradaEtapa: c.lead.entrada, assumidoEm: c.lead.entrada, saida: null,
      proximaAcao: null, comercial: { proposta: '', valorNegociado: 0, negociacao: '' },
      historico: [{ tipo: 'Sistema', quando: c.lead.entrada, texto: 'Importado do Kommo' }],
    });
  }
  if (c.destino === 'sdr') {
    anterior.sdr.push({
      id: uid('sd'), nome: c.lead.nome, telefone: c.lead.telefone,
      servico: c.lead.servico, origem: c.lead.origens[0],
      status: 'fila', motivo: c.motivo,
      vendedorOriginal: c.vendedor || null,   // com quem devolver, se recuperar
      vendedor: null, vendedorDestino: null,
      tentativasSdr: 0, tentativasVendedor: 0,
      proximaTentativa: null, proximoFollowup: null,
      enviadoEm: c.lead.entrada, entrada: c.lead.entrada, recuperadoEm: null,
      historico: [{ tipo: 'Sistema', quando: c.lead.entrada,
        texto: `Veio do Kommo para a fila do SDR — ${c.motivo}` + (c.vendedor ? ` (era de ${c.vendedor})` : '') }],
    });
  }
}

fs.writeFileSync(ESTADO, JSON.stringify(anterior, null, 1));
fs.writeFileSync(SAIDA, JSON.stringify({
  formato: 'legalway-backup-v1',
  gerado: new Date().toISOString(),
  observacao: `Importação do Kommo — lote "${lote || 'todos'}"`,
  armazenamento: [
    { chave: 'legalway-leads-v1', valor: anterior.leads },
    { chave: 'legalway-funil-v1', valor: anterior.funil },
    { chave: 'legalway-sdr-v1',   valor: anterior.sdr },
  ],
}, null, 1));

console.log(`\nLote "${lote || 'todos'}"`);
console.log(`  ${novos} novos`);
if (repetidos) console.log(`  ${repetidos} já importados antes (ignorados)`);
if (juntados) console.log(`  ${juntados} com telefone repetido (ignorados — mesma pessoa)`);
console.log(`\nAcumulado: ${anterior.leads.length} leads · ${anterior.funil.length} no funil · ${anterior.sdr.length} no SDR`);
console.log(`\nArquivo pronto: ${SAIDA}`);
console.log('No sistema: Configurações → Restaurar de um backup → escolher esse arquivo.\n');
