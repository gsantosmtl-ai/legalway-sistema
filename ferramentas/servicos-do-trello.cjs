#!/usr/bin/env node
// Monta o cadastro de serviços e os modelos de checklist a partir do que a
// equipe usa de verdade — os contratos do Bling dizem quais serviços existem,
// e os cartões MODELO do Trello dizem quais documentos cada um pede.
//
//   node ferramentas/servicos-do-trello.cjs            → mostra o que sairia
//   node ferramentas/servicos-do-trello.cjs --gravar   → grava o arquivo de importação
//
// Por que trocar: o sistema veio com 20 serviços de catálogo ("H-1B",
// "Cidadania (N-400)", "Renovação de DACA"...) que não são os da Legal Way.
// Dos 233 contratos, só um — "Asilo" — cai num deles. Resultado: quando um
// contrato é assinado, o sistema procura o checklist do serviço, não acha, e
// cria o processo com a lista de documentos vazia. São 44 processos assim hoje.
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, 'planilhas');
const R = require('./regras-trello.cjs');

const trello = JSON.parse(fs.readFileSync(path.join(P, 'trello/trello-organizar.json'), 'utf8'));
const estado = JSON.parse(fs.readFileSync(path.join(P, 'estado-sistema.json'), 'utf8'));

const arg = f => process.argv.includes(f);
let seq = 0;
const uid = p => `${p}sv${Date.now().toString(36)}${(seq++).toString(36)}`;

// ─── QUAIS SERVIÇOS EXISTEM ────────────────────────────────────────────────
// Um contrato pode vender dois de uma vez ("Visto T + MOTION"); o cadastro
// guarda os serviços avulsos, que é o que tem checklist próprio.
const partir = s => String(s).split('+').map(x => x.trim()).filter(Boolean);
const contagem = new Map();
for (const c of estado.contratos || []) for (const s of partir(c.servico)) contagem.set(s, (contagem.get(s) || 0) + 1);
for (const p of estado.processos || []) for (const s of partir(p.servico)) contagem.set(s, (contagem.get(s) || 0) + 1);
for (const q of Object.values(R.SERVICO_DO_QUADRO)) if (!contagem.has(q)) contagem.set(q, 0);

// ─── QUAIS DOCUMENTOS CADA UM PEDE ─────────────────────────────────────────
// O cartão MODELO é o gabarito que a equipe mantém. Quando não há modelo,
// vale o documento que aparece na maioria dos cartões daquele serviço.
const modelos = new Map();     // serviço → [nomes dos documentos]
const consenso = new Map();    // serviço → Map(documento → quantos cartões)
const quantos = new Map();     // serviço → quantos cartões

for (const [quadro, b] of Object.entries(trello.quadros)) {
  for (const c of b.cartoes) {
    const titulo = String(c.nome).trim();
    let servico = null;
    for (const [re, s] of R.PREFIXOS) if (re.test(titulo)) { servico = s; break; }
    if (!servico) servico = R.SERVICO_DO_QUADRO[quadro] || quadro;

    const itens = (c.checklists || []).flatMap(k => k.itens.map(i => i.nome.trim())).filter(Boolean);
    if (!itens.length) continue;

    if (R.EH_MODELO(titulo)) {
      // mais de um modelo para o mesmo serviço: fica o mais completo
      if (!modelos.has(servico) || modelos.get(servico).length < itens.length) modelos.set(servico, itens);
    } else {
      quantos.set(servico, (quantos.get(servico) || 0) + 1);
      if (!consenso.has(servico)) consenso.set(servico, new Map());
      const m = consenso.get(servico);
      for (const i of new Set(itens)) m.set(i, (m.get(i) || 0) + 1);
    }
  }
}

function documentosDe(servico) {
  if (modelos.has(servico)) return { itens: modelos.get(servico), fonte: 'cartão MODELO do Trello' };
  const m = consenso.get(servico);
  if (!m) return { itens: [], fonte: 'sem checklist no Trello' };
  const n = quantos.get(servico) || 1;
  if (n === 1) return { itens: [...m.keys()], fonte: 'único cartão do serviço no Trello' };
  const corte = Math.max(2, n * 0.5);
  const itens = [...m].filter(([, v]) => v >= corte).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { itens, fonte: `documento presente em metade ou mais dos ${n} cartões` };
}

// O mesmo serviço com outro nome no catálogo que veio de fábrica. Serve para
// dois fins: aproveitar a explicação de cada documento (a "dica" que o cliente
// lê no portal), e não deixar sem lista o serviço que o Trello não cobre.
const EQUIVALENTE = {
  'Visto T':             'Visto T (vítima de tráfico)',
  'Asilo':               'Asilo',
  'VAWA':                'VAWA (autopetição)',
  'F1 - Estudante':      'F-1 (estudante)',
  'GreenCard Casamento': 'Green Card familiar',
  'EB2-NIW':             'EB-2 NIW',
  'Cidadania Americana': 'Cidadania (N-400)',
};

