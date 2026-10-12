// Banen "Ravnsdalen": en eventyrdal omkranset af bjerge. Midt i dalen ligger kongeborgen på en klippe,
// syd for den en lille by, mod nord en flod med en stenbro, en skov af kæmpetræer og gamle ruiner,
// mod vest kornmarker med vindmøller og et vandfald – og et fyrtårn højt oppe på østbjerget.
// Kæmperne kommer ind gennem fire pas i bjergene (et af dem er en kløft, hvor floden løber ud).
import { B } from '../core/blocks';
import { VoxelWorld } from '../core/world';
import { Rng, clamp, type V3 } from '../core/math';
import type { CityMap, Depot, MillDef } from './city';

export const VALLEY_W = 208;
export const VALLEY_D = 208;
export const VALLEY_H = 72;
/** Højden man står i på dalbunden */
export const G = 2;

// ---------- Støj ----------
function hash(x: number, z: number, s: number) {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, s: number) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, z: number, s: number, oct = 4) {
  let t = 0, amp = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += vnoise(x * f, z * f, s + i * 17) * amp; n += amp; amp *= 0.5; f *= 2; }
  return t / n; // 0..1
}

/** Flodens midterlinje (z som funktion af x) */
export const riverZ = (x: number) => 70 + 7 * Math.sin(x / 24) + 3 * Math.sin(x / 9 + 1.3);
const RIVER_HALF = 4.5;
const RIVER_START = 24; // vandfaldet

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

