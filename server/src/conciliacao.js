// Conciliação de fluxo: CONTRATO → CLIENTE → FINANCEIRO → SERVIÇOS → DOCUMENTAÇÃO.
//
// Por que este módulo existe. Cada área do sistema é um bloco JSON separado e
// os vínculos entre eles são por `contratoId` DENTRO do JSON — não existe
// chave estrangeira no banco. Então nada, estruturalmente, impede um card sem
// contrato, uma parcela órfã ou dois cards do mesmo serviço. O que existe é
// uma convenção, e convenção se quebra em silêncio.
//
// Este arquivo é a conferência dessa convenção, e é uma FUNÇÃO PURA de
// propósito: recebe os blocos já lidos e devolve o diagnóstico. Assim a tela,
// a rota e os testes usam exatamente o mesmo código, e o teste não precisa de
// banco. Ele NÃO corrige nada — quem corrige é a tela, com gente olhando.

const semAcento = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const soDigitos = (x) => String(x || '').replace(/\D/g, '');
const dinheiro = (x) => Math.round((Number(x) || 0) * 100) / 100;
const ENTRADA = /^entrada$/i;

// Um centavo de folga: os valores nascem de divisões (valor ÷ parcelas) e
// comparar float com igualdade exata acusaria diferença onde não há.
const FOLGA = 0.015;

export const SITUACOES = ['ok', 'revisao', 'divergencia', 'critico'];
const pior = (a, b) => (SITUACOES.indexOf(a) >= SITUACOES.indexOf(b) ? a : b);

// Os serviços que o contrato realmente contratou e que DEVEM virar card.
// `semFicha` existe para a tradução: ela entra no contrato e é cobrada, mas
// não abre processo na Documentação.
export function servicosQueViramCard(contrato) {
  if (Array.isArray(contrato.servicos) && contrato.servicos.length) {
    return contrato.servicos.filter((s) => s && s.nome && !s.semFicha)
      .map((s) => ({ nome: s.nome, dependentes: Math.max(0, Number(s.dependentes) || 0) }));
  }
  return contrato.servico ? [{ nome: contrato.servico, dependentes: Math.max(0, Number(contrato.dependentes) || 0) }] : [];
}

function verificacao(chave, titulo, situacao, { esperado = null, encontrado = null, detalhe = '', acao = '' } = {}) {
  return { chave, titulo, situacao, esperado, encontrado, detalhe, acao };
}

