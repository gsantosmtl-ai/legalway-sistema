// "Primeira coisa do portal: não pode aparecer se for interno."
//
// O sistema já escondia o que está marcado como interno — o que faltava era a
// marca. Nos 264 processos e nos 21 serviços, FORM I-914, FORM I-765,
// FORM G-1145, FORM I-914 SUPA e FORM LINK estavam com interno: false, e por
// isso apareciam no portal pedindo que o cliente anexasse um formulário que o
// escritório é quem preenche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

function ehFormulario() {
  const i = cfg.indexOf('const EH_FORMULARIO =');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(cfg.slice(i, cfg.indexOf('\n', i)) + '\nglobalThis.f = EH_FORMULARIO;', ctx);
  return ctx.f;
}
function ehDoCliente() {
  const i = cfg.indexOf('const EH_DO_CLIENTE =');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(cfg.slice(i, cfg.indexOf('\n', i)) + '\nglobalThis.f = EH_DO_CLIENTE;', ctx);
  return ctx.f;
}

test('reconhece os formulários que estavam vazando para o cliente', () => {
  const f = ehFormulario();
  for (const nome of ['FORM I-914 (Application for T Nonimmigrant Status)', 'FORM I-765',
                      'FORM G-1145', 'FORM I-914 SUPA', 'form i-765', '  FORM I-765']) {
    assert.equal(f(nome), true, `"${nome}" é formulário do escritório`);
  }
});

test('não leva junto o que é do cliente', () => {
  const f = ehFormulario();
  // "ASSINATURA DOS FORMS" é o cliente quem assina e manda de volta: esconder
  // isso seria o erro oposto, e pior — ele nunca saberia que tinha de assinar.
  for (const nome of ['ASSINATURA DOS FORMS', 'CARTA PESSOAL', 'CARTA TESTEMUNHA',
                      'FOTO EM FUNDO BRANCO', 'Passaporte', 'Formulário de uniformes', '']) {
    assert.equal(f(nome), false, `"${nome}" não pode ser escondido do cliente`);
  }
});

test('"FORM LINK (REGISTRO DE DADOS DO CLIENTE)" fica de fora — é o formulário DELE', () => {
  // Era o link do JotForm; virou o formulário de 63 campos do Visto T dentro do
  // sistema. Marcar como interno o esconderia do cliente para sempre, que é
  // exatamente o contrário do que se quer.
  const f = ehFormulario();
  assert.equal(f('FORM LINK (REGISTRO DE DADOS DO CLIENTE)'), false);
  assert.equal(f('FORM LINK'), false);
  assert.equal(f('form link (registro de dados do cliente)'), false);
  // E continua pegando os do escritório que vêm logo antes na mesma lista.
  assert.equal(f('FORM I-914 SUPA'), true);
});

test('item já ligado a um formulário do sistema é do cliente', () => {
  // Por definição: formulário que o sistema mostra é formulário que alguém
  // responde, e quem responde é o cliente.
  const ehDele = ehDoCliente();
  assert.equal(ehDele({ nome: 'FORM I-914', formularioId: 'visto-t' }), true);
  assert.equal(ehDele({ nome: 'FORM I-914', formularioId: '' }), false);
  assert.equal(ehDele({ nome: 'FORM I-914' }), false);
  assert.equal(ehDele(null), false, 'item vazio não pode quebrar a varredura');
  // E a varredura respeita isso nos dois lugares: na contagem e na marcação.
  assert.match(cfg, /if\(EH_FORMULARIO\(d\.nome\) && !d\.interno && !EH_DO_CLIENTE\(d\)\) achados\.set/,
    'a contagem precisa pular o que é do cliente');
  assert.match(cfg, /if\(EH_FORMULARIO\(d\.nome\) && !d\.interno && !EH_DO_CLIENTE\(d\)\)\{ d\.interno = true/,
    'a marcação precisa pular o que é do cliente');
});

test('o botão existe e está ligado', () => {
  assert.match(cfg, /id="ck-formularios-internos"/, 'falta o botão');
  assert.match(cfg, /document\.getElementById\('ck-formularios-internos'\)\.addEventListener\('click', marcarFormulariosInternos\)/,
    'o botão precisa estar ligado na função');
});

test('ela vê o que vai ser marcado antes de marcar', () => {
  // São 264 processos: marcar em silêncio e descobrir depois não é opção.
  const i = cfg.indexOf('async function marcarFormulariosInternos()');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /const ok = await LW\.confirmar\(/, 'tem que confirmar');
  assert.match(corpo, /nomes\.map\(\(\[n,q\]\)=> `\$\{n\} \(\$\{q\}\)`\)\.join\(', '\)/,
    'a confirmação precisa listar os nomes e quantos de cada');
  assert.match(corpo, /if\(!ok\) return;/, 'cancelar não pode marcar nada');
});

test('marca nos serviços E nos processos que já existem', () => {
  // Marcar só no serviço arrumaria os clientes futuros e deixaria os 264 de
  // hoje vendo os formulários no portal.
  const i = cfg.indexOf('async function marcarFormulariosInternos()');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /checklists\.forEach\(c=>\{\s*\n\s*\(c\.documentos\|\|\[\]\)\.forEach\(d=> nosServicos \+= marcar\(d\)\)/,
    'falta marcar no checklist dos serviços');
  assert.match(corpo, /\(c\.documentosDependente\|\|\[\]\)\.forEach\(d=> nosServicos \+= marcar\(d\)\)/,
    'o checklist do dependente também');
  assert.match(corpo, /processos\.forEach\(p=> \(p\.checklist\|\|\[\]\)\.forEach\(d=> nosProcessos \+= marcar\(d\)\)\)/,
    'falta marcar nos processos dos clientes');
});

test('se a gravação falhar, ela fica sabendo o que ficou pela metade', () => {
  const i = cfg.indexOf('async function marcarFormulariosInternos()');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /if\(e2\)\{ toast\('Serviços salvos, mas os processos não: ' \+ e2\); return; \}/,
    'meia gravação em silêncio deixa o portal errado sem ninguém saber');
  assert.match(corpo, /Pronto: \$\{nosServicos\} no checklist dos serviços e \$\{nosProcessos\} nos processos/,
    'o resultado tem que dizer quanto mudou de cada lado');
});
