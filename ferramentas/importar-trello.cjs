#!/usr/bin/env node
// Monta o arquivo de importação de um lote do Trello.
//
//   node ferramentas/importar-trello.cjs --lote 2            → simula
//   node ferramentas/importar-trello.cjs --lote 2 --gravar   → gera o arquivo
//   node ferramentas/importar-trello.cjs --lotes             → mostra os lotes
//
// Precisa, em ferramentas/planilhas/:
//   trello/trello-organizar.json   a exportação do Trello (cartões, checklists, comentários)
//   trello/anexos-<quadro>.json    os anexos em base64, baixados pelo navegador
//   estado-sistema.json            clientes e processos que já existem no sistema
//
// O navegador só faz duas coisas: baixar os anexos de um quadro, e subir o
// arquivo que sai daqui. Todo o resto é feito aqui, de uma vez.
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, 'planilhas');

// ─── LOTES ─────────────────────────────────────────────────────────────────
// Do menor para o maior: erro aparece cedo e custa pouco.
const LOTES = {
  1: ['MUDANCA DE CORTE/ONLINE'],
  2: ['MOTION', 'ASILO', 'FOIA', 'MUDANCA DE ENDERECO', 'KAMMY ZUPPO'],
  3: ['LWG DS160', 'PASSAPORTES LGW', 'REAGENDAMENTO DE FINGER', 'SOCIAL E PERMIT'],
  4: ['LWG EXTENSAO TURISTA', 'LGW F1 STUDENT'],
  5: ['LWG VISA T'],     // 172 cartões, 1,95 GB — sai em partes, ver --parte
};

// ─── REGRAS (as mesmas do organizar-trello.cjs) ────────────────────────────
const EH_MODELO = t => /NOME DO CLIENTE|^MODELO\b|^Modelo\b|MODELO$/i.test(t)
  || /^D-S160 VISA TURISTA$/i.test(String(t).trim());

const PREFIXOS = [
  [/^VISTO T \(T VISA\)\s*[—–-]\s*/i,            'Visto T'],
  [/^T VISA\s*-\s*/i,                            'Visto T'],
  [/^VISTO DE ESTUDANTE F-1\s*-\s*/i,            'F1 - Estudante'],
  [/^RENOVAÇÃO DE PASSAPORTE BRASILEIRO\s*-\s*/i,'Renovação de Passaporte'],
  [/^WORK PERMIT E SOCIAL\s*-\s*/i,              'WORK PERMIT E SOCIAL'],
  [/^GREEN CARD POR CASAMENTO\s*-\s*/i,          'GreenCard Casamento'],
  [/^MUDANÇA DE ENDEREÇO\s*-\s*/i,               'Mudança de Endereço'],
  [/^PP?ETICAO FAMILIAR\s*[—–-]\s*/i,            'Petição Familiar'],
  [/^D-?S\s?160( VISA)?( TURISTA)?\s*-\s*/i,     'DS-160'],
  [/^EXTENSAO\s*-\s*/i,                          'Extensão de Turista'],
  [/^PERMIT\s*-\s*/i,                            'WORK PERMIT E SOCIAL'],
  [/^MOTION\s*[—–-]\s*/i,                        'MOTION'],
  [/^VAWA\s*-\s*/i,                              'VAWA'],
  [/^ASILO\s*-\s*/i,                             'Asilo'],
  [/^FOIA\s*-\s*/i,                              'FOIA'],
];
const SERVICO_DO_QUADRO = {
  'ASILO':'Asilo', 'FOIA':'FOIA', 'KAMMY ZUPPO':'Petição Familiar',
  'LGW F1 STUDENT':'F1 - Estudante', 'LWG DS160':'DS-160',
  'LWG EXTENSAO TURISTA':'Extensão de Turista', 'LWG VISA T':'Visto T',
  'MOTION':'MOTION', 'MUDANCA DE CORTE/ONLINE':'Mudança de Corte',
  'MUDANCA DE ENDERECO':'Mudança de Endereço', 'PASSAPORTES LGW':'Renovação de Passaporte',
  'REAGENDAMENTO DE FINGER':'Reagendamento de Finger', 'SOCIAL E PERMIT':'WORK PERMIT E SOCIAL',
};
const PESSOAS = ['ELAINE', 'VITORIA', 'PETERSON'];
const ETAPA = {
  'CLIENTES':'Aguardando boas-vindas','CLIENTES KAMMY':'Aguardando boas-vindas',
  'CLIENTES PASSAPORTE':'Aguardando boas-vindas','CONTRATO ASSINADO':'Aguardando boas-vindas',
  'CLIENTES DEVENDO':'Aguardando autorização financeira',
  'AGUARDANDO DOC':'Documentos solicitados','NAO ENVIAM DOC':'Documentos solicitados',
  'PROCESSO EM ANDAMENTO':'Recebendo documentos','LAUDO AGENDADO':'Recebendo documentos',
  'AGUARDANDO TRADUCOES':'Recebendo documentos','AGURADANDO TRADUCAO':'Recebendo documentos',
  'PEDIDO ENVIADO':'Protocolado','PROCESSO ENVIADO':'Protocolado','PROCESSO PROTOCOLADO':'Protocolado',
  'MOTION PROTOCOLADA':'Protocolado','PETICAO FAMILIAR':'Protocolado','CASAMENTO':'Protocolado',
  'I797C':'Em acompanhamento','NOTICE I797':'Em acompanhamento','FINGER PRINT':'Em acompanhamento',
  'REAGENDAMENTO':'Em acompanhamento','ENVIADO AO CLIENTE':'Em acompanhamento','MOTION':'Em acompanhamento',
  'PROCESSO FINALIZADO':'Em acompanhamento','FINALIZADO':'Em acompanhamento','FINALIZADOS':'Em acompanhamento',
  'MOTION FINALIZADA':'Em acompanhamento','APROVADO':'Em acompanhamento','APROVADOS':'Em acompanhamento',
  'FOIA RECEBIDO':'Em acompanhamento',
};

