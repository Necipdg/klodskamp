// Co-op: hvad der sendes mellem værten og gæsterne under jagten, og hvordan det bliver til en flydende verden hos gæsten.
// Værten kører hele jagten (kæmper, sten, bølger, porten) og sender et øjebliksbillede 15 gange i sekundet.
// Gæsten tegner kæmperne lidt bagud i tiden (ca. 0,1 s) og glider mellem billederne, så de bevæger sig blødt.
// Hver spiller styrer selv sin egen figur og sender sin position; skud mod kæmper sendes som træf, som værten regner.
import { HUNT } from '../config/hunt';
import type { Slot } from '../config/weapons';
import { B, isDestructible } from '../core/blocks';
import { angleDiff, type V3 } from '../core/math';
import { Giant, type GiantNet, type PartKind } from '../hunt/giant';
import type { Hunt, HuntEvent, Rock } from '../hunt/hunt';
import { UPGRADES, type UpgradeId } from '../hunt/progress';
import type { CoopSession, NetMsg } from './coop';

type T3 = [number, number, number];
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const t3 = (v: V3): T3 => [r2(v.x), r2(v.y), r2(v.z)];
const v3 = (t: T3): V3 => ({ x: t[0], y: t[1], z: t[2] });
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpT = (a: T3, b: T3, k: number): V3 => ({ x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), z: lerp(a[2], b[2], k) });

/** En spillers tilstand (korte navne – sendes ofte) */
export interface PState {
  pid: number; p: T3; v: T3; y: number; pi: number; a: boolean; hp: number; s: Slot; og: boolean; hk: T3 | null;
  /** Sekunder til spilleren er tilbage (når nede) */
  rt: number;
}

/** En medspiller som den skal tegnes lige nu */
export interface Mate {
  pid: number; name: string; pos: V3; vel: V3; yaw: number; pitch: number; alive: boolean; hp: number; slot: Slot; onGround: boolean; hook: V3 | null; respawn: number;
}

/** Værtens øjebliksbillede */
interface Snap {
  t: 's'; tm: number; w: number; ph: Hunt['phase']; pt: number; c: number; sc: number; k: number; q: number;
  up: Record<UpgradeId, number>; g: [number, boolean] | null; lr: Hunt['lostReason']; b: Hunt['bonus'];
  gs: GiantNet[]; r: [number, number, number, number, number][]; ps: PState[];
}

/** Hurtige beskeder (samme rækkefølge hos alle – kun nummeret sendes). `here` = vis en markør på radaren. */
export const QUICK_CHAT: { text: string; here: boolean }[] = [
  { text: 'Hjælp mig!', here: true },
  { text: 'Kæmpe her!', here: true },
  { text: 'Kom herhen', here: true },
  { text: 'Pas på!', here: false },
  { text: 'Godt skud!', here: false },
  { text: 'Skal vi opgradere?', here: false },
];

/** Hændelser fra værten som gæsterne også skal se og høre */
const FORWARD = new Set<HuntEvent['type']>([
  'giantSpawn', 'giantRoar', 'giantStep', 'giantWindup', 'giantSmash', 'giantFlinch', 'giantKneel', 'giantDeath', 'giantFell', 'giantRemoved',
  'rockThrow', 'rockImpact', 'gateHit', 'gateRepair', 'waveStart', 'waveClear', 'won', 'lost', 'coins', 'upgrade', 'blockBreak',
]);

/** Det spillet (main.ts) skal gøre, når noget sker over nettet */
export interface NetHooks {
  /** En medspiller skød (lyd, mundingsglimt og sporstreg) */
  remoteShot(pid: number, from: V3, to: V3, weapon: string): void;
  /** Svar på et køb i opgraderingsmenuen (gæst) */
  shopReply(ok: boolean, msg: string): void;
  note(text: string): void;
  /** Hurtig besked fra en medspiller (nummer i QUICK_CHAT og hvor afsenderen var) */
  chat(pid: number, i: number, pos: V3): void;
}

export function localState(h: Hunt): PState {
  const p = h.player;
  return {
    pid: h.localPid, p: t3(p.body.pos), v: t3(p.body.vel), y: r3(p.yaw), pi: r3(p.pitch), a: p.alive, hp: Math.round(p.hp), s: p.slot, og: p.body.onGround,
    hk: h.hook.state !== 'idle' ? t3(h.hook.tip) : null, rt: p.alive ? 0 : r2(Math.max(0, h.respawnT)),
  };
}

