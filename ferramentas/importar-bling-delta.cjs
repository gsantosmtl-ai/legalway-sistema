#!/usr/bin/env node
// SOBE OS PEDIDOS DO BLING QUE AINDA NÃO VIRARAM CONTRATO.
//
//   node ferramentas/importar-bling-delta.cjs --sistema ~/Downloads/backup.json
//   node ferramentas/importar-bling-delta.cjs --sistema ~/Downloads/backup.json --gravar
//
// Mexe em três blocos de uma vez, e eles dependem um do outro: a parcela
// aponta para o contrato, o contrato aponta para o cliente. Por isso o id de
// cada um nasce aqui, antes de qualquer gravação, e os três saem no mesmo
// arquivo — meio caminho deixaria contrato órfão.
//
// A ÂNCORA, que custou uma manhã para descobrir:
//
// O sistema guarda em cada parcela o `blingId` da CONTA A RECEBER. O detalhe
// do pedido (/Api/v3/vendas/<id>) traz uma lista `parcelas` com id próprio,
// que NÃO é o mesmo — conferido contra o pedido 4, já conciliado: a API devolve
// 18820097514 e o sistema guarda 24860220522.
//
// A conta a receber vem de /Api/v3/contas/receber/list, que só responde com o
// cabeçalho `x-api-revision` (3.1.0 em 19/10) e os parâmetros que a tela manda.
// Sem o cabeçalho o Bling devolve 404 RESOURCE_NOT_FOUND, como se a rota não
// existisse. O campo `idOrigem` de cada conta é o id do pedido — é esse o elo.
// O parâmetro `criterio` escolhe a situação: emAberto, atrasadas, emissao,
// pagamento.
//
// Nada de existente é alterado. Só entra o que é inédito.

const fs = require('fs');
const path = require('path');

const P = path.join(__dirname, 'planilhas');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const GRAVAR = process.argv.includes('--gravar');

const K = { clientes: 'legalway-clientes-v1', contratos: 'legalway-contratos-v1', financeiro: 'legalway-financeiro-v1' };

// O Bling mistura formatos no mesmo registro: "1.500,00" e "100.00".
// A vírgula é o que decide — lição da auditoria, que custou 2.810 falsas divergências.
const num = v => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const limpo = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
};
const data = v => {
  if (!v) return null;
  const s = String(v).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return br[3] + '-' + br[2] + '-' + br[1];
  return s.slice(0, 10);
};
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const caminho = arg('--sistema', '');
if (!caminho || !fs.existsSync(caminho)) { console.error('Passe o backup com --sistema.'); process.exit(1); }
const fonte = path.join(P, 'bling-delta', 'bling-novos.json');
if (!fs.existsSync(fonte)) { console.error('Falta ' + fonte); process.exit(1); }

const S = JSON.parse(fs.readFileSync(caminho, 'utf8'));
const pega = chave => {
  const b = (S.armazenamento || []).find(x => x.chave === chave);
  if (!b) return [];
  let v = b.valor; if (typeof v === 'string') v = JSON.parse(v);
  return Array.isArray(v) ? v : [];
};
const clientes = JSON.parse(JSON.stringify(pega(K.clientes)));
const contratos = JSON.parse(JSON.stringify(pega(K.contratos)));
const financeiro = JSON.parse(JSON.stringify(pega(K.financeiro)));
const antes = { clientes: clientes.length, contratos: contratos.length, financeiro: financeiro.length };

const { pedidos } = JSON.parse(fs.readFileSync(fonte, 'utf8'));

const temPedido = new Set(contratos.map(c => String(c.pedidoBling)).filter(Boolean));
const temParcela = new Set(financeiro.map(f => String(f.blingId)).filter(Boolean));
const clientePorBling = new Map(clientes.filter(c => c.blingId).map(c => [String(c.blingId), c]));
const clientePorNome = new Map(clientes.map(c => [norm(c.nome), c]));

const agora = new Date().toISOString();
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const novosClientes = [], novosContratos = [], novasParcelas = [];
const pulados = { contratoJaExiste: 0, parcelaJaExiste: 0 };

