#!/usr/bin/env node
// Lê a exportação do Trello e organiza em uma linha por cartão, para conferência
// antes de importar.
//
//   node ferramentas/organizar-trello.cjs                 → resumo na tela
//   node ferramentas/organizar-trello.cjs --quadro ASILO  → só um quadro
//   node ferramentas/organizar-trello.cjs --planilha      → gera o CSV de conferência
//
// Tudo o que você pode querer corrigir está nas tabelas lá em cima.
const fs = require('fs');
const path = require('path');
const AQUI = __dirname;
const P = path.join(AQUI, 'planilhas');

// ─── REGRAS ────────────────────────────────────────────────────────────────

// Cartões que são gabarito, não cliente.
const EH_MODELO = t => /NOME DO CLIENTE|^MODELO\b|^Modelo\b|MODELO$/i.test(t)
  || /^D-S160 VISA TURISTA$/i.test(t.trim());   // este ficou sem nome de cliente

// O serviço NÃO é o quadro: dentro de "LWG VISA T" há cartões de VAWA, MOTION e
// Green Card. Quando o título diz o serviço, é ele que vale.
// Testado de cima para baixo; o primeiro que casar ganha.
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

// Quando o título não diz o serviço, vale o quadro.
const SERVICO_DO_QUADRO = {
  'ASILO': 'Asilo',
  'FOIA': 'FOIA',
  'KAMMY ZUPPO': 'Petição Familiar',
  'LGW F1 STUDENT': 'F1 - Estudante',
  'LWG DS160': 'DS-160',
  'LWG EXTENSAO TURISTA': 'Extensão de Turista',
  'LWG VISA T': 'Visto T',
  'MOTION': 'MOTION',
  'MUDANCA DE CORTE/ONLINE': 'Mudança de Corte',
  'MUDANCA DE ENDERECO': 'Mudança de Endereço',
  'PASSAPORTES LGW': 'Renovação de Passaporte',
  'REAGENDAMENTO DE FINGER': 'Reagendamento de Finger',
  'SOCIAL E PERMIT': 'WORK PERMIT E SOCIAL',
};

// Lista do Trello → etapa do nosso kanban.
// As etapas do sistema: Aguardando boas-vindas · Documentos solicitados ·
// Recebendo documentos · Documentação completa · Aguardando autorização
// financeira · Liberado para protocolo · Protocolado · Em acompanhamento
//
// As listas do Trello que são NOME DE PESSOA viram responsável, não etapa —
// é o mesmo engano do Kommo, onde a coluna dizia ao mesmo tempo em que pé
// está e de quem é.
const PESSOAS = ['ELAINE', 'VITORIA', 'PETERSON'];

const ETAPA = {
  // cobrança e entrada
  'CLIENTES': 'Aguardando boas-vindas',
  'CLIENTES KAMMY': 'Aguardando boas-vindas',
  'CLIENTES PASSAPORTE': 'Aguardando boas-vindas',
  'CONTRATO ASSINADO': 'Aguardando boas-vindas',
  'CLIENTES DEVENDO': 'Aguardando autorização financeira',
  // documentos
  'AGUARDANDO DOC': 'Documentos solicitados',
  'NAO ENVIAM DOC': 'Documentos solicitados',
  'PROCESSO EM ANDAMENTO': 'Recebendo documentos',
  'LAUDO AGENDADO': 'Recebendo documentos',
  'AGUARDANDO TRADUCOES': 'Recebendo documentos',
  'AGURADANDO TRADUCAO': 'Recebendo documentos',
  // protocolo e depois
  'PEDIDO ENVIADO': 'Protocolado',
  'PROCESSO ENVIADO': 'Protocolado',
  'PROCESSO PROTOCOLADO': 'Protocolado',
  'MOTION PROTOCOLADA': 'Protocolado',
  'PETICAO FAMILIAR': 'Protocolado',
  'CASAMENTO': 'Protocolado',
  'I797C': 'Em acompanhamento',
  'NOTICE I797': 'Em acompanhamento',
  'FINGER PRINT': 'Em acompanhamento',
  'REAGENDAMENTO': 'Em acompanhamento',
  'ENVIADO AO CLIENTE': 'Em acompanhamento',   // reagendamento já mandado para a pessoa
  'MOTION': 'Em acompanhamento',
  // fim
  'PROCESSO FINALIZADO': 'Em acompanhamento',
  'FINALIZADO': 'Em acompanhamento',
  'FINALIZADOS': 'Em acompanhamento',
  'MOTION FINALIZADA': 'Em acompanhamento',
  'APROVADO': 'Em acompanhamento',
  'APROVADOS': 'Em acompanhamento',
  'FOIA RECEBIDO': 'Em acompanhamento',
};

// ─── LEITURA ───────────────────────────────────────────────────────────────
const dados = JSON.parse(fs.readFileSync(path.join(P, 'trello/trello-organizar.json'), 'utf8'));
const arg = f => process.argv.includes(f);
const iQ = process.argv.indexOf('--quadro');
const SO_QUADRO = iQ >= 0 ? process.argv[iQ + 1] : null;