function toMate(a: PState, b: PState, k: number, name: string): Mate {
  return {
    pid: b.pid, name, pos: lerpT(a.p, b.p, k), vel: v3(b.v), yaw: a.y + angleDiff(a.y, b.y) * k, pitch: lerp(a.pi, b.pi, k),
    alive: b.a, hp: b.hp, slot: b.s, onGround: b.og, hook: b.hk ? (a.hk ? lerpT(a.hk, b.hk, k) : v3(b.hk)) : null, respawn: b.rt,
  };
}

/** Uret der bestemmer hvor langt bagud i tiden der tegnes: følger det nyeste billede minus en lille forsinkelse */
class RenderClock {
  t = -1;
  update(latest: number, dt: number, delay: number) {
    const want = latest - delay;
    if (this.t < 0 || Math.abs(this.t - want) > 0.6) this.t = want;
    else { this.t += dt; this.t += (want - this.t) * Math.min(1, dt * 2); }
    return this.t;
  }
}

/** Find de to billeder omkring tidspunktet t og hvor langt imellem dem vi er */
function bracket<S extends { tm: number }>(buf: S[], t: number): [S, S, number] {
  if (t <= buf[0].tm) return [buf[0], buf[0], 1];
  for (let i = buf.length - 1; i >= 0; i--) {
    const a = buf[i];
    if (a.tm <= t) {
      const b = buf[i + 1];
      if (!b) return [a, a, 1];
      return [a, b, Math.min(1, (t - a.tm) / Math.max(1e-3, b.tm - a.tm))];
    }
  }
  return [buf[0], buf[0], 1];
}

/** Medspillerens figur: positioner med tidsstempel, tegnet lidt bagud */
class Track {
  buf: (PState & { tm: number })[] = [];
  clock = new RenderClock();
  push(st: PState, tm: number) {
    if (this.buf.length && tm <= this.buf[this.buf.length - 1].tm) return; // gammel/dobbelt besked
    this.buf.push({ ...st, tm });
    if (this.buf.length > 24) this.buf.shift();
  }
  get latest() { return this.buf[this.buf.length - 1] ?? null; }
  sample(dt: number, name: string): Mate | null {
    if (!this.buf.length) return null;
    const t = this.clock.update(this.latest!.tm, dt, 0.12);
    const [a, b, k] = bracket(this.buf, t);
    return toMate(a, b, k, name);
  }
}

const SEND_EVERY = 1 / 15;
const STATE_EVERY = 1 / 20;

// =====================================================================
// Værten
// =====================================================================

export class HostSync {
  private sendT = 0;
  private tracks = new Map<number, Track>();
  private batch: HuntEvent[] = [];
  /** Blokke der er skudt i stykker i denne jagt (sendes til gæster, der kommer ind midt i) */
  readonly broken: T3[] = [];

  constructor(readonly s: CoopSession, readonly h: Hunt, readonly hooks: NetHooks) {}

  private seen = new Map<number, number>();

  name(pid: number) { return this.s.players.find((p) => p.pid === pid)?.name ?? `Spiller ${pid + 1}`; }

  /** Beskeder fra gæsterne – kaldes før jagten køres frem */
  receive() {
    const h = this.h;
    // En gæst der ikke har sendt noget i 30 sekunder (lukket telefon, mistet net) tages ud af jagten
    for (const r of h.remotes) {
      if (!this.seen.has(r.pid)) this.seen.set(r.pid, h.time);
      if (h.time - this.seen.get(r.pid)! > 30) { this.s.kick(r.pid); this.seen.delete(r.pid); }
    }
    for (const { from, msg } of this.s.inbox.splice(0)) {
      switch (msg.t) {
        case 'p': this.onState(from, msg.st as PState, msg.tm as number); break;
        case 'hit': h.applyRemoteHit(from, msg.id, msg.part as PartKind, Math.min(2000, Number(msg.dmg) || 0), !!msg.weak); break;
        case 'blk': this.breakBlock(msg.x, msg.y, msg.z, from); break;
        case 'shot':
          this.hooks.remoteShot(from, v3(msg.f), v3(msg.to), msg.w);
          this.s.broadcast({ t: 'shot', pid: from, f: msg.f, to: msg.to, w: msg.w }, from);
          break;
        case 'buy': {
          const r = h.buyUpgrade(msg.id);
          this.s.sendTo(from, { t: 'buyr', ok: r.ok, msg: r.msg });
          if (r.ok) this.hooks.note(`${this.name(from)} købte: ${r.msg}`);
          break;
        }
        case 'chat': {
          const i = Number(msg.i) | 0;
          if (i < 0 || i >= QUICK_CHAT.length || !Array.isArray(msg.p)) break;
          this.hooks.chat(from, i, v3(msg.p as T3));
          this.s.broadcast({ t: 'chat', pid: from, i, p: msg.p }, from);
          break;
        }
        case 'skip': if (h.phase === 'break') { h.skipBreak(); this.hooks.note(`${this.name(from)} startede bølgen`); } break;
        case 'left':
          h.remotes = h.remotes.filter((r) => r.pid !== from);
          this.tracks.delete(from);
          break;
      }
    }
  }

