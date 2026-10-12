// Kæmpejagt: krog, flyvning, kollision, våben i luften, kæmpernes vej, angreb, svagt punkt, bølger og nulstilling.
import { describe, expect, test } from 'vitest';
import { Hunt, WAVES, type HuntEvent } from '../src/hunt/hunt';
import { HUNT } from '../src/config/hunt';
import { B } from '../src/core/blocks';
import { bodyHitsWorld } from '../src/core/physics';
import { lineOfSight } from '../src/core/ray';
import { obbClosest, tfApply } from '../src/hunt/tf';
import type { Giant } from '../src/hunt/giant';

const sec = (h: Hunt, s: number, each?: (ev: HuntEvent[]) => void) => {
  for (let i = 0; i < Math.round(s / HUNT.dt); i++) { h.step(); const ev = h.drainEvents(); each?.(ev); }
};
const put = (h: Hunt, x: number, y: number, z: number, yaw = 0, pitch = 0) => {
  const p = h.player;
  p.body.pos = { x, y, z }; p.prevPos = { x, y, z }; p.body.vel = { x: 0, y: 0, z: 0 };
  p.yaw = yaw; p.pitch = pitch;
};
const aimAt = (h: Hunt, t: { x: number; y: number; z: number }) => {
  const e = h.eye(), p = h.player;
  p.yaw = Math.atan2(-(t.x - e.x), -(t.z - e.z));
  p.pitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z));
};
/** Ny jagt i pause-tilstand uden automatiske bølger */
const calm = (seed = 1) => { const h = new Hunt(seed); h.phaseT = 1e9; return h; };
const giantAt = (h: Hunt, x: number, z: number, yaw = 0, scale = 1) => {
  const g = h.spawnGiant({ scale, hp: HUNT.giantHp, big: false });
  g.pos = { x, y: 1, z }; g.yaw = yaw; g.state = 'walk'; g.stateT = 0;
  g.computeParts();
  return g;
};
const inGiant = (h: Hunt, g: Giant) => {
  const b = h.player.body;
  return g.parts.some((part) => [0.35, 0.9, 1.5].some((o) => obbClosest(part.box, { x: b.pos.x, y: b.pos.y + o, z: b.pos.z }).dist < 0.2));
};

