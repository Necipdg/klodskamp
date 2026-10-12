// Banen "Bastionen": en blokby inden for en høj bymur. Brede gader og en stor plads til kæmperne,
// bygninger i mange højder, flade tage at lande på, tårne som pejlemærker og smalle gyder til kamp fra jorden.
import { B } from '../core/blocks';
import { VoxelWorld } from '../core/world';
import { Rng, type V3 } from '../core/math';

export const CITY_W = 104;
export const CITY_D = 104;
export const CITY_H = 44;
const WALL_H = 18;

export interface Depot { id: number; pos: V3; onRoof: boolean }
export type HuntMapId = 'ravnsdalen' | 'saltvig' | 'bastionen';
/** Vindmølle: vinger der drejer om et nav – kan bruges som ankerpunkt for krogen */
export interface MillDef { hub: V3; yaw: number; length: number; speed: number }
export interface CityMap {
  id: HuntMapId;
  name: string;
  world: VoxelWorld;
  /** Søjlehøjde (0 = gade/plads, ellers bygningens tag) */
  height: Int16Array;
  /** Felter hvor kæmper kan gå (gade/plads uden forhindringer) */
  open: Uint8Array;
  /** Højden kæmpen står i på hvert felt (y for fødderne) */
  floor: Int16Array;
  /** Felter med vand (1) – vandets overflade ligger i waterY */
  water: Uint8Array | null;
  waterY: number;
  /** Vandfald: lodrette vandflader (til tegning) */
  falls: { x0: number; z0: number; x1: number; z1: number; yTop: number; yBottom: number }[];
  mills: MillDef[];
  /** Højdegrænse for gas-boost */
  ceiling: number;
  fog: [number, number];
  backdrop: 'city' | 'mountains' | 'fjord';
  /** Radarens målestok (pixel pr. meter) */
  radarScale: number;
  gates: V3[];
  depots: Depot[];
  spawn: { pos: V3; yaw: number };
  /** Porten kæmperne angriber (kun i Ravnsdalen): portens blokke, hvor kæmperne stiller sig, portens midte */
  gate: { cells: [number, number, number][]; attack: V3; center: V3; name: string } | null;
  /** Fakler/lygter der lyser om natten */
  torches: V3[];
  /** Oplyste vinduer om natten */
  windowLights: V3[];
  /** Dag og nat skifter med bølgerne */
  dayCycle: boolean;
  /** Pejlemærker. `label` vises på radaren; `light` tegnes som et lys (fyrtårn) */
  landmarks: { name: string; x: number; z: number; h: number; label?: string; light?: boolean }[];
}

type Style = { wall: number; trim: number; roof: 'tile' | 'slate' | 'flat' };