  private onState(pid: number, st: PState, tm: number) {
    const h = this.h;
    if (!this.s.players.some((p) => p.pid === pid)) return; // allerede gået
    this.seen.set(pid, h.time);
    let r = h.remotes.find((x) => x.pid === pid);
    if (!r) {
      r = { pid, name: this.name(pid), body: { pos: v3(st.p), vel: v3(st.v), onGround: st.og }, alive: st.a, yaw: st.y, pitch: st.pi, hp: st.hp, slot: st.s, hookTip: null };
      h.remotes.push(r);
    }
    r.body.pos = v3(st.p); r.body.vel = v3(st.v); r.body.onGround = st.og;
    r.alive = st.a; r.hp = st.hp; r.yaw = st.y; r.pitch = st.pi; r.slot = st.s; r.hookTip = st.hk ? v3(st.hk) : null;
    (r as typeof r & { rt?: number }).rt = st.rt;
    let tr = this.tracks.get(pid);
    if (!tr) { tr = new Track(); this.tracks.set(pid, tr); }
    tr.push({ ...st, pid }, tm);
  }

  /** En gæst har skudt en blok i stykker */
  private breakBlock(x: number, y: number, z: number, from: number) {
    const w = this.h.world;
    if (![x, y, z].every(Number.isInteger)) return;
    const b = w.get(x, y, z);
    if (b === B.AIR || !isDestructible(b)) return;
    w.set(x, y, z, B.AIR);
    const e: HuntEvent = { type: 'blockBreak', x, y, z, block: b };
    this.broken.push([x, y, z]);
    this.h.emit(e); // til værtens egne effekter
    this.s.broadcast({ t: 'e', ev: [e] }, from);
  }

  /** Værtens egne hændelser: send dem videre (efter jagten er kørt frem) */
  outgoing(events: HuntEvent[]) {
    for (const e of events) {
      if (e.type === 'hurtRemote') { this.s.sendTo(e.pid, { t: 'hurt', dmg: e.dmg, knock: e.knock, cause: e.cause, giantId: e.giantId }); continue; }
      if (e.type === 'shot') { this.s.broadcast({ t: 'shot', pid: 0, f: t3(e.from), to: t3(e.to), w: e.weapon }); continue; }
      if (e.type === 'blockBreak' && !this.broken.some((c) => c[0] === e.x && c[1] === e.y && c[2] === e.z)) this.broken.push([e.x, e.y, e.z]);
      if (FORWARD.has(e.type)) this.batch.push(e);
    }
  }

  /** Send hændelser og (15 gange i sekundet) et øjebliksbillede */
  flush(dt: number) {
    if (this.batch.length) { this.s.broadcast({ t: 'e', ev: this.batch }); this.batch = []; }
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = SEND_EVERY;
    this.s.broadcast(this.snapshot() as unknown as NetMsg);
  }

  snapshot(): Snap {
    const h = this.h;
    const ps: PState[] = [localState(h)];
    for (const r of h.remotes) {
      const tr = this.tracks.get(r.pid)?.latest;
      if (tr) ps.push({ pid: r.pid, p: tr.p, v: tr.v, y: tr.y, pi: tr.pi, a: tr.a, hp: tr.hp, s: tr.s, og: tr.og, hk: tr.hk, rt: tr.rt });
    }
    return {
      t: 's', tm: r3(h.time), w: h.wave, ph: h.phase, pt: r2(h.phaseT), c: h.coins, sc: h.score, k: h.stats.kills, q: h.queued,
      up: h.up, g: h.gate ? [Math.round(h.gate.hp), h.gate.broken] : null, lr: h.lostReason, b: h.bonus,
      gs: h.giants.map((g) => g.toNet()),
      r: h.rocks.map((r) => [r.id, r2(r.pos.x), r2(r.pos.y), r2(r.pos.z), r.big ? 1 : 0]),
      ps,
    };
  }

