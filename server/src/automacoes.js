// Automações que antes só rodavam quando alguém abria uma tela. Agora rodam no servidor:
// na inicialização, a cada minuto e logo depois de gravações relevantes. Mesma lógica das telas
// (que continuam idempotentes: se a tela rodar antes, o servidor não duplica; e vice-versa).
import { ler, gravar } from './armazenamento.js';
import { avisarCanal, avisarPessoa } from './chat.js';

const K = {
  contratos: 'legalway-contratos-v1', clientes: 'legalway-clientes-v1', receber: 'legalway-financeiro-v1',
  pagar: 'legalway-contas-pagar-v1', processos: 'legalway-processos-documentacao-v1', checklists: 'legalway-checklists-v1',
  sdr: 'legalway-sdr-v1', config: 'legalway-automacoes-config-v1',
};
const QUEM = 'automação';
const uid = (p) => p + Date.now() + Math.floor(Math.random() * 1000);
const agora = () => new Date().toISOString();
const hoje = () => new Date().toISOString().slice(0, 10);
const fmtMoney = (v) => 'US$ ' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function bloco(chave, padrao = []) {
  const r = await ler(chave);
  return { valor: r ? r.valor : padrao, versao: r ? r.versao : null };
}
async function salvar(chave, valor, versao) { return gravar(chave, valor, versao, QUEM); }

// idêntico ao calcularParcelas de contratos.html
function calcularParcelas(dataBaseIso, numParcelas, diasPrimeira, recorrencia, diasCustom, valorTotal, entrada) {
  numParcelas = Number(numParcelas) || 0;
  if (numParcelas <= 0) return [];
  const valorRestante = Math.max(Number(valorTotal || 0) - Number(entrada || 0), 0);
  const valorParcela = Math.round((valorRestante / numParcelas) * 100) / 100;
  const parcelas = [];
  let dataAtual = new Date(dataBaseIso + 'T12:00:00');
  dataAtual.setDate(dataAtual.getDate() + Number(diasPrimeira || 30));
  let soma = 0;
  for (let i = 1; i <= numParcelas; i++) {
    let valor = valorParcela;
    if (i === numParcelas) valor = Math.round((valorRestante - soma) * 100) / 100;
    soma += valor;
    parcelas.push({ numero: i, data: dataAtual.toISOString().slice(0, 10), valor });
    const proxima = new Date(dataAtual);
    if (recorrencia === 'mensal') proxima.setMonth(proxima.getMonth() + 1);
    else if (recorrencia === '14') proxima.setDate(proxima.getDate() + 14);
    else proxima.setDate(proxima.getDate() + Number(diasCustom || 30));
    dataAtual = proxima;
  }
  return parcelas;
}

// 1) Confirmação de assinatura → contrato "Assinado" + PDF + cliente + contas a receber
async function assinaturasPendentes(log) {
  const { valor: contratos, versao } = await bloco(K.contratos);
  let mudou = false;
  const confirmados = [];
  for (const c of contratos) {
    if (c.etapa === 'Assinado' || c.etapa === 'Cancelado') continue;
    const conf = await ler('legalway-contrato-assinado-' + c.id);
    if (!conf) continue;
    const dados = conf.valor || {};
    c.etapa = 'Assinado';
    c.dataAssinatura = dados.assinadoEm || agora();
    if (dados.pdf) c.pdfAssinado = dados.pdf;
    c.historico = c.historico || [];
    c.historico.push({ quando: agora(), texto: 'Assinatura confirmada automaticamente pelo cliente — automação disparada' + (dados.pdf ? ' (PDF anexado)' : '') });
    confirmados.push(c); mudou = true;
  }
  if (!mudou) return;
  await salvar(K.contratos, contratos, versao);
  log.push(`${confirmados.length} contrato(s) marcados como Assinado`);
  for (const c of confirmados) { await clienteDoContrato(c, log); await contasDoContrato(c, log); }
}

