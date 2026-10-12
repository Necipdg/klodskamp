// Kæmpejagt: mønter, opgraderinger, sværhedsgrader, point og rekordlisten.
import { describe, expect, test } from 'vitest';
import { Hunt, type HuntEvent } from '../src/hunt/hunt';
import { HUNT, HUNT_AMMO } from '../src/config/hunt';
import { GATE_REPAIR, HUNT_DIFF, KILL_COINS, KILL_SCORE, UPGRADES, WAVE_COINS } from '../src/hunt/progress';
import { tfApply } from '../src/hunt/tf';
import { addRecord, getRecords } from '../src/game/records';

const sec = (h: Hunt, s: number, each?: (ev: HuntEvent[]) => void) => {
  for (let i = 0; i < Math.round(s / HUNT.dt); i++) { h.step(); const ev = h.drainEvents(); each?.(ev); }
};
const calm = (diff: 'let' | 'normal' | 'svaer' = 'normal', map: 'bastionen' | 'ravnsdalen' = 'bastionen') => { const h = new Hunt(1, map, diff); h.phaseT = 1e9; return h; };
const giantAt = (h: Hunt, x: number, z: number, yaw = 0) => {
  const g = h.spawnGiant({ scale: 1, hp: HUNT.giantHp, big: false });
  g.pos = { x, y: 1, z }; g.yaw = yaw; g.state = 'walk'; g.stateT = 0;
  g.computeParts();
  return g;
};
const aimAt = (h: Hunt, t: { x: number; y: number; z: number }) => {
  const e = h.eye(), p = h.player;
  p.yaw = Math.atan2(-(t.x - e.x), -(t.z - e.z));
  p.pitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z));
};
/** Skyd ét skud mod en kropsdel og returnér skaden */
const shotDmg = (h: Hunt) => {
  const g = giantAt(h, 51.5, 40, Math.PI);
  const p = h.player;
  p.body.pos = { x: 51.5, y: 10, z: 31 }; p.prevPos = { ...p.body.pos }; p.body.vel = { x: 0, y: 0, z: 0 };
  aimAt(h, tfApply(g.part('torso').box.tf, { x: 0, y: 0, z: g.part('torso').box.h.z }));
  p.recoilP = 0; p.recoilY = 0;
  (h as unknown as { spreadDeg: () => number }).spreadDeg = () => 0;
  h.input.fire = true; h.input.firePressed = true;
  for (let i = 0; i < 3; i++) {
    h.step();
    const e = h.drainEvents().find((x) => x.type === 'hitGiant') as Extract<HuntEvent, { type: 'hitGiant' }> | undefined;
    if (e) return e.dmg;
  }
  return 0;
};

describe('Mønter og point', () => {
  test('en fældet kæmpe giver mønter og point – sværhedsgraden ganger pointene', () => {
    for (const d of ['let', 'normal', 'svaer'] as const) {
      const h = calm(d);
      const g = giantAt(h, 51.5, 40);
      const ev: HuntEvent[] = [];
      g.takeDamage(h, 99999, 'torso');
      ev.push(...h.drainEvents());
      expect(h.coins).toBe(KILL_COINS.clay);
      expect(h.score).toBe(Math.round(KILL_SCORE.clay * HUNT_DIFF[d].score));
      expect(h.stats.kills).toBe(1);
      expect(ev.some((e) => e.type === 'coins' && e.why === 'kill')).toBe(true);
    }
  });

  test('en klaret bølge giver mønter; sejren giver bonus for liv og tid', () => {
    const h = new Hunt(3);
    (h as unknown as { hurtPlayer: () => void }).hurtPlayer = () => {};
    sec(h, 7); // første bølge starter
    expect(h.phase).toBe('fight');
    for (const g of h.giants) g.takeDamage(h, 99999, 'torso');
    sec(h, 0.1);
    expect(h.phase).toBe('break');
    expect(h.coins).toBe(KILL_COINS.clay + WAVE_COINS);
    // Spring frem til sidste bølge og vind den
    h.wave = h.waves.length - 1;
    h.skipBreak();
    sec(h, 1);
    expect(h.phase).toBe('fight');
    let n = 0;
    while (h.phase === 'fight' && n++ < 200) { for (const g of h.giants) if (g.alive) g.takeDamage(h, 99999, 'torso'); sec(h, 1); }
    expect(h.phase).toBe('won');
    expect(h.bonus.map((b) => b.label)).toContain('Liv tilbage');
    expect(h.bonus.find((b) => b.label === 'Liv tilbage')!.pts).toBe(1000);
  }, 20000);
});

