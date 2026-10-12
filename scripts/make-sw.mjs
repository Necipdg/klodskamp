// Laver dist/sw.js efter `vite build`: en service worker der gemmer hele spillet, så appen virker offline.
// Filnavnene har hash i navnet, så en ny version får sine egne filer; gamle caches ryddes ved opstart.
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const dist = 'dist';
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f !== 'sw.js') files.push(relative(dist, p).split('\\').join('/')); } };
walk(dist);
const version = `${JSON.parse(readFileSync('package.json', 'utf8')).version}-${Date.now().toString(36)}`;
const sw = `// Klodskamp – service worker (genereret af scripts/make-sw.mjs)
const CACHE = 'klodskamp-${version}';
const FILES = ${JSON.stringify(['./', ...files.map((f) => './' + f)])};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('klodskamp-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Selve siden: prøv nettet først (så en ny version hentes), ellers den gemte
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))));
    return;
  }
  // Alt andet: gemt kopi først
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
`;
writeFileSync(join(dist, 'sw.js'), sw);
console.log(`sw.js: ${files.length} filer gemmes offline (version ${version})`);