async function clienteDoContrato(c, log) {
  const { valor: clientes, versao } = await bloco(K.clientes);
  let cliente = clientes.find(x => x.telefone && c.telefone && x.telefone === c.telefone);
  if (!cliente) {
    cliente = { id: uid('cl'), nome: c.cliente, telefone: c.telefone, criadoEm: agora(), contratoIds: [], historico: [{ quando: agora(), texto: 'Cliente criado automaticamente ao assinar contrato' }] };
    clientes.push(cliente);
    log.push(`cliente criado: ${c.cliente}`);
  } else {
    cliente.historico = cliente.historico || [];
    cliente.historico.push({ quando: agora(), texto: `Novo contrato assinado: ${c.servico}` });
  }
  cliente.contratoIds = cliente.contratoIds || [];
  if (!cliente.contratoIds.includes(c.id)) cliente.contratoIds.push(c.id);
  await salvar(K.clientes, clientes, versao);
}

async function contasDoContrato(c, log) {
  const { valor: contas, versao } = await bloco(K.receber);
  if (contas.some(cr => cr.contratoId === c.id)) return;
  const dataBase = c.dataAssinatura ? c.dataAssinatura.slice(0, 10) : hoje();
  const base = { contratoId: c.id, clienteNome: c.cliente, servico: c.servico, vendedor: c.vendedor, status: 'A vencer', valorRecebido: 0, dataRecebimento: null, formaPagamento: c.pagamento || '', observacao: '', criadoEm: agora() };
  if (c.entrada > 0) contas.push({ id: uid('fr'), ...base, descricao: 'Entrada', valor: c.entrada, vencimento: dataBase });
  if (c.numParcelas > 0) {
    for (const p of calcularParcelas(dataBase, c.numParcelas, c.diasPrimeiraParcela, c.recorrencia, c.diasCustom, c.valor, c.entrada)) {
      contas.push({ id: uid('fr'), ...base, descricao: `Parcela ${p.numero}/${c.numParcelas}`, valor: p.valor, vencimento: p.data });
    }
  }
  await salvar(K.receber, contas, versao);
  log.push(`parcelas geradas: ${c.cliente}`);
}

// 2) Contrato assinado → processo de Documentação
async function processosDeContratos(log) {
  const { valor: contratos } = await bloco(K.contratos);
  const { valor: processos, versao } = await bloco(K.processos);
  const { valor: checklists } = await bloco(K.checklists);
  let n = 0;
  for (const c of contratos.filter(x => x.etapa === 'Assinado')) {
    if (processos.some(p => p.contratoId === c.id)) continue;
    const modelo = checklists.find(ck => ck.servico === c.servico);
    processos.push({
      id: uid('doc'), contratoId: c.id, clienteNome: c.cliente, telefone: c.telefone || '', email: c.email || '', servico: c.servico, vendedor: c.vendedor || '',
      responsavel: '', status: 'Aguardando boas-vindas',
      checklist: modelo ? modelo.documentos.map(d => ({ nome: d.nome, status: 'Não solicitado' })) : [],
      boasVindasEnviada: false, autorizacaoSolicitada: false, autorizacaoConcedida: false, protocolo: null, acompanhamentos: [], etiquetas: [],
      semRetorno: false, semRetornoDesde: null, ajudaVendedorSolicitadaEm: null,
      traducao: { status: 'nao_enviado', prestadorId: null, prestadorNome: null, enviadoEm: null, documentos: [], recebidoEm: null, valor: null, pagamentoGerado: false, confirmadoPeloPrestador: false, confirmadoEm: null, observacoesPrestador: '', arquivosRecebidos: [] },
      avaliacaoPsicologica: { necessaria: false, status: 'nao_iniciado', prestadorId: null, prestadorNome: null, dataConsulta: null, laudoRecebidoEm: null, valor: null, pagamentoGerado: false, laudoArquivo: null },
      historico: [{ quando: agora(), texto: 'Processo criado automaticamente — contrato assinado' }], criadoEm: agora(),
    });
    n++;
  }
  if (n) { await salvar(K.processos, processos, versao); log.push(`${n} processo(s) de documentação criado(s)`); }
}

