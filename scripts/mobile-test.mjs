// Browsertest som telefon (liggende 844×390, touch): node scripts/mobile-test.mjs
// Kræver `npx vite preview --port 4173`. Touch-fingre styres via Chrome DevTools-protokollen (flere fingre ad gangen).
import { chromium } from 'playwright-core';
const [url = 'http://localhost:4173/', out = 'test-output'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_TUNNEL') && errors.push(m.text()));
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? '  ✓' : '  ✗'} ${msg}`); if (!c) fails++; };
const ev = (fn, arg) => page.evaluate(fn, arg);
const frames = async (n) => { const f0 = await ev(() => window.__kk.state().frames); await page.waitForFunction((f) => window.__kk.state().frames >= f, f0 + n, { timeout: 240000 }); };
const vis = (sel) => page.locator(sel).first().isVisible();
const st = () => ev(() => window.__kk.state());
const until = async (fn, maxFrames = 120) => { for (let i = 0; i < maxFrames; i++) { if (await ev(fn)) return true; await frames(1); } return false; };
// Fingre: { id, x, y }
const fingers = new Map();
const touch = async (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...fingers.values()].map((f) => ({ x: f.x, y: f.y, id: f.id, radiusX: 4, radiusY: 4, force: 1 })) });
const fDown = async (id, x, y) => { fingers.set(id, { id, x, y }); await touch('touchStart'); };
const fMove = async (id, x, y) => { const f = fingers.get(id); f.x = x; f.y = y; await touch('touchMove'); };
const fUp = async (id) => { const f = fingers.get(id); fingers.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [...fingers.values()].map((g) => ({ x: g.x, y: g.y, id: g.id })) }); void f; };
const center = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const tap = async (sel) => { const c = await center(sel); await page.touchscreen.tap(c.x, c.y); };

await page.goto(url);
await page.waitForFunction(() => !!window.__kk, null, { timeout: 60000 });
await frames(2);
console.log('Telefon: startskærm');
ok(await ev(() => document.body.classList.contains('touch')), 'touch-styring slås til automatisk på en telefon');
ok(await ev(() => { const c = document.querySelector('#menu .col'); return c.getBoundingClientRect().bottom <= window.innerHeight + 1 || getComputedStyle(c).overflowY === 'auto'; }), 'menuen kan være på skærmen (eller rulles)');
await page.screenshot({ path: `${out}/m1-menu.png` });

console.log('Kæmpejagt med touch');
await tap('#menu .mode.hunt');
await frames(1);
await tap('text=Start jagten');
await page.waitForFunction(() => window.__kk.state().state === 'intro', null, { timeout: 120000 });
await frames(2);
ok(await vis('#huntintro'), 'styrings-kortet vises');
ok((await page.textContent('#huntintro')).includes('Træk på højre side'), 'styrings-kortet forklarer touch-styringen');
await page.screenshot({ path: `${out}/m2-intro.png` });
await tap('#huntintro >> text=Klik for at starte');
await frames(3);
ok((await st()).state === 'play', 'jagten er i gang efter et tryk');
ok(await vis('#touch .b-fire') && await vis('#touch .b-a2') && await vis('#touch .b-pause'), 'knapperne SKYD, KROG og pause vises');
ok((await page.textContent('#touch')).includes('BOOST') && (await page.textContent('#touch')).includes('BREMS') && (await page.textContent('#touch')).includes('SPOL'), 'BOOST, BREMS og SPOL vises');
await page.screenshot({ path: `${out}/m3-hunt.png` });

// Styrepind: gå frem (nede på pladsen foran Borgporten)
await ev(() => { const p = window.__kk.hunt.player; p.body.pos = { x: 104.5, y: 2, z: 152 }; p.prevPos = { ...p.body.pos }; p.body.vel = { x: 0, y: 0, z: 0 }; p.yaw = Math.PI; p.pitch = 0; });
await frames(2);
const p0 = await ev(() => ({ ...window.__kk.hunt.player.body.pos }));
await fDown(1, 140, 300);
await fMove(1, 140, 240);
await frames(1);
ok(await ev(() => window.__kk.input.axisY > 0.6), 'styrepinden giver fremad');
await frames(6);
const p1 = await ev(() => ({ ...window.__kk.hunt.player.body.pos }));
ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.3, `spilleren går med styrepinden (${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m)`);
// Samtidig: kig med højre tommelfinger
const y0 = await ev(() => window.__kk.hunt.player.yaw);
await fDown(2, 520, 200);
await fMove(2, 600, 200);
await frames(2);
const y1 = await ev(() => window.__kk.hunt.player.yaw);
ok(Math.abs(y1 - y0) > 0.05, 'kig ved at trække (samtidig med styrepinden)');
await fUp(2); await fUp(1);
await frames(1);
ok(await ev(() => window.__kk.input.axisX === 0 && window.__kk.input.axisY === 0), 'styrepinden slippes');

// Skyd
await ev(() => { const h = window.__kk.hunt; h.player.primary.mag = 30; });
const fire = await center('#touch .b-fire');
await fDown(3, fire.x, fire.y);
await frames(3);
await fUp(3);
await frames(1);
ok(await ev(() => window.__kk.hunt.player.primary.mag < 30), 'SKYD skyder');
// Skyd og sigt med samme tommelfinger: hold SKYD og træk
await ev(() => { const h = window.__kk.hunt; h.player.primary.mag = 30; h.player.yaw = 0; h.player.pitch = 0; });
await fDown(3, fire.x, fire.y);
for (let i = 1; i <= 6; i++) { await fMove(3, fire.x - i * 12, fire.y - i * 3); await frames(1); }
const aim = await ev(() => ({ yaw: window.__kk.hunt.player.yaw, pitch: window.__kk.hunt.player.pitch, mag: window.__kk.hunt.player.primary.mag, held: window.__kk.input.mouseDown }));
await fUp(3);
await frames(1);
ok(aim.held && aim.mag < 30 && aim.yaw > 0.05 && aim.pitch > 0.01, `hold SKYD og træk: skyder og drejer på samme tid (drejet ${aim.yaw.toFixed(2)} rad)`);
ok(await ev(() => !window.__kk.input.mouseDown), 'slip SKYD: holder op med at skyde');

// Krog: sigt mod porthuset og hold KROG
await ev(() => { const h = window.__kk.hunt, p = h.player; p.yaw = 0; p.pitch = 0.15; });
const hook = await center('#touch .b-a2');
await fDown(4, hook.x, hook.y);
ok(await until(() => window.__kk.hunt.hook.state === 'attached', 30), 'KROG skyder krogen ud, og den sætter sig');
await fUp(4);
ok(await until(() => window.__kk.hunt.hook.state === 'idle', 10), 'slip KROG: krogen løsnes');

// Boost i luften
await ev(() => { const h = window.__kk.hunt, p = h.player; p.body.pos = { x: 104.5, y: 40, z: 150 }; p.prevPos = { ...p.body.pos }; p.body.vel = { x: 0, y: 0, z: 0 }; h.gas = 100; });
const jump = await center('#touch .b-jump');
await fDown(5, jump.x, jump.y);
ok(await until(() => window.__kk.hunt.boosting, 20), 'BOOST i luften bruger gas');
await fUp(5);
await ev(() => { const h = window.__kk.hunt, p = h.player; p.body.pos = { x: 104.5, y: 40, z: 150 }; p.prevPos = { ...p.body.pos }; p.body.vel = { x: 8, y: -2, z: 0 }; h.gas = 100; });
const brake = await center('#touch .b-a3');
await fDown(6, brake.x, brake.y);
ok(await until(() => window.__kk.hunt.braking, 20), 'BREMS bremser');
await fUp(6);

// Pause
await tap('#touch .b-pause');
await frames(2);
ok((await st()).state === 'paused' && await vis('#pause'), 'pauseknappen pauser');
ok(!(await vis('#touch .b-fire')), 'knapperne skjules i pausen');
await page.screenshot({ path: `${out}/m4-pause.png` });
await tap('#pause >> text=Fortsæt');
await frames(2);
ok((await st()).state === 'play' && await vis('#touch .b-fire'), '"Fortsæt" fortsætter uden mus');
await tap('#touch .b-pause');
await frames(1);
await tap('#pause >> text=Forlad jagten');
await frames(3);
ok((await st()).state === 'menu' && !(await vis('#touch .b-fire')), 'tilbage i menuen uden knapper');

console.log('Taktisk kamp med touch');
await tap('#menu .mode:not(.hunt)');
await tap('text=Spil som angriber');
await frames(2);
ok((await page.textContent('#intro')).includes('BRUG'), 'introduktionen nævner BRUG-knappen');
await tap('#intro >> text=Klik for at starte');
await frames(3);
ok((await st()).state === 'play' && await vis('#touch .b-fire'), 'kampen er i gang med knapper');
ok(await vis('#touch .buy'), 'KØB-knappen vises i købsfasen');
await page.screenshot({ path: `${out}/m5-tactical.png` });
await tap('#touch .buy');
await frames(2);
ok(await vis('#buy') && !(await vis('#touch .b-fire')), 'KØB åbner købsmenuen (knapperne skjules)');
const m0 = await ev(() => window.__kk.game.human.money);
await page.locator('#buy .item').nth(2).tap();
await frames(1);
ok((await ev(() => window.__kk.game.human.money)) < m0, 'man kan købe med et tryk');
await page.screenshot({ path: `${out}/m6-buy.png` });
await tap('#buy >> text=Luk');
await frames(2);
ok(!(await vis('#buy')) && await vis('#touch .b-fire'), '"Luk" lukker købsmenuen');
const crouch = await center('#touch .b-a2');
await fDown(7, crouch.x, crouch.y);
ok(await until(() => window.__kk.game.human.crouching, 20), 'HUK får spilleren til at gå i hug');
await fUp(7);
const board = await center('#touch .b-board');
await fDown(8, board.x, board.y);
await frames(2);
ok(await vis('#scoreboard'), 'TAVLE viser resultattavlen, mens den holdes');
await fUp(8);
await frames(2);
ok(!(await vis('#scoreboard')), 'resultattavlen forsvinder igen');

console.log('Højkant');
await page.setViewportSize({ width: 390, height: 844 });
await frames(1);
ok(await vis('#rotate'), 'på højkant beder spillet om at dreje telefonen');
await page.screenshot({ path: `${out}/m7-portrait.png` });
await page.setViewportSize({ width: 844, height: 390 });

console.log(errors.length ? `Fejl i konsollen:\n${errors.join('\n')}` : 'Ingen fejl i konsollen');
console.log(fails ? `${fails} tjek fejlede` : 'Alle tjek bestået');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
