#!/usr/bin/env node
// Reconstrói contratos e contas a receber a partir do Bling, sem perder nada.
//
// POR QUE ESTA FERRAMENTA EXISTE
//
// A importação anterior trouxe só os TÍTULOS ligados a pedido. Isso deixou
// dois buracos, que juntos faziam o "falta pagar" mentir em quase metade dos
// contratos:
//
//   1. Os títulos ÓRFÃOS, sem pedido. São as renegociações e as cobranças
//      extras (taxa SEVIS, tradução, ajuste de parcela). 209 títulos,
//      US$ 64.702. O caso do Antonio é esse: ele pagou 500 da parcela de
//      1.500 e o Bling criou um título NOVO de 1.000, solto. O sistema nunca
//      viu esse título e seguia mostrando 1.500 em atraso.
//
//   2. As parcelas FUTURAS. O Bling emite título aos poucos, conforme fatura.
//      O pedido nº 3 tem 24 parcelas combinadas e 1 título emitido. Importando
//      só títulos, o sistema não enxergava US$ 5.750 daquele contrato.
//
// O MODELO
//
//   O título é a verdade do que já foi faturado, pago ou renegociado.
//   O cronograma do pedido COMPLETA o que ainda não virou título.
//   O contrato é a âncora: nunca se cria parcela além do que ele comporta,
//   exceto quando a renegociação foi para cima (e aí é real, não erro).
//
// A ORDEM IMPORTA, e errar custou uma rodada: as órfãs precisam ser religadas
// ao contrato ANTES de calcular o que falta faturar. Sem isso, o Antonio
// ganhava uma parcela inventada de 895, porque os 1.000 da renegociação não
// entravam na conta do pedido.
//
// O QUE É PRESERVADO
//
//   - id do contrato, casado por pedidoBling. É dele que dependem os 210
//     processos da documentação: trocar o id órfanaria todos.
//   - id da parcela, casado pelo blingId (id do título). É dele que dependem
//     os vínculos do Stripe.
//   - stripeClienteId, o bloco `stripe` da parcela e qualquer conta criada
//     à mão no sistema.
//
// NÃO ESCREVE NO SISTEMA. Gera um arquivo de restauração e um relatório.
// Quem decide subir é gente.
//
// uso:
//   node ferramentas/importar-bling-completo.cjs \
//        --bling ~/Downloads/bling-export.json \
//        --sistema ~/Downloads/backup.json \
//        --saida ~/Downloads/liv-financeiro-novo.json

const fs = require('fs');

const arg = (nome, padrao) => {
  const i = process.argv.indexOf('--' + nome);
  return i > -1 ? process.argv[i + 1] : padrao;
};
const caminhoBling = arg('bling');
const caminhoSistema = arg('sistema');
const caminhoSaida = arg('saida', '/tmp/liv-financeiro-novo.json');
if (!caminhoBling || !caminhoSistema) {
  console.error('Faltam --bling e --sistema. Veja o cabeçalho do arquivo.');
  process.exit(1);
}

const hoje = new Date().toISOString().slice(0, 10);
const f = (n) => 'US$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const cent = (n) => Number(Number(n || 0).toFixed(2));

