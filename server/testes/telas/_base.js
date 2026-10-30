// Ferramentas da bateria por tela.
//
// A ideia: em vez de escrever um teste por bug conhecido, varrer TODA tela com
// a mesma lista de perguntas. O que uma tela esquece, a outra lembra — e a
// pergunta que ninguém fez é onde o bug mora.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const DOCS = path.join(RAIZ, 'docs');

export const TELAS = readdirSync(DOCS)
  .filter((f) => f.endsWith('.html'))
  .sort();

const cache = new Map();
export function lerTela(nome) {
  if (!cache.has(nome)) cache.set(nome, readFileSync(path.join(DOCS, nome), 'utf8'));
  return cache.get(nome);
}

/** Só o que está dentro de <script> sem src — o JavaScript da própria tela. */
export function scriptsDa(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

/** O HTML fora dos <script> e <style> — para não confundir código com marcação. */
export function marcacaoDe(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

/** Tira comentários de JS, para o teste não acusar o que está escrito num comentário. */
export function semComentarios(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ');
}

/** Rótulos visíveis de botão. */
export function rotulosDeBotao(html) {
  const out = [];
  const re = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  let m;
  while ((m = re.exec(html))) {
    const t = m[1].replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out;
}

// ---- o que o SERVIDOR oferece, montado a partir do código ----
const SRV = path.join(RAIZ, 'server', 'src');

/** Mapa: nome do router -> prefixo onde ele foi montado no index.js. */
function prefixos() {
  const index = readFileSync(path.join(SRV, 'index.js'), 'utf8');
  const m = {};
  for (const x of index.matchAll(/app\.use\(\s*'([^']+)'\s*,\s*(\w+)\s*\)/g)) m[x[2]] = x[1];
  return m;
}

/** Todas as rotas que o servidor realmente expõe, já com o prefixo. */
export function rotasDoServidor() {
  const pref = prefixos();
  const out = new Set();
  for (const f of readdirSync(SRV).filter((x) => x.endsWith('.js'))) {
    const txt = readFileSync(path.join(SRV, f), 'utf8');
    for (const m of txt.matchAll(/(\w+)\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      // Rota declarada direto no `app` já vem com o /api no caminho — é o caso
      // de /api/formularios, que eu quase reportei como rota inexistente.
      if (m[1] === 'app') { if (m[3].startsWith('/api')) out.add(m[3]); continue; }
      const base = pref[m[1]];
      if (base === undefined) continue;          // router que não está montado
      out.add((base + m[3]).replace(/\/+/g, '/'));
    }
  }
  return out;
}

/** Uma rota com :parametro casa com o que a tela chamou? */
export function rotaExiste(caminho, rotas) {
  const bruto = caminho.split('?')[0];
  // `LW.api('/stripe/repasses/' + id)` chega aqui como '/stripe/repasses/':
  // é um PREFIXO, e o que vem depois é o parâmetro.
  const ehPrefixo = bruto.endsWith('/');
  const limpo = '/api' + bruto.replace(/\/+$/, '');
  for (const r of rotas) {
    const re = new RegExp('^' + r.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/') + '$');
    if (re.test(limpo)) return true;
    if (ehPrefixo && r.startsWith(limpo + '/')) return true;   // a rota tem parâmetro logo depois
  }
  return false;
}

/** As chaves de armazenamento que o servidor conhece. */
export function chavesConhecidas() {
  const out = new Set();
  for (const f of readdirSync(SRV).filter((x) => x.endsWith('.js'))) {
    const txt = readFileSync(path.join(SRV, f), 'utf8');
    for (const m of txt.matchAll(/'(legalway-[a-z0-9-]+)'/g)) out.add(m[1]);
  }
  return out;
}
