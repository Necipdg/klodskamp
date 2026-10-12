// Browsertest af app-versionen (PWA): manifest, ikoner, service worker og at spillet starter uden internet.
// npm run build:app && npx vite preview --port 4173 &  →  node scripts/app-test.mjs [url]
import { chromium } from 'playwright-core';
const [url = 'http://localhost:4173/'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? '  ✓' : '  ✗'} ${msg}`); if (!c) fails++; };
await page.goto(url);
await page.waitForFunction(() => !!window.__kk, null, { timeout: 90000 });
const cdp = await ctx.newCDPSession(page);
const man = await cdp.send('Page.getAppManifest');
const errs = man.errors ?? [];
ok(man.url.endsWith('manifest.webmanifest') && errs.length === 0, `manifestet indlæses uden fejl${errs.length ? ': ' + JSON.stringify(errs) : ''}`);
const m = JSON.parse(man.data);
ok(m.name === 'Klodskamp' && m.display === 'fullscreen' && m.orientation === 'landscape', 'navn, fuld skærm og liggende format');
for (const ic of m.icons) {
  const r = await page.request.get(new URL(ic.src, man.url).href);
  ok(r.ok() && r.headers()['content-type'].includes('png'), `ikon ${ic.src} (${ic.sizes}, ${ic.purpose})`);
}
await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true), null, { timeout: 60000 });
await page.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r?.active; }, null, { timeout: 60000 });
ok(true, 'service worker er installeret og aktiv');
const cached = await page.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open(keys.find((k) => k.startsWith('klodskamp-'))); return (await c.keys()).length; });
ok(cached >= 10, `${cached} filer gemt til offline brug`);
try {
  // (testbrowseren kører altid "inkognito" – det er ikke en fejl ved appen)
  const inst = (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.filter((e) => e.errorId !== 'in-incognito');
  ok(inst.length === 0, `kan installeres${inst.length ? ': ' + JSON.stringify(inst) : ''}`);
} catch (e) { console.log('  (installérbarhed kunne ikke tjekkes: ' + e.message + ')'); }
// Uden internet
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60000 });
await ctx.setOffline(true);
await page.reload();
await page.waitForFunction(() => !!window.__kk, null, { timeout: 90000 });
ok(await page.evaluate(() => !!document.querySelector('#menu')), 'siden åbner uden internet');
await page.evaluate(() => window.__kk.startHunt('saltvig'));
await page.waitForFunction(() => window.__kk.state().state === 'intro', null, { timeout: 120000 });
ok(true, 'Kæmpejagt (Saltvig) starter uden internet');
// iPhone: Safari har ingen installér-dialog → knappen viser en vejledning
const ip = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const p2 = await ip.newPage();
await p2.goto(url);
await p2.waitForFunction(() => !!window.__kk, null, { timeout: 90000 });
ok(await p2.locator('#menu .btn.install').isVisible(), 'iPhone: knappen "Installér som app" vises');
await p2.locator('#menu .btn.install').tap();
ok((await p2.textContent('#pause')).includes('Føj til hjemmeskærm'), 'iPhone: vejledningen (Del → Føj til hjemmeskærm) vises');
await ip.close();
ok(errors.length === 0, `ingen fejl${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(fails ? `\n${fails} FEJL` : '\nALT OK');
process.exit(fails ? 1 : 0);
