// Banen "Sandgården": kompakt blokbane med to ruter fra angribernes base til bombeområdet
// (Lang mod vest og Tunnel gennem midten) og en gang fra forsvarernes base.
//
// Banen tegnes som et kort over søjler (én bogstav pr. x,z), der derefter bygges op i lag.
import { B } from './blocks';
import { VoxelWorld } from './world';
import type { V3 } from './math';

export const MAP_W = 48;
export const MAP_D = 56;
export const MAP_H = 12;
const WALL_H = 5; // almindelige vægge fylder lag 1..5
const BORDER_H = 7;

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export const inRect = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
export const rectCenter = (r: Rect) => ({ x: (r.x0 + r.x1 + 1) / 2, z: (r.z0 + r.z1 + 1) / 2 });

export interface Spot { x: number; z: number; /** retning man holder øje med (yaw) */ look?: number }

export interface GameMap {
  name: string;
  world: VoxelWorld;
  cols: string[][];
  spawnA: { pos: V3; yaw: number }[];
  spawnD: { pos: V3; yaw: number }[];
  zoneA: Rect; // angribernes base (byggeforbud)
  zoneD: Rect;
  site: Rect; // bombeområdet
  /** Ruter for angriberne: mellemstationer mod bombeområdet */
  routes: Record<'lang' | 'tunnel', Spot[]>;
  /** Hvor på ruten angriberne samles, før de stormer bombeområdet sammen (indeks i ruten) */
  stage: Record<'lang' | 'tunnel', number>;
  plantSpots: Spot[];
  /** Forsvarernes poster */
  holds: Spot[];
  /** Hvor angribende bots dækker, efter bomben er plantet */
  postPlant: Spot[];
}

// yaw-værdier: 0 = nord (−z), π/2 = vest (−x), π = syd (+z), −π/2 = øst (+x)
const N = 0, W = Math.PI / 2, S = Math.PI, E = -Math.PI / 2;

