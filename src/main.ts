// Klodskamp – binder kernen (src/core), grafikken (src/render), lyd/input (src/game) og brugerfladen (src/ui) sammen.
// Ét requestAnimationFrame-loop. Simuleringen kører med fast tidsskridt; billedet tegnes interpoleret.
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './ui/style.css';
import { TUNING, type Difficulty } from './config/tuning';
import { BUY_ITEMS, WEAPONS, type Slot } from './config/weapons';
import { Game, type GameEvent } from './core/game';
import { B, BLOCKS } from './core/blocks';
import { chestPos, eyePos, type Team } from './core/player';
import { DEG, clamp, dirFromYawPitch, yawPitchTo } from './core/math';
import { lineOfSight } from './core/ray';
import { GameView, type CamMode } from './render/view';
import { TEAM_COLOR } from './render/skins';
import { Sound } from './game/audio';
import { Input } from './game/input';
import { isTouchDevice, loadSettings, saveSettings, type Settings } from './game/settings';
import { TouchControls } from './game/touch';
import { UI } from './ui/ui';
import { HuntUI, drawCityMap } from './ui/huntUi';
import { Hunt, type HuntEvent } from './hunt/hunt';
import { Giant } from './hunt/giant';
import { HUNT } from './config/hunt';
import type { CityMap, HuntMapId } from './hunt/city';
import { HUNT_MAPS, buildHuntMap } from './hunt/maps';
import { HUNT_DIFF, UPGRADES } from './hunt/progress';
import { addRecord, getRecords, today } from './game/records';
import * as THREE from 'three';

type State = 'menu' | 'intro' | 'play' | 'paused' | 'end';
type Mode = 'tactical' | 'hunt';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const settings = loadSettings();
const sound = new Sound();
sound.setVolume(settings.volume);
const view = new GameView(canvas);
view.setQuality(settings.quality);
view.setFov(settings.fov);
const input = new Input(canvas);

let state: State = 'menu';
let game: Game | null = null;
let menuGame: Game | null = null;
let mode: Mode = 'tactical';
let hunt: Hunt | null = null;
/** Sekunder til slutskærmen vises efter sejr/nederlag i Kæmpejagt (så man ser kæmpen falde) */
let huntEndT = -1;
/** Til skærmbilleder: stands simuleringen men bliv ved med at tegne */
let frozen = false;
let lastTeam: Team = 'A';
let lastDiff: Difficulty = 'normal';
let acc = 0;
let expectUnlock = false;
let spotT = 0;
let beepT = 0;
let blinkT = 0;
let keypadT = 0;
let frames = 0;
// Billedhastighed (F3/F9 eller #fps viser den)
const fpsEl = document.createElement('div');
fpsEl.style.cssText = 'position:fixed;right:8px;top:50%;z-index:9;padding:4px 8px;font:12px Silkscreen,monospace;color:#f2c14e;background:rgba(10,12,16,.7);pointer-events:none';
fpsEl.hidden = !location.hash.includes('fps') && !settings.showFps;
document.body.append(fpsEl);
let benchHold = 0;
let fpsAcc = 0, fpsN = 0, fpsWorst = 0;
window.addEventListener('keydown', (e) => {
  if (e.code === 'F3' || e.code === 'F9') { e.preventDefault(); fpsEl.hidden = !fpsEl.hidden; }
  if (e.code === 'F8') { e.preventDefault(); benchmark(); }
});
/** Ydelsestest: tegn 60 billeder i træk og mål hvor lang tid GPU'en bruger pr. billede */
function benchmark(): string {
  const gl = view.renderer.getContext();
  const cam: CamMode = (game && game.human.alive) || (hunt && hunt.player.alive) ? { mode: 'first' } : { mode: 'orbit' };
  // I Kæmpejagt måles med mindst fire kæmper i synsfeltet (de lånes kun til målingen og fjernes bagefter)
  const extra: Giant[] = [];
  if (hunt) {
    const h = hunt, p = h.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const want = Math.max(0, 4 - h.giants.filter((g) => g.alive).length);
    for (let i = 0; i < want; i++) {
      const d = 22 + i * 9, side = (i % 2 ? 1 : -1) * (4 + i * 3);
      const c = h.nav.nearest(p.body.pos.x + fx * d - fz * side, p.body.pos.z + fz * d + fx * side, 3);
      if (!c) continue;
      const g = new Giant({ x: c.x + 0.5, y: Math.max(1, h.city.floor[c.z * h.world.sx + c.x]), z: c.z + 0.5 }, p.yaw, i === 0 ? 1.35 : 1.05, 1000, i === 0);
      g.state = 'walk';
      g.computeParts();
      extra.push(g);
      h.giants.push(g);
    }
  }
  const times: number[] = [];
  for (let i = 0; i < 60; i++) {
    const t0 = performance.now();
    view.render(1 / 60, 1, cam);
    gl.finish();
    times.push(performance.now() - t0);
  }
  if (hunt) hunt.giants = hunt.giants.filter((g) => !extra.includes(g));
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const n = hunt ? ` · ${hunt.giants.filter((g) => g.alive).length + extra.length} kæmper` : '';
  const txt = `Ydelsestest${n}: ${avg.toFixed(1)} ms pr. billede (≈${Math.round(1000 / avg)} FPS) · median ${times[30].toFixed(1)} ms · værste ${times[59].toFixed(1)} ms · ${view.renderer.domElement.width}×${view.renderer.domElement.height} px`;
  fpsEl.hidden = false;
  fpsEl.textContent = txt;
  benchHold = performance.now() + 10000; // lad resultatet stå i 10 sekunder
  return txt;
}

