// "o vendedor podera adicionar 1 ou mais servicos na proposta, no contrato. o
//  contrato tem que mencionar todos os servicos contratados, porem apos a
//  assinatura, sera gerado 1 unico cliente, 1 unico financeiro, e cards no
//  funil de documentos individuais de cada servico."
//
// Exemplo dela: Motion + mudança de endereço — um contrato, um pagamento, dois
// processos que andam separados e têm checklist diferente.
//
// Roda o `automacoes.js` inteiro contra um banco em memória, como o servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoDeEnsaio } from './ajuda/banco-de-ensaio.js';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';
const { servicosDoContrato, servicosQueViramFicha, fichaDoMesmoCliente, outraFichaDaPessoa } = await import('../src/automacoes.js');

const AGORA = new Date().toISOString();
const CHECKLISTS = [
  { servico: 'Visto T + MOTION', documentos: [{ nome: 'Passaporte' }, { nome: 'Carta pessoal' }] },
  { servico: 'Mudança de Endereço', documentos: [{ nome: 'Comprovante novo' }] },
];

function contrato(extra = {}) {
  return { id: 'c1', cliente: 'Cliente Teste', telefone: '+1 407 555 0150', vendedor: 'Renato',
    etapa: 'Assinado', dataAssinatura: AGORA, valor: 3800, entrada: 800, numParcelas: 3, ...extra };
}

async function rodar(contratos, processos = []) {
  const b = bancoDeEnsaio({
    'legalway-contratos-v1': contratos,
    'legalway-clientes-v1': [], 'legalway-financeiro-v1': [],
    'legalway-processos-documentacao-v1': processos,
    'legalway-checklists-v1': CHECKLISTS,
    'legalway-sdr-v1': [], 'legalway-contas-pagar-v1': [], 'legalway-tarefas-v1': [],
    'legalway-contrato-assinado-c1': { assinadoEm: AGORA, pdf: '/x.pdf', anexos: [] },
  });
  const r = await b.rodar();
  assert.deepEqual(r.falhas, [], 'automação quebrou: ' + r.falhas.join(' · '));
  return { b, fichas: b.bloco('legalway-processos-documentacao-v1'),
    clientes: b.bloco('legalway-clientes-v1'), contas: b.bloco('legalway-financeiro-v1') };
}

// ---------------------------------------------------------------- a lista
test('contrato antigo, de um serviço só, vira uma lista de um item', () => {
  assert.deepEqual(servicosDoContrato({ servico: 'Visto T', dependentes: 2 }),
    [{ nome: 'Visto T', dependentes: 2, semFicha: false }]);
});

test('a lista aceita texto solto e número bagunçado', () => {
  assert.deepEqual(servicosDoContrato({ servicos: ['Motion', { nome: ' Mudança ', dependentes: '2' }] }),
    [{ nome: 'Motion', dependentes: 0, semFicha: false }, { nome: 'Mudança', dependentes: 2, semFicha: false }]);
});

test('serviço sem nome não vira ficha', () => {
  assert.deepEqual(servicosDoContrato({ servicos: [{ nome: '  ' }, { nome: 'Motion' }] }),
    [{ nome: 'Motion', dependentes: 0, semFicha: false }]);
  assert.deepEqual(servicosDoContrato({}), []);
  assert.deepEqual(servicosDoContrato(null), []);
});

// ---------------------------------------------------------------- o fluxo
test('dois serviços: duas fichas, um cliente, um financeiro', async () => {
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 2 }, { nome: 'Mudança de Endereço', dependentes: 0 }],
  })]);
  assert.equal(r.fichas.length, 2, 'uma ficha por serviço');
  assert.equal(JSON.stringify(r.fichas.map(f => f.servico)),
    JSON.stringify(['Visto T + MOTION', 'Mudança de Endereço']));
  assert.equal(r.clientes.length, 1, 'um cliente só');
  assert.equal(JSON.stringify(r.contas.map(x => x.descricao)),
    JSON.stringify(['Entrada', 'Parcela 1/3', 'Parcela 2/3', 'Parcela 3/3']),
    'um financeiro só, do contrato inteiro');
  assert.equal(r.contas.reduce((s, x) => s + x.valor, 0), 3800);
});

