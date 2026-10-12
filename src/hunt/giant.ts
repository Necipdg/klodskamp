// Kæmpen: et skelet af kasser (ben, krop, hoved, arme og nakkekrystal), som både tegnes og bruges som hitbokse.
// Adfærd: komme ind ad porten, følge spilleren gennem gaderne, varslet slag på nært hold, varslet stenkast
// mod spillere i luften eller på tage, rystelse ved træf, knæfald ved skade på benene, fald og smuldren ved død.
import { HUNT } from '../config/hunt';
import { angleDiff, clamp, type V3 } from '../core/math';
import { lineOfSight } from '../core/ray';
import { tfApply, tfChain, tfRotX, tfRotY, tfRotZ, tfTranslate, type Obb, type Tf } from './tf';
import type { Hunt, HuntTarget } from './hunt';

export type PartKind = 'legL' | 'legR' | 'torso' | 'head' | 'nape' | 'armL' | 'armR';
export const PART_KINDS: PartKind[] = ['legL', 'legR', 'torso', 'head', 'nape', 'armL', 'armR'];

/** Lerkæmpe (almindelig), stenkæmpe (stor), Bjergkæmpen (finalen i Ravnsdalen),
 *  løberkæmpe (hurtig, springer) og kaster (bliver på afstand og bombarderer med klippeblokke) */
export type GiantVariant = 'clay' | 'stone' | 'mountain' | 'sea' | 'runner' | 'thrower';
export type GiantState = 'emerge' | 'walk' | 'windSwipe' | 'swipe' | 'recover' | 'windThrow' | 'throw' | 'windLeap' | 'leap' | 'land' | 'flinch' | 'kneel' | 'dying' | 'dead';

/** Mål i meter ved skala 1 (en kæmpe er ca. 14,6 m høj) */
export const GIANT_DIM = {
  hipH: 6.2, legW: 1.9, legD: 2.0, legX: 1.25,
  torsoW: 5.0, torsoH: 5.6, torsoD: 2.8,
  headW: 2.6, headH: 2.8, headD: 2.6,
  armW: 1.7, armL: 6.6, shoulderY: 5.0,
  napeW: 1.8, napeH: 1.3, napeD: 0.75, napeY: 4.7,
};
export type GiantDims = typeof GIANT_DIM;
/** Løberen: lange tynde ben og arme, smal krop, lille hoved */
const RUNNER_DIM: GiantDims = {
  hipH: 7.2, legW: 1.35, legD: 1.5, legX: 0.95,
  torsoW: 3.7, torsoH: 4.6, torsoD: 2.2,
  headW: 2.1, headH: 2.3, headD: 2.2,
  armW: 1.2, armL: 7.2, shoulderY: 4.1,
  napeW: 1.5, napeH: 1.1, napeD: 0.7, napeY: 3.8,
};
/** Kasteren: korte tykke ben, bred krop og kraftige arme */
const THROWER_DIM: GiantDims = {
  hipH: 4.9, legW: 2.4, legD: 2.4, legX: 1.65,
  torsoW: 6.4, torsoH: 6.0, torsoD: 3.4,
  headW: 2.6, headH: 2.6, headD: 2.6,
  armW: 2.4, armL: 6.4, shoulderY: 5.3,
  napeW: 1.9, napeH: 1.3, napeD: 0.75, napeY: 5.0,
};
export const giantDims = (v: GiantVariant): GiantDims => (v === 'runner' ? RUNNER_DIM : v === 'thrower' ? THROWER_DIM : GIANT_DIM);

export interface Part { kind: PartKind; box: Obb; /** samme transform som tegningen bruger */ }

let nextId = 1;

export class Giant {
  readonly id = nextId++;
  pos: V3;
  yaw: number;
  hp: number;
  readonly maxHp: number;
  state: GiantState = 'emerge';
  stateT = 0;
  /** Tid i den aktuelle tilstand */
  private walkPh = 0;
  private moveK = 0; // 0..1 hvor meget den går (til animation)
  private path: { x: number; z: number }[] | null = null;
  private pathI = 0;
  private repathT = 0;
  private thinkT = 0;
  private swipeCd = 1.5;
  private throwCd = 2.5;
  private recentDmg = 0;
  private legDmg = 0;
  /** Spillere slaget allerede har ramt (hver spiller kun én gang pr. slag) */
  private swipeHits = new Set<number>();
  private thrown = false;
  /** Spilleren kæmpen går efter (co-op: den nærmeste – eller den der sidst skød på den) */
  focusPid = 0;
  private aggroPid = -1;
  private lastStepSide = 0;
  hitFlash = 0;
  weakFlash = 0;
  sink = 0;
  fall = 0;
  parts: Part[] = [];
  /** Hånd-position (til sten i hånden og tegning) */
  rockInHand = false;

  /** Går efter spilleren eller Borgporten */
  target: 'player' | 'gate' = 'player';
  /** Sekunder kæmpen endnu forfølger spilleren */
  aggroT = 0;
  private swipeAtGate = false;
  /** Kasteren: næste sten skal ramme Borgporten */
  throwAtGate = false;
  /** Kasteren: står stille og kaster (har frit udsyn til målet) */
  private holdGround = false;
  /** Løberen: spring */
  private leapCd = 2;
  leapFrom: V3 = { x: 0, y: 0, z: 0 };
  leapTo: V3 = { x: 0, y: 0, z: 0 };
  private leapDur = 1;
  private leapH = 6;
  readonly dims: GiantDims;

