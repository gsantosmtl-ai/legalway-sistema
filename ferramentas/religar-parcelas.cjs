#!/usr/bin/env node
// As 204 parcelas que entraram do Bling como "Avulsa": sem nome, sem contrato.
//
//   node ferramentas/religar-parcelas.cjs             → mostra o que daria
//   node ferramentas/religar-parcelas.cjs --gravar    → grava o mapa id → contrato
//
// Por que ficaram soltas: na importação, a parcela só ganhava contrato quando
// havia um pedido de venda correspondente no Bling. As que nasceram direto no
// contas a receber não tinham pedido, e entraram sem dono. São US$ 57.947,61 a
// receber e US$ 28.418,88 já recebidos pendurados em ninguém — era esse valor
// que o card da Ana Paula mostrava, porque "sem contrato" batia com "sem
// contrato".
//
// O nome está no Bling, na própria conta a receber. O que o nome NÃO resolve:
// quem tem mais de um contrato. Aí a parcela fica de fora, para olho humano.
//
// Duas regras do escritório, que mudam a conta (perguntadas em 11/10/2026):
//   · contrato de US$ 6.490 com uma só parcela de US$ 100 é o que existe
//     mesmo — a soma das parcelas NÃO tem que fechar com o valor do contrato,
//     então "estourar o contrato" não é critério para recusar nada;
//   · renegociação só muda a data da parcela, não cria parcela nova. Então
//     duas parcelas iguais na mesma data são suspeitas de duplicidade.
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, 'planilhas');
const R = require('./regras-trello.cjs');

const fin = JSON.parse(fs.readFileSync(path.join(P, 'bling/bling-financeiro.json'), 'utf8'));
const sistema = JSON.parse(fs.readFileSync(path.join(__dirname, 'importar-bling-completo.json'), 'utf8'));
const bloco = k => (sistema.armazenamento.find(x => x.chave === k) || {}).valor || [];
const contratos = bloco('legalway-contratos-v1');
const parcelas = bloco('legalway-financeiro-v1');
const arg = f => process.argv.includes(f);
const n = v => Number(v || 0);

// ─── DE QUEM É CADA PARCELA, SEGUNDO O BLING ──────────────────────────────
const porBling = new Map();
for (const lista of [fin.dados.receberAberto, fin.dados.receberPago])
  for (const r of lista) porBling.set(String(r.id), r);

// ─── CONTRATOS POR PESSOA ─────────────────────────────────────────────────
const contratosDe = new Map();
for (const c of contratos) {
  const k = R.norm(c.cliente);
  if (!contratosDe.has(k)) contratosDe.set(k, []);
  contratosDe.get(k).push(c);
}
const porFuzzy = new Map();
for (const [k, v] of contratosDe) { const f = R.fuzzy(k); if (f && !porFuzzy.has(f)) porFuzzy.set(f, v); }

const soltas = parcelas.filter(p => !p.contratoId);
const r = { ligadas: [], varios: [], semContrato: [], semBling: [] };

for (const s of soltas) {
  const b = porBling.get(String(s.blingId));
  if (!b) { r.semBling.push(s); continue; }
  const nome = String(b.nome || '').trim();
  const cs = contratosDe.get(R.norm(nome)) || porFuzzy.get(R.fuzzy(nome));
  if (!cs || !cs.length) { r.semContrato.push({ ...s, nome }); continue; }
  if (cs.length > 1) { r.varios.push({ ...s, nome, contratos: cs }); continue; }
  r.ligadas.push({ id: s.id, blingId: s.blingId, nome, contratoId: cs[0].id,
                   servico: cs[0].servico, valor: n(s.valor), recebido: n(s.valorRecebido),
                   vencimento: s.vencimento });
}

// ─── PARCELA REPETIDA ─────────────────────────────────────────────────────
// Renegociação só muda a data. Então mesma pessoa, mesmo valor e mesma data em
// duas parcelas é duplicidade, não plano de pagamento.
const assinatura = p => [p.contratoId, n(p.valor).toFixed(2), p.vencimento].join('|');
const jaExiste = new Set(parcelas.filter(p => p.contratoId).map(assinatura));
const repetidas = [];
let candidatas = [];
for (const x of r.ligadas) {
  const a = [x.contratoId, x.valor.toFixed(2), x.vencimento].join('|');
  if (jaExiste.has(a)) { repetidas.push(x); continue; }
  jaExiste.add(a);
  candidatas.push(x);
}

// ─── COBRANÇA QUE NÃO CABE NO CONTRATO ────────────────────────────────────
// A soma das parcelas não precisa fechar com o contrato: um contrato de
// US$ 6.490 com uma parcela de US$ 100 é o que existe mesmo. O que importa é
// o TOTAL depois de religar. Passar um pouco é taxa avulsa cobrada por cima
// (tradução, 2ª via): US$ 120 em cima de US$ 5.990. Passar quase o dobro é
// outro serviço que a pessoa contratou depois e que não tem contrato aqui:
// US$ 2.070 num contrato de US$ 900. Pendurar no contrato pequeno faria o
// extrato dela mentir.
//
// O limite também não pode ser do tamanho do acréscimo sozinho — as 17
// parcelas do Gleicielio somam US$ 5.891 e o contrato dele é US$ 5.990: é o
// plano de pagamento inteiro, que estava faltando, não um extra.
const FOLGA = 1.25;
const totalAtual = {};
parcelas.forEach(p => { if (p.contratoId) totalAtual[p.contratoId] = (totalAtual[p.contratoId] || 0) + n(p.valor); });
const extraPor = {};
candidatas.forEach(x => extraPor[x.contratoId] = (extraPor[x.contratoId] || 0) + x.valor);
const valorContrato = Object.fromEntries(contratos.map(c => [c.id, n(c.valor)]));
const naoCabe = new Set(Object.keys(extraPor).filter(id =>
  (totalAtual[id] || 0) + extraPor[id] > valorContrato[id] * FOLGA));
