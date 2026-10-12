#!/usr/bin/env node
// Auditoria da migração do Trello, em três frentes:
//
//   1. ETAPA      — o card está na coluna que corresponde ao que de fato aconteceu?
//   2. DINHEIRO   — o valor pago bate com o contrato e com o estágio do processo?
//   3. DOCUMENTOS — cada arquivo está no card do dono certo?
//
//   node ferramentas/auditar-trello.cjs            → relatório
//   node ferramentas/auditar-trello.cjs --csv      → grava as planilhas de conferência
//
// Lê o estado que foi para o sistema (o último arquivo de registros do lote 5),
// os contratos e parcelas do Bling, e a exportação do Trello.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = path.join(__dirname, 'planilhas');
const R = require('./regras-trello.cjs');

const arg = f => process.argv.includes(f);
const n = v => Number(v || 0);
const us = v => 'US$ ' + n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── ESTADO ────────────────────────────────────────────────────────────────
const registros = JSON.parse(fs.readFileSync(path.join(__dirname, 'importar-trello-lote5-parte15de15-registros.json'), 'utf8'));
const bloco = (b, k) => (b.armazenamento.find(x => x.chave === k) || {}).valor || [];
const processos = bloco(registros, 'legalway-processos-documentacao-v1');
const clientes = bloco(registros, 'legalway-clientes-v1');

const bling = JSON.parse(fs.readFileSync(path.join(__dirname, 'importar-bling-completo.json'), 'utf8'));
const contratos = bloco(bling, 'legalway-contratos-v1');
const parcelas = bloco(bling, 'legalway-financeiro-v1');
// aplica o religamento das 122 parcelas que voltaram para o dono
try {
  const { mapa } = JSON.parse(fs.readFileSync(path.join(__dirname, 'religar-parcelas.json'), 'utf8'));
  for (const p of parcelas) if (!p.contratoId && mapa[p.id]) p.contratoId = mapa[p.id];
} catch (e) { console.log('(sem religar-parcelas.json — as 122 parcelas religadas não entram na conta)\n'); }

const trello = JSON.parse(fs.readFileSync(path.join(P, 'trello/trello-organizar.json'), 'utf8'));
const cartao = {};
const listaDe = {};
for (const [quadro, b] of Object.entries(trello.quadros)) {
  const nomeLista = id => (b.listas.find(l => l.id === id) || {}).nome || '';
  for (const c of b.cartoes) { cartao[c.id] = { ...c, quadro }; listaDe[c.id] = nomeLista(c.idLista); }
}

// ─── ORDEM DAS ETAPAS ──────────────────────────────────────────────────────
const ETAPAS = ['Aguardando boas-vindas', 'Documentos solicitados', 'Recebendo documentos',
  'Documentação completa', 'Aguardando autorização financeira', 'Liberado para protocolo',
  'Protocolado', 'Em acompanhamento'];
const ordem = e => { const i = ETAPAS.indexOf(e); return i < 0 ? 99 : i; };

const achados = { etapa: [], dinheiro: [], documento: [] };

// ═══ 1. ETAPA ══════════════════════════════════════════════════════════════
// A etapa veio da lista do Trello. O contra-prova é o próprio conteúdo do
// card: quem está em "Protocolado" deveria ter documento entregue, e quem
// está no começo não deveria ter tudo aprovado.
for (const p of processos.filter(p => p.origemTrello)) {
  const check = p.checklist || [];
  const aprovados = check.filter(d => d.status === 'Aprovado').length;
  const pct = check.length ? aprovados / check.length : null;
  const arquivos = (p.anexos || []).length + check.filter(d => typeof d.arquivo === 'string').length;
  const origens = [p.origemTrello, ...(p.origemTrelloAnteriores || [])];
  const listas = origens.map(o => o.quadro + ' › ' + o.lista).join('  |  ');

  const adiantado = ordem(p.status) >= ordem('Protocolado');
  const inicial = ordem(p.status) <= ordem('Documentos solicitados');

  if (adiantado && arquivos === 0 && aprovados === 0)
    achados.etapa.push({ grave: true, cliente: p.clienteNome, servico: p.servico, etapa: p.status,
      porque: 'está em etapa de processo já enviado, mas não tem nenhum documento nem item aprovado', listas });
  else if (inicial && pct === 1 && check.length >= 5)
    achados.etapa.push({ grave: false, cliente: p.clienteNome, servico: p.servico, etapa: p.status,
      porque: `está no começo do funil com ${aprovados}/${check.length} documentos já aprovados`, listas });
  else if (origens.length > 1) {
    const etapas = origens.map(o => R.QUADRO_SEM_ETAPA[o.quadro] ? R.QUADRO_SEM_ETAPA[o.quadro]
      : (R.PESSOAS.includes(String(o.lista).toUpperCase().trim()) ? 'Recebendo documentos' : R.ETAPA[String(o.lista).toUpperCase().trim()]));
    if (new Set(etapas.filter(Boolean)).size > 1)
      achados.etapa.push({ grave: false, cliente: p.clienteNome, servico: p.servico, etapa: p.status,
        porque: 'tinha ' + origens.length + ' cartões em etapas diferentes; ficou a do mexido por último', listas });
  }
}

