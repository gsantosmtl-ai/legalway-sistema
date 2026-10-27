// O plano de uma sincronização — o que entraria, antes de qualquer escrita.
//
// Este arquivo é função PURA de propósito: recebe o que veio de fora e o que
// já existe, e devolve o que falta. Quem busca na internet e quem grava no
// banco são outros; aqui não há rede nem transação, então dá para testar o que
// realmente importa — a decisão de criar ou não criar — sem subir nada.
//
// A REGRA QUE ATRAVESSA TUDO: idempotência por identificador EXTERNO.
//
// O id interno do sistema nasce aqui e não serve para reconhecer nada vindo de
// fora. Quem reconhece é o id do outro lado:
//
//   contrato  -> pedidoBling (o número do pedido de venda)
//   parcela   -> blingId     (o id da CONTA A RECEBER, não o do pedido;
//                             são diferentes, e confundir os dois foi o que
//                             custou uma manhã no importador antigo)
//   anexo     -> idTrello    (o id do anexo no Trello)
//
// Rodar duas vezes tem que dar o mesmo resultado que rodar uma. É isso que
// permite sincronizar sem medo quando ninguém lembra se já rodou hoje.

const texto = (x) => String(x == null ? '' : x).trim();
const chaveNome = (x) => texto(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dinheiro = (x) => Math.round((Number(x) || 0) * 100) / 100;

/**
 * O que do Bling ainda não está no sistema.
 *
 * `pedidos`: [{numero, idPedido, cliente, email, idContato, servico, valor, data}]
 * `contas` : [{pedido, blingId, vencimento, valor, taxa, liquido, pago, situacao, forma}]
 */
export function planoDoBling(entrada = {}) {
  // `= []` no destructuring não vale quando a chave vem com `null` explícito —
  // e é assim que chega quando a leitura de um bloco falhou. Sem esta linha a
  // sincronização inteira morre num `not iterable`, em vez de simplesmente não
  // ter o que fazer.
  const lista = (x) => (Array.isArray(x) ? x : []);
  const pedidos = lista(entrada.pedidos), contas = lista(entrada.contas);
  const contratos = lista(entrada.contratos), clientes = lista(entrada.clientes);
  const financeiro = lista(entrada.financeiro);
  const jaPedido = new Set(contratos.map((c) => texto(c && c.pedidoBling)).filter(Boolean));
  const jaConta = new Set(financeiro.map((x) => texto(x && x.blingId)).filter(Boolean));
  const clientePorNome = new Map();
  for (const c of clientes) if (c && c.nome) clientePorNome.set(chaveNome(c.nome), c);

  const plano = { contratos: [], parcelas: [], clientesNovos: [], clientesLigados: [], ignorados: [] };

  for (const p of pedidos) {
    const n = texto(p && p.numero);
    if (!n) { plano.ignorados.push({ o: 'pedido sem número', detalhe: JSON.stringify(p).slice(0, 80) }); continue; }
    if (jaPedido.has(n)) { plano.ignorados.push({ o: 'pedido já no sistema', pedido: n }); continue; }

    const minhas = contas.filter((x) => x && texto(x.pedido) === n && !jaConta.has(texto(x.blingId)));
    const repetidas = contas.filter((x) => x && texto(x.pedido) === n && jaConta.has(texto(x.blingId)));
    // Pedido inédito com parcela que JÁ existe é sinal de importação pela
    // metade. Entra no plano assim mesmo, mas dito: quem olha precisa saber.
    if (repetidas.length) plano.ignorados.push({ o: 'parcela já existia', pedido: n, quantas: repetidas.length });

    plano.contratos.push({
      pedidoBling: n, idPedido: texto(p.idPedido), cliente: texto(p.cliente), email: texto(p.email),
      idContato: texto(p.idContato), servico: texto(p.servico) || '(sem serviço)',
      valor: dinheiro(p.valor), dataAssinatura: texto(p.data),
      entrada: minhas.length ? dinheiro(minhas[0].valor) : 0,
      numParcelas: Math.max(0, minhas.length - 1),
      // A soma das parcelas EMITIDAS, que pode não bater com o total do
      // pedido. Quando não bate, o número vai junto em vez de sumir — foi o
      // caso do pedido 255, com 350 de diferença dentro do próprio Bling.
      somaParcelas: dinheiro(minhas.reduce((s, x) => s + (Number(x.valor) || 0), 0)),
    });
    for (const x of minhas) {
      plano.parcelas.push({
        pedidoBling: n, blingId: texto(x.blingId), vencimento: texto(x.vencimento),
        valor: dinheiro(x.valor), taxa: dinheiro(x.taxa), liquido: dinheiro(x.liquido),
        pago: dinheiro(x.pago), situacao: texto(x.situacao), forma: texto(x.forma),
        cliente: texto(p.cliente), servico: texto(p.servico),
      });
    }
    const achado = clientePorNome.get(chaveNome(p.cliente));
    if (achado) plano.clientesLigados.push({ nome: texto(p.cliente), id: achado.id, pedido: n });
    else {
      // Dois pedidos do mesmo cliente novo criam UM cliente, não dois.
      if (!plano.clientesNovos.some((c) => chaveNome(c.nome) === chaveNome(p.cliente)))
        plano.clientesNovos.push({ nome: texto(p.cliente), email: texto(p.email), idContato: texto(p.idContato) });
    }
  }

  plano.resumo = {
    contratos: plano.contratos.length,
    parcelas: plano.parcelas.length,
    clientesNovos: plano.clientesNovos.length,
    clientesLigados: plano.clientesLigados.length,
    dinheiro: dinheiro(plano.parcelas.reduce((s, x) => s + x.valor, 0)),
    jaPago: dinheiro(plano.parcelas.reduce((s, x) => s + x.pago, 0)),
    naoBatem: plano.contratos.filter((c) => Math.abs(c.valor - c.somaParcelas) > 0.015)
      .map((c) => ({ pedido: c.pedidoBling, contrato: c.valor, parcelas: c.somaParcelas,
        diferenca: dinheiro(c.valor - c.somaParcelas) })),
  };
  return plano;
}

/**
 * O que MUDOU no Bling depois que o registro já entrou aqui.
 *
 * `planoDoBling` só cria: pedido que já existe é pulado inteiro. Isso basta
 * para não duplicar, e não basta para ficar em dia — uma parcela marcada como
 * paga no Bling, um contrato cancelado lá, um vencimento remarcado: nada disso
 * chegaria, e o sistema seguiria dizendo que o cliente deve.
 *
 * Aqui não se grava nada e não se decide nada sozinho. Cada diferença sai
 * classificada em dois baldes:
 *
 *   APLICÁVEL — o Bling sabe mais e o sistema não sabe nada em contrário.
 *               Típico: o Bling diz pago, aqui está em aberto. É informação
 *               que falta, não conflito.
 *
 *   REVISAR   — os dois lados afirmam coisas diferentes, e escolher sozinho
 *               seria apagar o trabalho de alguém. Típico: aqui está pago e no
 *               Bling está aberto (alguém baixou à mão), ou o valor mudou dos
 *               dois lados. Dinheiro confirmado não se sobrescreve sem gente
 *               olhando.
 */
export function divergenciasDoBling({ pedidos = [], contas = [], contratos = [], financeiro = [] } = {}) {
  const lista = (x) => (Array.isArray(x) ? x : []);
  const ped = lista(pedidos), ctas = lista(contas), cts = lista(contratos), fin = lista(financeiro);
  const porPedido = new Map();
  for (const c of cts) if (c && texto(c.pedidoBling)) porPedido.set(texto(c.pedidoBling), c);
  const porConta = new Map();
  for (const x of fin) if (x && texto(x.blingId)) porConta.set(texto(x.blingId), x);

  const aplicavel = [], revisar = [];
  const perto = (a, b) => Math.abs(dinheiro(a) - dinheiro(b)) <= 0.015;

  for (const p of ped) {
    const c = porPedido.get(texto(p.numero));
    if (!c) continue;                                   // inédito é assunto do planoDoBling
    // Cancelamento no Bling é fato de lá, e o sistema não tem como saber.
    if (texto(p.situacao).toLowerCase() === 'cancelado' && texto(c.etapa) !== 'Cancelado') {
      aplicavel.push({ tipo: 'contrato.cancelado', pedido: texto(p.numero), contratoId: c.id,
        cliente: texto(c.cliente), aqui: texto(c.etapa), noBling: 'Cancelado',
        porque: 'cancelado no Bling e ativo aqui' });
    }
    if (!perto(p.valor, c.valor)) {
      // Valor de contrato mexe em tudo que depende dele. Nunca automático.
      revisar.push({ tipo: 'contrato.valor', pedido: texto(p.numero), contratoId: c.id,
        cliente: texto(c.cliente), aqui: dinheiro(c.valor), noBling: dinheiro(p.valor),
        porque: 'o valor do contrato mudou no Bling' });
    }
  }

  for (const x of ctas) {
    const f = porConta.get(texto(x.blingId));
    if (!f) continue;
    const pagoAqui = Number(f.valorRecebido) || 0;
    const pagoLa = Number(x.pago) || 0;
    const quitadaLa = texto(x.situacao).toLowerCase() === 'pago' || pagoLa > 0;
    const quitadaAqui = texto(f.status) === 'Pago' || pagoAqui > 0;
    const base = { pedido: texto(x.pedido), parcelaId: f.id, blingId: texto(x.blingId),
      cliente: texto(f.clienteNome), descricao: texto(f.descricao) || texto(f.vencimento) };

    if (quitadaLa && !quitadaAqui) {
      aplicavel.push({ ...base, tipo: 'parcela.paga', aqui: f.status, noBling: 'pago',
        valor: dinheiro(x.valor), pagoNoBling: dinheiro(pagoLa),
        porque: 'paga no Bling e em aberto aqui' });
    } else if (!quitadaLa && quitadaAqui) {
      revisar.push({ ...base, tipo: 'parcela.pagaSoAqui', aqui: f.status, noBling: texto(x.situacao),
        porque: 'paga aqui e em aberto no Bling — alguém baixou à mão' });
    } else if (quitadaLa && quitadaAqui && !perto(pagoLa, pagoAqui)) {
      revisar.push({ ...base, tipo: 'parcela.valorPago', aqui: dinheiro(pagoAqui), noBling: dinheiro(pagoLa),
        porque: 'os dois dizem paga, com valores diferentes' });
    }
    if (!perto(x.valor, f.valor)) {
      revisar.push({ ...base, tipo: 'parcela.valor', aqui: dinheiro(f.valor), noBling: dinheiro(x.valor),
        porque: 'o valor da parcela mudou no Bling' });
    }
    // Vencimento remarcado: muda cobrança e inadimplência, mas não toca em
    // dinheiro já recebido. Só vale mexer no que ainda está em aberto.
    const vencAqui = texto(f.vencimento);
    const vencLa = (() => { const [a, b, d] = texto(x.vencimento).split('/');
      return d ? `${d}-${b}-${a}` : texto(x.vencimento); })();
    if (vencLa && vencAqui && vencLa !== vencAqui) {
      (quitadaAqui ? revisar : aplicavel).push({ ...base, tipo: 'parcela.vencimento',
        aqui: vencAqui, noBling: vencLa,
        porque: quitadaAqui ? 'vencimento mudou numa parcela já paga aqui' : 'vencimento remarcado no Bling' });
    }
  }

  return { aplicavel, revisar, resumo: {
    aplicaveis: aplicavel.length, paraRevisar: revisar.length,
    pagamentosQueFaltam: aplicavel.filter((d) => d.tipo === 'parcela.paga').length,
    dinheiroQueFalta: dinheiro(aplicavel.filter((d) => d.tipo === 'parcela.paga')
      .reduce((s, d) => s + (d.pagoNoBling || 0), 0)),
    contratosCancelados: aplicavel.filter((d) => d.tipo === 'contrato.cancelado').length,
  } };
}

/**
 * Quais anexos do Trello ainda não estão na ficha.
 *
 * `cards`: [{idCard, titulo, quadro, cliente, anexos:[{id, nome, url, bytes, quando}]}]
 *
 * O casamento é por FICHA, nunca por nome de pessoa solto: duas pessoas podem
 * ter o mesmo nome, e um anexo no cliente errado é pior do que um anexo que
 * falta. Card sem ficha correspondente NÃO é adivinhado — vai para revisão.
 */
export function planoDoTrello(entrada = {}) {
  const cards = Array.isArray(entrada.cards) ? entrada.cards : [];
  const processos = Array.isArray(entrada.processos) ? entrada.processos : [];
  const plano = { porFicha: [], semFicha: [], jaTinham: 0 };
  const fichasPorCliente = new Map();
  for (const p of processos) {
    if (!p || p.situacao === 'cancelado') continue;
    const k = chaveNome(p.clienteNome);
    if (!fichasPorCliente.has(k)) fichasPorCliente.set(k, []);
    fichasPorCliente.get(k).push(p);
  }

  for (const c of cards) {
    const anexos = Array.isArray(c && c.anexos) ? c.anexos.filter((a) => a && texto(a.id) && texto(a.url)) : [];
    if (!anexos.length) continue;
    const candidatas = fichasPorCliente.get(chaveNome(c.cliente)) || [];
    // Uma ficha só: certo. Nenhuma ou várias: revisão humana, porque escolher
    // errado espalha documento de um cliente na pasta de outro.
    if (candidatas.length !== 1) {
      plano.semFicha.push({ idCard: texto(c.idCard), titulo: texto(c.titulo), quadro: texto(c.quadro),
        cliente: texto(c.cliente), anexos: anexos.length,
        porque: candidatas.length === 0 ? 'nenhuma ficha com esse nome' : `${candidatas.length} fichas com esse nome` });
      continue;
    }
    const ficha = candidatas[0];
    const tem = new Set();
    for (const a of (ficha.anexos || [])) if (a) { if (a.idTrello) tem.add(texto(a.idTrello)); }
    const novos = anexos.filter((a) => !tem.has(texto(a.id)));
    plano.jaTinham += anexos.length - novos.length;
    if (!novos.length) continue;
    plano.porFicha.push({ fichaId: ficha.id, cliente: texto(ficha.clienteNome), servico: texto(ficha.servico),
      quadro: texto(c.quadro), idCard: texto(c.idCard),
      novos: novos.map((a) => ({ id: texto(a.id), nome: texto(a.nome) || 'arquivo',
        url: texto(a.url), bytes: Number(a.bytes) || 0, quando: texto(a.quando) })) });
  }

  plano.resumo = {
    fichas: plano.porFicha.length,
    anexosNovos: plano.porFicha.reduce((s, f) => s + f.novos.length, 0),
    jaTinham: plano.jaTinham,
    paraRevisao: plano.semFicha.length,
    anexosParaRevisao: plano.semFicha.reduce((s, x) => s + x.anexos, 0),
  };
  return plano;
}

/**
 * A foto de onde cada card está. Tirada ANTES e conferida DEPOIS: é a prova de
 * que a sincronização de anexos não mexeu em posição, coluna nem ordem — a
 * regra que ela chamou de crítica.
 */
export function fotoDosCards(processos) {
  const foto = {};
  for (const p of (Array.isArray(processos) ? processos : [])) {
    if (!p || !p.id) continue;
    foto[p.id] = [p.status || '', p.situacao || 'ativo', p.ordem == null ? '' : p.ordem,
      p.responsavel || ''].join('|');
  }
  return foto;
}

/** O que mudou entre duas fotos. Vazio = nada se moveu. */
export function compararFotos(antes, depois) {
  const mudou = [];
  for (const id of Object.keys(antes || {})) {
    if (!(id in (depois || {}))) { mudou.push({ id, o: 'sumiu' }); continue; }
    if (antes[id] !== depois[id]) mudou.push({ id, de: antes[id], para: depois[id] });
  }
  for (const id of Object.keys(depois || {})) if (!(id in (antes || {}))) mudou.push({ id, o: 'apareceu' });
  return mudou;
}
