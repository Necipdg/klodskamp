// Co-op Kæmpejagt (v1.1): flere spillere i samme jagt. Værten kører kæmperne; gæster sender deres position og træf.
import { describe, expect, test } from 'vitest';
import { Hunt, type HuntEvent, type RemotePlayer } from '../src/hunt/hunt';
import { HUNT } from '../src/config/hunt';
import { Giant } from '../src/hunt/giant';
import { tfApply } from '../src/hunt/tf';

const sec = (h: Hunt, s: number, each?: (ev: HuntEvent[]) => void) => {
  for (let i = 0; i < Math.round(s / HUNT.dt); i++) { h.step(); const ev = h.drainEvents(); each?.(ev); }
};
const put = (h: Hunt, x: number, y: number, z: number) => {
  const p = h.player;
  p.body.pos = { x, y, z }; p.prevPos = { x, y, z }; p.body.vel = { x: 0, y: 0, z: 0 };
};
const remote = (pid: number, x: number, y: number, z: number): RemotePlayer => ({
  pid, name: `Spiller ${pid}`, body: { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, onGround: true },
  alive: true, yaw: 0, pitch: 0, hp: 100, slot: 'primary', hookTip: null,
});
const host = () => { const h = new Hunt(1); h.role = 'host'; h.phaseT = 1e9; return h; };
const giantAt = (h: Hunt, x: number, z: number, yaw = 0) => {
  const g = h.spawnGiant({ scale: 1, hp: HUNT.giantHp, big: false });
  g.pos = { x, y: 1, z }; g.yaw = yaw; g.state = 'walk'; g.stateT = 0;
  g.computeParts();
  return g;
};

describe('Co-op: værten', () => {
  test('kæmpen går efter den nærmeste spiller – også en medspiller', () => {
    const h = host();
    put(h, 20.5, 1, 90.5); // langt væk
    const r = remote(1, 45.5, 1, 45.5);
    h.remotes.push(r);
    const g = giantAt(h, 51.5, 70.5);
    const d0 = Math.hypot(g.pos.x - r.body.pos.x, g.pos.z - r.body.pos.z);
    sec(h, 6, () => { h.player.hp = 100; });
    expect(g.focusPid).toBe(1);
    expect(Math.hypot(g.pos.x - r.body.pos.x, g.pos.z - r.body.pos.z)).toBeLessThan(d0 - 5);
  });

  test('et slag mod en medspiller sendes som skade til vedkommende – værtens liv er urørt', () => {
    const h = host();
    put(h, 20.5, 1, 90.5);
    const r = remote(2, 51.5, 1, 47);
    h.remotes.push(r);
    giantAt(h, 51.5, 40, Math.PI); // kigger mod +z (mod medspilleren)
    let remoteHurt = 0;
    sec(h, 8, (ev) => { for (const e of ev) if (e.type === 'hurtRemote' && e.pid === 2) remoteHurt += e.dmg; });
    expect(remoteHurt).toBeGreaterThan(0);
    expect(h.player.hp).toBe(100);
  });

  test('falder værten, er jagten ikke tabt – man kommer tilbage efter et øjeblik', () => {
    const h = host();
    h.remotes.push(remote(1, 45.5, 1, 45.5));
    const evs: string[] = [];
    h.hurtPlayer(999, null, 'slag', -1, true);
    sec(h, 0.1, (ev) => evs.push(...ev.map((e) => e.type)));
    expect(h.player.alive).toBe(false);
    expect(h.phase).not.toBe('lost');
    sec(h, HUNT.respawnTime + 0.5, (ev) => evs.push(...ev.map((e) => e.type)));
    expect(h.player.alive).toBe(true);
    expect(h.player.hp).toBe(100);
    expect(evs).toContain('respawn');
    expect(Math.hypot(h.player.body.pos.x - h.city.spawn.pos.x, h.player.body.pos.z - h.city.spawn.pos.z)).toBeLessThan(1);
  });

  test('er alle spillere nede på samme tid, er jagten tabt', () => {
    const h = host();
    const r = remote(1, 45.5, 1, 45.5);
    h.remotes.push(r);
    r.alive = false;
    h.hurtPlayer(999, null, 'slag', -1, true);
    sec(h, 0.1);
    expect(h.phase).toBe('lost');
  });

  test('en gæsts træf gør skade hos værten, giver holdet mønter og trækker kæmpen mod gæsten', () => {
    const h = host();
    put(h, 20.5, 1, 90.5);
    h.remotes.push(remote(3, 45.5, 1, 45.5));
    const g = giantAt(h, 51.5, 70.5);
    const hp0 = g.hp;
    h.applyRemoteHit(3, g.id, 'nape', 200, true);
    expect(g.hp).toBe(hp0 - 200);
    expect(h.coins).toBeGreaterThan(0);
    sec(h, 0.3);
    expect(g.focusPid).toBe(3);
    h.applyRemoteHit(3, g.id, 'torso', 99999, false);
    expect(g.alive).toBe(false);
    expect(h.stats.kills).toBe(1);
  });

  test('flere spillere giver kæmperne mere liv', () => {
    const a = host(), b = host();
    b.hpScale = 1 + HUNT.coopHpPerPlayer * 2;
    const ga = a.spawnGiant({ scale: 1, hp: 1000, big: false }), gb = b.spawnGiant({ scale: 1, hp: 1000, big: false });
    expect(gb.maxHp).toBe(Math.round(ga.maxHp * 1.6));
  });
});

