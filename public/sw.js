// ☢️ SERVICE WORKER KILL SWITCH ☢️
// Este script reemplaza al antiguo Service Worker de la PWA.
// Su única función es tomar el control, desinstalarse a sí mismo y forzar
// la recarga de la página para que el usuario reciba la versión nueva (sin caché).

self.addEventListener('install', () => {
  // Forzar que este SW "Impostor" se instale inmediatamente, pateando al viejo.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1. Tomar control de todas las pestañas abiertas inmediatamente.
      await self.clients.claim();
      
      console.log('☢️ Kill Switch: Service Worker activado. Iniciando purga...');

      // 2. Desregistrar este Service Worker (suicidio).
      // Esto asegura que en la próxima visita, no haya ningún SW controlando la página.
      await self.registration.unregister();

      // 3. Limpiar cualquier caché de almacenamiento antigua explícitamente.
      const cacheKeys = await caches.keys();
      for (const key of cacheKeys) {
        await caches.delete(key);
      }

      // 4. Forzar recarga de todas las ventanas abiertas.
      // Esto es crucial: hace que la pestaña vuelva a pedir index.html al servidor.
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        if (client.url && 'navigate' in client) {
          console.log('☢️ Kill Switch: Recargando cliente...', client.url);
          client.navigate(client.url);
        }
      }
    })()
  );
});

// Pass-through simple: si por alguna razón milimétrica llega un fetch antes de la recarga,
// ir directo a la red. NO CACHEAR NADA.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});