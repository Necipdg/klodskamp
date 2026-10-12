// Bloktyper. Tal-id'er gemmes i verdenens Uint8Array.
export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  SAND: 3,
  SANDSTONE: 4,
  STONE: 5,
  BRICK: 6,
  PLANKS: 7,
  LOG: 8,
  LEAVES: 9,
  CRATE: 10,
  BUILD: 11,
  SITE: 12,
  SPAWN_A: 13,
  SPAWN_D: 14,
  COBBLE: 15,
  BEDROCK: 16,
  ROOF: 17,
  WOODWALL: 18,
  PATH: 19,
  ROOFTILE: 20,
  WINDOW: 21,
  DOOR_LO: 22,
  DOOR_HI: 23,
  BANNER_A: 24,
  BANNER_D: 25,
  PLANTER: 26,
  PLASTER: 27,
  ROCK: 28,
  SNOW: 29,
  MOSSSTONE: 30,
  SLATE: 31,
  WHEAT: 32,
  DARKLEAVES: 33,
  GRAVEL: 34,
  SAIL: 35,
} as const;
export type BlockId = (typeof B)[keyof typeof B];

export interface BlockDef {
  name: string;
  solid: boolean;
  /** 0 = kan ikke ødelægges */
  hp: number;
  /** Felter i tekstur-atlasset: top, side, bund */
  tiles: [number, number, number];
  /** Partikelfarve når den rammes */
  color: number;
  /** Lyd-type når den rammes */
  sound: 'wood' | 'stone' | 'soft';
}

// Atlas-felter (se render/textures.ts – samme rækkefølge)
export const T = {
  grassTop: 0, grassSide: 1, dirt: 2, sand: 3, sandstoneSide: 4, sandstoneTop: 5, stone: 6, brick: 7,
  planks: 8, logSide: 9, logTop: 10, leaves: 11, crateSide: 12, crateTop: 13, build: 14, site: 15,
  spawnA: 16, spawnD: 17, cobble: 18, bedrock: 19, roof: 20, woodwall: 21, path: 22,
  rooftile: 23, window: 24, doorLo: 25, doorHi: 26, bannerA: 27, bannerD: 28, planterSide: 29, planterTop: 30,
  plaster: 31, grassFlowers: 32, sandstoneVine: 33, sandstoneCrack: 34, sand2: 35, rooftileTop: 36, brick2: 37, plasterVine: 38,
  rock: 39, rockTop: 40, snow: 41, snowSide: 42, mossStone: 43, slate: 44, slateTop: 45, wheatTop: 46, wheatSide: 47,
  darkLeaves: 48, gravel: 49, rock2: 50, sail: 51,
} as const;

/** Variationer der vælges ud fra blokkens position, så fladerne ikke gentager sig */
export const VARIANTS: Partial<Record<number, number[]>> = {
  [T.grassTop]: [T.grassTop, T.grassTop, T.grassTop, T.grassFlowers],
  [T.sandstoneSide]: [T.sandstoneSide, T.sandstoneSide, T.sandstoneSide, T.sandstoneSide, T.sandstoneCrack, T.sandstoneVine],
  [T.sand]: [T.sand, T.sand, T.sand2],
  [T.brick]: [T.brick, T.brick, T.brick2],
  [T.plaster]: [T.plaster, T.plaster, T.plaster, T.plasterVine],
  [T.rock]: [T.rock, T.rock, T.rock2],
};

const def = (name: string, solid: boolean, hp: number, tiles: [number, number, number], color: number, sound: BlockDef['sound']): BlockDef =>
  ({ name, solid, hp, tiles, color, sound });

