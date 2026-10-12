// Skærmbilleder af kæmpetyperne (lerkæmpe, løber, kaster) i Bastionen: node scripts/types-shots.mjs
// Kræver `npx vite preview --port 4173`.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => !!window.__kk, null, { timeout: 60000 });
const frames = async (n) => { const f0 = await page.evaluate(() => window.__kk.state().frames); await page.waitForFunction((f) => window.__kk.state().frames >= f, f0 + n, { timeout: 240000 }); };
await page.evaluate(() => { window.__kk.startHunt('bastionen'); window.__kk.begin(); window.__kk.freeze(true); });
await frames(2);

const only = process.argv[2]?.split(',');
const shots = [
  { name: 'typer', cam: { x: 51.5, y: 3, z: 14 }, look: { x: 51.5, y: 8, z: 38 }, giants: [
    { v: 'runner', x: 43.5, z: 38, yaw: -0.3, state: 'walk', walk: 0.9 },
    { v: 'clay', x: 51.5, z: 40, yaw: 0, state: 'walk', walk: 0.2 },
    { v: 'thrower', x: 59.5, z: 38, yaw: 0.3, state: 'walk', walk: 1.6 },
  ] },
  { name: 'kaster-bagfra', cam: { x: 51.5, y: 10, z: 20 }, look: { x: 51.5, y: 10, z: 40 }, giants: [{ v: 'thrower', x: 51.5, z: 40, yaw: Math.PI, state: 'walk', walk: 0.5 }] },
  { name: 'kaster-kast', cam: { x: 51.5, y: 3, z: 14 }, look: { x: 51.5, y: 9, z: 38 }, giants: [{ v: 'thrower', x: 51.5, z: 38, yaw: 0, state: 'windThrow', t: 1.0, rock: true }] },
  { name: 'loeber-optakt', cam: { x: 60, y: 5, z: 62 }, look: { x: 51.5, y: 4, z: 48 }, giants: [{ v: 'runner', x: 51.5, z: 36, yaw: 0, state: 'windLeap', t: 0.6, leapTo: { x: 51.5, y: 1, z: 56 } }] },
  { name: 'loeber-spring', cam: { x: 66, y: 3, z: 50 }, look: { x: 51.5, y: 10, z: 46 }, giants: [{ v: 'runner', x: 51.5, z: 46, y: 7, yaw: 0, state: 'leap', t: 0.4, leapTo: { x: 51.5, y: 1, z: 56 } }] },
];
for (const s of shots.filter((x) => !only || only.includes(x.name))) {
  await page.evaluate((s) => {
    const h = window.__kk.hunt;
    for (const g of h.giants) { g.state = 'dead'; g.stateT = 99; }
    h.step(); h.drainEvents(); h.giants = [];
    for (const v of s.giants) {
      const g = h.spawnGiant({ scale: 1, hp: 1000, big: false, variant: v.v });
      g.pos = { x: v.x, y: v.y ?? 1, z: v.z }; g.yaw = v.yaw; g.state = v.state; g.stateT = v.t ?? 0;
      if (v.walk) { g.moveK = 1; g.walkPh = v.walk; }
      if (v.rock) g.rockInHand = true;
      if (v.leapTo) { g.leapTo = v.leapTo; g.leapFrom = { x: v.x, y: 1, z: v.z - 10 }; g.leapDur = 1; }
      g.computeParts();
    }
    const p = h.player; p.body.pos = { ...s.cam }; p.prevPos = { ...s.cam }; p.body.vel = { x: 0, y: 0, z: 0 };
    const e = h.eye(), t = s.look; p.yaw = Math.atan2(-(t.x - e.x), -(t.z - e.z)); p.pitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z));
  }, s);
  await frames(3);
  await page.screenshot({ path: `test-output/type-${s.name}.png` });
  console.log('ok', s.name);
}
await browser.close();