// O Bling mistura formatos no mesmo registro: "1.500,00" e "100.00". A vírgula
// é o que decide. Ignorar isso gerou milhares de divergências falsas antes.
const num = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const limpo = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(limpo);
  return isNaN(n) ? 0 : n;
};
// Datas chegam em dois formatos conforme a rota: ISO e DD/MM/AAAA.
const iso = (d) => {
  const s = String(d || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

const bling = JSON.parse(fs.readFileSync(caminhoBling, 'utf8'));
const backup = JSON.parse(fs.readFileSync(caminhoSistema, 'utf8'));
const bloco = (chave) => {
  const b = backup.armazenamento.find((x) => x.chave === chave);
  return b ? (Array.isArray(b.valor) ? b.valor : Object.values(b.valor || {}).filter(v => v && typeof v === 'object')) : [];
};
const contratosHoje = bloco('legalway-contratos-v1');
const parcelasHoje = bloco('legalway-financeiro-v1');

const uid = (p) => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------------------------------------------------------------------------
// 1. RELIGAR AS ÓRFÃS — antes de qualquer conta
// ---------------------------------------------------------------------------
const idsPedido = new Set(bling.pedidos.map((p) => String(p.id)));
const pedidosPorContato = {};
for (const p of bling.pedidos) (pedidosPorContato[String(p.idContato)] ||= []).push(p);

const titulosPorPedido = {};
const avulsas = [];
let religadas = 0;
for (const t of bling.titulos) {
  const ped = String(t.ped || '');
  if (idsPedido.has(ped)) { (titulosPorPedido[ped] ||= []).push(t); continue; }
  const doCliente = pedidosPorContato[String(t.idContato)] || [];
  if (doCliente.length === 1) {
    (titulosPorPedido[String(doCliente[0].id)] ||= []).push({ ...t, religada: true });
    religadas++;
  } else {
    // Cliente com vários pedidos: adivinhar a qual contrato pertence seria
    // chutar. Entra como avulsa, com o nome do cliente, e alguém decide.
    avulsas.push({ ...t, motivo: doCliente.length > 1 ? 'cliente tem mais de um pedido' : 'cliente sem pedido' });
  }
}

// ---------------------------------------------------------------------------
// 2. AS CONTAS DE CADA PEDIDO
// ---------------------------------------------------------------------------
function contasDoPedido(ped) {
  const ts = (titulosPorPedido[String(ped.id)] || [])
    .slice().sort((a, b) => String(iso(a.venc)).localeCompare(String(iso(b.venc))));

  const out = ts.map((t) => {
    const pago = t.sit === 'pago';
    return {
      origem: t.religada ? 'renegociacao' : 'titulo',
      blingId: String(t.id),
      vencimento: iso(t.venc),
      valor: cent(t.valor),
      valorRecebido: pago ? cent(t.pago || t.valor) : 0,
      dataRecebimento: pago ? iso(t.liq) : null,
      status: pago ? 'Pago' : (iso(t.venc) < hoje ? 'Atrasado' : 'A vencer'),
      observacao: String(t.obs || '').slice(0, 200),
    };
  });

  // O cronograma só completa o que ainda não virou título.
  let falta = cent(ped.total - out.reduce((s, c) => s + c.valor, 0));
  if (falta > 0.009) {
    const usadas = new Set(out.map((c) => c.vencimento));
    const candidatas = (ped.parcelas || [])
      .map((x) => ({ venc: iso(x.venc), valor: num(x.valor) }))
      .filter((x) => x.venc && !usadas.has(x.venc))
      .sort((a, b) => a.venc.localeCompare(b.venc));
    for (const c of candidatas) {
      if (falta <= 0.009) break;
      const v = cent(Math.min(c.valor, falta));
      out.push({ origem: 'a faturar', blingId: null, vencimento: c.venc, valor: v,
        valorRecebido: 0, dataRecebimento: null,
        status: c.venc < hoje ? 'Atrasado' : 'A vencer', observacao: 'Parcela do contrato ainda não faturada no Bling' });
      falta = cent(falta - v);
    }
    if (falta > 0.009) {
      const ult = (ped.parcelas || []).map((x) => iso(x.venc)).filter(Boolean).sort().pop() || iso(ped.data) || hoje;
      out.push({ origem: 'saldo', blingId: null, vencimento: ult, valor: falta,
        valorRecebido: 0, dataRecebimento: null,
        status: ult < hoje ? 'Atrasado' : 'A vencer', observacao: 'Saldo do contrato sem parcela correspondente' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. MONTAR OS BLOCOS, PRESERVANDO OS IDs
// ---------------------------------------------------------------------------
const contratoPorPedido = new Map();
for (const c of contratosHoje) {
  const n = Number(String(c.pedidoBling || '').replace(/\D/g, ''));
  if (n) contratoPorPedido.set(n, c);
}
const parcelaPorBlingId = new Map();
for (const p of parcelasHoje) if (p.blingId) parcelaPorBlingId.set(String(p.blingId), p);

const novosContratos = [];
const novasParcelas = [];
const rel = { contratosMantidos: 0, contratosNovos: 0, contratosAtualizados: 0,
  servicoPreenchido: 0, servicoDivergente: [], entradaPreenchida: 0,
  parcelasMantidas: 0, parcelasNovas: 0, parcelasCorrigidas: [], religadas, avulsas: avulsas.length };

for (const ped of bling.pedidos) {
  const velho = contratoPorPedido.get(ped.num);
  const cancelado = String(ped.situacao) === '3' || /cancel/i.test(String(ped.situacao));
  const contrato = velho
    ? { ...velho }                                   // preserva id, stripeClienteId, histórico
    : { id: uid('c'), criadoEm: new Date().toISOString(), historico: [] };

  if (velho) {
    rel.contratosMantidos++;
    if (cent(velho.valor) !== cent(ped.total)) rel.contratosAtualizados++;
    if (!velho.servico && ped.servico) rel.servicoPreenchido++;
    else if (velho.servico && ped.servico && velho.servico !== ped.servico) {
      rel.servicoDivergente.push({ pedido: ped.num, cliente: ped.nome, sistema: velho.servico, bling: ped.servico });
    }
    if (!Number(velho.entrada || 0) && Number(ped.entrada || 0)) rel.entradaPreenchida++;
  } else rel.contratosNovos++;

  Object.assign(contrato, {
    pedidoBling: String(ped.num),
    cliente: ped.nome || contrato.cliente || '',
    email: ped.email || contrato.email || '',
    telefone: ped.fone || contrato.telefone || '',
    valor: cent(ped.total),
    // Serviço vem do produto do item no Bling, não mais de um campo vazio.
    servico: ped.servico || contrato.servico || '',
    // A entrada é a parcela paga na assinatura — no Bling ela se reconhece por
    // `nroDias: "0"` (ou tipo 0). Sem isso o contrato mostrava entrada zero
    // mesmo quando o cliente pagou no ato.
    entrada: cent(ped.entrada || 0),
    numParcelas: (ped.parcelas || []).length || contrato.numParcelas || 0,
    dataAssinatura: iso(ped.data) || contrato.dataAssinatura || null,
    observacoes: ped.observacoes || contrato.observacoes || '',
    etapa: contrato.etapa || (cancelado ? 'Cancelado' : 'Assinado'),
    // O REGISTRO BRUTO fica guardado. Hoje o sistema usa uma parte; relatório
    // futuro (margem por serviço, desconto praticado, carteira por vendedor)
    // vai querer o resto, e reexportar o Bling meses depois não traz de volta
    // o que mudou nesse meio-tempo.
    bling: {
      pedidoId: String(ped.id), numero: ped.num, data: iso(ped.data),
      situacao: String(ped.situacao), total: cent(ped.total),
      idContato: String(ped.idContato || ''), vendedorId: String(ped.vendedorId || ''),
      categoriaId: String(ped.categoriaId || ''),
      obsInterna: ped.obsInterna || '',
      itens: (ped.itens || []).map(i => ({ servico: i.servico, codigo: i.codigo,
        valor: cent(i.valor), qtde: i.qtde, precoLista: cent(i.precoLista), desconto: cent(i.desconto) })),
      cronograma: (ped.parcelas || []).map(x => ({ venc: iso(x.venc), valor: cent(x.valor), dias: x.dias, tipo: x.tipo })),
      lidoEm: new Date().toISOString(),
    },
  });
  novosContratos.push(contrato);

  for (const c of contasDoPedido(ped)) {
    const velhaP = c.blingId ? parcelaPorBlingId.get(c.blingId) : null;
    if (velhaP) {
      rel.parcelasMantidas++;
      const mudou = cent(velhaP.valor) !== c.valor
        || String(velhaP.vencimento || '').slice(0, 10) !== c.vencimento
        || cent(velhaP.valorRecebido) !== c.valorRecebido;
      if (mudou) rel.parcelasCorrigidas.push({ pedido: ped.num, cliente: ped.nome,
        de: { valor: cent(velhaP.valor), venc: velhaP.vencimento, recebido: cent(velhaP.valorRecebido) },
        para: { valor: c.valor, venc: c.vencimento, recebido: c.valorRecebido } });
    } else rel.parcelasNovas++;

    novasParcelas.push({
      ...(velhaP || {}),                              // preserva id e o bloco `stripe`
      id: velhaP ? velhaP.id : uid('cr'),
      contratoId: contrato.id,
      clienteNome: ped.nome || '',
      servico: contrato.servico || '',
      vendedor: contrato.vendedor || '',
      blingId: c.blingId,
      descricao: velhaP ? velhaP.descricao : '',
      vencimento: c.vencimento,
      valor: c.valor,
      valorRecebido: c.valorRecebido,
      dataRecebimento: c.dataRecebimento,
      status: c.status,
      observacao: c.observacao,
      origemBling: c.origem,
    });
  }
}

// As avulsas entram do mesmo jeito, só sem contrato. Nenhuma conta fica fora.
for (const t of avulsas) {
  const velhaP = parcelaPorBlingId.get(String(t.id));
  if (velhaP) rel.parcelasMantidas++; else rel.parcelasNovas++;
  const pago = t.sit === 'pago';
  novasParcelas.push({
    ...(velhaP || {}),
    id: velhaP ? velhaP.id : uid('cr'),
    contratoId: null,
    clienteNome: t.nome || '',
    blingId: String(t.id),
    vencimento: iso(t.venc),
    valor: cent(t.valor),
    valorRecebido: pago ? cent(t.pago || t.valor) : 0,
    dataRecebimento: pago ? iso(t.liq) : null,
    status: pago ? 'Pago' : (iso(t.venc) < hoje ? 'Atrasado' : 'A vencer'),
    observacao: String(t.obs || '').slice(0, 200),
    origemBling: 'avulsa',
    motivoAvulsa: t.motivo,
  });
}

// Contratos do sistema que não vieram do Bling.
//
// O Bling é a fonte da verdade dos contratos: o que não tem pedido lá não é
// contrato. Na prática eram dois registros de teste criados durante a
// implantação — sem parcela, sem pagamento, sem cliente cadastrado — e eram
// exatamente eles que faziam a contagem não bater com o Bling.
//
// SÓ SAI O QUE NÃO TEM NADA. Um contrato sem pedido mas COM parcela ou
// pagamento é outra história: aí é trabalho de verdade que ficou sem pedido,
// e apagar seria destruir dinheiro registrado. Esse fica, e aparece no
// relatório para alguém criar o pedido no Bling.
const parcelasPorContrato = {};
for (const x of parcelasHoje) if (x.contratoId) (parcelasPorContrato[x.contratoId] ||= []).push(x);
rel.removidos = [];
for (const c of contratosHoje) {
  const n = Number(String(c.pedidoBling || '').replace(/\D/g, ''));
  if (n) continue;
  const suas = parcelasPorContrato[c.id] || [];
  const temDinheiro = suas.length > 0 || suas.some((x) => Number(x.valorRecebido || 0) > 0);
  if (temDinheiro) {
    novosContratos.push(c); rel.contratosMantidos++;
    (rel.semPedidoMasComDados ||= []).push({ cliente: c.cliente, valor: cent(c.valor), parcelas: suas.length });
  } else {
    rel.removidos.push({ id: c.id, cliente: c.cliente, valor: cent(c.valor), servico: c.servico, etapa: c.etapa });
  }
}

// Os processos que esses contratos criaram saem junto: sem contrato eles
// ficariam órfãos, apontando para um id que não existe mais.
const idsRemovidos = new Set(rel.removidos.map((r) => r.id));
const processosHoje = bloco('legalway-processos-documentacao-v1');
const processosNovos = processosHoje.filter((pr) => !(pr.contratoId && idsRemovidos.has(pr.contratoId)));
rel.processosRemovidos = processosHoje.length - processosNovos.length;
// E as parcelas deles também.
const idsNovos = new Set(novasParcelas.map((p) => String(p.id)));
for (const p of parcelasHoje) {
  if (idsNovos.has(String(p.id))) continue;
  if (p.contratoId && idsRemovidos.has(p.contratoId)) continue;   // era de contrato de teste
  novasParcelas.push(p); rel.parcelasMantidas++;
}

// ---------------------------------------------------------------------------
// 4. RELATÓRIO E ARQUIVO
// ---------------------------------------------------------------------------
const soma = (l, k) => cent(l.reduce((s, x) => s + Number(x[k] || 0), 0));
console.log('\n=== CONTRATOS ===');
console.log('  antes:', contratosHoje.length, '|', f(soma(contratosHoje, 'valor')));
console.log('  depois:', novosContratos.length, '|', f(soma(novosContratos, 'valor')));
console.log('  mantidos (id preservado):', rel.contratosMantidos, '| novos:', rel.contratosNovos,
  '| com valor corrigido:', rel.contratosAtualizados);
console.log('  serviço preenchido (estava vazio):', rel.servicoPreenchido,
  '| serviço diverge do Bling:', rel.servicoDivergente.length);
console.log('  entrada preenchida (estava zerada):', rel.entradaPreenchida);
console.log('  removidos (sem pedido no Bling e sem nada dentro):', rel.removidos.length);
rel.removidos.forEach((r) => console.log('     -', r.cliente, '|', f(r.valor), '|', r.servico || 'sem serviço'));
if (rel.semPedidoMasComDados) {
  console.log('  MANTIDOS sem pedido no Bling (têm parcela/pagamento):', rel.semPedidoMasComDados.length);
  rel.semPedidoMasComDados.forEach((r) => console.log('     -', r.cliente, '|', f(r.valor), '|', r.parcelas, 'parcela(s) — criar o pedido no Bling'));
}
console.log('  processos de documentação removidos junto:', rel.processosRemovidos);

console.log('\n=== CONTAS A RECEBER ===');
console.log('  antes:', parcelasHoje.length, '|', f(soma(parcelasHoje, 'valor')), '| recebido', f(soma(parcelasHoje, 'valorRecebido')));
console.log('  depois:', novasParcelas.length, '|', f(soma(novasParcelas, 'valor')), '| recebido', f(soma(novasParcelas, 'valorRecebido')));
console.log('  mantidas (id preservado):', rel.parcelasMantidas, '| novas:', rel.parcelasNovas);
console.log('  corrigidas (valor/data/recebido):', rel.parcelasCorrigidas.length);
console.log('  renegociações religadas ao contrato:', rel.religadas);
console.log('  avulsas (sem contrato, mas dentro do sistema):', rel.avulsas);

const pagoBling = cent(bling.titulos.filter((t) => t.sit === 'pago').reduce((s, t) => s + num(t.pago || t.valor), 0));
const pagoNovo = soma(novasParcelas, 'valorRecebido');
console.log('\n=== CONFERÊNCIA ===');
console.log('  recebido no Bling:', f(pagoBling));
console.log('  recebido na LIV:  ', f(pagoNovo));
console.log('  diferença:', f(pagoNovo - pagoBling), cent(pagoNovo - pagoBling) === 0 ? '✓ fecha' : '✗ NÃO FECHA');

const saida = {
  formato: 'legalway-backup-v1',
  armazenamento: [
    { chave: 'legalway-contratos-v1', valor: novosContratos },
    { chave: 'legalway-financeiro-v1', valor: novasParcelas },
    // O bloco de processos só entra quando algo precisa sair dele. Restaurar
    // substitui o bloco inteiro — incluir sem necessidade seria arriscar 270
    // processos para não mudar nada.
    ...(rel.processosRemovidos ? [{ chave: 'legalway-processos-documentacao-v1', valor: processosNovos }] : []),
  ],
  arquivos: [],
};
fs.writeFileSync(caminhoSaida, JSON.stringify(saida));
fs.writeFileSync(caminhoSaida.replace(/\.json$/, '-relatorio.json'), JSON.stringify(rel, null, 1));
console.log('\narquivo para restaurar:', caminhoSaida);
console.log('relatório das correções:', caminhoSaida.replace(/\.json$/, '-relatorio.json'));
console.log('\nNADA foi escrito no sistema. Restaurar é decisão de gente.');