describe('Co-op: gæsten', () => {
  test('gæsten kører ingen bølger eller kæmper selv, og et træf sendes til værten i stedet for at gøre skade', () => {
    const h = new Hunt(1); h.role = 'client'; h.localPid = 1; h.phaseT = 0.01;
    sec(h, 2);
    expect(h.wave).toBe(0); // bølgerne kommer fra værten
    // En kæmpe som værten har sendt
    const src = new Giant({ x: 51.5, y: 1, z: 40 }, Math.PI, 1, 1000);
    src.state = 'walk'; src.computeParts();
    const g = Giant.fromNet(src.toNet());
    h.giants.push(g);
    const target = tfApply(g.part('torso').box.tf, { x: 0, y: 0, z: g.part('torso').box.h.z });
    put(h, 51.5, 10, 31);
    const e = h.eye(), p = h.player;
    p.yaw = Math.atan2(-(target.x - e.x), -(target.z - e.z));
    p.pitch = Math.atan2(target.y - e.y, Math.hypot(target.x - e.x, target.z - e.z));
    (h as unknown as { spreadDeg: () => number }).spreadDeg = () => 0;
    h.input.fire = true; h.input.firePressed = true;
    const evs: HuntEvent[] = [];
    for (let i = 0; i < 3; i++) { h.step(); evs.push(...h.drainEvents()); }
    const net = evs.find((x) => x.type === 'netHit') as Extract<HuntEvent, { type: 'netHit' }> | undefined;
    expect(net).toBeDefined();
    expect(net!.id).toBe(src.id);
    expect(g.hp).toBe(1000); // skaden regnes hos værten
  });

  test('kæmpen genskabes præcist fra værtens øjebliksbillede (samme hitbokse)', () => {
    const g = new Giant({ x: 40.5, y: 1, z: 50 }, 0.7, 1.1, 1200, false, 'runner');
    g.state = 'windLeap'; g.stateT = 0.4; g.computeParts();
    const c = Giant.fromNet(g.toNet());
    expect(c.id).toBe(g.id);
    for (const part of g.parts) {
      const q = c.part(part.kind).box;
      expect(Math.hypot(q.tf.t.x - part.box.tf.t.x, q.tf.t.y - part.box.tf.t.y, q.tf.t.z - part.box.tf.t.z)).toBeLessThan(0.05);
    }
  });

  test('porten fra værtens billede: huller og fald', () => {
    const h = new Hunt(1, 'ravnsdalen'); h.role = 'client';
    const solid = () => h.city.gate!.cells.filter(([x, y, z]) => h.world.solidAt(x, y, z)).length;
    const all = solid();
    h.setGateHp(h.gate!.maxHp * 0.5, false);
    expect(solid()).toBeLessThan(all);
    h.setGateHp(0, true);
    expect(solid()).toBe(0);
  });
});
