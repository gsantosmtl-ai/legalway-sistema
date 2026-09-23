// Proteções de borda do servidor: limite de requisições, bloqueio de pedidos vindos de outro site
// (CSRF), tipos de arquivo aceitos e cabeçalhos de segurança das telas.
// Nada aqui depende de serviço externo — é tudo no próprio servidor.
// Cada bloqueio também é avisado ao Guardião (guardiao.js), que conta e, se insistirem, barra o endereço.
import { anotar } from './guardiao.js';

// ---------------- limite de requisições por IP ----------------
// Janela deslizante simples em memória. Reinicia a cada deploy, o que é aceitável:
// serve pra conter tentativa de força bruta, varredura e sobrecarga.
const janelas = new Map(); // ip -> { inicio, n, nPublico }
const MINUTO = 60_000;
const LIMITE_LOGADO = 600;   // por minuto, por IP (uma tela pesada faz ~30)
const LIMITE_PUBLICO = 90;   // rotas sem login: bem mais apertado

setInterval(() => { const agora = Date.now(); for (const [ip, j] of janelas) if (agora - j.inicio > 5 * MINUTO) janelas.delete(ip); }, MINUTO).unref?.();

export function limitePorIp(req, res, next) {
  const ip = req.ip || 'sem-ip';
  const agora = Date.now();
  let j = janelas.get(ip);
  if (!j || agora - j.inicio > MINUTO) { j = { inicio: agora, n: 0, nPublico: 0 }; janelas.set(ip, j); }
  j.n++;
  const ehPublico = req.path.startsWith('/publico') || req.path === '/login' || req.path.startsWith('/portal/');
  if (ehPublico) j.nPublico++;
  if (j.n > LIMITE_LOGADO || (ehPublico && j.nPublico > LIMITE_PUBLICO)) {
    res.set('Retry-After', String(Math.ceil((MINUTO - (agora - j.inicio)) / 1000)));
    anotar('excesso-pedidos', req, `${j.n} pedidos em menos de 1 minuto`);
    return res.status(429).json({ erro: 'Muitas requisições em pouco tempo. Espere um minuto e tente de novo.' });
  }
  next();
}

// ---------------- pedido vindo de outro site (CSRF) ----------------
// O cookie já é SameSite=Lax (o navegador não manda em POST de outro site). Isto é a segunda camada:
// qualquer método que muda dados só é aceito se vier do próprio endereço do sistema.
export function mesmaOrigem(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origem = req.get('origin') || req.get('referer');
  if (!origem) return next(); // chamadas de app/servidor (curl, integrações) não mandam Origin
  let host;
  try { host = new URL(origem).host; } catch { anotar('csrf', req, 'origem ilegível: ' + origem); return res.status(403).json({ erro: 'Origem inválida.' }); }
  const permitidas = new Set([req.get('host'), ...(process.env.ORIGENS_EXTRAS || '').split(',').map(s => s.trim()).filter(Boolean)]);
  if (permitidas.has(host)) return next();
  anotar('csrf', req, 'veio de ' + host);
  return res.status(403).json({ erro: 'Pedido veio de outro site e foi bloqueado.' });
}

// ---------------- tipos de arquivo aceitos ----------------
// Recusa o que pode virar página executável no navegador (html, svg, js, xml…).
const TIPOS_OK = [
  /^image\/(png|jpe?g|gif|webp|heic|heif|bmp|tiff)$/,
  /^application\/pdf$/,
  /^application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-excel|vnd\.ms-powerpoint|rtf)$/,
  /^application\/(zip|x-zip-compressed|x-rar-compressed|x-7z-compressed)$/,
  /^text\/(plain|csv)$/,
  /^audio\/(mpeg|mp4|ogg|wav|webm)$/,
  /^video\/(mp4|quicktime|webm)$/,
];
export const tipoDeArquivoPermitido = (tipo) => TIPOS_OK.some(re => re.test(String(tipo || '').toLowerCase().split(';')[0].trim()));

// ---------------- cabeçalhos de segurança ----------------
// CSP: o sistema só carrega script e estilo do próprio servidor (mais os CDNs que as telas usam);
// nada de <script> injetado por dados consegue chamar outro servidor.
const CSP_TELAS = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.emailjs.com https://form.jotform.com https://js.jotform.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https://api.emailjs.com https://api.jotform.com wss: ws:",
  "frame-src 'self' https://form.jotform.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export function cabecalhosSeguranca(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'private, no-store');
  else if (!req.path.startsWith('/api/arquivos/')) res.set('Content-Security-Policy', CSP_TELAS);
  next();
}
