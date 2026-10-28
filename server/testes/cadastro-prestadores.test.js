// "Onde está para cadastrar os prestadores externos? Precisamos ter o campo,
// tanto psicóloga quanto tradutora."
//
// O cadastro existia, mas escondido: para cadastrar uma tradutora era preciso
// abrir um processo de cliente na Documentação, entrar na aba de Tradução e
// achar um botão lá dentro. Ninguém procura cadastro ali — procura em
// Configurações, que foi onde ela foi olhar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const prestadorPortal = readFileSync(new URL('../../docs/portal-prestador.html', import.meta.url), 'utf8');

test('existe uma aba de prestadores em Configurações', () => {
  // Sem o emoji: ele saiu das abas de Configurações, onde cinco tinham e
  // cinco não — a mesma inconsistência já corrigida nos títulos das páginas.
  assert.match(cfg, /<div class="tab2" data-tab="prestadores">\s*Prestadores externos<\/div>/, 'falta a aba');
  assert.match(cfg, /else if\(tabAtiva === 'prestadores'\) renderPrestadores\(el\);/, 'a aba precisa desenhar algo');
  assert.match(cfg, /const PRESTADORES_KEY = 'legalway-prestadores-externos-v1'/,
    'tem que ser a mesma lista que a Documentação usa, não uma paralela');
});

test('os dois tipos aparecem mesmo com as Regras vazias', () => {
  // Escritório que nunca mexeu nas Regras tem a lista de tipos vazia. Sem este
  // padrão, a aba abriria em branco e ela acharia que não dá para cadastrar.
  const i = cfg.indexOf('const lista = tipos.length ? tipos :');
  assert.ok(i > 0, 'falta o padrão');
  const linha = cfg.slice(i, cfg.indexOf('\n', i));
  assert.match(linha, /traducao/);
  assert.match(linha, /psicologica/);
});

test('os campos que ela pediu estão lá', () => {
  for (const campo of ['nome', 'email', 'telefone', 'valorPadrao']) {
    assert.ok(cfg.includes(`data-novo="\${escR(t.key)}|${campo}"`), `falta o campo ${campo} no cadastro`);
    assert.ok(cfg.includes(`data-pr="\${escR(pr.id)}|${campo}"`), `falta editar ${campo} de quem já existe`);
  }
});

test('dá para corrigir o cadastro, não só criar e apagar', () => {
  // O modal antigo só adicionava e removia: errar um telefone obrigava a apagar
  // e cadastrar de novo.
  const i = cfg.indexOf("alvo.querySelectorAll('[data-pr]')");
  const trecho = cfg.slice(i, i + 600);
  assert.match(trecho, /pr\[campo\] = campo === 'valorPadrao' \? \(Number\(inp\.value\) \|\| null\) : inp\.value\.trim\(\)/,
    'o valor precisa virar número e o resto texto sem espaços');
  assert.match(trecho, /const erro = await salvarPrestadores\(\)/, 'a correção precisa ser gravada');
});

test('não deixa cadastrar o mesmo nome duas vezes no mesmo tipo', () => {
  // Duas "Vitória" na lista de tradução e ninguém sabe para quem mandar.
  const i = cfg.indexOf('async function adicionarPrestador(tipo, el)');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /if\(prestadores\.some\(p=> tipoPrestador\(p\.tipo\) === tipo && \(p\.nome\|\|''\)\.trim\(\)\.toLowerCase\(\) === nome\.toLowerCase\(\)\)\)/,
    'falta a checagem de repetido');
});

test('"psicologia" e "psicologica" são a mesma coisa nas duas telas', () => {
  // A Documentação gravava 'psicologia'; as Regras e o portal do prestador
  // falam 'psicologica'. Enquanto só a Documentação lia o cadastro ninguém viu.
  // Com o cadastro em Configurações, a psicóloga cadastrada lá sumiria da
  // Documentação — ou o contrário.
  for (const [arquivo, src] of [['configuracoes', cfg], ['documentos', docs]]) {
    assert.match(src, /const tipoPrestador = \(t\)=> String\(t\|\|''\) === 'psicologia' \? 'psicologica' : String\(t\|\|''\);/,
      `falta o normalizador em ${arquivo}.html`);
  }
  assert.match(docs, /prestadores\.filter\(pr=>tipoPrestador\(pr\.tipo\)==='psicologica'\)/,
    'a Documentação precisa achar quem foi cadastrado dos dois jeitos');
  assert.match(prestadorPortal, /tipo === 'psicologica'/,
    'o portal do prestador é quem define o nome canônico');
});

test('sem permissão, a tela diz isso em vez de mostrar lista vazia', () => {
  // Lista vazia por 403 parece "ninguém cadastrado" — e aí alguém cadastra de
  // novo o que já existe.
  assert.match(cfg, /erroPrestadores = e\.message \|\| 'não consegui ler a lista'/, 'o erro precisa ser guardado');
  assert.match(cfg, /Não consegui abrir a lista de prestadores:/, 'e aparecer na tela');
  assert.match(cfg, /pertence a Documentação e ao Financeiro/, 'dizendo o motivo');
});