test('cada ficha nasce com o checklist do SEU serviço', async () => {
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 0 }, { nome: 'Mudança de Endereço', dependentes: 0 }],
  })]);
  const motion = r.fichas.find(f => f.servico === 'Visto T + MOTION');
  const mudanca = r.fichas.find(f => f.servico === 'Mudança de Endereço');
  assert.deepEqual(motion.checklist.map(d => d.nome), ['Passaporte', 'Carta pessoal']);
  assert.deepEqual(mudanca.checklist.map(d => d.nome), ['Comprovante novo']);
});

test('os dependentes são de cada serviço, não do contrato', async () => {
  // dois no visto principal e nenhum na mudança de endereço é o caso normal
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 2 }, { nome: 'Mudança de Endereço', dependentes: 0 }],
  })]);
  const motion = r.fichas.find(f => f.servico === 'Visto T + MOTION');
  const mudanca = r.fichas.find(f => f.servico === 'Mudança de Endereço');
  assert.equal(motion.dependentes, 2);
  assert.equal(mudanca.dependentes, 0);
  const grupos = [...new Set(motion.checklist.map(d => d.grupo).filter(Boolean))];
  assert.deepEqual(grupos, ['Dependente 1', 'Dependente 2']);
  assert.deepEqual(mudanca.checklist.filter(d => d.grupo), [], 'a mudança de endereço não ganha seção de dependente');
});

test('as fichas andam separadas', async () => {
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 0 }, { nome: 'Mudança de Endereço', dependentes: 0 }],
  })]);
  // ids diferentes, status próprio: mover uma não mexe na outra
  assert.notEqual(r.fichas[0].id, r.fichas[1].id);
  r.fichas[0].status = 'Protocolado';
  assert.equal(r.fichas[1].status, 'Aguardando boas-vindas');
});

test('rodar de novo não cria ficha repetida', async () => {
  const c = contrato({ servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 0 }, { nome: 'Mudança de Endereço', dependentes: 0 }] });
  const r = await rodar([c]);
  const antes = JSON.stringify(r.b.dados);
  await r.b.rodar();
  assert.equal(r.b.bloco('legalway-processos-documentacao-v1').length, 2);
  assert.equal(JSON.stringify(r.b.dados), antes, 'a segunda rodada não mexe em nada');
});

test('a ficha irmã não dispara o aviso de "já tem outra ficha"', async () => {
  // o aviso existe para o caso do Lucas — a mesma pessoa em contratos
  // diferentes. Duas fichas do MESMO contrato são de propósito.
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 0 }, { nome: 'Mudança de Endereço', dependentes: 0 }],
  })]);
  const avisos = r.fichas.flatMap(f => (f.historico || []).map(h => h.texto))
    .filter(t => /já tem outra ficha/.test(t));
  assert.deepEqual(avisos, [], 'nenhuma das duas pode acusar a outra');
});

test('mas a mesma pessoa em OUTRO contrato continua sendo avisada', () => {
  const processos = [{ id: 'd0', contratoId: 'contrato-antigo', clienteNome: 'Cliente Teste',
    telefone: '14075550150', servico: 'Asilo', status: 'Em acompanhamento' }];
  const nova = { id: 'd1', contratoId: 'c1', clienteNome: 'Cliente Teste', telefone: '14075550150' };
  const achou = outraFichaDaPessoa(processos.concat([nova]), contrato(), nova);
  assert.ok(achou, 'é o caso do Lucas e tem que continuar avisando');
  assert.equal(achou.servico, 'Asilo');
});