// ─── FERRAMENTAS ───────────────────────────────────────────────────────────
const arg = f => process.argv.includes(f);
const valor = f => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const PART = new Set(['de','da','do','das','dos','e','di','du','del']);
const fuzzy = n => { const p = norm(n).split(' ').filter(x => x.length > 2 && !PART.has(x));
  return p.length >= 2 ? p[0] + ' ' + p[p.length-1] : ''; };
let seq = 0;
const uid = p => `${p}tr${Date.now().toString(36)}${(seq++).toString(36)}`;
const agora = () => new Date().toISOString();

const trello = JSON.parse(fs.readFileSync(path.join(P, 'trello/trello-organizar.json'), 'utf8'));
const estado = JSON.parse(fs.readFileSync(path.join(P, 'estado-sistema.json'), 'utf8'));

if (arg('--lotes')) {
  for (const [n, quadros] of Object.entries(LOTES)) {
    const cs = quadros.flatMap(q => (trello.quadros[q]?.cartoes || []).filter(c => !EH_MODELO(c.nome)));
    const mb = cs.reduce((s,c) => s + c.anexos.reduce((t,a) => t + (a.bytes||0), 0), 0) / 1048576;
    console.log(`lote ${n}: ${String(cs.length).padStart(4)} cartões · ${String(cs.reduce((s,c)=>s+c.anexos.length,0)).padStart(4)} anexos · ${mb.toFixed(0).padStart(5)} MB   ${quadros.join(', ')}`);
  }
  process.exit(0);
}

const LOTE = valor('--lote');
const quadros = LOTE ? LOTES[LOTE] : [valor('--quadro')].filter(Boolean);
if (!quadros || !quadros.length) { console.error('Use --lote N, --quadro NOME, ou --lotes.'); process.exit(1); }

// ─── ÍNDICES DO SISTEMA ────────────────────────────────────────────────────
const porNome = new Map(), porFz = new Map();
for (const c of estado.clientes) {
  porNome.set(norm(c.nome), c);
  const f = fuzzy(c.nome); if (f && !porFz.has(f)) porFz.set(f, c);
}
// ─── MONTAGEM ──────────────────────────────────────────────────────────────
const clientesNovos = [];
const processos = estado.processos.map(p => ({ ...p }));   // cópia: o bloco é substituído inteiro

// O índice guarda a POSIÇÃO no array, não o id. O sistema gerava id com
// Date.now() + sorteio de 0 a 999, e 189 processos criados no mesmo
// milissegundo deram ids repetidos — procurar pelo id entregava o processo
// errado, e os anexos de um cliente iam parar no card de outro.
// Conserto dos ids que já estão repetidos lá dentro: o primeiro fica com o id
// original (é o que os alertas e links existentes apontam) e os seguintes
// ganham um id novo. Sem isso, dois clientes diferentes dividem o mesmo
// registro e editar um mexe no outro.
const vistos = new Set();
const repetidosCorrigidos = [];
for (const p of processos) {
  if (vistos.has(p.id)) {
    const antigo = p.id;
    p.id = uid('doc');
    repetidosCorrigidos.push({ antigo, novo: p.id, cliente: p.clienteNome, servico: p.servico });
  }
  vistos.add(p.id);
}