  constructor(pos: V3, yaw: number, readonly scale: number, hp: number, readonly big = false, readonly variant: GiantVariant = big ? 'stone' : 'clay') {
    this.dims = giantDims(variant);
    this.pos = { ...pos };
    this.yaw = yaw;
    this.hp = hp;
    this.maxHp = hp;
    this.computeParts();
  }

  get alive() { return this.state !== 'dying' && this.state !== 'dead'; }
  get radius() { return (this.variant === 'runner' ? 2.0 : this.variant === 'thrower' ? 3.1 : 2.6) * this.scale; }
  get height() { const d = this.dims; return (d.hipH + d.torsoH + d.headH) * this.scale; }
  /** Ganghastighed i forhold til en almindelig kæmpe */
  get speedMult() { return this.variant === 'runner' ? HUNT.runnerSpeed : this.variant === 'thrower' ? HUNT.throwerSpeed : 1; }
  /** Varsler den et angreb lige nu? (til "!" over hovedet og rød glød) */
  get telegraph(): 'swipe' | 'throw' | 'leap' | null {
    if (this.state === 'windSwipe') return 'swipe';
    if (this.state === 'windThrow') return 'throw';
    if (this.state === 'windLeap' || this.state === 'leap') return 'leap';
    return null;
  }

  // ================= Skelet =================

  private pose() {
    const s = this.state, t = this.stateT;
    const k = this.moveK;
    const sw = Math.sin(this.walkPh);
    const p = {
      kneel: 0, fall: this.fall, lean: 0, twist: Math.sin(this.walkPh) * 0.06 * k, headPitch: 0, headYaw: 0,
      legL: sw * 0.42 * k, legR: -sw * 0.42 * k,
      armLx: -sw * 0.3 * k, armLz: -0.08, armRx: sw * 0.3 * k, armRz: 0.08,
      bob: Math.abs(Math.cos(this.walkPh)) * 0.25 * k,
    };
    const ease = (x: number) => x * x * (3 - 2 * x);
    // Løberen løber foroverbøjet med store armsving
    if (this.variant === 'runner') { p.lean = 0.32 * k; p.armLx *= 2; p.armRx *= 2; p.legL *= 1.4; p.legR *= 1.4; p.headPitch = -0.25 * k; }
    if (s === 'emerge') {
      const e = ease(clamp(t / 1.6, 0, 1));
      p.kneel = (1 - e) * 1; p.lean = (1 - e) * 0.5;
    } else if (s === 'windSwipe') {
      const e = ease(clamp(t / HUNT.swipeWindup, 0, 1));
      p.armRx = 3.5 * e; p.armRz = 0.25 * e; p.lean = -0.18 * e; p.twist = 0.35 * e; p.headPitch = -0.15 * e;
    } else if (s === 'swipe') {
      const e = ease(clamp(t / HUNT.swipeActive, 0, 1));
      p.armRx = 3.5 - 2.5 * e; p.armRz = 0.25 - 0.4 * e; p.lean = -0.18 + 1.18 * e; p.twist = 0.35 - 0.55 * e; p.headPitch = 0.3 * e; p.kneel = 0.3 * e;
    } else if (s === 'recover') {
      const e = 1 - ease(clamp(t / HUNT.swipeRecover, 0, 1));
      p.armRx = 1.0 * e; p.armRz = -0.15 * e; p.lean = 1.0 * e; p.twist = -0.2 * e; p.kneel = 0.3 * e;
    } else if (s === 'windThrow') {
      const e = ease(clamp(t / HUNT.throwWindup, 0, 1));
      p.armLx = 3.6 * e; p.armLz = -0.3 * e; p.lean = -0.25 * e; p.twist = -0.4 * e; p.headPitch = -0.3 * e;
    } else if (s === 'throw') {
      const e = ease(clamp(t / 0.3, 0, 1));
      p.armLx = 3.6 - 2.3 * e; p.armLz = -0.3 + 0.2 * e; p.lean = -0.25 + 0.55 * e; p.twist = -0.4 + 0.7 * e; p.headPitch = -0.3 + 0.4 * e;
    } else if (s === 'windLeap') {
      // Sætter sig på hug og trækker armene tilbage
      const e = ease(clamp(t / HUNT.leapWindup, 0, 1));
      p.kneel = 0.55 * e; p.lean = 0.55 * e; p.armLx = -0.9 * e; p.armRx = -0.9 * e; p.headPitch = -0.5 * e; p.legL = 0; p.legR = 0;
    } else if (s === 'leap') {
      const e = clamp(t / this.leapDur, 0, 1);
      p.legL = -0.9 + e * 0.5; p.legR = 0.5 - e * 0.3; p.armLx = 2.4 - e * 1.2; p.armRx = 2.4 - e * 1.2; p.lean = 0.25; p.headPitch = -0.2; p.bob = 0;
    } else if (s === 'land') {
      const e = 1 - ease(clamp(t / HUNT.leapRecover, 0, 1));
      p.kneel = 0.7 * e; p.lean = 0.65 * e; p.armLx = 0.9 * e; p.armRx = 0.9 * e; p.armLz = -0.4 * e; p.armRz = 0.4 * e; p.headPitch = 0.3 * e;
    } else if (s === 'flinch') {
      const e = Math.sin(clamp(t / 0.55, 0, 1) * Math.PI);
      p.lean = -0.3 * e; p.headPitch = -0.45 * e; p.armLz = -0.5 * e; p.armRz = 0.5 * e;
    } else if (s === 'kneel') {
      const into = ease(clamp(t / 0.6, 0, 1)), out = ease(clamp((HUNT.kneelTime - t) / 0.8, 0, 1));
      const e = Math.min(into, out);
      p.kneel = e; p.lean = 0.55 * e; p.headPitch = 0.35 * e; p.armLx = 0.6 * e; p.armRx = 0.6 * e;
    } else if (s === 'dying' || s === 'dead') {
      p.lean = 0.2; p.armLx = 1.2 * this.fall; p.armRx = 1.4 * this.fall; p.legL = 0; p.legR = 0;
    }
    return p;
  }

