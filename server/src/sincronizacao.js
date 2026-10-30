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

// O BLING SAIU em 30/10/2026, a pedido dela: "não vamos mais usar". Com ele
// foram embora `planoDoBling` e `divergenciasDoBling`. O que ficou é do
// Trello.
//
// O `blingId` continua descrito lá em cima de propósito: ele ainda está
// gravado em milhares de parcelas e é o que explica, hoje, como cada baixa
// de outubro foi casada. Apagar a explicação não apagaria o dado — só
// deixaria a próxima pessoa sem entender de onde ele veio.

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