const procPorChave = new Map();
processos.forEach((p, i) => procPorChave.set(norm(p.clienteNome) + '|' + norm(p.servico), i));
const arquivos = [];
const relatorio = { novos: 0, enriquecidos: 0, clientesCriados: 0, anexos: 0, semAnexo: [], porFuzzy: [] };

for (const quadro of quadros) {
  const b = trello.quadros[quadro];
  if (!b) { console.error('quadro não encontrado: ' + quadro); continue; }

  // Anexos vêm de um arquivo à parte, baixado pelo navegador. Sem ele, o lote
  // entra só com texto — e o relatório diz quantos ficaram de fora.
  const caminhoAnexos = path.join(P, 'trello', 'anexos-' + quadro.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '.json');
  const anexosDoQuadro = fs.existsSync(caminhoAnexos)
    ? JSON.parse(fs.readFileSync(caminhoAnexos, 'utf8')) : null;
  if (!anexosDoQuadro) relatorio.semAnexo.push(quadro);

  for (const c of b.cartoes) {
    if (EH_MODELO(c.nome)) continue;
    const titulo = c.nome.trim();

    let servico = null, nome = titulo;
    for (const [re, s] of PREFIXOS) if (re.test(titulo)) { servico = s; nome = titulo.replace(re, '').trim(); break; }
    if (!servico) servico = SERVICO_DO_QUADRO[quadro] || quadro;

    const nomeLista = (b.listas.find(l => l.id === c.idLista) || {}).nome || '';
    const chave = nomeLista.toUpperCase().trim();
    const ehPessoa = PESSOAS.includes(chave);
    const status = ehPessoa ? 'Recebendo documentos' : (ETAPA[chave] || 'Recebendo documentos');
    const responsavel = ehPessoa ? nomeLista.charAt(0) + nomeLista.slice(1).toLowerCase() : '';

    // cliente: exato, depois aproximado; se não houver, cria
    let cliente = porNome.get(norm(nome));
    if (!cliente) {
      const f = porFz.get(fuzzy(nome));
      if (f) { cliente = f; relatorio.porFuzzy.push(nome + '  →  ' + f.nome); }
    }
    if (!cliente) {
      cliente = { id: uid('cl'), nome, telefone: '', email: '', endereco: '',
        criadoEm: agora(), contratoIds: [],
        historico: [{ quando: agora(), texto: `Importado do Trello — quadro ${quadro}` }] };
      clientesNovos.push(cliente);
      porNome.set(norm(nome), cliente);
      relatorio.clientesCriados++;
    }

    // histórico: descrição e comentários, na ordem em que aconteceram
    const acomp = [];
    if (c.descricao && c.descricao.trim())
      acomp.push({ quando: c.ultimaAtividade, quem: 'Importado do Trello', texto: c.descricao.trim() });
    for (const x of c.comentarios || [])
      acomp.push({ quando: x.quando, quem: x.quem || 'Trello', texto: x.texto });
    acomp.sort((a, x) => String(a.quando).localeCompare(String(x.quando)));

    // checklist do Trello: o item marcado vira "Aprovado"
    const checklist = (c.checklists || []).flatMap(k => k.itens.map(i => ({
      nome: i.nome, dica: '', status: i.feito ? 'Aprovado' : 'Não solicitado', precisaTraducao: true,
    })));

    // anexos: nome que casa com um item do checklist entra na linha dele;
    // o resto fica como anexo do processo. Chutar a classificação de um
    // documento de imigração é pior do que deixar sem classificar.
    const doCartao = anexosDoQuadro ? (anexosDoQuadro[c.id] || []) : [];
    const soltos = [];
    for (const a of doCartao) {
      arquivos.push({ id: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho,
                      conteudo: a.conteudo, criado_em: a.criado_em, criado_por: 'Importado do Trello' });
      relatorio.anexos++;
      const na = norm(a.nome).replace(/ (pdf|jpe?g|png|docx?)$/, '');
      const item = checklist.find(d => { const nd = norm(d.nome); return nd.length > 3 && (na.includes(nd) || nd.includes(na)); });
      if (item && !item.arquivo) { item.arquivo = '/api/arquivos/' + a.id; item.nomeArquivo = a.nome; }
      else soltos.push({ arquivoId: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho,
                         url: '/api/arquivos/' + a.id, origem: 'Trello', quando: a.criado_em });
    }

    // processo: se já existe um do mesmo cliente e serviço, acrescenta nele
    const posicao = procPorChave.get(norm(cliente.nome) + '|' + norm(servico));
    if (posicao !== undefined) {
      const p = processos[posicao];
      p.acompanhamentos = [...(p.acompanhamentos || []), ...acomp];
      p.anexos = [...(p.anexos || []), ...soltos];
      p.etiquetas = [...new Set([...(p.etiquetas || []), ...(c.etiquetas || [])])];
      if (responsavel && !p.responsavel) p.responsavel = responsavel;
      // o checklist do Trello é o que a equipe usa de verdade: substitui o
      // genérico que veio do modelo, mas só se o atual estiver intocado
      const intocado = (p.checklist || []).every(d => d.status === 'Não solicitado' && !d.arquivo);
      if (checklist.length && intocado) p.checklist = checklist;
      p.origemTrello = { quadro, lista: nomeLista, cartaoId: c.id };
      p.status = status;
      relatorio.enriquecidos++;
    } else {
      processos.push({
        id: uid('doc'), contratoId: null, clienteId: cliente.id,
        clienteNome: cliente.nome, telefone: cliente.telefone || '', email: cliente.email || '',
        servico, vendedor: '', responsavel, status,
        checklist, anexos: soltos, etiquetas: c.etiquetas || [], acompanhamentos: acomp,
        boasVindasEnviada: false, autorizacaoSolicitada: false, autorizacaoConcedida: false,
        protocolo: null, semRetorno: false, semRetornoDesde: null,
        criadoEm: agora(), origemTrello: { quadro, lista: nomeLista, cartaoId: c.id },
      });
      relatorio.novos++;
    }
  }
}

