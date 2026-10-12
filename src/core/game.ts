// Hele spillets logik uden grafik: runder, bombe, våben, skade, økonomi, bygning og bots.
// Kører med fast tidsskridt (TUNING.dt) og kan derfor testes i Node.
import { TUNING, type Difficulty } from '../config/tuning';
import { WEAPONS, ECONOMY, BUY_ITEMS, BLOCKS_PER_BUY, SWITCH_TIME, type BuyId, type Slot, type WeaponDef, type WeaponId } from '../config/weapons';
import { B, BLOCKS, isDestructible } from './blocks';
import { buildMap, inRect, type GameMap } from './map';
import { NavGrid } from './nav';
import { moveBody, bodyHitsWorld } from './physics';
import { raycastVoxels, rayAabb } from './ray';
import { DEG, Rng, clamp, dirFromYawPitch, dist, type V3 } from './math';
import { emptyInput, eyePos, otherTeam, type Player, type Team, type WeaponState } from './player';
import { Bot } from './bot';
import type { VoxelWorld } from './world';

export type Phase = 'buy' | 'live' | 'planted' | 'end' | 'over';

export type RoundReason = 'eliminated' | 'time' | 'exploded' | 'defused';
export const REASON_TEXT: Record<RoundReason, (w: Team) => string> = {
  eliminated: (w) => (w === 'A' ? 'Forsvarerne blev elimineret' : 'Angriberne blev elimineret'),
  time: () => 'Tiden løb ud – bomben blev ikke plantet',
  exploded: () => 'Bomben eksploderede',
  defused: () => 'Bomben blev desarmeret',
};

export interface BombState {
  state: 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded';
  carrier: number;
  pos: V3;
  timer: number;
  planter: number;
}

export type GameEvent =
  | { type: 'shot'; pid: number; weapon: WeaponId; from: V3; to: V3; hit: 'player' | 'block' | 'none' }
  | { type: 'hit'; target: number; attacker: number; dmg: number; head: boolean; pos: V3 }
  | { type: 'kill'; killer: number; victim: number; weapon: WeaponId | 'bomb'; head: boolean }
  | { type: 'blockHit'; x: number; y: number; z: number; block: number; pos: V3; normal: V3 }
  | { type: 'blockBreak'; x: number; y: number; z: number; block: number }
  | { type: 'blockPlace'; x: number; y: number; z: number; pid: number }
  | { type: 'reload'; pid: number; weapon: WeaponId }
  | { type: 'empty'; pid: number }
  | { type: 'switch'; pid: number; slot: Slot }
  | { type: 'knife'; pid: number }
  | { type: 'footstep'; pid: number }
  | { type: 'jump'; pid: number }
  | { type: 'land'; pid: number; speed: number }
  | { type: 'plantStart' | 'plantAbort' | 'defuseStart' | 'defuseAbort'; pid: number }
  | { type: 'planted'; pid: number; pos: V3 }
  | { type: 'defused'; pid: number }
  | { type: 'exploded'; pos: V3 }
  | { type: 'bombDrop'; pos: V3 }
  | { type: 'bombPickup'; pid: number }
  | { type: 'roundStart'; round: number }
  | { type: 'live' }
  | { type: 'roundEnd'; winner: Team; reason: RoundReason }
  | { type: 'matchEnd'; winner: Team }
  | { type: 'buy'; pid: number; item: BuyId }
  | { type: 'message'; pid: number; text: string };

export interface GameOptions {
  humanTeam: Team;
  difficulty: Difficulty;
  seed?: number;
  /** Alle seks spillere styres af bots (tests) */
  allBots?: boolean;
}

export interface BuildTarget { x: number; y: number; z: number; valid: boolean; reason: string }

const BOT_NAMES: Record<Team, string[]> = { A: ['Kasper', 'Freja', 'Rasmus'], D: ['Mette', 'Jonas', 'Sofie'] };

export class Game {
  readonly map: GameMap;
  readonly world: VoxelWorld;
  readonly nav: NavGrid;
  readonly rng: Rng;
  readonly players: Player[] = [];
  readonly bots = new Map<number, Bot>();
  readonly humanId = 0;
  phase: Phase = 'buy';
  phaseT = 0;
  roundT = 0;
  round = 0;
  time = 0;
  score: Record<Team, number> = { A: 0, D: 0 };
  bomb: BombState = { state: 'carried', carrier: -1, pos: { x: 0, y: 0, z: 0 }, timer: 0, planter: -1 };
  lastRound: { winner: Team; reason: RoundReason } | null = null;
  matchWinner: Team | null = null;
  events: GameEvent[] = [];
  /** Hvilken rute angriberne tager i denne runde (bots) */
  attackRoute: 'lang' | 'tunnel' = 'lang';
  /** Angribernes samling før stormløbet: hvornår den første ankom, og om de er gået */
  stageT: Record<'lang' | 'tunnel', number> = { lang: -1, tunnel: -1 };
  stageGo: Record<'lang' | 'tunnel', boolean> = { lang: false, tunnel: false };
  /** Holdenes seneste melding om en fjende (bots deler det, de ser) */
  intel: Record<Team, { pos: V3; t: number } | null> = { A: null, D: null };
  /** Bomben plantet i denne runde (til økonomi og statistik) */
  plantedThisRound = false;
  readonly difficulty: Difficulty;
  readonly humanTeam: Team;
  /** Den der smed bomben kan ikke samle den op igen med det samme */
  private noPickup = { pid: -1, until: 0 };

