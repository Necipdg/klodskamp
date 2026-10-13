// Browsertest af "Spil sammen": tre browsere (vært + to gæster) forbundet direkte med WebRTC via en lokal signalserver.
// npm run build:app && npx vite preview --port 4173 &  npx peerjs --port 9000 &  →  node scripts/coop-test.mjs [url] [udmappe]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const [base = 'http://localhost:4173/', out = 'shots'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const url = `${base}?peer=127.0.0.1:9000`;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? '  ✓' : '  ✗'} ${msg}`); if (!c) fails++; };
const errors = [];
async function open(name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_|favicon|stun/i.test(m.text())) errors.push(`${name} (konsol): ${m.text()}`); });
  return page;
}
/** Skærmbillede (springes over, hvis den langsomme testgrafik ikke når det) */
const snap = async (p, path) => { try { await p.screenshot({ path, timeout: 90000 }); } catch { console.log(`    (skærmbillede ${path} sprunget over)`); } };
const wait = (p, fn, arg, t = 120000) => p.waitForFunction(fn, arg, { timeout: t });

// ---------- Værten opretter et rum ----------
const host = await open('vært');
await host.goto(url, { timeout: 180000, waitUntil: 'domcontentloaded' });
await wait(host, () => !!window.__kk);
await host.click('#menu .mode.hunt');
ok(await host.locator('#menu .btn.coop').isVisible(), 'knappen "Spil sammen" vises under Kæmpejagt');
await host.click('#menu .btn.coop');
await host.fill('#coop input.name', 'Far');
await host.click('#coop .seg button[data-map="saltvig"]');
await host.click('#coop [data-act="create"]');
await host.waitForSelector('#coop .code', { timeout: 30000 });
const code = (await host.textContent('#coop .code')).trim();
const link = (await host.textContent('#coop .link')).trim();
ok(/^[A-Z2-9]{5}$/.test(code), `rummet har en kode (${code})`);
ok(link.includes(`rum=${code}`), `invitationslinket indeholder koden (${link})`);
const wa = await host.getAttribute('#coop .btn.wa', 'href');
ok(wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa).includes(link), 'WhatsApp-knappen deler linket');
await snap(host, `${out}/coop-1-vaert-lobby.png`);

