import { Game } from '../src/core/game';
import { TUNING } from '../src/config/tuning';
import type { Player } from '../src/core/player';

export function newGame(seed = 1, allBots = false, team: 'A' | 'D' = 'A') {
  return new Game({ humanTeam: team, difficulty: 'normal', seed, allBots });
}

/** Kør til købsfasen er slut */
export function skipBuy(g: Game) {
  while (g.phase === 'buy') g.step();
}

export function steps(g: Game, sec: number) {
  const n = Math.round(sec / TUNING.dt);
  for (let i = 0; i < n; i++) g.step();
}

export function place(p: Player, x: number, z: number, yaw = 0, pitch = 0) {
  p.body.pos = { x, y: 1, z };
  p.prevPos = { x, y: 1, z };
  p.body.vel = { x: 0, y: 0, z: 0 };
  p.yaw = yaw;
  p.pitch = pitch;
}

/** Fjern alle bots' indflydelse (de står stille og skyder ikke) */
export function freezeBots(g: Game) {
  g.bots.clear();
  for (const p of g.players) p.input = { ...p.input, fwd: 0, right: 0, fire: false, use: false };
}

export function kill(g: Game, p: Player) {
  g.damage(p, 999, -1, 'knife', false, p.body.pos);
}

export function aimAt(p: Player, x: number, y: number, z: number) {
  const ex = p.body.pos.x, ey = p.body.pos.y + p.eyeH, ez = p.body.pos.z;
  const dx = x - ex, dy = y - ey, dz = z - ez;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}
