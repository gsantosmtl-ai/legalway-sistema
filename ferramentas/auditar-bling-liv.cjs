#!/usr/bin/env node
// Auditoria Bling × LIV, item por item.
//
// Serve para duas coisas: conferir ANTES de subir, e rodar de novo depois,
// a qualquer momento, para ver se alguma coisa saiu do lugar. Por isso ela
// compara arquivos e não toca em nada — dá para rodar quantas vezes quiser.
//
// Cada linha diz: o que está no Bling, o que está na LIV, e se confere. Onde
// não confere, mostra o tamanho da diferença em vez de só apontar o dedo —
// diferença sem número não dá para investigar.
//
// A LINHA QUE MAIS IMPORTA é "recebido": se o total pago na LIV não for igual
// ao do Bling, alguma baixa se perdeu ou foi contada duas vezes, e nenhuma
// outra conta pode ser levada a sério enquanto essa não fechar.
//
// uso:
//   node ferramentas/auditar-bling-liv.cjs \
//        --bling ~/Downloads/bling-v2.json \
//        --contatos ~/Downloads/bling-contatos.json \
//        --sistema ~/Downloads/backup.json \
//        [--csv ~/Downloads/auditoria.csv]

const fs = require('fs');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const bling = JSON.parse(fs.readFileSync(arg('bling'), 'utf8'));
const contatos = arg('contatos') ? JSON.parse(fs.readFileSync(arg('contatos'), 'utf8')) : [];
const backup = JSON.parse(fs.readFileSync(arg('sistema'), 'utf8'));

const cent = (n) => Number(Number(n || 0).toFixed(2));
const f = (n) => 'US$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const num = (v) => { const s = String(v ?? '').trim(); if (!s) return 0;
  const l = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(l); return isNaN(n) ? 0 : n; };
const bloco = (ch) => { const b = backup.armazenamento.find((x) => x.chave === ch);
  return b ? (Array.isArray(b.valor) ? b.valor : Object.values(b.valor || {}).filter(v => v && typeof v === 'object')) : []; };

const CT = bloco('legalway-contratos-v1');
const CR = bloco('legalway-financeiro-v1');
const CP = bloco('legalway-contas-pagar-v1');
const CL = bloco('legalway-clientes-v1');
const PR = bloco('legalway-processos-documentacao-v1');

const soma = (l, k) => cent(l.reduce((s, x) => s + Number(x[k] || 0), 0));
const titPagos = bling.titulos.filter((t) => t.sit === 'pago');

const linhas = [];
const add = (item, comoConferir, origem, naLiv, confere, obs) =>
  linhas.push({ item, comoConferir, origem, naLiv, confere, obs: obs || '' });

const bate = (a, b) => cent(a) === cent(b);

// ---- 01. clientes ----------------------------------------------------------
const clientesBling = contatos.filter((c) => !/vendedor|transportador/i.test(String(c.tipo || '')));
add('Clientes (contatos)', 'total do Bling × total na LIV',
  String(contatos.length), String(CL.length),
  contatos.length === CL.length ? 'confere' : 'difere',
  contatos.length !== CL.length ? `${Math.abs(contatos.length - CL.length)} a ${contatos.length > CL.length ? 'mais no Bling' : 'mais na LIV'} — o Bling mistura cliente, fornecedor e vendedor na mesma lista` : '');

// ---- 02. contratos ---------------------------------------------------------
const totalBling = cent(bling.pedidos.reduce((s, p) => s + num(p.total), 0));
const comPed = CT.filter((c) => String(c.pedidoBling || '').replace(/\D/g, ''));
add('Contratos — quantidade', 'nº de pedidos × nº de contratos',
  String(bling.pedidos.length), String(CT.length),
  bling.pedidos.length === CT.length ? 'confere' : 'difere',
  `${comPed.length} da LIV vieram do Bling, ${CT.length - comPed.length} nasceram no funil`);
