import { describe, expect, it } from 'vitest';
import { B } from '../src/core/blocks';
import { TUNING } from '../src/config/tuning';
import { ECONOMY } from '../src/config/weapons';
import { freezeBots, kill, newGame, place, skipBuy, steps } from './helpers';
import type { Game } from '../src/core/game';

function carrier(g: Game) { return g.players.find((p) => p.hasBomb)!; }

function plantNow(g: Game) {
  const c = carrier(g);
  place(c, 10.5, 11.5);
  c.input.use = true;
  steps(g, TUNING.plantTime + 0.1);
  c.input.use = false;
  return c;
}

describe('runder og bombe', () => {
  it('angriberne vinder, når bomben eksploderer', () => {
    const g = newGame(5); freezeBots(g); skipBuy(g);
    plantNow(g);
    expect(g.phase).toBe('planted');
    expect(g.bomb.state).toBe('planted');
    steps(g, TUNING.bombTimer + 0.2);
    expect(g.lastRound).toEqual({ winner: 'A', reason: 'exploded' });
    expect(g.score.A).toBe(1);
  });

  it('plantning kræver at man holder E i plant-tiden inde på bombeområdet', () => {
    const g = newGame(5); freezeBots(g); skipBuy(g);
    const c = carrier(g);
    place(c, 5.5, 30); // ikke på bombeområdet
    c.input.use = true;
    steps(g, TUNING.plantTime + 0.5);
    expect(g.phase).toBe('live');
    place(c, 10.5, 11.5);
    steps(g, TUNING.plantTime * 0.5);
    c.input.use = false; // slipper for tidligt
    steps(g, 0.1);
    expect(g.phase).toBe('live');
    expect(c.action).toBeNull();
  });

  it('forsvarerne vinder ved desarmering', () => {
    const g = newGame(6); freezeBots(g); skipBuy(g);
    plantNow(g);
    const d = g.players.find((p) => p.team === 'D')!;
    place(d, g.bomb.pos.x + 0.6, g.bomb.pos.z);
    d.input.use = true;
    steps(g, TUNING.defuseTime + 0.1);
    expect(g.lastRound).toEqual({ winner: 'D', reason: 'defused' });
  });

  it('efter plantning skal bomben desarmeres – også selvom alle angribere er døde', () => {
    const g = newGame(7); freezeBots(g); skipBuy(g);
    plantNow(g);
    for (const p of g.players.filter((q) => q.team === 'A')) kill(g, p);
    steps(g, 1);
    expect(g.phase).toBe('planted');
    expect(g.lastRound).toBeNull();
    steps(g, TUNING.bombTimer);
    expect(g.lastRound?.winner).toBe('A');
    expect(g.lastRound?.reason).toBe('exploded');
  });

  it('forsvarerne vinder, hvis tiden løber ud uden plantning', () => {
    const g = newGame(8); freezeBots(g); skipBuy(g);
    steps(g, TUNING.roundTime + 0.5);
    expect(g.lastRound).toEqual({ winner: 'D', reason: 'time' });
  });

  it('eliminering før plantning: begge veje', () => {
    const g = newGame(9); freezeBots(g); skipBuy(g);
    for (const p of g.players.filter((q) => q.team === 'A')) kill(g, p);
    g.step();
    expect(g.lastRound).toEqual({ winner: 'D', reason: 'eliminated' });
    const g2 = newGame(9); freezeBots(g2); skipBuy(g2);
    for (const p of g2.players.filter((q) => q.team === 'D')) kill(g2, p);
    g2.step();
    expect(g2.lastRound).toEqual({ winner: 'A', reason: 'eliminated' });
  });

  it('bomben tabes ved død og kan samles op af en anden angriber', () => {
    const g = newGame(10); freezeBots(g); skipBuy(g);
    const c = carrier(g);
    place(c, 5.5, 30);
    kill(g, c);
    expect(g.bomb.state).toBe('dropped');
    const other = g.players.find((p) => p.team === 'A' && p.alive)!;
    place(other, 5.5, 33);
    other.input.fwd = 1;
    steps(g, 1.2);
    expect(other.hasBomb).toBe(true);
    expect(g.bomb.state).toBe('carried');
  });

  it('rundeskift nulstiller spillere, bombe og bane', () => {
    const g = newGame(11); freezeBots(g); skipBuy(g);
    const p = g.human;
    // Ødelæg en kasse og placér en blok
    g.world.set(4, 1, 33, B.AIR);
    p.blocks = 2;
    p.slot = 'blocks';
    expect(g.placeBlock(p, { x: 5, y: 1, z: 38 })).toBe(true);
    expect(g.world.diffFromOriginal()).toBe(2);
    p.hp = 20;
    place(p, 5.5, 30);
    for (const q of g.players.filter((q) => q.team === 'D')) kill(g, q);
    steps(g, TUNING.roundEndTime + 0.1);
    expect(g.round).toBe(2);
    expect(g.phase).toBe('buy');
    expect(g.world.diffFromOriginal()).toBe(0);
    for (const q of g.players) {
      expect(q.alive).toBe(true);
      expect(q.hp).toBe(100);
    }
    const sp = g.map.spawnA[p.spawnIdx].pos;
    expect(p.body.pos).toEqual(sp);
    expect(g.bomb.state).toBe('carried');
    expect(g.players.filter((q) => q.hasBomb).length).toBe(1);
  });

  it('første hold til fem vundne runder vinder kampen, og en ny kamp starter forfra', () => {
    const g = newGame(12); freezeBots(g);
    for (let r = 0; r < 5; r++) {
      skipBuy(g);
      for (const q of g.players.filter((q) => q.team === 'D')) kill(g, q);
      steps(g, TUNING.roundEndTime + 0.1);
    }
    expect(g.score.A).toBe(5);
    expect(g.phase).toBe('over');
    expect(g.matchWinner).toBe('A');
    const g2 = newGame(13);
    expect(g2.score).toEqual({ A: 0, D: 0 });
    expect(g2.round).toBe(1);
  });
});

