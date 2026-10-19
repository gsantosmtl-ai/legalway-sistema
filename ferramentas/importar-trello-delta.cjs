#!/usr/bin/env node
// SOBE OS CARTÕES DO TRELLO QUE AINDA NÃO VIRARAM PROCESSO.
//
//   node ferramentas/importar-trello-delta.cjs --sistema ~/Downloads/backup.json
//   node ferramentas/importar-trello-delta.cjs --sistema ~/Downloads/backup.json --gravar
//
// Entra só o processo, com checklist e histórico. Os anexos vão depois, em
// lotes próprios: são 173,8 MB e o campo de arquivo do navegador aceita 10 MB
// por vez. Processo sem anexo já é útil — a equipe vê o caso, a lista de
// documentos e o que falta; o arquivo chega em seguida.
//
// Reaproveita regras-trello.cjs, que foi escrito e conferido na migração: ele
// sabe que o serviço não é o quadro (dentro de "LWG VISA T" há VAWA, MOTION e
// Green Card), conhece os cartões que são gabarito e traduz lista → etapa.
//
// O vínculo com o cliente é por NOME EXATO, e só isso. O mandato da auditoria
// proíbe criar relacionamento por semelhança, então quem não casa exato entra
// com contratoId nulo e aparece em Documentação para alguém ligar à mão. A
// tela de clientes já junta por nome, então o processo aparece no cliente
// certo mesmo sem o id — sem eu inventar um vínculo que ninguém conferiu.

const fs = require('fs');
const path = require('path');
const R = require('./regras-trello.cjs');

const P = path.join(__dirname, 'planilhas');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const GRAVAR = process.argv.includes('--gravar');
const K_PROC = 'legalway-processos-documentacao-v1';

const caminho = arg('--sistema', '');
if (!caminho || !fs.existsSync(caminho)) { console.error('Passe o backup com --sistema.'); process.exit(1); }
const fonte = path.join(P, 'trello-delta', 'trello-hoje.json');
if (!fs.existsSync(fonte)) { console.error('Falta ' + fonte); process.exit(1); }

const S = JSON.parse(fs.readFileSync(caminho, 'utf8'));
const pega = chave => {
  const b = (S.armazenamento || []).find(x => x.chave === chave);
  if (!b) return [];
  let v = b.valor; if (typeof v === 'string') v = JSON.parse(v);
  return Array.isArray(v) ? v : [];
};
const processos = pega(K_PROC);
const clientes = pega('legalway-clientes-v1');
const contratos = pega('legalway-contratos-v1');
const checklists = pega('legalway-checklists-v1');

const { cartoes } = JSON.parse(fs.readFileSync(fonte, 'utf8'));

// ---- o que já está ligado ----
const jaLigado = new Set(processos.map(p => (p.origemTrello || {}).cartaoId).filter(Boolean));

// ---- serviço a partir do título, com o quadro como último recurso ----
function servicoDe(cartao) {
  for (const [re, nome] of R.PREFIXOS) if (re.test(cartao.nome)) return nome;
  return R.SERVICO_DO_QUADRO[cartao.quadro] || '';
}
// ---- nome do cliente: tira o prefixo do serviço e o nome de quem cuida ----
function clienteDe(cartao) {
  let t = String(cartao.nome || '');
  for (const [re] of R.PREFIXOS) t = t.replace(re, '');
  for (const p of R.PESSOAS) t = t.replace(new RegExp('\\s*[-–—]?\\s*' + p + '\\s*$', 'i'), '');
  return t.replace(/\s{2,}/g, ' ').trim();
}
const statusDe = cartao => (R.ETAPA[cartao.lista] || R.ETAPA[(cartao.lista || '').toUpperCase()] || 'Aguardando boas-vindas');

const porNome = new Map();
for (const c of clientes) porNome.set(R.norm(c.nome), c);

const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const agora = new Date().toISOString();

const novos = [], pulados = { jaExiste: 0, modelo: 0, semNome: 0 };
const semCliente = [];

