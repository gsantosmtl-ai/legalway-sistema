// As rotas de sincronização com o Bling e o Trello.
//
// Por que existem: as importações antigas eram scripts avulsos rodados contra
// arquivos exportados à mão. Entre uma e outra o sistema simplesmente ficava
// para trás — em 26/10 eram quatro pedidos de venda e um contrato de F1 que
// existiam no Bling e não aqui, e ninguém tinha como saber sem conferir a dedo.
//
// O DESENHO, que é o mesmo dos dois lados:
//
//   1. PRÉVIA sempre, e separada do aplicar. Nenhuma rota que busca na
//      internet grava na mesma chamada.
//   2. Idempotência por identificador EXTERNO (sincronizacao.js). Rodar duas
//      vezes dá o mesmo resultado que rodar uma.
//   3. Auditoria em toda aplicação, com quem, quando e quanto.
//   4. No Trello, a FOTO dos cards antes e depois. Se qualquer card mudou de
//      etapa, posição ou responsável, a resposta diz — é a regra que ela
//      chamou de crítica.
//
// As credenciais ficam no Railway e nunca passam por aqui em texto.

import { Router } from 'express';
import { ler, gravar } from './armazenamento.js';
import { exigirLogin } from './auth.js';
import { query } from './db.js';
import { planoDoBling, planoDoTrello, divergenciasDoBling, fotoDosCards, compararFotos } from './sincronizacao.js';
import { salvarDataUri } from './arquivos.js';

export const rotasSinc = Router();

const K = {
  clientes: 'legalway-clientes-v1',
  contratos: 'legalway-contratos-v1',
  financeiro: 'legalway-financeiro-v1',
  processos: 'legalway-processos-documentacao-v1',
  bling: 'legalway-bling-oauth-v1',
};
const QUEM = 'sincronização';
const agora = () => new Date().toISOString();
const uid = (p) => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const bloco = async (chave, padrao = []) => {
  const r = await ler(chave);
  return { valor: r && r.valor !== undefined ? r.valor : padrao, versao: r ? r.versao : null };
};

const cfgBling = () => ({ id: process.env.BLING_CLIENT_ID || '', secret: process.env.BLING_CLIENT_SECRET || '' });
const cfgTrello = () => ({ key: process.env.TRELLO_API_KEY || '', token: process.env.TRELLO_TOKEN || '' });

rotasSinc.get('/sinc/estado', exigirLogin, async (req, res) => {
  const b = cfgBling(), t = cfgTrello();
  const { valor } = await bloco(K.bling, {});
  res.json({
    bling: { configurado: !!(b.id && b.secret), autorizado: !!(valor && valor.refreshToken),
      // Para a tela poder mostrar exatamente o que cadastrar no Bling. Sem
      // isso, descobrir o endereço certo era adivinhação.
      urlDeRetorno: uriDeVolta(req), fixada: !!process.env.BLING_REDIRECT_URI,
      // Nunca o segredo: só se existe.
      falta: !b.id ? 'BLING_CLIENT_ID' : !b.secret ? 'BLING_CLIENT_SECRET'
        : !(valor && valor.refreshToken) ? 'autorizar uma vez em /api/sinc/bling/autorizar' : null },
    trello: { configurado: !!(t.key && t.token),
      falta: !t.key ? 'TRELLO_API_KEY' : !t.token ? 'TRELLO_TOKEN' : null },
  });
});

