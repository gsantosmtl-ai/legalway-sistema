// Tinha dois lugares para a mesma mensagem: "Templates de mensagem" e "Avisos
// automáticos". A dona do escritório abriu a tela e disse, com razão: "não
// estou entendendo a parte de avisos automáticos — boas-vindas então é aviso
// automático, tradução, aviso antes da cobrança... todos os templates de
// mensagens são automáticos".
//
// Agora é um lugar só. Toda mensagem que sai sozinha para o cliente vive na aba
// de mensagens automáticas, já criada e DESLIGADA, com o texto à vista. A aba
// antiga guarda apenas as duas que alguém copia e manda na mão, para prestador
// de fora.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { GATILHOS } = await import('../src/avisos-automaticos.js');

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

test('nenhuma mensagem fica escondida atrás de um "criar"', () => {
  // A lista se completa sozinha: um registro por gatilho que o motor conhece.
  assert.match(cfg, /if\(!avisos\.some\(a => a && a\.gatilho === g\.key\)\)\{ avisos\.push\(avisoEmBranco\(g\)\); completou = true; \}/,
    'a lista precisa se completar com todos os gatilhos');
  assert.match(cfg, /if\(completou\)\{\s*\n\s*const erro = await LW\.gravar\(AVISOS_KEY/,
    'o que foi completado precisa ficar salvo, senão volta a sumir');
  assert.match(cfg, /if\(erro\) toast\('Não consegui guardar a lista de mensagens: ' \+ erro\)/,
    'e se a gravação falhar, ela tem que ficar sabendo');
});

test('mensagem completada nasce desligada — ninguém recebe nada', () => {
  const i = cfg.indexOf('function avisoEmBranco(g){');
  assert.ok(i > 0, 'falta a função que cria o registro');
  const corpo = cfg.slice(i, cfg.indexOf('\n}', i));
  assert.match(corpo, /ativo: false/, 'nasce desligada, sem exceção');
  assert.ok(!/ativo: true/.test(corpo), 'nada aqui pode nascer ligado');
});

test('o texto que ela já tinha escrito vem para a mensagem nova', () => {
  // Se a mensagem nascesse com o padrão genérico, o texto no tom do escritório
  // — que ela escreveu à mão nos templates — sumiria da vista.
  const i = cfg.indexOf('const TEMPLATE_DO_GATILHO = {');
  assert.ok(i > 0, 'falta o mapa entre o template antigo e o gatilho');
  const mapa = cfg.slice(i, cfg.indexOf('};', i));
  for (const [gatilho, tpl] of [
    ['boasVindasDocumentos', 'boasvindas'],
    ['documentosPendentes', 'followupSemanal'],
    ['parcelaVencendo', 'cobrancaAviso'],
    ['cobrancaPaga', 'cobrancaOk'],
    ['cobrancaAtrasada', 'cobrancaFalha'],
  ]) {
    assert.ok(GATILHOS[gatilho], `o gatilho ${gatilho} precisa existir no motor`);
    assert.match(mapa, new RegExp(`${gatilho}:\\s*'${tpl}'`), `falta ligar ${gatilho} a ${tpl}`);
    assert.match(cfg, new RegExp(`${tpl}:`), `o template ${tpl} precisa existir na semente`);
  }
  assert.match(cfg, /return \(k && templates\[k\]\) \|\| g\.padrao \|\| ''/,
    'o texto dela vem primeiro; o padrão só entra quando não há texto escrito');
});

test('a aba antiga guarda só as mensagens enviadas na mão', () => {
  const i = cfg.indexOf('function renderTemplates(el){');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /tpl-traducao/, 'tradução é enviada na mão, fica');
  assert.match(corpo, /tpl-psicologica/, 'avaliação psicológica é enviada na mão, fica');
  for (const sumiu of ['tpl-boasvindas', 'tpl-cobrancaAviso', 'tpl-cobrancaOk', 'tpl-cobrancaFalha']) {
    assert.ok(!corpo.includes(sumiu), `${sumiu} virou mensagem automática — não pode ter dois lugares para o mesmo texto`);
  }
});

test('as abas dizem o que cada uma é', () => {
  assert.match(cfg, /data-tab="avisos">📬 Mensagens automáticas</, 'a aba das automáticas precisa dizer isso');
  assert.match(cfg, /data-tab="templates">✍️ Mensagens para prestadores</, 'a outra aba precisa dizer para quem é');
  // E a ordem importa: primeiro as automáticas, que são a maioria.
  assert.ok(cfg.indexOf('data-tab="avisos"') < cfg.indexOf('data-tab="templates"'),
    'as automáticas vêm antes');
});

test('a tela de Documentação usa o mesmo texto, não uma cópia velha', () => {
  assert.match(doc, /const avisoBoasVindas = avisos\.find\(a => a && a\.gatilho === 'boasVindasDocumentos' && a\.template\)/,
    'o botão de boas-vindas precisa ler a mensagem automática');
  assert.match(doc, /\(avisoBoasVindas && avisoBoasVindas\.template\) \|\| templates\.boasvindas/,
    'com o template antigo como reserva, para não quebrar quem nunca abriu a aba');
  assert.match(doc, /const AVISOS_KEY = 'legalway-avisos-automaticos-v1'/,
    'precisa ler o bloco certo');
});

test('formulário interno não entra na mensagem copiada na mão', () => {
  // Ela foi clara: o cliente não anexa formulário interno, então não faz
  // sentido pedir. O aviso automático já filtrava; o botão copiado não.
  assert.match(doc, /const listaDocumentos = p\.checklist\.filter\(d=>!d\.interno\)\.map/,
    'o checklist da mensagem precisa pular os itens internos');
  assert.match(doc, /quantidade: p\.checklist\.filter\(d=>!d\.interno\)\.length/,
    'a contagem tem que bater com a lista');
});

test('{cliente} é o primeiro nome nos dois caminhos', () => {
  // O aviso automático trata pelo primeiro nome. A mensagem copiada tem que
  // sair igual, senão o cliente recebe "Olá, MARIA DE FATIMA DOS SANTOS".
  assert.match(doc, /const primeiroNome = \(n\)=> String\(n \|\| ''\)\.trim\(\)\.split\(' '\)\[0\] \|\| ''/,
    'falta o primeiro nome na tela de Documentação');
  assert.match(doc, /cliente: primeiroNome\(p\.clienteNome\), nomeCompleto: p\.clienteNome/,
    'a mensagem de boas-vindas precisa usar o primeiro nome');
});

test('as chaves do texto padrão de boas-vindas todas têm valor', () => {
  // Texto com {responsavel} sem valor sai para o cliente com a chave crua.
  const chaves = [...new Set([...GATILHOS.boasVindasDocumentos.padrao.matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
  const i = doc.indexOf('const avisoBoasVindas =');
  const chamada = doc.slice(i, doc.indexOf('});', i));
  const resolvidas = new Set(['empresa', 'telefoneEmpresa']); // vêm das regras, em preencherTemplate
  for (const c of chaves) {
    if (resolvidas.has(c)) continue;
    assert.match(chamada, new RegExp(`\\b${c}:`), `{${c}} ficaria cru na mensagem`);
  }
});
