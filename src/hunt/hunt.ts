// Kæmpejagt: én spiller mod bølger af kæmper i byen "Bastionen". Krog, gas-boost, skydevåben,
// stenkast, forsyningsdepoter, bølger, sejr og nederlag. Ingen grafik – kører med fast tidsskridt og kan testes i Node.
import { HUNT, HUNT_AMMO } from '../config/hunt';
import { WEAPONS, SWITCH_TIME, type Slot, type WeaponDef } from '../config/weapons';
import { TUNING } from '../config/tuning';
import { B, isDestructible } from '../core/blocks';
import { DEG, Rng, clamp, dirFromYawPitch, dist, type V3 } from '../core/math';
import { moveBody } from '../core/physics';
import { lineOfSight, raycastVoxels } from '../core/ray';
import { coneJitter } from '../core/game';
import { emptyInput, type Player, type WeaponState } from '../core/player';
import type { VoxelWorld } from '../core/world';
import type { CityMap, HuntMapId } from './city';
import { buildHuntMap } from './maps';
import { Mill } from './mill';
import { GiantNav } from './giantNav';
import { Giant, type GiantVariant, type PartKind } from './giant';
import { obbClosest, rayObb, tfApply, tfInverseApply, type Obb } from './tf';
import {
  GATE_REPAIR, HUNT_DIFF, KILL_COINS, KILL_SCORE, UPGRADES, UPGRADE_MAX, WAVE_COINS, WAVE_SCORE, WEAK_COINS, WEAK_SCORE, WIN_SCORE,
  emptyUpgrades, type DiffMods, type HuntDifficulty, type UpgradeId,
} from './progress';

export type HuntPhase = 'break' | 'fight' | 'won' | 'lost';

export interface HuntInput {
  fwd: number; right: number;
  jump: boolean; jumpPressed: boolean;
  hook: boolean; hookPressed: boolean;
  reel: boolean; brake: boolean;
  fire: boolean; firePressed: boolean;
  reload: boolean; slot: Slot | null;
}
export const emptyHuntInput = (): HuntInput => ({
  fwd: 0, right: 0, jump: false, jumpPressed: false, hook: false, hookPressed: false, reel: false, brake: false,
  fire: false, firePressed: false, reload: false, slot: null,
});

export interface HookState {
  state: 'idle' | 'flying' | 'attached';
  tip: V3;
  target: V3;
  len: number;
  giantId: number;
  part: PartKind | null;
  /** Vindmøllevinge krogen sidder i (-1 = ingen) */
  millId: number;
  millPart: number;
  local: V3;
}

export interface Rock {
  id: number; pos: V3; vel: V3; age: number; spin: V3;
  /** Kasterens klippeblok: større, skade i et område omkring nedslaget */
  big: boolean;
  /** Kastet mod Borgporten */
  gate: boolean;
}
export interface HuntDepot { id: number; pos: V3; onRoof: boolean; cd: number }

export type HuntEvent =
  | { type: 'shot'; weapon: string; from: V3; to: V3; hit: 'giant' | 'block' | 'none' }
  | { type: 'hitGiant'; id: number; part: PartKind; dmg: number; weak: boolean; pos: V3; kill: boolean }
  | { type: 'blockHit'; pos: V3; normal: V3; block: number }
  | { type: 'blockBreak'; x: number; y: number; z: number; block: number }
  | { type: 'reload'; weapon: string }
  | { type: 'empty' }
  | { type: 'switch' }
  | { type: 'hookFire'; to: V3 }
  | { type: 'hookAttach'; pos: V3; giant: boolean }
  | { type: 'hookMiss' }
  | { type: 'hookRelease' }
  | { type: 'jump' }
  | { type: 'land'; speed: number }
  | { type: 'impact'; dmg: number }
  | { type: 'hurt'; dmg: number; cause: string; from: V3 | null }
  | { type: 'depot'; id: number }
  | { type: 'waveStart'; wave: number }
  | { type: 'waveClear'; wave: number }
  | { type: 'won' }
  | { type: 'lost'; reason: 'player' | 'gate' }
  | { type: 'gateHit'; pos: V3; dmg: number; hp: number; broken: [number, number, number][] }
  | { type: 'gateRepair'; hp: number }
  | { type: 'giantSpawn'; id: number; pos: V3; big: boolean; variant: GiantVariant }
  | { type: 'giantRoar'; id: number; pos: V3 }
  | { type: 'giantStep'; id: number; pos: V3; scale: number; wet: boolean }
  | { type: 'splash'; pos: V3; big: boolean }
  | { type: 'giantWindup'; id: number; kind: 'swipe' | 'throw' | 'leap'; pos: V3 }
  | { type: 'giantSmash'; id: number; pos: V3 }
  | { type: 'giantFlinch'; id: number; pos: V3 }
  | { type: 'giantKneel'; id: number; pos: V3 }
  | { type: 'giantDeath'; id: number; pos: V3 }
  | { type: 'giantFell'; id: number; pos: V3; yaw: number; scale: number }
  | { type: 'giantRemoved'; id: number }
  | { type: 'rockThrow'; id: number; pos: V3 }
  | { type: 'rockImpact'; id: number; pos: V3; hitPlayer: boolean; big: boolean }
  | { type: 'coins'; amount: number; pos: V3 | null; why: 'kill' | 'weak' | 'wave' }
  | { type: 'upgrade'; id: UpgradeId | 'repair'; level: number };

