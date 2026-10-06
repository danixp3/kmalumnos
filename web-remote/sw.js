// Service worker de AulaMovil: hace que la web del móvil se pueda instalar como
// app (Android: «Instalar aplicación»; iOS: «Añadir a pantalla de inicio»).
//  - Páginas: primero la red, así siempre se ve la última versión publicada;
//    sin cobertura se abre la última copia guardada.
//  - Fuentes e iconos: desde la caché (no cambian).
//  - /api y Supabase: nunca se guardan aquí (datos vivos y privados); la web guarda
//    en la tablet, con su propia lógica (offline.js), la última lectura y lo pendiente de enviar.
//  - Avisos de la práctica (Web Push): los manda el servidor a su hora y aquí
//    se muestran aunque la app esté cerrada; al tocarlos se abre la app.
const VERSION = 'aulamovil-v3';
// Todo lo que la app necesita para abrirse sin cobertura (dentro del coche no hay datos)
const FUENTES = ['barlow-400', 'barlow-500', 'barlow-600', 'barlow-700', 'barlow-condensed-600', 'barlow-condensed-700', 'ibm-plex-mono-500', 'ibm-plex-mono-600']
  .flatMap(f => [`/fonts/${f}-latin.woff2`, `/fonts/${f}-latin-ext.woff2`]);
const BASICOS = ['/', '/offline.js', '/manifest.webmanifest', '/logo.png', '/icons/icon-192.png', '/icons/maskable-192.png', '/icons/apple-touch-icon.png', ...FUENTES];

self.addEventListener('install', e => {
  // Uno a uno: si algún archivo falla, el resto se guarda igualmente
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(BASICOS.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (r.mode === 'navigate') {
    const esApp = url.pathname === '/' || url.pathname === '/index.html';
    e.respondWith(fetch(r)
      .then(res => {
        if (res.ok && esApp) { const copia = res.clone(); caches.open(VERSION).then(c => c.put('/', copia)); }
        return res;
      })
      .catch(() => caches.match(esApp ? '/' : r).then(x => x || Response.error())));
    return;
  }

  // La lógica sin conexión: red primero (siempre la última), y sin red la copia guardada
  if (url.pathname === '/offline.js') {
    e.respondWith(fetch(r).then(res => { if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(r, copia)); } return res; }).catch(() => caches.match(r).then(x => x || Response.error())));
    return;
  }

  if (/\.(woff2|png|svg|ico|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(r).then(x => x || fetch(r).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(r, copia)); }
      return res;
    })));
  }
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'AulaMovil', {
    body: d.cuerpo || '', tag: d.etiqueta || 'aulamovil', renotify: true, requireInteraction: d.tipo !== 'prueba',
    icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', vibrate: [200, 100, 200], data: { url: '/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    const abierta = lista.find(c => 'focus' in c);
    return abierta ? abierta.focus() : self.clients.openWindow((e.notification.data && e.notification.data.url) || '/');
  }));
});
