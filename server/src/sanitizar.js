// Neutraliza HTML/script em qualquer texto que entra nos blocos de dados.
// As telas montam a interface com innerHTML sem escapar; como os dados agora são compartilhados
// (e parte vem de fora, pelo portal), um "<script>" num nome de lead rodaria no navegador de todo mundo.
// Regra: remove qualquer coisa que pareça tag (<b>, </div>, <img ...>, <script>) e "javascript:" em links.
const RE_TAG = /<\s*\/?\s*[a-zA-Z!?][^>]*>/g;
const RE_JS = /javascript\s*:/gi;
const RE_EVENTO = /\son\w+\s*=/gi;

export function limparTexto(s) {
  if (typeof s !== 'string' || s.length < 2) return s;
  if (s.startsWith('data:') || s.startsWith('/api/arquivos/')) return s; // arquivos e links do sistema ficam intactos
  return s.replace(RE_TAG, '').replace(RE_JS, '').replace(RE_EVENTO, ' ');
}
export function limparValor(v) {
  if (typeof v === 'string') return limparTexto(v);
  if (Array.isArray(v)) return v.map(limparValor);
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = limparValor(x); return o; }
  return v;
}