interface SpawnPlan { delay: number; scale: number; hp: number; big: boolean; variant?: GiantVariant; gate?: number }
const RUNNER = (delay: number): SpawnPlan => ({ delay, scale: 0.95, hp: HUNT.runnerHp, big: false, variant: 'runner' });
const THROWER = (delay: number): SpawnPlan => ({ delay, scale: 1.05, hp: HUNT.throwerHp, big: false, variant: 'thrower' });
export const WAVES: SpawnPlan[][] = [
  [{ delay: 0, scale: 1.1, hp: HUNT.giantHp, big: false }],
  [{ delay: 0, scale: 1.0, hp: HUNT.giantHp * 0.85, big: false }, { delay: 2, scale: 1.1, hp: HUNT.giantHp, big: false }, RUNNER(16)],
  [{ delay: 0, scale: 1.35, hp: HUNT.bigGiantHp, big: true }, THROWER(6), RUNNER(20)],
];
/** Ravnsdalen: fem bølger fra formiddag til nat. Til sidst vågner Bjergkæmpen ved Den gamle port. */
export const VALLEY_WAVES: SpawnPlan[][] = [
  [{ delay: 0, scale: 1.1, hp: HUNT.giantHp, big: false }],
  [{ delay: 0, scale: 1.0, hp: HUNT.giantHp * 0.9, big: false }, RUNNER(6)],
  [{ delay: 0, scale: 1.0, hp: HUNT.giantHp * 0.9, big: false }, THROWER(4), { delay: 16, scale: 1.1, hp: HUNT.giantHp, big: false }],
  [{ delay: 0, scale: 1.35, hp: HUNT.bigGiantHp, big: true, variant: 'stone' }, RUNNER(7), THROWER(20)],
  [{ delay: 0, scale: 1.5, hp: HUNT.mountainGiantHp, big: true, variant: 'mountain', gate: 0 }, RUNNER(10), THROWER(18), { delay: 26, scale: 1.3, hp: HUNT.bigGiantHp * 0.8, big: true, variant: 'stone' }],
];

/** Saltvig: fem bølger fra eftermiddag til nat. Til sidst stiger Havkæmpen op af fjorden og vader ind gennem sundet. */
export const HARBOR_WAVES: SpawnPlan[][] = [
  [{ delay: 0, scale: 1.1, hp: HUNT.giantHp, big: false, gate: 0 }, { delay: 8, scale: 1.0, hp: HUNT.giantHp * 0.85, big: false }],
  [{ delay: 0, scale: 1.0, hp: HUNT.giantHp * 0.9, big: false }, RUNNER(5), { delay: 14, scale: 1.05, hp: HUNT.giantHp, big: false, gate: 0 }],
  [THROWER(0), { delay: 6, scale: 1.05, hp: HUNT.giantHp, big: false }, RUNNER(16)],
  [{ delay: 0, scale: 1.35, hp: HUNT.bigGiantHp, big: true, variant: 'stone', gate: 0 }, THROWER(8), RUNNER(14), { delay: 24, scale: 1.0, hp: HUNT.giantHp, big: false }],
  [{ delay: 0, scale: 1.5, hp: HUNT.mountainGiantHp, big: true, variant: 'sea', gate: 0 }, RUNNER(8), THROWER(16), { delay: 26, scale: 1.3, hp: HUNT.bigGiantHp * 0.8, big: true, variant: 'stone' }],
];

export class Hunt {
  readonly city: CityMap;
  readonly world: VoxelWorld;
  readonly nav: GiantNav;
  readonly rng: Rng;
  readonly player: Player;
  input: HuntInput = emptyHuntInput();
  hook: HookState = { state: 'idle', tip: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, len: 0, giantId: -1, part: null, millId: -1, millPart: 0, local: { x: 0, y: 0, z: 0 } };
  gas: number = HUNT.maxGas;
  /** Mønter til opgraderinger (tjenes ved at fælde kæmper og klare bølger) */
  coins = 0;
  /** Point (til rekordlisten) – sværhedsgraden er allerede ganget på */
  score = 0;
  /** Sejrsbonus (vises på slutskærmen) */
  bonus: { label: string; pts: number }[] = [];
  up: Record<UpgradeId, number> = emptyUpgrades();
  readonly diff: DiffMods;
  boosting = false;
  braking = false;
  reeling = false;
  giants: Giant[] = [];
  rocks: Rock[] = [];
  depots: HuntDepot[];
  wave = 0; // 1..n (0 = før første bølge)
  readonly waves: SpawnPlan[][];
  /** Borgporten (kun på baner med en port) */
  gate: { hp: number; maxHp: number; broken: boolean; removed: number; lastHitT: number } | null = null;
  lostReason: 'player' | 'gate' | null = null;
  phase: HuntPhase = 'break';
  phaseT = 6;
  time = 0;
  events: HuntEvent[] = [];
  stats = { shots: 0, hits: 0, weakHits: 0, kills: 0, damageTaken: 0, time: 0 };
  private spawnQueue: (SpawnPlan & { t: number })[] = [];
  private nextRock = 1;
  private invulnT = 0;
  private wasGround = true;

  readonly mills: Mill[];
  private wasWet = false;
  private splashT = 0;

  constructor(seed = 1, readonly mapId: HuntMapId = 'bastionen', readonly difficulty: HuntDifficulty = 'normal') {
    this.rng = new Rng(seed);
    this.diff = HUNT_DIFF[difficulty];
    this.city = buildHuntMap(mapId);
    this.mills = this.city.mills.map((d, i) => new Mill(i, d));
    this.waves = mapId === 'ravnsdalen' ? VALLEY_WAVES : mapId === 'saltvig' ? HARBOR_WAVES : WAVES;
    if (this.city.gate) this.gate = { hp: HUNT.gateHp, maxHp: HUNT.gateHp, broken: false, removed: 0, lastHitT: -99 };
    this.world = this.city.world;
    this.nav = new GiantNav(this.city);
    this.depots = this.city.depots.map((d) => ({ ...d, pos: { ...d.pos }, cd: 0 }));
    this.player = makeHuntPlayer(this.city.spawn.pos, this.city.spawn.yaw);
  }

