// Nye kæmpetyper (v0.8): løberkæmpen (hurtig, springer) og kasteren (bliver på afstand, kaster klippeblokke – også mod porten).
import { describe, expect, test } from 'vitest';
import { Hunt, WAVES, VALLEY_WAVES, type HuntEvent } from '../src/hunt/hunt';
import { HUNT } from '../src/config/hunt';
import { lineOfSight } from '../src/core/ray';
import type { GiantVariant } from '../src/hunt/giant';

const sec = (h: Hunt, s: number, each?: (ev: HuntEvent[]) => void) => {
  for (let i = 0; i < Math.round(s / HUNT.dt); i++) { h.step(); const ev = h.drainEvents(); each?.(ev); }
};
const put = (h: Hunt, x: number, y: number, z: number) => {
  const p = h.player;
  p.body.pos = { x, y, z }; p.prevPos = { x, y, z }; p.body.vel = { x: 0, y: 0, z: 0 }; p.body.onGround = true;
};
/** Et åbent, fladt stykke på mindst `len` m i z-retningen (til spring- og kastetests) */
const openRun = (h: Hunt, len: number) => {
  const sx = h.world.sx;
  for (let z = 8; z < h.world.sz - len - 8; z += 2) for (let x = 8; x < sx - 8; x += 2) {
    const f = h.city.floor[z * sx + x];
    let ok = f >= 0;
    for (let k = 0; k <= len && ok; k++) ok = h.nav.walkable(x, z + k, 3) && h.city.floor[(z + k) * sx + x] === f && !(h.city.water?.[(z + k) * sx + x]);
    if (ok && lineOfSight(h.world, { x: x + 0.5, y: f + 1, z: z + 0.5 }, { x: x + 0.5, y: f + 1, z: z + len + 0.5 })) return { x, z, y: f };
  }
  throw new Error('intet åbent stykke');
};
const calm = (seed = 1, map: 'bastionen' | 'ravnsdalen' = 'bastionen') => { const h = new Hunt(seed, map); h.phaseT = 1e9; return h; };
const spawn = (h: Hunt, variant: GiantVariant, x: number, z: number, hp = 99999) => {
  const g = h.spawnGiant({ scale: 1, hp, big: false, variant });
  g.pos = { x, y: h.city.floor[Math.floor(z) * h.world.sx + Math.floor(x)], z }; g.state = 'walk'; g.stateT = 0;
  g.computeParts();
  return g;
};

describe('Løberkæmpen', () => {
  test('er hurtigere end en almindelig kæmpe og lavere', () => {
    const run = (v: GiantVariant) => {
      const h = calm(4, 'ravnsdalen');
      const o = openRun(h, 60);
      put(h, o.x + 0.5, o.y, o.z + 0.5);
      const g = spawn(h, v, o.x + 0.5, o.z + 60.5);
      (h as unknown as { hurtPlayer: () => void }).hurtPlayer = () => {};
      // Stop springet, så vi kun måler gang
      const before = { ...g.pos };
      sec(h, 4, () => { put(h, o.x + 0.5, o.y, o.z + 0.5); (g as unknown as { leapCd: number }).leapCd = 99; });
      return { d: Math.hypot(g.pos.x - before.x, g.pos.z - before.z), height: g.height };
    };
    const clay = run('clay'), runner = run('runner');
    expect(runner.d).toBeGreaterThan(clay.d * 1.6);
    expect(runner.height).toBeLessThan(clay.height + 0.5);
  });

  test('springer mod en spiller på åben grund, varsler først – og rammer kun den, der bliver stående', () => {
    const run = (dodge: boolean) => {
      const h = new Hunt(2, 'ravnsdalen'); h.phaseT = 1e9;
      const field = openRun(h, 34);
      put(h, field.x + 0.5, field.y, field.z + 0.5);
      const g = spawn(h, 'runner', field.x + 0.5, field.z + 32.5);
      let windup = false, leapT = -1, hurt = 0, landed = false, landDist = 99;
      for (let i = 0; i < 120 * 10 && !landed; i++) {
        h.step();
        for (const e of h.drainEvents()) {
          if (e.type === 'giantWindup' && e.kind === 'leap') windup = true;
          if (e.type === 'hurt') hurt += e.dmg;
        }
        if (g.state === 'leap' && leapT < 0) { leapT = h.time; if (dodge) put(h, h.player.body.pos.x + 16, h.player.body.pos.y, h.player.body.pos.z); }
        if (g.state === 'land') { landed = true; landDist = Math.hypot(g.pos.x - field.x - 0.5, g.pos.z - field.z - 0.5); }
      }
      return { windup, landed, hurt, landDist };
    };
    const stay = run(false), dodge = run(true);
    expect(stay.windup).toBe(true);
    expect(stay.landed).toBe(true);
    expect(stay.landDist).toBeLessThan(HUNT.leapRadius);
    expect(stay.hurt).toBeGreaterThan(0);
    expect(dodge.landed).toBe(true);
    expect(dodge.hurt).toBe(0);
  });

  test('springer aldrig gennem huse: kroppen er aldrig inde i en mur under springet', () => {
    let leaps = 0, inside = 0, bad = 0;
    for (const seed of [1, 2, 3]) {
      const h = calm(seed);
      const g = spawn(h, 'runner', 51.5, 88.5);
      (h as unknown as { hurtPlayer: () => void }).hurtPlayer = () => {};
      const spots = [[45.5, 45.5], [20.5, 30.5], [80.5, 60.5], [51.5, 20.5], [30.5, 80.5]];
      let k = 0;
      for (let i = 0; i < 120 * 60; i++) {
        if (i % (120 * 6) === 0) { const c = h.nav.nearest(spots[k % spots.length][0], spots[k % spots.length][1], 1)!; put(h, c.x + 0.5, 1, c.z + 0.5); k++; }
        h.step();
        h.drainEvents();
        if (g.state === 'leap') {
          if (g.stateT <= HUNT.dt * 1.5) {
            leaps++;
            for (const y of [2.5, 6]) if (!lineOfSight(h.world, { x: g.leapFrom.x, y: g.leapFrom.y + y, z: g.leapFrom.z }, { x: g.leapTo.x, y: g.leapTo.y + y, z: g.leapTo.z })) bad++;
          }
          const t = g.part('torso').box.tf.t;
          if (h.world.solidAt(Math.floor(t.x), Math.floor(t.y), Math.floor(t.z))) inside++;
        }
      }
    }
    expect(leaps).toBeGreaterThan(0);
    expect(bad).toBe(0);
    expect(inside).toBe(0);
  }, 30000);

  test('jager altid spilleren (også når der er en port at angribe)', () => {
    const h = calm(1, 'ravnsdalen');
    put(h, 104.5, 46, 105.5); // oppe på borgtårnet
    const g = spawn(h, 'runner', h.city.gates[1].x, h.city.gates[1].z);
    sec(h, 3);
    expect(g.target).toBe('player');
  });
});

