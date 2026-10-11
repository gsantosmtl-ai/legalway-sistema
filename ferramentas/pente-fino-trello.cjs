#!/usr/bin/env node
// Pente fino antes de fechar a migração do Trello.
//
//   node ferramentas/pente-fino-trello.cjs
//
// Simula a importação dos 13 quadros de uma vez, sem gravar nada, e lista
// tudo o que pode se perder ou cair no lugar errado. Usa EXATAMENTE as mesmas
// regras do importar-trello.cjs — se uma regra mudar lá, muda aqui junto.
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, 'planilhas');

const R = require('./regras-trello.cjs');
const { EH_MODELO, PREFIXOS, SERVICO_DO_QUADRO, PESSOAS, ETAPA, QUADRO_SEM_ETAPA, APELIDOS, norm, fuzzy } = R;
const crypto = require('crypto');

const trello = JSON.parse(fs.readFileSync(path.join(P, 'trello/trello-organizar.json'), 'utf8'));
const estado = JSON.parse(fs.readFileSync(path.join(P, 'estado-sistema.json'), 'utf8'));

const porNome = new Map(), porFz = new Map();
for (const c of estado.clientes) {
  porNome.set(norm(c.nome), c);
  const f = fuzzy(c.nome); if (f && !porFz.has(f)) porFz.set(f, c);
}
const procPorChave = new Map();
estado.processos.forEach(p => procPorChave.set(norm(p.clienteNome) + '|' + norm(p.servico), p));

const servicosDoSistema = new Set((estado.servicos || []).map(s => s.nome || s));

const av = {
  modelos: [], semEtapa: new Map(), listaEhServico: new Map(), servicoDoQuadroCru: [], fuzzy: [], apelido: [], apelidoQuebrado: [], clientesNovos: [], anexoRepetido: [],
  chaveRepetida: new Map(), checklistDescartado: [], servicoDesconhecido: new Set(),
  semArquivoBaixado: [], anexoVazio: [], semNadaDentro: [], cartoesSemNome: [],
  anexosTrello: 0, anexosBaixados: 0, cartoes: 0, comentarios: 0, itensChecklist: 0, descricoes: 0,
};