// 3) Financeiro autorizou o protocolo → processo "Liberado para protocolo"
async function autorizacoesFinanceiras(log) {
  const { valor: processos, versao } = await bloco(K.processos);
  let n = 0;
  for (const p of processos) {
    if (p.status === 'Aguardando autorização financeira' && p.autorizacaoConcedida) {
      p.status = 'Liberado para protocolo';
      p.historico = p.historico || [];
      p.historico.push({ quando: agora(), texto: 'Financeiro autorizou o protocolo — liberado para a equipe de documentação' });
      n++;
    }
  }
  if (n) { await salvar(K.processos, processos, versao); log.push(`${n} processo(s) liberado(s) para protocolo`); }
}

// 4) Comissão do SDR: contrato assinado de lead recuperado + entrada mínima paga
async function comissaoSdr(log) {
  const { valor: cfgV } = await bloco(K.config, {});
  const cfg = { comissaoSdr: 100, entradaMinSdr: 500, ...(cfgV || {}) };
  const { valor: contratos } = await bloco(K.contratos);
  const { valor: sdrLeads } = await bloco(K.sdr);
  const { valor: contas } = await bloco(K.receber);
  const { valor: pagar, versao } = await bloco(K.pagar);
  const recuperados = sdrLeads.filter(l => l.status === 'recuperado' && l.telefone);
  let n = 0;
  for (const c of contratos) {
    if (c.etapa !== 'Assinado' || !c.telefone) continue;
    if (!recuperados.some(l => l.telefone === c.telefone)) continue;
    if (pagar.some(cp => cp.contratoId === c.id && cp.categoria === 'Comissão SDR')) continue;
    const entrada = contas.find(cr => cr.contratoId === c.id && cr.descricao === 'Entrada');
    const entradaPaga = entrada ? Number(entrada.valorRecebido || 0) : 0;
    if (entradaPaga < cfg.entradaMinSdr) continue;
    pagar.push({
      id: uid('cp'), fornecedor: 'SDR', descricao: `Comissão SDR — recuperação de ${c.cliente}`, categoria: 'Comissão SDR', centroCusto: 'Vendas', conta: '',
      valor: cfg.comissaoSdr, vencimento: hoje(), formaPagamento: '',
      observacao: `Contrato assinado + entrada de ${fmtMoney(entradaPaga)} paga (mínimo exigido: ${fmtMoney(cfg.entradaMinSdr)}).`,
      status: 'A vencer', tipo: 'unica', contratoId: c.id, criadoEm: agora(),
    });
    n++;
  }
  if (n) { await salvar(K.pagar, pagar, versao); log.push(`${n} comissão(ões) de SDR gerada(s)`); avisarCanal('financeiro', `💰 Comissão de SDR gerada automaticamente (${n}).`).catch(() => {}); }
}

// 5) Contas vencidas viram "Atrasado" (receber e pagar), todo dia — não depende de alguém abrir o Financeiro
async function marcarAtrasadas(log) {
  const h = hoje();
  for (const chave of [K.receber, K.pagar]) {
    const { valor: contas, versao } = await bloco(chave);
    let n = 0;
    for (const c of contas) if (c.status === 'A vencer' && c.vencimento && c.vencimento < h) { c.status = 'Atrasado'; n++; }
    if (n) { await salvar(chave, contas, versao); log.push(`${n} conta(s) marcada(s) como Atrasado em ${chave === K.receber ? 'receber' : 'pagar'}`); }
  }
}

// 6) Tarefas antigas ligadas só pelo nome ganham clienteId (uma vez; novas já vêm com id)
async function vincularTarefasPorId(log) {
  const { valor: tarefas, versao } = await bloco('legalway-tarefas-v1');
  const { valor: clientes } = await bloco(K.clientes);
  let n = 0;
  for (const t of tarefas) {
    if (t.clienteId || !t.vinculo) continue;
    const alvo = (t.vinculo || '').trim().toLowerCase();
    const c = clientes.find(x => (x.nome || '').trim().toLowerCase() === alvo) || clientes.find(x => x.nome && alvo.includes(x.nome.trim().toLowerCase()));
    if (c) { t.clienteId = c.id; n++; }
  }
  if (n) { await salvar('legalway-tarefas-v1', tarefas, versao); log.push(`${n} tarefa(s) vinculada(s) a cliente por id`); }
}

