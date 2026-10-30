// A pré-carga é o que faz a tela abrir numa ida ao servidor em vez de dez.
// Quando ela fica atrasada em relação à tela, ninguém percebe: a tela continua
// funcionando, só devagar — cada chave que falta no lote vira uma viagem
// separada, e as pesadas aqui têm 800 kB, 1,6 MB, 2,3 MB.
//
// Era o caso de quatro telas. A Agenda buscava o funil (841 kB) e a fila do
// SDR (769 kB) uma a uma, depois do lote. O Financeiro, transferências e
// avisos. A de Documentação, os avisos. O Funil, os serviços.
//
// Este teste lê o corpo da função que a tela chama ao abrir e cobra o lote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storage = readFileSync(new URL('../../docs/assets/storage.js', import.meta.url), 'utf8');

function preCarga() {
  const i = storage.indexOf('const PRE_CARGA');
  assert.ok(i > 0, 'PRE_CARGA desapareceu do storage.js');
  const abre = storage.indexOf('{', i);
  let nivel = 0;
  for (let k = abre; k < storage.length; k++) {
    if (storage[k] === '{') nivel++;
    else if (storage[k] === '}') { nivel--; if (!nivel) return JSON.parse(storage.slice(abre, k + 1)); }
  }
  throw new Error('não fechei as chaves do PRE_CARGA');
}

// Recorta o corpo de uma função contando chaves. Fatia de tamanho fixo já me
// traiu quatro vezes: um comentário cresce e o alvo sai da janela.
function corpo(fonte, assinatura) {
  const i = fonte.indexOf(assinatura);
  if (i < 0) return '';
  const abre = fonte.indexOf('{', i);
  let nivel = 0;
  for (let k = abre; k < fonte.length; k++) {
    if (fonte[k] === '{') nivel++;
    else if (fonte[k] === '}') { nivel--; if (!nivel) return fonte.slice(abre, k + 1); }
  }
  return '';
}

// Chaves que a tela lê ao ABRIR: as escritas por extenso, as que vêm de
// `KEYS.algo` e as que vêm de uma constante em maiúsculas.
function chavesDaAbertura(pagina, funcoes) {
  const html = readFileSync(new URL(`../../docs/${pagina}.html`, import.meta.url), 'utf8');
  const objKeys = corpo(html, 'const KEYS');
  const deKeys = Object.fromEntries([...objKeys.matchAll(/(\w+)\s*:\s*'(legalway-[a-z0-9-]+-v\d)'/g)].map((m) => [m[1], m[2]]));
  const deConst = Object.fromEntries([...html.matchAll(/const ([A-Z_0-9]+)\s*=\s*'(legalway-[a-z0-9-]+-v\d)'/g)].map((m) => [m[1], m[2]]));
  const achadas = new Set();
  for (const f of funcoes) {
    const c = corpo(html, f);
    assert.ok(c, `não achei "${f}" em ${pagina}.html`);
    for (const m of c.matchAll(/legalway-[a-z0-9-]+-v\d/g)) achadas.add(m[0]);
    for (const m of c.matchAll(/KEYS\.(\w+)/g)) if (deKeys[m[1]]) achadas.add(deKeys[m[1]]);
    for (const m of c.matchAll(/\b([A-Z_0-9]{4,})\b/g)) if (deConst[m[1]]) achadas.add(deConst[m[1]]);
  }
  return achadas;
}

// Chave que NÃO vem do servidor: mora no localStorage desta pessoa.
const SO_LOCAL = new Set([
  'legalway-sessao-v1',
  'legalway-usuarios-v1',      // o api.js escreve no login; nunca existiu no servidor
]);
const ehLocal = (k) => SO_LOCAL.has(k) || /pref-|-lidas|-vistas|presenca|lastread/.test(k);

// página -> funções que rodam ao abrir
const ABERTURA = {
  'index': ['async function loadAll('],
  'documentos': ['async function loadAll('],
  'financeiro': ['async function loadAll('],
  'clientes': ['async function loadAll('],
  'contratos': ['async function loadAll('],
  'relatorios': ['async function loadAll('],
  'marketing': ['async function loadAll('],
  'processos': ['async function loadAll('],
  'tarefas': ['async function loadAll('],
  'entrada-leads': ['async function loadAll('],
  'agenda': ['async function loadAgenda('],
  'funil-comercial': ['async function loadLeads(', 'async function carregarServicos('],
};

for (const [pagina, funcoes] of Object.entries(ABERTURA)) {
  test(`${pagina}: o lote cobre tudo que a tela lê ao abrir`, () => {
    const lote = new Set(preCarga()[pagina] || []);
    assert.ok(lote.size, `${pagina} não tem pré-carga — abre uma viagem por chave`);
    const faltam = [...chavesDaAbertura(pagina, funcoes)].filter((k) => !ehLocal(k) && !lote.has(k)).sort();
    assert.deepEqual(faltam, [], `${pagina} busca estas chaves fora do lote, uma por uma`);
  });
}

test('o lote não pede chave que a tela nem menciona', () => {
  // Chave a mais no lote é peso que ninguém usa: ela é baixada sempre.
  const mapa = preCarga();
  const sobras = [];
  for (const [pagina, chaves] of Object.entries(mapa)) {
    const html = readFileSync(new URL(`../../docs/${pagina}.html`, import.meta.url), 'utf8');
    for (const k of chaves) if (!html.includes(k)) sobras.push(`${pagina} → ${k}`);
  }
  assert.deepEqual(sobras, []);
});

test('o lote caber no limite do servidor', () => {
  // A rota /storage-lote corta em 40 chaves.
  for (const [pagina, chaves] of Object.entries(preCarga())) {
    assert.ok(chaves.length <= 40, `${pagina} pede ${chaves.length} chaves`);
    assert.equal(new Set(chaves).size, chaves.length, `${pagina} tem chave repetida no lote`);
  }
});

test('nenhuma chave só-do-localStorage entrou no lote', () => {
  // Pedir ao servidor uma chave que vive no navegador dá 404 em toda abertura.
  for (const [pagina, chaves] of Object.entries(preCarga())) {
    for (const k of chaves) assert.equal(ehLocal(k), false, `${pagina} pede "${k}" ao servidor, e ela é local`);
  }
});