export function buildMap(): GameMap {
  const cols: string[][] = [];
  for (let z = 0; z < MAP_D; z++) cols.push(new Array(MAP_W).fill('B'));
  const carve = (x0: number, z0: number, x1: number, z1: number, c: string) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) cols[z][x] = c;
  };
  const put = (x: number, z: number, c: string) => { cols[z][x] = c; };

  // --- Forsvarernes base (nordøst) ---
  carve(30, 2, 44, 11, '.');
  carve(32, 3, 40, 8, 'D');
  // --- Forsvarergangen mod bombeområdet ---
  carve(21, 3, 29, 8, ':');
  // --- Bombeområdet (nordvest) ---
  carve(3, 2, 20, 24, '.');
  carve(15, 3, 20, 8, ','); // sti fra forsvarergangen
  carve(3, 16, 7, 24, ','); // sti fra Lang
  carve(14, 18, 20, 24, ','); // sti fra Tunnel
  carve(7, 8, 14, 14, 'S');
  // --- Lang (vest) ---
  carve(3, 25, 7, 47, ',');
  carve(3, 43, 19, 48, ',');
  // --- Angribernes base (syd) ---
  carve(17, 44, 35, 53, ',');
  carve(32, 49, 35, 53, '.');
  carve(21, 48, 31, 52, 'A');
  // --- Midten og Tunnelen ---
  carve(24, 28, 29, 43, ';');
  carve(21, 21, 29, 27, 'r');
  // --- Smutvejen: overdækket gang fra Tunnelen til forsvarergangen, spærret af træplader der kan skydes op ---
  carve(22, 9, 23, 19, 'r');
  put(22, 20, 'X'); put(23, 20, 'X');

  // --- Bygninger, dækning og natur ---
  carve(17, 12, 20, 16, 'B'); // skur på bombeområdet
  put(9, 9, 'c'); put(10, 9, 'c'); // trækasser (2 høje) på bombeområdet
  put(12, 13, 'k'); put(7, 14, 'k');
  put(3, 20, 's'); put(4, 20, 's'); put(5, 20, 's'); // lav mur ved Lang-indgangen
  put(16, 21, 'k'); put(16, 22, 'c');
  put(5, 4, 't'); put(12, 21, 't'); put(4, 11, 'c');
  put(18, 4, 'k');
  // Mere dækning i gården, så kampene på bombeområdet bliver tættere
  put(9, 19, 'c'); put(10, 19, 'c'); // kassestabel foran Lang-posten
  put(12, 17, 's'); put(13, 17, 's'); put(14, 17, 's'); // lav mur ved Tunnel-stien
  put(12, 8, 'k'); put(13, 8, 'k'); // dækning for ankeret
  put(16, 9, 'f'); put(16, 10, 'f'); // plantekummer
  put(4, 14, 'k'); put(5, 6, 'c');
  // Forsvarergangen
  put(25, 3, 'k'); put(27, 8, 'c'); put(28, 8, 'k');
  // Forsvarerbasen
  put(32, 10, 't'); put(43, 3, 't'); put(31, 3, 'c');
  // Lang
  put(3, 33, 'c'); put(4, 33, 'k'); put(7, 39, 'c'); put(6, 28, 'w'); put(7, 28, 'w');
  put(12, 46, 'c'); put(13, 46, 'k'); put(9, 43, 'k');
  // Midten
  put(24, 35, 'c'); put(25, 35, 'k'); put(29, 31, 'c'); put(28, 40, 'w'); put(29, 40, 'w');
  // Tunnelen (søjler og en kasse)
  put(24, 23, 'P'); put(27, 25, 'P'); put(22, 26, 'k');
  // Angriberbasen
  put(33, 46, 'c'); put(34, 46, 'k'); put(19, 45, 'k'); put(34, 52, 't'); put(18, 52, 't');
  // Plantekummer
  put(3, 2, 'f'); put(20, 2, 'f'); put(3, 47, 'f'); put(30, 2, 'f'); put(44, 11, 'f'); put(17, 53, 'f'); put(29, 43, 'f');
  put(21, 27, 'f');

  // Kanten rundt om banen
  for (let x = 0; x < MAP_W; x++) { cols[0][x] = '#'; cols[MAP_D - 1][x] = '#'; }
  for (let z = 0; z < MAP_D; z++) { cols[z][0] = '#'; cols[z][MAP_W - 1] = '#'; }

  const world = new VoxelWorld(MAP_W, MAP_H, MAP_D);
  const trees: [number, number][] = [];

  for (let z = 0; z < MAP_D; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const c = cols[z][x];
      const wall = wallMat(x, z);
      world.init(x, 0, z, floorFor(c, x, z));
      switch (c) {
        case 'B':
        case 'P':
          for (let y = 1; y <= WALL_H; y++) world.init(x, y, z, y === WALL_H ? trimMat(wall) : wall);
          break;
        case '#':
          for (let y = 1; y <= BORDER_H; y++) world.init(x, y, z, y >= BORDER_H - 1 ? B.COBBLE : B.STONE);
          break;
        case 'r':
          world.init(x, 4, z, B.ROOF);
          world.init(x, 5, z, B.ROOF);
          break;
        case 'c':
          world.init(x, 1, z, B.CRATE); world.init(x, 2, z, B.CRATE);
          break;
        case 'k':
          world.init(x, 1, z, B.CRATE);
          break;
        case 'w':
          world.init(x, 1, z, B.WOODWALL); world.init(x, 2, z, B.WOODWALL);
          break;
        case 's':
          world.init(x, 1, z, B.SANDSTONE);
          break;
        case 'f':
          world.init(x, 1, z, B.PLANTER); world.init(x, 2, z, B.LEAVES);
          break;
        case 'X':
          for (let y = 1; y <= 3; y++) world.init(x, y, z, B.WOODWALL);
          world.init(x, 4, z, B.ROOF); world.init(x, 5, z, B.ROOF);
          break;
        case 't':
          trees.push([x, z]);
          break;
      }
    }
  }
  for (const [x, z] of trees) {
    for (let y = 1; y <= 3; y++) world.init(x, y, z, B.LOG);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (world.get(x + dx, 4, z + dz) === B.AIR) world.init(x + dx, 4, z + dz, B.LEAVES);
      if ((dx === 0 || dz === 0) && world.get(x + dx, 5, z + dz) === B.AIR) world.init(x + dx, 5, z + dz, B.LEAVES);
      if (dx !== 0 && dz !== 0) continue;
      if (dx === 0 && dz === 0) continue;
      if (world.get(x + dx, 3, z + dz) === B.AIR && (x + z) % 2 === 0) world.init(x + dx, 3, z + dz, B.LEAVES);
    }
  }
  decorate(world, cols);
  world.snapshot();

  const spawnA = [
    { pos: { x: 23.5, y: 1, z: 50.5 }, yaw: N },
    { pos: { x: 26.5, y: 1, z: 50.5 }, yaw: N },
    { pos: { x: 29.5, y: 1, z: 50.5 }, yaw: N },
  ];
  const spawnD = [
    { pos: { x: 33.5, y: 1, z: 4.5 }, yaw: W },
    { pos: { x: 35.5, y: 1, z: 6.5 }, yaw: W },
    { pos: { x: 33.5, y: 1, z: 7.5 }, yaw: W },
  ];

  return {
    name: 'Sandgården',
    world,
    cols,
    spawnA,
    spawnD,
    zoneA: { x0: 20, z0: 47, x1: 32, z1: 53 },
    zoneD: { x0: 31, z0: 2, x1: 41, z1: 9 },
    site: { x0: 7, z0: 8, x1: 14, z1: 14 },
    routes: {
      lang: [{ x: 15.5, z: 46 }, { x: 9.5, z: 45.5 }, { x: 5.5, z: 30 }, { x: 5.5, z: 21.5 }],
      tunnel: [{ x: 26.5, z: 42 }, { x: 26.5, z: 29.5 }, { x: 22.5, z: 23.5 }, { x: 17.5, z: 19.5 }],
    },
    stage: { lang: 1, tunnel: 0 },
    plantSpots: [{ x: 8.5, z: 11.5 }, { x: 11.5, z: 11.5 }, { x: 10.5, z: 13.5 }, { x: 13.5, z: 10.5 }],
    holds: [
      { x: 5.5, z: 22.5, look: S }, // 0: ved Lang-indgangen, kigger ned ad Lang
      { x: 9.5, z: 18.5, look: S - 0.35 }, // 1: tilbagetrukket mod Lang
      { x: 22.5, z: 22.5, look: S - 0.3 }, // 2: i Tunnelhallen mod Midten
      { x: 15.5, z: 19.5, look: E + 0.5 }, // 3: holder Tunnel-udgangen
      { x: 24.5, z: 5.5, look: W }, // 4: anker i forsvarergangen (skjult, tager bombeområdet tilbage)
      { x: 22.5, z: 7.5, look: W - 0.3 }, // 5: anker ved forsvarergangens åbning
      { x: 27.5, z: 31.5, look: S }, // 6: aggressiv i Midten
      { x: 5.5, z: 36.5, look: S }, // 7: aggressiv langt nede ad Lang
    ],
    postPlant: [{ x: 6.5, z: 17.5, look: N }, { x: 15.5, z: 9.5, look: E }, { x: 8.5, z: 5.5, look: S }],
  };
}