describe('Opgraderinger', () => {
  test('kan kun købes i pausen og med nok mønter; prisen trækkes, og max er niveau 3', () => {
    const h = calm();
    expect(h.buyUpgrade('gas').ok).toBe(false); // ingen mønter
    h.coins = 10000;
    expect(h.buyUpgrade('gas').ok).toBe(true);
    expect(h.coins).toBe(10000 - UPGRADES[0].costs[0]);
    expect(h.buyUpgrade('gas').ok).toBe(true);
    expect(h.buyUpgrade('gas').ok).toBe(true);
    expect(h.buyUpgrade('gas').ok).toBe(false);
    expect(h.up.gas).toBe(3);
    h.phase = 'fight';
    expect(h.buyUpgrade('dmg').ok).toBe(false);
  });

  test('effekterne: mere gas, længere krog, flere patroner, mere skade, mindre skade taget', () => {
    const base = calm(), up = calm();
    up.coins = 10000;
    for (const id of ['gas', 'hook', 'mag', 'dmg', 'armor'] as const) for (let i = 0; i < 3; i++) expect(up.buyUpgrade(id).ok).toBe(true);
    expect(up.maxGas).toBe(HUNT.maxGas * 1.75);
    expect(up.gas).toBe(up.maxGas);
    expect(up.hookRange).toBe(HUNT.hookRange + 36);
    expect(up.magSize('rifle')).toBeGreaterThan(HUNT_AMMO.rifle.mag * 2);
    expect(up.player.primary!.mag).toBe(up.magSize('rifle'));
    // skade
    const d0 = shotDmg(calm()), d1 = shotDmg(up);
    expect(d1).toBeGreaterThan(d0 * 1.35);
    // rustning
    base.hurtPlayer(50, null, 'slag', -1); up.hurtPlayer(50, null, 'slag', -1);
    expect(100 - base.player.hp).toBe(50);
    expect(100 - up.player.hp).toBe(Math.round(50 * (1 - 0.36)));
  });

  test('krogen rækker længere med opgraderingen', () => {
    const h = calm();
    // Sigt mod et punkt lige uden for den normale rækkevidde
    const r0 = h.hookRange;
    h.coins = 10000;
    h.buyUpgrade('hook');
    expect(h.hookRange).toBe(r0 + 12);
  });

  test('Borgporten kan repareres for mønter (kun når den er skadet)', () => {
    const h = calm('normal', 'ravnsdalen');
    h.coins = 500;
    expect(h.buyUpgrade('repair').ok).toBe(false); // hel
    h.gate!.hp = h.gate!.maxHp * 0.5;
    expect(h.buyUpgrade('repair').ok).toBe(true);
    expect(h.gate!.hp).toBeCloseTo(h.gate!.maxHp * (0.5 + GATE_REPAIR.amount));
    expect(h.coins).toBe(500 - GATE_REPAIR.cost);
  });
});

describe('Sværhedsgrad', () => {
  test('kæmpernes liv, slag og skade på porten følger sværhedsgraden', () => {
    const dmgTaken: number[] = [], hp: number[] = [], gate: number[] = [];
    for (const d of ['let', 'normal', 'svaer'] as const) {
      const h = calm(d, 'ravnsdalen');
      hp.push(h.spawnGiant({ scale: 1, hp: 1000, big: false }).maxHp);
      h.hurtPlayer(40, null, 'slag', -1);
      dmgTaken.push(100 - h.player.hp);
      h.damageGate(100, h.city.gate!.center);
      gate.push(h.gate!.maxHp - h.gate!.hp);
    }
    expect(hp).toEqual([750, 1000, 1250]);
    expect(dmgTaken[0]).toBeLessThan(dmgTaken[1]);
    expect(dmgTaken[2]).toBeGreaterThan(dmgTaken[1]);
    expect(gate[0]).toBeLessThan(gate[1]);
    expect(gate[2]).toBeGreaterThan(gate[1]);
    // Sammenstød følger ikke sværhedsgraden (kun rustningen)
    const e = calm('svaer'); e.hurtPlayer(20, null, 'sammenstød', -1, true);
    expect(100 - e.player.hp).toBe(20);
  });
});

describe('Rekordlisten', () => {
  test('sorteret efter point, højst 5 pr. bane og sværhed, og ny rekord kendes', () => {
    const r = (score: number) => ({ score, won: false, wave: 2, waves: 5, time: 100, kills: 3, date: '2026-10-12' });
    expect(addRecord('test', 'normal', r(500))).toBe(0);
    expect(addRecord('test', 'normal', r(900))).toBe(0);
    expect(addRecord('test', 'normal', r(700))).toBe(1);
    for (const s of [100, 200, 300]) addRecord('test', 'normal', r(s));
    expect(addRecord('test', 'normal', r(50))).toBe(-1);
    const list = getRecords('test', 'normal');
    expect(list.map((x) => x.score)).toEqual([900, 700, 500, 300, 200]);
    expect(getRecords('test', 'svaer')).toEqual([]);
  });
});
