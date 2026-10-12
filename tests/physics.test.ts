import { describe, expect, it } from 'vitest';
import { B } from '../src/core/blocks';
import { newGame, freezeBots, place, skipBuy, steps } from './helpers';

describe('bevægelse og kollision', () => {
  it('man kan ikke gå gennem en mur', () => {
    const g = newGame();
    freezeBots(g);
    skipBuy(g);
    const p = g.human;
    // Lang: muren mod øst ligger ved x = 8 (gangen er x 3..7)
    place(p, 6, 30, -Math.PI / 2); // kig mod øst
    p.input.fwd = 1;
    steps(g, 2);
    expect(p.body.pos.x).toBeLessThan(8 - p.body.halfW + 0.01);
    expect(p.body.pos.x).toBeGreaterThan(7.5);
  });

  it('tyngdekraft: man lander på gulvet', () => {
    const g = newGame();
    freezeBots(g);
    skipBuy(g);
    const p = g.human;
    place(p, 5.5, 30);
    p.body.pos.y = 3;
    steps(g, 1);
    expect(p.body.pos.y).toBeCloseTo(1, 3);
    expect(p.body.onGround).toBe(true);
  });

  it('man kan hoppe op på én blok, men ikke to', () => {
    const g = newGame();
    freezeBots(g);
    skipBuy(g);
    const p = g.human;
    const w = g.world;
    // En blok foran spilleren i Lang
    w.set(5, 1, 28, B.CRATE);
    place(p, 5.5, 29.5, 0);
    p.input.fwd = 1;
    p.input.jump = true;
    steps(g, 0.6);
    p.input.jump = false;
    steps(g, 0.5);
    expect(p.body.pos.z).toBeLessThan(28.8); // kom over/op
    // To høje blokke kan ikke forceres
    w.set(4, 1, 36, B.CRATE); w.set(4, 2, 36, B.CRATE);
    w.set(3, 1, 36, B.CRATE); w.set(3, 2, 36, B.CRATE);
    w.set(5, 1, 36, B.CRATE); w.set(5, 2, 36, B.CRATE);
    w.set(6, 1, 36, B.CRATE); w.set(6, 2, 36, B.CRATE);
    w.set(7, 1, 36, B.CRATE); w.set(7, 2, 36, B.CRATE);
    place(p, 5.5, 38.5, 0);
    p.input.fwd = 1; p.input.jump = true;
    steps(g, 2);
    expect(p.body.pos.z).toBeGreaterThan(37);
  });

  it('hug sænker øjenhøjden og farten', () => {
    const g = newGame();
    freezeBots(g);
    skipBuy(g);
    const p = g.human;
    place(p, 5.5, 44, 0);
    p.input.crouch = true;
    p.input.fwd = 1;
    steps(g, 0.5);
    expect(p.eyeH).toBeLessThan(1.2);
    const z0 = p.body.pos.z;
    steps(g, 1);
    const crouchSpeed = z0 - p.body.pos.z;
    p.input.crouch = false;
    steps(g, 0.5);
    const z1 = p.body.pos.z;
    steps(g, 1);
    const runSpeed = z1 - p.body.pos.z;
    expect(crouchSpeed).toBeLessThan(runSpeed * 0.5);
    expect(p.crouching).toBe(false);
  });

  it('spillere kan ikke stå inde i hinanden', () => {
    const g = newGame();
    freezeBots(g);
    skipBuy(g);
    const a = g.human, b = g.players[3];
    place(a, 5.5, 30);
    place(b, 5.6, 30.1);
    steps(g, 0.3);
    expect(Math.hypot(a.body.pos.x - b.body.pos.x, a.body.pos.z - b.body.pos.z)).toBeGreaterThanOrEqual(0.59);
    // og ingen af dem er skubbet ind i en mur
    for (const p of [a, b]) expect(p.body.pos.x).toBeGreaterThan(3.29);
  });
});