  /** Beregn alle kropsdeles transformationer (kaldes hvert skridt) */
  computeParts() {
    const d = this.dims, sc = this.scale;
    const p = this.pose();
    const S = (v: number) => v * sc;
    // Knæfald: hofterne sænkes og benene peger frem som lår
    const drop = p.kneel * S(d.hipH * 0.55);
    const root = tfChain(tfTranslate(this.pos.x, this.pos.y - this.sink + p.bob * sc, this.pos.z), tfRotY(this.yaw), tfRotX(-p.fall * 1.45));
    const hips = tfChain(root, tfTranslate(0, S(d.hipH) - drop, 0));
    const torso = tfChain(hips, tfRotY(p.twist), tfRotX(-p.lean));
    const head = tfChain(torso, tfTranslate(0, S(d.torsoH), 0), tfRotX(-p.headPitch), tfRotY(p.headYaw));
    const box = (tf: Tf, cx: number, cy: number, cz: number, w: number, h: number, dd: number): Obb =>
      ({ tf: tfChain(tf, tfTranslate(S(cx), S(cy), S(cz))), h: { x: S(w) / 2, y: S(h) / 2, z: S(dd) / 2 } });
    const legRot = (a: number) => tfRotX(a + p.kneel * 1.25);
    const legL = tfChain(root, tfTranslate(-S(d.legX), S(d.hipH) - drop, 0), legRot(p.legL));
    const legR = tfChain(root, tfTranslate(S(d.legX), S(d.hipH) - drop, 0), legRot(p.legR));
    const armL = tfChain(torso, tfTranslate(-S(d.torsoW / 2 + d.armW / 2), S(d.shoulderY), 0), tfRotX(p.armLx), tfRotZ(p.armLz));
    const armR = tfChain(torso, tfTranslate(S(d.torsoW / 2 + d.armW / 2), S(d.shoulderY), 0), tfRotX(p.armRx), tfRotZ(p.armRz));
    this.parts = [
      { kind: 'legL', box: box(legL, 0, -d.hipH / 2, 0, d.legW, d.hipH, d.legD) },
      { kind: 'legR', box: box(legR, 0, -d.hipH / 2, 0, d.legW, d.hipH, d.legD) },
      { kind: 'torso', box: box(torso, 0, d.torsoH / 2, 0, d.torsoW, d.torsoH, d.torsoD) },
      { kind: 'head', box: box(head, 0, d.headH / 2, 0, d.headW, d.headH, d.headD) },
      { kind: 'nape', box: box(torso, 0, d.napeY, d.torsoD / 2 + d.napeD / 2 - 0.15, d.napeW, d.napeH, d.napeD) },
      { kind: 'armL', box: box(armL, 0, -d.armL / 2, 0, d.armW, d.armL, d.armW) },
      { kind: 'armR', box: box(armR, 0, -d.armL / 2, 0, d.armW, d.armL, d.armW) },
    ];
  }

  part(kind: PartKind) { return this.parts.find((p) => p.kind === kind)!; }
  handPos(side: 'L' | 'R'): V3 {
    const a = this.part(side === 'L' ? 'armL' : 'armR').box;
    return tfApply(a.tf, { x: 0, y: -a.h.y * 0.9, z: 0 });
  }
  chestPos(): V3 { return tfApply(this.part('torso').box.tf, { x: 0, y: 0.6 * this.part('torso').box.h.y, z: 0 }); }
  /** Et punkt midt i kæmpens krop lodret over fødderne (står altid på åben gade) */
  bodyAxis(): V3 { return { x: this.pos.x, y: this.pos.y + 8 * this.scale, z: this.pos.z }; }
  headPos(): V3 { return tfApply(this.part('head').box.tf, { x: 0, y: 0, z: 0 }); }

  // ================= Skade =================