for (const c of cartoes) {
  if (jaLigado.has(c.cartaoId)) { pulados.jaExiste++; continue; }
  if (R.EH_MODELO(c.nome)) { pulados.modelo++; continue; }
  const nome = clienteDe(c);
  if (!nome) { pulados.semNome++; continue; }

  const servico = servicoDe(c);
  const cli = porNome.get(R.norm(nome)) || null;
  if (!cli) semCliente.push(nome);

  // checklist: o do cartão quando existe; senão o modelo do serviço
  let checklist = [];
  for (const k of (c.checklists || [])) {
    for (const i of (k.itens || [])) {
      checklist.push({ nome: i.nome, dica: '', grupo: k.nome && k.nome !== 'Checklist' ? k.nome : null,
        precisaTraducao: true, status: i.estado === 'complete' ? 'Aprovado' : 'Não solicitado' });
    }
  }
  if (!checklist.length) {
    const modelo = checklists.find(x => x.servico === servico);
    checklist = (modelo ? modelo.documentos || [] : []).map(d => ({
      nome: d.nome, dica: d.dica || '', grupo: null, precisaTraducao: d.precisaTraducao !== false, status: 'Não solicitado' }));
  }

  const contrato = cli ? contratos.find(ct => (cli.contratoIds || []).includes(ct.id)) : null;

  novos.push({
    id: uid('doc'),
    contratoId: contrato ? contrato.id : null,
    clienteNome: cli ? cli.nome : nome,
    telefone: cli ? cli.telefone || '' : '',
    email: cli ? cli.email || '' : '',
    servico, vendedor: contrato ? contrato.vendedor || '' : '',
    responsavel: '', status: statusDe(c),
    dependentes: 0,
    checklist,
    boasVindasEnviada: false, autorizacaoSolicitada: false, autorizacaoConcedida: false,
    protocolo: null, acompanhamentos: [], etiquetas: c.etiquetas || [],
    semRetorno: false, semRetornoDesde: null, ajudaVendedorSolicitadaEm: null,
    anexos: [],
    traducao: { status: 'nao_enviado', prestadorId: null, prestadorNome: null, enviadoEm: null, documentos: [],
      recebidoEm: null, valor: null, pagamentoGerado: false, confirmadoPeloPrestador: false, confirmadoEm: null,
      observacoesPrestador: '', arquivosRecebidos: [] },
    avaliacaoPsicologica: { necessaria: false, status: 'nao_iniciado', prestadorId: null, prestadorNome: null,
      dataConsulta: null, laudoRecebidoEm: null, valor: null, pagamentoGerado: false, laudoArquivo: null },
    origemTrello: { quadro: c.quadro, lista: c.lista, cartaoId: c.cartaoId },
    historico: [{ quando: agora,
      texto: `Importado do Trello — quadro "${c.quadro}", lista "${c.lista}"`
        + (c.anexos && c.anexos.length ? ` · ${c.anexos.length} anexo(s) entram em seguida` : '')
        + (cli ? '' : ' · cliente não encontrado pelo nome exato, falta ligar') }],
    criadoEm: agora,
  });
}

// ---- relatório ----
const pad = n => String(n).padStart(5);
console.log('');
console.log('TRELLO — CARTÕES QUE VIRAM PROCESSO' + (GRAVAR ? '' : '   (simulação)'));
console.log('');
console.log('  ' + pad(cartoes.length) + '  cartões no Trello');
console.log('  ' + pad(pulados.jaExiste) + '  já ligados a um processo');
if (pulados.modelo) console.log('  ' + pad(pulados.modelo) + '  gabaritos, não são cliente');
if (pulados.semNome) console.log('  ' + pad(pulados.semNome) + '  sem nome aproveitável');
console.log('  ' + pad(novos.length) + '  ENTRAM como processo novo   ←');
console.log('');
console.log('  ' + pad(processos.length) + '  processos antes');
console.log('  ' + pad(processos.length + novos.length) + '  processos depois');
console.log('');
const porServico = {};
for (const p of novos) porServico[p.servico || '(sem serviço)'] = (porServico[p.servico || '(sem serviço)'] || 0) + 1;
console.log('  POR SERVIÇO');
for (const [s, n] of Object.entries(porServico).sort((a, b) => b[1] - a[1])) console.log('    ' + pad(n) + '  ' + s);
console.log('');
console.log('  ' + pad(novos.filter(p => p.contratoId).length) + '  ligados a um contrato pelo nome exato');
console.log('  ' + pad(novos.filter(p => !p.contratoId).length) + '  sem contrato — aparecem em Documentação para alguém ligar');
console.log('  ' + pad(novos.reduce((s, p) => s + p.checklist.length, 0)) + '  itens de checklist no total');
console.log('');
if (semCliente.length) {
  console.log('  SEM CLIENTE CADASTRADO (primeiros 8)');
  for (const n of semCliente.slice(0, 8)) console.log('    · ' + n);
  console.log('');
}

if (!GRAVAR) { console.log('  Para gerar:  ... --gravar'); console.log(''); process.exit(0); }

const saida = { formato: 'legalway-backup-v1', geradoEm: agora, geradoPor: 'importar-trello-delta.cjs',
  armazenamento: [{ chave: K_PROC, valor: processos.concat(novos) }] };
const arq = path.join(P, 'trello-delta', 'subir-trello.json');
fs.writeFileSync(arq, JSON.stringify(saida));
console.log('  Arquivo: ferramentas/planilhas/trello-delta/subir-trello.json  ('
  + (fs.statSync(arq).size / 1048576).toFixed(1) + ' MB)');
console.log('  Sem anexos — eles vão em lotes depois.');
console.log('');
