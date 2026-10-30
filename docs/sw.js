// Service worker: o pedacinho que fica rodando no celular mesmo com o sistema
// fechado. É ele que recebe o aviso e mostra a notificação.
//
// Só faz duas coisas, de propósito: mostrar o aviso e, no toque, abrir a tela
// certa. Nada de cache — o sistema muda todo dia e cache velho esconde correção.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { texto: e.data && e.data.text() }; }
  const titulo = d.titulo || 'Legal Way';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.texto || '',
    icon: '/assets/icone-192.png',
    badge: '/assets/icone-192.png',
    // Avisos do mesmo assunto se substituem em vez de empilhar 20 na tela
    tag: d.grupo || 'lead',
    renotify: true,
    data: { url: d.url || '/index.html' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/index.html';
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Se o sistema já está aberto em alguma aba, leva ELA para a tela — abrir
    // outra janela faria a pessoa perder o que estava fazendo.
    for (const c of abertas) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        if ('navigate' in c) await c.navigate(url).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