// ---------------------------------------------------------------- Bling
// A API v3 do Bling é OAuth2. O refresh token fica guardado no armazenamento,
// e o access token é pedido na hora — ele dura pouco e não vale a pena guardar.
// A URL para onde o Bling devolve a pessoa depois de aprovar.
//
// O OAuth exige que ela seja IDÊNTICA em três lugares: no pedido de
// autorização, na troca do código, e no cadastro do aplicativo dentro do
// Bling. Qualquer diferença — http em vez de https, um host diferente, uma
// barra sobrando — e o Bling recusa com `redirect_uri_mismatch`, que foi
// exatamente o que aconteceu em 29/10/2026.
//
// Era montada a partir do endereço que o navegador usou. Isso quer dizer que
// abrir pelo domínio próprio dava uma URL, e abrir pelo endereço da Railway
// dava outra — e só uma das duas podia estar cadastrada no Bling. Agora o
// endereço pode ser FIXADO numa variável, e aí não depende de por onde a
// pessoa entrou.
function uriDeVolta(req) {
  const fixa = String(process.env.BLING_REDIRECT_URI || '').trim();
  if (fixa) return fixa.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}/api/sinc/bling/retorno`;
}

function urlDeAutorizacao(req) {
  const { id } = cfgBling();
  const volta = uriDeVolta(req);
  return `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${
    encodeURIComponent(id)}&state=lw&redirect_uri=${encodeURIComponent(volta)}`;
}

rotasSinc.get('/sinc/bling/autorizar', exigirLogin, (req, res) => {
  const { id, secret } = cfgBling();
  if (!id || !secret) return res.status(400).json({ erro: 'Bling não configurado no servidor.' });
  res.redirect(urlDeAutorizacao(req));
});

rotasSinc.get('/sinc/bling/retorno', exigirLogin, async (req, res, next) => {
  try {
    const code = String(req.query.code || '');
    if (!code) return res.status(400).send('Sem código de autorização.');
    const t = await trocarCodigo(code, req);
    const { versao } = await bloco(K.bling, {});
    await gravar(K.bling, { refreshToken: t.refresh_token, autorizadoEm: agora(), por: req.usuario.nome },
      versao, QUEM, undefined, 'sincronização');
    res.send('Bling autorizado. Pode fechar esta aba.');
  } catch (e) { next(e); }
});

async function trocarCodigo(code, req) {
  const { id, secret } = cfgBling();
  // A MESMA de cima, obrigatoriamente: o Bling compara as duas.
  const volta = uriDeVolta(req);
  const r = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: volta }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.refresh_token) throw new Error('Bling recusou a autorização: ' + (j.error_description || r.status));
  return j;
}

async function tokenDoBling() {
  const { id, secret } = cfgBling();
  if (!id || !secret) throw new Error('Bling não configurado (BLING_CLIENT_ID / BLING_CLIENT_SECRET).');
  const { valor } = await bloco(K.bling, {});
  if (!valor || !valor.refreshToken) throw new Error('Bling ainda não foi autorizado uma primeira vez.');
  const r = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: valor.refreshToken }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Bling recusou o refresh: ' + (j.error_description || r.status));
  // O Bling roda o refresh token a cada uso: guardar o novo é o que impede a
  // integração de parar sozinha na próxima vez.
  if (j.refresh_token && j.refresh_token !== valor.refreshToken) {
    const { versao } = await bloco(K.bling, {});
    await gravar(K.bling, { ...valor, refreshToken: j.refresh_token, renovadoEm: agora() },
      versao, QUEM, undefined, 'sincronização');
  }
  return j.access_token;
}

async function doBling(caminho, token) {
  const r = await fetch('https://www.bling.com.br/Api/v3' + caminho, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`Bling respondeu ${r.status} em ${caminho}`);
  const j = await r.json();
  return j.data || [];
}

/** Busca pedidos e contas a receber a partir de uma data. */
// Exportada para que a conferência possa ser rodada fora da tela — por uma
// ferramenta, por um cron, por quem estiver consertando às pressas. A tela
// continua sendo o caminho normal; isto é a mesma leitura, sem a tela.
export async function buscarBling(desde) {
  const token = await tokenDoBling();
  const pedidos = [];
  for (let pag = 1; pag <= 20; pag++) {
    const d = await doBling(`/pedidos/vendas?pagina=${pag}&limite=100&dataInicial=${desde}`, token);
    if (!d.length) break;
    pedidos.push(...d);
  }
  const contas = [];
  for (let pag = 1; pag <= 40; pag++) {
    const d = await doBling(`/contas/receber?pagina=${pag}&limite=100&dataEmissaoInicial=${desde}`, token);
    if (!d.length) break;
    contas.push(...d);
  }
  return {
    pedidos: pedidos.map((p) => ({ numero: String(p.numero), idPedido: String(p.id),
      cliente: (p.contato || {}).nome || '', email: (p.contato || {}).email || '',
      idContato: String((p.contato || {}).id || ''),
      servico: (p.itens || []).map((i) => i.descricao).filter(Boolean).join(' + '),
      valor: p.total, data: p.data })),
    // `idOrigem` da conta é o id do PEDIDO — é esse o elo entre os dois.
    contas: contas.map((c) => ({ pedido: '', idOrigem: String((c.vinculo || {}).id || c.idOrigem || ''),
      blingId: String(c.id), vencimento: c.vencimento, valor: c.valor,
      taxa: 0, liquido: c.valor, pago: c.valorPago || 0,
      situacao: c.situacao === 1 ? 'aberto' : 'pago', forma: (c.formaPagamento || {}).descricao || '' })),
  };
}

rotasSinc.get('/sinc/bling/previa', exigirLogin, async (req, res, next) => {
  try {
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || '')) ? String(req.query.desde)
      : new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    const bruto = await buscarBling(desde);
    const porPedido = new Map(bruto.pedidos.map((p) => [p.idPedido, p.numero]));
    const contas = bruto.contas.map((c) => ({ ...c, pedido: porPedido.get(c.idOrigem) || '' })).filter((c) => c.pedido);
    const [ct, cl, fin] = await Promise.all([bloco(K.contratos), bloco(K.clientes), bloco(K.financeiro)]);
    res.json({ desde, ...planoDoBling({ pedidos: bruto.pedidos, contas,
      contratos: ct.valor, clientes: cl.valor, financeiro: fin.valor }) });
  } catch (e) { next(e); }
});

/**
 * O que MUDOU no Bling depois que o registro já entrou aqui.
 *
 * A prévia de importação só enxerga o que é inédito. Esta rota é a outra
 * metade: pagamento registrado lá, contrato cancelado lá, vencimento
 * remarcado. Sem ela a sincronização fica em dia só para quem é novo, e o
 * sistema segue cobrando quem já pagou.
 *
 * Não grava nada. Devolve dois baldes — o que o Bling sabe e aqui falta
 * (aplicável) e o que os dois lados afirmam diferente (revisar).
 */
rotasSinc.get('/sinc/bling/divergencias', exigirLogin, async (req, res, next) => {
  try {
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || '')) ? String(req.query.desde)
      : new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
    const bruto = await buscarBling(desde);
    const porPedido = new Map(bruto.pedidos.map((p) => [p.idPedido, p.numero]));
    const contas = bruto.contas.map((c) => ({ ...c, pedido: porPedido.get(c.idOrigem) || '' })).filter((c) => c.pedido);
    const [ct, fin] = await Promise.all([bloco(K.contratos), bloco(K.financeiro)]);
    const d = divergenciasDoBling({ pedidos: bruto.pedidos, contas,
      contratos: ct.valor, financeiro: fin.valor });
    res.json({ desde, resumo: d.resumo,
      aplicavel: d.aplicavel.slice(0, 200), revisar: d.revisar.slice(0, 200) });
  } catch (e) { next(e); }
});

rotasSinc.post('/sinc/bling/aplicar', exigirLogin, async (req, res, next) => {
  try {
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.desde || '')) ? String(req.body.desde)
      : new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    const bruto = await buscarBling(desde);
    const porPedido = new Map(bruto.pedidos.map((p) => [p.idPedido, p.numero]));
    const contas = bruto.contas.map((c) => ({ ...c, pedido: porPedido.get(c.idOrigem) || '' })).filter((c) => c.pedido);
    const [ct, cl, fin] = await Promise.all([bloco(K.contratos), bloco(K.clientes), bloco(K.financeiro)]);
    // O plano é refeito AGORA, com o que está no banco neste instante — nunca
    // se aplica o que a prévia viu minutos atrás.
    const plano = planoDoBling({ pedidos: bruto.pedidos, contas,
      contratos: ct.valor, clientes: cl.valor, financeiro: fin.valor });
    if (!plano.contratos.length) return res.json({ ok: true, nadaAFazer: true, ...plano.resumo });

    const contratos = [...ct.valor], clientes = [...cl.valor], financeiro = [...fin.valor];
    const idPorPedido = new Map();
    for (const c of plano.contratos) {
      const id = uid('cbl');
      idPorPedido.set(c.pedidoBling, id);
      contratos.push({ id, cliente: c.cliente, email: c.email, telefone: '', etapa: 'Assinado',
        valor: c.valor, entrada: c.entrada, servico: c.servico, numParcelas: c.numParcelas,
        vendedor: '', observacoes: '', pedidoBling: c.pedidoBling, dataAssinatura: c.dataAssinatura,
        criadoEm: agora(),
        bling: { numero: Number(c.pedidoBling), pedidoId: c.idPedido, idContato: c.idContato,
          total: c.valor, somaParcelas: c.somaParcelas, lidoEm: agora() },
        historico: [{ quando: agora(), texto: `Importado do Bling — pedido ${c.pedidoBling}` }] });
    }
    for (const p of plano.parcelas) {
      const [a, b, d] = String(p.vencimento).split('/');
      financeiro.push({ id: uid('crbl'), contratoId: idPorPedido.get(p.pedidoBling),
        clienteNome: p.cliente, servico: p.servico, descricao: '', vendedor: '',
        valor: p.valor, vencimento: d ? `${d}-${b}-${a}` : p.vencimento,
        status: p.situacao === 'pago' ? 'Pago' : 'A vencer',
        valorRecebido: p.pago || 0, dataRecebimento: p.situacao === 'pago' ? (d ? `${d}-${b}-${a}` : null) : null,
        formaPagamento: p.forma, blingId: p.blingId, origemBling: 'titulo',
        bruto: p.valor, taxa: p.taxa, liquido: p.liquido,
        observacao: `Ref. ao pedido de venda nº ${p.pedidoBling}`, criadoEm: agora() });
    }
    for (const c of plano.clientesNovos) {
      const pedido = plano.contratos.find((x) => x.cliente === c.nome);
      clientes.push({ id: uid('clbl'), nome: c.nome, email: c.email, telefone: '', endereco: '',
        criadoEm: agora(), blingId: c.idContato,
        contratoIds: pedido ? [idPorPedido.get(pedido.pedidoBling)] : [],
        historico: [{ quando: agora(), texto: 'Importado do Bling' }] });
    }
    for (const c of plano.clientesLigados) {
      const alvo = clientes.find((x) => x && x.id === c.id);
      if (alvo) alvo.contratoIds = [...new Set([...(alvo.contratoIds || []), idPorPedido.get(c.pedido)])];
    }

    await gravar(K.clientes, clientes, cl.versao, QUEM, undefined, 'sincronização');
    await gravar(K.contratos, contratos, ct.versao, QUEM, undefined, 'sincronização');
    await gravar(K.financeiro, financeiro, fin.versao, QUEM, undefined, 'sincronização');
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, K.contratos, 'bling', 'sincronização',
       `Bling: ${plano.resumo.contratos} contrato(s), ${plano.resumo.parcelas} parcela(s), US$ ${plano.resumo.dinheiro}`]).catch(() => {});
    res.json({ ok: true, ...plano.resumo, pedidos: plano.contratos.map((c) => c.pedidoBling) });
  } catch (e) { next(e); }
});

/**
 * Aplica SÓ o balde "aplicável" das divergências.
 *
 * A rota `/sinc/bling/aplicar` acima só enxerga o que é INÉDITO: contrato e
 * parcela que ainda não existem aqui. O que mudou depois de entrar — uma
 * parcela que foi paga no Bling, um contrato cancelado lá, um vencimento
 * remarcado — não chegava por caminho nenhum, e o sistema seguia cobrando
 * quem já tinha pagado. Era disto que ela falava: "pagou no Bling e no LIV não
 * está atualizado."
 *
 * O balde "revisar" NUNCA entra aqui. Lá estão os casos em que os dois lados
 * afirmam coisas diferentes — pago aqui e aberto lá, valores que não batem —
 * e escolher sozinho seria apagar o trabalho de alguém. Dinheiro confirmado
 * não se sobrescreve sem gente olhando.
 *
 * Nada é apagado e nenhum valor pago é reduzido. As três mudanças possíveis
 * são: marcar parcela como paga, cancelar contrato que foi cancelado no Bling,
 * e remarcar vencimento de parcela que ainda está EM ABERTO.
 *
 * As divergências são recalculadas AGORA, com o que está no banco neste
 * instante: nunca se aplica o que a tela viu minutos atrás.
 */
rotasSinc.post('/sinc/bling/aplicar-divergencias', exigirLogin, async (req, res, next) => {
  try {
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.desde || '')) ? String(req.body.desde)
      : new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
    // Quais aplicar. Sem lista, aplica todas as aplicáveis.
    const sos = Array.isArray(req.body?.so) ? new Set(req.body.so.map(String)) : null;
    const bruto = await buscarBling(desde);
    const porPedido = new Map(bruto.pedidos.map((p) => [p.idPedido, p.numero]));
    const contas = bruto.contas.map((c) => ({ ...c, pedido: porPedido.get(c.idOrigem) || '' })).filter((c) => c.pedido);
    const [ct, fin] = await Promise.all([bloco(K.contratos), bloco(K.financeiro)]);
    const d = divergenciasDoBling({ pedidos: bruto.pedidos, contas,
      contratos: ct.valor, financeiro: fin.valor });

    const vale = (x) => !sos || sos.has(String(x.blingId || x.pedido));
    const aplicar = d.aplicavel.filter(vale);
    if (!aplicar.length) return res.json({ ok: true, nadaAFazer: true, aplicadas: 0 });

    const contratos = [...ct.valor], financeiro = [...fin.valor];
    const porId = new Map(financeiro.map((x) => [x && x.id, x]));
    const feitos = { pagas: 0, cancelados: 0, vencimentos: 0, dinheiro: 0 };

    for (const x of aplicar) {
      if (x.tipo === 'parcela.paga') {
        const f = porId.get(x.parcelaId);
        if (!f || f.status === 'Pago') continue;
        f.status = 'Pago';
        f.valorRecebido = x.pagoNoBling;
        f.dataRecebimento = f.dataRecebimento || new Date().toISOString().slice(0, 10);
        f.observacao = [f.observacao, 'Baixa trazida do Bling'].filter(Boolean).join(' · ');
        feitos.pagas++; feitos.dinheiro += Number(x.pagoNoBling) || 0;
      } else if (x.tipo === 'contrato.cancelado') {
        const c = contratos.find((y) => y && y.id === x.contratoId);
        if (!c || c.etapa === 'Cancelado') continue;
        c.etapa = 'Cancelado';
        c.canceladoEm = agora();
        c.canceladoPor = req.usuario.nome;
        c.canceladoMotivo = 'Cancelado no Bling';
        c.historico = c.historico || [];
        c.historico.push({ quando: agora(), texto: 'Contrato cancelado no Bling — trazido pela sincronização' });
        feitos.cancelados++;
      } else if (x.tipo === 'parcela.vencimento') {
        const f = porId.get(x.parcelaId);
        // Só mexe em parcela EM ABERTO: remarcar o vencimento de algo já pago
        // reescreveria história. Essas vão para o balde "revisar".
        if (!f || f.status === 'Pago' || Number(f.valorRecebido || 0) > 0) continue;
        f.vencimentoAntigo = f.vencimentoAntigo || f.vencimento;
        f.vencimento = x.noBling;
        feitos.vencimentos++;
      }
    }

    if (feitos.cancelados) await gravar(K.contratos, contratos, ct.versao, QUEM, undefined, 'sincronização');
    if (feitos.pagas || feitos.vencimentos) await gravar(K.financeiro, financeiro, fin.versao, QUEM, undefined, 'sincronização');
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, K.financeiro, 'bling-divergencias', 'sincronização',
       `Bling: ${feitos.pagas} baixa(s) US$ ${feitos.dinheiro.toFixed(2)}, ${feitos.cancelados} cancelamento(s), ${feitos.vencimentos} vencimento(s)`]).catch(() => {});
    res.json({ ok: true, aplicadas: feitos.pagas + feitos.cancelados + feitos.vencimentos, ...feitos,
      aindaParaRevisar: d.revisar.length });
  } catch (e) { next(e); }
});

// --------------------------------------------------------------- Trello
async function doTrello(caminho) {
  const { key, token } = cfgTrello();
  if (!key || !token) throw new Error('Trello não configurado (TRELLO_API_KEY / TRELLO_TOKEN).');
  const sep = caminho.includes('?') ? '&' : '?';
  const r = await fetch(`https://api.trello.com/1${caminho}${sep}key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`);
  if (!r.ok) throw new Error(`Trello respondeu ${r.status} em ${caminho}`);
  return r.json();
}

