// Ravnsdalen: banens opbygning, kæmpernes veje (også gennem floden), vand, vindmøller og bølger.
import { describe, expect, test } from 'vitest';
import { Hunt, VALLEY_WAVES, type HuntEvent } from '../src/hunt/hunt';
import { HUNT } from '../src/config/hunt';
import { bodyHitsWorld } from '../src/core/physics';
import { tfApply } from '../src/hunt/tf';
import { G, riverZ } from '../src/hunt/valley';

const valley = () => { const h = new Hunt(3, 'ravnsdalen'); h.phaseT = 1e9; return h; };
const sec = (h: Hunt, s: number, each?: (ev: HuntEvent[]) => void) => {
  for (let i = 0; i < Math.round(s / HUNT.dt); i++) { h.step(); const ev = h.drainEvents(); each?.(ev); }
};
const put = (h: Hunt, x: number, y: number, z: number) => {
  const p = h.player;
  p.body.pos = { x, y, z }; p.prevPos = { x, y, z }; p.body.vel = { x: 0, y: 0, z: 0 };
};

describe('Ravnsdalen', () => {
  test('banen er bygget rigtigt: startpunkt, porte, depoter', () => {
    const h = valley(), c = h.city;
    expect(c.world.sx).toBe(208);
    expect(h.world.solidAt(Math.floor(c.spawn.pos.x), c.spawn.pos.y - 1, Math.floor(c.spawn.pos.z))).toBe(true);
    expect(bodyHitsWorld(h.world, h.player.body)).toBe(false);
    for (const gt of c.gates) {
      expect(h.nav.walkable(Math.floor(gt.x), Math.floor(gt.z), 3)).toBe(true);
      // både almindelige kæmper (radius 3) og den store stenkæmpe (radius 4) kan nå pladsen foran Borgporten
      for (const r of [3, 4]) expect(h.nav.path(gt.x, gt.z, 104.5, 142, r)).not.toBeNull();
    }
    expect(c.depots.length).toBe(6);
    for (const d of c.depots) {
      expect(h.world.solidAt(Math.floor(d.pos.x), d.pos.y - 1, Math.floor(d.pos.z))).toBe(true);
      expect(h.world.solidAt(Math.floor(d.pos.x), d.pos.y, Math.floor(d.pos.z))).toBe(false);
    }
    expect(c.mills.length).toBe(3);
    expect(c.ceiling).toBeGreaterThan(50);
  });

  test('kæmper fra alle fire pas går kun på farbar grund og følger terrænet', () => {
    for (let gi = 0; gi < 4; gi++) {
      const h = valley();
      put(h, 104.5, G, 142);
      const gate = h.city.gates[gi];
      const g = h.spawnGiant({ scale: 1.1, hp: 99999, big: false });
      g.pos = { ...gate }; g.computeParts();
      let off = 0, yErr = 0, minY = 99;
      sec(h, 70, (ev) => {
        put(h, 104.5, G, 142); h.player.hp = 100;
        if (!h.nav.walkable(Math.floor(g.pos.x), Math.floor(g.pos.z), 1)) off++;
        const f = h.city.floor[Math.floor(g.pos.z) * 208 + Math.floor(g.pos.x)];
        yErr = Math.max(yErr, Math.abs(g.pos.y - f) > 0.6 && g.state === 'walk' ? Math.abs(g.pos.y - f) : 0);
        minY = Math.min(minY, g.pos.y); void ev;
      });
      expect(off, `port ${gi}`).toBe(0);
      expect(Math.hypot(g.pos.x - 104.5, g.pos.z - 142), `port ${gi}`).toBeLessThan(16);
      expect(yErr).toBeLessThan(1.01);
      if (gi === 0 || gi === 3) expect(minY, `port ${gi} vader over/op ad floden`).toBeLessThan(G - 0.5);
    }
  }, 30000);

  test('man vader i floden – det plasker og man bliver bremset', () => {
    const h = valley();
    const x = 140, z = riverZ(140);
    put(h, x + 0.5, 6, z);
    let splash = false;
    sec(h, 1, (ev) => { if (ev.some((e) => e.type === 'splash')) splash = true; });
    expect(splash).toBe(true);
    expect(h.inWater(h.player.body.pos)).toBe(true);
    h.input.fwd = 1;
    sec(h, 1);
    expect(Math.hypot(h.player.body.vel.x, h.player.body.vel.z)).toBeLessThan(HUNT.runSpeed * 0.8);
  });

  test('krogen kan sidde i en vindmøllevinge og bliver båret rundt', () => {
    const h = valley();
    const m = h.mills[0];
    const sail = m.parts[0].box;
    const target = tfApply(sail.tf, { x: 0, y: sail.h.y * 0.6, z: 0 });
    put(h, m.def.hub.x + 14, G, m.def.hub.z + 2);
    const e = h.eye(), p = h.player;
    p.yaw = Math.atan2(-(target.x - e.x), -(target.z - e.z));
    p.pitch = Math.atan2(target.y - e.y, Math.hypot(target.x - e.x, target.z - e.z));
    h.input.hook = true; h.input.hookPressed = true;
    sec(h, 0.3);
    expect(h.hook.state).toBe('attached');
    expect(h.hook.millId).toBe(m.id);
    const t0 = { ...h.hook.target };
    sec(h, 1);
    expect(Math.hypot(h.hook.target.y - t0.y, h.hook.target.z - t0.z)).toBeGreaterThan(1);
  });

  test('ingen flyvning gennem bjergene eller borgen i fuld fart', () => {
    for (const [sx, sy, sz, vx, vz] of [[30, 20, 100, -1, 0], [104, 30, 30, 0, -1], [180, 25, 150, 1, 0], [80, 20, 105, 1, 0]]) {
      const h = valley();
      put(h, sx, sy, sz);
      let inside = 0;
      for (let i = 0; i < 180; i++) {
        h.player.body.vel = { x: vx * HUNT.maxSpeed, y: 0, z: vz * HUNT.maxSpeed };
        h.step(); h.drainEvents();
        if (bodyHitsWorld(h.world, h.player.body)) inside++;
      }
      expect(inside).toBe(0);
    }
  });

  test('alle fem bølger kan gennemføres i dalen – til sidst kommer Bjergkæmpen gennem Den gamle port', () => {
    const h = new Hunt(5, 'ravnsdalen');
    const p = h.player;
    (h as unknown as { hurtPlayer: () => void }).hurtPlayer = () => {};
    put(h, 104.5, G, 142);
    let spawned = 0, mountainGate: { x: number; z: number } | null = null;
    for (let i = 0; i < 120 * 900 && h.phase !== 'won'; i++) {
      const g = h.giants.filter((x) => x.alive).sort((a, b) => Math.hypot(a.pos.x - p.body.pos.x, a.pos.z - p.body.pos.z) - Math.hypot(b.pos.x - p.body.pos.x, b.pos.z - p.body.pos.z))[0];
      if (g) {
        // Flyv hen bag kæmpen og skyd nakken
        const n = tfApply(g.part('nape').box.tf, { x: 0, y: 0, z: 0 });
        if (Math.hypot(g.pos.x - p.body.pos.x, g.pos.z - p.body.pos.z) > 30) {
          // et frit sted bag eller ved siden af kæmpen
          for (const a of [0, 0.8, -0.8, 1.6, -1.6, 3.1]) {
            const yaw = g.yaw + a;
            put(h, g.pos.x + Math.sin(yaw) * 10, g.pos.y + 0.01, g.pos.z + Math.cos(yaw) * 10);
            if (!bodyHitsWorld(h.world, p.body)) break;
          }
        }
        const e = h.eye();
        p.yaw = Math.atan2(-(n.x - e.x), -(n.z - e.z)); p.pitch = Math.atan2(n.y - e.y, Math.hypot(n.x - e.x, n.z - e.z));
        h.input.fire = true; h.input.firePressed = true;
      } else h.input.fire = false;
      if (p.primary!.reserve < 30) p.primary!.reserve = 150;
      if (bodyHitsWorld(h.world, p.body)) put(h, 104.5, G, 142);
      h.step();
      for (const e of h.drainEvents()) if (e.type === 'giantSpawn') { spawned++; if (e.variant === 'mountain') mountainGate = e.pos; }
    }
    if (h.phase !== 'won') console.log('t', h.time.toFixed(0), 'wave', h.wave, h.giants.map((g) => `${g.state} ${g.pos.x.toFixed(0)},${g.pos.y.toFixed(1)},${g.pos.z.toFixed(0)} hp${g.hp}`).join(' | '), 'pl', JSON.stringify(p.body.pos), JSON.stringify(h.stats));
    expect(h.phase).toBe('won');
    expect(spawned).toBe(VALLEY_WAVES.reduce((a, w) => a + w.length, 0));
    expect(VALLEY_WAVES.length).toBe(5);
    expect(mountainGate).toEqual({ x: h.city.gates[0].x, z: h.city.gates[0].z, y: h.city.gates[0].y });
    expect(h.gate!.broken).toBe(false);
  }, 60000);

  test('kæmperne går efter Borgporten og slår huller i den – falder den, er dalen tabt', () => {
    const h = valley();
    put(h, 104.5, 46, 105.5); // oppe på borgtårnet, langt fra porten
    const g = h.spawnGiant({ scale: 1.1, hp: 99999, big: false });
    let hits = 0, lost: HuntEvent | undefined;
    const gateBlocks = () => h.city.gate!.cells.filter(([x, y, z]) => h.world.solidAt(x, y, z)).length;
    const before = gateBlocks();
    for (let i = 0; i < 120 * 400 && h.phase !== 'lost'; i++) {
      h.step();
      for (const e of h.drainEvents()) { if (e.type === 'gateHit') hits++; if (e.type === 'lost') lost = e; }
      h.player.hp = 100;
    }
    expect(g.target).toBe('gate');
    expect(hits).toBeGreaterThan(5);
    expect(h.gate!.broken).toBe(true);
    expect(gateBlocks()).toBeLessThan(before);
    expect(h.phase).toBe('lost');
    expect(h.lostReason).toBe('gate');
    expect(lost && lost.type === 'lost' && lost.reason).toBe('gate');
  }, 30000);

  test('skud trækker en kæmpe væk fra porten', () => {
    const h = valley();
    put(h, 104.5, 46, 105.5);
    const g = h.spawnGiant({ scale: 1.1, hp: 99999, big: false });
    sec(h, 4);
    expect(g.target).toBe('gate');
    g.takeDamage(h, 10, 'torso');
    sec(h, 0.5);
    expect(g.target).toBe('player');
  });

  test('porten repareres mellem bølgerne, og dagen går mod nat', () => {
    const h = new Hunt(3, 'ravnsdalen');
    expect(h.dayTime()).toBe(0);
    h.gate!.hp = 800;
    h.phaseT = 0.01; sec(h, 0.05); // bølge 1 starter
    expect(h.wave).toBe(1);
    for (const g of h.giants) g.takeDamage(h, 99999, 'nape');
    sec(h, 0.5);
    expect(h.phase).toBe('break');
    expect(h.gate!.hp).toBeGreaterThan(800);
    const t0 = h.dayTime();
    sec(h, 5);
    expect(h.dayTime()).toBeGreaterThan(t0);
    // sidste bølge = nat
    h.wave = 5; h.phase = 'fight';
    expect(h.dayTime()).toBe(4);
  });
});
