// Offline support: keeps what the game page loads (page, soh.js, soh.wasm, *.o2r ...) in the browser and
// serves it when the network is unavailable. Online, the network wins, so updates arrive normally.
// Must be served from the site root (scope = the whole site). Registered by index.html / chromebook.js.
const CACHE = 'cr-offline-v1';
const WAIT_MS = 5000;           // a dead-but-connected network: fall back to the saved copy after this long

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE && k.startsWith('cr-offline-')) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('message', (e) => {
  if (e.data === 'clear') e.waitUntil(caches.delete(CACHE));
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || !/^https?:/.test(r.url) || r.headers.has('range')) return;
  if (new URL(r.url).pathname.endsWith('/cr-sw.js')) return;           // always fetch the worker itself fresh
  e.respondWith(handle(e));
});

async function saved(cache, req) {
  return (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
}

async function handle(e) {
  const req = e.request;
  const cache = await caches.open(CACHE);
  const hit = await saved(cache, req);
  try {
    const net = fetch(req);
    const res = await (hit
      ? Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), WAIT_MS))])
      : net);
    if (res && (res.status === 200 || res.type === 'opaque')) {
      e.waitUntil(cache.put(req, res.clone()).catch(() => {}));         // not awaited: the page keeps streaming
    }
    return res;
  } catch (err) {
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const home = (await cache.match(new URL('./', self.registration.scope).href)) ||
                   (await cache.match(new URL('index.html', self.registration.scope).href));
      if (home) return home;
    }
    throw err;
  }
}