for (const [quadro, b] of Object.entries(trello.quadros)) {
  const caminho = path.join(P, 'trello', 'anexos-' + quadro.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '.json');
  const baixados = fs.existsSync(caminho) ? JSON.parse(fs.readFileSync(caminho, 'utf8')) : null;

  for (const c of b.cartoes) {
    const titulo = String(c.nome || '').trim();
    if (!titulo) { av.cartoesSemNome.push(quadro + ' › ' + c.id); continue; }
    if (EH_MODELO(titulo)) { av.modelos.push(quadro + ' › ' + titulo); continue; }
    av.cartoes++;

    let servico = null, nome = titulo;
    for (const [re, s] of PREFIXOS) if (re.test(titulo)) { servico = s; nome = titulo.replace(re, '').trim(); break; }
    if (!servico) {
      servico = SERVICO_DO_QUADRO[quadro];
      if (!servico) { servico = quadro; av.servicoDoQuadroCru.push(quadro + ' › ' + titulo); }
    }
    if (!servicosDoSistema.has(servico)) av.servicoDesconhecido.add(servico);

    const nomeLista = (b.listas.find(l => l.id === c.idLista) || {}).nome || '';
    const chaveLista = nomeLista.toUpperCase().trim();
    if (!QUADRO_SEM_ETAPA[quadro] && !PESSOAS.includes(chaveLista) && !ETAPA[chaveLista]) {
      const k = quadro + ' › ' + nomeLista;
      av.semEtapa.set(k, (av.semEtapa.get(k) || 0) + 1);
    }
    // Lista cujo nome é um SERVIÇO não é etapa: diz o que a pessoa comprou, não
    // em que pé está. Foi assim que o Zsolt entrou como "Protocolado" sem ter
    // entregue um documento sequer. O mesmo vale para nome de pessoa, que já
    // vira responsável. Se cair aqui, ou entra em QUADRO_SEM_ETAPA ou sai do
    // mapa de etapas.
    const servicosConhecidos = new Set([...Object.values(SERVICO_DO_QUADRO), ...PREFIXOS.map(x => x[1])].map(norm));
    if (ETAPA[chaveLista] && servicosConhecidos.has(norm(nomeLista)) && !QUADRO_SEM_ETAPA[quadro]) {
      const k = quadro + ' › "' + nomeLista + '" → ' + ETAPA[chaveLista];
      av.listaEhServico.set(k, (av.listaEhServico.get(k) || 0) + 1);
    }

    // cliente
    const apelido = APELIDOS[nome] || APELIDOS[nome.toUpperCase()];
    let cliente = apelido ? porNome.get(norm(apelido)) : porNome.get(norm(nome));
    if (apelido) { if (cliente) av.apelido.push({ trello: nome, sistema: cliente.nome }); else av.apelidoQuebrado.push(nome + ' → ' + apelido); }
    if (!cliente) {
      const f = porFz.get(fuzzy(nome));
      if (f) { cliente = f; av.fuzzy.push({ quadro, trello: nome, sistema: f.nome }); }
    }
    if (!cliente) { av.clientesNovos.push(quadro + ' › ' + nome); cliente = { nome }; }

    // dois cartões para a mesma pessoa + serviço
    const chave = norm(cliente.nome) + '|' + norm(servico);
    if (!av.chaveRepetida.has(chave)) av.chaveRepetida.set(chave, []);
    av.chaveRepetida.get(chave).push(quadro + ' › ' + titulo);

    // o checklist do Trello só substitui o do sistema se o atual estiver intocado
    const check = (c.checklists || []).flatMap(k => k.itens);
    av.itensChecklist += check.length;
    const jaExiste = procPorChave.get(chave);
    if (jaExiste && check.length) {
      const intocado = (jaExiste.checklist || []).every(d => d.status === 'Não solicitado' && !d.arquivo);
      if (!intocado) av.checklistDescartado.push({ cliente: cliente.nome, servico, itens: check.length });
    }

    av.comentarios += (c.comentarios || []).length;
    if (String(c.descricao || '').trim()) av.descricoes++;
    av.anexosTrello += c.anexos.length;

    if (c.anexos.length) {
      if (!baixados) av.semArquivoBaixado.push({ quadro, cartao: titulo, n: c.anexos.length });
      else {
        const tem = baixados[c.id] || [];
        av.anexosBaixados += tem.length;
        if (tem.length !== c.anexos.length)
          av.semArquivoBaixado.push({ quadro, cartao: titulo, n: c.anexos.length - tem.length, de: c.anexos.length });
        const digitais = new Map();
        tem.forEach(a => {
          if (!a.conteudo || !a.tamanho) av.anexoVazio.push(quadro + ' › ' + titulo + ' › ' + a.nome);
          const h = crypto.createHash('sha1').update(String(a.conteudo || '')).digest('hex');
          if (digitais.has(h)) av.anexoRepetido.push(quadro + ' › ' + titulo + ' › ' + a.nome + '  (igual a "' + digitais.get(h) + '")');
          else digitais.set(h, a.nome);
        });
      }
    }

    if (!c.anexos.length && !check.length && !(c.comentarios || []).length && !String(c.descricao||'').trim())
      av.semNadaDentro.push(quadro + ' › ' + titulo);
  }
}

// ─── RELATÓRIO ─────────────────────────────────────────────────────────────
const t = (s) => console.log('\n' + s + '\n' + '─'.repeat(s.length));
const ok = (s) => console.log('  ✓ ' + s);
const al = (s) => console.log('  ⚠ ' + s);

console.log('PENTE FINO — TRELLO → SISTEMA');
console.log('quadros ' + Object.keys(trello.quadros).length + ' · cartões de cliente ' + av.cartoes +
            ' · modelos ignorados ' + av.modelos.length);
console.log('conteúdo: ' + av.anexosTrello + ' anexos · ' + av.itensChecklist + ' itens de checklist · ' +
            av.comentarios + ' comentários · ' + av.descricoes + ' descrições');