// O nome do cliente dentro do título do cartão. Os títulos seguem padrões do
// escritório ("VISTO T (T VISA) — FULANO"), e o que sobra é o nome.
const PREFIXOS = /^(VISTO T \(T VISA\)|VISTO DE ESTUDANTE F-?1|EXTENS[ÃA]O DE VISTO|RENOVA[ÇC][ÃA]O DE PASSAPORTE BRASILEIRO|MUDAN[ÇC]A DE ENDERE[ÇC]O|WORK PERMIT E SOCIAL|REAGENDAMENTO DE FINGER|DS-?160|PERMIT|MOTION|ASILO|FOIA|EXTENSAO)\s*[-—:]*\s*/i;
const clienteDoTitulo = (t) => String(t || '').replace(PREFIXOS, '').replace(/\s*[-—]\s*(VISTO T|MOTION|ASILO)\s*$/i, '').trim();

async function buscarTrello() {
  const quadros = await doTrello('/members/me/boards?fields=name,closed&filter=all');
  const cards = [];
  for (const b of quadros) {
    const cs = await doTrello(`/boards/${b.id}/cards?fields=name&filter=all&attachments=true&attachment_fields=name,url,bytes,date`);
    for (const c of cs) {
      const anexos = (c.attachments || []).filter((a) => a && a.url && !String(a.url).includes('trello.com/c/'));
      if (!anexos.length) continue;
      cards.push({ idCard: c.id, titulo: c.name, quadro: b.name, cliente: clienteDoTitulo(c.name),
        anexos: anexos.map((a) => ({ id: a.id, nome: a.name, url: a.url, bytes: a.bytes, quando: a.date })) });
    }
  }
  return cards;
}

