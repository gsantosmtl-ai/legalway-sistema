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
// O código do motor das mensagens: é lá que as boas-vindas acontecem agora.
const avisos = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');

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

// Os três testes que ficavam aqui cuidavam do BOTÃO MANUAL de boas-vindas da
// tela de Documentação: que ele lesse o mesmo texto da mensagem automática em
// vez de uma cópia velha, que pulasse os itens internos do checklist e que
// tratasse o cliente pelo primeiro nome.
//
// Essa aba saiu do sistema a pedido dela — "a aba de boas-vindas não precisa
// ter nos documentos, já que a mensagem será enviada automaticamente" — e a
// automação passou a mover o cartão de "Aguardando boas-vindas" para
// "Documentos solicitados", que antes só o botão fazia.
//
// A preocupação não sumiu, mudou de lugar: agora é a automação que precisa
// tratar o cliente pelo primeiro nome e pular o que é interno. Os três testes
// abaixo verificam isso onde a coisa acontece de verdade.

test('a mensagem automática trata o cliente pelo primeiro nome', () => {
  // Senão o cliente recebe "Olá, MARIA DE FATIMA DOS SANTOS".
  const i = avisos.indexOf('boasVindasDocumentos: {');
  const bloco = avisos.slice(i, avisos.indexOf('\n  },', i));
  assert.match(bloco, /cliente: primeiroNome\(p\.clienteNome\)/,
    'a automática precisa usar o primeiro nome');
  assert.match(bloco, /nomeCompleto: p\.clienteNome/,
    'e manter o nome inteiro disponível para quem quiser usar');
});

test('a mensagem automática não pede formulário interno ao cliente', () => {
  // O cliente não tem o que anexar num formulário interno do escritório.
  const i = avisos.indexOf('boasVindasDocumentos: {');
  const bloco = avisos.slice(i, avisos.indexOf('\n  },', i));
  assert.match(bloco, /pendentesDe\(p, d\.internoNoServico\)/,
    'a lista de documentos precisa passar pelo filtro do que é interno');
  assert.match(bloco, /quantidade: String\(faltam\.length\)/,
    'a contagem tem que bater com a lista que foi enviada');
});

test('a automática move o cartão, que era o que o botão manual fazia', () => {
  // Quem movia de "Aguardando boas-vindas" para "Documentos solicitados" era
  // o ato de copiar a mensagem. Sem isto, a mensagem sairia sozinha e o cartão
  // ficaria parado na primeira coluna para sempre.
  const i = avisos.indexOf('boasVindasDocumentos: {');
  const bloco = avisos.slice(i, avisos.indexOf('\n  },', i));
  assert.match(bloco, /alvo\.status === 'Aguardando boas-vindas'/,
    'só avança quem ainda está esperando as boas-vindas');
  assert.match(bloco, /alvo\.status = 'Documentos solicitados'/);
  assert.match(bloco, /historico\.push/, 'e o movimento fica registrado no histórico');
});

test('as chaves do texto padrão de boas-vindas todas têm valor', () => {
  // Texto com {responsavel} sem valor sai para o cliente com a chave crua:
  // "Quem vai te acompanhar é {responsavel}".
  //
  // Antes este teste olhava a chamada da TELA, porque era o botão manual que
  // montava a mensagem. Esse botão saiu; agora quem monta é a automação, e é
  // lá que a conferência tem de ser feita.
  const chaves = [...new Set([...GATILHOS.boasVindasDocumentos.padrao.matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
  const i = avisos.indexOf('boasVindasDocumentos: {');
  const bloco = avisos.slice(i, avisos.indexOf('\n  },', i));
  const valores = bloco.slice(bloco.indexOf('valores: {'), bloco.indexOf('titulo:'));
  const resolvidas = new Set(['empresa', 'telefoneEmpresa']); // vêm das regras, em preencherTemplate
  for (const c of chaves) {
    if (resolvidas.has(c)) continue;
    assert.match(valores, new RegExp(`\\b${c}:`), `{${c}} ficaria cru na mensagem automática`);
  }
});
