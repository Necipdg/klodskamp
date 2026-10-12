// Browsertest af Kæmpejagt og skift mellem spiltyperne (headless Chromium):
// npx vite build && npx vite preview --port 4173 &  →  node scripts/hunt-ui-test.mjs
import { chromium } from 'playwright-core';
const [url = 'http://localhost:4173/', out = 'test-output'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_TUNNEL') && errors.push(m.text()));
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? '  ✓' : '  ✗'} ${msg}`); if (!c) fails++; };
const ev = (fn, arg) => page.evaluate(fn, arg);
const frames = async (n) => { const f0 = await ev(() => window.__kk.state().frames); await page.waitForFunction((f) => window.__kk.state().frames >= f, f0 + n, { timeout: 180000 }); };
const vis = (sel) => page.locator(sel).first().isVisible();
const st = () => ev(() => window.__kk.state());
/** Vent til en betingelse er sand (simuleringen kører i rigtig tid, men headless er langsom) */
const until = async (fn, maxFrames = 200) => { for (let i = 0; i < maxFrames; i++) { if (await ev(fn)) return true; await frames(1); } return false; };

await page.goto(url);
await page.waitForFunction(() => !!window.__kk, null, { timeout: 60000 });
await frames(2);

console.log('Startskærm');
ok(await vis('#menu .mode.hunt'), 'valget "Kæmpejagt" vises på startskærmen');
ok(await vis('text=Spil som angriber'), 'taktisk kamp er valgt fra start');
await page.click('#menu .mode.hunt');
await frames(1);
ok(await vis('text=Start jagten') && !(await vis('text=Spil som angriber')), 'Kæmpejagt-valget viser "Start jagten"');
ok((await page.textContent('#menu .mapcard')).includes('Ravnsdalen'), 'Ravnsdalen er valgt som bane fra start');
await page.click('#menu .seg button[data-map="bastionen"]');
await frames(1);
ok((await page.textContent('#menu .mapcard')).includes('Bastionen'), 'banevalget skifter kortet til Bastionen');
await page.click('#menu .btn.small >> text=Styring');
await frames(1);
ok((await page.textContent('#pause')).includes('krogen'), 'styring på startskærmen viser Kæmpejagts taster');
await page.click('#pause >> text=Tilbage');

console.log('Start af Kæmpejagt');
await page.click('text=Start jagten');
await frames(2);
let s = await st();
ok(s.mode === 'hunt' && s.state === 'intro', 'tilstand = intro i Kæmpejagt');
ok(await vis('#huntintro'), 'styrings-kortet for Kæmpejagt vises');
ok(!(await vis('#menu')), 'startskærmen er skjult');
await page.click('#huntintro >> text=Klik for at starte');
await frames(2);
s = await st();
ok(s.state === 'play', 'jagten er i gang efter klik');
ok(await vis('#hunthud') && !(await vis('#hud')), 'Kæmpejagts HUD vises (ikke den taktiske)');
ok((await page.textContent('#hunthud .wave')).includes('BØLGE 1'), 'HUD viser bølge 1/3');

console.log('Styring (rigtige taster)');
await ev(() => { window.__kk.input.locked = true; }); // headless kan ikke låse musen – lad som om
await ev(() => { const h = window.__kk.hunt; const p = h.player; p.body.pos = { x: 39.5, y: 1, z: 52 }; p.prevPos = { ...p.body.pos }; p.yaw = -Math.PI / 2; p.pitch = 0.55; });
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'right' });
ok(await until(() => window.__kk.hunt.hook.state === 'attached', 40), 'højre musetast skyder krogen ud, og den sætter sig');
ok(await until(() => window.__kk.hunt.player.body.pos.y > 4, 60), 'wiren trækker spilleren op');
await page.keyboard.down('ShiftLeft');
await frames(2);
ok(await ev(() => window.__kk.hunt.reeling), 'Shift spoler wiren hurtigt ind');
await page.keyboard.up('ShiftLeft');
await page.mouse.up({ button: 'right' });
await frames(2);
ok((await ev(() => window.__kk.hunt.hook.state)) === 'idle', 'slip højre knap: krogen løsnes');
await ev(() => { const p = window.__kk.hunt.player; p.body.pos = { x: 45.5, y: 25, z: 45.5 }; p.prevPos = { ...p.body.pos }; p.body.vel = { x: 0, y: 0, z: 0 }; p.pitch = 0.2; window.__kk.hunt.gas = 100; });
await page.keyboard.down('Space');
ok(await until(() => window.__kk.hunt.boosting, 20), 'mellemrum i luften = gas-boost');
await page.keyboard.up('Space');
await page.keyboard.down('KeyG');
ok(await until(() => window.__kk.hunt.braking, 20), 'G = bremse-dyser');
await page.keyboard.up('KeyG');
const mag0 = await ev(() => window.__kk.hunt.player.primary.mag);
await page.mouse.down();
await frames(3);
await page.mouse.up();
ok((await ev(() => window.__kk.hunt.player.primary.mag)) < mag0, 'venstre mus skyder i luften');
await page.keyboard.press('KeyR');
ok(await until(() => window.__kk.hunt.player.reloadT > 0 || window.__kk.hunt.player.primary.mag === 30, 10), 'R genlader');
await page.keyboard.press('Digit2');
ok(await until(() => window.__kk.hunt.player.slot === 'pistol', 10), '2 skifter til pistol');
await page.keyboard.press('Digit1');
ok(await until(() => window.__kk.hunt.player.slot === 'primary', 10), '1 skifter til riffel');
ok(await ev(() => window.__kk.sound.loopsActive || !window.__kk.sound['ctx']), 'fartvind/gas-lyde kører i jagten');
await ev(() => { window.__kk.input.locked = false; });

console.log('Bølge 1 og en kæmpe');
await ev(() => window.__kk.huntForward(9));
ok(await ev(() => window.__kk.hunt.giants.length === 1 && window.__kk.hunt.wave === 1), 'bølge 1 starter med én kæmpe');
await frames(3);
ok(await ev(() => window.__kk.view.huntScene && window.__kk.view.huntScene.group.children.length > 0), 'kæmpen tegnes');
await page.screenshot({ path: `${out}/hunt-ui-wave1.png` });

console.log('Pause og forlad jagten');
const locked = await ev(() => !!document.pointerLockElement);
if (locked) { await ev(() => document.exitPointerLock()); await frames(2); ok((await st()).state === 'paused', 'når musen frigives (som ved Esc), pauses jagten'); }
else await ev(() => window.__kk.ui.showPause());
await frames(1);
ok(await vis('#pause'), 'pausemenuen vises');
const hp0 = await ev(() => window.__kk.hunt.time);
await frames(3);
if (locked) ok((await ev(() => window.__kk.hunt.time)) === hp0, 'jagten står stille i pausen');
ok((await page.textContent('#pause')).includes('Forlad jagten'), 'pausemenuen har "Forlad jagten"');
await page.click('#pause >> text=Forlad jagten');
await frames(3);
s = await st();
ok(s.state === 'menu' && s.mode === 'tactical', 'tilbage på startskærmen');
ok(await ev(() => window.__kk.hunt === null && window.__kk.view.huntScene === null), 'ingen kæmper eller by tilbage i scenen');
ok(!(await vis('#hunthud')) && !(await vis('#huntintro')) && !(await vis('#huntend')), 'Kæmpejagts HUD og skærme er skjult');
ok(await ev(() => !window.__kk.sound.loopsActive), 'jagtens vedvarende lyde er stoppet');
ok(await ev(() => window.__kk.huntEndT < 0), 'ingen tidsur fra jagten kører videre');

console.log('Taktisk kamp efter jagten');
await page.click('#menu .mode:not(.hunt)');
await page.click('text=Spil som angriber');
await frames(2);
await page.click('#intro >> text=Klik for at starte');
await frames(2);
s = await st();
ok(s.mode === 'tactical' && s.state === 'play' && s.round === 1, 'taktisk kamp starter normalt');
ok(await vis('#hud') && !(await vis('#hunthud')), 'kun den taktiske HUD vises');
ok(await ev(() => window.__kk.game.players.length === 6), '3 mod 3 spillere');
if (await ev(() => !!document.pointerLockElement)) await ev(() => document.exitPointerLock()); else await ev(() => window.__kk.ui.showPause());
await frames(2);
await page.click('#pause >> text=Forlad kampen');
await frames(2);

console.log('Nederlag og "Prøv igen"');
await page.click('#menu .mode.hunt');
await page.click('text=Start jagten');
await frames(1);
await page.click('#huntintro >> text=Klik for at starte');
await ev(() => window.__kk.huntForward(7));
await ev(() => { const h = window.__kk.hunt; h.hurtPlayer(999, null, 'test', -1); });
await frames(1);
ok((await ev(() => window.__kk.hunt.phase)) === 'lost', 'liv 0 = nederlag');
ok(await until(() => window.__kk.state().state === 'end', 120), 'slutskærmen kommer efter et par sekunder');
ok(await vis('#huntend') && (await page.textContent('#huntend')).includes('NEDERLAG'), 'nederlagsskærm vises');
await page.screenshot({ path: `${out}/hunt-ui-lost.png` });
await page.click('#huntend >> text=Prøv igen');
await frames(2);
s = await st();
ok(s.state === 'intro' && s.mode === 'hunt' && s.wave === 0, '"Prøv igen" starter en ny jagt forfra');
ok(await ev(() => window.__kk.hunt.player.alive && window.__kk.hunt.player.hp === 100 && window.__kk.hunt.giants.length === 0 && window.__kk.hunt.rocks.length === 0), 'nyt liv, ingen kæmper, ingen sten');
ok(!(await vis('#huntend')), 'slutskærmen er væk');

console.log('Sejr og "Hovedmenu"');
await page.click('#huntintro >> text=Klik for at starte');
await ev(() => { window.__kk.hunt.hurtPlayer = () => {}; }); // testen skal kun prøve sejrsforløbet
for (let w = 0; w < 3; w++) {
  await ev(() => { const h = window.__kk.hunt; if (h.phase === 'break') h.phaseT = 0.01; });
  await ev(() => window.__kk.huntForward(25));
  await ev(() => { const h = window.__kk.hunt; for (const g of h.giants) if (g.alive) g.takeDamage(h, 99999, 'nape'); });
  await ev(() => window.__kk.huntForward(1));
}
ok((await ev(() => window.__kk.hunt.phase)) === 'won', 'alle tre bølger klaret = sejr');
ok(await until(() => window.__kk.state().state === 'end', 120), 'sejrsskærmen kommer');
ok(await vis('#huntend') && (await page.textContent('#huntend')).includes('SEJR'), 'sejrsskærm vises');
await page.screenshot({ path: `${out}/hunt-ui-won.png` });
await page.click('#huntend >> text=Hovedmenu');
await frames(3);
s = await st();
ok(s.state === 'menu' && s.mode === 'tactical' && !(await vis('#huntend')), '"Hovedmenu" fører tilbage til startskærmen');
await frames(20);
ok((await st()).state === 'menu', 'startskærmen bliver stående (ingen forsinkede skift)');

console.log('Ravnsdalen');
await page.click('#menu .mode.hunt');
await page.click('#menu .seg button[data-map="ravnsdalen"]');
await page.click('text=Start jagten');
await frames(2);
ok((await page.textContent('#huntintro')).includes('Ravnsdalen') && (await page.textContent('#huntintro')).includes('bjergpassene'), 'styrings-kortet nævner Ravnsdalen og bjergpassene');
await page.click('#huntintro >> text=Klik for at starte');
await frames(2);
ok(await ev(() => window.__kk.hunt.city.name === 'Ravnsdalen' && window.__kk.hunt.mills.length === 3), 'dalen er bygget med tre vindmøller');
ok(await ev(() => { const h = window.__kk.hunt, p = h.player.body.pos; return h.world.solidAt(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)); }), 'spilleren står på Borgporten ved start');
await ev(() => { window.__kk.hunt.hurtPlayer = () => {}; });
await ev(() => window.__kk.huntForward(8));
ok(await ev(() => window.__kk.hunt.wave === 1 && window.__kk.hunt.giants.length === 1), 'bølge 1: en kæmpe kommer ind gennem et pas');
await ev(() => window.__kk.huntForward(25));
ok(await ev(() => { const h = window.__kk.hunt, g = h.giants[0]; return h.nav.walkable(Math.floor(g.pos.x), Math.floor(g.pos.z), 1); }), 'kæmpen går på farbar grund i dalen');
await frames(3);
await page.screenshot({ path: `${out}/hunt-ui-ravnsdalen.png` });
ok((await page.textContent('#hunthud .flight')).includes('over jorden'), 'HUD viser højde over jorden');
ok(await vis('#hunthud .gatebar') && (await page.textContent('#hunthud .gatebar')).includes('BORGPORTEN'), 'HUD viser Borgportens liv');
ok((await page.textContent('#hunthud .wave')).includes('/5'), 'Ravnsdalen har fem bølger');
await ev(() => { const h = window.__kk.hunt; h.damageGate(400, h.city.gate.center); });
await frames(2);
ok(await ev(() => window.__kk.hunt.gate.hp === 1200 && window.__kk.hunt.city.gate.cells.some(([x, y, z]) => !window.__kk.hunt.world.solidAt(x, y, z))), 'slag på porten giver huller i den');
if (await ev(() => !!document.pointerLockElement)) await ev(() => document.exitPointerLock()); else await ev(() => window.__kk.ui.showPause());
await frames(2);
await page.click('#pause >> text=Forlad jagten');
await frames(3);
ok(await ev(() => window.__kk.hunt === null && window.__kk.view.huntScene === null && !window.__kk.sound.loopsActive), 'efter dalen: intet fra jagten er tilbage');

console.log('Skift frem og tilbage 5 gange');
for (let i = 0; i < 5; i++) {
  await ev((i) => window.__kk.startHunt(i % 2 ? 'bastionen' : 'ravnsdalen'), i);
  await ev(() => window.__kk.begin());
  await ev(() => window.__kk.huntForward(8));
  await frames(1);
  await ev(() => window.__kk.start('D', 'normal'));
  await frames(1);
}
ok(await ev(() => window.__kk.hunt === null && window.__kk.view.huntScene === null && !window.__kk.sound.loopsActive), 'efter 5 skift: intet fra jagten er tilbage');
ok(await ev(() => window.__kk.view.renderer.info.memory.geometries < 2500), `geometrier i hukommelsen: ${await ev(() => window.__kk.view.renderer.info.memory.geometries)}`);

console.log(errors.length ? `Fejl i konsollen:\n${errors.join('\n')}` : 'Ingen fejl i konsollen');
console.log(fails ? `${fails} tjek fejlede` : 'Alle tjek bestået');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
