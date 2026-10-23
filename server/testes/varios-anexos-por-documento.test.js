// "Precisamos deixar possível anexar mais de um arquivo também no checklist —
// não sendo obrigatório, mas quando necessário vai ter dois anexos."
//
// Frente e verso da certidão, duas páginas do passaporte. Antes o segundo
// arquivo substituía o primeiro, em silêncio, nos dois lados.
//
// E, no caminho, um defeito que já existia: a equipe gravava o anexo como
// TEXTO (a url) e o portal do cliente gravava como OBJETO. Documento enviado
// pelo cliente aparecia na tela da equipe como link quebrado — "[object
// Object]" no href — e a tradutora não conseguia baixá-lo, porque a guarda do
// pacote exigia `typeof d.arquivo === 'string'`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { arquivosDoItem } = await import('../src/arquivos.js');

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const portalSrv = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const portalTela = readFileSync(new URL('../../docs/portal-cliente.html', import.meta.url), 'utf8');

function leitorDaTela() {
  const i = docs.indexOf('function arquivosDoItem(d){');
  const fim = docs.indexOf('function esc(s){', i);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(docs.slice(i, fim) + '\nglobalThis.f = arquivosDoItem;', ctx);
  return ctx.f;
}

test('lê as três formas que existem nos dados', () => {
  const comoTexto = (v)=> JSON.stringify(v);
  for (const ler of [arquivosDoItem, leitorDaTela()]) {
    // Como a equipe gravava: texto solto, com o nome noutro campo.
    assert.equal(comoTexto(ler({ arquivo: '/api/arquivos/abc', nomeArquivo: 'rg.pdf' }).map(a => [a.nome, a.url])),
      comoTexto([['rg.pdf', '/api/arquivos/abc']]));
    // Como o portal gravava: objeto.
    assert.equal(comoTexto(ler({ arquivo: { nome: 'passaporte.pdf', url: '/api/arquivos/x' } }).map(a => a.nome)),
      comoTexto(['passaporte.pdf']));
    // A forma nova.
    assert.equal(comoTexto(ler({ arquivos: [{ nome: 'frente.jpg', url: '/a' }, { nome: 'verso.jpg', url: '/b' }] }).map(a => a.nome)),
      comoTexto(['frente.jpg', 'verso.jpg']));
    // Misturado: o antigo vem primeiro, porque chegou primeiro.
    assert.equal(comoTexto(ler({ arquivo: '/velho', nomeArquivo: 'velho.pdf', arquivos: [{ nome: 'novo.pdf', url: '/novo' }] }).map(a => a.nome)),
      comoTexto(['velho.pdf', 'novo.pdf']));
    assert.equal(comoTexto(ler(null)), '[]');
    assert.equal(comoTexto(ler({})), '[]');
  }
});

test('anexar acrescenta, não substitui — na equipe', () => {
  const i = docs.indexOf('async function anexarArquivoNoItem(p, idx, arquivo)');
  const corpo = docs.slice(i, docs.indexOf('\n}', i));
  assert.match(corpo, /item\.arquivos\.push\(\{ nome: arquivo\.name/, 'o novo entra na lista');
  assert.match(corpo, /if\(item\.arquivo\)\{ item\.arquivos\.unshift\(/,
    'o que estava no formato antigo vira o primeiro da lista, em vez de sumir');
  assert.ok(!/item\.arquivo = dataUrl/.test(corpo), 'não pode mais sobrescrever');
});

test('anexar acrescenta, não substitui — no portal do cliente', () => {
  const i = portalSrv.indexOf("rotasPortalCliente.post('/portal/documento'");
  const corpo = portalSrv.slice(i, portalSrv.indexOf('\n});', i));
  assert.match(corpo, /doc\.arquivos\.push\(anexo\)/);
  assert.match(corpo, /if \(doc\.arquivo\) \{ doc\.arquivos\.unshift\(doc\.arquivo\); doc\.arquivo = null; \}/);
  assert.match(corpo, /Acrescenta, não substitui/, 'a razão fica escrita');
});

test('a tradutora baixa qualquer um dos anexos do item', () => {
  // A guarda exigia `typeof d.arquivo === 'string'`: documento enviado pelo
  // cliente (objeto) nunca passava, e o pacote chegava incompleto.
  const arquivos = readFileSync(new URL('../src/arquivos.js', import.meta.url), 'utf8');
  assert.match(arquivos, /arquivosDoItem\(d\)\.some\(a => String\(a\.url \|\| ''\)\.includes\(id\)\)/);
  assert.ok(!/typeof d\.arquivo === 'string' && d\.arquivo\.includes\(id\)/.test(arquivos),
    'a guarda antiga precisa ter saído');
});

test('a tela da equipe mostra todos, e remove um por vez', () => {
  assert.match(docs, /data-remover-anexo="\$\{i\}\|\$\{k\}"/, 'o botão precisa saber QUAL anexo');
  const i = docs.indexOf("body.querySelectorAll('[data-remover-anexo]')");
  const corpo = docs.slice(i, docs.indexOf('\n      });', i));
  assert.match(corpo, /const restantes = anexos\.filter\(\(_, j\)=> j !== k\)/, 'tira só o escolhido');
  assert.match(corpo, /o outro continua ali/, 'e diz que o outro ficou');
  assert.match(docs, /\$\{anexos\.length \? 'Anexar mais um' : 'Anexar arquivo'\}/,
    'o botão muda de texto quando já há anexo — é o que mostra que dá para pôr outro');
  assert.match(docs, /enviadoPor === 'cliente' \? ' <span[^>]*>\(enviado pelo cliente\)/,
    'quem anexou importa na hora de conferir');
});

test('o cliente vê quantos arquivos já mandou', () => {
  assert.match(portalSrv, /arquivos: arquivosDoItem\(d\)\.map\(a => \(\{ nome: a\.nome, url: a\.url \}\)\)/);
  assert.match(portalTela, /d\.arquivos\.length === 1 \? 'Arquivo enviado' : d\.arquivos\.length \+ ' arquivos enviados'/);
  assert.match(portalTela, /'Enviar mais um arquivo' : 'Enviar arquivo'/,
    '"enviar outro" dava a entender que o primeiro seria trocado');
});

test('a contagem de anexados conta item, não arquivo', () => {
  // Um documento com frente e verso continua sendo UM documento anexado; senão
  // o cartão diria "18/17 anexados".
  assert.match(docs, /const docsAnexados = p\.checklist\.filter\(temAnexo\)\.length;/);
  assert.match(docs, /\$\{\(p\.checklist\|\|\[\]\)\.filter\(temAnexo\)\.length\} anexados/);
});
