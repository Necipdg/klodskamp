// Co-op over "nettet" uden net: en vært og en gæst forbundet med en falsk forbindelse (JSON frem og tilbage, som WebRTC).
import { describe, expect, test } from 'vitest';
import { Hunt, type HuntEvent } from '../src/hunt/hunt';
import { HUNT } from '../src/config/hunt';
import { tfApply } from '../src/hunt/tf';
import { ClientSync, HostSync, type NetHooks } from '../src/net/sync';
import type { CoopSession, Inbound, LobbyPlayer, NetMsg } from '../src/net/coop';

class FakeSession {
  inbox: Inbound[] = [];
  peer: FakeSession | null = null;
  players: LobbyPlayer[] = [{ pid: 0, name: 'Far' }, { pid: 1, name: 'Ida' }];
  config = { map: 'bastionen', diff: 'normal' };
  started = true;
  constructor(readonly role: 'host' | 'client', readonly pid: number) {}
  private deliver(msg: NetMsg) { this.peer!.inbox.push({ from: this.pid, msg: JSON.parse(JSON.stringify(msg)) }); }
  broadcast(msg: NetMsg, except = -1) { if (except !== 1) this.deliver(msg); }
  sendTo(pid: number, msg: NetMsg) { if (pid === 1) this.deliver(msg); }
  send(msg: NetMsg) { this.deliver(msg); }
  kick() {}
}

const hooks = (): NetHooks & { shots: number; replies: string[] } => {
  const o = { shots: 0, replies: [] as string[], remoteShot() { o.shots++; }, shopReply(_ok: boolean, m: string) { o.replies.push(m); }, note() {} };
  return o;
};

function pair() {
  const hs = new FakeSession('host', 0), cs = new FakeSession('client', 1);
  hs.peer = cs; cs.peer = hs;
  const host = new Hunt(7, 'bastionen'); host.role = 'host'; host.hpScale = 1.3;
  const guest = new Hunt(7, 'bastionen'); guest.role = 'client'; guest.localPid = 1;
  const hh = hooks(), ch = hooks();
  const hsync = new HostSync(hs as unknown as CoopSession, host, hh);
  const csync = new ClientSync(cs as unknown as CoopSession, guest, ch);
  const guestEvents: HuntEvent[] = [];
  /** Kør begge frem i s sekunder (60 billeder i sekundet, som i browseren) */
  const run = (s: number, each?: () => void) => {
    const dt = 1 / 60;
    let accH = 0, accC = 0;
    for (let i = 0; i < Math.round(s * 60); i++) {
      each?.();
      hsync.receive();
      for (accH += dt; accH >= HUNT.dt; accH -= HUNT.dt) host.step();
      const he = host.drainEvents();
      hsync.outgoing(he);
      hsync.flush(dt);
      csync.receive(dt);
      for (accC += dt; accC >= HUNT.dt; accC -= HUNT.dt) guest.step();
      const ce = guest.drainEvents();
      csync.outgoing(ce);
      csync.update(dt);
      guestEvents.push(...ce, ...csync.incoming.splice(0));
    }
  };
  return { host, guest, hsync, csync, run, guestEvents, hh, ch };
}

