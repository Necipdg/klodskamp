import { describe, expect, it } from 'vitest';
import { B } from '../src/core/blocks';
import { TUNING } from '../src/config/tuning';
import { NAV } from '../src/core/nav';
import { lineOfSight } from '../src/core/ray';
import { chestPos, headPos } from '../src/core/player';
import { Game } from '../src/core/game';
import { kill, place, skipBuy, steps } from './helpers';

const botGame = (seed: number, diff: 'let' | 'normal' | 'svaer' = 'normal') => new Game({ humanTeam: 'A', difficulty: diff, seed, allBots: true });

describe('bots: synslinjer', () => {
  it('ser ikke gennem vægge, men ser en fjende i frit udsyn', () => {
    const g = botGame(40);
    skipBuy(g);
    const bot = g.players[3]; // forsvarer
    const enemy = g.players[0];
    for (const p of g.players) if (p !== bot && p !== enemy) kill(g, p);
    g.bots.delete(enemy.id);
    enemy.input.fwd = 0;
    // Bot i Lang kigger mod øst, fjenden står bag muren i Midten
    place(bot, 6.5, 35, -Math.PI / 2);
    place(enemy, 25.5, 35);
    const b = g.bots.get(bot.id)!;
    for (let i = 0; i < 60; i++) { place(bot, 6.5, 35, -Math.PI / 2); g.step(); }
    expect(b.debug().visible).toBe(false);
    expect(enemy.hp).toBe(100);
    // Nu i frit udsyn foran botten
    place(enemy, 5.5, 27);
    for (let i = 0; i < 40; i++) { place(bot, 5.5, 36, 0); enemy.body.pos = { x: 5.5, y: 1, z: 27 }; g.step(); }
    expect(b.debug().visible).toBe(true);
  });

  it('i hele kampe skyder bots aldrig uden frit udsyn til en fjende (eller en blok de bryder)', () => {
    let shots = 0, bad = 0;
    for (const seed of [41, 42, 43]) {
      const g = botGame(seed);
      for (let s = 0; s < 120 * 60 * 6 && g.phase !== 'over'; s++) {
        g.step();
        for (const e of g.drainEvents()) {
          if (e.type !== 'shot') continue;
          shots++;
          const p = g.players[e.pid];
          const bot = g.bots.get(e.pid)!;
          if (bot.debug().breakCell) continue;
          const eye = e.from;
          // Mål både før og efter skridtet (andre spillere flytter sig i samme skridt som skuddet)
          const seen = (q: typeof p) => {
            const pts = [headPos(q), chestPos(q)];
            const dx = q.prevPos.x - q.body.pos.x, dy = q.prevPos.y - q.body.pos.y, dz = q.prevPos.z - q.body.pos.z;
            for (const pt of [...pts]) pts.push({ x: pt.x + dx, y: pt.y + dy, z: pt.z + dz });
            return pts.some((pt) => lineOfSight(g.world, eye, pt));
          };
          const ok = g.players.some((q) => q.team !== p.team && (q.alive || q.deathT > g.time - 0.05) && seen(q));
          if (!ok) bad++;
        }
      }
    }
    expect(shots).toBeGreaterThan(100);
    expect(bad).toBe(0);
  }, 60000);
});

describe('bots: placerede blokke', () => {
  it('vejfinding går uden om en delvis spærring', () => {
    const g = botGame(50);
    for (const x of [3, 4, 5]) { g.world.set(x, 1, 36, B.BUILD); g.world.set(x, 2, 36, B.BUILD); }
    const path = g.nav.findPath(5.5, 44, 5.5, 30)!;
    expect(path).not.toBeNull();
    expect(path.every((c) => g.nav.kind[c] !== NAV.BREAK)).toBe(true);
  });

  it('er omvejen lang, planlægger botten at skyde sig igennem', () => {
    const g = botGame(51);
    // Spær Midten helt – omvejen via Lang er meget længere end at skyde én række blokke væk
    for (let x = 24; x <= 29; x++) { g.world.set(x, 1, 41, B.BUILD); g.world.set(x, 2, 41, B.BUILD); }
    const path = g.nav.findPath(26.5, 50, 26.5, 30)!;
    expect(path).not.toBeNull();
    expect(path.some((c) => g.nav.kind[c] === NAV.BREAK)).toBe(true);
  });

  it('når begge ruter er spærret, skyder angribende bots sig igennem og planter', () => {
    let planted = 0, broken = 0;
    for (const seed of [60, 61, 62, 63]) {
      const g = botGame(seed);
      // Mur af sandsække tværs over både Lang og Midten
      for (let x = 3; x <= 7; x++) for (const y of [1, 2]) g.world.set(x, y, 38, B.BUILD);
      for (let x = 24; x <= 29; x++) for (const y of [1, 2]) g.world.set(x, y, 38, B.BUILD);
      g.world.snapshot(); // muren er en del af banen i denne test
      // Forsvarerne er væk, så det kun handler om forhindringerne
      skipBuy(g);
      for (const q of g.players.filter((q) => q.team === 'D')) { q.hp = 1e9; place(q, 43, 10); }
      for (const q of g.players.filter((q) => q.team === 'D')) g.bots.delete(q.id);
      for (let s = 0; s < 120 * 90 && g.phase === 'live'; s++) {
        g.step();
        for (const e of g.drainEvents()) if (e.type === 'blockBreak' && e.block === B.BUILD) broken++;
      }
      if (g.plantedThisRound) planted++;
    }
    expect(broken).toBeGreaterThan(0);
    expect(planted).toBeGreaterThanOrEqual(3);
  }, 60000);
});

