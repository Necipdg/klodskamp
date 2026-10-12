// Skærmbilleder af Kæmpejagt: node scripts/hunt-shots.mjs [url] [ud-mappe]
// Kræver `npx vite preview --port 4173`. Headless-grafik er langsom, så simuleringen køres frem med huntForward.
import { chromium } from 'playwright-core';
const [url = 'http://localhost:4173/', out = 'test-output', w = '1280', h = '720'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => !!window.__kk, null, { timeout: 60000 });
const frames = async (n) => { const f0 = await page.evaluate(() => window.__kk.state().frames); await page.waitForFunction((f) => window.__kk.state().frames >= f, f0 + n, { timeout: 240000 }); };
const shot = async (name) => { await frames(2); await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
await frames(2);
// Startskærm med Kæmpejagt valgt
await page.click('#menu .mode.hunt');
await shot('h1-menu');
await page.evaluate(() => window.__kk.startHunt());
await shot('h2-intro');
await page.evaluate(() => window.__kk.begin());
// Første bølge: kør frem til kæmpen er inde i byen
await page.evaluate(() => window.__kk.huntForward(14));
const pose = (fn) => page.evaluate(fn);
await page.evaluate(() => window.__kk.freeze(true));
// Sigt mod kæmpen fra jorden
await pose(() => {
  const h = window.__kk.hunt, g = h.giants[0], p = h.player;
  const dx = g.pos.x - p.body.pos.x, dz = g.pos.z - p.body.pos.z;
  p.yaw = Math.atan2(-dx, -dz); p.pitch = 0.28;
});
await shot('h3-ground');
// Flyv op på et tag og se kæmpen fra luften
await pose(() => {
  const h = window.__kk.hunt, g = h.giants[0], p = h.player;
  p.body.pos = { x: 41.5, y: 24, z: 46.5 }; p.prevPos = { ...p.body.pos }; p.body.vel = { x: 0, y: 0, z: 0 };
  const dx = g.pos.x - p.body.pos.x, dz = g.pos.z - p.body.pos.z;
  p.yaw = Math.atan2(-dx, -dz); p.pitch = -0.25;
});
await shot('h4-air');
// Bag kæmpen: nakkekrystallen
await pose(() => {
  const h = window.__kk.hunt, g = h.giants[0], p = h.player;
  const back = { x: Math.sin(g.yaw), z: Math.cos(g.yaw) };
  p.body.pos = { x: g.pos.x + back.x * 9, y: g.pos.y + 12 * g.scale, z: g.pos.z + back.z * 9 }; p.prevPos = { ...p.body.pos }; p.body.vel = { x: 0, y: 0, z: 0 };
  const n = g.parts.find((q) => q.kind === 'nape').box.tf.t;
  const dx = n.x - p.body.pos.x, dy = n.y - (p.body.pos.y + 1.62), dz = n.z - p.body.pos.z;
  p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
});
await shot('h5-nape');
// I wiren: sving mod klokketårnet med kæmpen under sig
await pose(() => {
  const h = window.__kk.hunt, g = h.giants[0], p = h.player;
  p.body.pos = { x: g.pos.x - 10, y: 17, z: g.pos.z + 12 }; p.prevPos = { ...p.body.pos }; p.body.vel = { x: 14, y: 3, z: -10 };
  const a = { x: 51.5, y: 29, z: 51.5 };
  h.hook.state = 'attached'; h.hook.tip = { ...a }; h.hook.target = { ...a }; h.hook.len = 20;
  const t = g.part('nape').box.tf.t;
  const e = h.eye(); p.yaw = Math.atan2(-(t.x - e.x), -(t.z - e.z)) + 0.25; p.pitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z)) + 0.05;
});
await shot('h6-swing');
console.log(JSON.stringify(await page.evaluate(() => window.__kk.state())));
console.log(logs.join('\n'));
await browser.close();
