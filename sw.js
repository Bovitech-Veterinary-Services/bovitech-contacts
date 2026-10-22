// Offline cache for the app shell. Bump VERSION on every release.
const VERSION = 'bvt-v161';
const SHELL = ['./', 'index.html', 'app.js', 'config.js', 'defaults.json', 'privacy.html', 'terms.html', 'manifest.webmanifest', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', ...['a','aplus','b','c','bfriends','bvs','payup','dna','inactive','industry','newfac','newassess','newmaybe','occ','phone','prac','sheepreg','sheepocc','icon-192','icon-512'].map(n => `img/${n}.png`)];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin === location.origin) {
    // network first (so updates arrive straight away), saved copy when offline
    // always ask GitHub for the newest copy (no-cache = check before using the browser's saved copy)
    // weak reception: if GitHub hasn't answered within a few seconds, use the saved copy so the app still opens
    const net = fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); } return r; });
    const saved = () => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'));
    e.respondWith(new Promise(res => {
      let done = false; const finish = r => { if (!done && r) { done = true; res(r); } };
      const t = setTimeout(() => saved().then(hit => { if (hit) finish(hit); }), u.pathname.endsWith('version.json') ? 8000 : 3500);
      net.then(r => { clearTimeout(t); finish(r); }).catch(() => { clearTimeout(t); saved().then(hit => finish(hit || Response.error())); });
    }));
  } else if (u.host.includes('fonts.g')) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); return r; })));
  }
});
