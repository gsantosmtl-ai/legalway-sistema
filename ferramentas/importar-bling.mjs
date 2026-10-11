#!/usr/bin/env node
// Converte a base do Bling no formato que o sistema carrega.
//
//   node ferramentas/importar-bling.mjs              → só simula, não escreve nada
//   node ferramentas/importar-bling.mjs --gravar     → gera o arquivo de importação
//   node ferramentas/importar-bling.mjs --planilha   → exporta CSVs para conferir antes
//
// O Bling é a fonte da verdade de quem assinou contrato: um pedido de venda só
// existe lá depois que o cliente assinou. Então tudo que vem daqui entra no
// sistema como contrato ASSINADO, com cliente e parcelas reais.
//
// De onde vêm os dados (ferramentas/planilhas/):
//   bling/contatos.csv            cadastro
//   bling/pedidos-de-venda.csv    os contratos
//   bling/bling-financeiro.json   contas a receber e a pagar
//   importar-no-sistema.json      o que já foi importado do Kommo
//
// O arquivo sai em ferramentas/importar-bling-no-sistema.json e contém o estado
// COMPLETO de todos os módulos — inclusive os leads do Kommo, menos os que
// viraram cliente. No sistema: Configurações → Restaurar de um backup.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const P = path.join(AQUI, 'planilhas');
const SAIDA = path.join(AQUI, 'importar-bling-no-sistema.json');
const KOMMO = path.join(AQUI, 'importar-no-sistema.json');

// ─── REGRAS ────────────────────────────────────────────────────────────────

// O Bling tem o mesmo serviço cadastrado com dois nomes. Aqui se decide qual fica.
const SERVICOS = {
  'Tradução dos documentos': 'Tradução de Documentos',
};

// Contas financeiras do Bling → nome da conta no sistema.
const CONTAS = {
  'TRUIST - EUA': 'Truist',
  'WISE USD': 'Wise',
  'INVESTIMENTO TRUIST': 'Investimento Truist',
  'C6 PIX BR': 'C6 PIX BR',
  'Nubank': 'Nubank',
  'Caixa': 'Caixa',
};

// Categoria para as contas a pagar, que no Bling estão todas sem categoria.
// A chave é procurada no nome do fornecedor, sem acento e em minúsculas.
const CATEGORIAS = [
  [/usps|correio|fedex|ups/,                     'Serviço de terceiros'],
  [/traducao|tradutor|camila/,                   'Serviço de terceiros'],
  [/psicolog|leticia/,                           'Serviço de terceiros'],
  [/taxa|stripe|tarifa|square|wise/,             'Impostos'],
  [/trafego|anuncio|meta|google|marketing/,      'Marketing'],
  [/aluguel|regus|escritorio|material|amazon/,   'Escritório'],
  [/sdr|jean paulo/,                             'Comissão SDR'],
  [/owner draw|retirada|socio|llc|corp|inc/,     'Salários'],
  [/contabil|claudia lima|tax/,                  'Serviço de terceiros'],
];
const CATEGORIA_PADRAO = 'Serviço de terceiros';

// O Stripe cobra percentual + fixo em cada parcela. O Bling guarda; o sistema
// ainda não mostra, mas os campos vão junto para não perder o dado.
const GUARDAR_TAXA = true;

// ─── FERRAMENTAS ───────────────────────────────────────────────────────────
const arg = (f) => process.argv.includes(f);
const GRAVAR = arg('--gravar');
const PLANILHA = arg('--planilha');