add('Contratos — valor', 'soma dos pedidos × soma dos contratos',
  f(totalBling), f(soma(CT, 'valor')),
  bate(totalBling, soma(CT, 'valor')) ? 'confere' : 'difere',
  bate(totalBling, soma(CT, 'valor')) ? '' : `diferença de ${f(totalBling - soma(CT, 'valor'))}`);

// pedido a pedido
const porNum = new Map(bling.pedidos.map((p) => [Number(p.num), p]));
const divValor = [], faltamNaLiv = [], divServico = [], semEntrada = [];
for (const p of bling.pedidos) {
  const c = CT.find((x) => Number(String(x.pedidoBling || '').replace(/\D/g, '')) === Number(p.num));
  if (!c) { faltamNaLiv.push(p); continue; }
  if (!bate(num(p.total), c.valor)) divValor.push({ num: p.num, bling: num(p.total), liv: cent(c.valor) });
  if (p.servico && c.servico && p.servico !== c.servico) divServico.push({ num: p.num, bling: p.servico, liv: c.servico });
  if (num(p.entrada) > 0 && !Number(c.entrada || 0)) semEntrada.push(p.num);
}
add('Contratos — valor pedido a pedido', 'comparação dos 246, um a um',
  `${bling.pedidos.length} pedidos`, `${divValor.length} divergentes`,
  divValor.length ? 'difere' : 'confere',
  divValor.slice(0, 5).map((d) => `#${d.num}: Bling ${f(d.bling)} × LIV ${f(d.liv)}`).join(' · '));
add('Contratos — faltando na LIV', 'pedido existe no Bling e não na LIV',
  `${faltamNaLiv.length}`, '—', faltamNaLiv.length ? 'difere' : 'confere',
  faltamNaLiv.map((p) => `#${p.num} ${f(num(p.total))}`).join(' · '));
add('Contratos — serviço', 'produto do pedido × serviço do contrato',
  `${bling.pedidos.filter((p) => p.servico).length} com serviço`,
  `${CT.filter((c) => c.servico).length} com serviço`,
  divServico.length ? 'difere' : 'confere',
  divServico.slice(0, 4).map((d) => `#${d.num}: "${d.bling}" × "${d.liv}"`).join(' · '));
add('Contratos — entrada', 'parcela de assinatura (dias=0) × campo entrada',
  `${bling.pedidos.filter((p) => num(p.entrada) > 0).length} com entrada`,
  `${CT.filter((c) => Number(c.entrada || 0) > 0).length} com entrada`,
  semEntrada.length ? 'difere' : 'confere',
  semEntrada.length ? `${semEntrada.length} contratos com entrada no Bling e zerada na LIV` : '');

// ---- 03. contas a receber --------------------------------------------------
const valBling = cent(bling.titulos.reduce((s, t) => s + num(t.valor), 0));
const pagoBling = cent(titPagos.reduce((s, t) => s + num(t.pago || t.valor), 0));
add('Contas a receber — títulos', 'nº de títulos do Bling × parcelas com blingId na LIV',
  String(bling.titulos.length), String(CR.filter((x) => x.blingId).length),
  bling.titulos.length === CR.filter((x) => x.blingId).length ? 'confere' : 'difere',
  'a LIV também guarda parcelas futuras que ainda não viraram título');
add('Contas a receber — pagos', 'nº de títulos pagos × parcelas pagas',
  String(titPagos.length), String(CR.filter((x) => x.status === 'Pago').length),
  titPagos.length === CR.filter((x) => x.status === 'Pago').length ? 'confere' : 'difere', '');
add('Contas a receber — RECEBIDO', 'soma paga no Bling × soma recebida na LIV',
  f(pagoBling), f(soma(CR, 'valorRecebido')),
  bate(pagoBling, soma(CR, 'valorRecebido')) ? 'confere' : 'DIFERE',
  bate(pagoBling, soma(CR, 'valorRecebido')) ? 'esta é a linha que não pode falhar'
    : `diferença de ${f(pagoBling - soma(CR, 'valorRecebido'))} — alguma baixa se perdeu ou duplicou`);

