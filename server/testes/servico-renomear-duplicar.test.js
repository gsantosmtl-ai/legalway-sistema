// "preciso conseguir alterar o nome do serviço, editar e também duplicar".
//
// Renomear já existia na lista de serviços, mas era uma armadilha: contrato,
// processo e lead guardam o NOME do serviço, não um id. Trocar o nome só ali
// partia o histórico em dois — metade dos contratos em "Visto T" e metade no
// nome novo, com o faturamento dividido entre os dois nos relatórios.
//
// Agora renomear troca em todo lugar e diz antes quantos registros vão mudar.
// E duplicar cria a variação do serviço com o checklist inteiro copiado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');

// Recorta uma função do HTML pelo casamento de chaves e devolve o texto dela.
function recortar(fonte, assinatura) {
  const i = fonte.indexOf(assinatura);
  assert.ok(i >= 0, `não achei ${assinatura}`);
  let nivel = 0, j = fonte.indexOf('{', i);
  for (let k = j; k < fonte.length; k++) {
    if (fonte[k] === '{') nivel++;
    else if (fonte[k] === '}') { nivel--; if (nivel === 0) return fonte.slice(i, k + 1); }
  }
  throw new Error(`chaves não fecham em ${assinatura}`);
}

// Monta um mundinho com os blocos de dados na memória e roda renomearServico
// de verdade contra ele. É o único jeito de provar que o nome chega nos
// contratos — ler o código não prova nada.
function mundo({ contratos = [], processos = [], leads = [], respostaDoCampo = 'Visto T humanitário', falharEm = null } = {}) {
  const blocos = {
    'legalway-contratos-v1': contratos,
    'legalway-processos-documentacao-v1': processos,
    'legalway-funil-v1': leads,
  };
  const toasts = [];
  const ctx = {
    servicos: [{ id: 'sv1', nome: 'Visto T', template: 'visto-t.html' }],
    checklists: [{ id: 'ck1', servico: 'Visto T', documentos: [{ nome: 'Passaporte', dica: 'colorido', precisaTraducao: true }] }],
    blocos,
    toast: (m) => toasts.push(m),
    toasts,
    renderConteudo: () => {},
    uid: (p) => p + '-novo',
    saveServicos: async () => null,
    saveChecklists: async () => null,
    checklistsAbertos: new Set(),
    guardarChecklistsAbertos: () => {},
    JSON, console,
    window: { storage: { get: async (chave) => ({ value: JSON.stringify(blocos[chave] || []) }) } },
    LW: {
      pedirTexto: async () => respostaDoCampo,
      gravar: async (chave, valor) => {
        if (falharEm === chave) return 'servidor fora do ar';
        blocos[chave] = JSON.parse(valor);
        return null;
      },
    },
  };
  vm.createContext(ctx);
  for (const f of ['const BLOCOS_COM_SERVICO = [', 'async function lerBloco(', 'async function ondeOServicoAparece(',
                   'function plural(', 'async function renomearServico(', 'function copiarDocumentos(',
                   'async function duplicarServico(']) {
    const trecho = f.startsWith('const')
      ? cfg.slice(cfg.indexOf(f), cfg.indexOf('];', cfg.indexOf(f)) + 2)
      : recortar(cfg, f);
    vm.runInContext(trecho, ctx);
  }
  return ctx;
}

test('renomear troca o nome nos contratos, processos e leads', async () => {
  const ctx = mundo({
    contratos: [{ id: 'c1', servico: 'Visto T' }, { id: 'c2', servico: 'EB-2 NIW' }, { id: 'c3', servico: 'Visto T' }],
    processos: [{ id: 'p1', servico: 'Visto T' }],
    leads: [{ id: 'l1', servico: 'Visto T' }, { id: 'l2', servico: 'Visto T' }],
  });
  await vm.runInContext('renomearServico(servicos[0])', ctx);
  assert.equal(ctx.servicos[0].nome, 'Visto T humanitário');
  assert.equal(ctx.checklists[0].servico, 'Visto T humanitário');
  assert.deepEqual(ctx.blocos['legalway-contratos-v1'].map(c => c.servico),
    ['Visto T humanitário', 'EB-2 NIW', 'Visto T humanitário'], 'os dois contratos do serviço mudam, o outro não');
  assert.equal(ctx.blocos['legalway-processos-documentacao-v1'][0].servico, 'Visto T humanitário');
  assert.deepEqual(ctx.blocos['legalway-funil-v1'].map(l => l.servico),
    ['Visto T humanitário', 'Visto T humanitário']);
  assert.match(ctx.toasts.join(' '), /2 contratos/, 'ela precisa ver o que mudou');
  assert.match(ctx.toasts.join(' '), /1 processo\b/, 'singular sem "s"');
});

test('se um bloco falhar ao salvar, ela fica sabendo qual', async () => {
  // Meia renomeação em silêncio é pior do que nenhuma: o relatório sai errado
  // e ninguém sabe por quê.
  const ctx = mundo({
    contratos: [{ id: 'c1', servico: 'Visto T' }],
    leads: [{ id: 'l1', servico: 'Visto T' }],
    falharEm: 'legalway-contratos-v1',
  });
  await vm.runInContext('renomearServico(servicos[0])', ctx);
  const dito = ctx.toasts.join(' ');
  assert.match(dito, /pendente/, 'tem que avisar que ficou pendente');
  assert.match(dito, /contrato/, 'e dizer que foi o contrato');
  assert.match(dito, /servidor fora do ar/, 'com o motivo do servidor');
});