// 7) Contrato cancelado → parcelas futuras (sem nada recebido) viram "Cancelado"; o que já foi pago fica
async function estornarParcelasDeCancelados(log) {
  const { valor: contratos } = await bloco(K.contratos);
  const cancelados = new Set(contratos.filter(c => c.etapa === 'Cancelado').map(c => c.id));
  if (!cancelados.size) return;
  const { valor: contas, versao } = await bloco(K.receber);
  let n = 0;
  for (const c of contas) {
    if (!cancelados.has(c.contratoId)) continue;
    if (!['A vencer', 'Atrasado'].includes(c.status) || Number(c.valorRecebido || 0) > 0) continue;
    c.status = 'Cancelado';
    c.observacao = ((c.observacao || '') + ' Cancelada automaticamente: contrato cancelado.').trim();
    n++;
  }
  if (n) { await salvar(K.receber, contas, versao); log.push(`${n} parcela(s) cancelada(s) de contrato(s) cancelado(s)`); }
}

// 8) Tarefas recorrentes: ao concluir, cria a próxima; no dia do prazo, avisa o responsável no chat
function proximaData(prazo, recorrencia) {
  const d = new Date((prazo || hoje()) + 'T12:00:00');
  if (recorrencia === 'diaria') d.setDate(d.getDate() + 1);
  else if (recorrencia === 'semanal') d.setDate(d.getDate() + 7);
  else if (recorrencia === 'quinzenal') d.setDate(d.getDate() + 15);
  else if (recorrencia === 'mensal') d.setMonth(d.getMonth() + 1);
  else return null;
  return d.toISOString().slice(0, 10);
}
async function tarefasRecorrentesELembretes(log) {
  const { valor: tarefas, versao } = await bloco('legalway-tarefas-v1');
  const h = hoje();
  let novas = 0, avisos = 0;
  for (const t of tarefas.slice()) {
    // concluída e recorrente, ainda sem a próxima gerada
    if (t.recorrencia && t.status === 'Concluída' && !t.proximaGerada) {
      const prox = proximaData(t.prazo, t.recorrencia);
      if (prox) {
        tarefas.unshift({ ...t, id: uid('tf'), status: 'A fazer', prazo: prox, criadoEm: agora(), concluidaEm: null, proximaGerada: false, lembreteEnviadoEm: null, criadoPor: 'Sistema (recorrência)', origemRecorrencia: t.id });
        t.proximaGerada = true; novas++;
      }
    }
    // lembrete no dia do prazo (uma vez)
    if (t.status !== 'Concluída' && t.prazo === h && t.responsavel && t.lembreteEnviadoEm !== h) {
      const ok = await avisarPessoa(t.responsavel, `⏰ Tarefa pra hoje: "${t.titulo}"${t.vinculo ? ' — ' + t.vinculo : ''}. Veja em Tarefas.`);
      t.lembreteEnviadoEm = h; if (ok) avisos++;
    }
  }
  if (novas || avisos) { await salvar('legalway-tarefas-v1', tarefas, versao); if (novas) log.push(`${novas} tarefa(s) recorrente(s) criada(s)`); if (avisos) log.push(`${avisos} lembrete(s) de tarefa enviado(s)`); }
}

let rodando = false;
export async function executarAutomacoes(motivo = 'agendado') {
  if (rodando) return;
  rodando = true;
  const log = [];
  try {
    await assinaturasPendentes(log);
    await processosDeContratos(log);
    await autorizacoesFinanceiras(log);
    await comissaoSdr(log);
    await marcarAtrasadas(log);
    await vincularTarefasPorId(log);
    await estornarParcelasDeCancelados(log);
    await tarefasRecorrentesELembretes(log);
    if (log.length) console.log(`[automações/${motivo}] ${log.join(' · ')}`);
  } catch (e) {
    console.error('[automações] falhou:', e.message);
  } finally { rodando = false; }
}

// Chaves cujas gravações disparam uma rodada logo em seguida
const GATILHOS = new Set([K.contratos, K.receber, K.processos, K.sdr, K.clientes, 'legalway-tarefas-v1']);
export function aoGravarChave(chave) {
  if (GATILHOS.has(chave) || chave.startsWith('legalway-contrato-assinado-')) setTimeout(() => executarAutomacoes('gatilho:' + chave), 1500);
}
