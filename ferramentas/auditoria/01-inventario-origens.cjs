#!/usr/bin/env node
// CAMADA 1 — quantidade. Inventário das origens, só leitura.
//
// Regra desta auditoria: só conta como ORIGEM o que saiu do sistema de origem
// (API ou export dele). Arquivo que NÓS geramos no meio do caminho é derivado
// e não prova nada — comparar derivado nosso contra sistema nosso é circular.
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'planilhas');
const { lerCsv } = require('./csv.cjs');
const ler = f => JSON.parse(fs.readFileSync(path.join(P, f), 'utf8'));
const csv = f => lerCsv(fs.readFileSync(path.join(P, f), 'utf8'));
// Contar por linha erra: endereço com quebra de linha vira duas, e um pedido
// com dois itens ocupa duas. O que vale é o identificador distinto.
const distintos = (f, col) => { const c = csv(f);
  return { linhas: c.linhas.length, n: new Set(c.registros.map(r => r[col]).filter(v => String(v||'').trim())).size }; };

const inv = { geradoEm: new Date().toISOString(), origens: {} };

// ─── BLING ───────────────────────────────────────────────────────────────
const fin = ler('bling/bling-financeiro.json');
const ext = ler('bling/bling-extrato.json');
const sit = ler('bling/situacao-pedidos.json');
const d = fin.dados || fin;
inv.origens.bling = {
  fonte: fin.origem, extraidoEm: fin.geradoEm,
  contatos:        { ...distintos('bling/contatos.csv', 'ID'), de: 'contatos.csv (export), por ID' },
  pedidosDeVenda:  { ...distintos('bling/pedidos-de-venda.csv', 'Número pedido'),
                     de: 'pedidos-de-venda.csv (export), por Número pedido — uma linha por ITEM' },
  contasAReceber:  { n: (fin.contagem.receberAberto||0) + (fin.contagem.receberPago||0),
                     aberto: fin.contagem.receberAberto, pago: fin.contagem.receberPago, de: 'API financeiro' },
  contasAPagar:    { n: (fin.contagem.pagarAberto||0) + (fin.contagem.pagarPago||0),
                     aberto: fin.contagem.pagarAberto, pago: fin.contagem.pagarPago, de: 'API financeiro' },
  extratoBancario: { porConta: ext.contagem, n: Object.values(ext.contagem).reduce((a,b)=>a+b,0), de: 'API caixas-bancos' },
  situacaoPedidos: { n: Object.keys(sit.situacaoPorPedido || {}).length, de: 'API pedidos' },
};

// ─── KOMMO ───────────────────────────────────────────────────────────────
const k = ler('kommo-fechados/kommo-completo.json');
inv.origens.kommo = {
  fonte: k.origem, extraidoEm: k.geradoEm,
  leads:    { n: k.leads.length,    de: 'API v4' },
  contatos: { n: k.contatos.length, de: 'API v4' },
  notasDeGanho: { n: Array.isArray(k.notasGanhos) ? k.notasGanhos.length : Object.keys(k.notasGanhos || {}).length,
                  de: 'API v4' },
  exportCsv: { ...distintos('kommo-fechados/export.csv', 'ID'), de: 'export do painel, por ID' },
};

// ─── TRELLO ──────────────────────────────────────────────────────────────
// Duas extrações da mesma conta, com 21 minutos de diferença. A "completo" tem
// a estrutura; a "organizar" tem também comentário e anexo. Confiro uma contra
// a outra: se os ids dos cartões baterem, as duas são leitura fiel da API.
const tc = ler('trello/trello-completo.json');
const to = ler('trello/trello-organizar.json');

function varrer(raiz, campoCartoes) {
  const r = { quadros: 0, listas: 0, cartoes: 0, arquivados: 0, checklists: 0, itens: 0,
              anexos: 0, comentarios: 0, comDescricao: 0, porQuadro: {}, ids: new Set() };
  for (const [nome, q] of Object.entries(raiz)) {
    r.quadros++;
    r.listas += (q.listas || []).length;
    const cs = q[campoCartoes] || [];
    r.porQuadro[nome] = cs.length;
    r.cartoes += cs.length;
    for (const c of cs) {
      r.ids.add(c.id);
      if (c.closed) r.arquivados++;
      if ((c.desc || c.descricao || '').trim()) r.comDescricao++;
      for (const cl of (c.checklists || [])) r.checklists++, r.itens += (cl.checkItems || cl.itens || []).length;
      r.anexos += (c.anexos || []).length;
      r.comentarios += (c.comentarios || []).length;
    }
  }
  return r;
}
const A = varrer(tc.quadros, 'cards');
const B = varrer(to.quadros, 'cartoes');
const soEmA = [...A.ids].filter(i => !B.ids.has(i));
const soEmB = [...B.ids].filter(i => !A.ids.has(i));

inv.origens.trello = {
  fonte: tc.origem, extraidoEm: tc.geradoEm,
  quadros: { n: A.quadros }, listas: { n: A.listas },
  cartoes: { n: A.cartoes, arquivados: A.arquivados, comDescricao: A.comDescricao, porQuadro: A.porQuadro },
  checklists: { n: A.checklists, itens: A.itens },
  anexos: { n: B.anexos, de: 'trello-organizar.json' },
  comentarios: { n: B.comentarios, de: 'trello-organizar.json' },
  conferenciaEntreAsDuasExtracoes: {
    cartoesCompleto: A.cartoes, cartoesOrganizar: B.cartoes,
    soNaCompleto: soEmA.length, soNaOrganizar: soEmB.length,
    batem: soEmA.length === 0 && soEmB.length === 0,
  },
};

fs.writeFileSync(path.join(__dirname, 'relatorios', 'inventario-origens.json'), JSON.stringify(inv, null, 2));

// ─── impressão ───────────────────────────────────────────────────────────
const fmt = n => String(n).padStart(6);
console.log('INVENTÁRIO DAS ORIGENS — camada 1 (quantidade)\n');
for (const [sis, dados] of Object.entries(inv.origens)) {
  console.log('══ ' + sis.toUpperCase() + '   (' + dados.fonte + ')');
  console.log('   extraído em: ' + dados.extraidoEm);
  for (const [ent, v] of Object.entries(dados)) {
    if (typeof v !== 'object' || v === null) continue;
    console.log('   ' + fmt(v.n) + '  ' + ent + (v.de ? '   ← ' + v.de : ''));
  }
  console.log();
}
console.log('Gravado em auditoria/relatorios/inventario-origens.json');
