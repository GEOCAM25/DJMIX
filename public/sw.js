/**
 * Service Worker de DJMIX.
 *
 * Estrategia de caché pensada para una SPA con assets con hash de Vite:
 *   - Navegaciones (documentos): network-first con fallback a la copia en caché
 *     del app-shell (permite abrir la app sin conexión).
 *   - Assets estáticos del mismo origen (JS/CSS/PNG/wasm…): stale-while-revalidate
 *     (se sirven al instante desde caché y se actualizan en segundo plano).
 *   - Terceros (YouTube, unpkg de FFmpeg, API de IA): se dejan pasar a la red
 *     SIN cachear (contenido dinámico / privacidad).
 *
 * Como los nombres de los bundles llevan hash, no hace falta pre-cachear una
 * lista fija: la caché se llena en tiempo de ejecución y se poda por versión.
 */
const VERSION = 'djmix-v1';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Terceros: red directa, sin caché.
  if (!sameOrigin) return;

  // Navegaciones: network-first.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }

  // Assets del mismo origen: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// Permite a la app pedir la activación inmediata de una nueva versión.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