// ═══ 2. DINHEIRO ═══════════════════════════════════════════════════════════
const porContrato = {};
for (const c of contratos) porContrato[c.id] = { contrato: c, parcelas: [] };
for (const x of parcelas) if (x.contratoId && porContrato[x.contratoId]) porContrato[x.contratoId].parcelas.push(x);

for (const p of processos.filter(p => p.origemTrello)) {
  const c = p.contratoId ? porContrato[p.contratoId] : null;
  if (!c) {
    // Serviço avulso (reagendar biometria, mudar endereço, FOIA) muitas vezes
    // nunca virou contrato no Bling — é cobrança direta. Já um Visto T sem
    // contrato é buraco de verdade: é o produto principal da casa.
    const avulso = !contratos.some(x => R.norm(x.servico) === R.norm(p.servico));
    achados.dinheiro.push({ grave: !avulso, cliente: p.clienteNome, servico: p.servico, etapa: p.status,
      porque: avulso ? 'sem contrato — serviço que nunca foi vendido por contrato no Bling, a cobrança foi avulsa'
                     : 'SEM CONTRATO, num serviço que sempre tem contrato — falta lançar' });
    continue;
  }
  const valor = n(c.contrato.valor);
  const cobrado = c.parcelas.reduce((s, x) => s + n(x.valor), 0);
  const recebido = c.parcelas.reduce((s, x) => s + n(x.valorRecebido), 0);
  const pct = valor > 0 ? recebido / valor : null;
  const atrasadas = c.parcelas.filter(x => x.status === 'Atrasado');

  if (valor === 0)
    achados.dinheiro.push({ grave: true, cliente: p.clienteNome, servico: p.servico, etapa: p.status,
      porque: 'contrato com valor zerado, mas ' + c.parcelas.length + ' parcela(s) lançada(s) somando ' + us(cobrado) });
  else if (ordem(p.status) >= ordem('Protocolado') && recebido === 0)
    achados.dinheiro.push({ grave: true, cliente: p.clienteNome, servico: p.servico, etapa: p.status,
      porque: 'processo já enviado e NADA recebido em ' + c.parcelas.length + ' parcela(s) de ' + us(valor) });
  else if (atrasadas.length >= 3)
    achados.dinheiro.push({ grave: false, cliente: p.clienteNome, servico: p.servico, etapa: p.status,
      porque: atrasadas.length + ' parcelas atrasadas somando ' + us(atrasadas.reduce((s, x) => s + n(x.valor), 0)) });
  else if (pct !== null && pct > 1.05)
    achados.dinheiro.push({ grave: false, cliente: p.clienteNome, servico: p.servico, etapa: p.status,
      porque: 'recebido ' + us(recebido) + ' num contrato de ' + us(valor) + ' (' + Math.round(pct * 100) + '%)' });
}

// ═══ 3. DOCUMENTOS ═════════════════════════════════════════════════════════
// O teste forte: o mesmo arquivo (mesma impressão digital) aparecendo em dois
// clientes diferentes. É assim que um passaporte iria parar no card do vizinho.
const porDigital = new Map();
for (const p of processos) {
  for (const a of p.anexos || []) if (a.digital) {
    if (!porDigital.has(a.digital)) porDigital.set(a.digital, []);
    porDigital.get(a.digital).push({ cliente: p.clienteNome, servico: p.servico, nome: a.nome });
  }
  for (const d of p.checklist || []) if (d.digital) {
    if (!porDigital.has(d.digital)) porDigital.set(d.digital, []);
    porDigital.get(d.digital).push({ cliente: p.clienteNome, servico: p.servico, nome: d.nomeArquivo || d.nome });
  }
}
for (const [dig, onde] of porDigital) {
  const pessoas = [...new Set(onde.map(x => x.cliente))];
  if (pessoas.length < 2) continue;
  // A mesma pessoa em dois serviços compartilhando o passaporte é normal e
  // esperado; o que preocupa é o documento de um cliente no card de outro.
  const mesmaPessoa = new Set(pessoas.map(x => R.fuzzy(x) || R.norm(x))).size === 1;
  if (mesmaPessoa) continue;
  achados.documento.push({ grave: true, cliente: pessoas.join('  ↔  '),
    porque: 'o MESMO arquivo está nos dois: "' + onde[0].nome + '"' });
}

