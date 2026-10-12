// Våben og købsmenu. Alle våben-tal hører hjemme her.

export type WeaponId = 'pistol' | 'smg' | 'rifle' | 'knife';
export type Slot = 'primary' | 'pistol' | 'knife' | 'blocks' | 'bomb';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  slot: Slot;
  damage: number;
  headMult: number;
  /** Skade ganges med dette pr. 10 m */
  rangeMod: number;
  interval: number; // sekunder mellem skud
  auto: boolean;
  mag: number;
  reserve: number;
  reload: number;
  /** Spredning i grader */
  spreadBase: number;
  spreadMove: number; // ved fuld løbefart
  spreadAir: number;
  /** Rekyl: grader op pr. skud og hvor hurtigt sprayet vokser */
  kick: number;
  kickGrow: number;
  kickYaw: number;
  recover: number; // grader/s rekylen falder med
  speedFactor: number;
  range: number;
  price: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol', name: 'P-9 Kvik', slot: 'pistol',
    damage: 27, headMult: 3.6, rangeMod: 0.82, interval: 0.16, auto: false,
    mag: 12, reserve: 36, reload: 2.1,
    spreadBase: 0.55, spreadMove: 2.4, spreadAir: 7,
    kick: 2.1, kickGrow: 0.05, kickYaw: 0.5, recover: 14,
    speedFactor: 1.0, range: 90, price: 0,
  },
  smg: {
    id: 'smg', name: 'MK-30 Maskinpistol', slot: 'primary',
    damage: 23, headMult: 3, rangeMod: 0.84, interval: 0.075, auto: true,
    mag: 30, reserve: 90, reload: 2.3,
    spreadBase: 1.1, spreadMove: 1.6, spreadAir: 6,
    kick: 0.55, kickGrow: 0.09, kickYaw: 0.35, recover: 16,
    speedFactor: 0.98, range: 80, price: 1250,
  },
  rifle: {
    id: 'rifle', name: 'AR-12 Stormriffel', slot: 'primary',
    damage: 33, headMult: 4, rangeMod: 0.97, interval: 0.1, auto: true,
    mag: 30, reserve: 90, reload: 2.5,
    spreadBase: 0.2, spreadMove: 4.6, spreadAir: 9,
    kick: 0.85, kickGrow: 0.12, kickYaw: 0.55, recover: 13,
    speedFactor: 0.88, range: 140, price: 2700,
  },
  knife: {
    id: 'knife', name: 'Kniv', slot: 'knife',
    damage: 50, headMult: 1, rangeMod: 1, interval: 0.5, auto: true,
    mag: 0, reserve: 0, reload: 0,
    spreadBase: 0, spreadMove: 0, spreadAir: 0,
    kick: 0, kickGrow: 0, kickYaw: 0, recover: 0,
    speedFactor: 1.05, range: 1.9, price: 0,
  },
};

export const SWITCH_TIME = 0.4;

// ---- Økonomi ----
export const ECONOMY = {
  startMoney: 800,
  maxMoney: 10000,
  winReward: 3250,
  lossReward: 2600,
  killReward: 300,
  plantReward: 300,
  defuseReward: 300,
};

export type BuyId = 'smg' | 'rifle' | 'vest' | 'ammo' | 'blocks';

export interface BuyItem {
  id: BuyId;
  key: string; // tast i købsmenuen
  name: string;
  desc: string;
  price: number;
}

export const BUY_ITEMS: BuyItem[] = [
  { id: 'smg', key: '1', name: 'MK-30 Maskinpistol', desc: 'Hurtig og præcis i bevægelse', price: WEAPONS.smg.price },
  { id: 'rifle', key: '2', name: 'AR-12 Stormriffel', desc: 'Kraftig og præcis – stå stille', price: WEAPONS.rifle.price },
  { id: 'vest', key: '3', name: 'Skudsikker vest', desc: '−35 % skade på kroppen', price: 650 },
  { id: 'ammo', key: '4', name: 'Ekstra ammunition', desc: 'Fylder reserven til alle våben', price: 100 },
  { id: 'blocks', key: '5', name: 'Byggeblokke ×4', desc: 'Midlertidig dækning (højst 8)', price: 200 },
];

export const BLOCKS_PER_BUY = 4;
