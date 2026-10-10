// Service worker: keeps the test usable without internet once the page has loaded.
//  - App files (HTML/CSS/JS/icons): served from cache at once, refreshed in the background.
//  - Test content and config (*.json): network first, so new tests appear right away;
//    falls back to the cached copy when offline or slow.
// Results are NOT sent from here; the page's outbox retries whenever it is open.
// Bump VERSION only if you need to force-drop old caches; normal updates arrive by themselves.

const VERSION = 'v1';
const CACHE = 'ta-' + VERSION;
const SHELL = [
  'index.html', 'lehrer.html', 'app.css', 'icon.svg', 'manifest.webmanifest', 'config.json',
  'js/student.js', 'js/teacher.js', 'js/grading.js', 'js/i18n.js', 'js/store.js', 'js/outbox.js', 'js/api.js', 'js/dom.js',
  'tests/index.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    // Also cache every test listed in the index so all of them work offline.
    try {
      const index = await (await fetch('tests/index.json', { cache: 'reload' })).json();
      await cache.addAll((index.tests || []).map((x) => new Request('tests/' + x.file, { cache: 'reload' })));
    } catch (e) { /* tests will be cached on first use */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('ta-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only same-origin GETs. The POST to Google Apps Script is never touched.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('.json')) event.respondWith(networkFirst(req));
  else event.respondWith(staleWhileRevalidate(req, event));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), 2500);
    if (res && res.ok) cache.put(stripSearch(req), res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(stripSearch(req));
    if (hit) return hit;
    throw e;
  }
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(CACHE);
  const key = req.mode === 'navigate' ? navKey(req) : stripSearch(req);
  const hit = await cache.match(key);
  const refresh = fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
    return res;
  }).catch(() => null);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  const res = await refresh;
  return res || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// "/repo/" and "/repo/index.html" are the same page.
function navKey(req) {
  const url = new URL(req.url);
  url.search = '';
  url.hash = '';
  if (url.pathname.endsWith('/')) url.pathname += 'index.html';
  return url.toString();
}

function stripSearch(req) {
  const url = new URL(req.url);
  url.search = '';
  return url.toString();
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