for (const p of pedidos.slice().sort((a, b) => Number(a.pedido) - Number(b.pedido))) {
  if (temPedido.has(String(p.pedido))) { pulados.contratoJaExiste++; continue; }

  // --- cliente: por blingId, depois por nome exato; senão cria ---
  let cli = clientePorBling.get(String(p.blingContatoId)) || clientePorNome.get(norm(p.cliente.nome)) || null;
  if (cli && !cli.blingId) cli.blingId = String(p.blingContatoId);
  if (!cli) {
    cli = {
      id: uid('cl'), nome: p.cliente.nome, email: p.cliente.email || '', telefone: p.cliente.telefone || '',
      blingId: String(p.blingContatoId), endereco: p.cliente.endereco || '',
      criadoEm: agora, contratoIds: [],
      historico: [{ texto: 'Importado do Bling — contato do pedido nº ' + p.pedido, quando: agora }],
    };
    clientes.push(cli);
    clientePorBling.set(String(p.blingContatoId), cli);
    clientePorNome.set(norm(cli.nome), cli);
    novosClientes.push(cli);
  }

  // --- contrato ---
  const venc = p.parcelas.map(x => data(x.vencimento)).filter(Boolean).sort();
  const ct = {
    id: uid('c'), cpf: '', email: cli.email, etapa: 'Assinado', sinal: 0,
    valor: p.total, cliente: cli.nome, entrada: 0, servico: p.servico || '',
    criadoEm: agora, endereco: cli.endereco || '', telefone: cli.telefone || '',
    vendedor: '', dataEnvio: data(p.data),
    historico: [{ texto: 'Importado do Bling — pedido de venda nº ' + p.pedido
      + (p.situacao != null ? ' (' + p.situacao + ')' : ''), quando: agora }],
    pagamento: '', diasCustom: 30, numParcelas: p.parcelas.length, observacoes: '',
    pedidoBling: String(p.pedido), recorrencia: 'mensal', nacionalidade: '',
    situacaoBling: String(p.situacao == null ? '' : p.situacao),
    dataAssinatura: data(p.data), dataPrimeiraParcela: venc[0] || null,
  };
  contratos.push(ct);
  novosContratos.push(ct);
  cli.contratoIds = Array.from(new Set([...(cli.contratoIds || []), ct.id]));

  // --- parcelas ---
  let i = 0;
  for (const par of p.parcelas) {
    i++;
    if (temParcela.has(String(par.blingId))) { pulados.parcelaJaExiste++; continue; }
    const pago = /pago|recebid|liquidad/i.test(String(par.situacao || ''));
    financeiro.push({
      id: uid('fr'), conta: '', valor: num(par.valor),
      status: pago ? 'Recebido' : 'A receber',
      blingId: String(par.blingId), servico: ct.servico, criadoEm: agora,
      taxaFixa: 0, vendedor: '', descricao: 'Parcela ' + i + '/' + p.parcelas.length,
      contratoId: ct.id, observacao: par.nroDocumento ? 'Doc. ' + par.nroDocumento : '',
      vencimento: data(par.vencimento), clienteNome: cli.nome,
      valorLiquido: num(par.valor), valorRecebido: pago ? num(par.valor) : 0,
      formaPagamento: '', taxaPercentual: 0, dataRecebimento: null,
    });
    novasParcelas.push(1);
  }
}

// ---- relatório ----
const pad = n => String(n).padStart(5);
console.log('');
console.log('BLING — PEDIDOS QUE VIRAM CONTRATO' + (GRAVAR ? '' : '   (simulação)'));
console.log('');
console.log('  ' + pad(pedidos.length) + '  pedidos novos no Bling');
if (pulados.contratoJaExiste) console.log('  ' + pad(pulados.contratoJaExiste) + '  já tinham contrato');
console.log('  ' + pad(novosContratos.length) + '  CONTRATOS novos     ←');
console.log('  ' + pad(novosClientes.length) + '  CLIENTES novos      ←');
console.log('  ' + pad(novasParcelas.length) + '  PARCELAS novas      ←');
if (pulados.parcelaJaExiste) console.log('  ' + pad(pulados.parcelaJaExiste) + '  parcelas já existiam');
console.log('');
console.log('  bloco           antes   depois');
console.log('  clientes     ' + pad(antes.clientes) + '  ' + pad(clientes.length));
console.log('  contratos    ' + pad(antes.contratos) + '  ' + pad(contratos.length));
console.log('  financeiro   ' + pad(antes.financeiro) + '  ' + pad(financeiro.length));
console.log('');
const soma = novosContratos.reduce((s, c) => s + c.valor, 0);
console.log('  valor dos contratos: US$ ' + soma.toLocaleString('en-US'));
console.log('');
for (const c of novosContratos) {
  console.log('    #' + String(c.pedidoBling).padEnd(4) + String(c.valor).padStart(7) + '  '
    + (c.servico || '?').padEnd(20) + String(c.numParcelas).padStart(2) + 'x  ' + c.cliente.slice(0, 26));
}
console.log('');

// ---- conferência: nada existente pode ter mudado ----
const orig = { clientes: pega(K.clientes), contratos: pega(K.contratos), financeiro: pega(K.financeiro) };
let quebrados = 0, enriquecidos = 0;
for (let i = 0; i < orig.clientes.length; i++) {
  const a = { ...orig.clientes[i] }, b = { ...clientes[i] };
  delete a.blingId; delete b.blingId; delete a.contratoIds; delete b.contratoIds;
  if (JSON.stringify(a) !== JSON.stringify(b)) quebrados++;
  else if (JSON.stringify(orig.clientes[i]) !== JSON.stringify(clientes[i])) enriquecidos++;
}
for (let i = 0; i < orig.contratos.length; i++) if (JSON.stringify(orig.contratos[i]) !== JSON.stringify(contratos[i])) quebrados++;
for (let i = 0; i < orig.financeiro.length; i++) if (JSON.stringify(orig.financeiro[i]) !== JSON.stringify(financeiro[i])) quebrados++;
console.log('  CONFERÊNCIA');
console.log('    ' + pad(enriquecidos) + '  clientes que só ganharam blingId / contratoIds');
console.log('    ' + pad(quebrados) + '  registros com outro campo alterado' + (quebrados ? '   ✗ ERRO' : '   ✓'));
console.log('');
if (quebrados) { console.error('  Abortado.'); process.exit(1); }

if (!GRAVAR) { console.log('  Para gerar:  ... --gravar'); console.log(''); process.exit(0); }

const saida = { formato: 'legalway-backup-v1', geradoEm: agora, geradoPor: 'importar-bling-delta.cjs',
  armazenamento: [
    { chave: K.clientes, valor: clientes },
    { chave: K.contratos, valor: contratos },
    { chave: K.financeiro, valor: financeiro },
  ] };
const arq = path.join(P, 'bling-delta', 'subir-bling.json');
fs.writeFileSync(arq, JSON.stringify(saida));
console.log('  Arquivo: ferramentas/planilhas/bling-delta/subir-bling.json  ('
  + (fs.statSync(arq).size / 1048576).toFixed(1) + ' MB, 3 blocos)');
console.log('');
