import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => !!window.__kk, null, { timeout: 60000 });
const frames = async (n) => { const f0 = await page.evaluate(() => window.__kk.state().frames); await page.waitForFunction((f) => window.__kk.state().frames >= f, f0 + n, { timeout: 240000 }); };
await page.evaluate(() => { window.__kk.startHunt(); window.__kk.begin(); window.__kk.freeze(true); });
const views = JSON.parse(process.argv[2]);
let i = 0;
for (const v of views) {
  await page.evaluate((v) => { const p = window.__kk.hunt.player; if (v.pos) { p.body.pos = { ...v.pos }; p.prevPos = { ...v.pos }; } p.yaw = v.yaw; p.pitch = v.pitch; }, v);
  await frames(2);
  await page.screenshot({ path: `test-output/look${i++}.png` });
}
await browser.close();