const ui = new UI(settings, {
  start: (team, diff) => startMatch(team, diff),
  startHunt: (m, d) => startHunt(m, true, d),
  benchmark: () => benchmark(),
  install: () => { void installApp(); },
  begin: () => beginPlay(),
  resume: () => {
    sound.unlock();
    if (input.touchMode) { state = 'play'; ui.hidePause(); return; }
    input.lock(); resumeIfLocked();
  },
  closeBuy: () => closeBuyMenu(true),
  quit: () => toMenu(),
  buy: (id) => doBuy(id),
  settings: (s) => applySettings(s),
  again: () => startMatch(lastTeam, lastDiff),
});

// ---------- Touch (telefoner og tablets) ----------
const touch = new TouchControls(input, { pause: () => pauseGame() });
const rotateEl = document.createElement('div');
rotateEl.id = 'rotate';
rotateEl.innerHTML = '<div><b>↻</b>Drej telefonen vandret for at spille</div>';
document.body.append(rotateEl);
function applyTouchMode() {
  const on = settings.touch === 'on' || (settings.touch === 'auto' && isTouchDevice());
  input.touchMode = on;
  ui.touch = on;
  huntUi.touch = on;
  document.body.classList.toggle('touch', on);
  touch.root.style.setProperty('--u', settings.buttons === 'lille' ? '0.85vmin' : settings.buttons === 'stor' ? '1.18vmin' : '1vmin');
  if (benchHold < performance.now()) fpsEl.hidden = !settings.showFps && !location.hash.includes('fps');
}
/** Kort vibration på telefoner (Android – iPhone-browsere kan ikke vibrere) */
function buzz(ms: number | number[]) {
  if (!input.touchMode || !settings.vibrate) return;
  try { navigator.vibrate?.(ms); } catch { /* ikke understøttet */ }
}
// Skifter man app eller låser telefonen, sættes spillet på pause, og lyden slukkes
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (state === 'play') pauseGame();
  sound.suspend();
});
/** Pause uden Esc (touch-knappen) */
function pauseGame() {
  if (state !== 'play') return;
  state = 'paused';
  ui.closeBuy();
  huntUi.closeShop();
  ui.showPause();
  if (input.locked) { expectUnlock = true; input.unlock(); }
}
/** Fuld skærm og liggende format på telefoner (kræver et tryk – kaldes fra "start"-knappen) */
function goFullscreen() {
  if (!input.touchMode) return;
  try {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    const p = el.requestFullscreen?.({ navigationUI: 'hide' } as FullscreenOptions) ?? el.webkitRequestFullscreen?.();
    (p as Promise<void> | undefined)?.then?.(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {})).catch(() => {});
  } catch { /* ikke understøttet (fx iPhone) */ }
}

const huntUi = new HuntUI({
  begin: () => beginPlay(),
  again: () => startHunt(lastHuntMap, true, lastHuntDiff),
  menu: () => toMenu(),
  buy: (id) => buyUpgrade(id),
  skip: () => { hunt?.skipBreak(); closeShop(); },
  closeShop: () => closeShop(),
});
let lastHuntMap: HuntMapId = 'ravnsdalen';
let lastHuntDiff: Difficulty = settings.huntDiff;

// ---------- Opgraderinger i Kæmpejagt ----------
function openShop() {
  if (!hunt || hunt.phase !== 'break' || !hunt.player.alive) return;
  huntUi.openShop(hunt);
  sound.ui();
  if (input.locked) { expectUnlock = true; input.unlock(); }
}
function closeShop() {
  if (!huntUi.shopOpen) return;
  huntUi.closeShop();
  if (state === 'play' && !input.touchMode) input.lock();
}
function buyUpgrade(id: Parameters<Hunt['buyUpgrade']>[0]) {
  if (!hunt) return;
  const r = hunt.buyUpgrade(id);
  if (r.ok) sound.buy(); else sound.denied();
  huntUi.renderShop(hunt, r.msg);
  handleHuntEvents(hunt, hunt.drainEvents());
}
document.getElementById('ui')!.addEventListener('click', (e) => {
  // Klik ved siden af opgraderingsmenuen lukker den
  if (huntUi.shopOpen && (e.target as HTMLElement).id === 'huntshop') closeShop();
});
const mapPreviews = new Map<HuntMapId, CityMap>();
ui.drawHuntMap = (c, id) => {
  if (!mapPreviews.has(id)) mapPreviews.set(id, buildHuntMap(id));
  const m = mapPreviews.get(id)!;
  drawCityMap(c, m, m.world.sx > 150 ? 1 : 2);
};

function applySettings(s: Settings) {
  Object.assign(settings, s);
  saveSettings(settings);
  applyTouchMode();
  sound.setVolume(settings.volume);
  if (view.quality !== settings.quality) view.setQuality(settings.quality);
  view.setFov(settings.fov);
}

// ---------- Tilstande ----------

/** Ryd alt fra den spiltype der kører nu: fjender, lyd, input og tidsur */
function teardown() {
  sound.stopLoops();
  sound.night = 0;
  hunt = null;
  game = null;
  huntEndT = -1;
  huntUi.hideAll();
  huntUi.reset();
  ui.hideHud();
  ui.hideMatchEnd();
  ui.hidePause();
  ui.closeBuy();
  ui.setBoard(null, false);
  view.shake = 0;
  acc = 0;
}