  /** Medspillerne som de skal tegnes (bløde bevægelser) */
  /** Værtens egen hurtige besked */
  sendChat(i: number, pos: V3) { this.s.broadcast({ t: 'chat', pid: 0, i, p: t3(pos) }); }

  mates(dt: number): Mate[] {
    const out: Mate[] = [];
    for (const r of this.h.remotes) {
      const m = this.tracks.get(r.pid)?.sample(dt, r.name);
      if (m) out.push(m);
    }
    return out;
  }
}

// =====================================================================
// Gæsten
// =====================================================================

export class ClientSync {
  private buf: Snap[] = [];
  private clock = new RenderClock();
  private sendT = 0;
  private rocks = new Map<number, Rock>();
  /** Hændelser fra værten, som spillet skal vise/afspille (lægges sammen med gæstens egne) */
  incoming: HuntEvent[] = [];
  /** Sekunder siden sidste billede fra værten */
  silence = 0;
  private mateBuf: Mate[] = [];

  constructor(readonly s: CoopSession, readonly h: Hunt, readonly hooks: NetHooks) {}

  name(pid: number) { return this.s.players.find((p) => p.pid === pid)?.name ?? `Spiller ${pid + 1}`; }

  /** Beskeder fra værten. Returnerer en ny "start"-besked, hvis værten starter en ny jagt. */
  receive(dt: number): NetMsg | null {
    const h = this.h;
    this.silence += dt;
    const inbox = this.s.inbox.splice(0);
    for (let i = 0; i < inbox.length; i++) {
      const msg = inbox[i].msg;
      // Ny jagt fra værten: resten af beskederne hører til den nye jagt
      if (msg.t === 'start') { this.s.inbox.unshift(...inbox.slice(i + 1)); return msg; }
      switch (msg.t) {
        case 's': {
          const sn = msg as unknown as Snap;
          if (this.buf.length && sn.tm <= this.buf[this.buf.length - 1].tm) break;
          this.buf.push(sn);
          if (this.buf.length > 30) this.buf.shift();
          this.applyState(sn);
          this.silence = 0;
          break;
        }
        case 'e': for (const e of msg.ev as HuntEvent[]) { this.applyEvent(e); this.incoming.push(e); } break;
        case 'hurt': h.hurtPlayer(Number(msg.dmg) || 0, msg.knock, msg.cause, msg.giantId, false, h.localPid); break;
        case 'shot': this.hooks.remoteShot(msg.pid, v3(msg.f), v3(msg.to), msg.w); break;
        case 'buyr': this.hooks.shopReply(!!msg.ok, String(msg.msg)); break;
        case 'chat': if (Array.isArray(msg.p) && msg.i >= 0 && msg.i < QUICK_CHAT.length) this.hooks.chat(Number(msg.pid), Number(msg.i), v3(msg.p as T3)); break;
      }
    }
    return null;
  }

  /** Tal og tilstande der bare overtages (ingen glidning) */
  private applyState(sn: Snap) {
    const h = this.h;
    h.wave = sn.w;
    h.phase = sn.ph;
    h.phaseT = sn.pt;
    h.coins = sn.c;
    h.score = sn.sc;
    h.stats.kills = sn.k;
    h.netQueued = sn.q;
    h.lostReason = sn.lr;
    h.bonus = sn.b;
    for (const u of UPGRADES) this.setUpgrade(u.id, sn.up[u.id] ?? 0);
    if (sn.g && h.gate) h.setGateHp(sn.g[0], sn.g[1]);
    if (sn.ph === 'won' || sn.ph === 'lost') h.releaseHook();
  }

  private setUpgrade(id: UpgradeId, level: number) {
    if (level <= this.h.up[id]) return;
    this.h.up[id] = level;
    this.h.applyUpgradeLocal(id);
  }