describe('økonomi', () => {
  it('startpenge, køb kun i købsfasen, aldrig negative beløb', () => {
    const g = newGame(20); freezeBots(g);
    const p = g.human;
    expect(p.money).toBe(ECONOMY.startMoney);
    expect(g.buy(0, 'rifle').ok).toBe(false); // for dyr
    expect(p.money).toBe(ECONOMY.startMoney);
    expect(g.buy(0, 'vest').ok).toBe(true);
    expect(p.money).toBe(ECONOMY.startMoney - 650);
    expect(g.buy(0, 'vest').ok).toBe(false); // har allerede
    expect(g.buy(0, 'blocks').ok).toBe(false); // 150 < 200
    expect(p.money).toBeGreaterThanOrEqual(0);
    skipBuy(g);
    p.money = 5000;
    expect(g.buy(0, 'rifle').ok).toBe(false); // købsfasen er slut
    expect(p.money).toBe(5000);
  });

  it('tilfældige køb giver aldrig negative penge', () => {
    const g = newGame(21); freezeBots(g);
    const ids = ['smg', 'rifle', 'vest', 'ammo', 'blocks'] as const;
    for (let i = 0; i < 500; i++) {
      const p = g.players[i % 6];
      p.money = (i * 137) % 3500;
      g.buy(p.id, ids[i % ids.length]);
      expect(p.money).toBeGreaterThanOrEqual(0);
    }
  });

  it('belønning efter runder og drab, med loft', () => {
    const g = newGame(22); freezeBots(g); skipBuy(g);
    const a = g.human, d = g.players[3];
    const m0 = a.money, d0 = d.money;
    g.damage(d, 999, a.id, 'pistol', false, d.body.pos);
    expect(a.money).toBe(m0 + ECONOMY.killReward);
    for (const q of g.players.filter((q) => q.team === 'D')) kill(g, q);
    g.step();
    expect(a.money).toBe(m0 + ECONOMY.killReward + ECONOMY.winReward);
    expect(d.money).toBe(d0 + ECONOMY.lossReward);
    a.money = ECONOMY.maxMoney - 10;
    steps(g, TUNING.roundEndTime + 0.1);
    skipBuy(g);
    for (const q of g.players.filter((q) => q.team === 'D')) kill(g, q);
    g.step();
    expect(a.money).toBe(ECONOMY.maxMoney);
  });
});