function toMenu() {
  state = 'menu';
  loadingEl.classList.add('hidden');
  input.unlock();
  teardown();
  mode = 'tactical';
  menuGame = new Game({ humanTeam: 'A', difficulty: 'normal', seed: (Math.random() * 1e6) | 0, allBots: true });
  view.attach(menuGame);
  ui.showMenu(menuGame);
  acc = 0;
}

function startMatch(team: Team, diff: Difficulty) {
  sound.unlock();
  sound.ui();
  lastTeam = team; lastDiff = diff;
  teardown();
  mode = 'tactical';
  ui.playMode = 'tactical';
  game = new Game({ humanTeam: team, difficulty: diff, seed: (Math.random() * 1e6) | 0 });
  menuGame = null;
  view.attach(game);
  ui.resetMatch();
  ui.hideMenu();
  ui.hideMatchEnd();
  ui.showIntro(team);
  state = 'intro';
  acc = 0;
}

const loadingEl = document.createElement('div');
loadingEl.className = 'loading panel hidden';
document.getElementById('ui')!.append(loadingEl);

/** Start Kæmpejagt. Fra knapperne vises først "Bygger banen …", så skærmen ikke fryser uden besked. */
function startHunt(map: HuntMapId = lastHuntMap, defer = true, diff: Difficulty = lastHuntDiff) {
  lastHuntMap = map;
  lastHuntDiff = diff;
  sound.unlock();
  sound.ui();
  if (defer) {
    loadingEl.textContent = `Bygger ${HUNT_MAPS.find((m) => m.id === map)?.name ?? map} …`;
    loadingEl.classList.remove('hidden');
    ui.hideMenu();
    huntUi.hideAll();
    setTimeout(() => startHuntNow(map, diff), 40);
    return;
  }
  startHuntNow(map, diff);
}

function startHuntNow(map: HuntMapId, diff: Difficulty = lastHuntDiff) {
  teardown();
  mode = 'hunt';
  ui.playMode = 'hunt';
  menuGame = null;
  hunt = new Hunt((Math.random() * 1e6) | 0, map, diff);
  view.attachHunt(hunt);
  ui.hideMenu();
  huntUi.showIntro(hunt, HUNT_DIFF[diff].name);
  loadingEl.classList.add('hidden');
  state = 'intro';
  acc = 0;
}

function beginPlay() {
  sound.unlock();
  if (mode === 'hunt') { huntUi.hideIntro(); huntUi.showHud(); }
  else { ui.hideIntro(); ui.showHud(); }
  state = 'play';
  if (input.touchMode) goFullscreen();
  else input.lock();
}

function resumeIfLocked() {
  // Låsningen sker asynkront – onLockChange sætter tilstanden. Uden pointer lock (f.eks. i tests) fortsættes alligevel.
  if (!('requestPointerLock' in canvas)) { state = 'play'; ui.hidePause(); }
}

input.onLockChange = (locked) => {
  if (locked) {
    if (state === 'paused' || state === 'intro') {
      state = 'play'; ui.hidePause();
      if (mode === 'hunt') { huntUi.hideIntro(); huntUi.showHud(); } else { ui.hideIntro(); ui.showHud(); }
    }
    return;
  }
  if (expectUnlock) { expectUnlock = false; return; }
  if (state === 'play') { state = 'paused'; ui.closeBuy(); ui.showPause(); }
};

canvas.addEventListener('click', () => {
  if (state === 'play' && !input.locked && !input.touchMode) input.lock();
});
document.getElementById('ui')!.addEventListener('click', (e) => {
  // Klik ved siden af købsmenuen lukker den og låser musen igen
  if (ui.buyOpen && (e.target as HTMLElement).id === 'buy') closeBuyMenu(true);
});

// ---------- Køb ----------

function openBuyMenu() {
  if (!game) return;
  if (game.phase !== 'buy') { ui.note('Købsfasen er slut – du kan købe igen i næste runde'); sound.denied(); return; }
  if (!game.human.alive) return;
  ui.openBuy(game);
  if (input.locked) { expectUnlock = true; input.unlock(); }
}
function closeBuyMenu(relock: boolean) {
  ui.closeBuy();
  if (relock && state === 'play') input.lock();
}
function doBuy(id: Parameters<Game['buy']>[1]) {
  if (!game) return;
  const r = game.buy(game.humanId, id);
  if (r.ok) sound.buy(); else sound.denied();
  ui.renderBuy(game, r.msg);
}

// ---------- Spillerens input ----------

const SLOT_KEYS: [string, Slot][] = [['Digit1', 'primary'], ['Digit2', 'pistol'], ['Digit3', 'knife'], ['Digit4', 'blocks'], ['Digit5', 'bomb']];