function parseCSV(texto, sep) {
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) { if (c === '"') { if (texto[i+1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
const lerCSV = (nome) => {
  const l = parseCSV(fs.readFileSync(path.join(P, nome), 'utf8').replace(/^﻿/, ''), ';');
  const cab = l[0];
  return { cab, linhas: l.slice(1).filter(x => x[0]), col: (n) => cab.indexOf(n) };
};
const fim8 = (s) => { const n = String(s||'').replace(/\D/g,''); return n.length >= 8 ? n.slice(-8) : ''; };
const email = (s) => String(s||'').trim().toLowerCase();
const norm = (s) => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
const PARTICULAS = new Set(['de','da','do','das','dos','e','di','du','del','van','von','la','le']);
const fuzzy = (n) => { const p = norm(n).split(' ').filter(x => x.length > 2 && !PARTICULAS.has(x));
  return p.length >= 2 ? p[0] + ' ' + p[p.length-1] : ''; };
// "5.490,00" é cinco mil e quatrocentos e noventa, não cinco vírgula quatro.
const num = (v) => Number(String(v ?? '0').replace(/\./g,'').replace(',','.')) || 0;
// Mas o Bling mistura os dois formatos no mesmo registro: "valor" vem
// "224,58" e "valorPago" vem "216.57". Ler o segundo com a regra do primeiro
// transformava 216,57 em 21.657 — a soma dos recebidos dava 30 milhões.
const numEn = (v) => Number(String(v ?? '0').replace(/,/g,'')) || 0;
// O Bling escreve vencimento como dd/mm/aaaa e competência como aaaa-mm-dd.
const data = (s) => {
  const t = String(s||'').trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return t.split('/').reverse().join('-');
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0,10);
  return '';
};
let seq = 0;
const uid = (p) => `${p}bl${Date.now().toString(36)}${(seq++).toString(36)}`;
const agora = () => new Date().toISOString();
const hoje = () => agora().slice(0,10);

// ─── 1. LER O BLING ────────────────────────────────────────────────────────
const C = lerCSV('bling/contatos.csv');
const cadastro = C.linhas.map(l => ({
  blingId: l[C.col('ID')], nome: l[C.col('Nome')],
  email: email(l[C.col('E-mail')]),
  telefone: (l[C.col('Celular')] || l[C.col('Fone')] || '').trim(),
  endereco: [l[C.col('Endereço')], l[C.col('Número')], l[C.col('Bairro')],
             l[C.col('Cidade')], l[C.col('UF')], l[C.col('CEP')]].filter(Boolean).join(', '),
  nascimento: data(l[C.col('Data nascimento')]),
  observacoes: l[C.col('Observações')] || '',
}));

const V = lerCSV('bling/pedidos-de-venda.csv');
const itens = V.linhas.map(l => ({
  numero: String(l[V.col('Número pedido')]).trim(),
  nome: l[V.col('Nome Comprador')],
  email: email(l[V.col('E-mail Comprador')]),
  telefone: (l[V.col('Celular Comprador')] || l[V.col('Telefone Comprador')] || '').trim(),
  endereco: l[V.col('Endereço Comprador')] || '',
  servico: SERVICOS[(l[V.col('Produto')]||'').trim()] || (l[V.col('Produto')]||'').trim(),
  vendedor: (l[V.col('Vendedor')]||'').trim(),
  valor: num(l[V.col('Valor Total')]),
  data: data(l[V.col('Data')]),
  pagamento: (l[V.col('Forma Pagamento')]||'').trim(),
  observacoes: (l[V.col('Observações')]||'').trim(),
}));

const FIN = JSON.parse(fs.readFileSync(path.join(P, 'bling/bling-financeiro.json'), 'utf8')).dados;
const receber = [...FIN.receberAberto.map(r => ({...r, recebido: false})),
                 ...FIN.receberPago.map(r => ({...r, recebido: true}))];
const pagar = [...FIN.pagarAberto.map(r => ({...r, pago: false})),
               ...FIN.pagarPago.map(r => ({...r, pago: true}))];

// ─── 2. CLIENTES ───────────────────────────────────────────────────────────
// Uma pessoa por cadastro do Bling. Quem aparece só no pedido ganha cadastro.
const clientes = [];
const porBlingId = new Map(), porEmail = new Map(), porNome = new Map(), porFuzzy = new Map();
const idx = (m, k, v) => { if (k && !m.has(k)) m.set(k, v); };
function novoCliente(base) {
  const c = { id: uid('cl'), nome: base.nome, telefone: base.telefone || '', email: base.email || '',
    endereco: base.endereco || '', criadoEm: agora(), contratoIds: [],
    blingId: base.blingId || null,
    historico: [{ quando: agora(), texto: 'Importado do Bling' }] };
  if (base.nascimento) c.nascimento = base.nascimento;
  if (base.observacoes) c.historico.push({ quando: agora(), texto: base.observacoes });
  clientes.push(c);
  idx(porBlingId, c.blingId, c); idx(porEmail, c.email, c);
  idx(porNome, norm(c.nome), c); idx(porFuzzy, fuzzy(c.nome), c);
  return c;
}
function acharCliente({ blingId, email: e, nome }) {
  return (blingId && porBlingId.get(blingId))
      || (e && porEmail.get(e))
      || porNome.get(norm(nome))
      || porFuzzy.get(fuzzy(nome))
      || null;
}
cadastro.forEach(novoCliente);

// ─── 3. CONTRATOS ──────────────────────────────────────────────────────────
// Um contrato por pedido de venda. Pedido com vários itens vira um contrato só,
// com os serviços somados — é como o escritório vende.
const porPedido = new Map();
for (const it of itens) {
  if (!porPedido.has(it.numero)) porPedido.set(it.numero, { ...it, servicos: [], valor: 0 });
  const p = porPedido.get(it.numero);
  p.servicos.push(it.servico);
  p.valor += it.valor;
  if (!p.email && it.email) p.email = it.email;
  if (!p.telefone && it.telefone) p.telefone = it.telefone;
}
const contratos = [];
const contratoPorNumero = new Map();
let clientesCriadosPeloPedido = 0;
for (const p of porPedido.values()) {
  let cli = acharCliente(p);
  if (!cli) { cli = novoCliente(p); clientesCriadosPeloPedido++; }
  if (!cli.email && p.email) { cli.email = p.email; idx(porEmail, p.email, cli); }
  if (!cli.telefone && p.telefone) cli.telefone = p.telefone;

  const servico = [...new Set(p.servicos)].join(' + ');
  const c = {
    id: uid('c'), cliente: cli.nome, telefone: cli.telefone, email: cli.email,
    endereco: cli.endereco || p.endereco, cpf: '', nacionalidade: '',
    servico, vendedor: p.vendedor, valor: Number(p.valor.toFixed(2)),
    sinal: 0, entrada: 0, numParcelas: 0, dataPrimeiraParcela: null,
    recorrencia: 'mensal', diasCustom: 30, pagamento: p.pagamento,
    observacoes: p.observacoes,
    // Já nasce assinado: no Bling o pedido só existe depois da assinatura. E com
    // a etapa 'Assinado' a automação do servidor não tenta gerar parcela de novo
    // (server/src/automacoes.js, contasDoContrato).
    etapa: 'Assinado',
    dataEnvio: p.data, dataAssinatura: p.data,
    pedidoBling: p.numero,
    criadoEm: agora(),
    historico: [{ quando: agora(), texto: `Importado do Bling — pedido de venda nº ${p.numero}` }],
  };
  contratos.push(c);
  contratoPorNumero.set(p.numero, c);
  cli.contratoIds.push(c.id);
}

// ─── 4. CONTAS A RECEBER ───────────────────────────────────────────────────
const refPedido = /pedido de venda n.?\s*(\d+)/i;
const contasReceber = [];
const parcelasDoContrato = new Map();
let avulsas = 0;
for (const r of receber) {
  const m = String(r.observacoes||'').match(refPedido);
  const contrato = m ? contratoPorNumero.get(m[1]) : null;
  if (!contrato) avulsas++;
  const cli = (r.idContato && porBlingId.get(r.idContato))
           || (r.email && porEmail.get(email(r.email)))
           || porNome.get(norm(r.nome)) || porFuzzy.get(fuzzy(r.nome)) || null;
  const valor = num(r.valor);
  const venc = data(r.vencimento);
  const conta = {
    id: uid('fr'),
    contratoId: contrato ? contrato.id : null,
    clienteNome: (cli && cli.nome) || r.nome || '',
    servico: contrato ? contrato.servico : '',
    vendedor: contrato ? contrato.vendedor : '',
    descricao: '',                         // preenchido abaixo, com a posição da parcela
    valor,
    vencimento: venc,
    status: r.recebido ? 'Pago' : (venc && venc < hoje() ? 'Atrasado' : 'A vencer'),
    valorRecebido: r.recebido ? valor : 0,
    dataRecebimento: r.recebido ? (data(r.liquidacao) || venc) : null,
    formaPagamento: r.descricaoFormaPagamento || '',
    conta: CONTAS[r.descricaoContaContabil] || '',
    observacao: String(r.observacoes||'').replace(refPedido, '').replace(/^[\s—–-]+/,'').trim(),
    criadoEm: agora(),
    blingId: r.id,
  };
  if (GUARDAR_TAXA) {
    const perc = num(r.aliquotaTaxa), fixa = num(r.valorTaxa);
    if (perc || fixa) {
      conta.taxaPercentual = perc;
      conta.taxaFixa = fixa;
      // Na parcela já recebida o Bling guarda em valorPago o que de fato caiu na
      // conta, com a taxa descontada. Nas que ainda vão vencer, calculamos.
      const liquidoReal = r.recebido ? numEn(r.valorPago) : 0;
      conta.valorLiquido = liquidoReal > 0 ? liquidoReal
        : Number((valor - (valor * perc / 100) - fixa).toFixed(2));
    }
  }
  contasReceber.push(conta);
  if (contrato) {
    if (!parcelasDoContrato.has(contrato.id)) parcelasDoContrato.set(contrato.id, []);
    parcelasDoContrato.get(contrato.id).push(conta);
  }
}
// Numerar as parcelas na ordem do vencimento, que é como o vendedor lê.
for (const [contratoId, lista] of parcelasDoContrato) {
  lista.sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
  lista.forEach((p, i) => { p.descricao = `Parcela ${i+1}/${lista.length}`; });
  const c = contratos.find(x => x.id === contratoId);
  if (c) {
    c.numParcelas = lista.length;
    c.dataPrimeiraParcela = lista[0].vencimento || null;
  }
}
contasReceber.filter(c => !c.descricao).forEach(c => { c.descricao = 'Avulsa'; });

// ─── 5. CONTAS A PAGAR ─────────────────────────────────────────────────────
function categoriaDe(fornecedor, historico) {
  const t = norm(fornecedor + ' ' + historico);
  for (const [re, cat] of CATEGORIAS) if (re.test(t)) return cat;
  return CATEGORIA_PADRAO;
}
const contasPagar = pagar.map(p => {
  const valor = num(p.valor);
  const venc = data(p.vencimento);
  return {
    id: uid('cp'),
    fornecedor: p.nome || 'Não informado',
    descricao: String(p.observacoes || '').trim() || 'Importado do Bling',
    valor, vencimento: venc,
    categoria: categoriaDe(p.nome, p.observacoes),
    centroCusto: '', conta: CONTAS[p.descricaoContaContabil] || '',
    formaPagamento: p.descricaoFormaPagamento || '',
    observacao: '', comprovante: null,
    status: p.pago ? 'Pago' : (venc && venc < hoje() ? 'Vencida' : 'A vencer'),
    valorPago: p.pago ? valor : 0,
    dataPagamento: p.pago ? (data(p.liquidacao) || venc) : null,
    tipo: 'unica', criadoEm: agora(), blingId: p.id,
  };
});

// ─── 6. TIRAR DO FUNIL QUEM JÁ É CLIENTE ───────────────────────────────────
// Cliente que assinou não pode continuar na fila do SDR nem no funil: na
// segunda-feira o vendedor ligaria oferecendo o que a pessoa já comprou.
let kommo = { leads: [], funil: [], sdr: [] };
if (fs.existsSync(KOMMO)) {
  const k = JSON.parse(fs.readFileSync(KOMMO, 'utf8'));
  const pega = (chave) => (k.armazenamento.find(b => b.chave === chave) || {}).valor || [];
  kommo = { leads: pega('legalway-leads-v1'), funil: pega('legalway-funil-v1'), sdr: pega('legalway-sdr-v1') };
}
const chavesCliente = new Map();   // chave -> nome do cliente, pra conferência
for (const c of clientes) {
  if (!c.contratoIds.length) continue;      // só quem tem contrato assinado
  if (c.email) chavesCliente.set('e:' + c.email, c.nome);
  const t = fim8(c.telefone); if (t) chavesCliente.set('t:' + t, c.nome);
  chavesCliente.set('n:' + norm(c.nome), c.nome);
}
const nomeDoCliente = (x) => chavesCliente.get('e:' + email(x.email))
  || chavesCliente.get('t:' + fim8(x.telefone))
  || chavesCliente.get('n:' + norm(x.nome)) || '?';
// Só tira do funil com prova forte: e-mail igual ou telefone igual. Nome
// parecido não basta — "Lia Souza" e "Lanna Ludmila Queiroga Gomes de Souza"
// são pessoas diferentes, e tirar a errada some com um lead vivo.
const porQue = (x) => {
  const e = email(x.email);
  if (e && chavesCliente.has('e:' + e)) return 'e-mail';
  const t = fim8(x.telefone);
  if (t && chavesCliente.has('t:' + t)) return 'telefone';
  if (chavesCliente.has('n:' + norm(x.nome))) return 'nome exato';
  return null;
};
const retirados = { leads: [], funil: [], sdr: [] };
for (const bloco of ['leads','funil','sdr']) {
  kommo[bloco] = kommo[bloco].filter(x => {
    const via = porQue(x);
    if (!via) return true;
    retirados[bloco].push({ nome: x.nome, via, cliente: nomeDoCliente(x) });
    return false;
  });
}

// ─── 6b. TIRAR OS FORNECEDORES DA LISTA DE CLIENTES ────────────────────────
// O cadastro do Bling junta cliente e fornecedor na mesma lista. Quem não tem
// contrato nem parcela não é cliente do escritório — é quem o escritório paga,
// e esse já aparece pelo nome em contas a pagar.
const temParcela = new Set(contasReceber.map(c => c.clienteNome));
const descartados = clientes.filter(c => !c.contratoIds.length && !temParcela.has(c.nome));
const soClientes = clientes.filter(c => c.contratoIds.length || temParcela.has(c.nome));

// ─── 7. SAÍDA ──────────────────────────────────────────────────────────────
const comContrato = soClientes.filter(c => c.contratoIds.length);
const recebido = contasReceber.filter(c => c.status === 'Pago').reduce((s,c) => s+c.valor, 0);
const aReceber = contasReceber.filter(c => c.status !== 'Pago').reduce((s,c) => s+c.valor, 0);
const taxaTotal = contasReceber.reduce((s,c) => s + (c.valor - (c.valorLiquido ?? c.valor)), 0);

console.log('\nCLIENTES');
console.log(`  ${soClientes.length} clientes  (${comContrato.length} com contrato assinado)`);
console.log(`  ${descartados.length} contatos do Bling descartados — fornecedores, sem contrato nem parcela`);
console.log(`  ${clientesCriadosPeloPedido} criadas a partir do pedido, sem cadastro no Bling`);
console.log('\nCONTRATOS');
console.log(`  ${contratos.length} contratos, todos como Assinado`);
const porVendedor = {};
contratos.forEach(c => { porVendedor[c.vendedor || '(sem vendedor)'] = (porVendedor[c.vendedor || '(sem vendedor)'] || 0) + 1; });
Object.entries(porVendedor).sort((a,b) => b[1]-a[1]).forEach(([v,n]) => console.log(`     ${String(n).padStart(4)}  ${v}`));
console.log(`  valor total: $${contratos.reduce((s,c) => s+c.valor, 0).toFixed(2)}`);
console.log('\nCONTAS A RECEBER');
console.log(`  ${contasReceber.length} parcelas  (${avulsas} sem pedido de origem)`);
console.log(`  recebido  $${recebido.toFixed(2)}`);
console.log(`  a receber $${aReceber.toFixed(2)}`);
if (GUARDAR_TAXA) console.log(`  taxa de gateway guardada: $${taxaTotal.toFixed(2)}`);
console.log('\nCONTAS A PAGAR');
console.log(`  ${contasPagar.length} lançamentos`);
const porCat = {};
contasPagar.forEach(c => { porCat[c.categoria] = (porCat[c.categoria] || 0) + 1; });
Object.entries(porCat).sort((a,b) => b[1]-a[1]).forEach(([v,n]) => console.log(`     ${String(n).padStart(4)}  ${v}`));
console.log('\nSAÍDA DO FUNIL (já são clientes)');
console.log(`  ${retirados.leads.length} da entrada de leads · ${retirados.funil.length} do funil · ${retirados.sdr.length} do SDR`);
const todosRetirados = [...retirados.leads, ...retirados.funil, ...retirados.sdr];
const vistos = new Set();
todosRetirados.forEach(r => {
  const k = r.nome + '|' + r.cliente;
  if (vistos.has(k)) return; vistos.add(k);
  console.log(`     "${r.nome}" → ${r.cliente}   (por ${r.via})`);
});
console.log(`\n  sobra no Kommo: ${kommo.leads.length} leads · ${kommo.funil.length} no funil · ${kommo.sdr.length} no SDR`);

if (PLANILHA) {
  const dir = path.join(P, 'conferir-bling');
  fs.mkdirSync(dir, { recursive: true });
  const esc = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  const csv = (arr, cols) => [cols.join(';'), ...arr.map(o => cols.map(c => esc(o[c])).join(';'))].join('\n');
  fs.writeFileSync(path.join(dir,'clientes.csv'), csv(soClientes, ['nome','telefone','email','endereco','blingId']));
  fs.writeFileSync(path.join(dir,'contratos.csv'), csv(contratos, ['pedidoBling','cliente','servico','vendedor','valor','numParcelas','dataAssinatura','email','telefone']));
  fs.writeFileSync(path.join(dir,'contas-a-receber.csv'), csv(contasReceber, ['clienteNome','descricao','valor','vencimento','status','formaPagamento','conta','valorLiquido','servico','vendedor']));
  fs.writeFileSync(path.join(dir,'contas-a-pagar.csv'), csv(contasPagar, ['fornecedor','descricao','valor','vencimento','status','categoria','conta','formaPagamento']));
  console.log(`\nPlanilhas para conferir em ${dir}`);
}

if (!GRAVAR) {
  console.log('\nSimulação — nada foi escrito. Rode com --gravar quando estiver certo.\n');
  process.exit(0);
}

fs.writeFileSync(SAIDA, JSON.stringify({
  formato: 'legalway-backup-v1',
  gerado: agora(),
  observacao: 'Importação do Bling — clientes, contratos assinados, contas a receber e a pagar',
  armazenamento: [
    { chave: 'legalway-clientes-v1',     valor: soClientes },
    { chave: 'legalway-contratos-v1',    valor: contratos },
    { chave: 'legalway-financeiro-v1',   valor: contasReceber },
    { chave: 'legalway-contas-pagar-v1', valor: contasPagar },
    { chave: 'legalway-leads-v1',        valor: kommo.leads },
    { chave: 'legalway-funil-v1',        valor: kommo.funil },
    { chave: 'legalway-sdr-v1',          valor: kommo.sdr },
  ],
}, null, 1));
console.log(`\nArquivo pronto: ${SAIDA}`);
console.log('No sistema: Configurações → Restaurar de um backup → escolher esse arquivo.\n');
