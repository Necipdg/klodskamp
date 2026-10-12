// Browsertest af v0.7: sværhedsgrad, mønter, opgraderingsmenuen, point/rekorder, ydelsestest i pausen,
// FPS-indstilling, pause ved app-skift – og opgraderinger med touch på en telefon.
// npx vite build && npx vite preview --port 4173 &  →  node scripts/progress-ui-test.mjs
import { chromium } from 'playwright-core';
const [url = 'http://localhost:4173/', out = 'test-output'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? '  ✓' : '  ✗'} ${msg}`); if (!c) fails++; };
const errors = [];

async function setup(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_TUNNEL') && errors.push(m.text()));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const frames = async (n) => { const f0 = await ev(() => window.__kk.state().frames); await page.waitForFunction((f) => window.__kk.state().frames >= f, f0 + n, { timeout: 240000 }); };
  const vis = (sel) => page.locator(sel).first().isVisible();
  const txt = (sel) => page.textContent(sel);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__kk, null, { timeout: 60000 });
  await frames(2);
  return { ctx, page, ev, frames, vis, txt };
}

// ================= Computer (mus + tastatur) =================
{
  const { ctx, page, ev, frames, vis, txt } = await setup({ viewport: { width: 1280, height: 720 } });
  console.log('Startskærm: sværhed og rekord');
  await page.click('#menu .mode.hunt');
  await frames(1);
  ok(await ev(() => document.querySelectorAll('#menu .seg button[data-diff]').length === 3), 'Kæmpejagt har tre sværhedsgrader');
  ok(await ev(() => document.querySelector('#menu .seg button[data-diff="normal"]').classList.contains('on')), 'Normal er valgt fra start');
  await page.click('#menu .seg button[data-map="bastionen"]');
  await page.click('#menu .seg button[data-diff="svaer"]');
  await frames(1);
  ok((await txt('#menu .mapcard')).includes('Ingen rekord endnu på Svær'), 'kortet viser rekorden for valgt bane og sværhed');
  ok(await ev(() => JSON.parse(localStorage.getItem('klodskamp.indstillinger')).huntDiff === 'svaer'), 'sværhedsvalget gemmes');

  console.log('Jagt på Svær');
  await page.click('text=Start jagten');
  await page.waitForFunction(() => window.__kk.state().state === 'intro', null, { timeout: 120000 });
  ok(await ev(() => window.__kk.hunt.difficulty === 'svaer' && window.__kk.hunt.mapId === 'bastionen'), 'jagten starter på Bastionen med sværhed Svær');
  ok((await txt('#huntintro')).includes('Svær') && (await txt('#huntintro')).includes('mønter'), 'intro nævner sværhed og mønter');
  await page.click('#huntintro >> text=Klik for at starte');
  await frames(2);
  await ev(() => { window.__kk.input.locked = true; });
  ok((await txt('#hunthud .wave')).includes('◆ 0'), 'HUD viser mønter (0)');
  ok(await vis('#hunthud .shophint'), 'i pausen før bølgen vises "B · opgraderinger"');

  console.log('Opgraderingsmenuen');
  await ev(() => { window.__kk.hunt.coins = 400; window.__kk.hunt.phaseT = 30; });
  await page.keyboard.press('KeyB');
  await frames(2);
  ok(await vis('#huntshop') && await ev(() => window.__kk.huntUi.shopOpen), 'B åbner opgraderingsmenuen');
  ok(await ev(() => document.querySelectorAll('#huntshop .item').length === 5), 'fem opgraderinger (ingen port på Bastionen)');
  const t0 = await ev(() => window.__kk.hunt.phaseT);
  await frames(4);
  ok(await ev((t) => window.__kk.hunt.phaseT === t, t0), 'tiden står stille, mens menuen er åben');
  await page.keyboard.press('Digit1');
  await frames(1);
  ok(await ev(() => window.__kk.hunt.up.gas === 1 && window.__kk.hunt.coins === 330), 'tast 1 køber større gastank (70 mønter)');
  ok(await ev(() => document.querySelectorAll('#huntshop .item[data-up="gas"] .lv i.on').length === 1), 'niveauet vises i menuen');
  await page.click('#huntshop .item[data-up="dmg"]');
  await frames(1);
  ok(await ev(() => window.__kk.hunt.up.dmg === 1 && window.__kk.hunt.coins === 240), 'klik køber skarpere kugler');
  await ev(() => { window.__kk.hunt.coins = 10; });
  await page.click('#huntshop .item[data-up="armor"]');
  await frames(1);
  ok(await ev(() => window.__kk.hunt.up.armor === 0) && (await txt('#huntshop .msg')).includes('Ikke nok'), 'uden nok mønter: "Ikke nok mønter"');
  await page.screenshot({ path: `${out}/p1-shop.png` });
  await page.keyboard.press('KeyB');
  await frames(2);
  ok(!(await vis('#huntshop')), 'B lukker menuen igen');
  ok(await ev((t) => window.__kk.hunt.phaseT < t, t0), 'tiden går igen, når menuen er lukket');
  await page.keyboard.press('KeyB');
  await frames(1);
  await page.click('#huntshop >> text=Start bølgen nu');
  ok(await (async () => { for (let i = 0; i < 60; i++) { if (await ev(() => window.__kk.hunt.phase === 'fight')) return true; await frames(1); } return false; })(), '"Start bølgen nu" starter bølgen');
  ok(!(await vis('#huntshop')), 'og lukker menuen');

  console.log('Mønter og point under kampen');
  await page.waitForFunction(() => window.__kk.hunt.giants.some((g) => g.alive), null, { timeout: 120000 });
  await page.keyboard.press('KeyB');
  await frames(1);
  ok(!(await vis('#huntshop')), 'B virker ikke midt i en bølge');
  await ev(() => { const h = window.__kk.hunt; for (const g of h.giants) g.takeDamage(h, 99999, 'torso'); });
  await frames(2);
  ok((await txt('#hunthud .pop')).includes('KÆMPE FÆLDET') && (await txt('#hunthud .pop')).includes('+60'), 'en fældet kæmpe giver "+60 ◆"');
  ok(await ev(() => window.__kk.hunt.score === 1280), 'point (Svær ×1,6): kæmpe 500 + bølge 300 → 1280');

  console.log('Slutskærm og rekord');
  await ev(() => { const h = window.__kk.hunt; h.hurtPlayer(9999, null, 'slag', -1, true); });
  await page.waitForFunction(() => window.__kk.state().state === 'end', null, { timeout: 120000 });
  await frames(1);
  ok(await vis('#huntend .points'), 'slutskærmen viser point');
  ok((await txt('#huntend')).includes('NY REKORD'), 'første resultat er en ny rekord');
  ok(await vis('#huntend table.recs'), 'rekordlisten vises');
  ok(await ev(() => JSON.parse(localStorage.getItem('klodskamp.rekorder'))['bastionen:svaer'][0].score === 1280), 'rekorden er gemt');
  await page.screenshot({ path: `${out}/p2-end.png` });
  await page.click('#huntend >> text=Hovedmenu');
  await frames(2);
  await page.click('#menu .mode.hunt');
  await frames(1);
  ok((await txt('#menu .mapcard')).includes('Rekord (Svær)'), 'startskærmen viser rekorden');

  console.log('Pause: ydelsestest, FPS og app-skift');
  await page.click('text=Start jagten');
  await page.waitForFunction(() => window.__kk.state().state === 'intro', null, { timeout: 120000 });
  await page.click('#huntintro >> text=Klik for at starte');
  await frames(2);
  await ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await frames(1);
  ok((await ev(() => window.__kk.state().state)) === 'paused' && await vis('#pause'), 'spillet pauser, når siden skjules (app-skift)');
  await ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
  await page.click('#pause >> text=Mål ydelse');
  await page.waitForFunction(() => document.querySelector('#pause .bench')?.textContent.includes('ms pr. billede'), null, { timeout: 120000 });
  ok(true, 'ydelsestesten i pausemenuen viser ms pr. billede');
  // (efter ydelsestesten er headless-grafikken meget langsom – derfor klik via DOM her)
  await ev(() => [...document.querySelectorAll('#pause button')].find((b) => b.textContent === 'Indstillinger').click());
  await ev(() => { const r = [...document.querySelectorAll('#pause .setting')].find((x) => x.textContent.includes('Vis FPS')); r.querySelector('input').click(); });
  await frames(1);
  ok(await ev(() => !document.querySelector('div[style*="Silkscreen"]')?.hidden || [...document.querySelectorAll('body > div')].some((d) => d.textContent.includes('FPS') && !d.hidden)), 'FPS-visningen kommer frem');
  ok(await ev(() => JSON.parse(localStorage.getItem('klodskamp.indstillinger')).showFps === true), 'Vis FPS gemmes');
  await ctx.close();
}

// ================= Telefon (touch) =================
{
  const { ctx, page, ev, frames, vis } = await setup({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const center = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const tap = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); const c = await center(sel); await page.touchscreen.tap(c.x, c.y); };
  console.log('Telefon: opgraderinger med touch');
  await ev(() => window.__kk.startHunt('ravnsdalen', 'let'));
  await page.waitForFunction(() => window.__kk.state().state === 'intro', null, { timeout: 120000 });
  await tap('#huntintro >> text=Klik for at starte');
  await frames(3);
  await ev(() => { window.__kk.hunt.coins = 300; window.__kk.hunt.phaseT = 30; });
  await frames(1);
  ok(await vis('#touch .b-shop'), 'OPGRADÉR-knappen vises i pausen');
  await tap('#touch .b-shop');
  await frames(2);
  ok(await ev(() => window.__kk.huntUi.shopOpen) && !(await vis('#touch .b-fire')), 'et tryk åbner menuen (spilknapperne skjules)');
  ok(await ev(() => document.querySelectorAll('#huntshop .item').length === 6), 'seks valg i Ravnsdalen (med reparation af porten)');
  ok(await ev(() => { const c = document.querySelector('#huntshop .card').getBoundingClientRect(); return c.top >= 0 && c.bottom <= innerHeight + 1; }) || await ev(() => getComputedStyle(document.querySelector('#huntshop .card')).overflowY === 'auto'), 'menuen kan være på skærmen (eller rulles)');
  await page.screenshot({ path: `${out}/p3-shop-mobil.png` });
  await tap('#huntshop .item[data-up="hook"]');
  await frames(1);
  ok(await ev(() => window.__kk.hunt.up.hook === 1), 'tryk køber stærkere krog');
  await tap('#huntshop >> text=Start bølgen nu');
  ok(await (async () => { for (let i = 0; i < 60; i++) { if (await ev(() => window.__kk.hunt.phase === 'fight')) return true; await frames(1); } return false; })(), '"Start bølgen nu" virker med touch');
  await frames(2);
  ok(await vis('#touch .b-fire') && !(await vis('#touch .b-shop')), 'spilknapperne er tilbage, OPGRADÉR er væk under bølgen');
  const w0 = await ev(() => document.querySelector('#touch .b-fire').getBoundingClientRect().width);
  await ev(() => { const s = JSON.parse(localStorage.getItem('klodskamp.indstillinger') || '{}'); void s; });
  await tap('#touch .b-pause');
  await frames(1);
  await tap('#pause >> text=Indstillinger');
  await frames(1);
  await tap('#pause .setting >> text=Store');
  await tap('#pause >> text=Tilbage');
  await tap('#pause >> text=Fortsæt');
  await frames(2);
  const w1 = await ev(() => document.querySelector('#touch .b-fire').getBoundingClientRect().width);
  ok(w1 > w0 * 1.1, `"Store" knapper gør knapperne større (${Math.round(w0)} → ${Math.round(w1)} px)`);
  await page.screenshot({ path: `${out}/p4-store-knapper.png` });
  await ctx.close();
}

ok(errors.length === 0, `ingen fejl i konsollen${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(fails ? `\n${fails} FEJL` : '\nALT OK');
process.exit(fails ? 1 : 0);
