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
const crypto = require('crypto');
const P = path.join(__dirname, 'planilhas');

// As regras (quais cartões são modelo, qual serviço, qual etapa, os lotes)
// ficam em regras-trello.cjs, compartilhadas com o pente-fino-trello.cjs.
const { EH_MODELO, PREFIXOS, SERVICO_DO_QUADRO, PESSOAS, ETAPA, QUADRO_SEM_ETAPA, APELIDOS, LOTES, norm, fuzzy } = require('./regras-trello.cjs');

// ─── FERRAMENTAS ───────────────────────────────────────────────────────────
const arg = f => process.argv.includes(f);
const valor = f => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
let seq = 0;
const uid = p => `${p}tr${Date.now().toString(36)}${(seq++).toString(36)}`;
const agora = () => new Date().toISOString();

// O download exige id de 32 hex — é a segunda camada de segurança da rota
// /api/arquivos/<id>, depois da sessão. O id do Trello tem 24, então o
// servidor recusava o endereço antes mesmo de procurar o arquivo: os 79
// documentos do lote 3 entraram no banco e nenhum abria.
// Derivar do id do Trello em vez de sortear mantém o resultado igual a cada
// rodada — reimportar o mesmo lote não duplica arquivo no banco.
const idDeArquivo = (idTrello) =>
  crypto.createHash('sha256').update('trello:' + idTrello).digest('hex').slice(0, 32);

const trello = JSON.parse(fs.readFileSync(path.join(P, 'trello/trello-organizar.json'), 'utf8'));

// Normalmente o ponto de partida é o estado exportado do sistema. Com --base,
// parte do arquivo de importação anterior: é assim que as partes de um lote
// grande se encadeiam sem precisar subir uma e reexportar o sistema a cada vez.
let estado;
const BASE = valor('--base');
if (BASE) {
  const b = JSON.parse(fs.readFileSync(path.isAbsolute(BASE) ? BASE : path.join(__dirname, BASE), 'utf8'));
  const bloco = k => (b.armazenamento.find(x => x.chave === k) || {}).valor || [];
  estado = { processos: bloco('legalway-processos-documentacao-v1'), clientes: bloco('legalway-clientes-v1'),
             servicos: [], checklists: [] };
} else {
  estado = JSON.parse(fs.readFileSync(path.join(P, 'estado-sistema.json'), 'utf8'));
}

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

// Processo → impressões digitais dos arquivos que ele já tem. Começa cheio, a
// partir do que veio no --base: um lote grande sai em 15 partes encadeadas, e
// quem tem dois cartões copiados pode cair em partes diferentes. Sem lembrar
// entre uma parte e outra, a Barbara ficaria com os mesmos 25 documentos duas
// vezes. A digital fica gravada no próprio anexo para a parte seguinte achar.
const jaTem = new Map();

const procPorChave = new Map();
processos.forEach((p, i) => {
  const chave = norm(p.clienteNome) + '|' + norm(p.servico);
  procPorChave.set(chave, i);
  const digitais = new Set();
  for (const a of p.anexos || []) if (a.digital) digitais.add(a.digital);
  for (const d of p.checklist || []) if (d.digital) digitais.add(d.digital);
  if (digitais.size) jaTem.set(chave, digitais);
});
const arquivos = [];

// Junta o checklist de dois cartões da mesma pessoa pelo nome do documento:
// o que um marcou como entregue o outro não desmarca, e o arquivo preso a uma
// linha nunca se perde.
function juntarChecklist(atual, novo) {
  if (!novo.length) return atual || [];
  const intocado = (atual || []).every(d => d.status === 'Não solicitado' && !d.arquivo);
  if (intocado) return novo;              // o genérico do sistema dá lugar ao do Trello
  const saida = (atual || []).map(d => ({ ...d }));
  for (const n of novo) {
    const igual = saida.find(d => norm(d.nome) === norm(n.nome));
    if (!igual) { saida.push(n); continue; }
    if (n.status === 'Aprovado') igual.status = 'Aprovado';
    if (n.arquivo && !igual.arquivo) { igual.arquivo = n.arquivo; igual.nomeArquivo = n.nomeArquivo; }
  }
  return saida;
}

const relatorio = { novos: 0, enriquecidos: 0, clientesCriados: 0, anexos: 0, repetidos: 0,
                    semAnexo: [], porFuzzy: [], porApelido: [], cartoesJuntados: [], vazios: [] };