function floorFor(c: string, x: number, z: number): number {
  switch (c) {
    case '.': case 't': return B.GRASS;
    case ',': case 'c': case 'k': case 'w': case 's': return (x * 7 + z * 13) % 11 === 0 ? B.PATH : B.SAND;
    case ';': return B.PATH;
    case ':': case 'r': case 'X': return B.COBBLE;
    case 'f': return B.SAND;
    case 'S': return B.SITE;
    case 'A': return B.SPAWN_A;
    case 'D': return B.SPAWN_D;
    default: return B.STONE;
  }
}

function wallMat(x: number, z: number): number {
  if (z <= 12 && x >= 21) return B.STONE; // forsvarernes stenfort
  if (x <= 22 && z <= 28) return B.SANDSTONE; // bombeområdet
  if (z >= 41) return B.BRICK; // angribernes kvarter
  if (x < 24) return B.PLASTER; // kalkede huse mellem Lang og Midten
  return B.SANDSTONE;
}
function trimMat(wall: number): number {
  if (wall === B.BRICK) return B.SANDSTONE;
  if (wall === B.STONE) return B.COBBLE;
  if (wall === B.PLASTER) return B.SANDSTONE;
  return wall;
}

const isOpen = (c: string | undefined) => c !== undefined && c !== 'B' && c !== '#' && c !== 'P';
const hash = (x: number, z: number) => ((x * 73856093) ^ (z * 19349663)) >>> 0;