const naoMapeado = new Set();
const linhas = [];

for (const [quadro, b] of Object.entries(dados.quadros)) {
  if (SO_QUADRO && quadro.toUpperCase() !== SO_QUADRO.toUpperCase()) continue;
  const lista = id => (b.listas.find(l => l.id === id) || {}).nome || '';
  for (const c of b.cartoes) {
    if (EH_MODELO(c.nome)) continue;
    const titulo = c.nome.trim();

    let servico = null, cliente = titulo;
    for (const [re, s] of PREFIXOS) {
      if (re.test(titulo)) { servico = s; cliente = titulo.replace(re, '').trim(); break; }
    }
    if (!servico) servico = SERVICO_DO_QUADRO[quadro] || quadro;

    const nomeLista = lista(c.idLista);
    const chave = nomeLista.toUpperCase().trim();
    const ehPessoa = PESSOAS.includes(chave);
    const etapa = ehPessoa ? 'Recebendo documentos' : ETAPA[chave];
    if (!etapa && !ehPessoa) naoMapeado.add(quadro + ' › ' + nomeLista);

    linhas.push({
      quadro, titulo, cliente, servico,
      lista: nomeLista,
      etapa: etapa || '(definir)',
      responsavel: ehPessoa ? nomeLista.charAt(0) + nomeLista.slice(1).toLowerCase() : '',
      documentos: c.checklists.reduce((s, k) => s + k.itens.length, 0),
      documentosFeitos: c.checklists.reduce((s, k) => s + k.itens.filter(i => i.feito).length, 0),
      anexos: c.anexos.length,
      anexosMB: (c.anexos.reduce((s, a) => s + (a.bytes || 0), 0) / 1048576).toFixed(1),
      comentarios: c.comentarios.length,
      temDescricao: c.descricao.trim() ? 'sim' : '',
      etiquetas: c.etiquetas.join(' / '),
      ultimaAtividade: String(c.ultimaAtividade).slice(0, 10),
      id: c.id,
    });
  }
}

// ─── SAÍDA ─────────────────────────────────────────────────────────────────
console.log('CARTÕES DE CLIENTE: ' + linhas.length + (SO_QUADRO ? '  (só ' + SO_QUADRO + ')' : ''));
const porServico = {};
linhas.forEach(l => porServico[l.servico] = (porServico[l.servico] || 0) + 1);
console.log('\nPOR SERVIÇO:');
Object.entries(porServico).sort((a, b) => b[1] - a[1])
  .forEach(([s, n]) => console.log('  ' + String(n).padStart(4) + '  ' + s));

const porEtapa = {};
linhas.forEach(l => porEtapa[l.etapa] = (porEtapa[l.etapa] || 0) + 1);
console.log('\nPOR ETAPA NO NOSSO KANBAN:');
Object.entries(porEtapa).sort((a, b) => b[1] - a[1])
  .forEach(([s, n]) => console.log('  ' + String(n).padStart(4) + '  ' + s));

const comResp = linhas.filter(l => l.responsavel);
if (comResp.length) {
  const r = {};
  comResp.forEach(l => r[l.responsavel] = (r[l.responsavel] || 0) + 1);
  console.log('\nRESPONSÁVEL (veio de lista que era nome de pessoa):');
  Object.entries(r).forEach(([s, n]) => console.log('  ' + String(n).padStart(4) + '  ' + s));
}

if (naoMapeado.size) {
  console.log('\n⚠ LISTAS SEM ETAPA DEFINIDA:');
  [...naoMapeado].forEach(x => console.log('   ' + x));
}

console.log('\nCONTEÚDO A TRAZER:');
console.log('  documentos no checklist : ' + linhas.reduce((s, l) => s + l.documentos, 0) +
            '  (' + linhas.reduce((s, l) => s + l.documentosFeitos, 0) + ' já marcados)');
console.log('  anexos                  : ' + linhas.reduce((s, l) => s + l.anexos, 0) +
            '  ·  ' + linhas.reduce((s, l) => s + Number(l.anexosMB), 0).toFixed(1) + ' MB');
console.log('  comentários             : ' + linhas.reduce((s, l) => s + l.comentarios, 0));
console.log('  cartões com descrição   : ' + linhas.filter(l => l.temDescricao).length);

if (arg('--planilha')) {
  const cols = ['quadro','titulo','cliente','servico','lista','etapa','responsavel',
                'documentos','documentosFeitos','anexos','anexosMB','comentarios',
                'temDescricao','etiquetas','ultimaAtividade','id'];
  const esc = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const nome = SO_QUADRO ? `trello-${SO_QUADRO.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv` : 'trello-tudo.csv';
  fs.writeFileSync(path.join(P, 'trello', nome),
    [cols.join(';'), ...linhas.map(l => cols.map(c => esc(l[c])).join(';'))].join('\n'));
  console.log('\nPlanilha: ' + path.join(P, 'trello', nome));
}
