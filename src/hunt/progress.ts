// Kæmpejagt: sværhedsgrader, mønter, opgraderinger og point. Kun tal og regler – ingen grafik.
import type { Difficulty } from '../config/tuning';
import type { GiantVariant } from './giant';

export type HuntDifficulty = Difficulty; // 'let' | 'normal' | 'svaer'

export interface DiffMods {
  name: string;
  /** Kæmpernes liv */
  giantHp: number;
  /** Skade fra slag og sten */
  giantDmg: number;
  /** Kæmpernes ganghastighed */
  giantSpeed: number;
  /** Ventetid mellem stenkast */
  throwCd: number;
  /** Skade på Borgporten */
  gateDmg: number;
  /** Point ganges med dette */
  score: number;
}

export const HUNT_DIFF: Record<HuntDifficulty, DiffMods> = {
  let: { name: 'Let', giantHp: 0.75, giantDmg: 0.6, giantSpeed: 0.9, throwCd: 1.35, gateDmg: 0.6, score: 0.6 },
  normal: { name: 'Normal', giantHp: 1, giantDmg: 1, giantSpeed: 1, throwCd: 1, gateDmg: 1, score: 1 },
  svaer: { name: 'Svær', giantHp: 1.25, giantDmg: 1.35, giantSpeed: 1.12, throwCd: 0.8, gateDmg: 1.3, score: 1.6 },
};

export type UpgradeId = 'gas' | 'hook' | 'dmg' | 'armor' | 'mag';
export const UPGRADE_MAX = 3;

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** Hvad næste niveau giver (niveau 1..3) */
  effect: (level: number) => string;
  costs: [number, number, number];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'gas', name: 'Større gastank', effect: (l) => `${100 + l * 25} gas · fylder ${l * 20} % hurtigere op`, costs: [70, 140, 230] },
  { id: 'hook', name: 'Stærkere krog', effect: (l) => `Rækker ${70 + l * 12} m · trækker og spoler ${l * 15} % hurtigere`, costs: [70, 140, 230] },
  { id: 'dmg', name: 'Skarpere kugler', effect: (l) => `+${l * 15} % skade med begge våben`, costs: [90, 180, 280] },
  { id: 'armor', name: 'Rustning', effect: (l) => `${l * 12} % mindre skade`, costs: [80, 160, 250] },
  { id: 'mag', name: 'Store magasiner', effect: (l) => `+${l * 35} % patroner · genlader ${l * 15} % hurtigere`, costs: [60, 120, 200] },
];

/** Reparér Borgporten (kun på baner med en port) */
export const GATE_REPAIR = { cost: 90, amount: 0.25 };

export const emptyUpgrades = (): Record<UpgradeId, number> => ({ gas: 0, hook: 0, dmg: 0, armor: 0, mag: 0 });

/** Mønter for at fælde en kæmpe */
export const KILL_COINS: Record<GiantVariant, number> = { clay: 60, stone: 120, mountain: 250, sea: 250, runner: 70, thrower: 90 };
/** Point for at fælde en kæmpe (før sværhedsgraden) */
export const KILL_SCORE: Record<GiantVariant, number> = { clay: 500, stone: 1000, mountain: 2500, sea: 2500, runner: 700, thrower: 800 };
export const WEAK_COINS = 4;
export const WEAK_SCORE = 25;
export const WAVE_COINS = 40;
export const WAVE_SCORE = 300; // gange bølgens nummer
/** Sejrsbonus */
export const WIN_SCORE = { gate: 2000, hp: 10, parPerWave: 110, timeBonus: 3 };