// A equipe copia cartão: a mesma pessoa aparece duas vezes, uma na etapa
// antiga e outra na nova. Os dois cartões viram um processo só, e quem define
// a etapa tem que ser o cartão mexido por último — por isso a fila vai do mais
// antigo para o mais recente, e o último a entrar manda.
const fila = [];
for (const quadro of quadros) {
  const b = trello.quadros[quadro];
  if (!b) { console.error('quadro não encontrado: ' + quadro); continue; }

  // Anexos vêm de um arquivo à parte, baixado pelo navegador. Sem ele, o lote
  // entra só com texto — e o relatório diz quantos ficaram de fora.
  const base = 'anexos-' + quadro.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
  const caminhoAnexos = path.join(P, 'trello', base + '.json');
  // Quadro grande vem em pedaços numa pasta: o Visto T tem 1,91 GB e um JSON
  // só passa do tamanho máximo de texto que o Node consegue montar.
  const pasta = path.join(P, 'trello', quadro.replace(/^LWG /, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase());
  let anexosDoQuadro = null;
  if (fs.existsSync(caminhoAnexos)) anexosDoQuadro = JSON.parse(fs.readFileSync(caminhoAnexos, 'utf8'));
  else if (fs.existsSync(pasta) && fs.statSync(pasta).isDirectory()) {
    anexosDoQuadro = {};
    for (const f of fs.readdirSync(pasta).sort()) Object.assign(anexosDoQuadro, JSON.parse(fs.readFileSync(path.join(pasta, f), 'utf8')));
  }
  if (!anexosDoQuadro) relatorio.semAnexo.push(quadro);

  for (const c of b.cartoes) if (!EH_MODELO(c.nome)) fila.push({ quadro, b, anexosDoQuadro, c });
}
fila.sort((x, y) => String(x.c.ultimaAtividade).localeCompare(String(y.c.ultimaAtividade)));

// --parte 2/5: um lote grande não cabe num envio só. Corta a fila em pedaços de
// peso parecido (pelo tamanho dos anexos, que é o que pesa), sem partir cartão.
const PARTE = valor('--parte');
let rotulo = String(LOTE || quadros.join(', '));
if (PARTE) {
  const [k, m] = PARTE.split('/').map(Number);
  if (!(k >= 1 && m >= 1 && k <= m)) { console.error('--parte usa a forma k/m, por exemplo 2/5.'); process.exit(1); }
  const peso = x => x.c.anexos.reduce((t, a) => t + (a.bytes || 0), 0) + 50000;  // texto também pesa um pouco
  const total = fila.reduce((t, x) => t + peso(x), 0);
  const alvo = total / m;
  const pedacos = Array.from({ length: m }, () => []);
  let i = 0, acumulado = 0;
  for (const x of fila) {
    if (i < m - 1 && acumulado >= alvo * (i + 1)) i++;
    pedacos[i].push(x); acumulado += peso(x);
  }
  const meu = pedacos[k - 1];
  console.log(`\nparte ${k} de ${m}: ${meu.length} cartões de ${fila.length}  ·  ` +
              `${(meu.reduce((t, x) => t + peso(x), 0) / 1048576).toFixed(0)} MB`);
  fila.length = 0; fila.push(...meu);
  rotulo = `${LOTE}-parte${k}de${m}`;
}

{
  for (const { quadro, b, anexosDoQuadro, c } of fila) {
    const titulo = c.nome.trim();

    let servico = null, nome = titulo;
    for (const [re, s] of PREFIXOS) if (re.test(titulo)) { servico = s; nome = titulo.replace(re, '').trim(); break; }
    if (!servico) servico = SERVICO_DO_QUADRO[quadro] || quadro;

    const nomeLista = (b.listas.find(l => l.id === c.idLista) || {}).nome || '';
    const chave = nomeLista.toUpperCase().trim();
    const ehPessoa = PESSOAS.includes(chave);
    const status = QUADRO_SEM_ETAPA[quadro] ? QUADRO_SEM_ETAPA[quadro]
                 : ehPessoa ? 'Recebendo documentos'
                 : (ETAPA[chave] || 'Recebendo documentos');
    const responsavel = ehPessoa ? nomeLista.charAt(0) + nomeLista.slice(1).toLowerCase() : '';

    // cliente: apelido conhecido, nome exato, nome aproximado; se não houver, cria
    const apelido = APELIDOS[nome] || APELIDOS[nome.toUpperCase()];
    let cliente = apelido ? porNome.get(norm(apelido)) : porNome.get(norm(nome));
    if (apelido && cliente) relatorio.porApelido.push(nome + '  →  ' + cliente.nome);
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
    const chaveProc = norm(cliente.nome) + '|' + norm(servico);
    if (!jaTem.has(chaveProc)) jaTem.set(chaveProc, new Set());
    const digitais = jaTem.get(chaveProc);
    for (const a of doCartao) {
      // Cartão copiado traz os mesmos arquivos de novo. Subir duas vezes não
      // perde nada, mas a Vitória abriria o processo e veria cada documento
      // em dobro. A impressão digital do conteúdo resolve.
      // Anexo que já estava vazio no Trello (o upload falhou lá na origem).
      // Gravar um arquivo de zero byte só criaria um link que não abre.
      if (!a.conteudo || !a.tamanho) { relatorio.vazios.push(cliente.nome + ' · ' + a.nome); continue; }

      const digital = crypto.createHash('sha1').update(String(a.conteudo || '')).digest('hex');
      if (digitais.has(digital)) { relatorio.repetidos++; continue; }
      digitais.add(digital);

      const id = idDeArquivo(a.id);
      arquivos.push({ id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho,
                      conteudo: a.conteudo, criado_em: a.criado_em, criado_por: 'Importado do Trello' });
      relatorio.anexos++;
      const na = norm(a.nome).replace(/ (pdf|jpe?g|png|docx?)$/, '');
      const item = checklist.find(d => { const nd = norm(d.nome); return nd.length > 3 && (na.includes(nd) || nd.includes(na)); });
      if (item && !item.arquivo) { item.arquivo = '/api/arquivos/' + id; item.nomeArquivo = a.nome; item.digital = digital; }
      else soltos.push({ arquivoId: id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, idNoTrello: a.id,
                         digital, url: '/api/arquivos/' + id, origem: 'Trello', quando: a.criado_em });
    }

    // processo: se já existe um do mesmo cliente e serviço, acrescenta nele
    const posicao = procPorChave.get(chaveProc);
    if (posicao !== undefined) {
      const p = processos[posicao];
      p.acompanhamentos = [...(p.acompanhamentos || []), ...acomp];
      p.anexos = [...(p.anexos || []), ...soltos];
      p.etiquetas = [...new Set([...(p.etiquetas || []), ...(c.etiquetas || [])])];
      if (responsavel && !p.responsavel) p.responsavel = responsavel;
      p.checklist = juntarChecklist(p.checklist, checklist);
      // Dois cartões para a mesma pessoa: guarda os dois, e a etapa é a do
      // cartão mexido por último (a fila está em ordem de atividade).
      if (p.origemTrello) {
        relatorio.cartoesJuntados.push({ cliente: cliente.nome, servico,
          de: p.origemTrello.quadro + ' › ' + p.origemTrello.lista,
          para: quadro + ' › ' + nomeLista, etapa: status });
        p.origemTrelloAnteriores = [...(p.origemTrelloAnteriores || []), p.origemTrello];
      }
      p.origemTrello = { quadro, lista: nomeLista, cartaoId: c.id };
      p.status = status;
      relatorio.enriquecidos++;
    } else {
      const novo = {
        id: uid('doc'), contratoId: null, clienteId: cliente.id,
        clienteNome: cliente.nome, telefone: cliente.telefone || '', email: cliente.email || '',
        servico, vendedor: '', responsavel, status,
        checklist, anexos: soltos, etiquetas: c.etiquetas || [], acompanhamentos: acomp,
        boasVindasEnviada: false, autorizacaoSolicitada: false, autorizacaoConcedida: false,
        protocolo: null, semRetorno: false, semRetornoDesde: null,
        criadoEm: agora(), origemTrello: { quadro, lista: nomeLista, cartaoId: c.id },
      };
      processos.push(novo);
      // entra no índice: o segundo cartão da mesma pessoa cai no "já existe"
      procPorChave.set(chaveProc, processos.length - 1);
      relatorio.novos++;
    }
  }
}

// ─── RELATÓRIO ─────────────────────────────────────────────────────────────
const mb = arquivos.reduce((s, a) => s + a.tamanho, 0) / 1048576;
console.log(`\nLOTE ${rotulo}`);
console.log(`  quadros              : ${quadros.join(', ')}`);
console.log(`  processos novos      : ${relatorio.novos}`);
console.log(`  processos enriquecidos: ${relatorio.enriquecidos}  (já existiam, ganharam checklist/anexo/histórico)`);
console.log(`  clientes criados     : ${relatorio.clientesCriados}`);
console.log(`  anexos               : ${relatorio.anexos}  ·  ${mb.toFixed(1)} MB` +
            (relatorio.repetidos ? `   (${relatorio.repetidos} repetidos, deixados de fora)` : ''));
if (relatorio.vazios.length) {
  console.log(`\n  ⚠ ANEXO VAZIO NO PRÓPRIO TRELLO (${relatorio.vazios.length}) — não entra, não existe arquivo:`);
  relatorio.vazios.forEach(x => console.log('     ' + x));
}
if (relatorio.porApelido.length) {
  console.log(`\n  NOME DIFERENTE, MESMA PESSOA (${relatorio.porApelido.length}):`);
  relatorio.porApelido.forEach(x => console.log('     ' + x));
}
if (relatorio.cartoesJuntados.length) {
  console.log(`\n  CARTÕES REPETIDOS JUNTADOS (${relatorio.cartoesJuntados.length}):`);
  relatorio.cartoesJuntados.forEach(x => console.log(`     ${x.cliente} · ${x.servico}\n        ${x.de}\n        ${x.para}   →  fica em "${x.etapa}"`));
}
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

const blocos = [
  { chave: 'legalway-processos-documentacao-v1', valor: processos },
  { chave: 'legalway-clientes-v1', valor: [...estado.clientes, ...clientesNovos] },
];

// --fatias 7: um arquivo só fica grande demais para o envio automático do
// navegador. A restauração aceita os documentos de um lado e os registros do
// outro, e não repete documento que já entrou — então dá para mandar os
// documentos em pedaços pequenos e, por último, um arquivo leve com os
// registros. Se parar no meio, é só continuar de onde ficou.
const FATIAS = Number(valor('--fatias') || 0);
if (FATIAS > 0) {
  const limite = FATIAS * 1048576;
  const pedacos = [[]];
  let peso = 0;
  for (const a of arquivos) {
    const tam = String(a.conteudo || '').length + 400;
    if (peso && peso + tam > limite) { pedacos.push([]); peso = 0; }
    pedacos[pedacos.length - 1].push(a); peso += tam;
  }
  const feitos = [];
  pedacos.forEach((pedaco, i) => {
    if (!pedaco.length) return;
    const nome = path.join(__dirname, `importar-trello-lote${rotulo}-doc${String(i + 1).padStart(2, '0')}.json`);
    fs.writeFileSync(nome, JSON.stringify({
      formato: 'legalway-backup-v1', gerado: agora(),
      observacao: `Trello lote ${rotulo} — documentos ${i + 1} de ${pedacos.length}`,
      arquivos: pedaco, armazenamento: [],
    }));
    feitos.push(nome);
  });
  const ultimo = path.join(__dirname, `importar-trello-lote${rotulo}-registros.json`);
  fs.writeFileSync(ultimo, JSON.stringify({
    formato: 'legalway-backup-v1', gerado: agora(),
    observacao: `Trello lote ${rotulo} — registros (mandar por último)`,
    arquivos: [], armazenamento: blocos,
  }));
  feitos.push(ultimo);
  console.log(`\n${feitos.length} arquivos, nesta ordem:`);
  feitos.forEach(f => console.log('   ' + (fs.statSync(f).size / 1048576).toFixed(1).padStart(5) + ' MB  ' + path.basename(f)));
  console.log('\nOs "doc" podem ir em qualquer ordem; "registros" vai por último.\n');
} else {
  const saida = path.join(__dirname, `importar-trello-lote${rotulo}.json`);
  fs.writeFileSync(saida, JSON.stringify({
    formato: 'legalway-backup-v1', gerado: agora(),
    observacao: `Trello lote ${rotulo} — ${quadros.join(', ')}`,
    arquivos, armazenamento: blocos,
  }));
  console.log(`\nArquivo: ${saida}  (${(fs.statSync(saida).size/1048576).toFixed(1)} MB)`);
  console.log('No sistema: Configurações → Restaurar de um backup.\n');
}