// Devolve a explicação que o sistema já tinha para um documento de nome
// parecido — escrever de novo 141 dicas à mão seria pior e mais arriscado.
function dicaDe(servico, nomeDoc) {
  const velho = (estado.checklists || []).find(c => c.servico === (EQUIVALENTE[servico] || servico));
  if (!velho) return '';
  const alvo = R.norm(nomeDoc);
  if (alvo.length < 4) return '';
  const achou = (velho.documentos || []).find(d => {
    const n = R.norm(d.nome);
    return n === alvo || n.includes(alvo) || alvo.includes(n);
  });
  return achou ? (achou.dica || '') : '';
}

// Modelos que a própria equipe copiou do serviço errado lá no Trello. Entram
// como estão — nada se perde e fica igual ao que ela usa hoje — mas ficam
// marcados, para a Vitória arrumar os quatro de uma vez dentro do sistema.
const COPIADO_DO_SERVICO_ERRADO = {
  'FOIA':                 'veio da lista de Renovação de Passaporte',
  'WORK PERMIT E SOCIAL': 'veio da lista de Renovação de Passaporte',
  'Mudança de Endereço':  'veio da lista de Asilo',
};

// ─── MONTAGEM ──────────────────────────────────────────────────────────────
const nomes = [...contagem.keys()].sort((a, b) => (contagem.get(b) - contagem.get(a)) || a.localeCompare(b));
const servicos = [];
const checklists = [];

for (const nome of nomes) {
  const antigo = (estado.servicos || []).find(s => s.nome === nome);
  servicos.push({ id: antigo ? antigo.id : uid('sv'), nome, template: antigo ? antigo.template : '' });

  let { itens, fonte } = documentosDe(nome);
  let documentos;
  if (itens.length) {
    documentos = itens.map(n => ({ nome: n, dica: dicaDe(nome, n) }));
    fonte = 'Trello — ' + fonte;
  } else {
    // o Trello não cobre este serviço: fica a lista que o sistema já tinha
    const velho = (estado.checklists || []).find(c => c.servico === (EQUIVALENTE[nome] || nome));
    if (!velho) continue;
    documentos = (velho.documentos || []).map(d => ({ nome: d.nome, dica: d.dica || '' }));
    fonte = 'lista que já estava no sistema, de "' + velho.servico + '"';
  }
  const antigoCk = (estado.checklists || []).find(c => c.servico === nome);
  const aviso = COPIADO_DO_SERVICO_ERRADO[nome];
  checklists.push({
    id: antigoCk ? antigoCk.id : uid('ck'),
    servico: nome,
    origem: fonte + (aviso ? '  ⚠ CONFERIR: ' + aviso : ''),
    documentos,
  });
}

// ─── SAÍDA ─────────────────────────────────────────────────────────────────
console.log('SERVIÇOS QUE A LEGAL WAY VENDE DE VERDADE\n');
console.log('   usos  serviço                              docs  com dica  de onde veio a lista');
for (const s of servicos) {
  const ck = checklists.find(c => c.servico === s.nome);
  console.log('  ' + String(contagem.get(s.nome)).padStart(5) + '  ' + s.nome.slice(0, 36).padEnd(38) +
              String(ck ? ck.documentos.length : 0).padStart(4) + '  ' +
              String(ck ? ck.documentos.filter(d => d.dica).length : 0).padStart(8) + '  ' +
              (ck ? ck.origem : '— sem checklist'));
}

const suspeitos = checklists.filter(c => /CONFERIR/.test(c.origem));
if (suspeitos.length) {
  console.log('\n⚠ ESTES QUATRO ESTÃO ERRADOS NO PRÓPRIO TRELLO — entram como estão, para conferir depois:');
  suspeitos.forEach(c => console.log('   ' + c.servico + '  —  ' + c.origem.split('⚠ CONFERIR: ')[1]));
}

const saindo = (estado.servicos || []).filter(s => !nomes.includes(s.nome));
console.log('\nSERVIÇOS DE CATÁLOGO QUE SAEM DO CADASTRO (' + saindo.length + ') — nenhum contrato ou processo usa:');
saindo.forEach(s => console.log('   ' + s.nome));

console.log('\nresumo: ' + servicos.length + ' serviços · ' + checklists.length + ' com lista de documentos · ' +
            checklists.reduce((s, c) => s + c.documentos.length, 0) + ' documentos no total');

if (!arg('--gravar')) { console.log('\nSimulação. Rode com --gravar para gerar o arquivo.\n'); process.exit(0); }

const saida = path.join(__dirname, 'importar-servicos.json');
fs.writeFileSync(saida, JSON.stringify({
  formato: 'legalway-backup-v1', gerado: new Date().toISOString(),
  observacao: 'Serviços e checklists reais, tirados dos contratos e dos cartões MODELO do Trello',
  arquivos: [],
  armazenamento: [
    { chave: 'legalway-servicos-v1', valor: servicos },
    { chave: 'legalway-checklists-v1', valor: checklists },
  ],
}, null, 1));
console.log('\nArquivo: ' + saida + '  (' + (fs.statSync(saida).size / 1024).toFixed(0) + ' KB)');
console.log('No sistema: Configurações → Restaurar de um backup.\n');
