// Saltvig (v0.9): havnebyen i fjorden. Banens opbygning, kæmpernes veje (også gennem vandet fra havet),
// svømning i dybt vand, skibsmaster som ankerpunkter, Rådhusporten og alle fem bølger.
import { describe, expect, test } from 'vitest';
import { Hunt, HARBOR_WAVES, type HuntEvent } from '../src/hunt/hunt';
import { HUNT } from '../src/config/hunt';
import { B } from '../src/core/blocks';
import { bodyHitsWorld } from '../src/core/physics';
import { tfApply } from '../src/hunt/tf';
import { HG as G } from '../src/hunt/harbor';

const harbor = () => { const h = new Hunt(3, 'saltvig'); h.phaseT = 1e9; return h; };
const sec = (h: Hunt, s: number, each?: (ev: HuntEvent[]) => void) => {
  for (let i = 0; i < Math.round(s / HUNT.dt); i++) { h.step(); const ev = h.drainEvents(); each?.(ev); }
};
const put = (h: Hunt, x: number, y: number, z: number) => {
  const p = h.player;
  p.body.pos = { x, y, z }; p.prevPos = { x, y, z }; p.body.vel = { x: 0, y: 0, z: 0 };
};

describe('Saltvig', () => {
  test('banen er bygget rigtigt: startpunkt, porte, depoter, Rådhusporten', () => {
    const h = harbor(), c = h.city;
    expect(c.world.sx).toBe(192);
    expect(c.name).toBe('Saltvig');
    expect(h.world.solidAt(Math.floor(c.spawn.pos.x), c.spawn.pos.y - 1, Math.floor(c.spawn.pos.z))).toBe(true);
    expect(bodyHitsWorld(h.world, h.player.body)).toBe(false);
    expect(c.gate!.name).toBe('Rådhusporten');
    expect(c.gate!.cells.length).toBeGreaterThan(40);
    for (const [x, y, z] of c.gate!.cells) expect(h.world.solidAt(x, y, z)).toBe(true);
    const a = c.gate!.attack;
    for (const gt of c.gates) {
      expect(h.nav.walkable(Math.floor(gt.x), Math.floor(gt.z), 3), `port ${JSON.stringify(gt)}`).toBe(true);
      // både almindelige kæmper (radius 3) og de store (radius 4) kan nå pladsen foran Rådhusporten
      for (const r of [3, 4]) expect(h.nav.path(gt.x, gt.z, a.x, a.z, r), `port ${gt.x},${gt.z} r${r}`).not.toBeNull();
    }
    expect(c.water![Math.floor(c.gates[0].z) * 192 + Math.floor(c.gates[0].x)]).toBe(1); // havporten ligger i vandet
    expect(c.depots.length).toBe(6);
    for (const d of c.depots) {
      expect(h.world.solidAt(Math.floor(d.pos.x), d.pos.y - 1, Math.floor(d.pos.z)), `depot ${d.id}`).toBe(true);
      expect(h.world.solidAt(Math.floor(d.pos.x), d.pos.y, Math.floor(d.pos.z)), `depot ${d.id}`).toBe(false);
    }
    expect(c.mills.length).toBe(1);
    expect(c.dayCycle).toBe(true);
    expect(h.waves.length).toBe(5);
  });

  test('kæmper fra havet vader ind gennem sundet og når frem til torvet', () => {
    const h = harbor();
    put(h, 96.5, G + 13, 131.5); // langt væk på Rådhusets tag – kæmpen går efter porten
    const g = h.spawnGiant({ scale: 1.1, hp: 99999, big: false, gate: 0 });
    let off = 0, minY = 99, wetSteps = 0;
    sec(h, 90, (ev) => {
      h.player.hp = 100;
      if (!h.nav.walkable(Math.floor(g.pos.x), Math.floor(g.pos.z), 1)) off++;
      minY = Math.min(minY, g.pos.y);
      for (const e of ev) if (e.type === 'giantStep' && e.wet) wetSteps++;
    });
    expect(off).toBe(0);
    expect(minY).toBeLessThan(G - 2); // vader i dybt vand
    expect(wetSteps).toBeGreaterThan(3);
    const a = h.city.gate!.attack;
    expect(Math.hypot(g.pos.x - a.x, g.pos.z - a.z)).toBeLessThan(12);
  }, 30000);

  test('kæmper fra alle tre pas går kun på farbar grund', () => {
    for (const gi of [1, 2, 3]) {
      const h = harbor();
      put(h, 96.5, G + 13, 131.5);
      const gt = h.city.gates[gi];
      const g = h.spawnGiant({ scale: 1.1, hp: 99999, big: false, gate: gi });
      let off = 0;
      sec(h, 70, () => { h.player.hp = 100; if (!h.nav.walkable(Math.floor(g.pos.x), Math.floor(g.pos.z), 1)) off++; });
      expect(off, `port ${gi}`).toBe(0);
      expect(Math.hypot(g.pos.x - gt.x, g.pos.z - gt.z), `port ${gi} er gået`).toBeGreaterThan(30);
    }
  }, 30000);

  test('i dybt vand flyder man op og svømmer med hovedet over vandet', () => {
    const h = harbor();
    // dybt vand midt i bugten (vest for det store skib)
    let spot: { x: number; z: number } | null = null;
    for (let x = 70; x < 100 && !spot; x++) if (h.city.floor[55 * 192 + x] === G - 3) spot = { x, z: 55 };
    expect(spot).not.toBeNull();
    put(h, spot!.x + 0.5, G - 3, spot!.z + 0.5);
    sec(h, 2);
    expect(h.inWater(h.player.body.pos)).toBe(true);
    expect(h.eye().y).toBeGreaterThan(h.city.waterY);
    h.input.fwd = 1;
    sec(h, 1);
    expect(Math.hypot(h.player.body.vel.x, h.player.body.vel.z)).toBeLessThan(HUNT.runSpeed * 0.8);
  });

  test('krogen kan sidde i masten på et skib', () => {
    const h = harbor();
    // Find den højeste mast-blok (træstamme) på det store skib
    let top: { x: number; y: number; z: number } | null = null;
    for (let z = 47; z <= 72; z++) for (let y = 40; y > G; y--) if (h.world.get(112, y, z) === B.LOG) { if (!top || y > top.y) top = { x: 112, y, z }; break; }
    expect(top).not.toBeNull();
    expect(top!.y).toBeGreaterThan(G + 20);
    put(h, 96.5, G, 96.5); // på kajen ved torvet
    const t = { x: top!.x + 0.5, y: top!.y - 3 + 0.5, z: top!.z + 0.5 };
    const e = h.eye(), p = h.player;
    p.yaw = Math.atan2(-(t.x - e.x), -(t.z - e.z));
    p.pitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z));
    h.input.hook = true; h.input.hookPressed = true;
    sec(h, 0.6);
    expect(h.hook.state).toBe('attached');
    expect(Math.hypot(h.hook.target.x - t.x, h.hook.target.z - t.z)).toBeLessThan(3);
  });

  test('kæmperne slår Rådhusporten i stykker, hvis ingen forsvarer den', () => {
    const h = harbor();
    h.spawnGiant({ scale: 1.1, hp: 99999, big: false, gate: 3 });
    let hits = 0;
    for (let i = 0; i < 120 * 300 && h.phase !== 'lost'; i++) {
      put(h, 30.5, G + 30, 160.5); // langt væk (svæver), så kæmpen ikke skifter til spilleren
      h.step();
      for (const e of h.drainEvents()) if (e.type === 'gateHit') hits++;
      h.player.hp = 100;
    }
    expect(hits).toBeGreaterThan(5);
    expect(h.phase).toBe('lost');
    expect(h.lostReason).toBe('gate');
  }, 30000);

  test('alle fem bølger kan gennemføres – til sidst stiger Havkæmpen op af sundet', () => {
    const h = new Hunt(5, 'saltvig');
    const p = h.player;
    (h as unknown as { hurtPlayer: () => void }).hurtPlayer = () => {};
    let spawned = 0, seaGate: { x: number; z: number } | null = null;
    for (let i = 0; i < 120 * 900 && h.phase !== 'won'; i++) {
      const g = h.giants.filter((x) => x.alive).sort((a, b) => Math.hypot(a.pos.x - p.body.pos.x, a.pos.z - p.body.pos.z) - Math.hypot(b.pos.x - p.body.pos.x, b.pos.z - p.body.pos.z))[0];
      if (g) {
        const n = tfApply(g.part('nape').box.tf, { x: 0, y: 0, z: 0 });
        if (Math.hypot(g.pos.x - p.body.pos.x, g.pos.z - p.body.pos.z) > 30) {
          // et frit sted i luften bag kæmpen
          for (const a of [0, 0.8, -0.8, 1.6, -1.6, 3.1]) {
            const yaw = g.yaw + a;
            put(h, g.pos.x + Math.sin(yaw) * 10, Math.max(G, g.pos.y) + 6, g.pos.z + Math.cos(yaw) * 10);
            if (!bodyHitsWorld(h.world, p.body)) break;
          }
        }
        const e = h.eye();
        p.yaw = Math.atan2(-(n.x - e.x), -(n.z - e.z)); p.pitch = Math.atan2(n.y - e.y, Math.hypot(n.x - e.x, n.z - e.z));
        p.body.vel = { x: 0, y: 0, z: 0 };
        h.input.fire = true; h.input.firePressed = true;
      } else h.input.fire = false;
      if (p.primary!.reserve < 30) p.primary!.reserve = 150;
      if (bodyHitsWorld(h.world, p.body)) put(h, 96.5, G + 13, 131.5);
      h.step();
      for (const e of h.drainEvents()) if (e.type === 'giantSpawn') { spawned++; if (e.variant === 'sea') seaGate = e.pos; }
    }
    if (h.phase !== 'won') console.log('t', h.time.toFixed(0), 'wave', h.wave, h.giants.map((g) => `${g.variant} ${g.state} ${g.pos.x.toFixed(0)},${g.pos.y.toFixed(1)},${g.pos.z.toFixed(0)} hp${g.hp}`).join(' | '));
    expect(h.phase).toBe('won');
    expect(spawned).toBe(HARBOR_WAVES.reduce((a, w) => a + w.length, 0));
    expect(seaGate).toEqual(h.city.gates[0]);
    expect(h.gate!.broken).toBe(false);
  }, 90000);
});
