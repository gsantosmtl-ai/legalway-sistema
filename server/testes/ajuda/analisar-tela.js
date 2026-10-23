// Leitor de telas para os testes: tira comentários, strings, templates e
// expressões regulares, e devolve o que foi DECLARADO e o que foi CHAMADO.
//
// Existe porque quatro defeitos do mesmo tipo chegaram à produção num dia só:
// função chamando algo que não existe naquela tela (`canal`, `fmtData`,
// `abrirDrawer`). Nenhum teste de leitura de texto pega isso — e um parser de
// verdade entraria como dependência, que este projeto não tem de propósito.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export function limpar(s) {
  let fora = '', i = 0;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } i++; fora += ' '; continue; }
    if (c === '`') {
      i++;
      while (i < s.length && s[i] !== '`') {
        if (s[i] === '\\') { i += 2; continue; }
        if (s[i] === '$' && s[i + 1] === '{') {                 // interpolação é código
          let n = 1; i += 2; const ini = i;
          while (i < s.length && n > 0) { if (s[i] === '{') n++; else if (s[i] === '}') n--; if (n > 0) i++; }
          fora += ' ' + limpar(s.slice(ini, i)) + ' '; i++; continue;
        }
        i++;
      }
      i++; fora += ' '; continue;
    }
    // Dividir ou abrir regex? Depende do que veio antes. Sem isto, /[&<>"']/g
    // abre uma "string" que engole o resto do arquivo.
    if (c === '/') {
      const ant = fora.replace(/\s+$/, '').slice(-1);
      if (ant === '' || '(,=:[!&|?{};+-*%~^<>'.includes(ant) || /\s/.test(ant)) {
        let j = i + 1, classe = false, fechou = false;
        while (j < s.length) {
          const ch = s[j];
          if (ch === '\\') { j += 2; continue; }
          if (ch === '\n') break;
          if (ch === '[') classe = true;
          else if (ch === ']') classe = false;
          else if (ch === '/' && !classe) { fechou = true; break; }
          j++;
        }
        if (fechou) { i = j + 1; while (i < s.length && /[a-z]/.test(s[i])) i++; fora += ' '; continue; }
      }
    }
    fora += c; i++;
  }
  return fora;
}

export function declarados(codigo) {
  const s = new Set();
  const res = [
    /\b(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\bclass\s+([A-Za-z_$][\w$]*)/g,
    /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g,
    /window\.([A-Za-z_$][\w$]*)\s*=/g,
  ];
  for (const re of res) { let m; re.lastIndex = 0; while ((m = re.exec(codigo))) s.add(m[1]); }
  for (const m of codigo.matchAll(/(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g))
    for (const p of m[1].split(',')) { const n = p.split(':').pop().split('=')[0].trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) s.add(n); }
  // Sem exigir nada ANTES do parêntese: em `new Promise((ok, falhou)=>{` o
  // parêntese dos parâmetros vem logo depois de outro parêntese, e a versão
  // anterior não casava — `ok` e `falhou` apareciam como função inexistente.
  for (const m of codigo.matchAll(/\(([^()]{0,300})\)\s*(?:=>|\{)/g))
    for (const p of m[1].split(',')) { const n = p.split(/[:=]/)[0].replace(/[{}[\].]/g, '').trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) s.add(n); }
  for (const m of codigo.matchAll(/(?:^|[^.\w])([A-Za-z_$][\w$]*)\s*=>/g)) s.add(m[1]);
  return s;
}

/** Só CHAMADAS: `nome(` que não é propriedade de ninguém. */
export function chamados(codigo) {
  const s = new Set();
  for (const m of codigo.matchAll(/(^|[^.\w$'"`])([A-Za-z_$][\w$]*)\s*\(/g)) s.add(m[2]);
  return s;
}

export const BUILTIN = new Set(('Array Object String Number Boolean Date Math JSON Map Set WeakMap WeakSet Promise RegExp '
  + 'Error TypeError RangeError parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI '
  + 'setTimeout setInterval clearTimeout clearInterval requestAnimationFrame cancelAnimationFrame fetch alert confirm prompt '
  + 'console structuredClone queueMicrotask FormData FileReader Blob File URL URLSearchParams Intl Symbol Proxy Reflect BigInt '
  + 'atob btoa crypto AbortController Image Audio Event CustomEvent MutationObserver IntersectionObserver ResizeObserver '
  + 'TextEncoder TextDecoder DecompressionStream CompressionStream Response Request Headers Notification '
  + 'Uint8Array Uint16Array Int8Array Float32Array Float64Array ArrayBuffer DataView '
  + 'if for while switch return typeof instanceof new delete void in of do else try catch finally throw function class '
  + 'super this async await yield get set static import export default extends case break continue let const var').split(/\s+/));

/** Bibliotecas carregadas por <script src>, que não moram no nosso código. */
export const DE_FORA = new Set(['JSZip', 'html2pdf', 'html2canvas', 'Chart']);

const DOCS = new URL('../../../docs/', import.meta.url).pathname;

export function scriptsDa(arquivo) {
  const txt = readFileSync(path.join(DOCS, arquivo), 'utf8');
  return [...txt.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
}
export const telasHtml = () => readdirSync(DOCS).filter(f => f.endsWith('.html'));
export function htmlDe(arquivo) { return readFileSync(path.join(DOCS, arquivo), 'utf8'); }

export function globaisCompartilhadas() {
  const junto = ['comum.js', 'api.js', 'storage.js']
    .map(f => readFileSync(path.join(DOCS, 'assets', f), 'utf8')).join('\n');
  return declarados(limpar(junto));
}
