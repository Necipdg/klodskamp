// Skærmbilleder rundt på en bane: node scripts/valley-tour.mjs '[{"name":..,"pos":{x,y,z},"look":{x,y,z}}]' [baneId=ravnsdalen]
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => !!window.__kk, null, { timeout: 60000 });
const frames = async (n) => { const f0 = await page.evaluate(() => window.__kk.state().frames); await page.waitForFunction((f) => window.__kk.state().frames >= f, f0 + n, { timeout: 300000 }); };
const t0 = Date.now();
const mapId = process.argv[3] ?? 'ravnsdalen';
await page.evaluate((m) => { window.__kk.startHunt(m); window.__kk.begin(); window.__kk.freeze(true); }, mapId);
await frames(2);
console.log('start ms', Date.now() - t0);
const views = JSON.parse(process.argv[2]);
for (const v of views) {
  await page.evaluate((v) => {
    const h = window.__kk.hunt, p = h.player;
    h.giants = [];
    if (v.giants) { for (const [x, z, s, variant, st, stT] of v.giants) { const g = h.spawnGiant({ scale: s ?? 1.1, hp: 1000, big: (s ?? 1) > 1.2, variant }); g.pos = { x, y: h.city.floor[Math.floor(z) * h.world.sx + Math.floor(x)], z }; g.state = st ?? 'walk'; g.stateT = stT ?? 0; g.yaw = v.gyaw ?? 0; g.computeParts(); } h.drainEvents(); }
    if (v.wave !== undefined) { h.wave = v.wave; h.phase = 'fight'; }
    if (v.gateHp !== undefined) { h.gate.hp = v.gateHp; h.syncGateBlocks(); }
    p.body.pos = { ...v.pos }; p.prevPos = { ...v.pos }; p.body.vel = { x: 0, y: 0, z: 0 };
    const e = { x: v.pos.x, y: v.pos.y + 1.62, z: v.pos.z }, t = v.look;
    p.yaw = Math.atan2(-(t.x - e.x), -(t.z - e.z)); p.pitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z));
  }, v);
  await frames(3);
  await page.screenshot({ path: `test-output/v-${v.name}.png` });
  console.log('shot', v.name);
}
await browser.close();