  constructor(readonly opts: GameOptions) {
    this.rng = new Rng(opts.seed ?? 1234);
    this.difficulty = opts.difficulty;
    this.humanTeam = opts.humanTeam;
    this.map = buildMap();
    this.world = this.map.world;
    this.nav = new NavGrid(this.world);
    // Menneskespilleren er altid id 0 og står på sit valgte hold
    const teams: Team[] = [opts.humanTeam, opts.humanTeam, opts.humanTeam, otherTeam(opts.humanTeam), otherTeam(opts.humanTeam), otherTeam(opts.humanTeam)];
    const used: Record<Team, number> = { A: 0, D: 0 };
    teams.forEach((team, id) => {
      const idx = used[team]++;
      const isHuman = id === 0 && !opts.allBots;
      this.players.push(this.makePlayer(id, isHuman ? 'Dig' : BOT_NAMES[team][idx], team, !isHuman, idx));
    });
    for (const p of this.players) if (p.isBot) this.bots.set(p.id, new Bot(this, p));
    this.startRound();
  }

  get human() { return this.players[this.humanId]; }

  private makePlayer(id: number, name: string, team: Team, isBot: boolean, spawnIdx: number): Player {
    return {
      id, name, team, isBot,
      body: { pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 0 }, halfW: TUNING.playerHalfWidth, height: TUNING.standHeight, onGround: true },
      prevPos: { x: 0, y: 1, z: 0 },
      yaw: 0, pitch: 0, crouching: false, eyeH: TUNING.standEye,
      hp: TUNING.maxHp, armor: 0, alive: false,
      primary: null, pistol: freshWeapon('pistol'), slot: 'pistol',
      blocks: 0, hasBomb: false, money: ECONOMY.startMoney, kills: 0, deaths: 0,
      fireCd: 0, reloadT: 0, switchT: 0, recoilP: 0, recoilY: 0, spray: 0, lastShotT: -10,
      action: null, input: emptyInput(), stepAcc: 0, deathT: 0, killerId: -1, spawnIdx, hurtT: -10,
    };
  }

  /** Lad en bot styre menneskespilleren (til tests og "autopilot") */
  setAutopilot(on: boolean) {
    const h = this.human;
    if (on && !this.bots.has(h.id)) { this.bots.set(h.id, new Bot(this, h)); this.bots.get(h.id)!.newRound(); }
    if (!on && !h.isBot) { this.bots.delete(h.id); h.input = emptyInput(); }
  }

  emit(e: GameEvent) { this.events.push(e); }
  drainEvents(): GameEvent[] { const e = this.events; this.events = []; return e; }

  alive(team: Team) { return this.players.filter((p) => p.alive && p.team === team); }

  // ================= Runder =================

  startRound() {
    this.round++;
    this.world.reset();
    this.plantedThisRound = false;
    this.lastRound = null;
    this.intel = { A: null, D: null };
    for (const p of this.players) {
      const sp = (p.team === 'A' ? this.map.spawnA : this.map.spawnD)[p.spawnIdx];
      const survived = p.alive && this.round > 1;
      if (!survived) {
        p.primary = null;
        p.armor = 0;
        p.pistol = freshWeapon('pistol');
        p.blocks = 0;
      }
      p.alive = true;
      p.hp = TUNING.maxHp;
      p.body.pos = { ...sp.pos };
      p.prevPos = { ...sp.pos };
      p.body.vel = { x: 0, y: 0, z: 0 };
      p.body.height = TUNING.standHeight;
      p.body.onGround = true;
      p.crouching = false;
      p.eyeH = TUNING.standEye;
      p.yaw = sp.yaw;
      p.pitch = 0;
      p.slot = p.primary ? 'primary' : 'pistol';
      p.fireCd = 0; p.reloadT = 0; p.switchT = 0; p.recoilP = 0; p.recoilY = 0; p.spray = 0;
      p.action = null; p.hasBomb = false; p.killerId = -1;
      p.input = emptyInput();
    }
    const attackers = this.players.filter((p) => p.team === 'A');
    const carrier = this.rng.pick(attackers);
    carrier.hasBomb = true;
    this.bomb = { state: 'carried', carrier: carrier.id, pos: { ...carrier.body.pos }, timer: 0, planter: -1 };
    this.noPickup = { pid: -1, until: 0 };
    this.attackRoute = this.rng.chance(0.5) ? 'lang' : 'tunnel';
    this.stageT = { lang: -1, tunnel: -1 };
    this.stageGo = { lang: false, tunnel: false };
    this.phase = 'buy';
    this.phaseT = TUNING.buyTime;
    this.roundT = TUNING.roundTime;
    for (const b of this.bots.values()) b.newRound();
    this.emit({ type: 'roundStart', round: this.round });
  }

  private endRound(winner: Team, reason: RoundReason) {
    if (this.phase === 'end' || this.phase === 'over') return;
    this.phase = 'end';
    this.phaseT = TUNING.roundEndTime;
    this.score[winner]++;
    this.lastRound = { winner, reason };
    for (const p of this.players) {
      const gain = p.team === winner ? ECONOMY.winReward : ECONOMY.lossReward;
      p.money = Math.min(ECONOMY.maxMoney, p.money + gain);
    }
    for (const p of this.players) { p.action = null; }
    if (this.score[winner] >= TUNING.winsToWinMatch) this.matchWinner = winner;
    this.emit({ type: 'roundEnd', winner, reason });
  }

  // ================= Hovedløkke =================

  step(dt = TUNING.dt) {
    this.time += dt;
    if (this.phase === 'over') return;

    for (const p of this.players) { p.prevPos.x = p.body.pos.x; p.prevPos.y = p.body.pos.y; p.prevPos.z = p.body.pos.z; }
    for (const [id, bot] of this.bots) if (this.players[id].alive) bot.update(dt);
    for (const p of this.players) if (p.alive) this.updatePlayer(p, dt);
    this.separatePlayers();
    for (const p of this.players) { p.input.firePressed = false; p.input.reload = false; p.input.drop = false; p.input.slot = null; }

    this.updateBomb(dt);

    switch (this.phase) {
      case 'buy':
        this.phaseT -= dt;
        if (this.phaseT <= 0) { this.phase = 'live'; this.emit({ type: 'live' }); }
        break;
      case 'live':
        this.roundT -= dt;
        this.checkRoundEnd();
        break;
      case 'planted':
        this.bomb.timer -= dt;
        if (this.bomb.timer <= 0) this.explode();
        else this.checkRoundEnd();
        break;
      case 'end':
        this.phaseT -= dt;
        if (this.phaseT <= 0) {
          if (this.matchWinner) { this.phase = 'over'; this.emit({ type: 'matchEnd', winner: this.matchWinner }); }
          else this.startRound();
        }
        break;
    }
  }

  /** Spillere kan ikke stå inde i hinanden: skub dem blidt fra hinanden (uden at skubbe ind i mure) */
  private separatePlayers() {
    const ps = this.players.filter((p) => p.alive);
    const min = TUNING.playerHalfWidth * 2;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i].body, b = ps[j].body;
      if (a.pos.y + a.height <= b.pos.y || b.pos.y + b.height <= a.pos.y) continue;
      let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= min) continue;
      if (d < 1e-4) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
      const push = (min - d) / 2;
      for (const [body, s] of [[a, -1], [b, 1]] as const) {
        const nx = body.pos.x + dx * push * s, nz = body.pos.z + dz * push * s;
        if (!bodyHitsWorld(this.world, body, nx, body.pos.y, body.pos.z)) body.pos.x = nx;
        if (!bodyHitsWorld(this.world, body, body.pos.x, body.pos.y, nz)) body.pos.z = nz;
      }
    }
  }

  private checkRoundEnd() {
    const a = this.alive('A').length, d = this.alive('D').length;
    if (this.phase === 'live') {
      if (d === 0) this.endRound('A', 'eliminated');
      else if (a === 0) this.endRound('D', 'eliminated');
      else if (this.roundT <= 0) this.endRound('D', 'time');
    } else if (this.phase === 'planted') {
      // Efter plantning skal forsvarerne desarmere – også selvom alle angribere er døde
      if (d === 0) this.endRound('A', 'eliminated');
    }
  }

  // ================= Spillere =================

  private updatePlayer(p: Player, dt: number) {
    const inp = p.input;
    const frozen = this.phase === 'buy' || this.phase === 'over' || p.action !== null;

    // --- Våbenskift ---
    if (inp.slot && inp.slot !== p.slot && this.hasSlot(p, inp.slot)) {
      p.slot = inp.slot;
      p.switchT = inp.slot === 'blocks' || inp.slot === 'bomb' ? 0.25 : SWITCH_TIME;
      p.reloadT = 0;
      p.spray = 0;
      this.emit({ type: 'switch', pid: p.id, slot: p.slot });
    }
    if (!this.hasSlot(p, p.slot)) { p.slot = p.primary ? 'primary' : 'pistol'; p.switchT = SWITCH_TIME; }

    // --- Hug ---
    if (inp.crouch && !p.crouching) { p.crouching = true; p.body.height = TUNING.crouchHeight; }
    else if (!inp.crouch && p.crouching) {
      if (!bodyHitsWorld(this.world, p.body, p.body.pos.x, p.body.pos.y, p.body.pos.z, TUNING.standHeight)) {
        p.crouching = false; p.body.height = TUNING.standHeight;
      }
    }
    const eyeTarget = p.crouching ? TUNING.crouchEye : TUNING.standEye;
    p.eyeH += (eyeTarget - p.eyeH) * Math.min(1, dt * 14);

    // --- Bevægelse ---
    const b = p.body;
    let fwd = frozen ? 0 : inp.fwd, right = frozen ? 0 : inp.right;
    const l = Math.hypot(fwd, right);
    if (l > 1) { fwd /= l; right /= l; }
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const wx = -sy * fwd + cy * right, wz = -cy * fwd - sy * right;
    let speed = TUNING.runSpeed * this.speedFactor(p);
    if (p.crouching) speed *= TUNING.crouchFactor;
    else if (inp.walk) speed *= TUNING.walkFactor;
    const k = b.onGround ? (l > 0.01 ? TUNING.groundAccel / speed : TUNING.groundFriction) : TUNING.airAccel / speed;
    const f = Math.min(1, k * dt);
    b.vel.x += (wx * speed - b.vel.x) * f;
    b.vel.z += (wz * speed - b.vel.z) * f;
    if (!frozen && inp.jump && b.onGround) {
      b.vel.y = TUNING.jumpSpeed;
      b.onGround = false;
      this.emit({ type: 'jump', pid: p.id });
    }
    b.vel.y -= TUNING.gravity * dt;
    const landing = moveBody(this.world, b, dt);
    if (landing > 0) this.emit({ type: 'land', pid: p.id, speed: landing });
    if (b.pos.y < -5) this.damage(p, 999, -1, 'knife', false, b.pos); // falder ud af banen (bør ikke ske)

    // Fodtrin (kun ved løb – Shift og hug er lydløst)
    const hs = Math.hypot(b.vel.x, b.vel.z);
    if (b.onGround && hs > TUNING.runSpeed * 0.62) {
      p.stepAcc += hs * dt;
      if (p.stepAcc > 2.3) { p.stepAcc = 0; this.emit({ type: 'footstep', pid: p.id }); }
    }

    // --- Rekyl falder ---
    const w = this.currentDef(p);
    if (w && this.time - p.lastShotT > w.interval * 1.3) {
      const r = w.recover * dt;
      p.recoilP = Math.max(0, p.recoilP - r);
      p.recoilY *= Math.max(0, 1 - dt * 6);
    }
    if (this.time - p.lastShotT > 0.4) p.spray = 0;

    // --- Timere ---
    if (p.switchT > 0) p.switchT -= dt;
    p.fireCd -= dt;
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) this.finishReload(p);
    }

    // --- Genladning ---
    const ws = this.currentWeaponState(p);
    if (inp.reload && ws && p.reloadT <= 0) this.startReload(p);

    // --- Skyd / byg ---
    if (!frozen && inp.fire && p.switchT <= 0 && p.reloadT <= 0 && p.fireCd <= 0 && this.phase !== 'over') {
      if (p.slot === 'primary' || p.slot === 'pistol') {
        const def = WEAPONS[ws!.id];
        if (def.auto || inp.firePressed) {
          const bot = this.bots.get(p.id);
          if (bot && !bot.clearShot()) { /* intet frit udsyn lige nu – botten holder skuddet tilbage */ }
          else if (ws!.mag > 0) this.shoot(p, def, ws!);
          else if (inp.firePressed) {
            this.emit({ type: 'empty', pid: p.id });
            p.fireCd = 0.25;
            if (ws!.reserve > 0) this.startReload(p);
          }
        }
      } else if (p.slot === 'knife') this.knife(p);
      else if (p.slot === 'blocks' && inp.firePressed) this.placeBlock(p);
    }

    // --- Plant / desarmér / smid bomben ---
    this.updateAction(p, dt);
    if (inp.drop && p.hasBomb && this.phase !== 'buy') this.dropBomb(p);
  }

  speedFactor(p: Player) {
    if (p.slot === 'knife' || p.slot === 'blocks' || p.slot === 'bomb') return WEAPONS.knife.speedFactor;
    const ws = this.currentWeaponState(p);
    return ws ? WEAPONS[ws.id].speedFactor : 1;
  }

  hasSlot(p: Player, s: Slot) {
    if (s === 'primary') return !!p.primary;
    if (s === 'blocks') return p.blocks > 0;
    if (s === 'bomb') return p.hasBomb;
    return true;
  }

  currentWeaponState(p: Player): WeaponState | null {
    if (p.slot === 'primary') return p.primary;
    if (p.slot === 'pistol') return p.pistol;
    return null;
  }
  currentDef(p: Player): WeaponDef | null {
    if (p.slot === 'knife') return WEAPONS.knife;
    const ws = this.currentWeaponState(p);
    return ws ? WEAPONS[ws.id] : null;
  }

  private startReload(p: Player) {
    const ws = this.currentWeaponState(p);
    if (!ws) return;
    const def = WEAPONS[ws.id];
    if (ws.mag >= def.mag || ws.reserve <= 0) return;
    p.reloadT = def.reload;
    p.spray = 0;
    this.emit({ type: 'reload', pid: p.id, weapon: ws.id });
  }
  private finishReload(p: Player) {
    const ws = this.currentWeaponState(p);
    p.reloadT = 0;
    if (!ws) return;
    const def = WEAPONS[ws.id];
    const n = Math.min(def.mag - ws.mag, ws.reserve);
    ws.mag += n;
    ws.reserve -= n;
  }

  /** Spredning i grader lige nu (bruges også af sigtekornet) */
  spreadDeg(p: Player): number {
    const def = this.currentDef(p);
    if (!def || def.id === 'knife') return 0;
    const hs = Math.hypot(p.body.vel.x, p.body.vel.z);
    let s = def.spreadBase + def.spreadMove * clamp(hs / TUNING.runSpeed, 0, 1);
    if (!p.body.onGround) s += def.spreadAir;
    if (p.crouching) s *= 0.7;
    s += Math.min(p.spray, 10) * def.kickGrow * 0.8;
    return s;
  }

  /** Den retning et skud går (sigte + rekyl), uden tilfældig spredning */
  aimDir(p: Player): V3 {
    return dirFromYawPitch(p.yaw + p.recoilY * DEG, clamp(p.pitch + p.recoilP * DEG, -1.55, 1.55));
  }

  private shoot(p: Player, def: WeaponDef, ws: WeaponState) {
    ws.mag--;
    p.fireCd = def.interval;
    const spread = this.spreadDeg(p);
    let dir = this.aimDir(p);
    dir = coneJitter(dir, spread * DEG, this.rng);
    p.lastShotT = this.time;
    p.spray++;
    p.recoilP = Math.min(14, p.recoilP + def.kick * (1 + Math.min(p.spray, 10) * def.kickGrow));
    const pattern = p.spray < 4 ? 0 : Math.sin(p.spray * 0.7) * def.kickYaw;
    p.recoilY = clamp(p.recoilY + pattern + (this.rng.next() - 0.5) * def.kickYaw, -4, 4);

    const from = eyePos(p);
    const res = this.trace(p, from, dir, def.range);
    let hit: 'player' | 'block' | 'none' = 'none';
    if (res.player) {
      hit = 'player';
      const dmg = def.damage * Math.pow(def.rangeMod, res.dist / 10) * (res.head ? def.headMult : 1);
      this.damage(res.player, dmg, p.id, def.id, res.head, res.point);
    } else if (res.voxel) {
      hit = 'block';
      this.hitBlock(res.voxel.x, res.voxel.y, res.voxel.z, def.damage * Math.pow(def.rangeMod, res.dist / 10), res.point, { x: res.voxel.nx, y: res.voxel.ny, z: res.voxel.nz });
    }
    this.emit({ type: 'shot', pid: p.id, weapon: def.id, from, to: res.point, hit });
    // Bots hører skud
    for (const bot of this.bots.values()) bot.hearShot(p, from);
    if (ws.mag === 0 && ws.reserve > 0 && p.isBot) this.startReload(p);
  }

  private knife(p: Player) {
    const def = WEAPONS.knife;
    p.fireCd = def.interval;
    const from = eyePos(p);
    const dir = this.aimDir(p);
    const res = this.trace(p, from, dir, def.range);
    this.emit({ type: 'knife', pid: p.id });
    if (res.player) this.damage(res.player, def.damage, p.id, 'knife', res.head, res.point);
    else if (res.voxel) this.hitBlock(res.voxel.x, res.voxel.y, res.voxel.z, 35, res.point, { x: res.voxel.nx, y: res.voxel.ny, z: res.voxel.nz });
  }

  private hitBlock(x: number, y: number, z: number, dmg: number, pos: V3, normal: V3) {
    const block = this.world.get(x, y, z);
    this.emit({ type: 'blockHit', x, y, z, block, pos, normal });
    if (isDestructible(block) && this.world.damage(x, y, z, dmg)) this.emit({ type: 'blockBreak', x, y, z, block });
  }

  /** Stråle fra et øje: rammer første spiller (ikke holdkammerater) eller blok */
  trace(shooter: Player | null, o: V3, d: V3, range: number) {
    const vh = raycastVoxels(this.world, o, d, range);
    let maxD = vh ? vh.dist : range;
    let best: Player | null = null, head = false;
    for (const q of this.players) {
      if (!q.alive || (shooter && (q === shooter || q.team === shooter.team))) continue;
      const r = hitPlayer(q, o, d, maxD);
      if (r) { maxD = r.t; best = q; head = r.head; }
    }
    const point = { x: o.x + d.x * maxD, y: o.y + d.y * maxD, z: o.z + d.z * maxD };
    return { player: best, head, dist: maxD, point, voxel: best ? null : vh };
  }

  damage(target: Player, amount: number, attackerId: number, weapon: WeaponId | 'bomb', head: boolean, pos: V3) {
    if (!target.alive) return;
    let dmg = amount;
    if (!head && target.armor > 0 && weapon !== 'bomb') {
      const absorbed = dmg * TUNING.vestAbsorb;
      dmg -= absorbed;
      target.armor = Math.max(0, target.armor - absorbed);
    }
    dmg = Math.max(1, Math.round(dmg));
    target.hp -= dmg;
    target.hurtT = this.time;
    this.emit({ type: 'hit', target: target.id, attacker: attackerId, dmg, head, pos });
    const att = this.players[attackerId];
    if (att && target.alive) this.bots.get(target.id)?.onDamaged(att);
    if (target.hp <= 0) this.kill(target, attackerId, weapon, head);
  }

  private kill(v: Player, killerId: number, weapon: WeaponId | 'bomb', head: boolean) {
    v.alive = false;
    v.hp = 0;
    v.deaths++;
    v.deathT = this.time;
    v.killerId = killerId;
    if (v.action) this.emit({ type: v.action.kind === 'plant' ? 'plantAbort' : 'defuseAbort', pid: v.id });
    v.action = null;
    const k = this.players[killerId];
    if (k && k !== v && k.team !== v.team) {
      k.kills++;
      k.money = Math.min(ECONOMY.maxMoney, k.money + ECONOMY.killReward);
    }
    if (v.hasBomb) this.dropBomb(v);
    this.emit({ type: 'kill', killer: killerId, victim: v.id, weapon, head });
  }

  // ================= Bomben =================

  inSite(p: Player) {
    return inRect(this.map.site, Math.floor(p.body.pos.x), Math.floor(p.body.pos.z));
  }

  canPlant(p: Player) { return p.alive && p.hasBomb && this.phase === 'live' && this.inSite(p) && p.body.onGround; }
  canDefuse(p: Player) {
    return p.alive && p.team === 'D' && this.phase === 'planted' && this.bomb.state === 'planted' &&
      dist(p.body.pos, this.bomb.pos) <= TUNING.defuseRange && this.players.every((q) => q === p || q.action?.kind !== 'defuse');
  }

  private updateAction(p: Player, dt: number) {
    const use = p.input.use;
    if (p.action) {
      const ok = use && (p.action.kind === 'plant' ? this.canPlant(p) : this.phase === 'planted' && dist(p.body.pos, this.bomb.pos) <= TUNING.defuseRange);
      if (!ok) {
        this.emit({ type: p.action.kind === 'plant' ? 'plantAbort' : 'defuseAbort', pid: p.id });
        p.action = null;
        return;
      }
      p.action.t += dt;
      if (p.action.kind === 'plant' && p.action.t >= TUNING.plantTime) this.plant(p);
      else if (p.action.kind === 'defuse' && p.action.t >= TUNING.defuseTime) this.defuse(p);
      return;
    }
    if (!use) return;
    if (this.canPlant(p)) {
      p.action = { kind: 'plant', t: 0 };
      p.body.vel.x = p.body.vel.z = 0;
      p.reloadT = 0;
      this.emit({ type: 'plantStart', pid: p.id });
    } else if (this.canDefuse(p)) {
      p.action = { kind: 'defuse', t: 0 };
      p.body.vel.x = p.body.vel.z = 0;
      p.reloadT = 0;
      this.emit({ type: 'defuseStart', pid: p.id });
    }
  }

  private plant(p: Player) {
    p.action = null;
    p.hasBomb = false;
    if (p.slot === 'bomb') p.slot = p.primary ? 'primary' : 'pistol';
    this.bomb = { state: 'planted', carrier: -1, pos: { x: p.body.pos.x, y: p.body.pos.y, z: p.body.pos.z }, timer: TUNING.bombTimer, planter: p.id };
    this.phase = 'planted';
    this.plantedThisRound = true;
    p.money = Math.min(ECONOMY.maxMoney, p.money + ECONOMY.plantReward);
    this.emit({ type: 'planted', pid: p.id, pos: { ...this.bomb.pos } });
  }

  private defuse(p: Player) {
    p.action = null;
    this.bomb.state = 'defused';
    p.money = Math.min(ECONOMY.maxMoney, p.money + ECONOMY.defuseReward);
    this.emit({ type: 'defused', pid: p.id });
    this.endRound('D', 'defused');
  }

  private explode() {
    this.bomb.state = 'exploded';
    const bp = this.bomb.pos;
    this.emit({ type: 'exploded', pos: { ...bp } });
    for (const p of this.players) {
      if (!p.alive) continue;
      const c = { x: p.body.pos.x, y: p.body.pos.y + 0.9, z: p.body.pos.z };
      const d = dist(c, bp);
      if (d < TUNING.bombKillRadius) this.damage(p, 500, this.bomb.planter, 'bomb', false, c);
      else if (d < TUNING.bombDamageRadius) {
        const f = 1 - (d - TUNING.bombKillRadius) / (TUNING.bombDamageRadius - TUNING.bombKillRadius);
        this.damage(p, 95 * f, this.bomb.planter, 'bomb', false, c);
      }
    }
    const r = TUNING.bombBlockRadius;
    for (let y = 1; y <= 4; y++)
      for (let z = Math.floor(bp.z - r); z <= Math.ceil(bp.z + r); z++)
        for (let x = Math.floor(bp.x - r); x <= Math.ceil(bp.x + r); x++) {
          const bl = this.world.get(x, y, z);
          if (isDestructible(bl) && Math.hypot(x + 0.5 - bp.x, y + 0.5 - bp.y, z + 0.5 - bp.z) <= r) {
            this.world.set(x, y, z, B.AIR);
            this.emit({ type: 'blockBreak', x, y, z, block: bl });
          }
        }
    this.endRound('A', 'exploded');
  }

  dropBomb(p: Player) {
    if (!p.hasBomb) return;
    p.hasBomb = false;
    if (p.slot === 'bomb') p.slot = p.primary ? 'primary' : 'pistol';
    let x = p.body.pos.x, z = p.body.pos.z;
    if (p.alive) {
      // Smid den lidt frem, hvis der er plads
      const fx = x - Math.sin(p.yaw) * 1.4, fz = z - Math.cos(p.yaw) * 1.4;
      if (!this.world.solidAt(Math.floor(fx), Math.floor(p.body.pos.y + 0.5), Math.floor(fz))) { x = fx; z = fz; }
      this.noPickup = { pid: p.id, until: this.time + 2 };
    }
    const pos = { x, y: this.groundY(x, p.body.pos.y + 0.5, z), z };
    this.bomb = { state: 'dropped', carrier: -1, pos, timer: 0, planter: -1 };
    this.emit({ type: 'bombDrop', pos: { ...pos } });
  }

  /** Højden af gulvet under et punkt */
  groundY(x: number, y: number, z: number): number {
    let yy = Math.floor(y);
    while (yy > 0 && !this.world.solidAt(Math.floor(x), yy - 1, Math.floor(z))) yy--;
    return yy;
  }

  private updateBomb(_dt: number) {
    const bomb = this.bomb;
    if (bomb.state === 'carried') {
      const c = this.players[bomb.carrier];
      if (c) bomb.pos = { ...c.body.pos };
    } else if (bomb.state === 'dropped') {
      for (const p of this.players) {
        if (!p.alive || p.team !== 'A') continue;
        // Den, der lige smed den, samler den ikke op med det samme
        if (Math.hypot(p.body.pos.x - bomb.pos.x, p.body.pos.z - bomb.pos.z) < TUNING.bombPickupRange && Math.abs(p.body.pos.y - bomb.pos.y) < 2) {
          if (p.id === this.noPickup.pid && this.time < this.noPickup.until) continue;
          p.hasBomb = true;
          this.bomb = { state: 'carried', carrier: p.id, pos: { ...p.body.pos }, timer: 0, planter: -1 };
          this.emit({ type: 'bombPickup', pid: p.id });
          break;
        }
      }
    }
  }

  // ================= Køb =================

  canBuy(p: Player) { return this.phase === 'buy' && p.alive; }

  buy(pid: number, item: BuyId): { ok: boolean; msg: string } {
    const p = this.players[pid];
    const def = BUY_ITEMS.find((b) => b.id === item);
    if (!def) return { ok: false, msg: 'Ukendt vare' };
    if (!this.canBuy(p)) return { ok: false, msg: 'Du kan kun købe i købsfasen' };
    if (p.money < def.price) return { ok: false, msg: 'Du har ikke penge nok' };
    switch (item) {
      case 'smg':
      case 'rifle':
        if (p.primary?.id === item) return { ok: false, msg: 'Det våben har du allerede' };
        p.primary = freshWeapon(item);
        p.slot = 'primary';
        p.switchT = SWITCH_TIME;
        p.reloadT = 0;
        break;
      case 'vest':
        if (p.armor >= 100) return { ok: false, msg: 'Du har allerede en hel vest' };
        p.armor = 100;
        break;
      case 'ammo': {
        const guns = [p.pistol, p.primary].filter((w): w is WeaponState => !!w);
        if (guns.every((w) => w.reserve >= WEAPONS[w.id].reserve)) return { ok: false, msg: 'Din ammunition er allerede fyldt op' };
        for (const w of guns) w.reserve = WEAPONS[w.id].reserve;
        break;
      }
      case 'blocks':
        if (p.blocks >= TUNING.maxBlocksCarried) return { ok: false, msg: `Du kan højst bære ${TUNING.maxBlocksCarried} blokke` };
        p.blocks = Math.min(TUNING.maxBlocksCarried, p.blocks + BLOCKS_PER_BUY);
        break;
    }
    p.money -= def.price;
    this.emit({ type: 'buy', pid, item });
    return { ok: true, msg: `Købt: ${def.name}` };
  }

  // ================= Bygning =================

  buildTarget(p: Player): BuildTarget | null {
    if (!p.alive || p.slot !== 'blocks') return null;
    const o = eyePos(p);
    const d = dirFromYawPitch(p.yaw, p.pitch);
    const vh = raycastVoxels(this.world, o, d, TUNING.buildReach);
    if (!vh) return null;
    const x = vh.x + vh.nx, y = vh.y + vh.ny, z = vh.z + vh.nz;
    return { x, y, z, ...this.checkPlacement(p, x, y, z) };
  }

  checkPlacement(p: Player, x: number, y: number, z: number): { valid: boolean; reason: string } {
    const no = (reason: string) => ({ valid: false, reason });
    if (p.blocks <= 0) return no('Ingen blokke tilbage – køb flere i købsfasen');
    if (this.phase !== 'live' && this.phase !== 'planted') return no('Du kan først bygge, når runden er i gang');
    if (!this.world.inside(x, y, z) || y < 1) return no('Kan ikke bygge her');
    if (y > TUNING.buildMaxY) return no(`For højt – højst ${TUNING.buildMaxY} blokke over gulvet`);
    if (this.world.get(x, y, z) !== B.AIR) return no('Pladsen er optaget');
    if (inRect(this.map.zoneA, x, z) || inRect(this.map.zoneD, x, z)) return no('Man må ikke bygge i et spawnområde');
    const s = this.map.site;
    if (x >= s.x0 - 1 && x <= s.x1 + 1 && z >= s.z0 - 1 && z <= s.z1 + 1) return no('Man må ikke bygge på bombeområdet');
    for (const q of this.players) {
      if (!q.alive) continue;
      const qb = q.body;
      if (qb.pos.x + qb.halfW > x - 0.02 && qb.pos.x - qb.halfW < x + 1.02 && qb.pos.z + qb.halfW > z - 0.02 && qb.pos.z - qb.halfW < z + 1.02 &&
        qb.pos.y + qb.height > y && qb.pos.y < y + 1) return no('En spiller står i vejen');
    }
    if (this.bomb.state === 'dropped' && Math.floor(this.bomb.pos.x) === x && Math.floor(this.bomb.pos.z) === z) return no('Bomben ligger der');
    return { valid: true, reason: '' };
  }

  placeBlock(p: Player, at?: { x: number; y: number; z: number }): boolean {
    let t: BuildTarget | null;
    if (at) t = { ...at, ...this.checkPlacement(p, at.x, at.y, at.z) };
    else t = this.buildTarget(p);
    p.fireCd = 0.22;
    if (!t) { this.emit({ type: 'message', pid: p.id, text: 'Peg på en flade inden for rækkevidde' }); return false; }
    if (!t.valid) { this.emit({ type: 'message', pid: p.id, text: t.reason }); return false; }
    this.world.set(t.x, t.y, t.z, B.BUILD);
    p.blocks--;
    if (p.blocks <= 0 && p.slot === 'blocks') { p.slot = p.primary ? 'primary' : 'pistol'; p.switchT = SWITCH_TIME; }
    this.emit({ type: 'blockPlace', x: t.x, y: t.y, z: t.z, pid: p.id });
    return true;
  }

  // ================= Hjælpere til tests og UI =================

  blockName(b: number) { return BLOCKS[b]?.name ?? '?'; }
}