function readInput(g: Game) {
  const p = g.human;
  const inp = p.input;
  const k = (c: string) => input.down(c);
  if (ui.buyOpen) {
    // TalTasterne køber i stedet for at skifte våben
    for (const it of BUY_ITEMS) if (input.hit(`Digit${it.key}`) || input.hit(`Numpad${it.key}`)) doBuy(it.id);
    if (input.hit('KeyB')) closeBuyMenu(true);
    if (input.hit('Escape')) { closeBuyMenu(false); state = 'paused'; ui.showPause(); }
    if (ui.buyOpen && g.phase === 'buy') ui.refreshBuy(g); // kun tid og priser – knapperne bygges ikke om (ellers går tryk tabt)
    inp.fwd = 0; inp.right = 0; inp.fire = false;
    return;
  }
  if (input.hit('KeyB')) openBuyMenu();
  // Kig
  const sens = settings.sensitivity * 0.0022;
  p.yaw -= input.mouseDX * sens;
  p.pitch = clamp(p.pitch - input.mouseDY * sens * (settings.invertY ? -1 : 1), -1.54, 1.54);
  // Bevægelse
  inp.fwd = clamp((k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + input.axisY, -1, 1);
  inp.right = clamp((k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + input.axisX, -1, 1);
  inp.jump = k('Space');
  inp.crouch = k('KeyC') || k('ControlLeft');
  inp.walk = k('ShiftLeft') || k('ShiftRight');
  inp.fire = input.mouseDown;
  if (input.mousePressed) inp.firePressed = true;
  if (input.hit('KeyR')) inp.reload = true;
  inp.use = k('KeyE');
  if (input.hit('KeyG')) inp.drop = true;
  for (const [code, slot] of SLOT_KEYS) if (input.hit(code)) inp.slot = slot;
  if (input.hit('KeyQ')) inp.slot = p.slot === 'primary' ? 'pistol' : p.primary ? 'primary' : 'knife';
  if (input.wheel) {
    const order: Slot[] = ['primary', 'pistol', 'knife', 'blocks', 'bomb'];
    const have = order.filter((s) => g.hasSlot(p, s));
    const i = have.indexOf(p.slot);
    inp.slot = have[(i + (input.wheel > 0 ? 1 : -1) + have.length) % have.length];
  }
}

// ---------- Hændelser → lyd, effekter, UI ----------

function surfaceUnder(g: Game, pid: number) {
  const p = g.players[pid];
  const b = g.world.get(Math.floor(p.body.pos.x), Math.floor(p.body.pos.y - 0.1), Math.floor(p.body.pos.z));
  return BLOCKS[b]?.sound ?? 'soft';
}

function handleEvents(g: Game, events: GameEvent[]) {
  const me = g.human;
  const myEye = eyePos(me);
  const occl = (pos: { x: number; y: number; z: number }) => !lineOfSight(g.world, myEye, { x: pos.x, y: pos.y + 0.2, z: pos.z });
  let blockSounds = 0;
  for (const e of events) {
    ui.onEvent(e, g);
    switch (e.type) {
      case 'shot': {
        const mine = e.pid === me.id;
        const p = g.players[e.pid];
        sound.shot(e.weapon, mine ? null : e.from, mine ? false : occl(e.from));
        view.character(e.pid)?.onShot();
        const fwd = dirFromYawPitch(p.yaw, p.pitch);
        const muzzle = { x: e.from.x + fwd.x * 0.7, y: e.from.y - 0.12 + fwd.y * 0.7, z: e.from.z + fwd.z * 0.7 };
        view.fx?.muzzleLight(muzzle);
        if (mine) {
          view.vm?.onShot(p);
          if (Math.random() < 0.5) {
            const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw)).multiplyScalar(0.18);
            right.y = -0.16;
            right.add(new THREE.Vector3(fwd.x, fwd.y, fwd.z).multiplyScalar(0.6));
            view.fx?.tracer(e.from, e.to, right);
          }
        } else view.fx?.tracer(muzzle, e.to, null);
        break;
      }
      case 'hit': {
        const t = g.players[e.target];
        view.fx?.playerHit(e.pos, TEAM_COLOR[t.team], e.head);
        view.character(e.target)?.onHit();
        if (e.target === me.id) {
          const a = g.players[e.attacker];
          const yaw = a ? yawPitchTo(me.body.pos, a.body.pos).yaw : null;
          ui.hurt(e.dmg, yaw);
          sound.hurt();
          buzz(Math.min(120, 25 + e.dmg * 2));
        }
        if (e.attacker === me.id && e.target !== me.id) sound.hitmarker(e.head);
        break;
      }
      case 'blockHit':
        view.fx?.blockHit(e.pos, e.normal, e.block);
        if (blockSounds++ < 3) sound.blockHit(e.pos, BLOCKS[e.block].sound);
        break;
      case 'blockBreak':
        view.fx?.blockBreak(e.x, e.y, e.z, e.block);
        sound.blockBreak({ x: e.x + 0.5, y: e.y + 0.5, z: e.z + 0.5 }, BLOCKS[e.block].sound);
        break;
      case 'blockPlace':
        sound.place({ x: e.x + 0.5, y: e.y + 0.5, z: e.z + 0.5 });
        if (e.pid === me.id) view.vm?.onPlace();
        view.fx?.burst({ x: e.x + 0.5, y: e.y + 0.1, z: e.z + 0.5 }, 0xc8b886, 6, 1.2, 0.07, 0.8);
        break;
      case 'reload':
        if (e.pid === me.id) sound.reload(e.weapon, WEAPONS[e.weapon].reload);
        break;
      case 'empty': if (e.pid === me.id) sound.empty(); break;
      case 'switch': if (e.pid === me.id) sound.switchWeapon(); break;
      case 'knife':
        sound.knife(e.pid === me.id ? null : g.players[e.pid].body.pos);
        if (e.pid === me.id) view.vm?.onKnife();
        break;
      case 'footstep': {
        const p = g.players[e.pid];
        const mine = e.pid === me.id;
        sound.footstep(mine ? null : p.body.pos, surfaceUnder(g, e.pid), mine ? false : occl(p.body.pos));
        break;
      }
      case 'jump': if (e.pid === me.id) sound.jump(); break;
      case 'land': if (e.pid === me.id) { sound.land(e.speed); view.vm?.onLand(e.speed); } break;
      case 'exploded': {
        view.fx?.explosion(e.pos);
        sound.explosion(e.pos);
        const d = Math.hypot(me.body.pos.x - e.pos.x, me.body.pos.z - e.pos.z);
        view.shake = Math.max(view.shake, clamp(1.4 - d / 30, 0.2, 1.2));
        break;
      }
      case 'kill': if (e.victim === me.id) view.shake = Math.max(view.shake, 0.4); break;
      case 'roundStart': sound.roundStart(); view.fx?.clearHoles(); break;
      case 'live': sound.live(); if (ui.buyOpen) closeBuyMenu(true); break;
      case 'roundEnd': sound.roundEnd(e.winner === g.humanTeam); break;
      case 'matchEnd':
        state = 'end';
        expectUnlock = true;
        input.unlock();
        ui.closeBuy();
        sound.matchEnd(e.winner === g.humanTeam);
        ui.showMatchEnd(g);
        break;
      case 'bombPickup': if (g.players[e.pid].team === g.humanTeam) ui.note(`${g.players[e.pid].name === 'Dig' ? 'Du' : g.players[e.pid].name} har samlet bomben op`); break;
      case 'bombDrop': if (g.humanTeam === 'A') ui.note('Bomben er tabt!'); break;
      case 'message': if (e.pid === me.id) sound.denied(); break;
    }
  }
}

