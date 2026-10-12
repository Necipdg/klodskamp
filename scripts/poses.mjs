// Stillbilleder fra udvalgte steder (købsfasen holdes åben, så ingen bevæger sig):
// node scripts/poses.mjs [url] [ud-mappe] [prefix]
import { chromium } from 'playwright-core';
const [url = 'http://localhost:4173/', out = 'test-output', pre = 'p'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_TUNNEL') && logs.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => !!window.__kk, null, { timeout: 60000 });
const frames = async (n) => { const f0 = await page.evaluate(() => window.__kk.state().frames); await page.waitForFunction((f) => window.__kk.state().frames >= f, f0 + n, { timeout: 180000 }); };
await page.evaluate(() => { window.__kk.start('A', 'normal'); window.__kk.begin(); const g = window.__kk.game; g.phaseT = 9999; });
const pose = async (name, fn, arg) => {
  await page.evaluate(fn, arg);
  await frames(3);
  await page.screenshot({ path: `${out}/${pre}-${name}.png` });
};
const D = Math.PI / 180;
await pose('rifle', () => { const g = window.__kk.game; g.players[0].money = 9000; g.buy(0, 'rifle'); g.buy(0, 'vest'); g.players[0].switchT = 0; });
await pose('enemy', ([D]) => {
  const g = window.__kk.game; const h = g.players[0];
  h.body.pos = { x: 26.5, y: 1, z: 44 }; h.prevPos = { ...h.body.pos }; h.yaw = 0; h.pitch = -4 * D;
  const e = g.players[3]; e.body.pos = { x: 25.8, y: 1, z: 38 }; e.prevPos = { ...e.body.pos }; e.yaw = Math.PI;
  const e2 = g.players[4]; e2.body.pos = { x: 28, y: 1, z: 36 }; e2.prevPos = { ...e2.body.pos }; e2.yaw = Math.PI - 0.6; e2.crouching = false;
  const m = g.players[1]; m.body.pos = { x: 24.5, y: 1, z: 40 }; m.prevPos = { ...m.body.pos }; m.yaw = 0.5;
}, [D]);
await pose('site', ([D]) => {
  const g = window.__kk.game; const h = g.players[0];
  h.body.pos = { x: 18.5, y: 1, z: 22.5 }; h.prevPos = { ...h.body.pos }; h.yaw = 0.75; h.pitch = -6 * D;
}, [D]);
await pose('tunnel', ([D]) => {
  const g = window.__kk.game; const h = g.players[0];
  h.body.pos = { x: 27, y: 1, z: 30 }; h.prevPos = { ...h.body.pos }; h.yaw = 0.3; h.pitch = 0;
}, [D]);
await pose('smutvej', ([D]) => {
  const g = window.__kk.game; const h = g.players[0];
  h.body.pos = { x: 23, y: 1, z: 24.5 }; h.prevPos = { ...h.body.pos }; h.yaw = 0; h.pitch = 0;
  h.slot = 'pistol';
}, [D]);
await pose('long', ([D]) => {
  const g = window.__kk.game; const h = g.players[0];
  h.body.pos = { x: 5.5, y: 1, z: 45 }; h.prevPos = { ...h.body.pos }; h.yaw = 0; h.pitch = 2 * D; h.slot = 'knife';
}, [D]);
await pose('ctspawn', ([D]) => {
  const g = window.__kk.game; const h = g.players[0];
  h.body.pos = { x: 24, y: 1, z: 6 }; h.prevPos = { ...h.body.pos }; h.yaw = -Math.PI / 2; h.pitch = 0; h.slot = 'primary';
}, [D]);
console.log(logs.join('\n'));
await browser.close();
