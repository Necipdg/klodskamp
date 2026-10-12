import { describe, expect, it } from 'vitest';
import { B } from '../src/core/blocks';
import { TUNING } from '../src/config/tuning';
import { freezeBots, newGame, place, skipBuy } from './helpers';

function setup() {
  const g = newGame(30); freezeBots(g); skipBuy(g);
  const p = g.human;
  p.blocks = 8;
  p.slot = 'blocks';
  return { g, p };
}

describe('bygning', () => {
  it('lovlig placering virker og bruger en blok', () => {
    const { g, p } = setup();
    place(p, 5.5, 40);
    expect(g.placeBlock(p, { x: 5, y: 1, z: 37 })).toBe(true);
    expect(g.world.get(5, 1, 37)).toBe(B.BUILD);
    expect(p.blocks).toBe(7);
    // og den kan skydes/ødelægges
    expect(g.world.damage(5, 1, 37, 1000)).toBe(true);
  });

  it('ulovlige placeringer afvises', () => {
    const { g, p } = setup();
    const m = g.map;
    const tries: [number, number, number, string][] = [
      [m.zoneA.x0 + 1, 1, m.zoneA.z0 + 1, 'spawn'],
      [m.zoneD.x0 + 1, 1, m.zoneD.z0 + 1, 'spawn'],
      [m.site.x0 + 2, 1, m.site.z0 + 2, 'bombeområdet'],
      [m.site.x1 + 1, 1, m.site.z0 + 2, 'bombeområdet (kant)'],
      [5, TUNING.buildMaxY + 1, 37, 'for højt'],
      [8, 1, 36, 'optaget (mur)'],
    ];
    for (const [x, y, z, why] of tries) {
      const before = p.blocks;
      expect(g.placeBlock(p, { x, y, z }), why).toBe(false);
      expect(p.blocks).toBe(before);
    }
    // inde i en spiller
    const e = g.players[3];
    place(e, 5.5, 30.5);
    expect(g.placeBlock(p, { x: 5, y: 1, z: 30 })).toBe(false);
    expect(g.placeBlock(p, { x: 5, y: 2, z: 30 })).toBe(false);
    // uden blokke
    p.blocks = 0;
    expect(g.placeBlock(p, { x: 5, y: 1, z: 37 })).toBe(false);
  });

  it('i købsfasen kan man ikke bygge', () => {
    const g = newGame(31); freezeBots(g);
    const p = g.human;
    p.blocks = 4;
    expect(g.placeBlock(p, { x: 5, y: 1, z: 37 })).toBe(false);
  });

  it('forhåndsvisningen peger på fladen foran spilleren', () => {
    const { g, p } = setup();
    place(p, 5.5, 37.5, 0, -0.6);
    const t = g.buildTarget(p);
    expect(t).not.toBeNull();
    expect(t!.y).toBe(1);
    expect(t!.valid).toBe(true);
  });
});