describe('Byen', () => {
  test('startpunkt, porte og depoter ligger rigtigt', () => {
    const h = calm();
    expect(bodyHitsWorld(h.world, h.player.body)).toBe(false);
    // Alle porte kan nås af en kæmpe fra pladsen
    for (const gt of h.city.gates) expect(h.nav.path(gt.x, gt.z, 51.5, 44, 3)).not.toBeNull();
    // Depoter står på fast grund og har luft over sig
    for (const d of h.depots) {
      expect(h.world.solidAt(Math.floor(d.pos.x), Math.floor(d.pos.y) - 1, Math.floor(d.pos.z))).toBe(true);
      expect(h.world.solidAt(Math.floor(d.pos.x), Math.floor(d.pos.y), Math.floor(d.pos.z))).toBe(false);
    }
    expect(h.depots.filter((d) => d.onRoof).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Krog og flyvning', () => {
  test('krogen sætter sig i tårnet og trækker spilleren op', () => {
    const h = calm();
    put(h, 39.5, 1, 52, -Math.PI / 2, 0.55);
    h.input.hook = true; h.input.hookPressed = true;
    let attached = false;
    sec(h, 0.3, (ev) => { if (ev.some((e) => e.type === 'hookAttach')) attached = true; });
    expect(attached).toBe(true);
    const y0 = h.player.body.pos.y;
    sec(h, 1.2);
    expect(h.hook.state).toBe('attached');
    expect(h.player.body.pos.y).toBeGreaterThan(y0 + 3);
    // Slip højre knap: krogen løsnes
    h.input.hook = false;
    sec(h, 0.05);
    expect(h.hook.state).toBe('idle');
  });

  test('krogen kan sætte sig i en kæmpe og følger den, når den bevæger sig', () => {
    const h = calm();
    const g = giantAt(h, 51.5, 40, Math.PI);
    put(h, 51.5, 1, 26);
    aimAt(h, g.part('torso').box.tf.t);
    expect(h.hookAim()?.giant).toBe(true);
    h.input.hook = true; h.input.hookPressed = true;
    let onGiant = false;
    sec(h, 0.4, (ev) => { for (const e of ev) if (e.type === 'hookAttach' && e.giant) onGiant = true; });
    expect(onGiant).toBe(true);
    const t0 = { ...h.hook.target };
    g.pos.x += 2; g.computeParts();
    sec(h, 0.02);
    expect(h.hook.target.x - t0.x).toBeGreaterThan(1.5);
  });

  test('krogen når ikke ud over rækkevidden', () => {
    const h = calm();
    put(h, 45.5, 1, 45.5, 0, 1.2); // lige op i luften
    h.input.hook = true; h.input.hookPressed = true;
    let miss = false;
    sec(h, 0.1, (ev) => { if (ev.some((e) => e.type === 'hookMiss')) miss = true; });
    expect(miss).toBe(true);
    expect(h.hook.state).toBe('idle');
  });

  test('boost bruger gas, bremsen tager farten, gassen fyldes op på jorden', () => {
    const h = calm();
    put(h, 45.5, 20, 45.5, 0, 0.3);
    h.input.jump = true;
    sec(h, 1);
    expect(h.gas).toBeLessThan(HUNT.maxGas - 10);
    const fast = Math.hypot(h.player.body.vel.x, h.player.body.vel.z);
    expect(fast).toBeGreaterThan(10);
    h.input.jump = false; h.input.brake = true;
    sec(h, 0.8);
    expect(Math.hypot(h.player.body.vel.x, h.player.body.vel.z)).toBeLessThan(fast * 0.3);
    h.input.brake = false;
    sec(h, 4);
    expect(h.player.body.onGround).toBe(true);
    h.gas = 40;
    const g0 = h.gas;
    sec(h, 1);
    expect(h.gas).toBeGreaterThan(g0);
  });

  test('hård landing gør skade – bremse-dyserne tager den', () => {
    const fall = (brake: boolean) => {
      const h = calm();
      put(h, 45.5, 38, 45.5);
      h.player.body.vel.y = -20;
      h.input.brake = brake;
      sec(h, 3);
      return h.player.hp;
    };
    expect(fall(false)).toBeLessThan(HUNT.maxHp);
    expect(fall(true)).toBe(HUNT.maxHp);
  });

  test('ingen flyvning gennem mure i fuld fart', () => {
    for (const [vx, vz] of [[1, 0], [0.7, 0.7], [0, -1], [-1, 0]]) {
      const h = calm();
      put(h, 51.5 - vx * 12, 8, 51.5 - vz * 12);
      let inside = 0;
      for (let i = 0; i < 120; i++) {
        h.player.body.vel = { x: vx * HUNT.maxSpeed, y: 0, z: vz * HUNT.maxSpeed };
        h.step(); h.drainEvents();
        if (bodyHitsWorld(h.world, h.player.body)) inside++;
      }
      expect(inside).toBe(0);
      // Spilleren står uden for klokketårnet (x/z 49–54)
      const p = h.player.body.pos;
      expect(p.x > 49 - 0.2 && p.x < 55.2 && p.z > 49 - 0.2 && p.z < 55.2 && p.y < 30).toBe(false);
    }
  });

  test('ingen flyvning gennem en kæmpe i fuld fart', () => {
    const h = calm();
    const g = giantAt(h, 51.5, 40, 0);
    let inside = 0;
    put(h, 51.5, 8, 26);
    for (let i = 0; i < 120; i++) {
      h.player.body.vel = { x: 0, y: 0, z: HUNT.maxSpeed };
      h.step(); h.drainEvents();
      if (inGiant(h, g)) inside++;
    }
    expect(inside).toBe(0);
    expect(h.player.body.pos.z).toBeLessThan(40);
  });
});

describe('Våben i luften', () => {
  test('skydning og genladning virker midt i et sving', () => {
    const h = calm();
    put(h, 45.5, 24, 45.5, 0, 0);
    h.player.body.vel = { x: 18, y: 4, z: -6 };
    const mag0 = h.player.primary!.mag;
    h.input.fire = true; h.input.firePressed = true;
    sec(h, 0.3);
    h.input.fire = false;
    expect(h.player.primary!.mag).toBeLessThan(mag0);
    expect(h.player.body.onGround).toBe(false);
    h.input.reload = true;
    sec(h, WEAPONS_RIFLE_RELOAD + 0.1);
    expect(h.player.primary!.mag).toBe(30);
    expect(h.stats.shots).toBeGreaterThan(0);
  });
});
const WEAPONS_RIFLE_RELOAD = 2.6;

describe('Kæmper', () => {
  test('går kun på gader og når frem til spilleren', () => {
    const h = calm(4);
    put(h, 45.5, 1, 45.5);
    const g = h.spawnGiant({ scale: 1, hp: HUNT.giantHp, big: false });
    let off = 0, windups = 0;
    sec(h, 40, (ev) => {
      if (!h.nav.walkable(Math.floor(g.pos.x), Math.floor(g.pos.z), 1)) off++;
      windups += ev.filter((e) => e.type === 'giantWindup').length;
      put(h, 45.5, 1, 45.5); // spilleren står stille
      h.player.hp = 100;
    });
    expect(off).toBe(0);
    expect(Math.hypot(g.pos.x - 45.5, g.pos.z - 45.5)).toBeLessThan(HUNT.swipeReach + 2);
    expect(windups).toBeGreaterThan(0);
  });

  test('slaget rammer en spiller der bliver stående, og ikke en der flytter sig', () => {
    const run = (dodge: boolean) => {
      const h = calm(5);
      const g = giantAt(h, 51.5, 40, Math.PI); // kigger mod +z
      put(h, 51.5, 1, 47);
      let hurt = 0, done = false;
      for (let i = 0; i < 120 * 8 && !done; i++) {
        h.step();
        for (const e of h.drainEvents()) {
          if (e.type === 'hurt') hurt += e.dmg;
          if (e.type === 'giantWindup' && dodge) put(h, 51.5, 1, 62); // løb væk under optakten
          if (e.type === 'giantSmash') done = true;
        }
      }
      void g;
      return hurt;
    };
    expect(run(false)).toBeGreaterThan(0);
    expect(run(true)).toBe(0);
  });

  test('slaget går aldrig gennem en mur', () => {
    // Muren sættes ind, først når slaget er i gang – kæmpen kan altså ikke vælge et andet angreb
    const h = calm(5);
    giantAt(h, 51.5, 40, Math.PI);
    put(h, 51.5, 1, 47);
    let hurt = 0, walled = false;
    for (let i = 0; i < 120 * 8; i++) {
      h.step();
      for (const e of h.drainEvents()) {
        if (e.type === 'hurt') hurt += e.dmg;
        if (e.type === 'giantWindup' && !walled) {
          // En mur dukker op mellem kæmpen og spilleren (høj og bred)
          for (let x = 44; x <= 59; x++) for (let y = 1; y <= 24; y++) h.world.set(x, y, 45, B.STONE);
          walled = true;
        }
      }
    }
    expect(walled).toBe(true);
    expect(hurt).toBe(0);
  });

  test('sten rammer en spiller i luften, men aldrig gennem et hus', () => {
    // Frit udsyn: stenen rammer
    const h = calm(6);
    const g = giantAt(h, 51.5, 20, Math.PI);
    put(h, 51.5, 12, 44);
    g.computeParts();
    h.throwRock(g);
    let hit = false;
    sec(h, 3, (ev) => { for (const e of ev) if (e.type === 'rockImpact' && e.hitPlayer) hit = true; h.player.body.vel = { x: 0, y: 0, z: 0 }; h.player.body.pos.y = 12; });
    expect(hit).toBe(true);
    // Mur imellem: stenen stopper i muren
    const h2 = calm(6);
    const g2 = giantAt(h2, 51.5, 20, Math.PI);
    put(h2, 51.5, 12, 44);
    for (let x = 40; x <= 63; x++) for (let y = 1; y <= 40; y++) h2.world.set(x, y, 36, B.STONE);
    h2.throwRock(g2);
    let hit2 = false, impact = false;
    sec(h2, 3, (ev) => { for (const e of ev) if (e.type === 'rockImpact') { impact = true; if (e.hitPlayer) hit2 = true; } h2.player.body.vel = { x: 0, y: 0, z: 0 }; h2.player.body.pos.y = 12; });
    expect(impact).toBe(true);
    expect(hit2).toBe(false);
    expect(h2.player.hp).toBe(HUNT.maxHp);
  });

  test('kæmpen kaster ikke uden frit udsyn', () => {
    const h = calm(7);
    const g = giantAt(h, 51.5, 20, Math.PI);
    put(h, 51.5, 12, 44);
    for (let x = 40; x <= 63; x++) for (let y = 1; y <= 40; y++) h.world.set(x, y, 36, B.STONE);
    let throws = 0;
    // Kæmpen holdes på sin plads (muren er ikke med i dens vejkort, så den ville ellers gå igennem testmuren)
    sec(h, 10, (ev) => { throws += ev.filter((e) => e.type === 'rockThrow').length; h.player.body.vel = { x: 0, y: 0, z: 0 }; h.player.body.pos.y = 12; g.pos.x = 51.5; g.pos.z = 20; });
    expect(throws).toBe(0);
  });

  test('det svage punkt kan rammes i alle animationer og giver ekstra skade', () => {
    const states = ['walk', 'windSwipe', 'swipe', 'windThrow', 'flinch', 'kneel', 'emerge'] as const;
    for (const st of states) for (const t of [0.1, 0.4, 0.8]) {
      const h = calm();
      const g = giantAt(h, 51.5, 40, Math.PI);
      g.state = st; g.stateT = t;
      g.computeParts();
      // Stil spilleren bag kæmpen, lidt over nakken
      const nape = g.part('nape').box;
      const c = nape.tf.t;
      const back = { x: nape.tf.r[2], y: nape.tf.r[5], z: nape.tf.r[8] }; // nakkens bagudretning
      const bl = Math.hypot(back.x, back.z) || 1;
      put(h, c.x + (back.x / bl) * 7, Math.max(1, c.y + 1.5) - 1.62, c.z + (back.z / bl) * 7);
      aimAt(h, c);
      const d = { x: -Math.sin(h.player.yaw) * Math.cos(h.player.pitch), y: Math.sin(h.player.pitch), z: -Math.cos(h.player.yaw) * Math.cos(h.player.pitch) };
      const r = h.trace(h.eye(), d, 50, false);
      expect(r.part, `${st} @ ${t}`).toBe('nape');
    }
  });

  test('skud i nakken giver firedobbelt skade og kendes på hændelsen', () => {
    const shoot = (part: 'nape' | 'torso') => {
      const h = calm();
      const g = giantAt(h, 51.5, 40, Math.PI);
      const target = part === 'nape' ? g.part('nape').box.tf.t : tfApply(g.part('torso').box.tf, { x: 0, y: 0, z: g.part('torso').box.h.z });
      put(h, 51.5, 10, 31);
      aimAt(h, target);
      h.player.recoilP = 0; h.player.recoilY = 0;
      (h as unknown as { spreadDeg: () => number }).spreadDeg = () => 0;
      h.input.fire = true; h.input.firePressed = true;
      let ev: HuntEvent | undefined;
      for (let i = 0; i < 3 && !ev; i++) { h.step(); ev = h.drainEvents().find((e) => e.type === 'hitGiant'); }
      return ev as Extract<HuntEvent, { type: 'hitGiant' }>;
    };
    const w = shoot('nape'), t = shoot('torso');
    expect(w.weak).toBe(true);
    expect(t.weak).toBe(false);
    expect(w.dmg).toBeGreaterThanOrEqual(t.dmg * (HUNT.weakMult - 0.3));
  });

  test('kæmpen dør, falder og fjernes', () => {
    const h = calm();
    const g = giantAt(h, 51.5, 40, Math.PI);
    g.takeDamage(h, 99999, 'nape');
    const types: string[] = [];
    sec(h, 8, (ev) => types.push(...ev.map((e) => e.type)));
    expect(types).toContain('giantFell');
    expect(types).toContain('giantRemoved');
    expect(h.giants.length).toBe(0);
    // Krogen slipper, hvis kæmpen den sad i forsvinder
  });
});

describe('Bølger, sejr, nederlag og nulstilling', () => {
  test('alle tre bølger kan gennemføres', () => {
    const h = new Hunt(3);
    const p = h.player;
    (h as unknown as { hurtPlayer: () => void }).hurtPlayer = () => {};
    const starts: number[] = [];
    let spawned = 0;
    for (let i = 0; i < 120 * 420 && h.phase !== 'won'; i++) {
      const g = h.giants.filter((x) => x.alive).sort((a, b) => Math.hypot(a.pos.x - p.body.pos.x, a.pos.z - p.body.pos.z) - Math.hypot(b.pos.x - p.body.pos.x, b.pos.z - p.body.pos.z))[0];
      if (g) { aimAt(h, tfApply(g.part('nape').box.tf, { x: 0, y: 0, z: 0 })); h.input.fire = true; h.input.firePressed = true; }
      else h.input.fire = false;
      if (p.primary!.reserve < 30) p.primary!.reserve = 150;
      h.step();
      for (const e of h.drainEvents()) {
        if (e.type === 'waveStart') starts.push(e.wave);
        if (e.type === 'giantSpawn') spawned++;
      }
    }
    expect(h.phase).toBe('won');
    expect(starts).toEqual([1, 2, 3]);
    expect(spawned).toBe(WAVES.reduce((a, w) => a + w.length, 0));
    expect(h.stats.kills).toBe(spawned);
  }, 30000);

  test('man dør, hvis man bliver stående – og nederlaget stopper styringen', () => {
    const h = new Hunt(2);
    let lost = false;
    for (let i = 0; i < 120 * 200 && !lost; i++) {
      h.step();
      if (h.drainEvents().some((e) => e.type === 'lost')) lost = true;
    }
    expect(lost).toBe(true);
    expect(h.phase).toBe('lost');
    expect(h.player.alive).toBe(false);
    expect(h.hook.state).toBe('idle');
    const pos = { ...h.player.body.pos };
    h.input.fwd = 1; h.input.jumpPressed = true;
    sec(h, 1);
    expect(Math.hypot(h.player.body.pos.x - pos.x, h.player.body.pos.z - pos.z)).toBeLessThan(0.01);
  });

  test('man kan ikke vinde ved at svæve stille højt oppe', () => {
    const h = new Hunt(8);
    const p = h.player;
    put(h, 51.5, 39, 51.5); // oven på klokketårnets spir
    let dmg = 0, gasOut = false;
    for (let i = 0; i < 120 * 90 && h.phase !== 'lost'; i++) {
      // Hold boost nede og kig lige op for at blive hængende
      p.pitch = 1.5; h.input.jump = !p.body.onGround;
      h.step();
      if (h.gas <= 0) gasOut = true;
      for (const e of h.drainEvents()) if (e.type === 'hurt') dmg += e.dmg;
    }
    expect(gasOut || p.body.onGround).toBe(true);
    expect(dmg).toBeGreaterThan(0);
  });

  test('en ny jagt starter helt forfra', () => {
    const h = new Hunt(1);
    // Ødelæg en kasse, spawn en kæmpe, brug ammo og gas
    h.phaseT = 0;
    sec(h, 3);
    expect(h.giants.length).toBeGreaterThan(0);
    h.gas = 3; h.player.hp = 7; h.player.primary!.mag = 0;
    let crate: [number, number, number] | null = null;
    for (let x = 38; x < 66 && !crate; x++) for (let z = 38; z < 66 && !crate; z++) if (h.world.get(x, 1, z) === B.CRATE) crate = [x, 1, z];
    expect(crate).not.toBeNull();
    h.world.set(...crate!, B.AIR);
    const n = new Hunt(1);
    expect(n.world.get(...crate!)).toBe(B.CRATE);
    expect(n.giants.length).toBe(0);
    expect(n.phase).toBe('break');
    expect(n.wave).toBe(0);
    expect(n.gas).toBe(HUNT.maxGas);
    expect(n.player.hp).toBe(HUNT.maxHp);
    expect(n.player.primary!.mag).toBe(30);
    expect(n.rocks.length).toBe(0);
    expect(lineOfSight(n.world, n.eye(), { x: 51.5, y: 30, z: 51.5 })).toBeTypeOf('boolean');
  });
});
