// Manifesto do app (PWA): faz o sistema virar ícone na tela de início do celular, com o nome e a
// cor do escritório. É gerado na hora a partir das Regras, então cada instalação tem a própria marca.
import { Router } from 'express';
import { obterRegras } from './regras.js';

export const rotasManifest = Router();

rotasManifest.get('/publico/manifest.webmanifest', async (req, res) => {
  let e = {};
  try { e = (await obterRegras()).empresa || {}; } catch {}
  const nome = e.nome || 'Sistema';
  res.set('Content-Type', 'application/manifest+json; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=600');
  res.json({
    name: nome,
    short_name: (e.nomeCurto || nome).slice(0, 12),
    description: e.slogan || 'Sistema de gestão do escritório',
    start_url: '/index.html',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAFAF8',
    theme_color: '#16204F',
    lang: 'pt-BR',
    icons: [
      { src: e.logo || '/assets/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: e.logo || '/assets/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: e.logo || '/assets/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
});
