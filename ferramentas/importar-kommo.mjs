#!/usr/bin/env node
// Converte a exportação do Kommo no formato que o sistema carrega.
//
//   node ferramentas/importar-kommo.mjs ~/Downloads/kommo_export_leads.csv --simular
//   node ferramentas/importar-kommo.mjs ~/Downloads/kommo_export_leads.csv --planilha
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

// O que o vendedor escreveu na anotação vale mais que o formulário: ele falou
// com a pessoa. A ordem de confiança é anotação > etapa > formulário.
// Para ensinar uma palavra nova ao importador, acrescente aqui.
const SINAIS_VISTO = [
  ['Visto T',             [/exploraç?c?[aã]o laboral/i, /trabalho escravo/i, /\bvisto[ -]?t\b/i, /tr[aá]fico/i]],
  ['Asilo',               [/\basilo\b/i, /asylum/i]],
  ['Visto U',             [/\bvisto[ -]?u\b/i, /v[ií]tima de crime/i]],
  ['VAWA',                [/\bvawa\b/i]],
  ['EB-2 NIW',            [/\beb-?2\b/i, /\bniw\b/i]],
  ['EB-1A',               [/\beb-?1\b/i]],
  ['EB-3',                [/\beb-?3\b/i]],
  ['Green Card familiar', [/green ?card/i, /\bi-?130\b/i, /casad[oa] (com )?americ/i]],
  ['Cidadania (N-400)',   [/\bn-?400\b/i, /cidadania/i, /naturaliza/i]],
];

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
// O Kommo exporta telefone como '+1407... — o apóstrofo é o truque do Excel para
// forçar texto. Se entrar assim, quebra a comparação de telefone, que é a chave
// que junta a mesma pessoa vinda de dois canais.
const semApostrofo = (s) => String(s || '').trim().replace(/^['`´]+/, '').trim();
const primeiro = (l, cols) => { for (const c of cols) { const v = semApostrofo(l[c]); if (v) return v; } return ''; };

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

  // Serviço, em ordem de confiança: o que o vendedor anotou, depois a etapa,
  // depois o formulário. O formulário nunca crava EB-2 NIW sozinho — ele só diz
  // que a pessoa veio de um anúncio de EB, não que o caso dela seja EB.
  const notasTxt = ['Nota', 'Nota 2', 'Nota 3', 'Nota 4', 'Nota 5']
    .map(c => l[c] || '').join(' ');
  const achados = SINAIS_VISTO.filter(([, ps]) => ps.some(r => r.test(notasTxt))).map(([v]) => v);

  let servico = '', revisar = false;
  if (achados.length === 1) servico = achados[0];
  else if (achados.length > 1) { servico = achados[0]; revisar = true; }   // olhar humano
  else if (regra.servico) servico = regra.servico;
  else if (form.tipo === 'qualificado') {
    servico = ESCOLARIDADE_EB.some(e => esc.startsWith(e)) ? 'EB — a qualificar' : '';
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
      nome: semApostrofo(l['Nome completo'] || l['Pessoa de contato']) || '(sem nome)',
      telefone: primeiro(l, ['Celular', 'Telefone comercial', 'Tel. direto com.', 'Telefone residencial', 'Outro telefone']),
      email: primeiro(l, ['Email pessoal', 'Email comercial', 'Outro email']),
      servico, campanha: '',
      origens: [tag && form.tipo !== 'desconhecido' ? 'facebook' : 'outro'],
      entrada, responsavel: regra.vendedor || null,
      historico,
    },
    destino: regra.destino, etapa: regra.etapa, vendedor: regra.vendedor || null,
    motivo: regra.motivo || null, revisar, achados,
    valor: Number(String(l['Lead venda $'] || '0').replace(/[^\d.]/g, '')) || 0,
  };
}

// ─── execução ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arquivo = args.find(a => !a.startsWith('--'));
const todos = args.includes('--todos');
const iLote = args.indexOf('--lote');
const lote = iLote >= 0 ? args[iLote + 1] : null;
const planilha = args.includes('--planilha');
const simular = !todos && !lote && !planilha;

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

// ─── modo planilha: conferir antes de subir ────────────────────────────────
if (planilha) {
  const dir = path.join(AQUI, 'planilhas');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.csv')) fs.unlinkSync(path.join(dir, f));

  const COLS = ['Conferido', 'Revisar', 'Destino', 'Etapa no sistema', 'Vendedor', 'Motivo (SDR)',
    'Nome', 'Telefone', 'E-mail', 'Tipo de visto', 'Entrada', 'Valor',
    'Etapa no Kommo', 'ID Kommo', 'Anotações'];

  // Excel só entende acento em CSV com BOM. Sem isso vira "Ren�".
  const csv = (linhas) => '\uFEFF' + [COLS, ...linhas]
    .map(l => l.map(c => {
      const t = String(c ?? '').replace(/"/g, '""');
      return /[",;\n]/.test(t) ? `"${t}"` : t;
    }).join(',')).join('\n') + '\n';

  const linhaDe = (c, etapaKommo) => {
    const anot = c.lead.historico.filter(x => x.tipo === 'Anotação').map(x => x.texto).join(' · ');
    const form = c.lead.historico.find(x => x.tipo === 'Formulário');
    return ['', c.revisar ? `SIM — cita ${c.achados.join(' e ')}` : '',
      c.destino, c.etapa || '', c.vendedor || '', c.motivo || '',
      c.lead.nome, c.lead.telefone, c.lead.email, c.lead.servico || '',
      c.lead.entrada.slice(0, 10), c.valor || '', etapaKommo, c.lead.kommoId,
      [anot, form && form.texto.replace(/\n/g, ' · ')].filter(Boolean).join(' || ')];
  };

  const grupos = {};
  convertidos.forEach((c, i) => {
    const etapaKommo = (linhas[i]['Etapa do lead'] || '').trim();
    // sem acento no nome do arquivo: evita dor de cabeça ao abrir no Excel
    const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const nome = c.destino === 'funil'
      ? `funil-${slug(c.vendedor || 'sem-dono')}-${slug(c.etapa)}`
      : c.destino === 'sdr'
        ? `sdr-${slug(c.motivo)}` + (c.vendedor ? `-${slug(c.vendedor)}` : '')
        : 'entrada-de-leads';
    (grupos[nome] = grupos[nome] || []).push(linhaDe(c, etapaKommo));
  });

  const resumo = [];
  for (const [nome, ls] of Object.entries(grupos).sort((a, b) => b[1].length - a[1].length)) {
    fs.writeFileSync(path.join(dir, `${nome}.csv`), csv(ls));
    resumo.push([nome, ls.length]);
  }
  // tudo junto, para quem prefere filtrar numa planilha só
  fs.writeFileSync(path.join(dir, '_tudo.csv'),
    csv(convertidos.map((c, i) => linhaDe(c, (linhas[i]['Etapa do lead'] || '').trim()))));

  console.log(`\n${convertidos.length} leads organizados em ${resumo.length} planilhas\n`);
  console.log('  LEADS  ARQUIVO');
  for (const [nome, n] of resumo) console.log(`  ${String(n).padStart(5)}  ${nome}.csv`);
  console.log(`  ${String(convertidos.length).padStart(5)}  _tudo.csv  (todas juntas)`);
  console.log(`\nEm: ${dir}`);
  console.log('\nA coluna "Conferido" está vazia de propósito: marque nela o que');
  console.log('você revisou. Ler a planilha corrigida de volta ainda não existe —');
  console.log('por enquanto, mudanças de regra se fazem na tabela ETAPAS deste arquivo.\n');
  process.exit(0);
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
