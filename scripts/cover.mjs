// Billede af en forsvarer bag sine egne sandsække: node scripts/cover.mjs
import { chromium } from 'playwright-core';
const [url = 'http://localhost:4173/', out = 'test-output'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url);
await page.waitForFunction(() => !!window.__kk, null, { timeout: 60000 });
const frames = async (n) => { const f0 = await page.evaluate(() => window.__kk.state().frames); await page.waitForFunction((f) => window.__kk.state().frames >= f, f0 + n, { timeout: 180000 }); };
const info = await page.evaluate(() => {
  const kk = window.__kk; kk.start('A', 'normal'); kk.begin();
  const g = kk.game;
  for (const p of g.players.filter((q) => q.team === 'D')) p.money = 5000;
  // spol frem til en forsvarer har bygget, mens angriberne holdes tilbage i basen
  for (const p of g.players.filter((q) => q.team === 'A')) g.bots.delete(p.id);
  g.bots.delete(0);
  let placed = null;
  for (let i = 0; i < 120 * 30 && !placed; i++) { g.step(); for (const e of g.drainEvents()) if (e.type === 'blockPlace') placed = e; }
  for (let i = 0; i < 120 * 2; i++) g.step();
  g.drainEvents();
  if (!placed) return null;
  const d = g.players[placed.pid];
  // stil spilleren 9 m foran forsvareren og kig på ham
  // find et punkt 6-10 m foran sandsækkene med frit udsyn til forsvareren
  const h = g.human; h.hp = 100;
  const tx = placed.x + 0.5, tz = placed.z + 0.5;
  let best = null;
  for (let a = 0; a < 64 && !best; a++) for (const r of [8, 7, 9, 6, 10]) {
    const ang = (a / 64) * Math.PI * 2;
    const x = tx + Math.cos(ang) * r, z = tz + Math.sin(ang) * r;
    if (!g.nav.walkable(Math.floor(x), Math.floor(z))) continue;
    const dx = d.body.pos.x - x, dz = d.body.pos.z - z;
    // sandsækken skal ligge mellem os og forsvareren
    if (Math.hypot(tx - x, tz - z) > Math.hypot(dx, dz)) continue;
    let clear = true;
    for (let k = 1; k < 20; k++) { const px = x + (tx - x) * k / 20, pz = z + (tz - z) * k / 20; if (k < 17 && g.world.solidAt(Math.floor(px), 2, Math.floor(pz))) clear = false; }
    if (clear) { best = { x, z }; break; }
  }
  if (!best) return { placed, nospot: true };
  h.body.pos = { x: best.x, y: 1, z: best.z }; h.prevPos = { ...h.body.pos };
  h.yaw = Math.atan2(-(d.body.pos.x - best.x), -(d.body.pos.z - best.z)); h.pitch = -0.12;
  for (const b of g.bots.values()) b.p.input.fire = false;
  g.bots.clear();
  return { placed, def: d.name, pos: d.body.pos, crouch: d.crouching };
});
console.log(JSON.stringify(info));
await frames(4);
await page.screenshot({ path: `${out}/cover.png` });
console.log(errs.join('\n'));
await browser.close();
