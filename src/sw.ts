/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.skipWaiting();
clientsClaim();

// --- LÓGICA DE PUSH NOTIFICATIONS ---

self.addEventListener('push', (event) => {
  const data = event.data?.json();
  console.log('🔔 Push Recibido:', data);

  const title = data.title || 'Guía Comercial';
  const options = {
    body: data.body || 'Tienes una nueva notificación.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: data.url || '/' }, // Guardamos la URL para el click
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'Ver ahora' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notificación clickeada');
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta, la enfocamos
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no, abrimos una nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});