/** Fjender som dit hold kan se lige nu (vises på radaren) */
function updateSpotting(g: Game) {
  ui.spotted.clear();
  const mates = g.players.filter((q) => q.alive && q.team === g.humanTeam);
  for (const q of g.players) {
    if (!q.alive || q.team === g.humanTeam) continue;
    if (mates.some((m) => Math.hypot(m.body.pos.x - q.body.pos.x, m.body.pos.z - q.body.pos.z) < 60 && lineOfSight(g.world, eyePos(m), chestPos(q)))) ui.spotted.add(q.id);
  }
  if (g.bomb.state === 'dropped' && mates.some((m) => lineOfSight(g.world, eyePos(m), { x: g.bomb.pos.x, y: g.bomb.pos.y + 0.3, z: g.bomb.pos.z }))) ui.spotted.add(-1);
}

// ---------- Kæmpejagt ----------

function readHuntInput(h: Hunt) {
  const p = h.player, inp = h.input;
  if (huntUi.shopOpen) {
    UPGRADES.forEach((u, i) => { if (input.hit(`Digit${i + 1}`) || input.hit(`Numpad${i + 1}`)) buyUpgrade(u.id); });
    if (input.hit('Digit6') || input.hit('Numpad6')) buyUpgrade('repair');
    if (input.hit('Enter')) { h.skipBreak(); closeShop(); }
    else if (input.hit('KeyB')) closeShop();
    else if (input.hit('Escape')) { huntUi.closeShop(); state = 'paused'; ui.showPause(); }
    Object.assign(inp, { fwd: 0, right: 0, jump: false, hook: false, reel: false, brake: false, fire: false });
    return;
  }
  if (input.hit('KeyB')) {
    if (h.phase === 'break') openShop();
    else huntUi.note('Opgraderinger kan kun købes mellem bølgerne');
  }
  const k = (c: string) => input.down(c);
  const sens = settings.sensitivity * 0.0022;
  p.yaw -= input.mouseDX * sens;
  p.pitch = clamp(p.pitch - input.mouseDY * sens * (settings.invertY ? -1 : 1), -1.54, 1.54);
  inp.fwd = clamp((k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + input.axisY, -1, 1);
  inp.right = clamp((k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + input.axisX, -1, 1);
  inp.jump = k('Space');
  if (input.hit('Space')) inp.jumpPressed = true;
  inp.hook = input.rightDown;
  if (input.rightPressed) inp.hookPressed = true;
  inp.reel = k('ShiftLeft') || k('ShiftRight');
  inp.brake = k('KeyG');
  inp.fire = input.mouseDown;
  if (input.mousePressed) inp.firePressed = true;
  if (input.hit('KeyR')) inp.reload = true;
  if (input.hit('Digit1')) inp.slot = 'primary';
  if (input.hit('Digit2')) inp.slot = 'pistol';
  if (input.hit('KeyQ') || input.wheel) inp.slot = p.slot === 'primary' ? 'pistol' : 'primary';
}

function handleHuntEvents(h: Hunt, events: HuntEvent[]) {
  const hs = view.huntScene;
  const me = h.player;
  const near = (pos: { x: number; y: number; z: number }, r: number) => Math.max(0, 1 - Math.hypot(pos.x - me.body.pos.x, pos.y - me.body.pos.y, pos.z - me.body.pos.z) / r);
  const isBig = (id: number) => h.giants.find((g) => g.id === id)?.big ?? false;
  let blockSounds = 0;
  for (const e of events) {
    huntUi.onEvent(e, h);
    switch (e.type) {
      case 'shot': {
        sound.shot(e.weapon, null);
        view.vm?.onShot(me);
        const fwd = dirFromYawPitch(me.yaw, me.pitch);
        view.fx?.muzzleLight({ x: e.from.x + fwd.x * 0.7, y: e.from.y - 0.12 + fwd.y * 0.7, z: e.from.z + fwd.z * 0.7 });
        if (Math.random() < 0.5) {
          const right = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw)).multiplyScalar(0.18);
          right.y = -0.16;
          right.add(new THREE.Vector3(fwd.x, fwd.y, fwd.z).multiplyScalar(0.6));
          view.fx?.tracer(e.from, e.to, right);
        }
        break;
      }
      case 'hitGiant':
        hs?.giantHit(e.pos, e.weak, isBig(e.id));
        if (e.weak) sound.weakHit(e.kill); else { sound.hitmarker(false); sound.giantHit(e.pos); }
        break;
      case 'blockHit':
        view.fx?.blockHit(e.pos, e.normal, e.block);
        if (blockSounds++ < 3) sound.blockHit(e.pos, BLOCKS[e.block].sound);
        break;
      case 'blockBreak':
        view.fx?.blockBreak(e.x, e.y, e.z, e.block);
        sound.blockBreak({ x: e.x + 0.5, y: e.y + 0.5, z: e.z + 0.5 }, BLOCKS[e.block].sound);
        break;
      case 'reload': sound.reload(e.weapon, WEAPONS[e.weapon as 'rifle'].reload); break;
      case 'empty': sound.empty(); break;
      case 'switch': sound.switchWeapon(); break;
      case 'hookFire': sound.hookFire(); break;
      case 'hookAttach': sound.hookAttach(e.pos, e.giant); buzz(12); if (!e.giant) view.fx?.burst(e.pos, 0xd8d0c0, 4, 1.2, 0.05, 1); break;
      case 'hookMiss': sound.hookMiss(); break;
      case 'hookRelease': sound.hookRelease(); break;
      case 'jump': sound.jump(); break;
      case 'land':
        sound.land(e.speed); view.vm?.onLand(e.speed);
        break;
      case 'impact': view.shake = Math.max(view.shake, 0.6); break;
      case 'hurt': sound.hurt(); buzz(Math.min(140, 30 + e.dmg * 2)); view.shake = Math.max(view.shake, Math.min(1, 0.3 + e.dmg / 50)); break;
      case 'coins': if (e.why === 'kill') buzz([40, 40, 70]); break;
      case 'upgrade': if (e.id === 'repair') sound.gateRepair(); break;
      case 'depot': {
        sound.depot();
        const d = h.depots.find((x) => x.id === e.id);
        if (d) view.fx?.burst({ x: d.pos.x, y: d.pos.y + 1, z: d.pos.z }, 0x6dde8a, 14, 2, 0.08, 2.5);
        break;
      }
      case 'waveStart': sound.waveStart(e.wave === h.waves.length); break;
      case 'waveClear': if (h.phase !== 'won') sound.roundEnd(true); break;
      case 'won': sound.matchEnd(true); huntEndT = 3.5; break;
      case 'lost': sound.matchEnd(false); huntEndT = e.reason === 'gate' ? 3.5 : 2.8; break;
      case 'giantSpawn':
        hs?.dust(e.pos, 4 * (e.big ? 1.3 : 1), 8, 0xb8a888, 1.5);
        if (e.variant === 'mountain') { sound.giantRoar(e.pos, true); sound.giantFell(e.pos); view.shake = Math.max(view.shake, 1.2); hs?.dust(e.pos, 7, 14, 0x9a948a, 2); }
        if (e.variant === 'sea') { sound.giantRoar(e.pos, true); sound.splash(e.pos, true); view.shake = Math.max(view.shake, 1.0); hs?.dust({ x: e.pos.x, y: h.city.waterY, z: e.pos.z }, 7, 16, 0xe8f4fb, 2); }
        break;
      case 'gateHit':
        sound.gateHit(e.pos, h.gate?.broken ?? false);
        for (const [x, y, z] of e.broken) view.fx?.blockBreak(x, y, z, B.PLANKS);
        view.fx?.burst(e.pos, 0xb48a54, 10, 4, 0.14, 2.5);
        view.shake = Math.max(view.shake, near(e.pos, 40) * 0.8);
        break;
      case 'gateRepair': sound.gateRepair(); break;
      case 'giantRoar': sound.giantRoar(e.pos, isBig(e.id)); view.shake = Math.max(view.shake, near(e.pos, 50) * 0.5); break;
      case 'giantStep':
        sound.giantStep(e.pos, e.scale);
        if (e.wet) { sound.splash(e.pos, true); hs?.dust({ x: e.pos.x, y: h.city.waterY - 0.3, z: e.pos.z }, 1.8 * e.scale, 4, 0xe8f4fb, 0.8); }
        else hs?.dust(e.pos, 1.5 * e.scale, 3);
        view.shake = Math.max(view.shake, near(e.pos, 40) * 0.45 * e.scale);
        break;
      case 'giantWindup': sound.giantWindup(e.pos, e.kind); break;
      case 'splash':
        sound.splash(e.pos, e.big);
        hs?.dust({ x: e.pos.x, y: e.pos.y - 0.4, z: e.pos.z }, e.big ? 1.4 : 0.7, e.big ? 5 : 2, 0xe8f4fb, 0.6);
        break;
      case 'giantSmash':
        sound.giantSmash(e.pos);
        hs?.dust({ x: e.pos.x, y: Math.max(1, e.pos.y - 2), z: e.pos.z }, 2.6, 7, 0xc6b494, 1.6);
        view.fx?.burst({ x: e.pos.x, y: Math.max(1.2, e.pos.y - 1.5), z: e.pos.z }, 0x8d8a83, 16, 6, 0.25, 4);
        view.shake = Math.max(view.shake, near(e.pos, 35) * 1.1);
        break;
      case 'giantFlinch': sound.giantFlinch(e.pos); break;
      case 'giantKneel': sound.giantStep(e.pos, 1.3); hs?.dust(e.pos, 2.4, 6); view.shake = Math.max(view.shake, near(e.pos, 40) * 0.7); break;
      case 'giantDeath': sound.giantDeath(e.pos, isBig(e.id)); break;
      case 'giantFell':
        sound.giantFell(e.pos);
        hs?.crumble(e.id);
        view.shake = Math.max(view.shake, near(e.pos, 60) * 1.3);
        break;
      case 'rockThrow': sound.rockThrow(e.pos); break;
      case 'rockImpact':
        sound.rockImpact(e.pos, e.big);
        hs?.dust(e.pos, e.big ? 2.6 : 1.6, e.big ? 7 : 4, 0xb8b0a2);
        view.fx?.burst(e.pos, 0x8a8379, e.big ? 22 : 12, e.big ? 7 : 5, e.big ? 0.32 : 0.22, 3);
        view.shake = Math.max(view.shake, near(e.pos, e.big ? 35 : 25) * (e.big ? 1 : 0.8));
        break;
    }
  }
}

