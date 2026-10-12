// Tjek at spil.html virker direkte fra disken (file://): node scripts/check-single.mjs
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + resolve('spil.html'));
await page.waitForFunction(() => !!window.__kk, null, { timeout: 60000 });
await page.click('text=Spil som forsvarer');
await page.click('text=Klik for at starte');
const s = await page.evaluate(() => window.__kk.state());
const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family); });
console.log(JSON.stringify({ state: s.state, team: await page.evaluate(() => window.__kk.game.humanTeam), fonts: [...new Set(fonts)], errors }));
await browser.close();
