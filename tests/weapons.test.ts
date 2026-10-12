import { describe, expect, it } from 'vitest';
import { B } from '../src/core/blocks';
import { WEAPONS } from '../src/config/weapons';
import { TUNING } from '../src/config/tuning';
import { aimAt, freezeBots, newGame, place, skipBuy, steps } from './helpers';

function setup() {
  const g = newGame(3);
  freezeBots(g);
  skipBuy(g);
  return g;
}

describe('våben', () => {
  it('skud bruger ammunition, og genladning flytter fra reserven', () => {
    const g = setup();
    const p = g.human;
    place(p, 5.5, 40, 0);
    p.input.fire = true; p.input.firePressed = true;
    g.step();
    p.input.fire = false;
    expect(p.pistol.mag).toBe(WEAPONS.pistol.mag - 1);
    p.input.reload = true;
    g.step();
    expect(p.reloadT).toBeGreaterThan(0);
    // Mens der genlades, kan man ikke skyde
    p.input.fire = true; p.input.firePressed = true;
    g.step();
    expect(p.pistol.mag).toBe(WEAPONS.pistol.mag - 1);
    p.input.fire = false;
    steps(g, WEAPONS.pistol.reload + 0.1);
    expect(p.pistol.mag).toBe(WEAPONS.pistol.mag);
    expect(p.pistol.reserve).toBe(WEAPONS.pistol.reserve - 1);
  });

  it('skudkadence: riflen skyder ikke hurtigere end sit interval', () => {
    const g = setup();
    const p = g.human;
    p.money = 5000;
    g.phase = 'buy'; g.phaseT = 5;
    g.buy(0, 'rifle');
    skipBuy(g);
    p.switchT = 0;
    place(p, 5.5, 40, 0);
    p.input.fire = true;
    steps(g, 1.0);
    p.input.fire = false;
    const shot = WEAPONS.rifle.mag - p.primary!.mag;
    expect(shot).toBeGreaterThanOrEqual(9);
    expect(shot).toBeLessThanOrEqual(11);
  });

  it('tomt magasin klikker og genlader automatisk', () => {
    const g = setup();
    const p = g.human;
    place(p, 5.5, 40, 0);
    p.pistol.mag = 0;
    p.input.fire = true; p.input.firePressed = true;
    g.step();
    const ev = g.drainEvents();
    expect(ev.some((e) => e.type === 'empty')).toBe(true);
    expect(p.reloadT).toBeGreaterThan(0);
  });

  it('vægge blokerer skud – frit udsyn rammer', () => {
    const g = setup();
    const p = g.human, e = g.players[3];
    // Skytten i Lang, fjenden på den anden side af muren (i Midten)
    place(p, 6.5, 35);
    place(e, 25.5, 35);
    aimAt(p, e.body.pos.x, e.body.pos.y + 1.2, e.body.pos.z);
    const r1 = g.trace(p, { x: p.body.pos.x, y: p.body.pos.y + p.eyeH, z: p.body.pos.z }, dirOf(p), 120);
    expect(r1.player).toBeNull();
    // Frit udsyn i Lang
    place(e, 5.5, 26);
    aimAt(p, e.body.pos.x, e.body.pos.y + 1.0, e.body.pos.z);
    const hp0 = e.hp;
    p.input.fire = true; p.input.firePressed = true;
    g.step();
    p.input.fire = false;
    expect(e.hp).toBeLessThan(hp0);
  });

  it('hovedskud giver mere skade end kropsskud, og vesten tager af', () => {
    const g = setup();
    const p = g.human, e = g.players[3];
    place(p, 5.5, 36);
    place(e, 5.5, 31, Math.PI);
    aimAt(p, 5.5, 1 + TUNING.standHeight - 0.15, 31);
    p.input.fire = true; p.input.firePressed = true;
    g.step();
    p.input.fire = false;
    const head = 100 - e.hp;
    e.hp = 100; e.armor = 100;
    steps(g, 0.5);
    aimAt(p, 5.5, 1.8, 31);
    p.input.fire = true; p.input.firePressed = true;
    g.step();
    p.input.fire = false;
    const body = 100 - e.hp;
    expect(head).toBeGreaterThan(80);
    expect(body).toBeLessThan(WEAPONS.pistol.damage);
    expect(e.armor).toBeLessThan(100);
  });

  it('kasser kan skydes i stykker, faste mure kan ikke', () => {
    const g = setup();
    const p = g.human;
    // Kassen i Lang ved (3,33)/(4,33)
    expect(g.world.get(4, 1, 33)).toBe(B.CRATE);
    place(p, 4.5, 35.1);
    p.slot = 'knife';
    aimAt(p, 4.5, 1.5, 33.5);
    p.input.fire = true;
    steps(g, 8);
    p.input.fire = false;
    expect(g.world.get(4, 1, 33)).toBe(B.AIR);
    // Muren ved siden af står stadig
    place(p, 6.5, 36.5);
    aimAt(p, 8.5, 1.5, 36.5);
    p.input.fire = true;
    steps(g, 4);
    expect(g.world.get(8, 1, 36)).not.toBe(B.AIR);
  });

  it('holdkammerater kan ikke rammes', () => {
    const g = setup();
    const p = g.human, mate = g.players[1];
    place(p, 5.5, 36);
    place(mate, 5.5, 31);
    aimAt(p, 5.5, 2.2, 31);
    p.input.fire = true; p.input.firePressed = true;
    g.step();
    expect(mate.hp).toBe(100);
  });
});

function dirOf(p: { yaw: number; pitch: number }) {
  const cp = Math.cos(p.pitch);
  return { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
}