  /** Returnerer den faktiske skade */
  takeDamage(h: Hunt, amount: number, kind: PartKind, pid = h.localPid): number {
    if (!this.alive) return 0;
    this.aggroPid = pid;
    this.hp -= amount;
    this.hitFlash = 0.12;
    if (kind === 'nape') this.weakFlash = 0.25;
    this.recentDmg += amount;
    this.aggroT = Math.max(this.aggroT, HUNT.aggroOnHit); // skud trækker kæmpen væk fra porten
    if (kind === 'legL' || kind === 'legR') this.legDmg += amount;
    if (this.hp <= 0) { this.hp = 0; this.setState('dying'); h.giantKilled(this); h.emit({ type: 'giantDeath', id: this.id, pos: { ...this.pos } }); return amount; }
    // Benene giver efter → knæfald (nakken kommer lavere ned)
    if (this.legDmg >= HUNT.legStagger * this.scale && this.state !== 'kneel' && this.state !== 'leap') {
      this.legDmg = 0;
      this.setState('kneel');
      h.emit({ type: 'giantKneel', id: this.id, pos: { ...this.pos } });
    } else if (this.recentDmg >= HUNT.flinchDamage * this.scale && (this.state === 'windSwipe' || this.state === 'windThrow' || this.state === 'windLeap' || this.state === 'walk')) {
      // Kraftig beskydning afbryder et angreb
      this.recentDmg = 0;
      this.rockInHand = false;
      this.setState('flinch');
      h.emit({ type: 'giantFlinch', id: this.id, pos: this.headPos() });
    }
    return amount;
  }

  private setState(s: GiantState) {
    this.state = s; this.stateT = 0; this.swipeHits.clear(); this.thrown = false;
    if (s !== 'swipe' && s !== 'windSwipe') this.swipeAtGate = false;
    if (s !== 'throw' && s !== 'windThrow') this.throwAtGate = false;
  }

  /** Vælg mål: Borgporten – medmindre spilleren er tæt på og synlig, eller lige har skudt på kæmpen */
  private chooseTarget(h: Hunt) {
    const gate = h.gate;
    let t: 'player' | 'gate' = 'player';
    // Løberen jager altid spilleren
    if (gate && !gate.broken && h.city.gate && this.variant !== 'runner') {
      const ts = h.targets();
      for (const tg of ts) {
        const pl = tg.body.pos;
        const pd = Math.hypot(pl.x - this.pos.x, pl.z - this.pos.z);
        if (pd < HUNT.aggroRange * this.scale && Math.abs(pl.y - this.pos.y) < this.height * 1.6) {
          const c = { x: pl.x, y: pl.y + 0.9, z: pl.z };
          if (lineOfSight(h.world, this.headPos(), c) || lineOfSight(h.world, this.chestPos(), c)) {
            if (this.aggroT <= 0 || this.aggroPid < 0) this.aggroPid = tg.pid;
            this.aggroT = Math.max(this.aggroT, 2.5);
          }
        }
      }
      t = this.aggroT > 0 && ts.length ? 'player' : 'gate';
    }
    if (t !== this.target) { this.target = t; this.repathT = 0; this.path = null; }
  }

  /** Vælg hvilken spiller kæmpen går efter: den der sidst skød på den, ellers den nærmeste (med lidt træghed) */
  private pickFocus(h: Hunt): HuntTarget | null {
    const ts = h.targets();
    if (!ts.length) return null;
    if (this.aggroT > 0 && this.aggroPid >= 0) {
      const a = ts.find((t) => t.pid === this.aggroPid);
      if (a) { this.focusPid = a.pid; return a; }
    }
    const d = (t: HuntTarget) => Math.hypot(t.body.pos.x - this.pos.x, t.body.pos.z - this.pos.z);
    let best = ts[0];
    for (const t of ts) if (d(t) < d(best)) best = t;
    const cur = ts.find((t) => t.pid === this.focusPid);
    if (cur && d(cur) < d(best) * 1.25 + 2) return cur;
    this.focusPid = best.pid;
    return best;
  }

  // ================= Opførsel =================