export function buildCity(seed = 7): CityMap {
  const W = CITY_W, D = CITY_D, rng = new Rng(seed);
  const world = new VoxelWorld(W, CITY_H, D);
  const height = new Int16Array(W * D);
  const style: (Style | null)[] = new Array(W * D).fill(null);
  const ground = new Uint8Array(W * D).fill(B.COBBLE);
  const idx = (x: number, z: number) => z * W + x;
  const fill = (x0: number, z0: number, x1: number, z1: number, h: number, st: Style | null) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { height[idx(x, z)] = h; style[idx(x, z)] = st; }
  };
  const ground2 = (x0: number, z0: number, x1: number, z1: number, b: number) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) ground[idx(x, z)] = b;
  };

  // ---- Byens kvarterer: alt mellem gaderne er bygget op ----
  const streetsX: [number, number][] = [[3, 10], [25, 31], [47, 56], [72, 78], [93, 100]];
  const streetsZ = streetsX;
  const isStreet = (v: number, list: [number, number][]) => list.some(([a, b]) => v >= a && v <= b);
  const styles: Style[] = [
    { wall: B.SANDSTONE, trim: B.SANDSTONE, roof: 'tile' },
    { wall: B.PLASTER, trim: B.SANDSTONE, roof: 'tile' },
    { wall: B.BRICK, trim: B.STONE, roof: 'tile' },
    { wall: B.SANDSTONE, trim: B.COBBLE, roof: 'flat' },
    { wall: B.STONE, trim: B.COBBLE, roof: 'slate' },
    { wall: B.PLASTER, trim: B.SANDSTONE, roof: 'flat' },
  ];
  const blocksX: [number, number][] = [];
  for (let i = 0; i < streetsX.length - 1; i++) blocksX.push([streetsX[i][1] + 1, streetsX[i + 1][0] - 1]);
  const lots: { x0: number; z0: number; x1: number; z1: number; h: number; st: Style }[] = [];
  for (const [bx0, bx1] of blocksX) for (const [bz0, bz1] of blocksX) {
    // Del kvarteret i 2-4 grunde, af og til med en smal gyde imellem
    const splitX = rng.chance(0.6), w = bx1 - bx0 + 1, d = bz1 - bz0 + 1;
    const cuts: [number, number, number, number][] = [];
    if (splitX && w >= 12) {
      const m = bx0 + 5 + rng.int(w - 10);
      const gap = rng.chance(0.55) ? 2 : 0;
      cuts.push([bx0, bz0, m - 1, bz1], [m + gap, bz0, bx1, bz1]);
    } else if (d >= 12) {
      const m = bz0 + 5 + rng.int(d - 10);
      const gap = rng.chance(0.55) ? 2 : 0;
      cuts.push([bx0, bz0, bx1, m - 1], [bx0, m + gap, bx1, bz1]);
    } else cuts.push([bx0, bz0, bx1, bz1]);
    for (const [x0, z0, x1, z1] of cuts) {
      // Tæt på pladsen bygges højere
      const cx = (x0 + x1) / 2 - W / 2, cz = (z0 + z1) / 2 - D / 2;
      const near = 1 - Math.min(1, Math.hypot(cx, cz) / 60);
      const h = Math.round(6 + rng.next() * 8 + near * 9);
      lots.push({ x0, z0, x1, z1, h, st: rng.pick(styles) });
    }
  }
  for (const l of lots) fill(l.x0, l.z0, l.x1, l.z1, l.h, l.st);

  // ---- Pladsen og parken ----
  fill(38, 38, 65, 65, 0, null);
  ground2(38, 38, 65, 65, B.PATH);
  for (let z = 38; z <= 65; z++) for (let x = 38; x <= 65; x++) if ((x + z) % 2 === 0 && (Math.abs(x - 51.5) + Math.abs(z - 51.5)) % 7 < 2) ground[idx(x, z)] = B.SAND;
  fill(79, 79, 92, 92, 0, null);
  ground2(79, 79, 92, 92, B.GRASS);

  // ---- Pejlemærker ----
  const clock: Style = { wall: B.STONE, trim: B.COBBLE, roof: 'slate' };
  fill(49, 49, 54, 54, 30, clock); // klokketårnet midt på pladsen
  const cath: Style = { wall: B.SANDSTONE, trim: B.SANDSTONE, roof: 'tile' };
  fill(57, 11, 71, 24, 15, cath); // katedralen
  fill(62, 15, 66, 19, 33, { wall: B.SANDSTONE, trim: B.COBBLE, roof: 'slate' }); // katedralens spir
  const watch: Style = { wall: B.COBBLE, trim: B.STONE, roof: 'slate' };
  for (const [x, z] of [[11, 11], [88, 11], [11, 88], [88, 88]]) fill(x, z, x + 4, z + 4, 26, watch); // vagttårne

  // Gaderne er altid åbne (også hvis en grund har ramt dem)
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (isStreet(x, streetsX) || isStreet(z, streetsZ)) {
    height[idx(x, z)] = 0; style[idx(x, z)] = null;
  }
  // Klokketårnet står på pladsen (gaderne krydser pladsen)
  fill(49, 49, 54, 54, 30, clock);

  // ---- Bymuren ----
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (x < 3 || z < 3 || x > W - 4 || z > D - 4) { height[idx(x, z)] = WALL_H; style[idx(x, z)] = { wall: B.STONE, trim: B.COBBLE, roof: 'flat' }; }
  }

  // ---- Byg voxels ----
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const h = height[idx(x, z)];
    const st = style[idx(x, z)];
    world.init(x, 0, z, h > 0 ? B.STONE : ground[idx(x, z)]);
    if (!h || !st) continue;
    for (let y = 1; y <= h; y++) world.init(x, y, z, y === h ? st.trim : st.wall);
  }
  // Tage og facader
  const edgeDist = new Int16Array(W * D).fill(99);
  {
    const q: number[] = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const h = height[idx(x, z)];
      let edge = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
        if (height[idx(nx, nz)] !== h) edge = true;
      }
      if (h > 0 && edge) { edgeDist[idx(x, z)] = 0; q.push(idx(x, z)); }
    }
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % W, z = Math.floor(c / W);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
        const n = idx(nx, nz);
        if (height[n] === height[c] && edgeDist[n] > edgeDist[c] + 1) { edgeDist[n] = edgeDist[c] + 1; q.push(n); }
      }
    }
  }
  const flatRoofs: { x: number; z: number; h: number; d: number }[] = [];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const h = height[idx(x, z)], st = style[idx(x, z)];
    if (!h || !st) continue;
    const e = edgeDist[idx(x, z)];
    const isWall = x < 3 || z < 3 || x > W - 4 || z > D - 4;
    if (isWall) {
      // brystværn med skydeskår
      if ((x < 1 || z < 1 || x > W - 2 || z > D - 2) && (x + z) % 2 === 0) world.init(x, h + 1, z, B.COBBLE);
      continue;
    }
    if (st.roof === 'flat') {
      if (e === 0) world.init(x, h + 1, z, st.trim); // lav kant at stå bag
      else if (e >= 2) flatRoofs.push({ x, z, h, d: e });
    } else {
      const steps = Math.min(e + 1, h > 24 ? 6 : 4);
      const mat = st.roof === 'slate' ? B.ROOF : B.ROOFTILE;
      for (let y = h + 1; y <= h + steps; y++) world.init(x, y, z, mat);
    }
  }
  // Vinduer i rækker og døre i gadeplan
  for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) {
    const h = height[idx(x, z)];
    if (!h || x < 3 || z < 3 || x > W - 4 || z > D - 4) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (height[idx(x + dx, z + dz)] >= h) continue;
      const along = dz !== 0 ? x : z;
      const open = height[idx(x + dx, z + dz)];
      for (let y = Math.max(2, open + 2); y < h - 1; y += 3) if (along % 3 === 1) world.init(x, y, z, B.WINDOW);
      if (open === 0 && along % 9 === 4) { world.init(x, 1, z, B.DOOR_LO); world.init(x, 2, z, B.DOOR_HI); }
    }
  }
  // Byporte (pynt på murens inderside, hvor kæmperne kommer ind)
  const gates: V3[] = [];
  const gate = (cells: [number, number][], spawn: V3) => {
    cells.forEach(([x, z], k) => {
      for (let y = 1; y <= 12; y++) world.init(x, y, z, k === 0 || k === cells.length - 1 || y === 12 ? B.LOG : B.PLANKS);
    });
    gates.push(spawn);
  };
  const span = (a: number) => Array.from({ length: 12 }, (_, k) => a - 6 + k);
  gate(span(52).map((x) => [x, 2] as [number, number]), { x: 51.5, y: 1, z: 7 });
  gate(span(52).map((x) => [x, D - 3] as [number, number]), { x: 51.5, y: 1, z: D - 7 });
  gate(span(52).map((z) => [2, z] as [number, number]), { x: 7, y: 1, z: 51.5 });
  gate(span(52).map((z) => [W - 3, z] as [number, number]), { x: W - 7, y: 1, z: 51.5 });
  // Bannere på pladsens bygninger og muren
  for (let z = 3; z < D - 3; z++) for (let x = 3; x < W - 3; x++) {
    const h = height[idx(x, z)];
    if (h < 10) continue;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => height[idx(x + dx, z + dz)] === 0);
    if (!nb) continue;
    const plaza = x >= 36 && x <= 67 && z >= 36 && z <= 67;
    if (plaza && (x * 7 + z * 3) % 11 === 0) for (let y = h - 4; y <= h - 2; y++) world.init(x, y, z, B.BANNER_A);
  }
  // Klokketårnets urskive (vinduer) og spir
  for (const y of [22, 23]) for (const [x, z] of [[51, 49], [52, 49], [51, 54], [52, 54], [49, 51], [49, 52], [54, 51], [54, 52]]) world.init(x, y, z, B.WINDOW);
  for (let y = 31; y <= 38; y++) { const r = Math.max(0, Math.floor((38 - y) / 2)); for (let z = 51 - r; z <= 52 + r; z++) for (let x = 51 - r; x <= 52 + r; x++) world.init(x, y, z, B.ROOF); }
  // Parkens træer
  for (const [x, z] of [[81, 82], [86, 81], [90, 85], [83, 88], [88, 90], [84, 85]]) {
    for (let y = 1; y <= 5; y++) world.init(x, y, z, B.LOG);
    for (let dy = 4; dy <= 7; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - 5) > 4) continue;
      if (world.get(x + dx, dy, z + dz) === B.AIR) world.init(x + dx, dy, z + dz, B.LEAVES);
    }
  }
  // Plantekummer og kasser langs pladsen (dækning fra jorden)
  for (const [x, z] of [[40, 40], [63, 40], [40, 63], [63, 63], [44, 46], [59, 57]]) { world.init(x, 1, z, B.PLANTER); world.init(x, 2, z, B.LEAVES); }
  for (const [x, z] of [[42, 58], [43, 58], [60, 44], [60, 45], [45, 61]]) world.init(x, 1, z, B.CRATE);

  // ---- Forsyningsdepoter: to på pladsen, tre på flade tage spredt i byen ----
  const depots: Depot[] = [
    { id: 0, pos: { x: 41.5, y: 1, z: 51.5 }, onRoof: false },
    { id: 1, pos: { x: 62.5, y: 1, z: 51.5 }, onRoof: false },
  ];
  const quads = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (const [qx, qz] of quads) {
    const cands = flatRoofs.filter((r) => (r.x < W / 2) === (qx === 0) && (r.z < D / 2) === (qz === 0) && r.d >= 3 && r.h >= 8 && r.h <= 20);
    if (!cands.length || depots.length >= 5) continue;
    cands.sort((a, b) => b.d - a.d);
    const c = cands[0];
    depots.push({ id: depots.length, pos: { x: c.x + 0.5, y: c.h + 1, z: c.z + 0.5 }, onRoof: true });
  }

  // ---- Felter hvor kæmper kan gå ----
  const open = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    let free = height[idx(x, z)] === 0;
    for (let y = 1; y <= 3 && free; y++) if (world.solidAt(x, y, z)) free = false;
    open[idx(x, z)] = free ? 1 : 0;
  }

  world.snapshot();
  return {
    id: 'bastionen',
    name: 'Bastionen',
    world, height, open, gates, depots,
    floor: new Int16Array(W * D).fill(1),
    water: null, waterY: 0, falls: [], mills: [], gate: null, torches: [], windowLights: [], dayCycle: false,
    ceiling: 40, fog: [70, 270], backdrop: 'city', radarScale: 1.8,
    spawn: { pos: { x: 47.5, y: 1, z: 63.5 }, yaw: -0.35 }, // på pladsen syd for klokketårnet, kig mod det
    landmarks: [
      { name: 'Klokketårnet', x: 51.5, z: 51.5, h: 38, label: 'TÅRN' },
      { name: 'Katedralen', x: 64, z: 17, h: 33, label: 'KATEDRAL' },
      { name: 'Vagttårn NV', x: 13, z: 13, h: 26 }, { name: 'Vagttårn NØ', x: 90, z: 13, h: 26 },
      { name: 'Vagttårn SV', x: 13, z: 90, h: 26 }, { name: 'Vagttårn SØ', x: 90, z: 90, h: 26 },
    ],
  };
}