test('renomear para um nome que já existe não passa', async () => {
  const ctx = mundo({ contratos: [{ id: 'c1', servico: 'Visto T' }], respostaDoCampo: 'EB-2 NIW' });
  ctx.servicos.push({ id: 'sv2', nome: 'EB-2 NIW', template: 'eb2niw.html' });
  await vm.runInContext('renomearServico(servicos[0])', ctx);
  assert.equal(ctx.servicos[0].nome, 'Visto T', 'o nome não pode ter mudado');
  assert.match(ctx.toasts.join(' '), /já existe/i);
  assert.equal(ctx.blocos['legalway-contratos-v1'][0].servico, 'Visto T', 'e nada pode ter vazado para os contratos');
});

test('cancelar o campo não mexe em nada', async () => {
  const ctx = mundo({ contratos: [{ id: 'c1', servico: 'Visto T' }], respostaDoCampo: null });
  await vm.runInContext('renomearServico(servicos[0])', ctx);
  assert.equal(ctx.servicos[0].nome, 'Visto T');
  assert.equal(ctx.blocos['legalway-contratos-v1'][0].servico, 'Visto T');
  assert.equal(ctx.toasts.length, 0, 'cancelar é silencioso');
});

test('duplicar copia o checklist inteiro, sem compartilhar objeto', async () => {
  const ctx = mundo({ respostaDoCampo: 'Visto T renovação' });
  ctx.checklists[0].documentos.push({ nome: 'Carta pessoal', dica: 'modelo em anexo', interno: false,
    modelo: { nome: 'carta.pdf', url: '/api/arquivos/9' } });
  ctx.checklists[0].documentosDependente = [{ nome: 'Passaporte do dependente', precisaTraducao: true }];
  await vm.runInContext('duplicarServico(servicos[0])', ctx);

  assert.equal(ctx.servicos.length, 2);
  assert.equal(ctx.servicos[1].nome, 'Visto T renovação');
  assert.equal(ctx.servicos[1].template, 'visto-t.html', 'o modelo de contrato vem junto');
  const copia = ctx.checklists.find(c => c.servico === 'Visto T renovação');
  assert.ok(copia, 'o checklist novo precisa existir');
  assert.deepEqual(copia.documentos.map(d => d.nome), ['Passaporte', 'Carta pessoal']);
  assert.equal(copia.documentos[1].modelo.url, '/api/arquivos/9', 'o modelo anexado vem junto');
  assert.deepEqual(copia.documentosDependente.map(d => d.nome), ['Passaporte do dependente']);

  // E é cópia de verdade: mexer num não pode mexer no outro.
  copia.documentos[0].nome = 'Passaporte válido';
  assert.equal(ctx.checklists[0].documentos[0].nome, 'Passaporte',
    'editar a cópia não pode alterar o original');
});

test('duplicar sugere um nome livre e abre o serviço novo', async () => {
  const ctx = mundo({ respostaDoCampo: 'Visto T (cópia)' });
  await vm.runInContext('duplicarServico(servicos[0])', ctx);
  assert.ok(ctx.checklistsAbertos.has('Visto T (cópia)'),
    'o serviço novo nasce aberto, para ela ajustar o que mudou');
});

test('duplicar para um nome que já existe não passa', async () => {
  const ctx = mundo({ respostaDoCampo: 'Visto T' });
  await vm.runInContext('duplicarServico(servicos[0])', ctx);
  assert.equal(ctx.servicos.length, 1, 'não pode nascer serviço repetido');
  assert.match(ctx.toasts.join(' '), /já existe/i);
});

test('os dois botões aparecem nas duas telas', () => {
  for (const marca of ['data-sv-renomear', 'data-sv-duplicar', 'data-ck-renomear', 'data-ck-duplicar']) {
    assert.ok(cfg.includes(marca + '="'), `falta o botão ${marca}`);
    assert.match(cfg, new RegExp(`querySelectorAll\\('\\[${marca}\\]'\\)`), `o botão ${marca} não está ligado em nada`);
  }
  // O campo de texto solto saiu: renomear agora é um ato deliberado, que mostra
  // o tamanho do estrago antes de fazer.
  assert.ok(!cfg.includes('data-sv-id="'), 'o campo que renomeava em silêncio tem que sair');
});

test('LW.pedirTexto existe e devolve null quando cancela', () => {
  assert.match(comum, /window\.LW\.pedirTexto = function\(titulo, descricao, valorInicial\)/,
    'falta o modal de pedir texto');
  const corpo = comum.slice(comum.indexOf('window.LW.pedirTexto'), comum.indexOf('perguntarDependentes'));
  assert.match(corpo, /fechar\(null\)/, 'cancelar devolve null');
  assert.match(corpo, /campo\.value\.trim\(\)/, 'o texto vem sem espaços nas pontas');
  assert.ok(!/window\.prompt/.test(corpo), 'prompt() do navegador congela a aba — não pode voltar');
});