t('1. ANEXOS AINDA NÃO BAIXADOS');
if (!av.semArquivoBaixado.length) ok('todos os ' + av.anexosTrello + ' já estão em disco');
else {
  const porQuadro = new Map();
  av.semArquivoBaixado.forEach(x => porQuadro.set(x.quadro, (porQuadro.get(x.quadro) || 0) + x.n));
  [...porQuadro].sort((a,b)=>b[1]-a[1]).forEach(([q,n]) => al(String(n).padStart(4) + '  ' + q));
  console.log('     (baixados até agora: ' + av.anexosBaixados + ' de ' + av.anexosTrello + ')');
}

t('2. ARQUIVO BAIXADO MAS VAZIO');
if (!av.anexoVazio.length) ok('nenhum'); else av.anexoVazio.forEach(x => al(x));

t('3. LISTAS SEM ETAPA DEFINIDA  (cairiam em "Recebendo documentos")');
if (!av.semEtapa.size) ok('todas mapeadas');
else [...av.semEtapa].sort((a,b)=>b[1]-a[1]).forEach(([k,n]) => al(String(n).padStart(3) + ' cartões  ' + k));

t('3b. LISTA COM NOME DE SERVIÇO SENDO LIDA COMO ETAPA');
if (!av.listaEhServico.size) ok('nenhuma');
else [...av.listaEhServico].forEach(([k,n]) => al(String(n).padStart(3) + ' cartões  ' + k + '   ← o nome diz o serviço, não o estágio'));

t('4. SERVIÇOS QUE O SISTEMA NÃO TEM CADASTRADOS');
if (!av.servicoDesconhecido.size) ok('todos existem');
else [...av.servicoDesconhecido].forEach(s => al(s));

t('5a. APELIDO APLICADO — nome diferente, mesma pessoa');
if (!av.apelido.length) ok('nenhum');
else av.apelido.forEach(f => console.log('     ' + f.trello.padEnd(38) + '→  ' + f.sistema));
if (av.apelidoQuebrado.length) { console.log(''); av.apelidoQuebrado.forEach(x => al('APELIDO APONTA PARA NINGUÉM: ' + x)); }

t('5b. NOME APROXIMADO — confira se é a mesma pessoa');
if (!av.fuzzy.length) ok('nenhum');
else av.fuzzy.forEach(f => al(f.trello.padEnd(40) + '→  ' + f.sistema + '   (' + f.quadro + ')'));

t('6. DOIS CARTÕES PARA A MESMA PESSOA E SERVIÇO  (viram um processo só)');
const reps = [...av.chaveRepetida].filter(([,v]) => v.length > 1);
if (!reps.length) ok('nenhum');
else reps.forEach(([,v]) => { al(v.length + ' cartões:'); v.forEach(x => console.log('        ' + x)); });

t('7. CHECKLIST DO TRELLO QUE SERIA DESCARTADO  (o do sistema já foi mexido)');
if (!av.checklistDescartado.length) ok('nenhum');
else av.checklistDescartado.forEach(x => al(x.cliente + ' · ' + x.servico + '  —  ' + x.itens + ' itens ficariam de fora'));

t('8. CLIENTES QUE SERÃO CRIADOS DO ZERO  (não estão no sistema)');
if (!av.clientesNovos.length) ok('nenhum');
else { console.log('  ' + av.clientesNovos.length + ' pessoas:'); av.clientesNovos.forEach(x => console.log('     ' + x)); }

t('9. SERVIÇO VEIO DO NOME DO QUADRO, SEM TRADUÇÃO');
if (!av.servicoDoQuadroCru.length) ok('nenhum');
else av.servicoDoQuadroCru.forEach(x => al(x));

t('10. CARTÕES VAZIOS  (sem anexo, checklist, comentário ou descrição)');
if (!av.semNadaDentro.length) ok('nenhum');
else { console.log('  ' + av.semNadaDentro.length + ':'); av.semNadaDentro.forEach(x => console.log('     ' + x)); }

t('11. ANEXO REPETIDO DENTRO DO MESMO CARTÃO  (entra uma vez só)');
if (!av.anexoRepetido.length) ok('nenhum entre os já baixados');
else av.anexoRepetido.forEach(x => al(x));

t('12. CARTÕES TRATADOS COMO MODELO  (não entram)');
av.modelos.forEach(x => console.log('     ' + x));
if (!av.modelos.length) ok('nenhum');