describe('bots: bomben', () => {
  it('angribende bots fører bomben frem og planter den', () => {
    let planted = 0;
    for (const seed of [70, 71, 72, 73, 74]) {
      const g = botGame(seed);
      skipBuy(g);
      // Forsvarerne står i deres base og gør ingenting
      for (const q of g.players.filter((q) => q.team === 'D')) { g.bots.delete(q.id); q.hp = 1e9; place(q, 43, 10); }
      for (let s = 0; s < 120 * 90 && g.phase === 'live'; s++) g.step();
      if (g.plantedThisRound) planted++;
    }
    expect(planted).toBe(5);
  }, 30000);

  it('bomben samles op af en anden bot, hvis bæreren dør', () => {
    const g = botGame(75);
    skipBuy(g);
    for (const q of g.players.filter((q) => q.team === 'D')) { g.bots.delete(q.id); q.hp = 1e9; place(q, 43, 10); }
    steps(g, 3);
    const c = g.players.find((p) => p.hasBomb)!;
    kill(g, c);
    expect(g.bomb.state).toBe('dropped');
    for (let s = 0; s < 120 * 60 && !g.plantedThisRound && g.phase === 'live'; s++) g.step();
    expect(g.plantedThisRound).toBe(true);
    expect(g.players[g.bomb.planter].id).not.toBe(c.id);
  }, 30000);

  it('forsvarende bots desarmerer en plantet bombe', () => {
    let defused = 0;
    for (const seed of [80, 81, 82, 83]) {
      const g = botGame(seed);
      skipBuy(g);
      const c = g.players.find((p) => p.hasBomb)!;
      g.bots.delete(c.id);
      c.hp = 1e9;
      c.input.fwd = 0; c.input.right = 0;
      place(c, 9.5, 12.5);
      c.input.use = true;
      steps(g, TUNING.plantTime + 0.1);
      expect(g.phase).toBe('planted');
      c.hp = 100;
      for (const q of g.players.filter((q) => q.team === 'A')) kill(g, q);
      for (let s = 0; s < 120 * 45 && g.phase === 'planted'; s++) g.step();
      if (g.lastRound?.reason === 'defused') defused++;
    }
    expect(defused).toBe(4);
  }, 30000);
});

describe('hele kampe med bots', () => {
  it('kampe bliver spillet færdige på alle sværhedsgrader, bots planter selv, og ingen falder ud af banen', () => {
    const reasons: Record<string, number> = {};
    let matches = 0, rounds = 0;
    let plants = 0, built = 0;
    for (const [seed, diff] of [[90, 'normal'], [91, 'let'], [92, 'svaer'], [93, 'normal'], [94, 'normal'], [95, 'let']] as const) {
      const g = botGame(seed, diff);
      for (let s = 0; s < 120 * 60 * 25 && g.phase !== 'over'; s++) {
        g.step();
        for (const e of g.drainEvents()) {
          if (e.type === 'roundEnd') { reasons[e.reason] = (reasons[e.reason] ?? 0) + 1; rounds++; }
          if (e.type === 'planted') plants++;
          if (e.type === 'blockPlace') built++;
        }
        // ingen må falde ud af banen
        for (const p of g.players) if (p.alive) expect(p.body.pos.y).toBeGreaterThan(0.5);
      }
      if (g.phase === 'over') matches++;
    }
    console.log('udfald', reasons, 'runder', rounds, 'plantninger', plants, 'byggede sandsække', built);
    expect(matches).toBe(6);
    expect(rounds).toBeGreaterThanOrEqual(30);
    // Bots planter af sig selv i en del af runderne
    expect(plants / rounds).toBeGreaterThan(0.1);
    // Forsvarende bots bygger selv dækning
    expect(built).toBeGreaterThan(5);
  }, 120000);
});