  update(h: Hunt, dt: number) {
    this.stateT += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.weakFlash = Math.max(0, this.weakFlash - dt);
    this.recentDmg = Math.max(0, this.recentDmg - dt * 70);
    this.swipeCd -= dt;
    this.throwCd -= dt;
    this.leapCd -= dt;
    this.aggroT -= dt;
    const tg = this.pickFocus(h);
    const pl = tg ? tg.body.pos : h.city.gate ? h.city.gate.center : this.pos;
    const goal = this.target === 'gate' && h.city.gate ? h.city.gate.center : pl;
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
    const dh = Math.hypot(dx, dz);
    const wantYaw = dh > 0.01 ? Math.atan2(-dx, -dz) : this.yaw; // uden mål: stå stille
    this.moveK += ((this.state === 'walk' && this.path ? 1 : 0) - this.moveK) * Math.min(1, dt * 3);

    switch (this.state) {
      case 'emerge':
        if (this.stateT === dt) h.emit({ type: 'giantRoar', id: this.id, pos: this.headPos() });
        if (this.stateT > 1.6) this.setState('walk');
        break;
      case 'walk': {
        this.thinkT -= dt;
        if (this.thinkT <= 0) {
          this.thinkT = 0.25;
          this.chooseTarget(h);
          if (this.target === 'gate') this.decideGate(h, dh, tg);
          else if (tg) this.decide(h, tg, dh);
        }
        if (this.state !== 'walk') break;
        this.walk(h, dt, dh, wantYaw, this.target === 'gate' && h.city.gate ? h.city.gate.attack : pl);
        break;
      }
      case 'windSwipe':
        // Drej så højre hånd rammer der, hvor spilleren står
        this.turnToward(wantYaw + 0.6, dt, 0.6);
        if (this.stateT >= HUNT.swipeWindup) this.setState('swipe');
        break;
      case 'swipe':
        this.checkSwipeHit(h);
        if (this.stateT >= HUNT.swipeActive) {
          const hand = this.handPos('R');
          h.emit({ type: 'giantSmash', id: this.id, pos: hand });
          this.smashShockwave(h, hand);
          if (this.swipeAtGate && h.city.gate && Math.hypot(hand.x - h.city.gate.center.x, hand.z - h.city.gate.center.z) < 8 * this.scale) h.damageGate(Math.round(HUNT.gateSwipeDamage * this.scale), hand);
          this.setState('recover');
        }
        break;
      case 'recover':
        if (this.stateT >= HUNT.swipeRecover) { this.swipeCd = HUNT.swipeCooldown; this.setState('walk'); }
        break;
      case 'windThrow':
        this.turnToward(wantYaw, dt, 0.8);
        this.rockInHand = this.stateT > 0.35;
        if (this.stateT >= HUNT.throwWindup) this.setState('throw');
        break;
      case 'throw':
        if (!this.thrown && this.stateT >= 0.16) {
          this.thrown = true;
          this.rockInHand = false;
          h.throwRock(this, this.throwAtGate);
        }
        if (this.stateT >= 0.45) { this.throwCd = HUNT.throwCooldown * h.diff.throwCd * (this.variant === 'thrower' ? HUNT.throwerCdMult : 1) * (0.8 + h.rng.next() * 0.5); this.setState('walk'); }
        break;
      case 'windLeap':
        this.turnToward(Math.atan2(-(this.leapTo.x - this.pos.x), -(this.leapTo.z - this.pos.z)), dt, 1.5);
        if (this.stateT >= HUNT.leapWindup) this.startLeap(h);
        break;
      case 'leap': {
        const e = clamp(this.stateT / this.leapDur, 0, 1);
        const a = this.leapFrom, b = this.leapTo;
        this.pos.x = a.x + (b.x - a.x) * e;
        this.pos.z = a.z + (b.z - a.z) * e;
        this.pos.y = a.y + (b.y - a.y) * e + 4 * this.leapH * e * (1 - e);
        if (e >= 1) this.landLeap(h);
        break;
      }
      case 'land':
        if (this.stateT >= HUNT.leapRecover) { this.leapCd = HUNT.leapCooldown * (0.85 + h.rng.next() * 0.4); this.setState('walk'); }
        break;
      case 'flinch':
        if (this.stateT >= 0.55) this.setState('walk');
        break;
      case 'kneel':
        if (this.stateT >= HUNT.kneelTime) { this.setState('walk'); this.swipeCd = Math.max(this.swipeCd, 0.6); }
        break;
      case 'dying': {
        this.fall = Math.min(1, this.fall + dt / 1.5);
        // Dør den midt i et spring, falder den ned på jorden
        const fl = h.city.floor[Math.floor(this.pos.z) * h.world.sx + Math.floor(this.pos.x)];
        if (fl >= 0 && this.pos.y > fl) this.pos.y = Math.max(fl, this.pos.y - dt * 22);
        if (this.fall >= 1 && this.stateT > 1.5) {
          h.emit({ type: 'giantFell', id: this.id, pos: { ...this.pos }, yaw: this.yaw, scale: this.scale });
          this.setState('dead');
        }
        break;
      }
      case 'dead':
        this.sink += dt * 1.6 * this.scale;
        break;
    }
    // Tunge skridt
    if (this.state === 'walk' && this.moveK > 0.3) {
      const side = Math.sin(this.walkPh) > 0 ? 1 : -1;
      if (side !== this.lastStepSide) {
        this.lastStepSide = side;
        const leg = this.part(side > 0 ? 'legR' : 'legL').box;
        const foot = tfApply(leg.tf, { x: 0, y: -leg.h.y, z: 0 });
        h.emit({ type: 'giantStep', id: this.id, pos: { x: foot.x, y: this.pos.y, z: foot.z }, scale: this.scale, wet: this.wet(h) });
      }
    }
    this.computeParts();
  }

  /** Vader kæmpen i floden? */
  wet(h: Hunt) {
    const w = h.city.water;
    return !!w && w[Math.floor(this.pos.z) * h.world.sx + Math.floor(this.pos.x)] === 1;
  }

  /** Ved porten: slå på den. Undervejs: kast sten efter spilleren, hvis den flyver tæt på. */
  private decideGate(h: Hunt, dGate: number, tg: HuntTarget | null) {
    // Kasteren bombarderer porten på afstand
    if (this.variant === 'thrower' && h.city.gate) {
      const aim = this.gateAim(h);
      this.holdGround = dGate < HUNT.throwerGateRange && lineOfSight(h.world, this.headPos(), aim);
      if (this.holdGround && this.throwCd <= 0) {
        this.setState('windThrow');
        this.throwAtGate = true;
        h.emit({ type: 'giantWindup', id: this.id, kind: 'throw', pos: this.headPos() });
        return;
      }
    }
    if (this.swipeCd <= 0 && dGate < HUNT.swipeReach * this.scale * 0.85) {
      this.setState('windSwipe');
      this.swipeAtGate = true;
      h.emit({ type: 'giantWindup', id: this.id, kind: 'swipe', pos: this.headPos() });
      return;
    }
    if (!tg) return;
    const pl = tg.body.pos;
    const pd = Math.hypot(pl.x - this.pos.x, pl.z - this.pos.z);
    if (pd < HUNT.throwRange * 0.75) this.decide(h, tg, pd, true);
  }

