#!/usr/bin/env node
// Cruza a base do Kommo com a do Bling, nos dois sentidos, e gera uma linha por
// pessoa com tudo que se sabe dela nos dois sistemas.
//
// O que precisa estar em ferramentas/planilhas/:
//   bling/contatos.csv            cadastro de clientes e fornecedores
//   bling/pedidos-de-venda.csv    os contratos vendidos
//   bling/bling-financeiro.json   contas a receber e a pagar
//   kommo-fechados/kommo-completo.json
const fs = require('fs');
const P = 'ferramentas/planilhas';

// ---------- utilitários ----------
function parseCSV(texto, sep) {
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) { if (c === '"') { if (texto[i+1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
const fim8 = s => { const n = String(s||'').replace(/\D/g,''); return n.length >= 8 ? n.slice(-8) : ''; };
const limpaEmail = s => String(s||'').trim().toLowerCase();
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
// Emoji, apelido e "Face - " deixam o nome inútil pra comparar. Guardamos os
// pedaços que sobram pra tentar por primeiro+último nome.
const PARTICULAS = new Set(['de','da','do','das','dos','e','di','du','del','van','von','la','le']);
function pedacos(nome) {
  return norm(nome).split(' ').filter(p => p.length > 2 && !PARTICULAS.has(p));
}
function chaveFuzzy(nome) {
  const p = pedacos(nome);
  return p.length >= 2 ? p[0] + ' ' + p[p.length-1] : '';
}
const num = v => Number(String(v||'0').replace(/\./g,'').replace(',','.')) || 0;

// ---------- lado BLING ----------
const bc = parseCSV(fs.readFileSync(`${P}/bling/contatos.csv`,'utf8').replace(/^﻿/,''), ';');
const hbc = bc[0], ibc = n => hbc.indexOf(n);
const blingPessoas = new Map(); // id -> pessoa
bc.slice(1).filter(l => l[0]).forEach(l => {
  const id = l[ibc('ID')];
  blingPessoas.set(id, {
    blingId: id, nome: l[ibc('Nome')],
    email: limpaEmail(l[ibc('E-mail')]),
    tel: fim8((l[ibc('Celular')]||'') + (l[ibc('Fone')]||'')),
    cidade: l[ibc('Cidade')], uf: l[ibc('UF')],
    pedidos: [], parcelas: [], recebido: 0, aReceber: 0,
  });
});

// pedidos de venda (ligam por nome, porque o CSV não traz o id do contato)
const bp = parseCSV(fs.readFileSync(`${P}/bling/pedidos-de-venda.csv`,'utf8').replace(/^﻿/,''), ';');
const hbp = bp[0], ibp = n => hbp.indexOf(n);
const pedidos = bp.slice(1).filter(l => l[0]).map(l => ({
  numero: l[ibp('Número pedido')], nome: l[ibp('Nome Comprador')],
  email: limpaEmail(l[ibp('E-mail Comprador')]),
  tel: fim8((l[ibp('Telefone Comprador')]||'') + (l[ibp('Celular Comprador')]||'')),
  servico: l[ibp('Produto')], vendedor: (l[ibp('Vendedor')]||'').trim(),
  valor: num(l[ibp('Valor Total')]), data: l[ibp('Data')],
}));
// índices do Bling
const bPorEmail = new Map(), bPorTel = new Map(), bPorNome = new Map(), bPorFuzzy = new Map();
function indexa(mapa, chave, pessoa) { if (!chave) return; if (!mapa.has(chave)) mapa.set(chave, []); mapa.get(chave).push(pessoa); }
for (const p of blingPessoas.values()) {
  indexa(bPorEmail, p.email, p); indexa(bPorTel, p.tel, p);
  indexa(bPorNome, norm(p.nome), p); indexa(bPorFuzzy, chaveFuzzy(p.nome), p);
}
// liga pedido -> pessoa; se o comprador não existe no cadastro, cria
for (const ped of pedidos) {
  let dono = (bPorNome.get(norm(ped.nome)) || [])[0]
          || (ped.email && (bPorEmail.get(ped.email) || [])[0])
          || (bPorFuzzy.get(chaveFuzzy(ped.nome)) || [])[0];
  if (!dono) {
    dono = { blingId: 'ped:'+ped.numero, nome: ped.nome, email: ped.email, tel: ped.tel,
             cidade:'', uf:'', pedidos: [], parcelas: [], recebido: 0, aReceber: 0, soPedido: true };
    blingPessoas.set(dono.blingId, dono);
    indexa(bPorEmail, dono.email, dono); indexa(bPorTel, dono.tel, dono);
    indexa(bPorNome, norm(dono.nome), dono); indexa(bPorFuzzy, chaveFuzzy(dono.nome), dono);
  }
  if (!dono.email && ped.email) { dono.email = ped.email; indexa(bPorEmail, ped.email, dono); }
  if (!dono.tel && ped.tel) { dono.tel = ped.tel; indexa(bPorTel, ped.tel, dono); }
  dono.pedidos.push(ped);
}
// parcelas (ligam pelo idContato, que é confiável)
const fin = JSON.parse(fs.readFileSync(`${P}/bling/bling-financeiro.json`,'utf8')).dados;
const todasParcelas = [...fin.receberAberto.map(r=>({...r, pago:false})), ...fin.receberPago.map(r=>({...r, pago:true}))];
let parcelasOrfas = 0;
for (const par of todasParcelas) {
  let dono = blingPessoas.get(par.idContato);
  if (!dono && par.email) dono = (bPorEmail.get(limpaEmail(par.email)) || [])[0];
  if (!dono) dono = (bPorNome.get(norm(par.nome)) || [])[0] || (bPorFuzzy.get(chaveFuzzy(par.nome)) || [])[0];
  if (!dono) { parcelasOrfas++; continue; }
  dono.parcelas.push(par);
  if (par.pago) dono.recebido += num(par.valor); else dono.aReceber += num(par.valor);
  if (!dono.email && par.email) { dono.email = limpaEmail(par.email); indexa(bPorEmail, dono.email, dono); }
}

// ---------- lado KOMMO ----------
const K = JSON.parse(fs.readFileSync(`${P}/kommo-fechados/kommo-completo.json`,'utf8'));
const campo = (x, code) => ((x && x.custom_fields_values) || [])
  .filter(y => y.field_code === code).flatMap(y => y.values || []).map(v => String(v.value));
const ETAPAS = {100478099:'Lead Novo',100478103:'Sem Contato',110911015:'ENVIADOS SDR',
  100478107:'Adriano',102470479:'Adriano - Sem Contato',106141287:'Adriano - EB1-EB2',
  100510055:'Adriano Proposta',106751127:'Lost adriano',102470483:'Sem Contato - Renato',
  100478111:'Contato ok - Renato',100510059:'Proposta - Renato',107189947:'EB - Renato',
  107187739:'Repasse - Renato',106750971:'Lost Renato',142:'GANHO',143:'PERDIDO'};
// O Kommo guarda a mesma pessoa em dois cards: um com e-mail e outro sem, mesmo
// telefone, nome levemente diferente ("Rogerio Gomides" / "Rogério Ggomides").
// Em geral o card sem e-mail é o que está marcado como ganho. Se não juntarmos
// antes de cruzar, metade da pessoa casa com o Bling e a outra metade aparece
// como "ganho que nunca assinou" — que foi exatamente o erro da primeira volta.
const kBruto = K.contatos.map(c => ({
  kommoId: c.id, nome: c.name,
  emails: campo(c,'EMAIL').map(limpaEmail).filter(e => e.includes('@')),
  tels: campo(c,'PHONE').map(fim8).filter(Boolean),
  leads: [],
}));
const kContatos = new Map();
const donoDe = new Map();           // id original -> pessoa consolidada
const porChave = new Map();         // telefone ou e-mail -> pessoa consolidada
let kommoDuplicados = 0;
for (const c of kBruto) {
  const chaves = [...c.tels, ...c.emails];
  let alvo = null;
  for (const ch of chaves) if (porChave.has(ch)) { alvo = porChave.get(ch); break; }
  if (alvo) {
    kommoDuplicados++;
    alvo.emails = [...new Set([...alvo.emails, ...c.emails])];
    alvo.tels   = [...new Set([...alvo.tels, ...c.tels])];
    alvo.idsExtras.push(c.kommoId);
    // fica o nome mais informativo: o que tem mais palavras, depois o mais longo
    const palavras = s => String(s||'').trim().split(/\s+/).length;
    if (palavras(c.nome) > palavras(alvo.nome) ||
       (palavras(c.nome) === palavras(alvo.nome) && (c.nome||'').length > (alvo.nome||'').length)) alvo.nome = c.nome;
  } else {
    alvo = { ...c, idsExtras: [] };
    kContatos.set(alvo.kommoId, alvo);
  }
  donoDe.set(c.kommoId, alvo);
  for (const ch of [...alvo.tels, ...alvo.emails]) if (!porChave.has(ch)) porChave.set(ch, alvo);
}
const avulsos = [];
K.leads.forEach(l => {
  const ids = ((l._embedded && l._embedded.contacts) || []).map(c => c.id);
  const reg = { id: l.id, etapa: ETAPAS[l.status_id] || String(l.status_id),
                ganho: l.status_id === 142, perdido: l.status_id === 143,
                preco: l.price, criado: l.created_at, fechado: l.closed_at,
                notas: (K.notasGanhos[l.id] || []).length };
  const donos = [...new Set(ids.map(i => donoDe.get(i)).filter(Boolean))];
  if (donos.length) donos.forEach(d => d.leads.push(reg));
  else avulsos.push({ ...reg, nome: l.name });
});
const kPorEmail = new Map(), kPorTel = new Map(), kPorNome = new Map(), kPorFuzzy = new Map();
for (const c of kContatos.values()) {
  c.emails.forEach(e => indexa(kPorEmail, e, c));
  c.tels.forEach(t => indexa(kPorTel, t, c));
  indexa(kPorNome, norm(c.nome), c); indexa(kPorFuzzy, chaveFuzzy(c.nome), c);
}

// ---------- o casamento ----------
// Ordem importa: e-mail e telefone são identidade; nome é indício.
function casar(pessoa, emails, tels, nome) {
  for (const e of emails) { const h = (kPorEmail.get(e)||[])[0]; if (h) return { k: h, via: 'e-mail' }; }
  for (const t of tels)   { const h = (kPorTel.get(t)||[])[0];   if (h) return { k: h, via: 'telefone' }; }
  const n = (kPorNome.get(norm(nome))||[])[0]; if (n) return { k: n, via: 'nome exato' };
  const f = kPorFuzzy.get(chaveFuzzy(nome)) || [];
  if (f.length === 1) return { k: f[0], via: 'nome aproximado' };
  return null;
}
const casadosK = new Set();
const linhas = [];
for (const b of blingPessoas.values()) {
  const m = casar(b, b.email ? [b.email] : [], b.tel ? [b.tel] : [], b.nome);
  if (m) casadosK.add(m.k.kommoId);
  const ganhou = m && m.k.leads.some(l => l.ganho);
  const etapas = m ? [...new Set(m.k.leads.map(l => l.etapa))].join(' / ') : '';
  linhas.push({
    nome: b.nome, email: b.email, telefone: b.tel,
    origem: 'Bling' + (m ? ' + Kommo' : ''), casou_por: m ? m.via : '',
    bling_id: b.blingId, kommo_id: m ? m.k.kommoId : '',
    pedidos: b.pedidos.length,
    servicos: [...new Set(b.pedidos.map(p => p.servico))].join(', '),
    vendedor: [...new Set(b.pedidos.map(p => p.vendedor).filter(Boolean))].join(', '),
    vendido: b.pedidos.reduce((s,p) => s+p.valor, 0).toFixed(2),
    parcelas: b.parcelas.length, recebido: b.recebido.toFixed(2), a_receber: b.aReceber.toFixed(2),
    kommo_etapas: etapas, kommo_ganho: m ? (ganhou ? 'sim' : 'nao') : '',
    alerta: (b.pedidos.length > 0 && m && !ganhou) ? 'CLIENTE AINDA NO FUNIL' : '',
  });
}
// Kommo que não casou com ninguém do Bling
for (const c of kContatos.values()) {
  if (casadosK.has(c.kommoId)) continue;
  const ganhou = c.leads.some(l => l.ganho);
  linhas.push({
    nome: c.nome, email: c.emails[0] || '', telefone: c.tels[0] || '',
    origem: 'Kommo', casou_por: '', bling_id: '', kommo_id: c.kommoId,
    pedidos: 0, servicos: '', vendedor: '', vendido: '0.00',
    parcelas: 0, recebido: '0.00', a_receber: '0.00',
    kommo_etapas: [...new Set(c.leads.map(l => l.etapa))].join(' / '),
    kommo_ganho: ganhou ? 'sim' : 'nao',
    alerta: ganhou ? 'GANHO SEM VENDA NO BLING' : '',
  });
}

// ---------- saída ----------
const cols = ['nome','email','telefone','origem','casou_por','bling_id','kommo_id','pedidos','servicos',
              'vendedor','vendido','parcelas','recebido','a_receber','kommo_etapas','kommo_ganho','alerta'];
const esc = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
linhas.sort((a,b) => Number(b.vendido) - Number(a.vendido) || a.nome.localeCompare(b.nome));
fs.writeFileSync(`${P}/cruzamento-kommo-bling.csv`,
  [cols.join(';'), ...linhas.map(l => cols.map(c => esc(l[c])).join(';'))].join('\n'));

// Duas listas que precisam de ação, não de análise.
const aindaNoFunil = linhas.filter(l => l.alerta === 'CLIENTE AINDA NO FUNIL');
fs.writeFileSync(`${P}/acao-clientes-ainda-no-funil.csv`,
  [['nome','email','telefone','vendido','servicos','vendedor','kommo_etapas','kommo_id'].join(';'),
   ...aindaNoFunil.map(l => [l.nome,l.email,l.telefone,l.vendido,l.servicos,l.vendedor,l.kommo_etapas,l.kommo_id].map(esc).join(';'))
  ].join('\n'));

const ganhoSemContrato = linhas.filter(l => l.alerta === 'GANHO SEM VENDA NO BLING');
fs.writeFileSync(`${P}/acao-ganho-sem-contrato-assinado.csv`,
  [['nome','email','telefone','kommo_etapas','kommo_id'].join(';'),
   ...ganhoSemContrato.map(l => [l.nome,l.email,l.telefone,l.kommo_etapas,l.kommo_id].map(esc).join(';'))
  ].join('\n'));

// ---------- resumo ----------
const emAmbos = linhas.filter(l => l.origem === 'Bling + Kommo');
const soBling = linhas.filter(l => l.origem === 'Bling');
const soKommo = linhas.filter(l => l.origem === 'Kommo');
const via = {}; emAmbos.forEach(l => via[l.casou_por] = (via[l.casou_por]||0)+1);
console.log('PESSOAS NA BASE UNIFICADA:', linhas.length);
console.log('  nos dois sistemas :', emAmbos.length, '  (' + Object.entries(via).map(([k,v])=>k+' '+v).join(', ') + ')');
console.log('  só no Bling       :', soBling.length);
console.log('  só no Kommo       :', soKommo.length);
console.log();
console.log('BLING -> KOMMO');
const comPedido = linhas.filter(l => l.pedidos > 0);
console.log('  clientes com pedido        :', comPedido.length);
console.log('    achados no Kommo         :', comPedido.filter(l => l.kommo_id).length);
console.log('    marcados como ganho lá   :', comPedido.filter(l => l.kommo_ganho === 'sim').length);
console.log('    AINDA NO FUNIL (alerta)  :', comPedido.filter(l => l.alerta === 'CLIENTE AINDA NO FUNIL').length);
console.log('    nunca estiveram no Kommo :', comPedido.filter(l => !l.kommo_id).length);
console.log();
console.log('KOMMO -> BLING');
const ganhos = linhas.filter(l => l.kommo_ganho === 'sim');
console.log('  leads marcados como ganho  :', ganhos.length);
console.log('    com pedido no Bling      :', ganhos.filter(l => l.pedidos > 0).length);
console.log('    SEM pedido no Bling      :', ganhos.filter(l => l.pedidos === 0).length);
console.log();
console.log('  contatos duplicados juntados no Kommo:', kommoDuplicados,
            '(' + K.contatos.length + ' cards -> ' + kContatos.size + ' pessoas)');
console.log('  parcelas sem dono          :', parcelasOrfas, 'de', todasParcelas.length);
console.log('  leads sem contato no Kommo :', avulsos.length);
console.log();
console.log('arquivos:');
console.log('  ' + P + '/cruzamento-kommo-bling.csv');
console.log('  ' + P + '/acao-clientes-ainda-no-funil.csv            (' + aindaNoFunil.length + ')');
console.log('  ' + P + '/acao-ganho-sem-contrato-assinado.csv        (' + ganhoSemContrato.length + ')');
