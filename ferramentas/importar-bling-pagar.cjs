#!/usr/bin/env node
// Contas a pagar do Bling para a LIV.
//
// A tela de contas a pagar do Bling não usa a API nova: ela fala com um
// endpoint antigo (xajax) que recebe o filtro como XML dentro de um parâmetro.
// Reproduzir a requisição do zero não funciona — o jeito que funciona é
// capturar a chamada que a própria tela faz e trocar cirurgicamente os valores
// de dataInicial, dataFinal, tipoPeriodo e pagina dentro daquele XML.
// Está anotado aqui porque da próxima vez ninguém vai lembrar.
//
// O QUE ESTE IMPORTADOR FAZ
//   - acrescenta as contas que faltam (casadas por blingId)
//   - corrige valor e pagamento das que divergem
//   - preserva id, comprovante, categoria e centro de custo do que já existe
//   - NÃO apaga nada que não esteja mais no Bling
//
// uso: node ferramentas/importar-bling-pagar.cjs --pagar X.json --sistema Y.json --saida Z.json

const fs = require('fs');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const bl = JSON.parse(fs.readFileSync(arg('pagar'), 'utf8'));
const bk = JSON.parse(fs.readFileSync(arg('sistema'), 'utf8'));
const saidaPath = arg('saida', '/tmp/pagar.json');

const cent = (n) => Number(Number(n || 0).toFixed(2));
const f = (n) => 'US$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const hoje = new Date().toISOString().slice(0, 10);
const iso = (d) => { const s = String(d || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const uid = (p) => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const CP = Object.values((bk.armazenamento.find((x) => x.chave === 'legalway-contas-pagar-v1') || {}).valor || {})
  .filter((v) => v && typeof v === 'object');
const porBlingId = new Map(CP.filter((x) => x.blingId).map((x) => [String(x.blingId), x]));

const saida = []; const vistos = new Set();
const rel = { novas: 0, corrigidas: [], mantidas: 0 };

for (const t of bl) {
  const velha = porBlingId.get(String(t.id));
  const pago = t.sit === 'pago';
  const status = pago ? 'Pago' : (iso(t.venc) < hoje ? 'Atrasado' : 'A vencer');
  if (velha) {
    rel.mantidas++;
    const mudou = cent(velha.valor) !== cent(t.valor)
      || cent(velha.valorPago || 0) !== cent(pago ? t.valor : 0)
      || String(velha.vencimento || '').slice(0, 10) !== iso(t.venc);
    if (mudou) rel.corrigidas.push({ fornecedor: t.fornecedor,
      de: { valor: cent(velha.valor), pago: cent(velha.valorPago || 0), venc: velha.vencimento },
      para: { valor: cent(t.valor), pago: cent(pago ? t.valor : 0), venc: iso(t.venc) } });
  } else rel.novas++;

  saida.push({
    ...(velha || { criadoEm: new Date().toISOString(), tipo: 'unica' }),
    id: velha ? velha.id : uid('cp'),
    blingId: String(t.id),
    fornecedor: t.fornecedor || (velha && velha.fornecedor) || '',
    descricao: (velha && velha.descricao) || t.obs || 'Conta a pagar',
    valor: cent(t.valor),
    vencimento: iso(t.venc),
    status,
    valorPago: pago ? cent(t.valor) : 0,
    dataPagamento: pago ? iso(t.liq) : null,
    observacao: t.obs || (velha && velha.observacao) || '',
    // categoria e centro de custo são classificação do escritório, não do
    // Bling: o que já estava classificado continua como está.
    categoria: (velha && velha.categoria) || '',
    centroCusto: (velha && velha.centroCusto) || '',
    blingCategoriaId: t.idCategoria || '',
  });
  vistos.add(String(t.id));
}
// o que o sistema tem e o Bling não: fica, não se apaga dinheiro registrado
for (const c of CP) if (!c.blingId || !vistos.has(String(c.blingId))) { saida.push(c); rel.mantidas++; }

const soma = (l, k) => cent(l.reduce((s, x) => s + Number(x[k] || 0), 0));
console.log('CONTAS A PAGAR');
console.log('  antes: ', CP.length, '|', f(soma(CP, 'valor')), '| pago', f(soma(CP, 'valorPago')));
console.log('  depois:', saida.length, '|', f(soma(saida, 'valor')), '| pago', f(soma(saida, 'valorPago')));
console.log('  novas:', rel.novas, '| corrigidas:', rel.corrigidas.length, '| mantidas:', rel.mantidas);
console.log('\n  no Bling:', bl.length, '|', f(bl.reduce((s, x) => s + x.valor, 0)));
const pagoBl = cent(bl.filter((x) => x.sit === 'pago').reduce((s, x) => s + x.valor, 0));
console.log('  pago no Bling:', f(pagoBl), '| pago na LIV:', f(soma(saida, 'valorPago')),
  cent(pagoBl) === soma(saida, 'valorPago') ? '✓ fecha' : '✗ NÃO FECHA');

fs.writeFileSync(saidaPath, JSON.stringify({ formato: 'legalway-backup-v1',
  armazenamento: [{ chave: 'legalway-contas-pagar-v1', valor: saida }], arquivos: [] }));
fs.writeFileSync(saidaPath.replace(/\.json$/, '-relatorio.json'), JSON.stringify(rel, null, 1));
console.log('\narquivo:', saidaPath);