function huntFrame(h: Hunt, dt: number) {
  let mdx = 0, mdy = 0;
  if (state === 'play') {
    mdx = input.mouseDX; mdy = input.mouseDY;
    if (h.player.alive && h.phase !== 'won') readHuntInput(h);
  }
  // Opgraderingsmenuen lukker, hvis pausen slutter (f.eks. "Start bølgen nu" fra en test)
  if (huntUi.shopOpen && h.phase !== 'break') closeShop();
  // Verden kører også videre på slutskærmen (kæmper falder færdigt), men ikke i pausen eller opgraderingsmenuen
  const running = (state === 'play' || state === 'end') && !frozen && !huntUi.shopOpen;
  if (running) {
    acc += dt;
    let n = 0;
    while (acc >= HUNT.dt && n < 40) { h.step(); acc -= HUNT.dt; n++; }
    if (n >= 40) acc = 0;
    handleHuntEvents(h, h.drainEvents());
    if (huntEndT > 0 && state === 'play') {
      huntEndT -= dt;
      if (huntEndT <= 0) {
        state = 'end';
        expectUnlock = true;
        input.unlock();
        const rank = addRecord(h.mapId, h.difficulty, { score: h.score, won: h.phase === 'won', wave: Math.max(1, h.wave), waves: h.waves.length, time: Math.round(h.stats.time), kills: h.stats.kills, date: today() });
        huntUi.showEnd(h, rank, getRecords(h.mapId, h.difficulty));
      }
    }
  }
  input.endFrame();
  const e = h.eye();
  sound.listener = { x: e.x, y: e.y, z: e.z, yaw: h.player.yaw };
  sound.night = view.night;
  sound.tick(dt);
  const fl = h.city.falls[0];
  const fallDist = fl ? Math.hypot(e.x - fl.x1, e.y - (fl.yTop + fl.yBottom) / 2, e.z - (fl.z0 + fl.z1) / 2) : 999;
  if (state === 'play' && h.player.alive) sound.huntLoops(h.speed, h.boosting || h.braking, h.reeling, h.hook.state === 'attached', fallDist);
  else sound.huntLoops(0, false, false, false);
  const cam: CamMode = (state === 'play' || state === 'intro' || state === 'paused') && h.player.alive ? { mode: 'first' } : { mode: 'orbit' };
  view.render(dt, running ? acc / HUNT.dt : 1, cam, mdx, mdy);
  if (state !== 'menu') huntUi.update(h, dt, view.camera.rotation.y, h.player.alive ? h.hookAim() : null);
}