describe('Kasteren', () => {
  test('bliver stående på afstand og kaster klippeblokke – også mod en spiller på jorden', () => {
    const h = calm(3, 'ravnsdalen');
    const field = openRun(h, 32), fy = field.y;
    put(h, field.x + 0.5, fy, field.z + 0.5);
    const g = spawn(h, 'thrower', field.x + 0.5, field.z + 30.5);
    let throws = 0, big = 0, minD = 99;
    sec(h, 14, (ev) => {
      put(h, field.x + 0.5, fy, field.z + 0.5); h.player.hp = 100;
      for (const e of ev) { if (e.type === 'rockThrow') throws++; if (e.type === 'rockImpact' && e.big) big++; }
      minD = Math.min(minD, Math.hypot(g.pos.x - field.x - 0.5, g.pos.z - field.z - 0.5));
    });
    expect(throws).toBeGreaterThanOrEqual(3);
    expect(big).toBeGreaterThan(0);
    expect(minD).toBeGreaterThan(15); // går ikke helt hen til spilleren
  });

  test('bombarderer Borgporten på afstand, når spilleren er langt væk', () => {
    const h = calm(3, 'ravnsdalen');
    put(h, 104.5, 46, 105.5);
    const g = spawn(h, 'thrower', h.city.gates[1].x, h.city.gates[1].z);
    let gateHits = 0, swipes = 0, rocksAtGate = 0;
    sec(h, 90, (ev) => {
      h.player.hp = 100;
      for (const e of ev) {
        if (e.type === 'gateHit') gateHits++;
        if (e.type === 'giantSmash') swipes++;
        if (e.type === 'rockThrow' && g.throwAtGate) rocksAtGate++;
      }
    });
    const cg = h.city.gate!;
    expect(gateHits).toBeGreaterThan(2);
    expect(Math.hypot(g.pos.x - cg.center.x, g.pos.z - cg.center.z)).toBeGreaterThan(HUNT.swipeReach * 1.2); // kaster – går ikke helt hen
    void swipes; void rocksAtGate;
  }, 30000);

  test('klippeblokkens trykbølge går ikke gennem en mur', () => {
    const h = calm(1);
    // Find en mur: fast fra y=1 til 5, med åben gade på begge sider
    let wall: { x: number; z: number } | null = null;
    for (let z = 10; z < 94 && !wall; z++) for (let x = 10; x < 94 && !wall; x++) {
      const solid = [1, 2, 3, 4, 5].every((y) => h.world.solidAt(x, y, z));
      const free = (xx: number) => [1, 2].every((y) => !h.world.solidAt(xx, y, z));
      if (solid && free(x - 2) && free(x + 2) && free(x - 1) && free(x + 1)) wall = { x, z };
    }
    expect(wall).not.toBeNull();
    const w = wall!;
    put(h, w.x + 2.5, 1, w.z + 0.5);
    // Klippeblok der rammer muren fra den anden side
    h.rocks.push({ id: 999, pos: { x: w.x - 1.5, y: 2.5, z: w.z + 0.5 }, vel: { x: 20, y: 0, z: 0 }, age: 0, spin: { x: 0, y: 0, z: 0 }, big: true, gate: false });
    let hurt = 0, impact = false;
    sec(h, 0.5, (ev) => { for (const e of ev) { if (e.type === 'hurt') hurt += e.dmg; if (e.type === 'rockImpact') impact = true; } });
    expect(impact).toBe(true);
    expect(hurt).toBe(0);
    // Samme blok uden mur imellem: spilleren 2 m fra nedslaget tager skade
    const h2 = calm(1);
    put(h2, 45.5, 1, 45.5);
    h2.rocks.push({ id: 998, pos: { x: 48.5, y: 6, z: 45.5 }, vel: { x: 0, y: -20, z: 0 }, age: 0, spin: { x: 0, y: 0, z: 0 }, big: true, gate: false });
    let hurt2 = 0;
    sec(h2, 0.6, (ev) => { for (const e of ev) if (e.type === 'hurt') hurt2 += e.dmg; });
    expect(hurt2).toBeGreaterThan(0);
  });
});

describe('Bølgerne', () => {
  test('begge baner har løbere og kastere med', () => {
    for (const waves of [WAVES, VALLEY_WAVES]) {
      const all = waves.flat().map((s) => s.variant);
      expect(all).toContain('runner');
      expect(all).toContain('thrower');
    }
  });
});