/** Tage, udhæng, vinduer, døre, bannere og balkoner. Kun pynt – påvirker ikke gulvhøjden, hvor man kæmper. */
function decorate(world: VoxelWorld, cols: string[][]) {
  const W = MAP_W, D = MAP_D;
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= W || z >= D ? undefined : cols[z][x]);
  // Afstand fra hver bygningssøjle til nærmeste åbne felt (trappetage)
  const dd = new Int32Array(W * D).fill(99);
  const q: number[] = [];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (isOpen(cols[z][x])) { dd[z * W + x] = 0; q.push(z * W + x); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, z = Math.floor(i / W);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      const ni = nz * W + nx;
      if (dd[ni] > dd[i] + 1) { dd[ni] = dd[i] + 1; q.push(ni); }
    }
  }
  for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) {
    const c = cols[z][x];
    if (c === 'B') {
      const h = Math.min(dd[z * W + x], 3);
      for (let y = 6; y <= 5 + h; y++) world.init(x, y, z, B.ROOFTILE);
    }
  }
  // Udhæng over gaderne (lag 5) – giver skygge langs murene
  for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) {
    const c = cols[z][x];
    if (!isOpen(c) || c === 'r' || c === 'X') continue;
    const nb = [at(x + 1, z), at(x - 1, z), at(x, z + 1), at(x, z - 1)];
    if (nb.some((n) => n === 'B') && world.get(x, 5, z) === B.AIR && world.get(x, 4, z) !== B.LEAVES) world.init(x, 5, z, B.ROOFTILE);
  }
  // Facader: vinduer, døre, bannere og balkoner på lige mure
  for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) {
    if (cols[z][x] !== 'B') continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const oc = at(x + dx, z + dz);
      if (!isOpen(oc) || oc === 'r' || oc === 'X') continue;
      // lige mur: naboerne langs muren er også bygning med åbent felt foran
      const ax = dz !== 0 ? 1 : 0, az = dx !== 0 ? 1 : 0;
      const straight = at(x + ax, z + az) === 'B' && at(x - ax, z - az) === 'B' &&
        isOpen(at(x + ax + dx, z + az + dz)) && isOpen(at(x - ax + dx, z - az + dz));
      if (!straight) continue;
      const hsh = hash(x, z);
      const zoneA = z >= 44 && x >= 17 && x <= 35;
      const zoneD = z <= 11 && x >= 30;
      const along = dz !== 0 ? x : z;
      if ((zoneA || zoneD) && along % 3 === 0) {
        world.init(x, 3, z, zoneA ? B.BANNER_A : B.BANNER_D);
        world.init(x, 4, z, zoneA ? B.BANNER_A : B.BANNER_D);
      } else if (hsh % 13 === 0 && oc !== 'S') {
        world.init(x, 1, z, B.DOOR_LO); world.init(x, 2, z, B.DOOR_HI);
      } else if (along % 4 === 1) {
        world.init(x, 3, z, B.WINDOW);
      }
      // Balkon: plankegulv i lag 3 ude over gaden, med blomster
      if (hsh % 23 === 5 && (oc === '.' || oc === ',' || oc === ';' || oc === ':')) {
        for (const s of [-1, 0, 1]) {
          const bx = x + dx + ax * s, bz = z + dz + az * s;
          const bc = at(bx, bz);
          if (bc && isOpen(bc) && bc !== 'r' && world.get(bx, 1, bz) === B.AIR && world.get(bx, 3, bz) === B.AIR) {
            world.init(bx, 3, bz, B.PLANKS);
            if (s !== 0 && world.get(bx, 4, bz) === B.AIR) world.init(bx, 4, bz, B.LEAVES);
          }
        }
      }
    }
  }
}