// ---------- Hovedløkken ----------

let last = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  frames++;
  fpsAcc += dt; fpsN++; fpsWorst = Math.max(fpsWorst, dt);
  if (fpsAcc >= 1 && performance.now() > benchHold) {
    fpsEl.textContent = `${Math.round(fpsN / fpsAcc)} FPS · værste ${Math.round(fpsWorst * 1000)} ms · ${view.renderer.info.render.calls} kald`;
    fpsAcc = 0; fpsN = 0; fpsWorst = 0;
  }
  // Touch-knapper kun mens man spiller (ikke i menuer, pause eller købsmenuen)
  const tl = state === 'play' && input.touchMode && !ui.buyOpen && !huntUi.shopOpen ? (mode === 'hunt' ? 'hunt' : 'tactical') : null;
  touch.show(tl);
  if (tl === 'tactical' && game) touch.setBuyVisible(game.phase === 'buy');
  if (tl === 'hunt' && hunt) touch.setBuyVisible(hunt.phase === 'break' && hunt.player.alive);
  if (mode === 'hunt' && hunt) { huntFrame(hunt, dt); return; }
  const g = state === 'menu' ? menuGame : game;
  if (!g) { input.endFrame(); return; }

  let mdx = 0, mdy = 0;
  if (state === 'play') {
    mdx = input.mouseDX; mdy = input.mouseDY;
    readInput(g);
    // Resultattavle
    ui.setBoard(g, input.down('Tab'));
    // Tilskuer: klik skifter
    if (!g.human.alive && input.mousePressed) ui.cycleSpectate(g);
  }
  const running = state === 'play' || state === 'menu';
  if (running) {
    acc += dt;
    let n = 0;
    while (acc >= TUNING.dt && n < 40) { g.step(); acc -= TUNING.dt; n++; }
    if (n >= 40) acc = 0;
    if (state === 'play' && game) handleEvents(game, game.drainEvents());
    else g.drainEvents();
    // Menu-kampen starter forfra, når den er slut
    if (state === 'menu' && g.phase === 'over') toMenu();
  }
  input.endFrame();

  // Lyd: lytteren følger kameraet
  if (game && state !== 'menu') {
    const me = game.human;
    const L = me.alive ? me : game.players[ui.specId] ?? me;
    const e = eyePos(L);
    sound.listener = { x: e.x, y: e.y, z: e.z, yaw: L.yaw };
    sound.tick(dt);
    // Bombens bip bliver hurtigere mod slutningen
    if (game.phase === 'planted' && game.bomb.state === 'planted') {
      const t = game.bomb.timer;
      const interval = t > 20 ? 1 : t > 10 ? 0.55 : t > 5 ? 0.3 : 0.14;
      beepT -= dt;
      if (beepT <= 0) {
        beepT = interval;
        blinkT = 0.12;
        sound.bombBeep(game.bomb.pos, !lineOfSight(game.world, e, { x: game.bomb.pos.x, y: game.bomb.pos.y + 0.3, z: game.bomb.pos.z }));
      }
    } else beepT = 0;
    // Tastatur-bip under plantning, klik under desarmering
    if (me.action) {
      keypadT -= dt;
      if (keypadT <= 0) { keypadT = me.action.kind === 'plant' ? 0.35 : 0.5; if (me.action.kind === 'plant') sound.keypad(); else sound.defuseTick(); }
    }
    spotT -= dt;
    if (spotT <= 0) { spotT = 0.15; updateSpotting(game); }
  }
  blinkT -= dt;

  // Effekter: forhåndsvisning af blok og bomben
  if (view.fx) {
    const me = g.human;
    view.fx.setPreview(state === 'play' && me.alive && me.slot === 'blocks' ? g.buildTarget(me) : null);
    const b = g.bomb;
    view.fx.setBomb(b.state === 'dropped' || b.state === 'planted' || b.state === 'defused', b.pos, b.state !== 'dropped', b.state === 'planted' && blinkT > 0);
  }

  // Kamera
  let cam: CamMode = { mode: 'orbit' };
  if (game && state !== 'menu') {
    if (game.human.alive) cam = { mode: 'first' };
    else {
      if (!game.players[ui.specId]?.alive) ui.cycleSpectate(game);
      cam = { mode: 'spectate', pid: ui.specId };
    }
  }
  const alpha = running ? acc / TUNING.dt : 1;
  view.render(dt, alpha, cam, mdx, mdy);
  if (game && state !== 'menu') ui.update(game, dt, view.camera.rotation.y);
}