// ---------------------------------------------------------------- adoção
test('ficha órfã só é adotada pelo serviço certo', () => {
  const processos = [{ id: 'd0', clienteNome: 'Cliente Teste', telefone: '14075550150', servico: 'Visto T + MOTION' }];
  const c = contrato();
  assert.equal(fichaDoMesmoCliente(processos, c, 'Mudança de Endereço'), null,
    'a ficha de Motion não pode ser adotada pela mudança de endereço');
  const certa = fichaDoMesmoCliente(processos, c, 'Visto T + MOTION');
  assert.ok(certa && certa.ficha.id === 'd0');
});

test('ficha órfã sem serviço serve para qualquer um', () => {
  // é o caso das 49 fichas que vieram do Trello sem serviço
  const processos = [{ id: 'd0', clienteNome: 'Cliente Teste', telefone: '14075550150', servico: '' }];
  const achou = fichaDoMesmoCliente(processos, contrato(), 'Mudança de Endereço');
  assert.ok(achou && achou.ficha.id === 'd0');
});

test('adotar uma não impede a outra de nascer', async () => {
  const orfa = [{ id: 'd0', contratoId: null, clienteNome: 'Cliente Teste', telefone: '14075550150',
    servico: 'Visto T + MOTION', status: 'Recebendo documentos', checklist: [], historico: [] }];
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [{ nome: 'Visto T + MOTION', dependentes: 0 }, { nome: 'Mudança de Endereço', dependentes: 0 }],
  })], orfa);
  assert.equal(r.fichas.length, 2, 'a órfã é adotada e a outra é criada');
  const adotada = r.fichas.find(f => f.id === 'd0');
  assert.equal(adotada.contratoId, 'c1');
  assert.equal(adotada.status, 'Recebendo documentos', 'a órfã mantém onde estava');
  assert.ok(r.fichas.some(f => f.servico === 'Mudança de Endereço'));
});

// ---------------------------------------------------------------------------
// "o contrato tem que mencionar todos os servicos contratados"
import { readFileSync } from 'node:fs';
const contratosTela = readFileSync(new URL('../../docs/contratos.html', import.meta.url), 'utf8');
const MODELOS = ['eb2niw.html', 'visto-t.html', 'modelo.html'];
const tplUrl = new URL('../../docs/contratos-templates/', import.meta.url);

function corpoDaTela(fonte, assinatura) {
  const ini = fonte.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < fonte.length; i++) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return fonte.slice(ini, fim);
}

test('a tela de Contratos mostra todos os serviços, não só o principal', () => {
  assert.match(contratosTela, /function nomesDosServicos\(c\)/);
  for (const onde of ['card-meta', 'pendente-sub', "titulo:'Serviço'", "getElementById\\('dt-nome'\\)"]) {
    assert.match(contratosTela, new RegExp(onde + "[\\s\\S]{0,160}nomesDosServicos"),
      `${onde} ainda mostra só c.servico`);
  }
});

test('o link do contrato leva a lista para o modelo', () => {
  const corpo = corpoDaTela(contratosTela, 'async function gerarLinkContrato(c)');
  assert.match(corpo, /params\.set\('servicos', todosOsServicos\)/);
  assert.match(corpo, /params\.set\('servico', c\.servico\)/,
    'o principal continua indo: é ele que escolhe qual modelo abre');
});

test('os três modelos imprimem a lista no cabeçalho', () => {
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tplUrl), 'utf8');
    assert.match(html, /id="hdr-servicos"/, `${m}: falta a linha`);
    assert.match(html, /Serviços contratados: /, `${m}: falta o texto`);
    assert.match(html, /p\.get\("servicos"\)|p\.get\('servicos'\)/, `${m}: não lê o parâmetro`);
  }
});

test('com um serviço só, o contrato não muda', () => {
  // a linha fica escondida e o cabeçalho segue como sempre
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tplUrl), 'utf8');
    assert.match(html, /if\(!todos\) return;/, `${m}: deveria sair cedo sem a lista`);
    assert.match(html, /style="display:none;/, `${m}: a linha nasce escondida`);
  }
  const corpo = corpoDaTela(contratosTela, 'async function gerarLinkContrato(c)');
  assert.match(corpo, /todosOsServicos !== c\.servico/,
    'contrato de um serviço não manda o parâmetro à toa');
});

