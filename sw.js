// Offline cache for the app shell. Bump VERSION on every release.
const VERSION = 'bvt-v2';
const SHELL = ['./', 'index.html', 'app.js', 'config.js', 'defaults.json', 'privacy.html', 'terms.html', 'manifest.webmanifest', ...['a','aplus','b','c','bfriends','bvs','payup','dna','inactive','industry','newfac','newassess','newmaybe','occ','phone','prac','sheepreg','sheepocc','icon-192','icon-512'].map(n => `img/${n}.png`)];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin === location.origin || u.host.includes('fonts.g')) {
    e.respondWith(caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); } return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