// ---------- App (PWA): offline og "Installér som app" ----------
const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
/** Kun den almindelige version på en rigtig webadresse kan installeres (ikke én-fils-versionen eller artefaktet) */
const appCapable = import.meta.env.PROD && import.meta.env.MODE !== 'single' && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && window.top === window;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
let installEvt: InstallEvent | null = null;
const updateInstall = () => ui.setInstall(standalone || !appCapable ? null : installEvt ? 'prompt' : isIOS ? 'ios' : null);
if (appCapable) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* ingen offline-udgave */ }); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e as InstallEvent; updateInstall(); });
  window.addEventListener('appinstalled', () => { installEvt = null; ui.setInstall(null); });
}
async function installApp() {
  if (!installEvt) { if (isIOS) ui.showIosInstall(); return; }
  const e = installEvt;
  installEvt = null;
  await e.prompt().catch(() => {});
  updateInstall();
}

applyTouchMode();
toMenu();
updateInstall();
requestAnimationFrame(frame);

// ---------- Testkroge (bruges af scripts/*.mjs) ----------
declare global { interface Window { __kk: unknown } }
window.__kk = {
  get game() { return game; },
  get menuGame() { return menuGame; },
  view,
  ui,
  state: () => ({ state, mode, frames, phase: hunt ? hunt.phase : game?.phase, round: game?.round, score: game?.score, wave: hunt?.wave }),
  start: (team: Team = 'A', diff: Difficulty = 'normal') => startMatch(team, diff),
  begin: () => { beginPlay(); state = 'play'; },
  /** Kør simuleringen frem uden at tegne (headless-grafik er langsom) */
  fastForward: (sec: number) => {
    if (!game) return;
    const n = Math.round(sec / TUNING.dt);
    for (let i = 0; i < n && game.phase !== 'over'; i++) { game.step(); if (i % 12 === 0) handleEvents(game, game.drainEvents()); }
    handleEvents(game, game.drainEvents());
  },
  autopilot: (on: boolean) => game?.setAutopilot(on),
  get hunt() { return hunt; },
  touch,
  get mode() { return mode; },
  huntUi,
  input,
  sound,
  get huntEndT() { return huntEndT; },
  startHunt: (m: HuntMapId = 'ravnsdalen', d: Difficulty = 'normal') => startHunt(m, false, d),
  openShop: () => openShop(),
  buyUpgrade: (id: Parameters<Hunt['buyUpgrade']>[0]) => buyUpgrade(id),
  benchmark: () => benchmark(),
  freeze: (on: boolean) => { frozen = on; },
  /** Kør Kæmpejagt frem uden at tegne */
  huntForward: (sec: number) => {
    if (!hunt) return;
    const n = Math.round(sec / HUNT.dt);
    for (let i = 0; i < n; i++) { hunt.step(); if (i % 12 === 0) handleHuntEvents(hunt, hunt.drainEvents()); }
    handleHuntEvents(hunt, hunt.drainEvents());
  },
  look: (yaw: number, pitch: number) => { if (game) { game.human.yaw = yaw; game.human.pitch = pitch; } },
  DEG,
};