// ---------------------------------------------------------------------------
// Os que já existem: 17 contratos com os serviços digitados num campo só
// ("Mudança de Endereço + MOTION"). Nenhum desses nomes existe no cadastro, e
// por isso as 13 fichas correspondentes nasceram SEM CHECKLIST — a Documentação
// ficou sem lista de documentos para trabalhar.
import vm from 'node:vm';
const docsTela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

function corpoDocs(assinatura) {
  const ini = docsTela.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = docsTela.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < docsTela.length; i++) { if (docsTela[i] === '{') nivel++; else if (docsTela[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return docsTela.slice(ini, fim);
}

function rodarDocs(trechos, expr, ctx = {}) {
  const c = Object.assign({ checklists: [], contratos: [], processos: [] }, ctx);
  vm.createContext(c);
  const i = docsTela.indexOf('const semAcDoc =');
  const base = docsTela.slice(i, docsTela.indexOf('\n\n', i));   // semAcDoc + chaveServico
  new vm.Script(base + '\n' + trechos.map(corpoDocs).join('\n') + `\nvar r = JSON.stringify(${expr});`).runInContext(c);
  return JSON.parse(c.r);
}

test('acha os contratos com serviços juntos, e só esses', () => {
  const contratos = [
    { id: 'a', etapa: 'Assinado', servico: 'Mudança de Endereço + MOTION' },
    { id: 'b', etapa: 'Assinado', servico: 'Visto T' },
    { id: 'c', etapa: 'Cancelado', servico: 'Visto T + MOTION' },
    { id: 'd', etapa: 'Assinado', servico: 'Visto T + MOTION', servicos: [{ nome: 'Visto T' }] },
  ];
  const r = rodarDocs(['function contratosCombinados()'], 'contratosCombinados().map(c=>c.id)', { contratos });
  assert.deepEqual(r, ['a'], 'cancelado fica de fora, e já separado também');
});

test('o palpite de modelo casa grafia e sufixo', () => {
  const checklists = [{ servico: 'Visto T' }, { servico: 'MOTION' },
    { servico: 'Mudança de Endereço EOIR' }, { servico: 'Tradução de Documentos' }];
  const m = (n) => rodarDocs(['function modeloParecido(nome)'], `modeloParecido(${JSON.stringify(n)})`, { checklists });
  assert.equal(m('Visto T'), 'Visto T', 'exato ganha');
  assert.equal(m('Mudança de Endereço'), 'Mudança de Endereço EOIR', 'o cadastro só tem a da corte');
  assert.equal(m('Tradução dos documentos'), 'Tradução de Documentos', 'grafia diferente');
  assert.equal(m('Coisa que não existe'), '', 'sem palpite, fica em branco para a pessoa escolher');
});

test('a ferramenta propõe, mas quem aplica é gente', () => {
  const corpo = corpoDocs('function abrirSeparacao()');
  assert.match(corpo, /<select data-sep-parte=/, 'um seletor por serviço');
  assert.match(corpo, /data-sep-dep=/, 'e os dependentes de cada um');
  assert.match(corpo, /data-sep-aplicar=/, 'o aplicar é por linha, não em massa');
  assert.match(corpo, /modeloParecido\(parte\) \? 'selected'/, 'o palpite vem pré-escolhido');
});

test('separar exige escolha, e recusa dois iguais', () => {
  const corpo = corpoDocs('async function aplicarSeparacao(contratoId)');
  assert.match(corpo, /escolhas\.some\(x => !x\.nome\)/);
  assert.match(corpo, /new Set\(escolhas\.map\(x=>x\.nome\)\)\.size !== escolhas\.length/);
  assert.match(corpo, /LW\.confirmar\(/, 'e confirma antes de mexer no contrato');
});

test('a ficha que já existe é preservada, não recriada', () => {
  const corpo = corpoDocs('async function aplicarSeparacao(contratoId)');
  assert.match(corpo, /if\(!\(ficha\.checklist \|\| \[\]\)\.length\)\{/,
    'ficha com documento já recebido não pode ser zerada por uma correção');
  assert.match(corpo, /ficha\.servico = escolhas\[0\]\.nome/, 'ela fica com o primeiro serviço');
});

test('se a gravação falhar, nada fica pela metade', () => {
  const corpo = corpoDocs('async function aplicarSeparacao(contratoId)');
  assert.match(corpo, /c\.servico = antes\.servico; c\.servicos = antes\.servicos;/);
  assert.match(corpo, /ficha\.servico = antes\.fichaServico; ficha\.checklist = antes\.fichaChecklist;/);
});

test('o botão só aparece quando há o que separar', () => {
  const i = docsTela.indexOf("id=\"abrir-separar\"");
  assert.ok(i > 0);
  const trecho = docsTela.slice(i - 260, i);
  assert.match(trecho, /const n = contratosCombinados\(\)\.length;\s*\n?\s*return n \?/);
});

test('reencontra o contrato DEPOIS da pergunta, e recusa separar duas vezes', () => {
  // Enquanto a caixa de confirmação está aberta a tela pode recarregar, e
  // `loadAll()` troca os arrays por cópias novas: o objeto de antes vira órfão.
  // É o mesmo defeito que impedia o anexo de ir para o checklist.
  const corpo = corpoDocs('async function aplicarSeparacao(contratoId)');
  const iPergunta = corpo.indexOf('await LW.confirmar(');
  const iResolve = corpo.indexOf('const vivo = (contratos || []).find(x => x.id === contratoId)');
  assert.ok(iResolve > iPergunta, 'o contrato tem que ser reencontrado DEPOIS da pergunta');
  const iFicha = corpo.indexOf('const ficha = (processos || []).find');
  assert.ok(iFicha > iPergunta, 'a ficha também');
  assert.match(corpo.slice(iResolve), /Array\.isArray\(vivo\.servicos\) && vivo\.servicos\.length/,
    'e se outra pessoa já separou enquanto a caixa estava aberta, não separa de novo');
});

// ---------------------------------------------------------------------------
// "traducao dos documentos nao vira um card."
//
// Nem todo serviço contratado vira um processo no quadro. A tradução é vendida
// junto com o visto, aparece no contrato como serviço contratado, mas é
// trabalho DENTRO do processo principal — virar card só encheria o quadro de
// cartão que ninguém move.
test('serviço marcado como sem ficha não vira card', async () => {
  const r = await rodar([contrato({
    servico: 'Visto T + MOTION',
    servicos: [
      { nome: 'Visto T + MOTION', dependentes: 1 },
      { nome: 'Tradução de Documentos', dependentes: 0, semFicha: true },
    ],
  })]);
  assert.equal(r.fichas.length, 1, 'só o serviço principal vira ficha');
  assert.equal(r.fichas[0].servico, 'Visto T + MOTION');
});

test('mas ele continua no contrato, para o cliente ver o que comprou', () => {
  const c = { servicos: [{ nome: 'Visto T' }, { nome: 'Tradução de Documentos', semFicha: true }] };
  assert.deepEqual(servicosDoContrato(c).map(s => s.nome), ['Visto T', 'Tradução de Documentos'],
    'a lista do contrato traz todos');
  assert.deepEqual(servicosQueViramFicha(c).map(s => s.nome), ['Visto T'],
    'e só o que trabalha separado abre ficha');
});

test('tradução vendida SOZINHA continua virando ficha', async () => {
  // é produto dela: há contrato só de tradução, de US$ 250
  const r = await rodar([contrato({ servico: 'Tradução de Documentos',
    servicos: [{ nome: 'Tradução de Documentos', dependentes: 0 }] })]);
  assert.equal(r.fichas.length, 1);
  assert.equal(r.fichas[0].servico, 'Tradução de Documentos');
});

test('contrato sem nenhum serviço que vire ficha não quebra a automação', async () => {
  const r = await rodar([contrato({ servico: 'Tradução de Documentos',
    servicos: [{ nome: 'Tradução de Documentos', semFicha: true }] })]);
  assert.equal(r.fichas.length, 0);
  assert.equal(r.clientes.length, 1, 'o cliente e o financeiro nascem do mesmo jeito');
  assert.ok(r.contas.length > 0);
});

// ---------------------------------------------------------------------------
// A marca "sem ficha" nas telas
test('a proposta deixa marcar se o serviço vira ficha', () => {
  const funil = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');
  assert.match(funil, /data-sv-ficha=/);
  const i = funil.indexOf("alvo.querySelectorAll('[data-sv-ficha]')");
  const corpo = funil.slice(i, i + 500);
  assert.match(corpo, /semFicha = !el\.checked/);
  assert.match(corpo, /dependentes = 0/, 'sem ficha não há checklist onde pôr dependente');
});

test('tradução entra desmarcada quando é acrescentada a outro serviço', () => {
  const funil = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');
  assert.match(funil, /semFicha: \/tradu\/i\.test\(nome\) && servicosDaProposta\.length > 0/,
    'sozinha ela é o serviço e precisa de ficha; junto com outro, não');
});

test('a marca é gravada no lead e levada ao contrato', () => {
  const funil = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');
  const iSalvar = funil.indexOf('const servicos = servicosDaProposta.map');
  assert.match(funil.slice(iSalvar, iSalvar + 260), /semFicha: !!x\.semFicha/);
  const iGanho = funil.indexOf('? l.comercial.servicos.map');
  assert.match(funil.slice(iGanho, iGanho + 200), /semFicha: !!x\.semFicha/);
});

test('na ferramenta de separação, tradução já vem desmarcada', () => {
  assert.match(docsTela, /data-sep-ficha="\$\{esc\(c\.id\)\}:\$\{i\}" \$\{i===0 \|\| !\/tradu\/i\.test\(parte\) \? 'checked' : ''\}/);
});

test('o primeiro serviço não pode ser "sem ficha"', () => {
  // é ele que fica com a ficha que já existe; sem isso ela perderia o dono
  const corpo = corpoDocs('async function aplicarSeparacao(contratoId)');
  assert.match(corpo, /if\(escolhas\[0\]\.semFicha\)\{/);
});

test('serviço sem ficha é gravado com dependentes zerados', () => {
  const corpo = corpoDocs('async function aplicarSeparacao(contratoId)');
  assert.match(corpo, /dependentes: x\.semFicha \? 0 : x\.dependentes, semFicha: x\.semFicha/);
});

// ---------------------------------------------------------------------------
// "gostaria separar esses dois de forma manual, mesmo estar preso no contrato"
//
// A ferramenta da barra trabalha a partir do CONTRATO. Esta trabalha a partir
// do PROCESSO — que é onde a pessoa da documentação está quando abre a ficha e
// percebe que ali tem dois serviços.
test('a ficha com serviço combinado oferece separar por dentro', () => {
  assert.match(docsTela, /Este processo tem dois serviços juntos/);
  assert.match(docsTela, /id="sep-ficha-aplicar"/);
  assert.match(docsTela, /\$\{\/ \\\+ \/\.test\(String\(p\.servico\|\|''\)\)/,
    'só aparece quando o serviço tem " + "');
});

test('a ficha atual mantém tudo o que já tem', () => {
  const corpo = corpoDocs('async function separarFicha(id)');
  assert.match(corpo, /if\(!\(p\.checklist\|\|\[\]\)\.length\) p\.checklist = checklistDoServico/,
    'checklist com documento recebido não é refeito');
  assert.doesNotMatch(corpo, /p\.anexos = \[\]/, 'os anexos da ficha atual não são tocados');
});

test('a ficha nova nasce sem andamento próprio', () => {
  const corpo = corpoDocs('async function separarFicha(id)');
  for (const campo of ['protocolo: null', 'acompanhamentos: \\[\\]',
                       "status: 'Aguardando boas-vindas'", 'boasVindasEnviada: false']) {
    assert.match(corpo, new RegExp(campo), `a ficha nova deveria zerar ${campo}`);
  }
  assert.match(corpo, /i797: null, biometria: null/, 'inclusive os marcos do USCIS');
});

test('os anexos soltos vão para AS DUAS fichas', () => {
  // Quando o serviço veio escrito junto, os arquivos vieram junto também:
  // parte é de um serviço, parte do outro, e a máquina não sabe qual é qual.
  // Com os dois lados vendo tudo, a pessoa tira de cada ficha o que não é dela.
  const corpo = corpoDocs('async function separarFicha(id)');
  assert.match(corpo, /anexos: \(p\.anexos\|\|\[\]\)\.map\(a => \(\{ \.\.\.a, veioDaSeparacao: true \}\)\)/);
  assert.doesNotMatch(corpo, /anexos: \[\]/, 'a ficha nova não nasce sem anexo');
});

test('duplicar o anexo é seguro: remover de um lado não apaga do outro', () => {
  // o arquivo só some quando não aparece em bloco NENHUM nem no histórico
  const arquivos = readFileSync(new URL('../src/arquivos.js', import.meta.url), 'utf8');
  const corpo = arquivos.slice(arquivos.indexOf('export async function limparArquivosOrfaos()'));
  assert.match(corpo, /NOT EXISTS \(SELECT 1 FROM armazenamento m/);
  assert.match(corpo, /NOT EXISTS \(SELECT 1 FROM armazenamento_hist h/);
  // e a remoção na tela mexe só na lista daquela ficha
  const remover = docsTela.slice(docsTela.indexOf("body.querySelectorAll('[data-anexo-rm]')"), docsTela.indexOf("body.querySelectorAll('[data-anexo-rm]')") + 600);
  assert.match(remover, /p\.anexos\.splice\(i, 1\)/);
});

test('o anexo copiado fica marcado, para dar para distinguir depois', () => {
  assert.match(docsTela, /veio da separação/);
});

test('a confirmação avisa que os anexos vão para as duas', () => {
  const corpo = corpoDocs('async function separarFicha(id)');
  assert.match(corpo, /anexo\(s\) soltos aparecem nas duas/);
  assert.match(corpo, /remover de um lado não apaga do outro/);
});

test('não cria ficha nova se já existir uma daquele serviço no contrato', () => {
  const corpo = corpoDocs('async function separarFicha(id)');
  assert.match(corpo, /const jaTem = \(processos\|\|\[\]\)\.some\(x => x\.contratoId && x\.contratoId === p\.contratoId && \(x\.servico\|\|''\) === sv\.nome\)/);
});

test('o contrato é atualizado junto, senão a automação desfaz', () => {
  const corpo = corpoDocs('async function separarFicha(id)');
  assert.match(corpo, /c\.servicos = escolhas\.map/);
  assert.match(corpo, /if\(c && !\(Array\.isArray\(c\.servicos\) && c\.servicos\.length\)\)/,
    'contrato que já tem lista não é mexido');
});

test('separar pela ficha reencontra o processo depois da pergunta', () => {
  const corpo = corpoDocs('async function separarFicha(id)');
  const iPergunta = corpo.indexOf('await LW.confirmar(');
  const iResolve = corpo.indexOf('const p = (processos||[]).find(x => x.id === id)');
  assert.ok(iResolve > iPergunta, 'o mesmo cuidado do anexo');
  assert.match(corpo.slice(iResolve), /Alguém já separou esta ficha/);
});

test('se a gravação falhar, a ficha nova some junto', () => {
  const corpo = corpoDocs('async function separarFicha(id)');
  assert.match(corpo, /processos\.length = antes\.nProcessos/,
    'desfazer só a ficha e deixar a nova criada seria pior que não ter feito nada');
  assert.match(corpo, /p\.historico\.length = antes\.hist/);
});

test('tradução, aqui também, não vira card', () => {
  assert.match(docsTela, /data-sepf-ficha="\$\{i\}" \$\{i===0 \|\| !\/tradu\/i\.test\(parte\) \? 'checked' : ''\}/);
});