describe('Co-op: vært og gæst', () => {
  test('gæsten ser værtens bølge og kæmper, og værten ser gæsten', () => {
    const { host, guest, run, guestEvents, hsync } = pair();
    host.phaseT = 0.3;
    run(3);
    expect(host.wave).toBe(1);
    expect(guest.wave).toBe(1);
    expect(guest.phase).toBe('fight');
    expect(guestEvents.some((e) => e.type === 'waveStart')).toBe(true);
    expect(guestEvents.some((e) => e.type === 'giantSpawn')).toBe(true);
    expect(guest.giants.length).toBe(host.giants.length);
    expect(guest.giants[0].id).toBe(host.giants[0].id);
    // Gæsten tegnes lidt bagud – men tæt på værtens kæmpe
    const d = Math.hypot(guest.giants[0].pos.x - host.giants[0].pos.x, guest.giants[0].pos.z - host.giants[0].pos.z);
    expect(d).toBeLessThan(2);
    // Værten kender gæstens position (til kæmpernes sigte) og kan tegne den
    expect(host.remotes.length).toBe(1);
    expect(host.remotes[0].name).toBe('Ida');
    expect(Math.hypot(host.remotes[0].body.pos.x - guest.player.body.pos.x, host.remotes[0].body.pos.z - guest.player.body.pos.z)).toBeLessThan(0.5);
    expect(hsync.mates(1 / 60).length).toBe(1);
  });

  test('gæstens skud i nakken skader værtens kæmpe og giver fælles mønter', () => {
    const { host, guest, run } = pair();
    host.phaseT = 0.1;
    run(1.5);
    const hg = host.giants[0];
    // Flyt kæmpen ud på en åben plads (væk fra porten og bymuren)
    hg.pos = { x: 51.5, y: 1, z: 70.5 }; hg.yaw = 0; hg.state = 'walk'; hg.stateT = 0; hg.computeParts();
    run(0.4);
    const hp0 = hg.hp, coins0 = host.coins;
    // Sigt på nakken hos gæstens udgave af kæmpen og skyd én gang
    let fired = false;
    run(0.6, () => {
      const g = guest.giants[0];
      guest.input.fire = false;
      if (!g || fired) return;
      const nape = g.part('nape').box;
      const tgt = tfApply(nape.tf, { x: 0, y: 0, z: 0 });
      const p = guest.player;
      p.body.pos = { x: tgt.x + Math.sin(g.yaw) * 8, y: tgt.y + 3, z: tgt.z + Math.cos(g.yaw) * 8 }; // bag kæmpen p.prevPos = { ...p.body.pos }; p.body.vel = { x: 0, y: 0, z: 0 };
      const e = guest.eye();
      p.yaw = Math.atan2(-(tgt.x - e.x), -(tgt.z - e.z));
      p.pitch = Math.atan2(tgt.y - e.y, Math.hypot(tgt.x - e.x, tgt.z - e.z));
      (guest as unknown as { spreadDeg: () => number }).spreadDeg = () => 0;
      guest.input.fire = true; guest.input.firePressed = true;
      fired = true;
    });
    expect(hg.hp).toBeLessThan(hp0);
    expect(host.coins).toBeGreaterThan(coins0);
    expect(guest.coins).toBe(host.coins);
  });

  test('kæmpens slag mod gæsten gør skade hos gæsten', () => {
    const { host, guest, run } = pair();
    host.phaseT = 0.1;
    run(1.2);
    const g = host.giants[0];
    // Stil gæsten lige foran kæmpen og lad kæmpen gå efter den
    const fx = -Math.sin(g.yaw), fz = -Math.cos(g.yaw);
    host.player.body.pos = { x: 10.5, y: 1, z: 10.5 };
    host.player.alive = false; host.respawnT = 1e9; // værten er "nede", så kæmpen kun har gæsten
    const place = () => {
      const p = guest.player;
      p.body.pos = { x: g.pos.x + fx * 4, y: g.pos.y, z: g.pos.z + fz * 4 }; p.body.vel = { x: 0, y: 0, z: 0 };
      if (p.hp < 40) p.hp = 100;
    };
    let hurt = 0;
    const ev: HuntEvent[] = [];
    run(8, () => { place(); ev.push(...guest.events); });
    hurt = guest.stats.damageTaken;
    expect(hurt).toBeGreaterThan(0);
  });

  test('gæsten køber en opgradering: værten trækker mønterne, begge får niveauet', () => {
    const { host, guest, run, csync, ch } = pair();
    host.coins = 500;
    run(0.3);
    expect(guest.coins).toBe(500);
    csync.s.send({ t: 'buy', id: 'gas' });
    run(0.3);
    expect(host.up.gas).toBe(1);
    expect(guest.up.gas).toBe(1);
    expect(guest.coins).toBe(host.coins);
    expect(host.coins).toBeLessThan(500);
    expect(guest.gas).toBe(guest.maxGas);
    expect(ch.replies.length).toBe(1);
  });

  test('en blok gæsten skyder i stykker, forsvinder også hos værten', () => {
    const { host, guest, run } = pair();
    run(0.2);
    // Find en ødelæggelig blok og lad gæsten "skyde" den i stykker
    const w = guest.world;
    let found: [number, number, number] | null = null;
    for (let x = 0; x < w.sx && !found; x++) for (let z = 0; z < w.sz && !found; z++) for (let y = 1; y < 12 && !found; y++) {
      if (w.get(x, y, z) !== 0 && isDestr(w.get(x, y, z))) found = [x, y, z];
    }
    expect(found).not.toBeNull();
    const [x, y, z] = found!;
    const b = w.get(x, y, z);
    w.set(x, y, z, 0);
    guest.emit({ type: 'blockBreak', x, y, z, block: b });
    run(0.2);
    expect(host.world.get(x, y, z)).toBe(0);
  });

  test('falder alle, er jagten tabt – også hos gæsten', () => {
    const { host, guest, run, guestEvents } = pair();
    host.phaseT = 0.1;
    run(0.5);
    guest.hurtPlayer(999, null, 'slag', -1, true);
    expect(guest.player.alive).toBe(false);
    expect(guest.phase).not.toBe('lost');
    run(0.3);
    expect(host.remotes[0].alive).toBe(false);
    host.hurtPlayer(999, null, 'slag', -1, true);
    run(0.3);
    expect(host.phase).toBe('lost');
    expect(guest.phase).toBe('lost');
    expect(guestEvents.some((e) => e.type === 'lost')).toBe(true);
  });
});

import { isDestructible } from '../src/core/blocks';
const isDestr = (b: number) => isDestructible(b);