export function freshWeapon(id: WeaponId): WeaponState {
  return { id, mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
}

/** Ramte strålen spilleren? Hoved og krop er to kasser. */
export function hitPlayer(q: Player, o: V3, d: V3, maxD: number): { t: number; head: boolean } | null {
  const p = q.body.pos, top = p.y + q.body.height, hs = TUNING.headSize;
  const hw = 0.3, hh = 0.21;
  const tHead = rayAabb(o, d, p.x - hh, top - hs, p.z - hh, p.x + hh, top, p.z + hh, maxD);
  const tBody = rayAabb(o, d, p.x - hw, p.y, p.z - hw, p.x + hw, top - hs, p.z + hw, maxD);
  if (tHead === null && tBody === null) return null;
  if (tBody === null || (tHead !== null && tHead <= tBody)) return { t: tHead!, head: true };
  return { t: tBody, head: false };
}

/** Tilfældig retning inden for en kegle med halv vinkel `angle` (radianer) */
export function coneJitter(d: V3, angle: number, rng: Rng): V3 {
  if (angle <= 0) return d;
  const r = angle * Math.sqrt(rng.next());
  const phi = rng.next() * Math.PI * 2;
  // Ortonormal basis omkring d
  const up = Math.abs(d.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let ux = up.y * d.z - up.z * d.y, uy = up.z * d.x - up.x * d.z, uz = up.x * d.y - up.y * d.x;
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const vx = d.y * uz - d.z * uy, vy = d.z * ux - d.x * uz, vz = d.x * uy - d.y * ux;
  const s = Math.sin(r), c = Math.cos(r), cp = Math.cos(phi), sp = Math.sin(phi);
  return {
    x: d.x * c + (ux * cp + vx * sp) * s,
    y: d.y * c + (uy * cp + vy * sp) * s,
    z: d.z * c + (uz * cp + vz * sp) * s,
  };
}