export const BLOCKS: BlockDef[] = [];
BLOCKS[B.AIR] = def('luft', false, 0, [0, 0, 0], 0, 'soft');
BLOCKS[B.GRASS] = def('græs', true, 0, [T.grassTop, T.grassSide, T.dirt], 0x6ab04c, 'soft');
BLOCKS[B.DIRT] = def('jord', true, 0, [T.dirt, T.dirt, T.dirt], 0x8a6142, 'soft');
BLOCKS[B.SAND] = def('sand', true, 0, [T.sand, T.sand, T.sand], 0xe2cc8f, 'soft');
BLOCKS[B.SANDSTONE] = def('sandsten', true, 0, [T.sandstoneTop, T.sandstoneSide, T.sandstoneTop], 0xd9b97a, 'stone');
BLOCKS[B.STONE] = def('sten', true, 0, [T.stone, T.stone, T.stone], 0x9a9a9a, 'stone');
BLOCKS[B.BRICK] = def('mursten', true, 0, [T.stone, T.brick, T.stone], 0xa65a3f, 'stone');
BLOCKS[B.PLANKS] = def('planker', true, 0, [T.planks, T.planks, T.planks], 0xb48a54, 'wood');
BLOCKS[B.LOG] = def('stamme', true, 0, [T.logTop, T.logSide, T.logTop], 0x6e4f2e, 'wood');
BLOCKS[B.LEAVES] = def('blade', true, 25, [T.leaves, T.leaves, T.leaves], 0x4f9a3a, 'soft');
BLOCKS[B.CRATE] = def('trækasse', true, 110, [T.crateTop, T.crateSide, T.crateTop], 0xb98a4b, 'wood');
BLOCKS[B.BUILD] = def('byggeblok', true, 70, [T.build, T.build, T.build], 0xd8dde3, 'wood');
BLOCKS[B.SITE] = def('bombeområde', true, 0, [T.site, T.stone, T.stone], 0xd85a2a, 'stone');
BLOCKS[B.SPAWN_A] = def('angriberbase', true, 0, [T.spawnA, T.stone, T.stone], 0xd0884a, 'stone');
BLOCKS[B.SPAWN_D] = def('forsvarerbase', true, 0, [T.spawnD, T.stone, T.stone], 0x5a7fbf, 'stone');
BLOCKS[B.COBBLE] = def('brosten', true, 0, [T.cobble, T.cobble, T.cobble], 0x8c8c86, 'stone');
BLOCKS[B.BEDROCK] = def('grundfjeld', true, 0, [T.bedrock, T.bedrock, T.bedrock], 0x444444, 'stone');
BLOCKS[B.ROOF] = def('tag', true, 0, [T.roof, T.roof, T.roof], 0x5b5f66, 'stone');
BLOCKS[B.WOODWALL] = def('træplader', true, 90, [T.woodwall, T.woodwall, T.woodwall], 0xc49a5a, 'wood');
BLOCKS[B.PATH] = def('sti', true, 0, [T.path, T.dirt, T.dirt], 0xc9b07a, 'soft');
BLOCKS[B.ROOFTILE] = def('tagsten', true, 0, [T.rooftileTop, T.rooftile, T.rooftile], 0xb5532f, 'stone');
BLOCKS[B.WINDOW] = def('vindue', true, 0, [T.sandstoneTop, T.window, T.sandstoneTop], 0x3b5a78, 'stone');
BLOCKS[B.DOOR_LO] = def('dør', true, 0, [T.planks, T.doorLo, T.planks], 0x7a5230, 'wood');
BLOCKS[B.DOOR_HI] = def('dør', true, 0, [T.planks, T.doorHi, T.planks], 0x7a5230, 'wood');
BLOCKS[B.BANNER_A] = def('banner', true, 0, [T.sandstoneTop, T.bannerA, T.sandstoneTop], 0xe0702e, 'soft');
BLOCKS[B.BANNER_D] = def('banner', true, 0, [T.stone, T.bannerD, T.stone], 0x3f78d0, 'soft');
BLOCKS[B.PLANTER] = def('plantekumme', true, 60, [T.planterTop, T.planterSide, T.planterSide], 0xb0603a, 'stone');
BLOCKS[B.PLASTER] = def('puds', true, 0, [T.sandstoneTop, T.plaster, T.sandstoneTop], 0xeee3cc, 'stone');

BLOCKS[B.ROCK] = def('klippe', true, 0, [T.rockTop, T.rock, T.rock], 0x7d7a74, 'stone');
BLOCKS[B.SNOW] = def('sne', true, 0, [T.snow, T.snowSide, T.rock], 0xeef3f6, 'soft');
BLOCKS[B.MOSSSTONE] = def('mossten', true, 0, [T.stone, T.mossStone, T.stone], 0x7f8a72, 'stone');
BLOCKS[B.SLATE] = def('skifer', true, 0, [T.slateTop, T.slate, T.slate], 0x3f4a5c, 'stone');
BLOCKS[B.WHEAT] = def('korn', true, 0, [T.wheatTop, T.wheatSide, T.dirt], 0xd9b24a, 'soft');
BLOCKS[B.DARKLEAVES] = def('blade', true, 25, [T.darkLeaves, T.darkLeaves, T.darkLeaves], 0x2f6b2c, 'soft');
BLOCKS[B.GRAVEL] = def('grus', true, 0, [T.gravel, T.gravel, T.gravel], 0x9a948a, 'soft');
BLOCKS[B.SAIL] = def('sejl', true, 0, [T.sail, T.sail, T.sail], 0xf1e9d6, 'soft');

export const isSolid = (b: number) => BLOCKS[b]?.solid ?? false;
export const isDestructible = (b: number) => (BLOCKS[b]?.hp ?? 0) > 0;
