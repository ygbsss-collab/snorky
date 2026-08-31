const CACHE_PREFIX = 'snorky-static-';
const CACHE_NAME = `${CACHE_PREFIX}v81`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './public/css/today-condition-detail.css',
  './public/images/snorky-symbol.png',
  './public/images/snorky-home-hero-v3.jpg',
  './public/images/snorky-home-hero-v2.png',
  './public/images/pwa/icon-192.png',
  './public/images/pwa/icon-512.png',
  './public/images/pwa/icon-192-maskable.png',
  './public/images/pwa/icon-512-maskable.png',
  './public/images/pwa/apple-touch-icon.png',
  './public/assets/icons/fins.png',
  './public/js/supabase-client.js',
  './public/js/kma-weather-cache.js',
  './public/js/open-meteo-marine-cache.js',
  './public/js/supabase-migration.js',
  './public/js/supabase-read.js',
  './public/js/supabase-admin.js',
  './public/js/user-engagement.js',
  './public/js/kma-safety.js',
  './public/js/snorky-eval.js',
  './public/js/best-ui.js',
  './public/js/nearby-best.js',
  './public/js/today-best.js',
  './public/js/home-v2.js',
  './public/js/point-search.js',
  './public/js/point-gear.js',
  './public/js/today-condition-detail.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || cache.match('./index.html');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  }).catch(error => {
    if (cached) return cached;
    throw error;
  });
  return cached || network;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.headers.has('range') || url.pathname.endsWith('.mp4')) return;

  if (['script', 'style', 'image', 'manifest'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