export function conciliar(blocos = {}) {
  const contratos  = Array.isArray(blocos.contratos) ? blocos.contratos : [];
  const clientes   = Array.isArray(blocos.clientes) ? blocos.clientes : [];
  const contas     = Array.isArray(blocos.contas) ? blocos.contas : [];
  const processos  = Array.isArray(blocos.processos) ? blocos.processos : [];
  const checklists = Array.isArray(blocos.checklists) ? blocos.checklists : [];

  const fichaAtiva = (p) => p && p.situacao !== 'cancelado' && p.situacao !== 'pausado';

  // Índices montados uma vez. Com 250 contratos e 3.800 lançamentos, procurar
  // dentro do laço vira varredura quadrática e a tela trava.
  const contasPorContrato = new Map();
  for (const c of contas) {
    const k = c && c.contratoId ? String(c.contratoId) : '(sem contrato)';
    if (!contasPorContrato.has(k)) contasPorContrato.set(k, []);
    contasPorContrato.get(k).push(c);
  }
  const fichasPorContrato = new Map();
  for (const p of processos) {
    if (!p || !p.contratoId) continue;
    const k = String(p.contratoId);
    if (!fichasPorContrato.has(k)) fichasPorContrato.set(k, []);
    fichasPorContrato.get(k).push(p);
  }
  const clientesPorNome = new Map();
  for (const cl of clientes) {
    const k = semAcento(cl && cl.nome);
    if (!k) continue;
    if (!clientesPorNome.has(k)) clientesPorNome.set(k, []);
    clientesPorNome.get(k).push(cl);
  }
  const modeloDoServico = new Map(checklists.filter((m) => m && m.servico).map((m) => [semAcento(m.servico), m]));
  const idsDeContrato = new Set(contratos.map((c) => c && c.id).filter(Boolean));

  const linhas = [];
  for (const c of contratos) {
    if (!c || !c.id) continue;
    const vs = [];
    const assinado = c.etapa === 'Assinado';
    const cancelado = c.etapa === 'Cancelado';
    const servicos = servicosQueViramCard(c);
    const minhasContas = contasPorContrato.get(String(c.id)) || [];
    const minhasFichas = (fichasPorContrato.get(String(c.id)) || []).filter(fichaAtiva);

    // ---- A. Contrato -----------------------------------------------------
    vs.push(verificacao('contrato.etapa', 'Situação do contrato', 'ok',
      { encontrado: c.etapa || '(sem etapa)' }));

    if (assinado && !c.dataAssinatura) {
      vs.push(verificacao('contrato.dataAssinatura', 'Data de assinatura', 'divergencia',
        { esperado: 'uma data', encontrado: 'vazio',
          detalhe: 'Marcado como assinado sem data. A automação usa essa data para decidir o que reconciliar, então este contrato fica fora da rede de segurança.',
          acao: 'Preencher a data de assinatura no contrato.' }));
    }
    if (assinado && !(Number(c.valor) > 0)) {
      vs.push(verificacao('contrato.valor', 'Valor do contrato', 'critico',
        { esperado: 'maior que zero', encontrado: dinheiro(c.valor),
          detalhe: 'Contrato assinado com valor zerado: o financeiro não tem do que partir.',
          acao: 'Conferir o valor negociado e corrigir no contrato.' }));
    }
    if (assinado && !servicos.length) {
      vs.push(verificacao('contrato.servicos', 'Serviços contratados', 'critico',
        { esperado: 'ao menos um serviço', encontrado: 'nenhum',
          detalhe: 'Sem serviço no contrato, a Documentação não tem card para abrir.',
          acao: 'Informar o serviço contratado.' }));
    } else if (servicos.length) {
      const repetido = servicos.map((s) => semAcento(s.nome)).filter((n, i, a) => a.indexOf(n) !== i);
      vs.push(repetido.length
        ? verificacao('contrato.servicos', 'Serviços contratados', 'divergencia',
          { esperado: 'serviços distintos', encontrado: servicos.map((s) => s.nome).join(' + '),
            detalhe: 'O mesmo serviço aparece duas vezes na lista do contrato — isso faz a Documentação abrir dois cards iguais.',
            acao: 'Remover a repetição na lista de serviços do contrato.' })
        : verificacao('contrato.servicos', 'Serviços contratados', 'ok',
          { encontrado: servicos.map((s) => s.nome).join(' + ') }));
    }

    // ---- B. Cliente ------------------------------------------------------
    const mesmosNome = clientesPorNome.get(semAcento(c.cliente)) || [];
    if (assinado && !mesmosNome.length) {
      vs.push(verificacao('cliente.cadastro', 'Cliente cadastrado', 'critico',
        { esperado: '1 cliente', encontrado: 'nenhum',
          detalhe: 'Contrato assinado sem cliente na base. Ele não aparece em Clientes nem nas buscas.',
          acao: 'Criar o cadastro do cliente a partir do contrato.' }));
    } else if (mesmosNome.length > 1) {
      vs.push(verificacao('cliente.cadastro', 'Cliente cadastrado', 'divergencia',
        { esperado: '1 cliente', encontrado: mesmosNome.length + ' cadastros com o mesmo nome',
          detalhe: 'Mais de um cadastro para a mesma pessoa: o histórico fica partido entre eles.',
          acao: 'Revisar e unificar os cadastros — precisa de gente olhando, porque pode ser homônimo.' }));
    } else if (mesmosNome.length === 1) {
      const cl = mesmosNome[0];
      const ligado = Array.isArray(cl.contratoIds) && cl.contratoIds.includes(c.id);
      vs.push(ligado
        ? verificacao('cliente.vinculo', 'Contrato ligado ao cliente', 'ok', { encontrado: cl.nome })
        : verificacao('cliente.vinculo', 'Contrato ligado ao cliente', 'divergencia',
          { esperado: 'o contrato na lista do cliente', encontrado: 'não está',
            detalhe: 'O cliente existe, mas este contrato não aparece na ficha dele — a tela de Clientes não mostra este contrato.',
            acao: 'Religar o contrato ao cadastro do cliente.' }));
      const telContrato = soDigitos(c.telefone), telCliente = soDigitos(cl.telefone);
      if (telContrato.length >= 10 && telCliente.length >= 10 && telContrato.slice(-10) !== telCliente.slice(-10)) {
        vs.push(verificacao('cliente.telefone', 'Telefone', 'revisao',
          { esperado: c.telefone, encontrado: cl.telefone,
            detalhe: 'O telefone do contrato e o do cadastro são diferentes.',
            acao: 'Conferir qual é o atual — pode ser só número antigo.' }));
      }
    }

    // ---- C. Financeiro ---------------------------------------------------
    if (assinado) {
      if (!minhasContas.length) {
        vs.push(verificacao('financeiro.existe', 'Financeiro criado', 'critico',
          { esperado: 'entrada e/ou parcelas', encontrado: 'nenhum lançamento',
            detalhe: 'Contrato assinado sem nada no financeiro: ninguém vai cobrar este cliente.',
            acao: 'Gerar os lançamentos a partir do contrato.' }));
      } else {
        const soma = dinheiro(minhasContas.reduce((a, x) => a + (Number(x.valor) || 0), 0));
        const dif = dinheiro(soma - dinheiro(c.valor));
        vs.push(Math.abs(dif) <= FOLGA
          ? verificacao('financeiro.valor', 'Soma do financeiro', 'ok',
            { esperado: dinheiro(c.valor), encontrado: soma })
          : verificacao('financeiro.valor', 'Soma do financeiro', 'critico',
            { esperado: dinheiro(c.valor), encontrado: soma,
              detalhe: `O financeiro soma ${dif > 0 ? 'US$ ' + dif + ' a MAIS' : 'US$ ' + Math.abs(dif) + ' a MENOS'} que o contrato.`
                + (dif > 0 ? ' Cobrar a mais é o erro que o cliente percebe primeiro.' : ''),
              acao: 'Conferir parcelas e entrada contra o valor negociado. Não alterar valor sem documento que sustente.' }));

        const parcelas = minhasContas.filter((x) => !ENTRADA.test(String(x.descricao || '')));
        const entradas = minhasContas.length - parcelas.length;
        const esperadas = Math.max(0, Number(c.numParcelas) || 0);
        if (parcelas.length !== esperadas) {
          vs.push(verificacao('financeiro.parcelas', 'Quantidade de parcelas', 'divergencia',
            { esperado: esperadas, encontrado: parcelas.length,
              detalhe: 'O contrato combina um número de parcelas e o financeiro tem outro.',
              acao: 'Conferir se houve renegociação não registrada no contrato.' }));
        }
        if ((Number(c.entrada) > 0) !== (entradas > 0)) {
          vs.push(verificacao('financeiro.entrada', 'Entrada', 'divergencia',
            { esperado: Number(c.entrada) > 0 ? 'US$ ' + dinheiro(c.entrada) : 'sem entrada',
              encontrado: entradas > 0 ? entradas + ' lançamento(s) de entrada' : 'nenhum',
              detalhe: 'A entrada do contrato e o que está lançado não combinam.',
              acao: 'Conferir o recebimento da entrada.' }));
        }

        // Pagamento registrado errado. Cada um destes é dinheiro mal contado.
        const problemas = [];
        for (const x of minhasContas) {
          const val = dinheiro(x.valor), rec = dinheiro(x.valorRecebido);
          if (rec > val + FOLGA) problemas.push(`${x.descricao}: recebido US$ ${rec} numa parcela de US$ ${val}`);
          else if (x.status === 'Pago' && rec <= 0 && val > 0) problemas.push(`${x.descricao}: marcada Paga sem valor recebido`);
          else if (x.status === 'Pago' && !x.dataRecebimento) problemas.push(`${x.descricao}: marcada Paga sem data`);
        }
        vs.push(problemas.length
          ? verificacao('financeiro.pagamentos', 'Pagamentos registrados', 'critico',
            { esperado: 'recebido nunca maior que a parcela', encontrado: problemas.length + ' lançamento(s)',
              detalhe: problemas.slice(0, 4).join(' · '),
              acao: 'Conferir os comprovantes antes de mexer. Não corrigir valor sem fonte.' })
          : verificacao('financeiro.pagamentos', 'Pagamentos registrados', 'ok',
            { encontrado: minhasContas.length + ' lançamento(s)' }));

        // Duplicidade de cobrança: mesma descrição e mesmo vencimento.
        const chaves = new Map();
        for (const x of minhasContas) {
          const k = semAcento(x.descricao) + '|' + String(x.vencimento || '');
          chaves.set(k, (chaves.get(k) || 0) + 1);
        }
        const repetidas = [...chaves.entries()].filter(([, n]) => n > 1);
        if (repetidas.length) {
          vs.push(verificacao('financeiro.duplicado', 'Cobrança duplicada', 'critico',
            { esperado: 'nenhuma repetida', encontrado: repetidas.length + ' repetição(ões)',
              detalhe: repetidas.slice(0, 3).map(([k, n]) => `${k.split('|')[0]} ×${n}`).join(' · '),
              acao: 'Conferir se foi lançamento duplo ou parcelas de mesmo nome. Nunca apagar sem olhar.' }));
        }
      }
    }

    // ---- D. Serviços e documentação --------------------------------------
    if (assinado && servicos.length) {
      const porServico = new Map();
      for (const f of minhasFichas) {
        const k = semAcento(f.servico);
        if (!porServico.has(k)) porServico.set(k, []);
        porServico.get(k).push(f);
      }
      for (const sv of servicos) {
        const k = semAcento(sv.nome);
        const achadas = porServico.get(k) || [];
        if (!achadas.length) {
          vs.push(verificacao('doc.card:' + sv.nome, `Card de "${sv.nome}"`, 'divergencia',
            { esperado: '1 card', encontrado: 'nenhum',
              detalhe: 'O serviço foi contratado e não tem processo aberto na Documentação.',
              acao: 'Abrir o card deste serviço, com o checklist dele.' }));
        } else if (achadas.length > 1) {
          vs.push(verificacao('doc.card:' + sv.nome, `Card de "${sv.nome}"`, 'critico',
            { esperado: '1 card', encontrado: achadas.length + ' cards',
              detalhe: 'O mesmo serviço do mesmo contrato tem mais de um card: o trabalho se divide entre eles e ninguém sabe qual vale.',
              acao: 'Juntar os cards — o que tem anexo fica.' }));
        } else {
          const f = achadas[0];
          const modelo = modeloDoServico.get(k);
          const docsModelo = modelo ? (modelo.documentos || []).length : 0;
          const docsFicha = (f.checklist || []).length;
          if (modelo && docsModelo > 0 && docsFicha === 0) {
            vs.push(verificacao('doc.checklist:' + sv.nome, `Checklist de "${sv.nome}"`, 'divergencia',
              { esperado: docsModelo + ' documento(s)', encontrado: 'vazio',
                detalhe: 'Existe modelo de checklist para este serviço, mas o card nasceu sem nenhum documento.',
                acao: 'Aplicar o checklist do serviço ao card.' }));
          } else if (!modelo) {
            vs.push(verificacao('doc.checklist:' + sv.nome, `Checklist de "${sv.nome}"`, 'revisao',
              { esperado: 'um modelo cadastrado', encontrado: 'não existe',
                detalhe: 'Não há checklist cadastrado para este serviço, então o card não tem o que cobrar.',
                acao: 'Cadastrar o checklist em Configurações, ou confirmar que este serviço não usa.' }));
          } else {
            vs.push(verificacao('doc.card:' + sv.nome, `Card de "${sv.nome}"`, 'ok',
              { encontrado: `${f.status || 'sem etapa'} · ${docsFicha} documento(s)` }));
          }
          if (!f.responsavel) {
            vs.push(verificacao('doc.responsavel:' + sv.nome, `Responsável por "${sv.nome}"`, 'revisao',
              { esperado: 'alguém da equipe', encontrado: 'ninguém',
                detalhe: 'Card sem responsável não aparece na fila de ninguém.',
                acao: 'Definir o responsável no card.' }));
          }
        }
      }
      // Card de serviço que não está no contrato.
      const esperadosK = new Set(servicos.map((s) => semAcento(s.nome)));
      for (const f of minhasFichas) {
        if (esperadosK.has(semAcento(f.servico))) continue;
        vs.push(verificacao('doc.sobrando', `Card de "${f.servico || 'sem serviço'}" sem serviço no contrato`, 'revisao',
          { esperado: servicos.map((s) => s.nome).join(' + '), encontrado: f.servico || '(vazio)',
            detalhe: 'Existe card de um serviço que o contrato não lista. Costuma ser sobra de separação ou serviço acertado por fora.',
            acao: 'Decidir: incluir o serviço no contrato, ou cancelar o card.' }));
      }
    }

    // ---- E. Cancelamento -------------------------------------------------
    if (cancelado) {
      const vivas = minhasContas.filter((x) => x.status !== 'Pago' && x.status !== 'Cancelado');
      vs.push(vivas.length
        ? verificacao('cancelado.parcelas', 'Parcelas após o cancelamento', 'critico',
          { esperado: 'nenhuma em aberto', encontrado: vivas.length + ' em aberto',
            detalhe: `US$ ${dinheiro(vivas.reduce((a, x) => a + (Number(x.valor) || 0), 0))} ainda a vencer num contrato cancelado — o cliente pode ser cobrado.`,
            acao: 'Cancelar as parcelas a vencer. O que já foi pago fica, é histórico.' })
        : verificacao('cancelado.parcelas', 'Parcelas após o cancelamento', 'ok',
          { encontrado: 'nenhuma em aberto' }));
      vs.push(minhasFichas.length
        ? verificacao('cancelado.cards', 'Cards após o cancelamento', 'divergencia',
          { esperado: 'nenhum ativo', encontrado: minhasFichas.length + ' ativo(s)',
            detalhe: 'Card ativo de contrato cancelado continua no quadro e na fila de alguém.',
            acao: 'Cancelar os cards — cancelar não apaga, e dá para reativar.' })
        : verificacao('cancelado.cards', 'Cards após o cancelamento', 'ok',
          { encontrado: 'nenhum ativo' }));
    }

    const situacao = vs.reduce((a, v) => pior(a, v.situacao), 'ok');
    linhas.push({
      id: c.id, cliente: c.cliente || '(sem nome)', etapa: c.etapa || '',
      valor: dinheiro(c.valor), vendedor: c.vendedor || '',
      dataAssinatura: c.dataAssinatura || null,
      servicos: servicos.map((s) => s.nome),
      situacao, verificacoes: vs,
      problemas: vs.filter((v) => v.situacao !== 'ok').length,
    });
  }

  // ---- Integridade dos blocos -------------------------------------------
  // ID REPETIDO é o pior defeito possível aqui. A mescla do servidor casa os
  // registros por id: dois com o mesmo id e um apaga o outro em silêncio, sem
  // erro, sem aviso. Não existe chave primária no JSON para impedir.
  function idsRepetidos(lista, rotulo) {
    const vistos = new Map();
    for (const x of lista) {
      if (!x || !x.id) continue;
      const k = String(x.id);
      vistos.set(k, (vistos.get(k) || 0) + 1);
    }
    return [...vistos.entries()].filter(([, n]) => n > 1)
      .map(([id, n]) => ({ bloco: rotulo, id, quantos: n }));
  }
  function semId(lista, rotulo) {
    // Registro sem id nunca é encontrado pela mescla: ele é sempre tratado
    // como novo, e some ou duplica dependendo de quem gravou por último.
    return lista.filter(x => x && !x.id).length ? [{ bloco: rotulo, quantos: lista.filter(x => x && !x.id).length }] : [];
  }
  const repetidos = [
    ...idsRepetidos(contratos, 'contratos'), ...idsRepetidos(clientes, 'clientes'),
    ...idsRepetidos(contas, 'financeiro'), ...idsRepetidos(processos, 'documentação'),
  ];
  const semIdentificador = [
    ...semId(contratos, 'contratos'), ...semId(clientes, 'clientes'),
    ...semId(contas, 'financeiro'), ...semId(processos, 'documentação'),
  ];

  // ---- Fora do laço: o que não pertence a contrato nenhum ----------------
  const parcelasSemContrato = contas.filter((x) => x && x.contratoId && !idsDeContrato.has(x.contratoId));
  const parcelasAvulsas = contasPorContrato.get('(sem contrato)') || [];
  const fichasSemContrato = processos.filter((p) => fichaAtiva(p) && !p.contratoId);
  const fichasDeContratoSumido = processos.filter((p) => fichaAtiva(p) && p.contratoId && !idsDeContrato.has(p.contratoId));
  const clientesDuplicados = [...clientesPorNome.entries()].filter(([, l]) => l.length > 1)
    .map(([nome, l]) => ({ nome: l[0].nome, quantos: l.length, chave: nome }));

  const conta = (f) => linhas.filter(f).length;
  const temProblema = (l, prefixo) => l.verificacoes.some((v) => v.situacao !== 'ok' && v.chave.startsWith(prefixo));

  return {
    geradoEm: new Date().toISOString(),
    resumo: {
      // Os três primeiros são EXCLUSIVOS e somam `auditados`. Painel cujo
      // número não fecha é painel em que ninguém confia.
      auditados: linhas.length,
      conciliados: conta((l) => l.situacao === 'ok'),
      comDivergencia: conta((l) => l.situacao === 'divergencia' || l.situacao === 'critico'),
      financeiroDivergente: conta((l) => temProblema(l, 'financeiro.')),
      documentacaoPendente: conta((l) => l.verificacoes.some((v) => v.situacao !== 'ok' && v.chave.startsWith('doc.card'))),
      cardsDuplicados: linhas.reduce((a, l) => a + l.verificacoes.filter((v) => v.chave.startsWith('doc.card') && v.situacao === 'critico').length, 0),
      clientesInconsistentes: conta((l) => temProblema(l, 'cliente.')),
      falhasCriticas: conta((l) => l.situacao === 'critico'),
      aguardandoRevisao: conta((l) => l.situacao === 'revisao'),
      parcelasSemContrato: parcelasSemContrato.length,
      parcelasAvulsas: parcelasAvulsas.length,
      fichasSemContrato: fichasSemContrato.length,
      fichasDeContratoSumido: fichasDeContratoSumido.length,
      clientesDuplicados: clientesDuplicados.length,
      idsRepetidos: repetidos.length,
      registrosSemId: semIdentificador.reduce((a, x) => a + x.quantos, 0),
    },
    contratos: linhas,
    soltos: {
      parcelasSemContrato: parcelasSemContrato.slice(0, 200).map((x) => ({ id: x.id, cliente: x.clienteNome, descricao: x.descricao, valor: dinheiro(x.valor), contratoId: x.contratoId })),
      parcelasAvulsas: parcelasAvulsas.slice(0, 200).map((x) => ({ id: x.id, cliente: x.clienteNome, descricao: x.descricao, valor: dinheiro(x.valor) })),
      fichasSemContrato: fichasSemContrato.slice(0, 200).map((p) => ({ id: p.id, cliente: p.clienteNome, servico: p.servico, anexos: (p.anexos || []).length })),
      fichasDeContratoSumido: fichasDeContratoSumido.slice(0, 200).map((p) => ({ id: p.id, cliente: p.clienteNome, servico: p.servico, contratoId: p.contratoId })),
      clientesDuplicados: clientesDuplicados.slice(0, 200),
      idsRepetidos: repetidos.slice(0, 200),
      registrosSemId: semIdentificador,
    },
  };
}