// ─── RELATÓRIO ─────────────────────────────────────────────────────────────
const mb = arquivos.reduce((s, a) => s + a.tamanho, 0) / 1048576;
console.log(`\nLOTE ${LOTE || quadros.join(', ')}`);
console.log(`  quadros              : ${quadros.join(', ')}`);
console.log(`  processos novos      : ${relatorio.novos}`);
console.log(`  processos enriquecidos: ${relatorio.enriquecidos}  (já existiam, ganharam checklist/anexo/histórico)`);
console.log(`  clientes criados     : ${relatorio.clientesCriados}`);
console.log(`  anexos               : ${relatorio.anexos}  ·  ${mb.toFixed(1)} MB`);
if (repetidosCorrigidos.length) {
  console.log(`\n  IDS REPETIDOS CORRIGIDOS (${repetidosCorrigidos.length}):`);
  repetidosCorrigidos.forEach(r => console.log(`     ${r.antigo} → ${r.novo}   ${r.cliente} · ${r.servico}`));
}
console.log(`  processos no total   : ${estado.processos.length} → ${processos.length}`);
console.log(`  clientes no total    : ${estado.clientes.length} → ${estado.clientes.length + clientesNovos.length}`);
if (relatorio.porFuzzy.length) {
  console.log(`\n  ⚠ casados por nome aproximado (confira):`);
  relatorio.porFuzzy.forEach(x => console.log('     ' + x));
}
if (relatorio.semAnexo.length) {
  console.log(`\n  ⚠ sem o arquivo de anexos — entra só o texto:`);
  relatorio.semAnexo.forEach(q => console.log('     ' + q + '   (falta anexos-' + q.replace(/[^A-Za-z0-9]+/g,'-').toLowerCase() + '.json)'));
}

if (!arg('--gravar')) { console.log('\nSimulação. Rode com --gravar para gerar o arquivo.\n'); process.exit(0); }

const saida = path.join(__dirname, `importar-trello-lote${LOTE || 'x'}.json`);
fs.writeFileSync(saida, JSON.stringify({
  formato: 'legalway-backup-v1', gerado: agora(),
  observacao: `Trello lote ${LOTE} — ${quadros.join(', ')}`,
  arquivos,
  armazenamento: [
    { chave: 'legalway-processos-documentacao-v1', valor: processos },
    { chave: 'legalway-clientes-v1', valor: [...estado.clientes, ...clientesNovos] },
  ],
}));
console.log(`\nArquivo: ${saida}  (${(fs.statSync(saida).size/1048576).toFixed(1)} MB)`);
console.log('No sistema: Configurações → Restaurar de um backup.\n');