export function buildValley(seed = 11): CityMap {
  const W = VALLEY_W, D = VALLEY_D, H = VALLEY_H;
  const rng = new Rng(seed);
  const world = new VoxelWorld(W, H, D);
  const idx = (x: number, z: number) => z * W + x;
  /** Hvor man står i hver søjle (terræn, før bygninger) */
  const top = new Int16Array(W * D).fill(G);
  /** 0 dalbund, 1 bjerg, 2 borgklippe, 3 flod, 4 pas/kløft */
  const kind = new Uint8Array(W * D);
  /** Overflade-blok på dalbunden */
  const surf = new Uint8Array(W * D).fill(B.GRASS);

  // ---------- Bjergene og passene ----------
  const passes: { ax: number; az: number; bx: number; bz: number; w: number }[] = [
    { ax: 61, az: 30, bx: 61, bz: -8, w: 7 }, // nord: Den gamle port
    { ax: 104, az: 176, bx: 104, bz: 216, w: 7 }, // syd: landevejen
    { ax: 34, az: 150, bx: -8, bz: 150, w: 7 }, // vest: ved markerne
  ];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, z, W - 1 - x, D - 1 - z);
    const n = fbm(x / 28, z / 28, seed);
    const ee = e + (n - 0.5) * 14;
    const t = clamp((24 - ee) / 24, 0, 1);
    let h = G + Math.round(Math.pow(t, 1.35) * 42 + (fbm(x / 9, z / 9, seed + 5) - 0.5) * 10 * t);
    // Vestbjerget er en stejl klippe der, hvor floden falder ud over kanten
    const zr = riverZ(RIVER_START);
    const jag = Math.abs(z - zr) < 4 ? 0 : Math.round(fbm(z / 4, x / 9, seed + 19) * 6);
    if (x < RIVER_START - jag && Math.abs(z - zr) < 16 + jag) h = Math.max(h, G + 24 + Math.round(fbm(x / 5, z / 5, seed + 9) * 10));
    // Pas: flad bund og stejle kløftvægge
    let pass = 99;
    for (const p of passes) pass = Math.min(pass, segDist(x, z, p.ax, p.az, p.bx, p.bz) - p.w);
    // Østkløften følger floden ud af dalen
    if (x > 170) pass = Math.min(pass, Math.abs(z - riverZ(x)) - 7);
    if (pass < 0) { h = G; kind[idx(x, z)] = 4; }
    else if (pass < 6) h = Math.min(h, G + Math.round(pass * 7));
    if (h > G && kind[idx(x, z)] !== 4) kind[idx(x, z)] = 1;
    top[idx(x, z)] = Math.min(H - 6, h);
  }
  // Vandfaldets rende øverst på klippen
  const zrW = riverZ(RIVER_START);
  const fallTop = G + 24;
  for (let z = Math.floor(zrW - 3); z <= Math.ceil(zrW + 3); z++) for (let x = 6; x < RIVER_START; x++) {
    if (Math.abs(z - zrW) > 2.6) { top[idx(x, z)] = Math.max(top[idx(x, z)], fallTop + 2); continue; }
    top[idx(x, z)] = fallTop - 1; // vandet står én blok nede i renden
  }

  // ---------- Borgklippen ----------
  const CX = 104, CZ = 105;
  for (let z = 70; z < 140; z++) for (let x = 70; x < 140; x++) {
    const r = Math.hypot(x - CX, z - CZ) + (fbm(x / 7, z / 7, seed + 3) - 0.5) * 4;
    if (r > 21) continue;
    const h = r < 11.5 ? G + 12 : G + Math.max(0, Math.round(12 * Math.pow((21 - r) / 9.5, 0.8)));
    if (h > G) { top[idx(x, z)] = h; kind[idx(x, z)] = 2; }
  }

  // ---------- Floden ----------
  for (let x = RIVER_START; x < W; x++) {
    const zr = riverZ(x);
    for (let z = Math.floor(zr - 8); z <= Math.ceil(zr + 8); z++) {
      if (z < 0 || z >= D) continue;
      const d = Math.abs(z - zr);
      const i = idx(x, z);
      if (d <= RIVER_HALF) { top[i] = G - 1; kind[i] = 3; surf[i] = B.GRAVEL; }
      else if (d <= RIVER_HALF + 2.2 && kind[i] !== 2) { top[i] = G; if (kind[i] === 1) kind[i] = 0; surf[i] = (x + z) % 3 ? B.SAND : B.GRAVEL; }
    }
  }

  // ---------- Overflader på dalbunden ----------
  // Marker mod vest (striber af korn og pløjet jord, adskilt af stier og hække)
  const FX0 = 24, FX1 = 66, FZ0 = 84, FZ1 = 184;
  for (let z = FZ0; z <= FZ1; z++) for (let x = FX0; x <= FX1; x++) {
    const i = idx(x, z);
    if (kind[i] !== 0) continue;
    const plotX = Math.floor((x - FX0) / 14), plotZ = Math.floor((z - FZ0) / 12);
    const lx = (x - FX0) % 14, lz = (z - FZ0) % 12;
    if (lx === 0 || lz === 0) { surf[i] = B.PATH; continue; }
    const crop = (plotX * 3 + plotZ * 5) % 4;
    surf[i] = crop === 0 ? B.WHEAT : crop === 1 ? (lz % 2 ? B.DIRT : B.WHEAT) : crop === 2 ? B.GRASS : B.DIRT;
  }
  // Veje: fra broen over borgen til sydpasset, til vestpasset og ned gennem byen
  const road = (ax: number, az: number, bx: number, bz: number, w: number, b: number) => {
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const i = idx(x, z);
      if (kind[i] === 1 || kind[i] === 2 || kind[i] === 3) continue;
      if (segDist(x, z, ax, az, bx, bz) <= w) surf[i] = b;
    }
  };
  road(104, 30, 104, 56, 2.5, B.PATH); // fra skoven ned til broen
  road(104, 76, 104, 84, 2.5, B.PATH);
  road(34, 150, 64, 150, 3.5, B.PATH); // vestpasset → byen
  road(61, 0, 61, 54, 3, B.GRAVEL); // gennem den gamle port
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (kind[idx(x, z)] === 4 && surf[idx(x, z)] === B.GRASS) surf[idx(x, z)] = (x * 7 + z * 3) % 5 ? B.GRAVEL : B.PATH;

  const pines: [number, number, number][] = [];
  // ---------- Byg terrænet ----------
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = idx(x, z), t = top[i], k = kind[i];
    world.init(x, 0, z, B.BEDROCK);
    if (k === 3) { world.init(x, 0, z, surf[i]); continue; } // flodleje: vand i lag 1
    if (k === 0 || k === 4) { world.init(x, 1, z, surf[i] === B.WHEAT ? B.DIRT : surf[i]); if (surf[i] === B.WHEAT) world.init(x, 1, z, B.DIRT); continue; }
    // bjerg/klippe: hældningen bestemmer græs eller klippe
    let maxDiff = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      maxDiff = Math.max(maxDiff, t - top[idx(nx, nz)]);
    }
    for (let y = 1; y < t; y++) world.init(x, y, z, B.ROCK);
    const tb = t - 1;
    let cap: number = B.ROCK;
    if (tb >= 36 + Math.round(fbm(x / 5, z / 5, seed + 7) * 6)) cap = B.SNOW;
    else if (maxDiff <= 2 && tb < 28) cap = B.GRASS;
    else if (k === 2 && maxDiff <= 2) cap = B.GRASS;
    world.init(x, tb, z, cap);
    // Graner på de grønne skråninger
    if (cap === B.GRASS && k === 1 && tb > G + 2 && hash(x, z, seed + 31) < 0.05) pines.push([x, z, t]);
  }
  for (const [x, z, b] of pines) {
    const hh = 3 + Math.floor(hash(x, z, 77) * 3);
    for (let y = b; y < b + hh; y++) world.init(x, y, z, B.LOG);
    for (let k = 0; k < 5; k++) {
      const r = Math.max(0, 2 - Math.floor(k / 2));
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > r + (k % 2 ? 0 : 1)) continue;
        if (world.get(x + dx, b + hh - 1 + k, z + dz) === B.AIR) world.init(x + dx, b + hh - 1 + k, z + dz, B.DARKLEAVES);
      }
    }
  }
  // Korn står en blok højt på markerne (kæmper træder hen over det)
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (surf[idx(x, z)] === B.WHEAT && kind[idx(x, z)] === 0) world.init(x, G, z, B.WHEAT);

  // ---------- Hjælpere til bygninger ----------
  const fillBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: number) => {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) world.init(x, y, z, b);
  };
  /** Murtinder langs kanten af en flade i højden y */
  const crenel = (x0: number, z0: number, x1: number, z1: number, y: number, b: number) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      if (edge && (x + z) % 2 === 0) world.init(x, y, z, b);
    }
  };
  /** Pyramidetag (tårne) */
  const spire = (x0: number, z0: number, x1: number, z1: number, y: number, b: number) => {
    for (let k = 0; ; k++) {
      if (x0 + k > x1 - k || z0 + k > z1 - k) break;
      fillBox(x0 + k, y + k, z0 + k, x1 - k, y + k, z1 - k, b);
    }
  };
  /** Hus med sadeltag (rygning langs den lange side). Bindingsværk giver stolper og bjælker i facaden. */
  const torches: V3[] = [];
  const windowLights: V3[] = [];
  const house = (x0: number, z0: number, x1: number, z1: number, base: number, h: number, wall: number, roof: number, timber: boolean, door: 'n' | 's' | 'e' | 'w') => {
    const along = x1 - x0 >= z1 - z0; // rygning langs x
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      for (let y = base; y < base + h; y++) {
        let b = edge ? wall : B.STONE;
        if (edge && timber) {
          const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
          const post = (along ? (x - x0) % 4 === 0 : (z - z0) % 4 === 0) && (z === z0 || z === z1 || x === x0 || x === x1);
          if (corner || post || (y - base) % 4 === 3) b = B.LOG;
        }
        if (edge && !timber && (y - base) % 4 === 3 && wall === B.PLASTER) b = B.SANDSTONE;
        world.init(x, y, z, b);
      }
      // gavl og tag
      const d = along ? Math.min(z - z0, z1 - z) : Math.min(x - x0, x1 - x);
      const gable = along ? x === x0 || x === x1 : z === z0 || z === z1;
      for (let y = base + h; y < base + h + d; y++) world.init(x, y, z, gable ? wall : B.STONE);
      world.init(x, base + h + d, z, roof);
    }
    // vinduer
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
      if (!edge || corner) continue;
      const a = x === x0 || x === x1 ? z - z0 : x - x0;
      if (a % 3 !== 2) continue;
      for (let y = base + 1; y < base + h - 1; y += 4) {
        world.init(x, y + 1, z, B.WINDOW);
        // Nogle vinduer har lys om natten
        if (hash(x, y * 7 + z, seed + 41) < 0.55) {
          const nx = x === x0 ? -1 : x === x1 ? 1 : 0, nz = nx ? 0 : z === z0 ? -1 : 1;
          windowLights.push({ x: x + 0.5 + nx * 0.53, y: y + 1.5, z: z + 0.5 + nz * 0.53 });
        }
      }
    }
    // dør
    const mx = Math.floor((x0 + x1) / 2), mz = Math.floor((z0 + z1) / 2);
    const [dx, dz] = door === 'n' ? [mx, z0] : door === 's' ? [mx, z1] : door === 'e' ? [x1, mz] : [x0, mz];
    world.init(dx, base, dz, B.DOOR_LO); world.init(dx, base + 1, dz, B.DOOR_HI);
    // Lygte ved døren
    const ox = door === 'e' ? 1 : door === 'w' ? -1 : 0, oz = door === 'n' ? -1 : door === 's' ? 1 : 0;
    torches.push({ x: dx + 0.5 + ox * 0.6 + (oz ? 1 : 0), y: base + 2.6, z: dz + 0.5 + oz * 0.6 + (ox ? 1 : 0) });
  };
  const tree = (x: number, z: number, h: number, leaves: number = B.LEAVES, r = 2) => {
    const b = surfaceY(x, z);
    for (let y = b; y < b + h; y++) world.init(x, y, z, B.LOG);
    for (let dy = -1; dy <= 2; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > r + 1) continue;
      if (world.get(x + dx, b + h + dy, z + dz) === B.AIR) world.init(x + dx, b + h + dy, z + dz, leaves);
    }
  };
  /** Første luftlag i en søjle (fra oven) */
  function surfaceY(x: number, z: number) {
    let y = H - 1;
    while (y > 0 && !world.solidAt(x, y - 1, z)) y--;
    return y;
  }

  // ---------- Kongeborgen ----------
  const P = G + 12; // man står på klippetoppen i denne højde
  fillBox(96, P - 1, 97, 112, P - 1, 113, B.COBBLE); // gårdens brosten
  // Ringmur
  const WT = P + 9; // murens gangsti
  for (let z = 95; z <= 115; z++) for (let x = 94; x <= 114; x++) {
    const wall = x <= 95 || x >= 113 || z <= 96 || z >= 114;
    if (!wall) continue;
    for (let y = 1; y < WT; y++) world.init(x, y, z, (x + y * 3 + z) % 9 === 0 ? B.MOSSSTONE : B.STONE);
  }
  crenel(94, 95, 114, 115, WT, B.STONE);
  // Hjørnetårne med skifertage
  for (const [tx, tz] of [[92, 93], [112, 93], [92, 113], [112, 113]]) {
    fillBox(tx, 1, tz, tx + 4, WT + 7, tz + 4, B.STONE);
    for (let y = P + 3; y < WT + 7; y += 4) { world.init(tx + 2, y, tz, B.WINDOW); world.init(tx + 2, y, tz + 4, B.WINDOW); world.init(tx, y, tz + 2, B.WINDOW); world.init(tx + 4, y, tz + 2, B.WINDOW); }
    spire(tx - 1 + 1, tz - 1 + 1, tx + 4, tz + 4, WT + 8, B.SLATE);
  }
  // Borgtårnet (hovedtårnet) midt i gården
  const KT = P + 30;
  fillBox(100, P, 101, 108, KT, 109, B.STONE);
  for (let y = P + 2; y < KT - 1; y += 4) for (let k = 1; k <= 7; k += 3) {
    if (hash(k, y, seed + 43) < 0.6) windowLights.push({ x: 100.5 + k, y: y + 0.5, z: 109 + 1.03 }, { x: 99.97, y: y + 0.5, z: 101.5 + k });
    world.init(100 + k, y, 101, B.WINDOW); world.init(100 + k, y, 109, B.WINDOW);
    world.init(100, y, 101 + k, B.WINDOW); world.init(108, y, 101 + k, B.WINDOW);
  }
  for (let y = KT - 9; y <= KT - 4; y++) { world.init(102, y, 109, B.BANNER_D); world.init(106, y, 109, B.BANNER_D); world.init(102, y, 101, B.BANNER_D); world.init(106, y, 101, B.BANNER_D); }
  crenel(100, 101, 108, 109, KT + 1, B.STONE);
  spire(101, 102, 107, 108, KT + 1, B.SLATE);
  fillBox(107, KT + 1, 108, 109, KT + 6, 110, B.STONE); // lille tårn på hjørnet
  spire(107, 108, 109, 110, KT + 7, B.SLATE);
  // Porthuset i sydmuren (startpunktet er på taget)
  const GH = P + 13;
  fillBox(99, 1, 112, 109, GH - 1, 117, B.STONE);
  fillBox(102, P, 112, 106, P + 4, 117, B.AIR); // portåbning
  fillBox(102, P, 116, 106, P + 4, 116, B.PLANKS);
  for (let y = P; y <= P + 4; y++) { world.init(102, y, 116, B.LOG); world.init(106, y, 116, B.LOG); }
  crenel(99, 112, 109, 117, GH, B.STONE);
  for (let y = GH - 6; y <= GH - 2; y++) { world.init(101, y, 117, B.BANNER_D); world.init(107, y, 117, B.BANNER_D); }
  // Gården: brønd, stald og kasser
  torches.push({ x: 97.9, y: P + 2.4, z: 100.6 });
  for (const [x, z] of [[96.5, 104.5], [112.5, 104.5], [104.5, 96.5], [104.5, 112.4]]) torches.push({ x, y: P + 9 + 1.6, z }); // på muren
  torches.push({ x: 100.5, y: P + 6, z: 118.2 }, { x: 108.5, y: P + 6, z: 118.2 }); // porthuset
  fillBox(97, P, 99, 98, P, 100, B.COBBLE); world.init(97, P + 1, 99, B.LOG); world.init(98, P + 1, 100, B.LOG);
  house(109, 97, 112, 100, P, 3, B.WOODWALL, B.ROOFTILE, false, 'w');
  for (const [x, z] of [[96, 107], [96, 108], [97, 108], [111, 110]]) world.init(x, P, z, B.CRATE);
  // Rampen ned ad klippen til Borgporten
  const R0 = 118, R1 = 136; // z
  for (let z = R0; z <= R1; z++) {
    const y = P - 1 - Math.round(((z - R0) / (R1 - R0)) * (P - 1 - (G - 1)));
    for (let x = 101; x <= 107; x++) {
      for (let yy = G - 1; yy <= y; yy++) world.init(x, yy, z, yy === y ? B.COBBLE : B.STONE);
      for (let yy = y + 1; yy < P + 2; yy++) if (world.get(x, yy, z) !== B.AIR && x > 101 && x < 107) world.init(x, yy, z, B.AIR);
    }
    for (const x of [100, 108]) for (let yy = G - 1; yy <= y + 1; yy++) world.init(x, yy, z, B.STONE);
  }
  // Borgporten: to tårne og en lukket port ved rampens fod
  for (const tx of [95, 109]) {
    fillBox(tx, G, 134, tx + 4, G + 15, 138, B.STONE);
    crenel(tx, 134, tx + 4, 138, G + 16, B.STONE);
    for (let y = G + 3; y < G + 15; y += 4) world.init(tx + 2, y, 138, B.WINDOW);
  }
  fillBox(100, G + 9, 136, 108, G + 12, 138, B.STONE); // portbue
  crenel(100, 136, 108, 138, G + 13, B.STONE);
  fillBox(101, G, 138, 107, G + 8, 138, B.PLANKS); // porten
  torches.push({ x: 97, y: G + 6, z: 139.4 }, { x: 111, y: G + 6, z: 139.4 });
  for (let y = G; y <= G + 8; y++) { world.init(101, y, 138, B.LOG); world.init(104, y, 138, B.LOG); world.init(107, y, 138, B.LOG); }
  for (let y = G + 3; y <= G + 8; y++) { world.init(99, y, 139, B.BANNER_D); world.init(109, y, 139, B.BANNER_D); }

  // ---------- Byen syd for borgen ----------
  const lots: [number, number, number, number][] = [
    [71, 147, 98, 163], [71, 172, 98, 184], [110, 172, 137, 184],
  ];
  const styles: { wall: number; roof: number; timber: boolean }[] = [
    { wall: B.PLASTER, roof: B.ROOFTILE, timber: true },
    { wall: B.PLASTER, roof: B.SLATE, timber: true },
    { wall: B.BRICK, roof: B.ROOFTILE, timber: false },
    { wall: B.STONE, roof: B.SLATE, timber: false },
    { wall: B.PLASTER, roof: B.ROOFTILE, timber: false },
  ];
  for (const [lx0, lz0, lx1, lz1] of lots) {
    // Del grunden i huse med smalle gyder imellem
    let x = lx0;
    while (x <= lx1 - 4) {
      const w = Math.min(lx1 - x + 1, 5 + rng.int(5));
      const half = Math.floor((lz1 - lz0) / 2);
      const rows: [number, number][] = rng.chance(0.6) ? [[lz0, lz0 + half - 1], [lz0 + half + 1, lz1]] : [[lz0, lz1]];
      for (const [z0, z1] of rows) {
        const near = 1 - Math.min(1, Math.hypot(x - CX, z0 - 140) / 60);
        const st = rng.pick(styles);
        house(x, z0, x + w - 1, z1, G, 5 + rng.int(4) + Math.round(near * 5), st.wall, st.roof, st.timber, z0 === lz0 ? 'n' : 's');
      }
      x += w + (rng.chance(0.45) ? 2 : 0);
    }
  }
  // Torvet med springvand og boder
  for (let z = 147; z <= 163; z++) for (let x = 110; x <= 137; x++) world.init(x, 1, z, (x + z) % 2 ? B.COBBLE : B.PATH);
  for (let z = 137; z <= 145; z++) for (let x = 64; x <= 146; x++) if (world.get(x, 1, z) === B.GRASS) world.init(x, 1, z, B.COBBLE);
  for (let z = 146; z <= 185; z++) for (const xs of [[64, 70], [99, 109], [138, 146]]) for (let x = xs[0]; x <= xs[1]; x++) if (world.get(x, 1, z) === B.GRASS || world.get(x, 1, z) === B.PATH) world.init(x, 1, z, B.COBBLE);
  for (let z = 164; z <= 171; z++) for (let x = 60; x <= 150; x++) if (world.get(x, 1, z) === B.GRASS) world.init(x, 1, z, B.COBBLE);
  // springvand (lavt – kæmper træder hen over det)
  for (let z = 152; z <= 158; z++) for (let x = 120; x <= 126; x++) {
    const ring = x === 120 || x === 126 || z === 152 || z === 158;
    if (ring) world.init(x, G, z, B.STONE);
  }
  // boder med markiser
  for (const [x, z] of [[112, 148], [133, 148], [112, 161], [133, 161]]) {
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 1], [2, 1]]) world.init(x + dx, G, z + dz, B.LOG);
    fillBox(x, G + 1, z, x + 2, G + 1, z + 1, x % 2 ? B.BANNER_A : B.BANNER_D);
    world.init(x + 1, G, z, B.CRATE);
  }
  // Vagttårne ved sydpasset
  for (const tx of [94, 110]) {
    fillBox(tx, G, 188, tx + 4, G + 21, 192, B.COBBLE);
    crenel(tx, 188, tx + 4, 192, G + 22, B.COBBLE);
  }

  // ---------- Markerne: vindmøller, gård, hække ----------
  const mills: MillDef[] = [];
  const mill = (cx: number, cz: number, speed: number) => {
    const hT = 14;
    for (let z = cz - 3; z <= cz + 3; z++) for (let x = cx - 3; x <= cx + 3; x++) {
      if (Math.abs(x - cx) + Math.abs(z - cz) > 5) continue; // ottekantet
      for (let y = G; y < G + hT; y++) world.init(x, y, z, (y - G) % 5 === 4 ? B.WOODWALL : B.PLASTER);
    }
    for (let k = 0; k < 5; k++) for (let z = cz - 3 + k; z <= cz + 3 - k; z++) for (let x = cx - 3 + k; x <= cx + 3 - k; x++) {
      if (Math.abs(x - cx) + Math.abs(z - cz) > 5 - k) continue;
      world.init(x, G + hT + k, z, B.ROOFTILE);
    }
    world.init(cx + 3, G + hT - 2, cz, B.LOG); world.init(cx + 4, G + hT - 2, cz, B.LOG); // navet
    world.init(cx - 3, G, cz, B.DOOR_LO); world.init(cx - 3, G + 1, cz, B.DOOR_HI);
    torches.push({ x: cx - 3.1, y: G + 2.6, z: cz + 1.5 });
    for (let y = G + 3; y < G + hT - 2; y += 4) { world.init(cx, y, cz - 3, B.WINDOW); world.init(cx, y, cz + 3, B.WINDOW); }
    mills.push({ hub: { x: cx + 5.1, y: G + hT - 1.5, z: cz + 0.5 }, yaw: Math.PI / 2, length: 10, speed });
  };
  mill(40, 100, 0.32);
  mill(36, 128, -0.27);
  mill(50, 172, 0.3);
  house(52, 110, 59, 115, G, 5, B.PLASTER, B.ROOFTILE, true, 'e'); // gården
  house(52, 119, 56, 124, G, 4, B.WOODWALL, B.ROOFTILE, false, 'e'); // lade
  for (const [x, z] of [[60, 118], [61, 118], [60, 119], [62, 121]]) { world.init(x, G, z, B.WHEAT); }
  // hække langs markvejene (lave – kæmper træder over dem)
  for (let z = FZ0; z <= FZ1; z += 12) for (let x = FX0; x <= FX1; x++) if (world.get(x, G, z) === B.AIR && world.get(x, 1, z) === B.PATH && (x * 13 + z) % 7 < 2) world.init(x, G, z, B.LEAVES);
  for (const [x, z] of [[30, 90], [62, 92], [28, 160], [64, 140], [44, 182]]) tree(x, z, 5, B.LEAVES, 2);

  // ---------- Stenbroen over floden ----------
  const zrB = riverZ(104);
  const BZ0 = Math.floor(zrB - 8), BZ1 = Math.ceil(zrB + 8);
  const deck = G + 5;
  for (let z = BZ0; z <= BZ1; z++) {
    const ramp = Math.min(z - BZ0, BZ1 - z);
    const y = Math.min(deck, G - 1 + ramp);
    for (let x = 100; x <= 108; x++) {
      if (y < deck) for (let yy = 1; yy < y; yy++) world.init(x, yy, z, B.STONE);
      world.init(x, y, z, x === 100 || x === 108 ? B.STONE : B.COBBLE);
      if (x === 100 || x === 108) world.init(x, y + 1, z, (z % 2) ? B.STONE : B.AIR);
    }
  }
  for (const pz of [Math.round(zrB - 3), Math.round(zrB + 3)]) fillBox(100, 0, pz, 108, deck - 1, pz + 1, B.STONE); // piller
  for (const x of [100, 108]) for (const z of [Math.round(zrB - 4), Math.round(zrB + 4)]) { fillBox(x, deck + 1, z, x, deck + 2, z, B.LOG); torches.push({ x: x + 0.5, y: deck + 3.3, z: z + 0.5 }); }
  for (let z = BZ0 + 2; z <= BZ1 - 2; z++) for (let x = 100; x <= 108; x++) if (world.get(x, deck - 1, z) === B.AIR) world.init(x, deck - 1, z, B.STONE); // buer under dækket

  // ---------- Kæmpeskoven (nordøst) ----------
  const forest: [number, number][] = [];
  const bigTree = (x: number, z: number, h: number, r: number, trunk: number) => {
    const b = surfaceY(x, z);
    for (let y = b; y < b + h; y++) fillBox(x, y, z, x + trunk - 1, y, z + trunk - 1, B.LOG);
    // rødder
    for (const [dx, dz] of [[-1, 0], [trunk, 0], [0, -1], [0, trunk]]) world.init(x + dx, b, z + dz, B.LOG);
    const cx = x + (trunk - 1) / 2, cz = z + (trunk - 1) / 2, cy = b + h - 1;
    const ry = Math.max(3, Math.round(r * 0.6));
    for (let dy = -ry; dy <= ry + 1; dy++) for (let dz = -r - 1; dz <= r + 1; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) {
      const d = (dx * dx + dz * dz) / (r * r) + (dy * dy) / (ry * ry);
      if (d > 1 + (fbm((cx + dx) / 3, (cz + dz + dy) / 3, seed + 11) - 0.5) * 0.5) continue;
      const X = Math.round(cx + dx), Y = cy + dy, Z = Math.round(cz + dz);
      if (world.get(X, Y, Z) === B.AIR) world.init(X, Y, Z, B.DARKLEAVES);
    }
    // grene
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= Math.floor(r * 0.7); k++) world.init(Math.round(cx + dx * k), cy - ry + 1, Math.round(cz + dz * k), B.LOG);
    forest.push([x, z]);
  };
  // Den ældgamle eg midt i skoven
  bigTree(148, 34, 36, 10, 5);
  for (let gz = 24; gz < 58; gz += 14) for (let gx = 116; gx < 186; gx += 15) {
    const x = gx + rng.int(5) - 2, z = gz + rng.int(5) - 2;
    if (Math.hypot(x - 150, z - 36) < 16) continue;
    if (Math.abs(z - riverZ(x)) < 11) continue;
    if (kind[idx(x, z)] !== 0) continue;
    if (x >= 140 && x <= 154 && z >= 46 && z <= 56) continue; // lysning
    bigTree(x, z, 22 + rng.int(8), 6 + rng.int(2), 3);
  }
  // skovbund: buske og væltede stammer (lave)
  for (let i = 0; i < 140; i++) {
    const x = 112 + rng.int(74), z = 22 + rng.int(36);
    if (kind[idx(x, z)] !== 0 || world.get(x, G, z) !== B.AIR || Math.abs(z - riverZ(x)) < 8) continue;
    world.init(x, G, z, rng.chance(0.75) ? B.LEAVES : B.LOG);
  }
  for (let z = 22; z < 58; z++) for (let x = 112; x < 186; x++) if (kind[idx(x, z)] === 0 && world.get(x, 1, z) === B.GRASS && fbm(x / 6, z / 6, seed + 13) > 0.6) world.init(x, 1, z, B.DIRT);

  // ---------- Ruinerne (nordvest) og Den gamle port ----------
  // Tempelfundament med søjlerækker
  fillBox(34, G, 28, 56, G, 44, B.MOSSSTONE);
  for (let x = 36; x <= 54; x += 6) for (const z of [30, 41]) {
    const hcol = rng.chance(0.35) ? 4 + rng.int(5) : 14;
    fillBox(x, G + 1, z, x + 1, G + hcol, z + 1, (x + z) % 3 ? B.MOSSSTONE : B.STONE);
    if (hcol === 14) fillBox(x - 1, G + 15, z - 1, x + 2, G + 15, z + 2, B.STONE); // kapitæl
  }
  fillBox(35, G + 16, 29, 49, G + 16, 32, B.MOSSSTONE); // en bjælke der stadig hænger
  // væltede søjler og murrester
  fillBox(72, G, 36, 80, G + 1, 37, B.MOSSSTONE);
  fillBox(40, G, 48, 41, G + 1, 55, B.STONE);
  for (const [x0, z0, x1, z1] of [[26, 26, 26, 40], [70, 28, 84, 28], [76, 40, 76, 50], [28, 48, 38, 48]]) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const hw = 2 + Math.round(fbm(x / 3, z / 3, seed + 21) * 7);
      if ((x + z) % 7 === 0) continue; // huller
      fillBox(x, G, z, x, G + hw, z, (x + z) % 2 ? B.MOSSSTONE : B.STONE);
    }
  }
  for (let i = 0; i < 40; i++) { const x = 26 + rng.int(64), z = 24 + rng.int(30); if (kind[idx(x, z)] === 0 && world.get(x, G, z) === B.AIR) world.init(x, G, z, rng.chance(0.5) ? B.MOSSSTONE : B.GRAVEL); }
  // Den gamle port: en kæmpebue over nordpasset
  const OG = 22; // z
  for (const px of [49, 68]) fillBox(px, G, OG - 3, px + 5, G + 32, OG + 2, B.MOSSSTONE);
  for (const x of [52, 70]) { world.init(x, G, OG + 3, B.MOSSSTONE); torches.push({ x: x + 0.5, y: G + 1.6, z: OG + 3.5 }); }
  fillBox(49, G + 25, OG - 3, 73, G + 32, OG + 2, B.MOSSSTONE);
  for (let x = 55; x <= 67; x++) { const arch = Math.round(6 - Math.sqrt(Math.max(0, 36 - (x - 61) ** 2))); if (arch > 0) fillBox(x, G + 25 - arch, OG - 3, x, G + 24, OG + 2, B.MOSSSTONE); }
  crenel(49, OG - 3, 73, OG + 2, G + 33, B.MOSSSTONE);
  for (let y = G + 26; y <= G + 30; y++) for (const x of [58, 61, 64]) world.init(x, y, OG + 2, B.STONE); // slidt relief
  for (let i = 0; i < 18; i++) { const x = 50 + rng.int(22), z = OG + 4 + rng.int(8); if (Math.abs(x - 61) > 5) world.init(x, G, z, B.MOSSSTONE); }

  // ---------- Østengen: lille landsby og frugtplantage ----------
  house(156, 148, 163, 153, G, 5, B.PLASTER, B.ROOFTILE, true, 'w');
  house(166, 157, 171, 164, G, 4, B.WOODWALL, B.SLATE, false, 'w');
  house(155, 166, 161, 171, G, 5, B.BRICK, B.ROOFTILE, false, 'n');
  for (let z = 92; z < 132; z += 7) for (let x = 150; x < 182; x += 7) if (kind[idx(x, z)] === 0 && Math.abs(z - riverZ(x)) > 9) tree(x + rng.int(3), z + rng.int(3), 4 + rng.int(2), B.LEAVES, 2);
  for (const [x, z] of [[150, 160], [151, 160], [150, 161]]) world.init(x, G, z, B.WHEAT); // høstak

  // ---------- Fyrtårnet på østbjerget ----------
  const LX = 193, LZ = 118;
  let lb = 0;
  for (let z = LZ - 3; z <= LZ + 3; z++) for (let x = LX - 3; x <= LX + 3; x++) lb = Math.max(lb, top[idx(x, z)]);
  for (let z = LZ - 4; z <= LZ + 4; z++) for (let x = LX - 4; x <= LX + 4; x++) { for (let y = 1; y < lb; y++) if (world.get(x, y, z) === B.AIR) world.init(x, y, z, B.ROCK); world.init(x, lb - 1, z, B.COBBLE); for (let y = lb; y < H; y++) world.init(x, y, z, B.AIR); }
  const LH = 20;
  for (let y = lb; y < lb + LH; y++) for (let z = LZ - 2; z <= LZ + 2; z++) for (let x = LX - 2; x <= LX + 2; x++) {
    if ((x === LX - 2 || x === LX + 2) && (z === LZ - 2 || z === LZ + 2)) continue;
    world.init(x, y, z, Math.floor((y - lb) / 4) % 2 ? B.BRICK : B.PLASTER);
  }
  fillBox(LX - 3, lb + LH, LZ - 3, LX + 3, lb + LH, LZ + 3, B.STONE); // altan
  crenel(LX - 3, LZ - 3, LX + 3, LZ + 3, lb + LH + 1, B.STONE);
  for (let y = lb + LH + 1; y <= lb + LH + 3; y++) for (const [x, z] of [[LX - 1, LZ - 1], [LX + 1, LZ - 1], [LX - 1, LZ + 1], [LX + 1, LZ + 1]]) world.init(x, y, z, B.STONE);
  spire(LX - 2, LZ - 2, LX + 2, LZ + 2, lb + LH + 4, B.SLATE);
  const lightY = lb + LH + 2;

  // ---------- Vagttårne ved vestpasset ----------
  for (const tz of [140, 157]) { fillBox(30, G, tz, 34, G + 20, tz + 4, B.COBBLE); crenel(30, tz, 34, tz + 4, G + 21, B.COBBLE); }

  // ---------- Kæmpernes felter og gulvhøjde ----------
  const floor = new Int16Array(W * D).fill(-1);
  const open = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = idx(x, z), k = kind[i];
    if (!(k === 0 || k === 3 || k === 4)) continue;
    const f = k === 3 ? G - 1 : G;
    floor[i] = f;
    // Lave ting (korn, hække, buske, kasser) må kæmperne træde over – ellers frit op til 14 m
    let free = !world.solidAt(x, f - 1, z) ? false : true;
    for (let y = f + 1; y <= f + 14 && free; y++) if (world.solidAt(x, y, z)) free = false;
    open[i] = free ? 1 : 0;
  }
  // Højden (til radar og tests)
  const height = new Int16Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) height[idx(x, z)] = surfaceY(x, z) - G;
  const water = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (kind[idx(x, z)] === 3) water[idx(x, z)] = 1;

  // ---------- Forsyninger ----------
  const depotAt = (x: number, z: number, onRoof: boolean): Depot => ({ id: 0, pos: { x: x + 0.5, y: surfaceY(x, z), z: z + 0.5 }, onRoof });
  const depots: Depot[] = [
    depotAt(97, 112, true), // borggården
    depotAt(128, 151, false), // torvet
    depotAt(146, 51, false), // skovlysningen
    depotAt(45, 36, false), // tempelruinen
    depotAt(60, 112, false), // gården
    depotAt(162, 158, false), // landsbyen
  ].map((d, i) => ({ ...d, id: i }));
  for (const d of depots) for (let z = Math.floor(d.pos.z) - 1; z <= Math.floor(d.pos.z) + 1; z++) for (let x = Math.floor(d.pos.x) - 1; x <= Math.floor(d.pos.x) + 1; x++) for (let y = d.pos.y; y < d.pos.y + 3; y++) if (world.get(x, y, z) !== B.AIR && world.get(x, y, z) !== B.LOG) world.init(x, y, z, B.AIR);

  // ---------- Vandfaldet ----------
  const falls = [{ x0: 6, z0: zrW - 2.6, x1: RIVER_START, z1: zrW + 2.6, yTop: fallTop - 0.2, yBottom: G - 0.2 }];

  // Borgporten: plankerne kæmperne slår huller i (i en fast, blandet rækkefølge)
  const gateCells: [number, number, number][] = [];
  for (let y = G; y <= G + 8; y++) for (let x = 101; x <= 107; x++) gateCells.push([x, y, 138]);
  gateCells.sort((a, b) => hash(a[0], a[1], seed + 51) - hash(b[0], b[1], seed + 51));

  world.snapshot();
  const gates: V3[] = [
    { x: 61.5, y: G, z: 8.5 }, // nord, gennem den gamle port
    { x: 104.5, y: G, z: 200.5 }, // syd
    { x: 8.5, y: G, z: 150.5 }, // vest
    { x: 200.5, y: G - 1, z: riverZ(200) + 0.5 }, // øst, op ad floden
  ];
  return {
    id: 'ravnsdalen',
    name: 'Ravnsdalen',
    world, height, open, floor, water, waterY: G - 0.2, falls, mills,
    ceiling: 62, fog: [90, 330], backdrop: 'mountains', radarScale: 1.3,
    gates, depots,
    gate: { cells: gateCells, attack: { x: 104.5, y: G, z: 143 }, center: { x: 104.5, y: G + 4, z: 139 }, name: 'Borgporten' },
    torches, windowLights, dayCycle: true,
    spawn: { pos: { x: 104.5, y: G + 13, z: 137.5 }, yaw: 0 }, // oven på Borgporten, med udsigt op ad rampen til borgen
    landmarks: [
      { name: 'Kongeborgen', x: 104.5, z: 105.5, h: KT + 8, label: 'BORG' },
      { name: 'Borgporten', x: 104.5, z: 138, h: G + 14, label: 'PORT' },
      { name: 'Den gamle port', x: 61.5, z: OG, h: G + 33, label: 'GAMLE PORT' },
      { name: 'Den ældgamle eg', x: 150.5, z: 36.5, h: 50, label: 'EGEN' },
      { name: 'Stenbroen', x: 104.5, z: zrB, h: deck, label: 'BRO' },
      { name: 'Fyrtårnet', x: LX + 0.5, z: LZ + 0.5, h: lightY, label: 'FYR', light: true },
      { name: 'Vindmøllerne', x: 40.5, z: 128.5, h: 20, label: 'MØLLER' },
    ],
  };
}
