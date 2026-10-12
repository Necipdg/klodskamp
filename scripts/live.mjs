// Kør en kamp med autopilot og tag billeder undervejs: node scripts/live.mjs [url] [ud] [prefix]
import { chromium } from 'playwright-core';
const [url = 'http://localhost:4173/', out = 'test-output', pre = 'live'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_TUNNEL') && logs.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => !!window.__kk, null, { timeout: 60000 });
const frames = async (n) => { const f0 = await page.evaluate(() => window.__kk.state().frames); await page.waitForFunction((f) => window.__kk.state().frames >= f, f0 + n, { timeout: 180000 }); };
await page.evaluate(() => { window.__kk.start('A', 'normal'); window.__kk.begin(); window.__kk.autopilot(true); });
// Spol frem til der sker noget: første skud mellem hold
let shots = 0;
for (let i = 0; i < 12; i++) {
  const r = await page.evaluate(() => {
    const kk = window.__kk, g = kk.game;
    // spol i små bidder indtil en fjende er synlig for spilleren
    for (let k = 0; k < 400; k++) {
      kk.fastForward(0.05);
      const b = g.bots.get(0);
      if (b && b.debug().visible) return { t: g.time, phase: g.phase, vis: true, st: b.debug().state };
      if (!g.human.alive || g.phase === 'end') return { t: g.time, phase: g.phase, vis: false, dead: !g.human.alive };
    }
    return { t: g.time, phase: g.phase, vis: false };
  });
  console.log(JSON.stringify(r));
  await frames(2);
  await page.screenshot({ path: `${out}/${pre}-${i}.png` });
  if (r.vis) { await page.evaluate(() => window.__kk.fastForward(0.15)); await frames(2); await page.screenshot({ path: `${out}/${pre}-${i}b.png` }); }
  if (r.dead || r.phase === 'end') break;
  shots++;
}
console.log(JSON.stringify(await page.evaluate(() => window.__kk.state())));
console.log(logs.join('\n'));
await browser.close();
