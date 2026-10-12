// Skærmbilleder af kæmpen i forskellige animationer: node scripts/giant-poses.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => !!window.__kk, null, { timeout: 60000 });
const frames = async (n) => { const f0 = await page.evaluate(() => window.__kk.state().frames); await page.waitForFunction((f) => window.__kk.state().frames >= f, f0 + n, { timeout: 240000 }); };
await page.evaluate(() => { window.__kk.startHunt(); window.__kk.begin(); window.__kk.freeze(true); });
const poses = JSON.parse(process.argv[2] ?? '[]');
for (const [i, v] of poses.entries()) {
  await page.evaluate((v) => {
    const h = window.__kk.hunt;
    for (const g of h.giants) g.state = 'dead', g.stateT = 99;
    h.step(); h.drainEvents(); h.giants = [];
    const g = h.spawnGiant({ scale: v.scale ?? 1, hp: 1000, big: !!v.big });
    g.pos = { x: 51.5, y: 1, z: 40 }; g.yaw = v.gyaw ?? Math.PI; g.state = v.state; g.stateT = v.t; g.fall = v.fall ?? 0;
    if (v.walk) { g.moveK = 1; g.walkPh = v.walk; }
    if (v.rock) g.rockInHand = true;
    g.computeParts();
    const p = h.player; p.body.pos = { ...v.cam }; p.prevPos = { ...v.cam }; p.body.vel = { x: 0, y: 0, z: 0 };
    const t = { x: 51.5, y: v.ly ?? 8, z: 40 };
    const e = h.eye(); p.yaw = Math.atan2(-(t.x - e.x), -(t.z - e.z)); p.pitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z));
  }, v);
  await frames(3);
  await page.screenshot({ path: `test-output/pose-${v.name ?? i}.png` });
}
await browser.close();
