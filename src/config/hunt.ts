// Alle tal for spiltypen Kæmpejagt. Hold dem her – ikke spredt i koden.

export const HUNT = {
  dt: 1 / 120,

  // ---- Spilleren til fods ----
  runSpeed: 6.2,
  jumpSpeed: 7.6,
  gravity: 20,
  maxHp: 100,

  // ---- Krogen (højre mus) ----
  hookRange: 70, // m
  hookSpeed: 140, // krogens flyvefart
  hookPull: 22, // m/s² – rebet trækker en mod ankeret, mens man holder
  reelSpeed: 9, // m/s rebet korter sig af sig selv
  reelFastSpeed: 20, // med Shift
  reelFastPull: 34,
  reelFastGas: 9, // gas/s
  minRope: 1.6,
  swingAccel: 11, // WASD mens man hænger (pumper svinget)

  // ---- Gas (mellemrum = boost, G = bremse) ----
  maxGas: 100,
  boostAccel: 26,
  boostGas: 16, // gas/s
  brakeDamp: 3.2, // pr. sekund
  brakeGas: 9,
  gasRegenGround: 12,
  gasRegenAir: 2.5,
  airAccel: 8,
  airDrag: 0.05,
  maxSpeed: 46,
  /** Højdegrænse: over denne kan man ikke booste opad */
  ceiling: 40,

  // ---- Sammenstød ----
  hardLanding: 19, // m/s – herover giver en landing skade
  slamSpeed: 21, // m/s fart der forsvinder ind i en mur
  impactDamage: 2.4, // skade pr. m/s over grænsen

  // ---- Kæmper ----
  giantHp: 1200,
  bigGiantHp: 2600,
  mountainGiantHp: 4400,
  weakMult: 4, // nakkekrystallen
  headMult: 1.2,
  limbMult: 0.8,
  legStagger: 220, // skade på benene før kæmpen falder på knæ
  kneelTime: 3.2,
  flinchDamage: 160, // skade inden for kort tid, der afbryder et angreb
  walkSpeed: 3.0,
  turnRate: 80, // grader/s
  swipeReach: 10.5,
  swipeWindup: 0.95,
  swipeActive: 0.32,
  swipeRecover: 0.7,
  swipeDamage: 42,
  swipeCooldown: 2.2,
  throwWindup: 1.25,
  throwCooldown: 4.5,
  throwRange: 60,
  rockSpeed: 30,
  rockGravity: 12,
  rockDamage: 30,
  rockRadius: 0.9,

  // ---- Løberkæmpen (hurtig, springer) ----
  runnerHp: 680,
  runnerSpeed: 2.1, // gange almindelig ganghastighed
  leapMin: 11, // m – springer kun mod spillere mellem disse afstande
  leapMax: 34,
  leapWindup: 0.85, // s varsel (sætter sig på hug, orange "!")
  leapSpeed: 24, // m/s vandret under springet
  leapRecover: 1.0, // s hvor den kommer op efter landingen (godt tidspunkt at ramme nakken)
  leapCooldown: 5.5,
  leapDamage: 38,
  leapRadius: 5.5, // trykbølgen ved landingen (gange størrelse)

  // ---- Kasteren (bliver på afstand og kaster klippeblokke) ----
  throwerHp: 1350,
  throwerSpeed: 0.75,
  throwerKeep: 36, // m – står stille og kaster, når spilleren er tættere på end dette (og den kan se spilleren)
  throwerGateRange: 34, // m – herfra bombarderer den Borgporten
  throwerCdMult: 0.5, // kaster dobbelt så ofte
  boulderDamage: 26,
  boulderRadius: 1.4,
  boulderSplash: 4.2, // m – skade rundt om nedslaget (kun med frit udsyn)
  boulderGateDamage: 60,

  // ---- Borgporten (Ravnsdalen) ----
  gateHp: 1600,
  gateSwipeDamage: 70, // pr. slag (ganges med kæmpens størrelse)
  gateRepair: 0.3, // andel af porten der repareres mellem bølgerne
  /** Kæmper der går efter porten vender sig mod spilleren inden for denne afstand (gange størrelse) */
  aggroRange: 24,
  /** Sekunder en kæmpe forfølger spilleren efter at være blevet ramt */
  aggroOnHit: 8,

  // ---- Co-op ----
  respawnTime: 10, // sekunder man er nede, før man er tilbage ved startpunktet
  coopHpPerPlayer: 0.3, // kæmperne får +30 % liv pr. ekstra spiller

  // ---- Bølger ----
  breakTime: 9,
  depotCooldown: 18,
  depotRange: 2.6,
};

/** Våbnenes ammunition i Kæmpejagt (mere reserve end i den taktiske kamp) */
export const HUNT_AMMO = { rifle: { mag: 30, reserve: 150 }, pistol: { mag: 12, reserve: 60 } };
