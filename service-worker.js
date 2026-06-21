/* Beti Nur Catering — Service Worker (PWA)
   Strategi:
   - App shell (HTML) → network-first, fallback ke cache (offline tetap kebuka, update kebaca saat online)
   - Aset statis & CDN (ikon, font, jsPDF, Firebase libs) → cache-first / stale-while-revalidate
   - Firestore / Firebase API → SELALU lewat network (SDK punya offline cache sendiri)
   Naikkan CACHE_VERSION setiap deploy supaya cache lama dibersihkan otomatis. */
const CACHE_VERSION = 'bnc-v4';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// Host yang TIDAK boleh di-cache (data realtime / auth)
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'firebasestorage.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Data realtime / auth → biarkan ke network apa adanya
  if (BYPASS_HOSTS.some(h => url.hostname.includes(h))) return;

  // Navigasi / dokumen HTML → network-first, fallback cache
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Aset lain (ikon, font, CDN libs) → stale-while-revalidate
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