// ---------- To gæster åbner linket ----------
const g1 = await open('Ida');
await g1.goto(link, { timeout: 180000, waitUntil: 'domcontentloaded' });
await wait(g1, () => !!window.__kk);
ok((await g1.textContent('#coop')).includes('Du er inviteret'), 'gæst: "Du er inviteret" vises fra linket');
await snap(g1, `${out}/coop-2-inviteret.png`);
await g1.fill('#coop input.name', 'Ida');
await g1.click('#coop [data-act="join"]');
await wait(g1, () => window.__kk.coop().pid === 1, null, 40000);
ok(true, 'gæst 1 er forbundet til værten');
const g2 = await open('Bo', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
await g2.goto(link, { timeout: 180000, waitUntil: 'domcontentloaded' });
await wait(g2, () => !!window.__kk);
await g2.fill('#coop input.name', 'Bo');
await g2.click('#coop [data-act="join"]');
await wait(g2, () => window.__kk.coop().pid === 2, null, 40000);
ok(true, 'gæst 2 (telefon) er forbundet');
await wait(host, () => window.__kk.coop().players.length === 3);
ok((await host.textContent('#coop .players')).includes('Ida') && (await host.textContent('#coop .players')).includes('Bo'), 'værten ser begge gæster i lobbyen');
ok((await g1.textContent('#coop .players')).includes('Bo'), 'gæsterne ser hinanden i lobbyen');
// ---------- Stemmechat: værten og Ida slår "Tal sammen" til (testbrowseren har en falsk mikrofon, der bipper) ----------
await host.click('#coop [data-act="voice"]');
await g1.click('#coop [data-act="voice"]');
await wait(host, () => !!document.querySelector('audio[data-voice="1"]')?.srcObject, null, 30000);
await wait(g1, () => !!document.querySelector('audio[data-voice="0"]')?.srcObject, null, 30000);
ok(true, 'stemmechat: værten og Ida er forbundet med lyd begge veje');
ok(await g2.evaluate(() => !document.querySelector('audio[data-voice]')), 'stemmechat: Bo (uden "Tal sammen") får ingen lyd');
await wait(host, () => window.__kk.voice?.talking(1), null, 30000);
ok(true, 'stemmechat: værten kan "høre" Ida (lydniveau fra forbindelsen)');
ok((await host.textContent('#coop .players')).includes('🎤'), 'lobbyen viser mikrofon-ikon ved dem der taler med');
await g1.evaluate(() => window.__kk.voice.setMuted(true));
await wait(host, () => window.__kk.coop && document.querySelector('#coop .players')?.textContent.includes('🔇'), null, 20000);
ok(true, 'stemmechat: Ida slår sin mikrofon fra – værten ser 🔇');
await g1.evaluate(() => window.__kk.voice.setMuted(false));
await snap(host, `${out}/coop-3-vaert-3-spillere.png`);
await snap(g1, `${out}/coop-4-gaest-lobby.png`);

// ---------- Værten starter ----------
await host.click('#coop [data-act="start"]');
for (const [p, n] of [[host, 'vært'], [g1, 'Ida'], [g2, 'Bo']]) {
  await wait(p, () => window.__kk.hunt && window.__kk.state().state === 'intro', null, 120000);
  ok(true, `${n}: jagten på Saltvig er bygget`);
}
ok(await host.evaluate(() => window.__kk.hunt.role === 'host' && window.__kk.hunt.hpScale > 1.5), 'værten kører kæmperne (og de har mere liv med 3 spillere)');
ok(await g1.evaluate(() => window.__kk.hunt.role === 'client' && window.__kk.hunt.localPid === 1), 'gæsten kører kun sin egen spiller');
for (const p of [host, g1, g2]) await p.evaluate(() => window.__kk.begin());
// Gæsterne stilles ved siden af værten, så de kan ses
// (lige foran værten, oven på kasserne på altanen)
const hp = await host.evaluate(() => ({ ...window.__kk.hunt.player.body.pos, yaw: window.__kk.hunt.player.yaw }));
const place = (side) => ({ x: hp.x - Math.sin(hp.yaw) * 2.6 + Math.cos(hp.yaw) * side, y: hp.y + 1.6, z: hp.z - Math.cos(hp.yaw) * 2.6 - Math.sin(hp.yaw) * side, yaw: hp.yaw + Math.PI });
for (const [p, side] of [[g1, 1.6], [g2, -1.6]]) await p.evaluate((q) => { const pl = window.__kk.hunt.player; pl.body.pos = { x: q.x, y: q.y, z: q.z }; pl.prevPos = { ...pl.body.pos }; pl.yaw = q.yaw; }, place(side));
await wait(host, () => window.__kk.coop().mates === 2, null, 20000);
ok(true, 'værten ser to medspillere');
await host.waitForTimeout(6000);
await snap(host, `${out}/coop-5-vaert-ser-gaester.png`);
await wait(g1, () => window.__kk.coop().mates === 2, null, 20000);
ok(true, 'gæsten ser værten og den anden gæst');
ok((await g1.textContent('#hunthud .team')).includes('Far') && (await g1.textContent('#hunthud .team')).includes('Bo'), 'holdlisten viser alle tre');

// ---------- Første bølge ----------
await host.evaluate(() => { window.__kk.hunt.phaseT = 0.5; });
await wait(g1, () => window.__kk.hunt.wave === 1 && window.__kk.hunt.giants.length > 0, null, 30000);
ok(true, 'bølge 1 og kæmper kommer også hos gæsten');
await g1.waitForTimeout(2500);
const pos = await Promise.all([host, g1].map((p) => p.evaluate(() => { const g = window.__kk.hunt.giants[0]; return g ? { id: g.id, x: g.pos.x, z: g.pos.z } : null; })));
ok(pos[0] && pos[1] && pos[0].id === pos[1].id && Math.hypot(pos[0].x - pos[1].x, pos[0].z - pos[1].z) < 4, `kæmpen står samme sted hos værten og gæsten (afstand ${pos[0] && pos[1] ? Math.hypot(pos[0].x - pos[1].x, pos[0].z - pos[1].z).toFixed(2) : '?'} m)`);
// Gæstens træf skader værtens kæmpe
const hp0 = await host.evaluate(() => window.__kk.hunt.giants[0].hp);
await g1.evaluate(() => { const h = window.__kk.hunt, g = h.giants[0]; h.emit({ type: 'netHit', id: g.id, part: 'nape', dmg: 150, weak: true }); });
await wait(host, (h0) => window.__kk.hunt.giants[0].hp < h0, hp0, 10000);
ok(true, 'gæstens træf gør skade hos værten');
await wait(g2, () => window.__kk.hunt.coins > 0, null, 10000);
ok(true, 'mønterne er fælles (gæst 2 ser dem)');
// Værtens kæmpe rammer en gæst
const ghp = await g2.evaluate(() => window.__kk.hunt.player.hp);
await host.evaluate(() => window.__kk.hunt.hurtPlayer(25, null, 'slag', -1, true, 2));
await wait(g2, (h0) => window.__kk.hunt.player.hp < h0, ghp, 10000);
ok(true, 'skade fra kæmperne når frem til gæsten');
// En gæst går ned og kommer tilbage – jagten fortsætter
await g1.evaluate(() => window.__kk.hunt.hurtPlayer(999, null, 'slag', -1, true));
await wait(host, () => window.__kk.hunt.remotes.find((r) => r.pid === 1)?.alive === false, null, 10000);
ok(await host.evaluate(() => window.__kk.hunt.phase !== 'lost'), 'en spiller nede = jagten fortsætter');
await snap(g1, `${out}/coop-6-gaest-nede.png`);
await g1.evaluate(() => { window.__kk.hunt.respawnT = Math.min(window.__kk.hunt.respawnT, 1); }); // (testgrafikken er langsom – vent ikke de 10 s)
await wait(g1, () => window.__kk.hunt.player.alive, null, 150000);
ok(true, 'gæsten er tilbage efter et øjeblik');
await g2.waitForTimeout(500);
await snap(g2, `${out}/coop-7-telefon-gaest.png`);

// ---------- Hurtige beskeder ----------
await g1.evaluate(() => window.__kk.sendQuick(1));
await wait(host, () => document.querySelector('#hunthud .qfeed')?.textContent.includes('Kæmpe her!'), null, 20000);
ok((await host.textContent('#hunthud .qfeed')).includes('Ida'), 'hurtig besked fra Ida ses hos værten ("Ida: Kæmpe her!")');
await wait(g2, () => document.querySelector('#hunthud .qfeed')?.textContent.includes('Kæmpe her!'), null, 20000);
ok(true, 'og hos Bo (sendt videre af værten)');
ok(await host.evaluate(() => document.querySelector('#hunthud .team').textContent.includes('🎤') || document.querySelector('#hunthud .team').textContent.includes('🔊')), 'holdlisten viser mikrofon-ikoner i spillet');
await snap(host, `${out}/coop-9-besked.png`);

// ---------- En gæst går, værten lukker ----------
await g2.close();
await wait(host, () => window.__kk.hunt.remotes.length === 1, null, 90000);
ok(true, 'værten mærker at en gæst er gået');
await host.evaluate(() => window.__kk.huntUi.cb.menu());
await wait(g1, () => !!document.querySelector('#coop .err'), null, 20000);
ok((await g1.textContent('#coop')).includes('lukket rummet') || (await g1.textContent('#coop')).includes('forladt'), 'gæsten får besked, når værten lukker rummet');
await snap(g1, `${out}/coop-8-vaert-lukkede.png`);

ok(errors.length === 0, `ingen fejl${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(fails ? `\n${fails} FEJL` : '\nALT OK');
process.exit(fails ? 1 : 0);