  /** Punktet på Borgporten, kasteren sigter efter (lidt foran porten, så strålen ikke starter inde i en blok) */
  gateAim(h: Hunt): V3 {
    const g = h.city.gate!;
    return { x: g.center.x + (g.attack.x - g.center.x) * 0.25, y: g.center.y, z: g.center.z + (g.attack.z - g.center.z) * 0.25 };
  }

  private decide(h: Hunt, tg: HuntTarget, dh: number, throwOnly = false) {
    const pl = tg;
    const py = pl.body.pos.y - this.pos.y;
    const reach = HUNT.swipeReach * this.scale;
    const chest = this.chestPos();
    const target = { x: pl.body.pos.x, y: pl.body.pos.y + 0.9, z: pl.body.pos.z };
    const los = lineOfSight(h.world, chest, target) || lineOfSight(h.world, this.headPos(), target);
    if (this.variant === 'thrower' && !throwOnly) this.holdGround = los && dh < HUNT.throwerKeep;
    // Løberen springer mod spilleren hen over åben grund
    if (this.variant === 'runner' && !throwOnly && this.leapCd <= 0 && dh > HUNT.leapMin && dh < HUNT.leapMax && py < 6 && los && this.planLeap(h, tg)) {
      this.setState('windLeap');
      h.emit({ type: 'giantWindup', id: this.id, kind: 'leap', pos: this.headPos() });
      return;
    }
    // Nærangreb: spilleren er inden for armens rækkevidde (også på lave tage)
    if (!throwOnly && this.swipeCd <= 0 && dh < reach && py < this.height * 0.95 && py > -2 && los) {
      this.setState('windSwipe');
      h.emit({ type: 'giantWindup', id: this.id, kind: 'swipe', pos: this.headPos() });
      return;
    }
    // Stenkast: mod en spiller i luften, på et tag eller langt væk – kun med frit udsyn fra hånden
    const airborne = !pl.body.onGround || py > 4;
    if (this.variant === 'runner') return; // løberen kaster ikke
    if (this.throwCd <= 0 && dh < HUNT.throwRange && (airborne || dh > reach * 1.4 || (this.variant === 'thrower' && dh > reach * 0.9))) {
      const hand = this.handPos('L');
      const up = { x: hand.x, y: Math.max(hand.y, this.pos.y + this.height * 0.85), z: hand.z };
      if (lineOfSight(h.world, up, target) || lineOfSight(h.world, this.headPos(), target)) {
        this.setState('windThrow');
        h.emit({ type: 'giantWindup', id: this.id, kind: 'throw', pos: this.headPos() });
        return;
      }
    }
  }

  private turnToward(yaw: number, dt: number, k = 1) {
    const rate = HUNT.turnRate * (Math.PI / 180) * dt * k;
    this.yaw += clamp(angleDiff(this.yaw, yaw), -rate, rate);
  }

  private walk(h: Hunt, dt: number, dh: number, wantYaw: number, pl: V3) {
    const r = Math.ceil(this.radius);
    this.repathT -= dt;
    // Tæt på: stå og vend sig mod målet
    const stop = this.holdGround || (this.target === 'gate' ? Math.hypot(pl.x - this.pos.x, pl.z - this.pos.z) < 2 || dh < 5.5 * this.scale : dh < 5 * this.scale);
    if (stop) { this.path = null; this.turnToward(wantYaw, dt); return; }
    if (!this.path || this.repathT <= 0) {
      this.path = h.nav.path(this.pos.x, this.pos.z, pl.x, pl.z, r);
      this.pathI = 0;
      this.repathT = 1.2;
    }
    if (!this.path || this.pathI >= this.path.length) { this.turnToward(wantYaw, dt); return; }
    let wp = this.path[this.pathI];
    while (this.pathI < this.path.length - 1 && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 2.5 * this.scale) wp = this.path[++this.pathI];
    const yaw = Math.atan2(-(wp.x - this.pos.x), -(wp.z - this.pos.z));
    this.turnToward(yaw, dt);
    const facing = Math.cos(angleDiff(this.yaw, yaw));
    const speed = HUNT.walkSpeed * this.speedMult * h.diff.giantSpeed * this.scale * Math.max(0, facing) * (this.wet(h) ? 0.65 : 1);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let nx = this.pos.x + fx * speed * dt, nz = this.pos.z + fz * speed * dt;
    // Skub væk fra andre kæmper
    for (const o of h.giants) {
      if (o === this || !o.alive) continue;
      const ox = nx - o.pos.x, oz = nz - o.pos.z, od = Math.hypot(ox, oz), min = this.radius + o.radius;
      if (od < min && od > 0.01) { nx += (ox / od) * (min - od) * 0.5; nz += (oz / od) * (min - od) * 0.5; }
    }
    // Gå kun hvor kæmper kan gå (aldrig ind i huse)
    // (Gli langs hjørner: går det ikke på skrå, så prøv kun langs x eller kun langs z)
    const r1 = Math.ceil(this.radius) - 1;
    if (h.nav.walkable(Math.floor(nx), Math.floor(nz), r1)) { this.pos.x = nx; this.pos.z = nz; }
    else if (h.nav.walkable(Math.floor(this.pos.x), Math.floor(nz), r1)) this.pos.z = nz;
    else if (h.nav.walkable(Math.floor(nx), Math.floor(this.pos.z), r1)) this.pos.x = nx;
    else this.repathT = 0;
    this.walkPh += (speed * dt) / (2.6 * this.scale * (this.dims.hipH / GIANT_DIM.hipH) * (this.variant === 'runner' ? 1.5 : 1));
    // Følg terrænet (fx ned i flodlejet)
    const f = h.city.floor[Math.floor(this.pos.z) * h.world.sx + Math.floor(this.pos.x)];
    if (f >= 0) this.pos.y += (f - this.pos.y) * Math.min(1, dt * 3);
  }