// Conta por card: o que está no sistema bate com o cartão de origem?
const hashPorCartao = {};
const lerColheita = (j) => {
  for (const [c, l] of Object.entries(j)) {
    hashPorCartao[c] = hashPorCartao[c] || [];
    for (const a of l) hashPorCartao[c].push(a.conteudo ? crypto.createHash('sha1').update(a.conteudo).digest('hex') : 'VAZIO');
  }
};
for (const f of fs.readdirSync(path.join(P, 'trello')))
  if (/^anexos-.*\.json$/.test(f)) lerColheita(JSON.parse(fs.readFileSync(path.join(P, 'trello', f), 'utf8')));
const dirVisa = path.join(P, 'trello/visa-t');
if (fs.existsSync(dirVisa)) for (const f of fs.readdirSync(dirVisa))
  lerColheita(JSON.parse(fs.readFileSync(path.join(dirVisa, f), 'utf8')));

let batem = 0;
for (const p of processos.filter(p => p.origemTrello)) {
  const ids = [p.origemTrello, ...(p.origemTrelloAnteriores || [])].map(o => o.cartaoId);
  // Dois quadros foram colhidos por scripts diferentes, com formato de id de
  // anexo diferente. Casar pelo id falharia; casar pelo conteúdo do cartão
  // funciona em todos.
  const esperado = new Set(); let vazios = 0, semColheita = false;
  for (const cid of ids) {
    const colhido = hashPorCartao[cid];
    if (!colhido) { if ((cartao[cid] || { anexos: [] }).anexos.length) semColheita = true; continue; }
    for (const h of colhido) { if (h === 'VAZIO') vazios++; else esperado.add(h); }
  }
  if (semColheita) continue;
  const tem = (p.anexos || []).length + (p.checklist || []).filter(d => typeof d.arquivo === 'string').length;
  if (esperado.size === tem) batem++;
  else achados.documento.push({ grave: true, cliente: p.clienteNome, servico: p.servico,
    porque: 'Trello tem ' + esperado.size + ' arquivos distintos' + (vazios ? ' (+' + vazios + ' vazios)' : '') + ', o sistema tem ' + tem });
}

// ─── RELATÓRIO ─────────────────────────────────────────────────────────────
const imp = processos.filter(p => p.origemTrello);
console.log('AUDITORIA DA MIGRAÇÃO DO TRELLO');
console.log('processos vindos do Trello: ' + imp.length + ' de ' + processos.length + '  ·  clientes: ' + clientes.length + '\n');

const secao = (titulo, lista) => {
  const graves = lista.filter(x => x.grave), leves = lista.filter(x => !x.grave);
  console.log('\n' + titulo);
  console.log('─'.repeat(titulo.length));
  if (!lista.length) { console.log('  ✓ nada a corrigir'); return; }
  if (graves.length) {
    console.log('  ⛔ PRECISA DE OLHO (' + graves.length + '):');
    graves.forEach(x => console.log('     ' + String(x.cliente).slice(0, 38).padEnd(40) + (x.servico ? String(x.servico).slice(0, 20).padEnd(22) : '') + (x.etapa ? String(x.etapa).padEnd(26) : '') + x.porque));
  }
  if (leves.length) {
    console.log('  ⚠ conferir quando puder (' + leves.length + '):');
    leves.forEach(x => console.log('     ' + String(x.cliente).slice(0, 38).padEnd(40) + (x.servico ? String(x.servico).slice(0, 20).padEnd(22) : '') + (x.etapa ? String(x.etapa).padEnd(26) : '') + x.porque));
  }
};

secao('1. ETAPA DO CARD', achados.etapa);
secao('2. DINHEIRO', achados.dinheiro);
secao('3. DOCUMENTOS NO CARD CERTO', achados.documento);

console.log('\n\nRESUMO');
console.log('  cards com a contagem de arquivos batendo com o Trello: ' + batem + ' de ' + imp.length);
console.log('  arquivo que aparece em mais de um cliente             : ' +
            achados.documento.filter(x => /MESMO arquivo/.test(x.porque)).length);
console.log('  problemas de etapa                                    : ' + achados.etapa.length);
console.log('  problemas de dinheiro                                 : ' + achados.dinheiro.length);

if (arg('--csv')) {
  const esc = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  for (const [nome, lista] of Object.entries(achados)) {
    const linhas = ['gravidade;cliente;servico;etapa;o que foi encontrado;listas no trello',
      ...lista.map(x => [x.grave ? 'alta' : 'conferir', x.cliente, x.servico || '', x.etapa || '', x.porque, x.listas || ''].map(esc).join(';'))];
    const f = path.join(P, 'auditoria-trello-' + nome + '.csv');
    fs.writeFileSync(f, linhas.join('\n'));
    console.log('  planilha: ' + f);
  }
}