  /** Hændelser der ændrer noget hos gæsten */
  private applyEvent(e: HuntEvent) {
    const h = this.h;
    switch (e.type) {
      case 'giantRemoved': h.giants = h.giants.filter((g) => g.id !== e.id); if (h.hook.giantId === e.id) h.releaseHook(); break;
      case 'won': h.phase = 'won'; h.releaseHook(); break;
      case 'lost': h.phase = 'lost'; h.lostReason = e.reason; h.releaseHook(); break;
      case 'gateHit': if (h.gate) { h.gate.lastHitT = h.time; h.setGateHp(e.hp, e.hp <= 0); } break;
      case 'gateRepair': h.setGateHp(e.hp, false); break;
      case 'upgrade': if (e.id !== 'repair') this.setUpgrade(e.id, e.level); break;
      case 'waveStart': h.wave = e.wave; h.phase = 'fight'; break;
      case 'waveClear': if (e.wave < h.waves.length) { h.phase = 'break'; h.phaseT = HUNT.breakTime; } break;
      case 'blockBreak': if (h.world.get(e.x, e.y, e.z) !== B.AIR) h.world.set(e.x, e.y, e.z, B.AIR); break;
    }
  }

  /** Gæstens egne hændelser: træf, skud og ødelagte blokke sendes til værten */
  outgoing(events: HuntEvent[]) {
    for (const e of events) {
      if (e.type === 'netHit') this.s.send({ t: 'hit', id: e.id, part: e.part, dmg: e.dmg, weak: e.weak });
      else if (e.type === 'shot') this.s.send({ t: 'shot', f: t3(e.from), to: t3(e.to), w: e.weapon });
      else if (e.type === 'blockBreak') this.s.send({ t: 'blk', x: e.x, y: e.y, z: e.z });
    }
  }

  /** Send egen position, og glid kæmper, sten og medspillere frem til "nu minus lidt" */
  update(dt: number) {
    const h = this.h;
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = STATE_EVERY; this.s.send({ t: 'p', tm: r3(h.time), st: localState(h) }); }
    if (h.phase === 'break') h.phaseT = Math.max(0, h.phaseT - dt);
    if (!this.buf.length) return;
    const t = this.clock.update(this.buf[this.buf.length - 1].tm, dt, 0.1);
    const [a, b, k] = bracket(this.buf, t);
    // Kæmper (samme objekter hele tiden – grafikken kender dem på objektet)
    const keep: Giant[] = [];
    for (const gb of b.gs) {
      const ga = a.gs.find((x) => x.id === gb.id) ?? null;
      let g = h.giants.find((x) => x.id === gb.id);
      if (!g) g = Giant.fromNet(gb);
      g.applyNet(gb, ga, ga ? k : 1);
      keep.push(g);
    }
    h.giants = keep;
    if (h.hook.giantId >= 0 && !keep.some((g) => g.id === h.hook.giantId && g.alive)) h.releaseHook();
    // Sten
    const rocks: Rock[] = [];
    for (const rb of b.r) {
      const ra = a.r.find((x) => x[0] === rb[0]);
      let r = this.rocks.get(rb[0]);
      if (!r) {
        r = { id: rb[0], pos: { x: rb[1], y: rb[2], z: rb[3] }, vel: { x: 0, y: 0, z: 0 }, age: 0, spin: { x: Math.random() * 8 - 4, y: Math.random() * 8 - 4, z: Math.random() * 8 - 4 }, big: rb[4] === 1, gate: false };
        this.rocks.set(rb[0], r);
      }
      r.pos = ra ? { x: lerp(ra[1], rb[1], k), y: lerp(ra[2], rb[2], k), z: lerp(ra[3], rb[3], k) } : { x: rb[1], y: rb[2], z: rb[3] };
      rocks.push(r);
    }
    for (const id of this.rocks.keys()) if (!rocks.some((r) => r.id === id)) this.rocks.delete(id);
    h.rocks = rocks;
    // Medspillere (værten og de andre gæster)
    this.mateBuf = [];
    for (const pb of b.ps) {
      if (pb.pid === h.localPid) continue;
      const pa = a.ps.find((x) => x.pid === pb.pid) ?? pb;
      this.mateBuf.push(toMate(pa, pb, k, this.name(pb.pid)));
    }
    h.remotes = this.mateBuf.map((m) => ({
      pid: m.pid, name: m.name, body: { pos: m.pos, vel: m.vel, onGround: m.onGround }, alive: m.alive, yaw: m.yaw, pitch: m.pitch, hp: m.hp, slot: m.slot, hookTip: m.hook,
    }));
  }

  mates(): Mate[] { return this.mateBuf; }

  sendChat(i: number, pos: V3) { this.s.send({ t: 'chat', i, p: t3(pos) }); }
}

/** Respawn-tid for en medspiller hos værten (gemt fra deres seneste besked) */
export const remoteRespawn = (r: object) => (r as { rt?: number }).rt ?? 0;