  // ================= Løberens spring =================

  /** Find et landingssted lige foran spilleren. Springet skal gå hen over åben grund – aldrig gennem huse. */
  private planLeap(h: Hunt, tg: HuntTarget): boolean {
    const pl = tg.body.pos;
    const dx = pl.x - this.pos.x, dz = pl.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    const short = 2.6 * this.scale; // lander lige foran spilleren (trykbølgen rammer, kroppen lander ikke oven i)
    const r = Math.ceil(this.radius) - 1;
    const c = h.nav.nearest(pl.x - (dx / d) * short, pl.z - (dz / d) * short, r);
    if (!c) return false;
    const to = { x: c.x + 0.5, y: Math.max(0, h.city.floor[c.z * h.world.sx + c.x]), z: c.z + 0.5 };
    if (Math.hypot(to.x - pl.x, to.z - pl.z) > short + 4) return false;
    if (!this.leapClear(h, this.pos, to)) return false;
    this.leapTo = to;
    return true;
  }

  private leapClear(h: Hunt, a: V3, b: V3) {
    // Fri bane i kroppens højde og i springets top
    for (const y of [2.5, 6, 10]) if (!lineOfSight(h.world, { x: a.x, y: a.y + y * this.scale, z: a.z }, { x: b.x, y: b.y + y * this.scale, z: b.z })) return false;
    return true;
  }

  private startLeap(h: Hunt) {
    // Sigt igen efter spilleren (hvis det stadig kan lade sig gøre) – ellers springes til det oprindelige sted
    const old = this.leapTo;
    const tg = h.target(this.focusPid);
    if (!tg || !this.planLeap(h, tg)) this.leapTo = old;
    this.leapFrom = { ...this.pos };
    const d = Math.hypot(this.leapTo.x - this.pos.x, this.leapTo.z - this.pos.z);
    this.leapDur = clamp(d / HUNT.leapSpeed, 0.55, 1.4);
    this.leapH = 4 + d * 0.18;
    this.yaw = Math.atan2(-(this.leapTo.x - this.pos.x), -(this.leapTo.z - this.pos.z));
    this.setState('leap');
    h.emit({ type: 'giantRoar', id: this.id, pos: this.headPos() });
  }

  private landLeap(h: Hunt) {
    this.pos = { ...this.leapTo };
    this.walkPh = 0;
    this.path = null;
    h.emit({ type: 'giantSmash', id: this.id, pos: { ...this.pos } });
    h.emit({ type: 'giantStep', id: this.id, pos: { ...this.pos }, scale: this.scale * 1.4, wet: this.wet(h) });
    this.setState('land');
    // Trykbølge: kun spillere tæt på jorden, med frit udsyn fra landingsstedet og kroppen
    for (const tg of h.targets()) {
      const pl = tg.body;
      const c = { x: pl.pos.x, y: pl.pos.y + 0.9, z: pl.pos.z };
      const r = HUNT.leapRadius * this.scale;
      const dh = Math.hypot(c.x - this.pos.x, c.z - this.pos.z);
      if (dh > r || pl.pos.y - this.pos.y > 3.5) continue;
      if (!lineOfSight(h.world, { x: this.pos.x, y: this.pos.y + 1.5, z: this.pos.z }, c) || !lineOfSight(h.world, this.bodyAxis(), c)) continue;
      const f = 1 - (dh / r) * 0.5;
      const al = dh || 1;
      h.hurtPlayer(Math.round(HUNT.leapDamage * f), { x: ((c.x - this.pos.x) / al) * 14, y: 7, z: ((c.z - this.pos.z) / al) * 14 }, 'spring', this.id, false, tg.pid);
    }
  }

  /** Slaget rammer jorden: trykbølge rundt om hånden (rammer kun spillere tæt på jorden og med frit udsyn) */
  private smashShockwave(h: Hunt, hand: V3) {
    for (const tg of h.targets()) {
      if (this.swipeHits.has(tg.pid)) continue;
      const pl = tg.body;
      const c = { x: pl.pos.x, y: pl.pos.y + 0.9, z: pl.pos.z };
      const r = 4.5 * this.scale;
      const dh = Math.hypot(c.x - hand.x, c.z - hand.z);
      if (dh > r || pl.pos.y - this.pos.y > 3) continue;
      const src = { x: hand.x, y: hand.y + 1, z: hand.z };
      if (!lineOfSight(h.world, src, c) || !lineOfSight(h.world, this.bodyAxis(), c)) continue;
      this.swipeHits.add(tg.pid);
      const f = 1 - (dh / r) * 0.5;
      const ax = c.x - hand.x, az = c.z - hand.z, al = Math.hypot(ax, az) || 1;
      h.hurtPlayer(Math.round(HUNT.swipeDamage * f), { x: (ax / al) * 12, y: 6, z: (az / al) * 12 }, 'slag', this.id, false, tg.pid);
    }
  }

