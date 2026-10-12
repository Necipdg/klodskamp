import { TUNING } from '../config/tuning';
import type { Slot, WeaponId } from '../config/weapons';
import type { Body } from './physics';
import type { V3 } from './math';

export type Team = 'A' | 'D'; // A = angribere, D = forsvarere
export const otherTeam = (t: Team): Team => (t === 'A' ? 'D' : 'A');
export const TEAM_NAME: Record<Team, string> = { A: 'Angriberne', D: 'Forsvarerne' };

export interface PlayerInput {
  fwd: number; // −1..1
  right: number; // −1..1
  jump: boolean;
  crouch: boolean;
  walk: boolean;
  fire: boolean; // holdt nede
  firePressed: boolean; // trykket ned i dette skridt
  reload: boolean;
  use: boolean; // holdt nede (plant / desarmér)
  drop: boolean;
  slot: Slot | null;
}

export const emptyInput = (): PlayerInput => ({
  fwd: 0, right: 0, jump: false, crouch: false, walk: false,
  fire: false, firePressed: false, reload: false, use: false, drop: false, slot: null,
});

export interface WeaponState { id: WeaponId; mag: number; reserve: number }

export interface Player {
  id: number;
  name: string;
  team: Team;
  isBot: boolean;
  body: Body;
  /** Forrige position (til glat tegning mellem simuleringsskridt) */
  prevPos: V3;
  yaw: number;
  pitch: number;
  crouching: boolean;
  eyeH: number;
  hp: number;
  armor: number;
  alive: boolean;
  primary: WeaponState | null;
  pistol: WeaponState;
  slot: Slot;
  blocks: number;
  hasBomb: boolean;
  money: number;
  kills: number;
  deaths: number;
  fireCd: number;
  reloadT: number;
  switchT: number;
  recoilP: number; // grader
  recoilY: number;
  spray: number;
  lastShotT: number;
  action: { kind: 'plant' | 'defuse'; t: number } | null;
  input: PlayerInput;
  stepAcc: number;
  deathT: number;
  killerId: number;
  spawnIdx: number;
  /** Sidste gang spilleren tog skade (til HUD-blink) */
  hurtT: number;
}

export function eyePos(p: Player): V3 {
  return { x: p.body.pos.x, y: p.body.pos.y + p.eyeH, z: p.body.pos.z };
}
export function chestPos(p: Player): V3 {
  return { x: p.body.pos.x, y: p.body.pos.y + p.body.height * 0.62, z: p.body.pos.z };
}
export function headPos(p: Player): V3 {
  return { x: p.body.pos.x, y: p.body.pos.y + p.body.height - TUNING.headSize * 0.5, z: p.body.pos.z };
}

export function currentWeapon(p: Player): WeaponState | null {
  if (p.slot === 'primary') return p.primary;
  if (p.slot === 'pistol') return p.pistol;
  return null;
}