const acrescimoGrande = candidatas.filter(x => naoCabe.has(x.contratoId));
const limpas = candidatas.filter(x => !naoCabe.has(x.contratoId));

// ─── RELATÓRIO ─────────────────────────────────────────────────────────────
const soma = (a, c) => +a.reduce((x, y) => x + n(y[c]), 0).toFixed(2);
console.log('PARCELAS SOLTAS: ' + soltas.length + '   US$ ' + soma(soltas, 'valor') +
            ' a receber · US$ ' + soma(soltas, 'valorRecebido') + ' já recebidos\n');
console.log('  religadas com segurança : ' + String(limpas.length).padStart(4) +
            '   US$ ' + String(soma(limpas, 'valor')).padStart(9) + ' · US$ ' + soma(limpas, 'recebido') + ' recebidos');
console.log('  repetidas (mesma pessoa, valor e data de uma parcela que já existe): ' + repetidas.length);
console.log('  pessoa com mais de um contrato  : ' + r.varios.length);
console.log('  pessoa sem contrato no sistema  : ' + r.semContrato.length);
console.log('  blingId que não achei           : ' + r.semBling.length);

const agrupar = (lista, campo) => {
  const m = new Map();
  lista.forEach(x => { const k = x[campo]; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return [...m].sort((a, b) => soma(b[1], 'valor') - soma(a[1], 'valor'));
};

console.log('\nQUEM RECEBE PARCELA DE VOLTA:');
agrupar(limpas, 'nome').forEach(([nome, l]) =>
  console.log('   ' + String(l.length).padStart(3) + ' parcelas  US$ ' + String(soma(l, 'valor')).padStart(9) + '   ' + nome));

if (repetidas.length) {
  console.log('\n⚠ REPETIDAS — mesma pessoa, mesmo valor, mesma data de uma parcela que já está lá:');
  agrupar(repetidas, 'nome').forEach(([nome, l]) =>
    console.log('   ' + String(l.length).padStart(3) + ' parcelas  US$ ' + String(soma(l, 'valor')).padStart(9) + '   ' + nome));
}

if (acrescimoGrande.length) {
  console.log('\n⚠ NÃO CABE NO CONTRATO (' + acrescimoGrande.length +
              ' parcelas) — provavelmente outro serviço, sem contrato no sistema:');
  agrupar(acrescimoGrande, 'nome').forEach(([nome, l]) => {
    const c = contratos.find(x => x.id === l[0].contratoId);
    const fica = ((totalAtual[c.id] || 0) + extraPor[c.id]).toFixed(2);
    console.log('   ' + String(l.length).padStart(3) + ' parcelas  US$ ' + String(soma(l, 'valor')).padStart(9) +
                '   ' + nome + '   ' + c.servico + ' US$ ' + n(c.valor) + ' → ficaria US$ ' + fica);
  });
}

if (r.varios.length) {
  console.log('\n⚠ PESSOA COM MAIS DE UM CONTRATO (' + r.varios.length + ' parcelas) — precisa de olho humano:');
  agrupar(r.varios, 'nome').forEach(([nome, l]) => {
    console.log('   ' + nome + '  —  ' + l.length + ' parcelas, US$ ' + soma(l, 'valor'));
    l[0].contratos.forEach(c => {
      const p = parcelas.filter(x => x.contratoId === c.id);
      console.log('        contrato ' + c.servico + ' US$ ' + n(c.valor) + '  (' + p.length + ' parcelas, US$ ' +
                  p.reduce((s, x) => s + n(x.valorRecebido), 0).toFixed(2) + ' recebidos)');
    });
  });
}

if (r.semContrato.length) {
  console.log('\n⚠ SEM CONTRATO NO SISTEMA (' + r.semContrato.length + ' parcelas):');
  agrupar(r.semContrato, 'nome').forEach(([nome, l]) =>
    console.log('   ' + String(l.length).padStart(3) + ' parcelas  US$ ' + String(soma(l, 'valor')).padStart(9) +
                ' · US$ ' + soma(l, 'valorRecebido') + ' recebidos   ' + nome));
}

if (!arg('--gravar')) { console.log('\nSimulação. Rode com --gravar para gravar o mapa.\n'); process.exit(0); }

const mapa = {};
limpas.forEach(x => mapa[x.id] = x.contratoId);
fs.writeFileSync(path.join(__dirname, 'religar-parcelas.json'),
  JSON.stringify({ mapa, detalhe: limpas, repetidas, acrescimoGrande, varios: r.varios.map(x=>({id:x.id, nome:x.nome, valor:n(x.valor)})), semContrato: r.semContrato.map(x => ({ id: x.id, nome: x.nome, valor: n(x.valor) })) }, null, 1));
console.log('\nArquivo: ferramentas/religar-parcelas.json  (' + limpas.length + ' parcelas)\n');