rotasSinc.get('/sinc/trello/previa', exigirLogin, async (req, res, next) => {
  try {
    const cards = await buscarTrello();
    const { valor: processos } = await bloco(K.processos);
    const plano = planoDoTrello({ cards, processos });
    res.json({ resumo: plano.resumo,
      // A lista completa é grande demais para a tela: vão os primeiros, e o
      // resumo diz o total.
      porFicha: plano.porFicha.slice(0, 60).map((f) => ({ ...f, novos: f.novos.length })),
      semFicha: plano.semFicha.slice(0, 60) });
  } catch (e) { next(e); }
});

rotasSinc.post('/sinc/trello/aplicar', exigirLogin, async (req, res, next) => {
  try {
    const limite = Math.min(500, Math.max(1, Number(req.body?.limite) || 200));
    const cards = await buscarTrello();
    const { valor: processos, versao } = await bloco(K.processos);
    const antes = fotoDosCards(processos);
    const plano = planoDoTrello({ cards, processos });
    if (!plano.resumo.anexosNovos) return res.json({ ok: true, nadaAFazer: true, ...plano.resumo });

    const lista = JSON.parse(JSON.stringify(processos));
    const porId = new Map(lista.map((p) => [p && p.id, p]));
    let baixados = 0, falharam = [];
    for (const f of plano.porFicha) {
      const ficha = porId.get(f.fichaId);
      if (!ficha) continue;
      ficha.anexos = Array.isArray(ficha.anexos) ? ficha.anexos : [];
      for (const a of f.novos) {
        if (baixados >= limite) break;
        try {
          const r = await fetch(a.url, { headers: {
            Authorization: `OAuth oauth_consumer_key="${cfgTrello().key}", oauth_token="${cfgTrello().token}"` } });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const tipo = r.headers.get('content-type') || 'application/octet-stream';
          const b64 = Buffer.from(await r.arrayBuffer()).toString('base64');
          const link = await salvarDataUri(`data:${tipo};base64,${b64}`, a.nome, QUEM);
          ficha.anexos.push({ url: link, nome: a.nome, tipo, tamanho: a.bytes,
            origem: 'Trello', quando: a.quando || agora(), idTrello: a.id, quadro: f.quadro });
          baixados++;
        } catch (e) { falharam.push({ anexo: a.nome, ficha: f.cliente, porque: e.message }); }
      }
      if (baixados >= limite) break;
    }
    if (!baixados) return res.json({ ok: true, nadaAFazer: true, falharam, ...plano.resumo });

    await gravar(K.processos, lista, versao, QUEM, undefined, 'sincronização');
    // A PROVA: a foto depois, lida do que acabou de ser gravado.
    const { valor: depoisBruto } = await bloco(K.processos);
    const mexeram = compararFotos(antes, fotoDosCards(depoisBruto));
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, K.processos, 'trello', 'sincronização',
       `Trello: ${baixados} anexo(s) em ${plano.porFicha.length} ficha(s); cards movidos: ${mexeram.length}`]).catch(() => {});
    res.json({ ok: true, anexosImportados: baixados, falharam,
      cardsQueMudaramDePosicao: mexeram.length, detalhe: mexeram.slice(0, 10),
      aindaFaltam: Math.max(0, plano.resumo.anexosNovos - baixados), ...plano.resumo });
  } catch (e) { next(e); }
});
