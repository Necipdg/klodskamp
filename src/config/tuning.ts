// Alle spil-tal samlet ét sted. Hardcod dem ikke andre steder.

export const TUNING = {
  /** Simuleringens faste tidsskridt (sekunder) */
  dt: 1 / 120,

  // ---- Bevægelse ----
  runSpeed: 5.2, // m/s med kniv (våben ganger med deres egen faktor)
  walkFactor: 0.5, // Shift = gå (stille og præcist)
  crouchFactor: 0.38,
  groundAccel: 60,
  groundFriction: 11,
  airAccel: 9,
  gravity: 22,
  jumpSpeed: 7.3, // ≈ 1,2 m hop – nok til én blok
  playerHalfWidth: 0.3,
  standHeight: 1.8,
  crouchHeight: 1.25,
  standEye: 1.62,
  crouchEye: 1.1,
  /** Hoved-hitboksens højde (top af kroppen) */
  headSize: 0.42,

  // ---- Runder ----
  winsToWinMatch: 5,
  buyTime: 10, // købsfase (bevægelse låst)
  roundTime: 100,
  roundEndTime: 5,
  bombTimer: 40,
  plantTime: 3,
  defuseTime: 5,
  defuseRange: 1.7,
  bombPickupRange: 1.3,
  bombKillRadius: 7,
  bombDamageRadius: 14,
  bombBlockRadius: 3.5,

  // ---- Liv ----
  maxHp: 100,
  vestAbsorb: 0.35, // vesten tager 35 % af skaden på kroppen
  fallDamageFrom: 7, // ingen faldskade på denne bane i praksis

  // ---- Bygning ----
  buildReach: 4.6,
  buildMaxY: 2, // højeste blok-lag man må bygge i (gulvet er lag 0, man står i lag 1)
  maxBlocksCarried: 8,
  placedBlockHp: 70,

  // ---- Bots ----
  botFov: 75, // halv synsvinkel i grader
  botViewRange: 70,
  botHearRange: 28,
  botThinkInterval: 0.1,
} as const;

export type Difficulty = 'let' | 'normal' | 'svaer';

/** Bot-sværhedsgrad: reaktionstid (s), drejehastighed (grader/s), sigtefejl (grader), hovedskudschance */
/** jitter = ekstra sigtefejl efter hvert skud (grader), så bots ikke rammer alt */
export const BOT_SKILL: Record<Difficulty, { reaction: number; turnRate: number; aimError: number; jitter: number; headChance: number; burst: number }> = {
  let: { reaction: 0.8, turnRate: 220, aimError: 6, jitter: 2.2, headChance: 0.05, burst: 3 },
  normal: { reaction: 0.5, turnRate: 360, aimError: 3.6, jitter: 1.25, headChance: 0.12, burst: 4 },
  svaer: { reaction: 0.3, turnRate: 540, aimError: 2, jitter: 0.6, headChance: 0.3, burst: 6 },
};