  get playerAlive() { return this.player.alive && this.phase !== 'lost'; }
  emit(e: HuntEvent) { this.events.push(e); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  giantsLeft() { return this.giants.filter((g) => g.alive).length + this.spawnQueue.length; }
  get speed() { const v = this.player.body.vel; return Math.hypot(v.x, v.y, v.z); }

  // ================= Opgraderinger =================

  get maxGas() { return HUNT.maxGas * (1 + 0.25 * this.up.gas); }
  get hookRange() { return HUNT.hookRange + 12 * this.up.hook; }
  private get hookMult() { return 1 + 0.15 * this.up.hook; }
  magSize(id: 'rifle' | 'pistol') { return Math.round(HUNT_AMMO[id].mag * (1 + 0.35 * this.up.mag)); }
  reserveSize(id: 'rifle' | 'pistol') { return Math.round(HUNT_AMMO[id].reserve * (1 + 0.35 * this.up.mag)); }
  upgradeCost(id: UpgradeId) { const l = this.up[id]; return l >= UPGRADE_MAX ? 0 : UPGRADES.find((u) => u.id === id)!.costs[l]; }
  canRepairGate() { const g = this.gate; return !!g && !g.broken && g.hp < g.maxHp; }

  /** Køb en opgradering (eller reparation af porten) – kun i pausen mellem bølgerne */
  buyUpgrade(id: UpgradeId | 'repair'): { ok: boolean; msg: string } {
    if (this.phase !== 'break') return { ok: false, msg: 'Du kan kun opgradere mellem bølgerne' };
    if (id === 'repair') {
      if (!this.canRepairGate()) return { ok: false, msg: 'Porten er hel' };
      if (this.coins < GATE_REPAIR.cost) return { ok: false, msg: 'Ikke nok mønter' };
      const g = this.gate!;
      this.coins -= GATE_REPAIR.cost;
      g.hp = Math.min(g.maxHp, g.hp + g.maxHp * GATE_REPAIR.amount);
      this.syncGateBlocks();
      this.emit({ type: 'upgrade', id, level: 0 });
      return { ok: true, msg: `${this.city.gate!.name} er repareret` };
    }
    const def = UPGRADES.find((u) => u.id === id)!;
    const l = this.up[id];
    if (l >= UPGRADE_MAX) return { ok: false, msg: 'Allerede fuldt opgraderet' };
    const cost = def.costs[l];
    if (this.coins < cost) return { ok: false, msg: 'Ikke nok mønter' };
    this.coins -= cost;
    this.up[id] = l + 1;
    const p = this.player;
    if (id === 'gas') this.gas = this.maxGas;
    if (id === 'mag') {
      for (const ws of [p.primary!, p.pistol]) {
        const wid = ws.id as 'rifle' | 'pistol';
        ws.reserve = Math.max(ws.reserve, this.reserveSize(wid));
        ws.mag = this.magSize(wid);
      }
    }
    this.emit({ type: 'upgrade', id, level: l + 1 });
    return { ok: true, msg: `${def.name} – niveau ${l + 1}` };
  }

  /** Start næste bølge med det samme (knappen i opgraderingsmenuen) */
  skipBreak() { if (this.phase === 'break') this.phaseT = Math.min(this.phaseT, 0.5); }

  private addCoins(amount: number, pos: V3 | null, why: 'kill' | 'weak' | 'wave') {
    this.coins += amount;
    this.emit({ type: 'coins', amount, pos, why });
  }
  private addScore(pts: number) { this.score += Math.round(pts * this.diff.score); }

  /** Kaldes af kæmpen, når den dør */
  giantKilled(g: Giant) {
    this.stats.kills++;
    this.addCoins(KILL_COINS[g.variant], { ...g.pos }, 'kill');
    this.addScore(KILL_SCORE[g.variant]);
  }

  // ================= Hovedløkke =================

  step(dt = HUNT.dt) {
    this.time += dt;
    if (this.phase === 'won' || this.phase === 'lost') {
      // Verden kører videre (kæmper falder færdigt), men spilleren styrer ikke mere
      for (const m of this.mills) m.update(dt);
      for (const g of this.giants) g.update(this, dt);
      this.cleanupGiants();
      this.updateRocks(dt);
      return;
    }
    this.stats.time += dt;
    const p = this.player;
    p.prevPos.x = p.body.pos.x; p.prevPos.y = p.body.pos.y; p.prevPos.z = p.body.pos.z;

    this.updateWaves(dt);
    if (p.alive) {
      this.updateMovement(dt);
      this.updateWeapon(dt);
      this.updateDepots(dt);
    }
    for (const m of this.mills) m.update(dt);
    for (const g of this.giants) g.update(this, dt);
    this.cleanupGiants();
    this.updateRocks(dt);
    this.invulnT -= dt;
    // Engangs-tryk forbruges
    this.input.jumpPressed = false; this.input.hookPressed = false; this.input.firePressed = false; this.input.reload = false; this.input.slot = null;
  }

  private updateWaves(dt: number) {
    if (this.phase === 'break') {
      this.phaseT -= dt;
      // Lidt liv tilbage i pauserne
      if (this.player.alive) this.player.hp = Math.min(HUNT.maxHp, this.player.hp + dt * 4);
      if (this.phaseT <= 0) {
        this.wave++;
        this.phase = 'fight';
        this.spawnQueue = this.waves[this.wave - 1].map((s) => ({ ...s, t: s.delay }));
        this.emit({ type: 'waveStart', wave: this.wave });
      }
      return;
    }
    // fight
    for (const s of this.spawnQueue) s.t -= dt;
    const ready = this.spawnQueue.filter((s) => s.t <= 0);
    this.spawnQueue = this.spawnQueue.filter((s) => s.t > 0);
    for (const s of ready) this.spawnGiant(s);
    if (!this.spawnQueue.length && this.giants.every((g) => !g.alive)) {
      this.emit({ type: 'waveClear', wave: this.wave });
      this.addScore(WAVE_SCORE * this.wave);
      if (this.wave >= this.waves.length) { this.winBonus(); this.phase = 'won'; this.emit({ type: 'won' }); this.releaseHook(); }
      else {
        this.addCoins(WAVE_COINS, null, 'wave');
        this.phase = 'break'; this.phaseT = HUNT.breakTime;
        // Borgporten repareres lidt mellem bølgerne
        const gt = this.gate;
        if (gt && !gt.broken && gt.hp < gt.maxHp) { gt.hp = Math.min(gt.maxHp, gt.hp + gt.maxHp * HUNT.gateRepair); this.syncGateBlocks(); this.emit({ type: 'gateRepair', hp: gt.hp }); }
      }
    }
  }

  private winBonus() {
    const add = (label: string, pts: number) => { pts = Math.round(Math.max(0, pts) * this.diff.score); if (pts > 0) { this.bonus.push({ label, pts }); this.score += pts; } };
    if (this.gate) add(`${this.city.gate!.name} holdt`, WIN_SCORE.gate * (this.gate.hp / this.gate.maxHp));
    add('Liv tilbage', WIN_SCORE.hp * this.player.hp);
    add('Tidsbonus', WIN_SCORE.timeBonus * (WIN_SCORE.parPerWave * this.waves.length - this.stats.time));
  }

  spawnGiant(s: { scale: number; hp: number; big: boolean; variant?: GiantVariant; gate?: number }) {
    // Den port der ligger længst fra spilleren (men ikke den samme som sidst, hvis muligt)
    const pl = this.player.body.pos;
    const gates = [...this.city.gates].sort((a, b) => dist(b, pl) - dist(a, pl));
    const used = this.giants.filter((g) => g.alive).map((g) => g.pos);
    const gate = s.gate !== undefined ? this.city.gates[s.gate] : gates.find((gt) => used.every((u) => dist(u, gt) > 12)) ?? gates[0];
    const goal = this.city.gate ? this.city.gate.attack : pl;
    const yaw = Math.atan2(-(goal.x - gate.x), -(goal.z - gate.z));
    const variant: GiantVariant = s.variant ?? (s.big ? 'stone' : 'clay');
    const g = new Giant({ ...gate }, yaw, s.scale, Math.round(s.hp * this.diff.giantHp), s.big, variant);
    this.giants.push(g);
    this.emit({ type: 'giantSpawn', id: g.id, pos: { ...gate }, big: s.big, variant });
    return g;
  }

  // ================= Borgporten =================

  /** Kæmpens slag rammer porten */
  damageGate(dmg: number, pos: V3) {
    const gt = this.gate, cg = this.city.gate;
    if (!gt || !cg || gt.broken || this.phase === 'won' || this.phase === 'lost') return;
    dmg = Math.round(dmg * this.diff.gateDmg);
    gt.hp = Math.max(0, gt.hp - dmg);
    gt.lastHitT = this.time;
    const broken = this.syncGateBlocks();
    this.emit({ type: 'gateHit', pos, dmg, hp: gt.hp, broken });
    if (gt.hp <= 0) {
      gt.broken = true;
      for (const [x, y, z] of cg.cells) this.world.set(x, y, z, B.AIR);
      this.releaseHook();
      this.lostReason = 'gate';
      this.phase = 'lost';
      this.emit({ type: 'lost', reason: 'gate' });
    }
  }

  /** Huller i porten svarer til hvor meget liv den har tilbage. Returnerer de blokke der lige er slået ud. */
  private syncGateBlocks(): [number, number, number][] {
    const gt = this.gate!, cells = this.city.gate!.cells;
    const want = Math.floor(cells.length * 0.75 * (1 - gt.hp / gt.maxHp));
    const out: [number, number, number][] = [];
    while (gt.removed < want) { const c = cells[gt.removed++]; this.world.set(c[0], c[1], c[2], B.AIR); out.push(c); }
    while (gt.removed > want) { const c = cells[--gt.removed]; this.world.set(c[0], c[1], c[2], this.world.original(c[0], c[1], c[2])); }
    return out;
  }

  /** Tidspunkt på dagen (0 = formiddag … antal bølger-1 = nat). Glider frem i pausen før hver bølge. */
  dayTime() {
    if (!this.city.dayCycle) return 0;
    const n = this.waves.length - 1;
    if (this.phase === 'break') {
      const k = clamp(1 - this.phaseT / (this.wave === 0 ? 6 : HUNT.breakTime), 0, 1);
      return clamp(this.wave - 1 + k, 0, n);
    }
    return clamp(this.wave - 1, 0, n);
  }

  private cleanupGiants() {
    for (const g of this.giants) if (g.state === 'dead' && g.stateT > 3.2) this.emit({ type: 'giantRemoved', id: g.id });
    const before = this.giants.length;
    this.giants = this.giants.filter((g) => !(g.state === 'dead' && g.stateT > 3.2));
    if (before !== this.giants.length && this.hook.giantId >= 0 && !this.giants.some((g) => g.id === this.hook.giantId)) this.releaseHook();
  }

  // ================= Bevægelse: gang, krog, gas =================

  private updateMovement(dt: number) {
    const p = this.player, b = p.body, inp = this.input;
    const yawS = Math.sin(p.yaw), yawC = Math.cos(p.yaw);
    let fwd = inp.fwd, right = inp.right;
    const l = Math.hypot(fwd, right);
    if (l > 1) { fwd /= l; right /= l; }
    const wx = -yawS * fwd + yawC * right, wz = -yawC * fwd - yawS * right;
    const aim = dirFromYawPitch(p.yaw, p.pitch);

    this.updateHook(dt);
    const hooked = this.hook.state === 'attached';
    this.boosting = false; this.braking = false; this.reeling = false;

    if (b.onGround && !hooked) {
      // Til fods
      const speed = HUNT.runSpeed * (p.slot === 'pistol' ? 1.05 : 1);
      const k = l > 0.01 ? 11 : 12;
      const f = Math.min(1, k * dt);
      b.vel.x += (wx * speed - b.vel.x) * f;
      b.vel.z += (wz * speed - b.vel.z) * f;
      if (inp.jumpPressed) { b.vel.y = HUNT.jumpSpeed; b.onGround = false; this.emit({ type: 'jump' }); }
    } else {
      // I luften: let styring, gas-boost og bremse
      b.vel.x += wx * HUNT.airAccel * dt;
      b.vel.z += wz * HUNT.airAccel * dt;
      if (inp.jump && !inp.jumpPressed && this.gas > 0) {
        const up = b.pos.y > this.city.ceiling ? Math.min(0, aim.y) : aim.y;
        b.vel.x += aim.x * HUNT.boostAccel * dt;
        b.vel.y += up * HUNT.boostAccel * dt + (b.pos.y > this.city.ceiling ? 0 : 4 * dt);
        b.vel.z += aim.z * HUNT.boostAccel * dt;
        this.gas = Math.max(0, this.gas - HUNT.boostGas * dt);
        this.boosting = true;
      } else if (inp.jumpPressed && this.gas > 0) {
        // Et kort skub, når man trykker i luften
        b.vel.x += aim.x * 3; b.vel.y += Math.max(1.5, aim.y * 3); b.vel.z += aim.z * 3;
        this.gas = Math.max(0, this.gas - 3);
        this.boosting = true;
      }
      if (inp.brake && this.gas > 0) {
        const d = Math.exp(-HUNT.brakeDamp * dt);
        b.vel.x *= d; b.vel.z *= d;
        if (b.vel.y < 0) b.vel.y *= d;
        this.gas = Math.max(0, this.gas - HUNT.brakeGas * dt);
        this.braking = true;
      }
      const drag = Math.exp(-HUNT.airDrag * dt);
      b.vel.x *= drag; b.vel.z *= drag;
    }
    // Krogens træk og svingstyring
    if (hooked) {
      const c = this.center();
      const a = this.hook.target;
      const tx = a.x - c.x, ty = a.y - c.y, tz = a.z - c.z;
      const d = Math.hypot(tx, ty, tz) || 1;
      const nx = tx / d, ny = ty / d, nz = tz / d;
      const fast = inp.reel && this.gas > 0;
      this.reeling = fast;
      if (fast) this.gas = Math.max(0, this.gas - HUNT.reelFastGas * dt);
      const reel = (fast ? HUNT.reelFastSpeed : HUNT.reelSpeed) * this.hookMult;
      this.hook.len = Math.max(HUNT.minRope, Math.min(this.hook.len, d) - reel * dt);
      const pull = (HUNT.hookPull + (fast ? HUNT.reelFastPull : 0)) * this.hookMult;
      b.vel.x += nx * pull * dt; b.vel.y += ny * pull * dt; b.vel.z += nz * pull * dt;
      // Rebet er stramt: ingen fart væk fra ankeret, og en blød fjeder trækker tilbage til rebets længde
      if (d > this.hook.len) {
        const vr = b.vel.x * nx + b.vel.y * ny + b.vel.z * nz;
        if (vr < 0) { b.vel.x -= nx * vr; b.vel.y -= ny * vr; b.vel.z -= nz * vr; }
        const k = Math.min(30, (d - this.hook.len) * 8);
        b.vel.x += nx * k * dt; b.vel.y += ny * k * dt; b.vel.z += nz * k * dt;
      }
      // WASD pumper svinget (vinkelret på rebet)
      if (l > 0.01) {
        const dot = wx * nx + wz * nz;
        let sx = wx - nx * dot, sy = -ny * dot, sz = wz - nz * dot;
        const sl = Math.hypot(sx, sy, sz) || 1;
        sx /= sl; sy /= sl; sz /= sl;
        b.vel.x += sx * HUNT.swingAccel * dt; b.vel.y += sy * HUNT.swingAccel * dt; b.vel.z += sz * HUNT.swingAccel * dt;
      }
      if (inp.jumpPressed && b.onGround) { b.vel.y = HUNT.jumpSpeed; this.emit({ type: 'jump' }); }
    }
    b.vel.y -= HUNT.gravity * dt;
    // Højdegrænse
    if (b.pos.y > this.city.ceiling && b.vel.y > 0) b.vel.y *= Math.exp(-5 * dt);
    if (b.pos.y > this.city.ceiling + 3) { b.pos.y = this.city.ceiling + 3; b.vel.y = Math.min(0, b.vel.y); }
    // Fartgrænse
    const sp = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    if (sp > HUNT.maxSpeed) { const k = HUNT.maxSpeed / sp; b.vel.x *= k; b.vel.y *= k; b.vel.z *= k; }

    // Flyt med kollision (små delskridt, så man aldrig flyver gennem en mur)
    const before = { ...b.vel };
    const landing = moveBody(this.world, b, dt);
    this.collideGiants();
    // Vand: man vader (langsommere) og det plasker
    const wet = this.inWater(b.pos);
    if (wet && !hooked) { const k = Math.exp(-2.6 * dt); b.vel.x *= k; b.vel.z *= k; }
    // Dybt vand: man flyder op og svømmer i overfladen (hovedet over vandet)
    if (wet && b.pos.y < this.city.waterY - 1.15) { b.vel.y = Math.max(b.vel.y, 3.5); b.onGround = false; }
    this.splashT -= dt;
    if (wet && (!this.wasWet || (this.splashT <= 0 && Math.hypot(b.vel.x, b.vel.z) > 2))) {
      this.emit({ type: 'splash', pos: { x: b.pos.x, y: this.city.waterY, z: b.pos.z }, big: !this.wasWet && before.y < -6 });
      this.splashT = 0.35;
    }
    this.wasWet = wet;
    // Sammenstød: fart der forsvinder ind i en mur eller et gulv
    const lostH = Math.hypot(before.x - b.vel.x, before.z - b.vel.z);
    if (landing > 0 && !this.wasGround) this.emit({ type: 'land', speed: landing });
    const hit = Math.max(landing > HUNT.hardLanding ? landing - HUNT.hardLanding : 0, lostH > HUNT.slamSpeed ? lostH - HUNT.slamSpeed : 0);
    if (hit > 0 && !this.braking) {
      const dmg = Math.round(hit * HUNT.impactDamage);
      if (dmg > 0) { this.emit({ type: 'impact', dmg }); this.hurtPlayer(dmg, null, 'sammenstød', -1, true); }
    }
    this.wasGround = b.onGround;
    // Gas genoplades langsomt (hurtigere på jorden)
    if (!this.boosting && !this.reeling && !this.braking) this.gas = Math.min(this.maxGas, this.gas + (b.onGround ? HUNT.gasRegenGround : HUNT.gasRegenAir) * (1 + 0.2 * this.up.gas) * dt);
  }

  /** Står et punkt i vand? */
  inWater(p: V3) {
    const w = this.city.water;
    if (!w) return false;
    const x = Math.floor(p.x), z = Math.floor(p.z);
    if (x < 0 || z < 0 || x >= this.world.sx || z >= this.world.sz) return false;
    return w[z * this.world.sx + x] === 1 && p.y < this.city.waterY + 0.05;
  }
  /** Højde over jorden lige under spilleren */
  heightAboveGround() {
    const p = this.player.body.pos;
    const x = Math.floor(p.x), z = Math.floor(p.z);
    let y = Math.floor(p.y);
    while (y > 0 && !this.world.solidAt(x, y - 1, z)) y--;
    return Math.max(0, p.y - y);
  }

  center(): V3 { const b = this.player.body; return { x: b.pos.x, y: b.pos.y + 0.9, z: b.pos.z }; }
  eye(): V3 { const p = this.player; return { x: p.body.pos.x, y: p.body.pos.y + p.eyeH, z: p.body.pos.z }; }

  /** Spilleren skubbes ud af kæmpernes kroppe (og kan stå på dem) */
  private collideGiants() {
    const b = this.player.body;
    const bodies: { parts: { box: Obb }[] }[] = [];
    for (const g of this.giants) if (g.state !== 'dead' && Math.hypot(g.pos.x - b.pos.x, g.pos.z - b.pos.z) <= g.height + 4) bodies.push(g);
    for (const m of this.mills) if (Math.hypot(m.def.hub.x - b.pos.x, m.def.hub.z - b.pos.z) <= m.def.length + 4) bodies.push(m);
    for (const g of bodies) {
      for (const part of g.parts) {
        for (const off of [0.35, 0.9, 1.5]) {
          const c = { x: b.pos.x, y: b.pos.y + off, z: b.pos.z };
          const r = 0.45;
          const cl = obbClosest(part.box, c);
          if (cl.dist >= r) continue;
          let nx = c.x - cl.point.x, ny = c.y - cl.point.y, nz = c.z - cl.point.z;
          let nl = Math.hypot(nx, ny, nz);
          if (nl < 1e-4) {
            // Midt inde i kassen: skub ud fra kassens midte
            nx = c.x - part.box.tf.t.x; ny = 0; nz = c.z - part.box.tf.t.z; nl = Math.hypot(nx, nz) || 1;
          }
          nx /= nl; ny /= nl; nz /= nl;
          const push = r - cl.dist;
          b.pos.x += nx * push; b.pos.y += ny * push; b.pos.z += nz * push;
          const vn = b.vel.x * nx + b.vel.y * ny + b.vel.z * nz;
          if (vn < 0) { b.vel.x -= nx * vn; b.vel.y -= ny * vn; b.vel.z -= nz * vn; }
          if (ny > 0.65) b.onGround = true;
        }
      }
    }
  }

  // ================= Krogen =================

  private updateHook(dt: number) {
    const h = this.hook, inp = this.input;
    if (inp.hookPressed && h.state === 'idle') this.fireHook();
    if (!inp.hook && h.state !== 'idle') { this.releaseHook(); return; }
    if (h.state === 'idle') return;
    // Følg en kæmpe, hvis krogen sidder i den
    if (h.giantId >= 0 && h.part) {
      const g = this.giants.find((x) => x.id === h.giantId);
      if (!g || g.state === 'dead') { this.releaseHook(); return; }
      h.target = tfApply(g.part(h.part).box.tf, h.local);
    }
    if (h.millId >= 0) h.target = tfApply(this.mills[h.millId].parts[h.millPart].box.tf, h.local);
    if (h.state === 'flying') {
      const tx = h.target.x - h.tip.x, ty = h.target.y - h.tip.y, tz = h.target.z - h.tip.z;
      const d = Math.hypot(tx, ty, tz);
      const step = HUNT.hookSpeed * dt;
      if (d <= step) {
        h.tip = { ...h.target };
        h.state = 'attached';
        h.len = dist(this.center(), h.target);
        this.emit({ type: 'hookAttach', pos: { ...h.target }, giant: h.giantId >= 0 });
      } else {
        h.tip = { x: h.tip.x + (tx / d) * step, y: h.tip.y + (ty / d) * step, z: h.tip.z + (tz / d) * step };
      }
    } else h.tip = { ...h.target };
  }

  /** Hvad krogen ville ramme lige nu (til sigtekornets afstand) */
  hookAim(): { dist: number; giant: boolean } | null {
    const eye = this.eye();
    const d = dirFromYawPitch(this.player.yaw, this.player.pitch);
    const r = this.trace(eye, d, this.hookRange + 30, true);
    if (!r.giant && !r.voxel && !r.mill) return null;
    return { dist: r.dist, giant: !!r.giant };
  }

  private fireHook() {
    const eye = this.eye();
    const d = dirFromYawPitch(this.player.yaw, this.player.pitch);
    const r = this.trace(eye, d, this.hookRange, true);
    const h = this.hook;
    if (!r.giant && !r.voxel && !r.mill) { this.emit({ type: 'hookMiss' }); return; }
    h.state = 'flying';
    h.tip = { x: eye.x - Math.sin(this.player.yaw) * 0.3, y: eye.y - 0.35, z: eye.z - Math.cos(this.player.yaw) * 0.3 };
    h.target = { ...r.point };
    h.giantId = -1; h.part = null; h.millId = -1;
    if (r.mill) {
      h.millId = r.mill.id; h.millPart = r.millPart;
      h.local = tfInverseApply(r.mill.parts[r.millPart].box.tf, r.point);
    }
    if (r.giant && r.part) {
      h.giantId = r.giant.id;
      h.part = r.part;
      h.local = tfInverseApply(r.giant.part(r.part).box.tf, r.point);
    }
    this.emit({ type: 'hookFire', to: { ...r.point } });
  }

  releaseHook() {
    if (this.hook.state === 'idle') return;
    this.hook.state = 'idle';
    this.hook.giantId = -1;
    this.hook.part = null;
    this.hook.millId = -1;
    this.emit({ type: 'hookRelease' });
  }

  // ================= Våben =================

  private updateWeapon(dt: number) {
    const p = this.player, inp = this.input;
    if (inp.slot && inp.slot !== p.slot && (inp.slot === 'primary' || inp.slot === 'pistol')) {
      p.slot = inp.slot; p.switchT = SWITCH_TIME; p.reloadT = 0; p.spray = 0;
      this.emit({ type: 'switch' });
    }
    const ws = p.slot === 'primary' ? p.primary! : p.pistol;
    const def = WEAPONS[ws.id];
    if (p.switchT > 0) p.switchT -= dt;
    p.fireCd -= dt;
    if (this.time - p.lastShotT > def.interval * 1.3) { p.recoilP = Math.max(0, p.recoilP - def.recover * dt); p.recoilY *= Math.max(0, 1 - dt * 6); }
    if (this.time - p.lastShotT > 0.4) p.spray = 0;
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        const max = this.magSize(ws.id as 'rifle' | 'pistol');
        const n = Math.min(max - ws.mag, ws.reserve);
        ws.mag += n; ws.reserve -= n; p.reloadT = 0;
      }
    }
    const max = this.magSize(ws.id as 'rifle' | 'pistol');
    if (inp.reload && p.reloadT <= 0 && ws.mag < max && ws.reserve > 0) this.startReload(ws, def);
    if (inp.fire && p.switchT <= 0 && p.reloadT <= 0 && p.fireCd <= 0 && (def.auto || inp.firePressed)) {
      if (ws.mag > 0) this.shoot(def, ws);
      else if (inp.firePressed) {
        this.emit({ type: 'empty' });
        p.fireCd = 0.25;
        if (ws.reserve > 0) this.startReload(ws, def);
      }
    }
  }

  private startReload(ws: WeaponState, def: WeaponDef) {
    this.player.reloadT = def.reload * (1 - 0.15 * this.up.mag);
    this.player.spray = 0;
    this.emit({ type: 'reload', weapon: ws.id });
  }

  /** Spredning i grader. I Kæmpejagt er skud i bevægelse og i luften præcise (det er hele pointen). */
  spreadDeg(): number {
    const p = this.player;
    const def = WEAPONS[(p.slot === 'primary' ? p.primary! : p.pistol).id];
    const sp = Math.min(1, this.speed / 25);
    return def.spreadBase + sp * (def.id === 'rifle' ? 0.45 : 0.35) + Math.min(p.spray, 10) * def.kickGrow * 0.7;
  }

  private shoot(def: WeaponDef, ws: WeaponState) {
    const p = this.player;
    ws.mag--;
    p.fireCd = def.interval;
    p.lastShotT = this.time;
    p.spray++;
    let dir = dirFromYawPitch(p.yaw + p.recoilY * DEG, clamp(p.pitch + p.recoilP * DEG, -1.55, 1.55));
    dir = coneJitter(dir, this.spreadDeg() * DEG, this.rng);
    p.recoilP = Math.min(10, p.recoilP + def.kick * 0.75 * (1 + Math.min(p.spray, 10) * def.kickGrow));
    p.recoilY = clamp(p.recoilY + (this.rng.next() - 0.5) * def.kickYaw, -3, 3);
    this.stats.shots++;
    const from = this.eye();
    const r = this.trace(from, dir, 160, false);
    let hit: 'giant' | 'block' | 'none' = 'none';
    if (r.giant && r.part) {
      hit = 'giant';
      this.stats.hits++;
      const g = r.giant;
      const weak = r.part === 'nape';
      const mult = weak ? HUNT.weakMult : r.part === 'head' ? HUNT.headMult : r.part === 'torso' ? 1 : HUNT.limbMult;
      const dmg = Math.round(def.damage * Math.pow(def.rangeMod, r.dist / 25) * mult * (1 + 0.15 * this.up.dmg));
      if (weak && g.alive) { this.stats.weakHits++; this.addCoins(WEAK_COINS, null, 'weak'); this.addScore(WEAK_SCORE); }
      const wasAlive = g.alive;
      g.takeDamage(this, dmg, r.part);
      const kill = wasAlive && !g.alive;
      this.emit({ type: 'hitGiant', id: g.id, part: r.part, dmg, weak, pos: r.point, kill });
    } else if (r.mill) {
      hit = 'block';
      this.emit({ type: 'blockHit', pos: r.point, normal: { x: -dir.x, y: -dir.y, z: -dir.z }, block: B.PLANKS });
    } else if (r.voxel) {
      hit = 'block';
      const v = r.voxel;
      this.emit({ type: 'blockHit', pos: r.point, normal: { x: v.nx, y: v.ny, z: v.nz }, block: v.block });
      if (isDestructible(v.block) && this.world.damage(v.x, v.y, v.z, def.damage)) this.emit({ type: 'blockBreak', x: v.x, y: v.y, z: v.z, block: v.block });
    }
    this.emit({ type: 'shot', weapon: def.id, from, to: r.point, hit });
    if (ws.mag === 0 && ws.reserve > 0) this.startReload(ws, def);
  }

  /** Stråle mod byen og kæmpernes kropsdele */
  trace(o: V3, d: V3, range: number, forHook: boolean) {
    const vh = raycastVoxels(this.world, o, d, range);
    let maxD = vh ? vh.dist : range;
    let best: Giant | null = null, bestPart: PartKind | null = null;
    for (const g of this.giants) {
      if (g.state === 'dead' || (forHook && !g.alive)) continue;
      for (const part of g.parts) {
        const t = rayObb(o, d, part.box, maxD);
        if (t !== null && t < maxD) { maxD = t; best = g; bestPart = part.kind; }
      }
    }
    let mill: Mill | null = null, millPart = 0;
    for (const m of this.mills) m.parts.forEach((part, k) => {
      const t = rayObb(o, d, part.box, maxD);
      if (t !== null && t < maxD) { maxD = t; mill = m; millPart = k; best = null; bestPart = null; }
    });
    const point = { x: o.x + d.x * maxD, y: o.y + d.y * maxD, z: o.z + d.z * maxD };
    return { giant: best as Giant | null, part: bestPart as PartKind | null, dist: maxD, point, voxel: best || mill ? null : vh, mill: mill as Mill | null, millPart };
  }

  // ================= Sten =================

  throwRock(g: Giant, atGate = false) {
    const from = g.handPos('L');
    const big = g.variant === 'thrower';
    const gateAim = atGate && this.city.gate ? g.gateAim(this) : null;
    const target = gateAim ?? this.center();
    const v = gateAim ? { x: 0, y: 0, z: 0 } : this.player.body.vel;
    const D = dist(from, target);
    const T = clamp(D / HUNT.rockSpeed, 0.45, 2.4);
    // Sigt efter hvor spilleren er på vej hen (lidt mindre end helt, så man kan undvige)
    const lead = big ? 0.4 : 0.55;
    const tx = target.x + v.x * T * lead, ty = target.y + v.y * T * lead * 0.5, tz = target.z + v.z * T * lead;
    const g2 = HUNT.rockGravity;
    const vel = { x: (tx - from.x) / T, y: (ty - from.y) / T + 0.5 * g2 * T, z: (tz - from.z) / T };
    const rock: Rock = { id: this.nextRock++, pos: { ...from }, vel, age: 0, spin: { x: this.rng.range(-4, 4), y: this.rng.range(-4, 4), z: this.rng.range(-4, 4) }, big, gate: !!gateAim };
    this.rocks.push(rock);
    this.emit({ type: 'rockThrow', id: rock.id, pos: { ...from } });
  }

  private updateRocks(dt: number) {
    const c = this.center();
    for (const r of this.rocks) {
      r.age += dt;
      r.vel.y -= HUNT.rockGravity * dt;
      const nx = r.pos.x + r.vel.x * dt, ny = r.pos.y + r.vel.y * dt, nz = r.pos.z + r.vel.z * dt;
      let hitPlayer = false, done = false;
      const rad = r.big ? HUNT.boulderRadius : HUNT.rockRadius;
      if (this.playerAlive && Math.hypot(nx - c.x, ny - c.y, nz - c.z) < rad + 0.65) {
        hitPlayer = true;
        const vl = Math.hypot(r.vel.x, r.vel.z) || 1;
        this.hurtPlayer(r.big ? HUNT.boulderDamage : HUNT.rockDamage, { x: (r.vel.x / vl) * 10, y: 5, z: (r.vel.z / vl) * 10 }, 'sten', -1);
        done = true;
      } else if (this.world.solidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz)) || ny < 0.5 || r.age > 7) done = true;
      if (done && !hitPlayer) {
        // Stop lige før blokken, så nedslaget (og trykbølgen) sker på ydersiden af muren
        r.pos = { x: r.pos.x, y: Math.max(0.5, r.pos.y), z: r.pos.z };
      } else r.pos = { x: nx, y: ny, z: nz };
      if (done) {
        r.age = 99;
        this.emit({ type: 'rockImpact', id: r.id, pos: { ...r.pos }, hitPlayer, big: r.big });
        if (r.big && !hitPlayer) this.boulderSplash(r);
        const cg = this.city.gate;
        if (r.gate && cg && Math.hypot(r.pos.x - cg.center.x, r.pos.y - cg.center.y, r.pos.z - cg.center.z) < 7) this.damageGate(HUNT.boulderGateDamage, { ...r.pos });
      }
    }
    this.rocks = this.rocks.filter((r) => r.age < 99);
  }

  /** Kasterens klippeblok splintres: skade rundt om nedslaget – kun hvis der er frit fra nedslaget til spilleren */
  private boulderSplash(r: Rock) {
    if (!this.playerAlive) return;
    const c = this.center();
    const d = Math.hypot(c.x - r.pos.x, c.y - r.pos.y, c.z - r.pos.z);
    if (d > HUNT.boulderSplash) return;
    if (!lineOfSight(this.world, r.pos, c)) return;
    const f = 1 - (d / HUNT.boulderSplash) * 0.6;
    const al = Math.hypot(c.x - r.pos.x, c.z - r.pos.z) || 1;
    this.hurtPlayer(Math.round(HUNT.boulderDamage * 0.8 * f), { x: ((c.x - r.pos.x) / al) * 8, y: 4, z: ((c.z - r.pos.z) / al) * 8 }, 'sten', -1);
  }

  // ================= Skade og forsyninger =================

  hurtPlayer(dmg: number, knock: V3 | null, cause: string, giantId: number, ignoreInvuln = false) {
    const p = this.player;
    if (!p.alive || this.phase === 'won') return;
    if (this.invulnT > 0 && !ignoreInvuln) return;
    this.invulnT = 0.35;
    // Sværhedsgraden gælder kæmpernes angreb, rustningen al skade
    dmg = Math.max(1, Math.round(dmg * (cause === 'sammenstød' ? 1 : this.diff.giantDmg) * (1 - 0.12 * this.up.armor)));
    p.hp -= dmg;
    p.hurtT = this.time;
    this.stats.damageTaken += dmg;
    const g = this.giants.find((x) => x.id === giantId);
    this.emit({ type: 'hurt', dmg, cause, from: g ? { ...g.pos } : null });
    if (knock) { p.body.vel.x += knock.x; p.body.vel.y += knock.y; p.body.vel.z += knock.z; p.body.onGround = false; }
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      this.releaseHook();
      this.lostReason = 'player';
      this.phase = 'lost';
      this.emit({ type: 'lost', reason: 'player' });
    }
  }

  private updateDepots(dt: number) {
    const c = this.player.body.pos;
    for (const d of this.depots) {
      d.cd -= dt;
      if (d.cd > 0) continue;
      if (Math.hypot(c.x - d.pos.x, c.z - d.pos.z) < HUNT.depotRange && Math.abs(c.y - d.pos.y) < 2.5) {
        const p = this.player;
        p.primary!.reserve = Math.max(p.primary!.reserve, this.reserveSize('rifle'));
        p.pistol.reserve = Math.max(p.pistol.reserve, this.reserveSize('pistol'));
        this.gas = this.maxGas;
        p.hp = Math.min(HUNT.maxHp, p.hp + 30);
        d.cd = HUNT.depotCooldown;
        this.emit({ type: 'depot', id: d.id });
      }
    }
  }

  /** Til tests: hvor langt er en blok væk fra et punkt */
  solid(x: number, y: number, z: number) { return this.world.get(Math.floor(x), Math.floor(y), Math.floor(z)) !== B.AIR; }
}

export function makeHuntPlayer(pos: V3, yaw: number): Player {
  return {
    id: 0, name: 'Dig', team: 'A', isBot: false,
    body: { pos: { ...pos }, vel: { x: 0, y: 0, z: 0 }, halfW: TUNING.playerHalfWidth, height: TUNING.standHeight, onGround: true },
    prevPos: { ...pos }, yaw, pitch: 0, crouching: false, eyeH: TUNING.standEye,
    hp: HUNT.maxHp, armor: 0, alive: true,
    primary: { id: 'rifle', mag: HUNT_AMMO.rifle.mag, reserve: HUNT_AMMO.rifle.reserve },
    pistol: { id: 'pistol', mag: HUNT_AMMO.pistol.mag, reserve: HUNT_AMMO.pistol.reserve },
    slot: 'primary', blocks: 0, hasBomb: false, money: 0, kills: 0, deaths: 0,
    fireCd: 0, reloadT: 0, switchT: 0, recoilP: 0, recoilY: 0, spray: 0, lastShotT: -10,
    action: null, input: emptyInput(), stepAcc: 0, deathT: 0, killerId: -1, spawnIdx: 0, hurtT: -10,
  };
}
