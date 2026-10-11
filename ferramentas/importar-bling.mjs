#!/usr/bin/env node
// Converte a base do Bling no formato que o sistema carrega.
//
//   node ferramentas/importar-bling.mjs --parte 1            → só simula
//   node ferramentas/importar-bling.mjs --parte 1 --gravar   → gera o arquivo da parte
//   node ferramentas/importar-bling.mjs --planilha           → CSVs para conferir antes
//
// A importação vai em três camadas, cada uma conferível antes da seguinte:
//
//   parte 1  cadastro      clientes, e quem virou cliente sai do funil e do SDR
//   parte 2  passado       contratos + tudo que já foi pago e recebido
//   parte 3  futuro        as parcelas e contas que ainda vão vencer
//
// O restore grava só os blocos presentes no arquivo, substituindo cada um por
// inteiro (server/src/backup.js). Por isso a parte 3 reemite também o que a
// parte 2 já tinha — senão apagaria o histórico ao gravar o bloco de novo.
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
const iParte = process.argv.indexOf('--parte');
const PARTE = arg('--tudo') ? 0 : (iParte >= 0 ? Number(process.argv[iParte + 1]) : -1);
if (GRAVAR && ![0,1,2,3].includes(PARTE)) {
  console.error('\nDiga o que gravar: --tudo, ou --parte 1 (cadastro), 2 (passado), 3 (futuro).\n');
  process.exit(1);
}

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
// O telefone do cliente não está em "Celular" nem em "Fone" (13 e 0 preenchidos):
// está na coluna "Contatos", 217 deles, no formato "(239) 691-6071". E em
// "Observações" vem o telefone de emergência de 82 clientes.
// A coluna guarda um telefone inteiro por linha, em formatos variados:
// "(239) 691-6071", "+1 (857) 504-4871", "5084540674", "(47) 99928-7637".
// Recortar com regex partia alguns pelo meio — "(+61) 493-308256" virava
// "61) 493-3082". Então pega o campo todo, e só confere se é mesmo telefone.
const soTelefone = (t) => {
  const texto = String(t || '').trim();
  if (!texto || /[a-zA-Z]/.test(texto)) return '';
  // Alguns trazem dois números separados por barra; fica o primeiro.
  const primeiro = texto.split('/')[0].trim();
  const digitos = primeiro.replace(/\D/g, '').length;
  return digitos >= 7 && digitos <= 15 ? primeiro : '';
};
const telEmergencia = (obs) => {
  const m = String(obs || '').match(/emerg[eê]ncia?[^\d(]*((\(?\d[\d\s().-]{7,})\d)/i)
         || String(obs || '').match(/emergency[^\d(]*((\(?\d[\d\s().-]{7,})\d)/i);
  return m ? m[1].trim() : '';
};

const C = lerCSV('bling/contatos.csv');
const cadastro = C.linhas.map(l => ({
  blingId: l[C.col('ID')], nome: l[C.col('Nome')],
  email: email(l[C.col('E-mail')]),
  telefone: soTelefone(l[C.col('Contatos')]) || (l[C.col('Celular')] || l[C.col('Fone')] || '').trim(),
  telefoneEmergencia: telEmergencia(l[C.col('Observações')]),
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

// A situação do pedido NÃO vem no CSV (o modelo "Backup" do Bling não traz a
// coluna). Sem ela, os 45 pedidos cancelados entrariam como contrato assinado.
// O arquivo abaixo foi levantado em /Api/v3/vendasinternal/list e conferido
// contra o filtro Cancelado da tela: 45 lá, 45 aqui.
const SIT = JSON.parse(fs.readFileSync(path.join(P, 'bling/situacao-pedidos.json'), 'utf8')).situacaoPorPedido;
// Cancelado vira contrato cancelado; o resto é contrato valendo.
const ETAPA_POR_SITUACAO = {
  'Cancelado':    'Cancelado',
  'Em aberto':    'Assinado',
  'Em andamento': 'Assinado',
  'Atendido':     'Assinado',
};

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
  if (base.telefoneEmergencia) c.telefoneEmergencia = base.telefoneEmergencia;
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

// ─── 2b. PEGAR O TELEFONE EMPRESTADO DO KOMMO ──────────────────────────────
// O Bling tem telefone em 9 dos 237 clientes — o cadastro foi feito pelo e-mail.
// Sem isso o escritório não consegue ligar para o próprio cliente. O Kommo tem
// telefone de 2.183 pessoas, e o e-mail serve de ponte.
const KOMMO_COMPLETO = path.join(P, 'kommo-fechados/kommo-completo.json');
let telefonesDoKommo = new Map();
if (fs.existsSync(KOMMO_COMPLETO)) {
  const K = JSON.parse(fs.readFileSync(KOMMO_COMPLETO, 'utf8'));
  const valores = (c, code) => ((c && c.custom_fields_values) || [])
    .filter(x => x.field_code === code).flatMap(x => x.values || []).map(v => String(v.value));
  for (const c of K.contatos) {
    const tel = valores(c, 'PHONE').find(Boolean);
    if (!tel) continue;
    for (const e of valores(c, 'EMAIL').map(email).filter(x => x.includes('@'))) {
      if (!telefonesDoKommo.has(e)) telefonesDoKommo.set(e, tel);
    }
  }
}
let telefonesRecuperados = 0;
for (const c of clientes) {
  if (c.telefone || !c.email) continue;
  const tel = telefonesDoKommo.get(c.email);
  if (!tel) continue;
  c.telefone = tel;
  c.historico.push({ quando: agora(), texto: 'Telefone recuperado do cadastro do Kommo pelo e-mail' });
  telefonesRecuperados++;
}

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
  const situacaoBling = SIT[p.numero] || 'Em aberto';
  const c = {
    id: uid('c'), cliente: cli.nome, telefone: cli.telefone, email: cli.email,
    endereco: cli.endereco || p.endereco, cpf: '', nacionalidade: '',
    servico, vendedor: p.vendedor, valor: Number(p.valor.toFixed(2)),
    sinal: 0, entrada: 0, numParcelas: 0, dataPrimeiraParcela: null,
    recorrencia: 'mensal', diasCustom: 30, pagamento: p.pagamento,
    observacoes: p.observacoes,
    // No Bling o pedido só existe depois da assinatura, então o contrato já nasce
    // assinado — e com 'Assinado' ou 'Cancelado' a automação do servidor não
    // tenta gerar parcela por cima das reais (server/src/automacoes.js).
    etapa: ETAPA_POR_SITUACAO[situacaoBling] || 'Assinado',
    situacaoBling,
    dataEnvio: p.data, dataAssinatura: p.data,
    pedidoBling: p.numero,
    criadoEm: agora(),
    historico: [
      { quando: agora(), texto: `Importado do Bling — pedido de venda nº ${p.numero} (${situacaoBling})` },
      ...(situacaoBling === 'Cancelado'
        ? [{ quando: agora(), texto: 'Contrato cancelado no Bling. As parcelas futuras foram apagadas lá; o que já tinha sido recebido fica no histórico.' }]
        : []),
    ],
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
const contratoVale = new Set(contratos.filter(c => c.etapa !== 'Cancelado').map(c => c.id));
for (const c of clientes) {
  // Quem só tem contrato cancelado não é cliente ativo: pode e deve voltar para
  // o comercial. Tirar do funil seria perder um lead legítimo.
  if (!c.contratoIds.some(id => contratoVale.has(id))) continue;
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
console.log(`  ${telefonesRecuperados} telefones recuperados do Kommo pelo e-mail`);
const semContato = soClientes.filter(c => !c.telefone && !c.email).length;
const comTel = soClientes.filter(c => c.telefone).length;
console.log(`  ${comTel} com telefone · ${semContato} sem telefone e sem e-mail`);
console.log('\nCONTRATOS');
const porEtapa = {};
contratos.forEach(c => { porEtapa[c.etapa] = (porEtapa[c.etapa] || 0) + 1; });
console.log(`  ${contratos.length} contratos: ` + Object.entries(porEtapa).map(([e,n]) => `${n} ${e}`).join(' · '));
const cancelados = contratos.filter(c => c.etapa === 'Cancelado');
console.log(`  cancelados somam $${cancelados.reduce((s,c)=>s+c.valor,0).toFixed(2)} — não contam como receita`);
const porVendedor = {};
contratos.forEach(c => { porVendedor[c.vendedor || '(sem vendedor)'] = (porVendedor[c.vendedor || '(sem vendedor)'] || 0) + 1; });
Object.entries(porVendedor).sort((a,b) => b[1]-a[1]).forEach(([v,n]) => console.log(`     ${String(n).padStart(4)}  ${v}`));
const valendo = contratos.filter(c => c.etapa !== 'Cancelado').reduce((s,c) => s+c.valor, 0);
console.log(`  valor vendido de verdade: $${valendo.toFixed(2)}  (bruto $${contratos.reduce((s,c)=>s+c.valor,0).toFixed(2)})`);
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

const liquidadas = contasReceber.filter(c => c.status === 'Pago');
const futuras    = contasReceber.filter(c => c.status !== 'Pago');
const pagas      = contasPagar.filter(c => c.status === 'Pago');
const aPagar     = contasPagar.filter(c => c.status !== 'Pago');

const CAMADAS = {
  0: { nome: 'completo', descricao: 'tudo do Bling de uma vez',
       blocos: [
         { chave: 'legalway-clientes-v1',     valor: soClientes },
         { chave: 'legalway-contratos-v1',    valor: contratos },
         { chave: 'legalway-financeiro-v1',   valor: contasReceber },
         { chave: 'legalway-contas-pagar-v1', valor: contasPagar },
         { chave: 'legalway-leads-v1',        valor: kommo.leads },
         { chave: 'legalway-funil-v1',        valor: kommo.funil },
         { chave: 'legalway-sdr-v1',          valor: kommo.sdr },
       ] },
  1: { nome: 'cadastro', descricao: 'clientes do Bling; quem assinou sai do funil e do SDR',
       blocos: [
         { chave: 'legalway-clientes-v1', valor: soClientes },
         { chave: 'legalway-leads-v1',    valor: kommo.leads },
         { chave: 'legalway-funil-v1',    valor: kommo.funil },
         { chave: 'legalway-sdr-v1',      valor: kommo.sdr },
       ] },
  2: { nome: 'passado', descricao: 'contratos assinados e tudo que já foi pago e recebido',
       blocos: [
         { chave: 'legalway-contratos-v1',    valor: contratos },
         { chave: 'legalway-financeiro-v1',   valor: liquidadas },
         { chave: 'legalway-contas-pagar-v1', valor: pagas },
       ] },
  3: { nome: 'futuro', descricao: 'o que ainda vai vencer (com o passado junto, senão o bloco perde o histórico)',
       blocos: [
         { chave: 'legalway-financeiro-v1',   valor: [...liquidadas, ...futuras] },
         { chave: 'legalway-contas-pagar-v1', valor: [...pagas, ...aPagar] },
       ] },
};

console.log('\nO QUE DÁ PARA GRAVAR');
for (const n of [0,1,2,3]) {
  const c = CAMADAS[n];
  const marca = n === PARTE ? '→' : ' ';
  console.log(`  ${marca} parte ${n} (${c.nome}): ` + c.blocos.map(b => `${b.chave.replace('legalway-','').replace('-v1','')} ${b.valor.length}`).join(' · '));
}

if (!GRAVAR) {
  console.log('\nSimulação — nada foi escrito.');
  console.log('Para gravar tudo: node ferramentas/importar-bling.mjs --tudo --gravar\n');
  process.exit(0);
}

const camada = CAMADAS[PARTE];
const arquivo = path.join(AQUI, PARTE === 0 ? 'importar-bling-completo.json'
  : `importar-bling-parte${PARTE}-${camada.nome}.json`);
fs.writeFileSync(arquivo, JSON.stringify({
  formato: 'legalway-backup-v1',
  gerado: agora(),
  observacao: `Importação do Bling — parte ${PARTE} (${camada.nome}): ${camada.descricao}`,
  armazenamento: camada.blocos,
}, null, 1));
console.log(PARTE === 0 ? '\nIMPORTAÇÃO COMPLETA' : `\nPARTE ${PARTE} — ${camada.nome}`);
camada.blocos.forEach(b => console.log(`  ${b.chave}: ${b.valor.length} registros`));
console.log(`\nArquivo pronto: ${arquivo}`);
console.log(`  ${(fs.statSync(arquivo).size/1048576).toFixed(2)} MB`);
console.log('No sistema: Configurações → Restaurar de um backup → escolher esse arquivo.\n');
