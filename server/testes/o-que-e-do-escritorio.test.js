// "Na mensagem de boas-vindas está indo o que é interno."
//
// A Lais recebeu um convite para anexar FORM I-914, FORM I-765, FORM G-1145,
// TRADUCAO DOC, TRADUCAO LAUDO e CAPA COMPLETA. Nada disso é dela: ou o
// escritório preenche, ou o escritório produz.
//
// O sistema já escondia o que está marcado como interno; faltava a marca. A
// primeira tentativa foi adivinhar pelo nome ("começa com FORM") — errado por
// construção: pegava os formulários e deixava passar a capa e as traduções, e
// nenhum padrão que eu invente conhece a operação dela. Agora a tela mostra
// TODOS os nomes de documento que existem e ela marca; o sistema só aplica.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

// Recorta uma const do HTML: de uma linha só, ou de bloco terminado em "};".
function pegar(nome) {
  const i = cfg.indexOf(`const ${nome} =`);
  assert.ok(i > 0, `não achei ${nome}`);
  const umaLinha = cfg.slice(i, cfg.indexOf('\n', i));
  const fonte = umaLinha.trimEnd().endsWith(';') ? umaLinha : cfg.slice(i, cfg.indexOf('\n};', i) + 3);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fonte + `\nglobalThis.f = ${nome};`, ctx);
  return ctx.f;
}

test('a sugestão inicial cobre formulário, capa e tradução', () => {
  // É só uma sugestão: a caixinha nasce marcada e ela desmarca o que não for.
  // Mas tem de alcançar o que apareceu na mensagem da Lais.
  const s = pegar('SUGESTAO_INTERNO');
  for (const nome of ['FORM I-914 (Application for T Nonimmigrant Status)', 'FORM I-765', 'FORM G-1145',
                      'FORM I-914 SUPA', 'CAPA COMPLETA', 'TRADUCAO DOC', 'TRADUCAO LAUDO', 'TRADUÇÃO DO LAUDO']) {
    assert.equal(s(nome), true, `"${nome}" apareceu na mensagem de boas-vindas e não é do cliente`);
  }
});

test('o que é do cliente não entra na sugestão', () => {
  const s = pegar('SUGESTAO_INTERNO');
  for (const nome of ['ASSINATURA DOS FORMS', 'FORM LINK (REGISTRO DE DADOS DO CLIENTE)',
                      'CARTA PESSOAL', 'CARTA TESTEMUNHA', 'FOTO EM FUNDO BRANCO',
                      'Passaporte', 'VISA/I-94', 'LAUDO', '']) {
    assert.equal(s(nome), false, `"${nome}" é do cliente — não pode nascer marcado`);
  }
});

test('formulário que o cliente preenche nunca vira interno', () => {
  const ehDele = pegar('EH_DO_CLIENTE');
  assert.equal(ehDele({ nome: 'FORM LINK', formularioId: 'visto-t' }), true);
  assert.equal(ehDele({ nome: 'FORM LINK', formularioId: '' }), false);
  assert.equal(ehDele(null), false, 'item vazio não pode quebrar a varredura');
  // E a aplicação respeita isso mesmo que o nome esteja marcado na lista.
  assert.match(cfg, /const querInterno = \(d\)=> marcados\.has\(\(d\.nome\|\|''\)\.trim\(\)\.toLowerCase\(\)\) && !EH_DO_CLIENTE\(d\)/,
    'nem por engano');
  assert.match(cfg, /\$\{x\.formulario\?'disabled':''\}/, 'e a caixinha dele fica travada na tela');
});

test('a tela mostra todo documento que existe, com onde ele aparece', () => {
  const i = cfg.indexOf('function levantarDocumentos(processos)');
  assert.ok(i > 0, 'falta o levantamento');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /checklists\.forEach/, 'precisa varrer os checklists dos serviços');
  assert.match(corpo, /\(c\.documentosDependente\|\|\[\]\)\.forEach/, 'e o do dependente');
  assert.match(corpo, /processos\.forEach\(p=> \(p\.checklist\|\|\[\]\)\.forEach\(d=> ver\(d,'processos'\)\)\)/,
    'e os processos dos clientes');
  assert.match(corpo, /sort\(\(a,b\)=> b\.total - a\.total/, 'o que aparece mais vem primeiro');
  assert.match(cfg, /\$\{x\.servicos\} no checklist/, 'ela precisa ver onde cada um aparece');
});

test('o que já está marcado nasce marcado, e o resto recebe a sugestão', () => {
  const i = cfg.indexOf('const marcados = new Set(');
  const linha = cfg.slice(i, cfg.indexOf('\n', i));
  assert.match(linha, /x\.internos > 0/, 'o que já é interno continua marcado');
  assert.match(linha, /x\.internos === 0 && SUGESTAO_INTERNO\(x\.nome\)/,
    'a sugestão só vale para quem nunca foi marcado em lugar nenhum');
});

test('aplica nos serviços E nos processos que já existem', () => {
  // Marcar só no serviço arrumaria os clientes futuros e deixaria a Lais
  // recebendo a mesma mensagem.
  const i = cfg.indexOf("fundo.querySelector('#pe-salvar').addEventListener");
  const corpo = cfg.slice(i, cfg.indexOf('\n  });', i));
  assert.match(corpo, /processos\.forEach\(p=> \(p\.checklist\|\|\[\]\)\.forEach\(d=> aplicar\(d, \(\)=> mudouProcesso\+\+\)\)\)/,
    'falta aplicar nos processos');
  assert.match(corpo, /if\(!!d\.interno === alvo\) return;/, 'não conta como mudança o que já estava certo');
  assert.match(corpo, /if\(e2\)\{ toast\('Serviços salvos, mas os processos não: ' \+ e2\)/,
    'meia gravação em silêncio deixa o portal errado sem ninguém saber');
});

test('desmarcar também vale — a marca não é só de ida', () => {
  // Se um documento foi marcado por engano, tirar a marca tem que devolvê-lo ao
  // cliente. `d.interno = alvo` faz os dois sentidos; `if (alvo) d.interno=true`
  // faria só um.
  const i = cfg.indexOf('const aplicar = (d, somar)=>');
  const corpo = cfg.slice(i, cfg.indexOf('};', i));
  assert.match(corpo, /d\.interno = alvo;/, 'tem que seguir a caixinha, marcada ou não');
});

test('o botão abre o painel', () => {
  assert.match(cfg, /id="ck-formularios-internos"[^>]*>🔒 O que é do escritório<\/button>/, 'falta o botão');
  assert.match(cfg, /document\.getElementById\('ck-formularios-internos'\)\.addEventListener\('click', abrirPainelDoEscritorio\)/,
    'o botão precisa abrir o painel');
});
