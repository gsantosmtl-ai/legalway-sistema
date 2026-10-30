// As rotas de sincronização com o Trello.
//
// O BLING SAIU em 30/10/2026, a pedido dela: "não vamos mais usar". Saíram as
// rotas, a autorização OAuth e a tela. NÃO saiu nada do que ele trouxe — as
// parcelas importadas, o `blingId` que casou cada baixa de outubro e o
// histórico continuam onde estavam. Tirar a integração não apaga o que ela
// já tinha feito.
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
import { planoDoTrello, fotoDosCards, compararFotos } from './sincronizacao.js';
import { salvarDataUri } from './arquivos.js';

export const rotasSinc = Router();

const K = {
  clientes: 'legalway-clientes-v1',
  contratos: 'legalway-contratos-v1',
  financeiro: 'legalway-financeiro-v1',
  processos: 'legalway-processos-documentacao-v1',
};
const QUEM = 'sincronização';
const agora = () => new Date().toISOString();
const uid = (p) => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const bloco = async (chave, padrao = []) => {
  const r = await ler(chave);
  return { valor: r && r.valor !== undefined ? r.valor : padrao, versao: r ? r.versao : null };
};

const cfgTrello = () => ({ key: process.env.TRELLO_API_KEY || '', token: process.env.TRELLO_TOKEN || '' });

rotasSinc.get('/sinc/estado', exigirLogin, async (req, res) => {
  const t = cfgTrello();
  res.json({
    trello: { configurado: !!(t.key && t.token),
      falta: !t.key ? 'TRELLO_API_KEY' : !t.token ? 'TRELLO_TOKEN' : null },
  });
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