  private checkSwipeHit(h: Hunt) {
    for (const tg of h.targets()) {
      if (this.swipeHits.has(tg.pid)) continue;
      const pl = tg.body;
      const c = { x: pl.pos.x, y: pl.pos.y + 0.9, z: pl.pos.z };
      const arm = this.part('armR').box;
      // Afstand fra spilleren til den svingende arm (hånden er størst – lidt ekstra radius)
      const near = Math.hypot(c.x - arm.tf.t.x, c.y - arm.tf.t.y, c.z - arm.tf.t.z) < arm.h.y + 2.5 * this.scale;
      if (!near) continue;
      const hand = this.handPos('R');
      const toPlayer = (q: V3) => Math.hypot(q.x - c.x, q.y - c.y, q.z - c.z);
      // Kapsel langs armen
      const top = tfApply(arm.tf, { x: 0, y: arm.h.y, z: 0 });
      const dist = segDist(top, hand, c);
      if (dist > arm.h.x + 1.0 && toPlayer(hand) > 2.4 * this.scale) continue;
      // Aldrig gennem bygninger: der skal være frit fra kæmpens krop (der hvor den står på gaden) til spilleren,
      // og fra skulderen eller brystet – så et slag aldrig rækker ind over/igennem et hus
      if (!lineOfSight(h.world, this.bodyAxis(), c)) continue;
      if (!lineOfSight(h.world, top, c) && !lineOfSight(h.world, this.chestPos(), c)) continue;
      this.swipeHits.add(tg.pid);
      const away = { x: c.x - this.pos.x, z: c.z - this.pos.z };
      const al = Math.hypot(away.x, away.z) || 1;
      h.hurtPlayer(HUNT.swipeDamage, { x: (away.x / al) * 16, y: 7, z: (away.z / al) * 16 }, 'slag', this.id, false, tg.pid);
    }
  }

  // ================= Netværk (co-op) =================

  /** Alt hvad en klient behøver for at tegne kæmpen og ramme dens hitbokse */
  toNet(): GiantNet {
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return {
      id: this.id, v: this.variant, sc: this.scale, big: this.big, hp: Math.round(this.hp), mx: this.maxHp,
      p: [r(this.pos.x), r(this.pos.y), r(this.pos.z)], yaw: r(this.yaw), st: this.state, t: r(this.stateT),
      wp: r(this.walkPh), mk: r(this.moveK), f: r(this.fall), sk: r(this.sink), hf: r(this.hitFlash), wf: r(this.weakFlash),
      rk: this.rockInHand, lt: [r(this.leapTo.x), r(this.leapTo.y), r(this.leapTo.z)], lf: [r(this.leapFrom.x), r(this.leapFrom.y), r(this.leapFrom.z)], ld: r(this.leapDur),
    };
  }

  static fromNet(s: GiantNet): Giant {
    const g = new Giant({ x: s.p[0], y: s.p[1], z: s.p[2] }, s.yaw, s.sc, s.mx, s.big, s.v as GiantVariant);
    (g as { id: number }).id = s.id;
    g.applyNet(s);
    return g;
  }

  /** Sæt kæmpens tilstand fra værtens øjebliksbillede (a → b med andel k: blød bevægelse mellem billederne) */
  applyNet(b: GiantNet, a: GiantNet | null = null, k = 1) {
    const L = (x: number, y: number) => (a ? x + (y - x) * k : y);
    const src = a && a.st === b.st ? a : null; // tiden i en tilstand kan kun glide, hvis tilstanden er den samme
    const P = (i: number) => (a ? a.p[i] + (b.p[i] - a.p[i]) * k : b.p[i]);
    this.pos = { x: P(0), y: P(1), z: P(2) };
    this.yaw = a ? a.yaw + angleDiff(a.yaw, b.yaw) * k : b.yaw;
    this.state = b.st;
    this.stateT = src ? src.t + (b.t - src.t) * k : b.t;
    this.walkPh = a ? a.wp + (b.wp - a.wp) * k : b.wp;
    this.moveK = L(a ? a.mk : 0, b.mk);
    this.fall = L(a ? a.f : 0, b.f);
    this.sink = L(a ? a.sk : 0, b.sk);
    this.hp = b.hp;
    this.hitFlash = b.hf; this.weakFlash = b.wf; this.rockInHand = b.rk;
    this.leapTo = { x: b.lt[0], y: b.lt[1], z: b.lt[2] };
    this.leapFrom = { x: b.lf[0], y: b.lf[1], z: b.lf[2] };
    this.leapDur = b.ld;
    this.computeParts();
  }
}

/** Kæmpe i værtens øjebliksbillede (korte navne – sendes 15 gange i sekundet) */
export interface GiantNet {
  id: number; v: string; sc: number; big: boolean; hp: number; mx: number;
  p: [number, number, number]; yaw: number; st: GiantState; t: number; wp: number; mk: number; f: number; sk: number;
  hf: number; wf: number; rk: boolean; lt: [number, number, number]; lf: [number, number, number]; ld: number;
}

function segDist(a: V3, b: V3, p: V3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / (abx * abx + aby * aby + abz * abz || 1), 0, 1);
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}