// título a título
const porBlingId = new Map(CR.filter((x) => x.blingId).map((x) => [String(x.blingId), x]));
const divTit = [], faltaTit = [];
for (const t of bling.titulos) {
  const p = porBlingId.get(String(t.id));
  if (!p) { faltaTit.push(t); continue; }
  const pagoT = t.sit === 'pago' ? num(t.pago || t.valor) : 0;
  if (!bate(num(t.valor), p.valor) || !bate(pagoT, p.valorRecebido)) {
    divTit.push({ id: t.id, nome: t.nome, bling: { v: num(t.valor), p: pagoT }, liv: { v: cent(p.valor), p: cent(p.valorRecebido) } });
  }
}
add('Contas a receber — título a título', 'valor e recebido de cada um dos títulos',
  `${bling.titulos.length} títulos`, `${divTit.length} divergentes, ${faltaTit.length} ausentes`,
  (divTit.length || faltaTit.length) ? 'difere' : 'confere',
  faltaTit.length ? `${faltaTit.length} títulos do Bling não existem na LIV (${f(faltaTit.reduce((s, t) => s + num(t.valor), 0))})` : '');

// ---- 04. contas a pagar ----------------------------------------------------
add('Contas a pagar', 'total do Bling × total na LIV',
  'não exportado', String(CP.length), 'pendente',
  'a tela do Bling usa rota antiga (xajax) e não foi possível exportar por aqui');

// ---- 05. documentação ------------------------------------------------------
const ctIds = new Set(CT.map((c) => c.id));
add('Processos ligados a contrato', 'processos cujo contratoId existe',
  '—', `${PR.filter((p) => p.contratoId && ctIds.has(p.contratoId)).length} de ${PR.length}`,
  PR.filter((p) => p.contratoId && !ctIds.has(p.contratoId)).length ? 'difere' : 'confere',
  PR.filter((p) => p.contratoId && !ctIds.has(p.contratoId)).length
    ? `${PR.filter((p) => p.contratoId && !ctIds.has(p.contratoId)).length} apontam para contrato que não existe`
    : 'nenhum processo órfão');

// ---- saída -----------------------------------------------------------------
const larg = [34, 46, 22, 22, 9];
const corta = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n); };
console.log('\nAUDITORIA BLING × LIV —', new Date().toLocaleString('pt-BR'));
console.log('='.repeat(140));
console.log(corta('ITEM', larg[0]), corta('COMO CONFERIR', larg[1]), corta('BLING', larg[2]), corta('LIV', larg[3]), 'SITUAÇÃO');
console.log('-'.repeat(140));
for (const l of linhas) {
  console.log(corta(l.item, larg[0]), corta(l.comoConferir, larg[1]), corta(l.origem, larg[2]), corta(l.naLiv, larg[3]),
    l.confere === 'confere' ? '✓' : (l.confere === 'pendente' ? '…' : '✗'));
  if (l.obs) console.log(' '.repeat(2), '↳', l.obs);
}
const ruins = linhas.filter((l) => l.confere !== 'confere' && l.confere !== 'pendente').length;
const pend = linhas.filter((l) => l.confere === 'pendente').length;
console.log('-'.repeat(140));
console.log(`${linhas.length} itens · ${linhas.length - ruins - pend} conferem · ${ruins} divergem · ${pend} pendentes`);

if (arg('csv')) {
  const esc = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  fs.writeFileSync(arg('csv'),
    'Item;Como conferir;Bling;LIV;Situacao;Observacao\n' +
    linhas.map((l) => [l.item, l.comoConferir, l.origem, l.naLiv, l.confere, l.obs].map(esc).join(';')).join('\n'));
  console.log('\nplanilha:', arg('csv'));
}
if (arg('detalhes')) {
  fs.writeFileSync(arg('detalhes'), JSON.stringify({ divValor, faltamNaLiv, divServico, semEntrada, divTit, faltaTit }, null, 1));
  console.log('detalhes caso a caso:', arg('detalhes'));
}
