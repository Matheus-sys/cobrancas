// Mantém o app funcionando sem internet. Ao mudar arquivos, aumente a versão.
const CACHE = 'cobrancas-v2';
const ASSETS = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'js/pix.js',
  'vendor/qrcode.min.js', 'vendor/html-to-image.js',
  'fonts/inter.woff2', 'fonts/dm-serif-display.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (pega atualizações), cache se estiver sem internet.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
