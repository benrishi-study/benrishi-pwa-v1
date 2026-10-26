const CACHE = 'benrishi-mini-v1.1.1';
const CORE = [
  './', './index.html', './styles.css', './app.js', './drive-sync.js', './config.js',
  './seed-data.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(async cache => {
      for (const url of CORE) {
        try { await cache.add(url); } catch (e) { console.warn('cache skip', url, e); }
      }
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Google認証・Drive API・CDN等はService Workerでキャッシュしない。
  if (url.origin !== self.location.origin) return;

  // config.js は設定変更が反映されやすいよう network-first。
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
      return resp;
    }).catch(() => {
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }))
  );
});
