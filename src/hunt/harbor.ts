// Banen "Saltvig": en havneby inderst i en fjord. Kæmperne kommer over bjergene gennem tre pas – og vadende ind
// gennem sundet fra havet. Byen ligger langs kajen: høje pakhuse, et torv foran Rådhuset (målet, som kæmperne
// angriber), en kirke med højt spir, træbrygger med fortøjede skibe (masterne er gode ankerpunkter for krogen),
// havnekraner, et fyrtårn ved sundet, et søfort på en klippeø og en fiskerlandsby på stranden mod øst.
import { B } from '../core/blocks';
import { VoxelWorld } from '../core/world';
import { Rng, clamp, type V3 } from '../core/math';
import type { CityMap, Depot, MillDef } from './city';

export const HARBOR_W = 192;
export const HARBOR_D = 192;
export const HARBOR_H = 64;
/** Højden man står i på land (vandets overflade ligger lige under) */
export const HG = 4;
/** Kajkanten: vandet går op til denne z langs byen */
const QUAY_Z = 91;
/** Sundet ud til havet */
const STRAIT_X0 = 84, STRAIT_X1 = 108, STRAIT_Z = 34;

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
  return t / n;
}
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

/** Er (x,z) vand i fjorden (bugten eller sundet)? */
export function harborWater(x: number, z: number) {
  if (x >= STRAIT_X0 && x <= STRAIT_X1 && z < STRAIT_Z + 6) return true;
  if (z > QUAY_Z) return false;
  const e = ((x - 96) / 56) ** 2 + ((z - 62) / 31) ** 2;
  return e < 1 + (fbm(x / 9, z / 9, 5) - 0.5) * 0.25;
}

export function buildHarbor(seed = 23): CityMap {
  const W = HARBOR_W, D = HARBOR_D, H = HARBOR_H, G = HG;
  const rng = new Rng(seed);
  const world = new VoxelWorld(W, H, D);
  const idx = (x: number, z: number) => z * W + x;
  const top = new Int16Array(W * D).fill(G);
  /** 0 land, 1 bjerg, 3 vand, 4 pas, 5 brygge (træ over vandet) */
  const kind = new Uint8Array(W * D);
  const surf = new Uint8Array(W * D).fill(B.GRASS);

  // ---------- Vand: bugten og sundet ----------
  const water = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (harborWater(x, z)) water[idx(x, z)] = 1;
  // Afstand til land (til vanddybden): 1–2 felter = lavt, længere ude = dybt
  const shore = new Int16Array(W * D).fill(99);
  const q: number[] = [];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (!water[idx(x, z)]) { shore[idx(x, z)] = 0; q.push(idx(x, z)); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % W, z = (i / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      const j = idx(nx, nz);
      if (shore[j] > shore[i] + 1) { shore[j] = shore[i] + 1; q.push(j); }
    }
  }

  // Afstand fra land til vandet (til strand og lave skrænter ved vandkanten)
  const wdist = new Int16Array(W * D).fill(99);
  const q2: number[] = [];
  for (let i = 0; i < W * D; i++) if (water[i]) { wdist[i] = 0; q2.push(i); }
  for (let k = 0; k < q2.length; k++) {
    const i = q2[k], x = i % W, z = (i / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      const j = idx(nx, nz);
      if (wdist[j] > wdist[i] + 1) { wdist[j] = wdist[i] + 1; q2.push(j); }
    }
  }

  // ---------- Bjergene og passene ----------
  const passes = [
    { ax: 34, az: 110, bx: -8, bz: 110, w: 6 }, // vest
    { ax: 158, az: 110, bx: 200, bz: 110, w: 6 }, // øst
    { ax: 96, az: 150, bx: 96, bz: 200, w: 7 }, // syd: landevejen
  ];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = idx(x, z);
    if (water[i]) {
      kind[i] = 3;
      const s = shore[i];
      top[i] = s <= 2 ? G - 1 : s <= 5 ? G - 2 : G - 3;
      surf[i] = (x + z) % 3 ? B.GRAVEL : B.SAND;
      continue;
    }
    const e = Math.min(x, z, W - 1 - x, D - 1 - z);
    const n = fbm(x / 30, z / 30, seed);
    const ee = e + (n - 0.5) * 40;
    const t = clamp((32 - ee) / 32, 0, 1);
    // Kamme og kløfter (ikke en jævn væg langs kanten), afsatser med græs og graner
    const ridge = 1 - Math.abs(fbm(x / 14, z / 14, seed + 3) * 2 - 1);
    const raw = Math.pow(t, 1.5) * (26 + ridge * 26) + (fbm(x / 6, z / 6, seed + 5) - 0.5) * 14 * t;
    let h = G + Math.max(0, Math.round(raw));
    let pass = 99;
    for (const p of passes) pass = Math.min(pass, segDist(x, z, p.ax, p.az, p.bx, p.bz) - p.w);
    if (pass < 0) { h = G; kind[i] = 4; }
    else if (pass < 6) h = Math.min(h, G + Math.round(pass * 7));
    // Byen og vejene ind til den ligger fladt
    if (x >= 34 && x <= 158 && z >= 90 && z <= 152) h = G;
    // Lave skrænter lige ved vandet
    if (wdist[i] <= 2 && h > G + 2) h = G + 2;
    else if (wdist[i] <= 8 && h > G + (wdist[i] - 2) * 3) h = G + (wdist[i] - 2) * 3;
    if (h > G && kind[i] !== 4) kind[i] = 1;
    top[i] = Math.min(H - 8, h);
  }

  // ---------- Overflader ----------
  const TOWN = { x0: 36, z0: 92, x1: 156, z1: 150 };
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = idx(x, z);
    if (kind[i] !== 0 && kind[i] !== 4) continue;
    if (x >= TOWN.x0 && x <= TOWN.x1 && z >= TOWN.z0 && z <= TOWN.z1) surf[i] = (x * 7 + z * 3) % 11 === 0 ? B.STONE : B.COBBLE;
    else if (wdist[i] <= 6 && x > 120) surf[i] = B.SAND; // stranden mod øst
    else if (wdist[i] <= 3) surf[i] = (x + z) % 4 ? B.GRAVEL : B.SAND;
    else if (kind[i] === 4) surf[i] = (x * 7 + z * 3) % 5 ? B.GRAVEL : B.PATH;
  }
  // Landevejen mod syd
  for (let z = TOWN.z1; z < D; z++) for (let x = 92; x <= 100; x++) if (kind[idx(x, z)] === 0 || kind[idx(x, z)] === 4) surf[idx(x, z)] = B.PATH;

  // ---------- Byg terrænet ----------
  const pines: [number, number, number][] = [];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = idx(x, z), t = top[i], k = kind[i];
    world.init(x, 0, z, B.BEDROCK);
    if (k === 3) { for (let y = 1; y < t; y++) world.init(x, y, z, y === t - 1 ? surf[i] : B.ROCK); continue; }
    if (k === 0 || k === 4) { for (let y = 1; y < G; y++) world.init(x, y, z, y === G - 1 ? surf[i] : B.ROCK); continue; }
    let maxDiff = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      maxDiff = Math.max(maxDiff, t - top[idx(nx, nz)]);
    }
    for (let y = 1; y < t; y++) world.init(x, y, z, B.ROCK);
    const tb = t - 1;
    let cap: number = B.ROCK;
    if (tb >= 38 + Math.round(fbm(x / 5, z / 5, seed + 7) * 6)) cap = B.SNOW;
    else if (maxDiff <= 2 && tb < 32) cap = B.GRASS;
    world.init(x, tb, z, cap);
    if (cap === B.GRASS && tb > G + 2 && hash(x, z, seed + 31) < 0.07) pines.push([x, z, t]);
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

  // ---------- Hjælpere ----------
  const fillBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: number) => {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) world.init(x, y, z, b);
  };
  const crenel = (x0: number, z0: number, x1: number, z1: number, y: number, b: number) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      if (edge && (x + z) % 2 === 0) world.init(x, y, z, b);
    }
  };
  const spire = (x0: number, z0: number, x1: number, z1: number, y: number, b: number) => {
    for (let k = 0; ; k++) {
      if (x0 + k > x1 - k || z0 + k > z1 - k) break;
      fillBox(x0 + k, y + k, z0 + k, x1 - k, y + k, z1 - k, b);
    }
  };
  const torches: V3[] = [];
  const windowLights: V3[] = [];
  /** Hus med sadeltag. Gavlen vender mod den korte side (pakhusene vender gavlen mod havnen). */
  const house = (x0: number, z0: number, x1: number, z1: number, base: number, h: number, wall: number, roof: number, timber: boolean, door: 'n' | 's' | 'e' | 'w', hatch = false) => {
    const along = x1 - x0 >= z1 - z0;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      for (let y = base; y < base + h; y++) {
        let b = edge ? wall : B.STONE;
        if (edge && timber) {
          const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
          const post = (along ? (x - x0) % 4 === 0 : (z - z0) % 4 === 0);
          if (corner || post || (y - base) % 4 === 3) b = B.LOG;
        }
        if (edge && !timber && (y - base) % 4 === 3 && wall === B.PLASTER) b = B.SANDSTONE;
        world.init(x, y, z, b);
      }
      const d = along ? Math.min(z - z0, z1 - z) : Math.min(x - x0, x1 - x);
      const gable = along ? x === x0 || x === x1 : z === z0 || z === z1;
      for (let y = base + h; y < base + h + d; y++) world.init(x, y, z, gable ? wall : B.STONE);
      world.init(x, base + h + d, z, roof);
    }
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
      if (!edge || corner) continue;
      const a = x === x0 || x === x1 ? z - z0 : x - x0;
      if (a % 3 !== 2) continue;
      for (let y = base + 1; y < base + h - 1; y += 4) {
        world.init(x, y + 1, z, B.WINDOW);
        if (hash(x, y * 7 + z, seed + 41) < 0.5) {
          const nx = x === x0 ? -1 : x === x1 ? 1 : 0, nz = nx ? 0 : z === z0 ? -1 : 1;
          windowLights.push({ x: x + 0.5 + nx * 0.53, y: y + 1.5, z: z + 0.5 + nz * 0.53 });
        }
      }
    }
    const mx = Math.floor((x0 + x1) / 2), mz = Math.floor((z0 + z1) / 2);
    const [dx, dz] = door === 'n' ? [mx, z0] : door === 's' ? [mx, z1] : door === 'e' ? [x1, mz] : [x0, mz];
    world.init(dx, base, dz, B.DOOR_LO); world.init(dx, base + 1, dz, B.DOOR_HI);
    // Pakhusene har en lem med en bjælke øverst i gavlen (hejsebjælke til varer)
    if (hatch && door === 'n') {
      for (let y = base + h - 3; y <= base + h - 1; y++) world.init(mx, y, z0, B.PLANKS);
      world.init(mx, base + h + 1, z0 - 1, B.LOG); world.init(mx, base + h + 1, z0 - 2, B.LOG);
    }
    const ox = door === 'e' ? 1 : door === 'w' ? -1 : 0, oz = door === 'n' ? -1 : door === 's' ? 1 : 0;
    torches.push({ x: dx + 0.5 + ox * 0.6 + (oz ? 1 : 0), y: base + 2.6, z: dz + 0.5 + oz * 0.6 + (ox ? 1 : 0) });
  };
  function surfaceY(x: number, z: number) {
    let y = H - 1;
    while (y > 0 && !world.solidAt(x, y - 1, z)) y--;
    return y;
  }
  /** Grund i en række smalle huse (gavlen mod nord) */
  const row = (x0: number, z0: number, x1: number, z1: number, hMin: number, hRnd: number, styles: { wall: number; roof: number; timber: boolean }[], door: 'n' | 's', hatch: boolean) => {
    let x = x0;
    while (x <= x1 - 4) {
      const w = Math.min(x1 - x + 1, 5 + rng.int(3));
      const st = rng.pick(styles);
      house(x, z0, x + w - 1, z1, G, hMin + rng.int(hRnd), st.wall, st.roof, st.timber, door, hatch);
      x += w + (rng.chance(0.25) ? 1 : 0);
    }
  };

  // ---------- Kajen ----------
  for (let x = TOWN.x0; x <= TOWN.x1; x++) {
    if (!water[idx(x, QUAY_Z)]) continue;
    // kajmuren: stensat kant ned i vandet
    for (let y = 1; y < G; y++) world.init(x, y, QUAY_Z + 1, B.STONE);
    if (x % 8 === 0) world.init(x, G, QUAY_Z + 1, B.LOG); // pullerter
    if (x % 12 === 6) { world.init(x, G, QUAY_Z + 2, B.LOG); world.init(x, G + 1, QUAY_Z + 2, B.LOG); torches.push({ x: x + 0.5, y: G + 2.4, z: QUAY_Z + 2.5 }); }
  }

  // ---------- Bryggerne ----------
  const pier = (x0: number, x1: number, zEnd: number) => {
    for (let z = zEnd; z <= QUAY_Z; z++) for (let x = x0; x <= x1; x++) {
      const i = idx(x, z);
      kind[i] = 5;
      for (let y = top[i]; y < G - 1; y++) world.init(x, y, z, B.AIR);
      world.init(x, G - 1, z, B.PLANKS);
      if ((x === x0 || x === x1) && (z - zEnd) % 4 === 0) for (let y = top[i] - 1; y < G - 1; y++) world.init(x, y, z, B.LOG);
    }
    for (const x of [x0, x1]) { world.init(x, G, zEnd, B.LOG); torches.push({ x: x + 0.5, y: G + 1.4, z: zEnd + 0.5 }); }
  };
  pier(60, 63, 70);
  pier(126, 129, 70);
  pier(94, 98, 84); // kort brygge ud for torvet

  // ---------- Skibene ----------
  /** Skib med stævnen mod nord. Skroget står på bunden; dækket i HG+2. Master af træ, rær og sejl. */
  const ship = (cx: number, z0: number, z1: number, half: number, masts: [number, number][]) => {
    const deck = G + 2;
    for (let z = z0; z <= z1; z++) {
      const bow = Math.pow(clamp((z - z0) / 7, 0, 1), 0.55), stern = clamp((z1 - z) / 2.5, 0.55, 1);
      const hw = Math.max(0.6, half * Math.min(bow, stern));
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const i = idx(x, z);
        const bed = top[i] - 1;
        const edge = x === Math.round(cx - hw) || x === Math.round(cx + hw) || z === z0 || z === z1;
        for (let y = bed; y <= deck; y++) {
          if (y < G - 1 && !edge) continue; // hult indeni under vandlinjen
          world.init(x, y, z, edge ? (y === G ? B.LOG : y === deck ? B.LOG : B.PLANKS) : y === deck ? B.PLANKS : B.WOODWALL);
        }
        if (edge && (x + z) % 2 === 0) world.init(x, deck + 1, z, B.PLANKS); // ræling
        kind[i] = 3; // stadig vand (kæmper kan ikke gå her – skroget spærrer)
      }
    }
    // Agterkastel med kahyt
    for (let z = z1 - 5; z <= z1; z++) for (let x = Math.round(cx - half + 1); x <= Math.round(cx + half - 1); x++) {
      const edge = z === z1 - 5 || x === Math.round(cx - half + 1) || x === Math.round(cx + half - 1);
      for (let y = deck + 1; y <= deck + 3; y++) world.init(x, y, z, edge ? (y === deck + 2 && (x + z) % 2 ? B.WINDOW : B.WOODWALL) : B.AIR);
      world.init(x, deck + 4, z, B.PLANKS);
    }
    torches.push({ x: cx + 0.5, y: deck + 5.2, z: z1 + 0.5 });
    // Bovspryd
    for (let k = 1; k <= 6; k++) world.init(Math.round(cx), deck + Math.floor(k / 2), z0 - k, B.LOG);
    // Master, rær og sejl
    for (const [mz, mh] of masts) {
      for (let y = deck + 1; y <= deck + mh; y++) world.init(Math.round(cx), y, mz, B.LOG);
      const yards = [deck + Math.round(mh * 0.35), deck + Math.round(mh * 0.7)];
      for (const [k, yy] of yards.entries()) {
        const span = Math.round(half + 3 - k * 2);
        for (let x = Math.round(cx) - span; x <= Math.round(cx) + span; x++) world.init(x, yy, mz, B.LOG);
        // sejlet hænger lige agten for masten, under ræet
        const sh = k === 0 ? Math.round(mh * 0.3) : Math.round(mh * 0.25);
        for (let y = yy - sh; y < yy; y++) for (let x = Math.round(cx) - span + 1; x <= Math.round(cx) + span - 1; x++) {
          const belly = (y - (yy - sh)) / sh; // let bugnende
          world.init(x, y, mz + 1 + (Math.abs(x - cx) < span * 0.5 && belly > 0.3 ? 1 : 0), B.SAIL);
        }
      }
      for (let y = deck + mh + 1; y <= deck + mh + 3; y++) world.init(Math.round(cx), y, mz + 1, B.BANNER_A); // vimpel
      torches.push({ x: cx + 0.5, y: deck + mh + 0.8, z: mz + 0.5 });
    }
  };
  ship(112, 47, 72, 5, [[53, 22], [60, 26], [67, 20]]); // "Havørnen" ude i bugten
  ship(69, 64, 84, 3, [[69, 16], [76, 18]]);
  ship(134, 60, 80, 3, [[65, 17], [72, 15]]);

  // ---------- Havnekraner ----------
  const crane = (x: number, z: number, armX: number) => {
    const hC = 18;
    fillBox(x, G, z, x + 1, G + hC, z + 1, B.LOG);
    for (let y = G + 3; y < G + hC; y += 5) fillBox(x - 1, y, z - 1, x + 2, y, z + 2, B.PLANKS);
    // armen ud over vandet
    for (let k = 0; k <= 10; k++) world.init(x, G + hC, z - k, B.LOG);
    for (let k = 1; k <= 4; k++) world.init(x, G + hC - k, z - 10, B.LOG);
    world.init(x, G + hC - 5, z - 10, B.CRATE);
    void armX;
    torches.push({ x: x + 0.5, y: G + hC + 1.2, z: z - 9.5 });
  };
  crane(54, 93, 0);
  crane(136, 93, 0);

  // ---------- Pakhusene langs kajen (gavlene mod havnen) ----------
  const WARE = [
    { wall: B.BRICK, roof: B.SLATE, timber: false },
    { wall: B.BRICK, roof: B.ROOFTILE, timber: false },
    { wall: B.PLASTER, roof: B.ROOFTILE, timber: true },
    { wall: B.WOODWALL, roof: B.SLATE, timber: false },
    { wall: B.STONE, roof: B.SLATE, timber: false },
  ];
  row(38, 96, 52, 105, 9, 5, WARE, 'n', true);
  row(61, 96, 79, 105, 9, 5, WARE, 'n', true);
  row(113, 96, 131, 105, 9, 5, WARE, 'n', true);
  row(140, 96, 154, 105, 9, 5, WARE, 'n', true);

  // ---------- Anden husrække ----------
  const HOUSES = [
    { wall: B.PLASTER, roof: B.ROOFTILE, timber: true },
    { wall: B.PLASTER, roof: B.SLATE, timber: true },
    { wall: B.BRICK, roof: B.ROOFTILE, timber: false },
    { wall: B.PLASTER, roof: B.ROOFTILE, timber: false },
  ];
  row(38, 114, 52, 124, 5, 4, HOUSES, 'n', false);
  row(38, 128, 52, 138, 5, 4, HOUSES, 's', false);
  row(61, 114, 79, 124, 5, 4, HOUSES, 'n', false);
  row(61, 128, 79, 138, 5, 4, HOUSES, 's', false);
  row(140, 114, 154, 124, 5, 4, HOUSES, 'n', false);
  row(140, 128, 154, 138, 5, 4, HOUSES, 's', false);

  // ---------- Rådhuset (målet) med klokketårn ----------
  const RX0 = 84, RX1 = 108, RZ0 = 124, RZ1 = 138, RH = G + 12;
  for (let z = RZ0; z <= RZ1; z++) for (let x = RX0; x <= RX1; x++) {
    const edge = x === RX0 || x === RX1 || z === RZ0 || z === RZ1;
    for (let y = G; y < RH; y++) world.init(x, y, z, edge ? ((y - G) % 4 === 3 ? B.SANDSTONE : B.BRICK) : B.STONE);
    world.init(x, RH, z, B.COBBLE); // fladt tag
  }
  crenel(RX0, RZ0, RX1, RZ1, RH + 1, B.SANDSTONE);
  for (let x = RX0 + 2; x <= RX1 - 2; x += 3) for (let y = G + 2; y < RH - 1; y += 4) {
    if (x >= 91 && x <= 101 && y < G + 9) continue; // porten
    world.init(x, y, RZ0, B.WINDOW); world.init(x, y, RZ1, B.WINDOW);
    windowLights.push({ x: x + 0.5, y: y + 0.5, z: RZ0 - 0.03 });
  }
  // Rådhusporten: tunge planker, som kæmperne slår huller i
  const gateCells: [number, number, number][] = [];
  for (let y = G; y <= G + 7; y++) for (let x = 92; x <= 100; x++) {
    world.init(x, y, RZ0, B.PLANKS);
    gateCells.push([x, y, RZ0]);
  }
  for (let y = G; y <= G + 7; y++) { world.init(92, y, RZ0, B.LOG); world.init(96, y, RZ0, B.LOG); world.init(100, y, RZ0, B.LOG); }
  fillBox(91, G + 8, RZ0, 101, G + 8, RZ0, B.SANDSTONE); // overligger
  for (let y = G + 2; y <= G + 7; y++) { world.init(90, y, RZ0 - 1, B.BANNER_D); world.init(102, y, RZ0 - 1, B.BANNER_D); }
  torches.push({ x: 89.6, y: G + 5, z: RZ0 - 0.6 }, { x: 103.4, y: G + 5, z: RZ0 - 0.6 });
  gateCells.sort((a, b) => hash(a[0], a[1], seed + 51) - hash(b[0], b[1], seed + 51));
  // Klokketårnet
  const TX0 = 92, TZ0 = 128, TT = G + 30;
  fillBox(TX0, RH + 1, TZ0, TX0 + 8, TT, TZ0 + 8, B.BRICK);
  for (let y = RH + 3; y < TT - 2; y += 4) for (const k of [2, 6]) {
    world.init(TX0 + k, y, TZ0, B.WINDOW); world.init(TX0 + k, y, TZ0 + 8, B.WINDOW);
    world.init(TX0, y, TZ0 + k, B.WINDOW); world.init(TX0 + 8, y, TZ0 + k, B.WINDOW);
  }
  // urskive mod torvet
  fillBox(TX0 + 2, TT - 6, TZ0 - 1, TX0 + 6, TT - 2, TZ0 - 1, B.SANDSTONE);
  world.init(TX0 + 4, TT - 4, TZ0 - 2, B.LOG); world.init(TX0 + 4, TT - 3, TZ0 - 2, B.LOG); world.init(TX0 + 5, TT - 4, TZ0 - 2, B.LOG);
  windowLights.push({ x: TX0 + 4.5, y: TT - 4, z: TZ0 - 2.1 });
  crenel(TX0, TZ0, TX0 + 8, TZ0 + 8, TT + 1, B.SANDSTONE);
  spire(TX0 + 1, TZ0 + 1, TX0 + 7, TZ0 + 7, TT + 1, B.SLATE);

  // ---------- Torvet ----------
  for (let z = 96; z <= 122; z++) for (let x = 81; x <= 111; x++) world.init(x, G - 1, z, (x + z) % 2 ? B.COBBLE : B.PATH);
  // springvand og boder (lave – kæmper træder over dem)
  for (let z = 104; z <= 110; z++) for (let x = 93; x <= 99; x++) if (x === 93 || x === 99 || z === 104 || z === 110) world.init(x, G, z, B.STONE);
  world.init(96, G, 107, B.STONE); world.init(96, G + 1, 107, B.MOSSSTONE);
  for (const [x, z] of [[83, 98], [107, 98], [83, 117], [107, 117]]) {
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 1], [2, 1]]) world.init(x + dx, G, z + dz, B.LOG);
    fillBox(x, G + 1, z, x + 2, G + 1, z + 1, x < 96 ? B.BANNER_A : B.BANNER_D);
    world.init(x + 1, G, z, B.CRATE);
  }
  for (const [x, z] of [[82, 112], [110, 112], [82, 101], [110, 101]]) { world.init(x, G, z, B.LOG); torches.push({ x: x + 0.5, y: G + 1.4, z: z + 0.5 }); }

  // ---------- Kirken med højt spir ----------
  const CX0 = 116, CX1 = 130, CZ0 = 121, CZ1 = 140;
  house(CX0, CZ0, CX1, CZ1, G, 9, B.STONE, B.SLATE, false, 'n');
  for (let z = CZ0 + 3; z <= CZ1 - 3; z += 4) for (let y = G + 2; y <= G + 6; y++) { world.init(CX0, y, z, B.WINDOW); world.init(CX1, y, z, B.WINDOW); }
  const KX = 120, KZ = 114, KT = G + 26;
  fillBox(KX, G, KZ, KX + 6, KT, KZ + 6, B.STONE);
  for (let y = G + 4; y < KT - 1; y += 5) { world.init(KX + 3, y, KZ, B.WINDOW); world.init(KX, y, KZ + 3, B.WINDOW); world.init(KX + 6, y, KZ + 3, B.WINDOW); }
  world.init(KX + 3, G, KZ, B.DOOR_LO); world.init(KX + 3, G + 1, KZ, B.DOOR_HI);
  crenel(KX, KZ, KX + 6, KZ + 6, KT + 1, B.STONE);
  spire(KX, KZ, KX + 6, KZ + 6, KT + 1, B.SLATE);
  for (let y = KT + 5; y <= KT + 14; y++) world.init(KX + 3, y, KZ + 3, y < KT + 12 ? B.SLATE : B.LOG); // spirets top
  world.init(KX + 2, KT + 12, KZ + 3, B.LOG); world.init(KX + 4, KT + 12, KZ + 3, B.LOG); // kors
  torches.push({ x: KX + 3.5, y: G + 2.6, z: KZ - 0.6 });
  // kirkegård med lave sten
  for (let z = 142; z <= 148; z += 2) for (let x = 117; x <= 129; x += 3) world.init(x, G, z, B.MOSSSTONE);

  // ---------- Fyrtårnet ved sundet ----------
  const LX = 72, LZ = 30;
  const lb = surfaceY(LX, LZ);
  for (let z = LZ - 3; z <= LZ + 3; z++) for (let x = LX - 3; x <= LX + 3; x++) { for (let y = 1; y < lb; y++) if (world.get(x, y, z) === B.AIR) world.init(x, y, z, B.ROCK); world.init(x, lb - 1, z, B.COBBLE); for (let y = lb; y < H; y++) world.init(x, y, z, B.AIR); }
  const LH = 22;
  for (let y = lb; y < lb + LH; y++) for (let z = LZ - 2; z <= LZ + 2; z++) for (let x = LX - 2; x <= LX + 2; x++) {
    if ((x === LX - 2 || x === LX + 2) && (z === LZ - 2 || z === LZ + 2)) continue;
    world.init(x, y, z, Math.floor((y - lb) / 4) % 2 ? B.BRICK : B.PLASTER);
  }
  fillBox(LX - 3, lb + LH, LZ - 3, LX + 3, lb + LH, LZ + 3, B.STONE);
  crenel(LX - 3, LZ - 3, LX + 3, LZ + 3, lb + LH + 1, B.STONE);
  for (let y = lb + LH + 1; y <= lb + LH + 3; y++) for (const [x, z] of [[LX - 1, LZ - 1], [LX + 1, LZ - 1], [LX - 1, LZ + 1], [LX + 1, LZ + 1]]) world.init(x, y, z, B.STONE);
  spire(LX - 2, LZ - 2, LX + 2, LZ + 2, lb + LH + 4, B.SLATE);
  const lightY = lb + LH + 2;

  // ---------- Søfortet på klippeøen ----------
  const FX = 124, FZ = 40;
  for (let z = FZ - 6; z <= FZ + 6; z++) for (let x = FX - 6; x <= FX + 6; x++) {
    const r = Math.hypot(x - FX, z - FZ) + (fbm(x / 3, z / 3, seed + 3) - 0.5) * 2;
    if (r > 6) continue;
    const i = idx(x, z);
    kind[i] = 1; water[i] = 0;
    for (let y = 1; y <= G + 1; y++) world.init(x, y, z, B.ROCK);
  }
  for (let z = FZ - 4; z <= FZ + 4; z++) for (let x = FX - 4; x <= FX + 4; x++) {
    const r = Math.hypot(x - FX, z - FZ);
    if (r > 4.3) continue;
    for (let y = G + 2; y <= G + 14; y++) world.init(x, y, z, r > 3.2 ? ((x + y + z) % 7 === 0 ? B.MOSSSTONE : B.STONE) : B.AIR);
    world.init(x, G + 14, z, B.STONE);
    if (r > 3.2 && (x + z) % 2 === 0) world.init(x, G + 15, z, B.STONE);
  }
  for (const [x, z] of [[FX, FZ - 4], [FX + 4, FZ], [FX - 4, FZ]]) for (let y = G + 6; y <= G + 11; y += 5) world.init(x, y, z, B.WINDOW);
  for (let y = G + 15; y <= G + 19; y++) world.init(FX, y, FZ, B.LOG);
  for (let y = G + 17; y <= G + 19; y++) world.init(FX + 1, y, FZ, B.BANNER_D);
  torches.push({ x: FX + 0.5, y: G + 15.5, z: FZ - 4.6 });

  // ---------- Fiskerlandsbyen på stranden mod øst ----------
  const fish = [[150, 56, 155, 61], [158, 66, 163, 71], [147, 76, 152, 81]];
  for (const [x0, z0, x1, z1] of fish) {
    let ok = true;
    for (let z = z0; z <= z1 && ok; z++) for (let x = x0; x <= x1 && ok; x++) if (kind[idx(x, z)] !== 0) ok = false;
    if (ok) house(x0, z0, x1, z1, G, 4, B.WOODWALL, B.ROOFTILE, false, 'w');
  }
  // tørrestativer og trukne både
  for (const [x, z] of [[144, 66], [144, 70], [156, 84]]) if (kind[idx(x, z)] === 0) { world.init(x, G, z, B.LOG); world.init(x, G + 1, z, B.LOG); world.init(x + 2, G, z, B.LOG); world.init(x + 2, G + 1, z, B.LOG); world.init(x + 1, G + 1, z, B.PLANKS); }
  for (const [x, z] of [[140, 60], [138, 74]]) if (kind[idx(x, z)] === 0 && kind[idx(x, z + 3)] === 0) { for (let k = 0; k < 4; k++) world.init(x, G, z + k, B.PLANKS); world.init(x + 1, G, z + 1, B.PLANKS); world.init(x + 1, G, z + 2, B.PLANKS); }

  // ---------- Vindmølle på vestbakken ----------
  const mills: MillDef[] = [];
  const MX = 30, MZ = 80;
  {
    const hT = 14;
    for (let z = MZ - 4; z <= MZ + 4; z++) for (let x = MX - 4; x <= MX + 4; x++) { for (let y = G; y < H; y++) world.init(x, y, z, B.AIR); }
    for (let z = MZ - 3; z <= MZ + 3; z++) for (let x = MX - 3; x <= MX + 3; x++) {
      if (Math.abs(x - MX) + Math.abs(z - MZ) > 5) continue;
      for (let y = G; y < G + hT; y++) world.init(x, y, z, (y - G) % 5 === 4 ? B.WOODWALL : B.PLASTER);
    }
    for (let k = 0; k < 5; k++) for (let z = MZ - 3 + k; z <= MZ + 3 - k; z++) for (let x = MX - 3 + k; x <= MX + 3 - k; x++) {
      if (Math.abs(x - MX) + Math.abs(z - MZ) > 5 - k) continue;
      world.init(x, G + hT + k, z, B.ROOFTILE);
    }
    world.init(MX + 3, G + hT - 2, MZ, B.LOG); world.init(MX + 4, G + hT - 2, MZ, B.LOG);
    mills.push({ hub: { x: MX + 5.1, y: G + hT - 1.5, z: MZ + 0.5 }, yaw: Math.PI / 2, length: 10, speed: 0.3 });
    torches.push({ x: MX - 3.1, y: G + 2.6, z: MZ + 1.5 });
  }

  // ---------- Træer på engen bag byen ----------
  for (let z = 154; z < 172; z += 6) for (let x = 40; x < 152; x += 7) {
    const tx = x + rng.int(3), tz = z + rng.int(3);
    if (kind[idx(tx, tz)] !== 0 || Math.abs(tx - 96) < 8) continue;
    const b = surfaceY(tx, tz);
    for (let y = b; y < b + 4; y++) world.init(tx, y, tz, B.LOG);
    for (let dy = -1; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 3) continue;
      if (world.get(tx + dx, b + 4 + dy, tz + dz) === B.AIR) world.init(tx + dx, b + 4 + dy, tz + dz, B.LEAVES);
    }
  }
  // vagttårne ved passene
  for (const [tx, tz] of [[30, 98], [30, 118], [158, 98], [158, 118], [83, 158], [105, 158]]) { fillBox(tx, G, tz, tx + 4, G + 18, tz + 4, B.COBBLE); crenel(tx, tz, tx + 4, tz + 4, G + 19, B.COBBLE); }

  // ---------- Kæmpernes felter og gulvhøjde ----------
  const floor = new Int16Array(W * D).fill(-1);
  const open = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = idx(x, z), k = kind[i];
    if (!(k === 0 || k === 3 || k === 4 || k === 5)) continue;
    const f = k === 3 ? top[i] : G;
    floor[i] = f;
    let free = world.solidAt(x, f - 1, z);
    for (let y = f + 1; y <= f + 14 && free; y++) if (world.solidAt(x, y, z)) free = false;
    open[i] = free ? 1 : 0;
  }
  const height = new Int16Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) height[idx(x, z)] = surfaceY(x, z) - G;

  // ---------- Forsyninger ----------
  const depotAt = (x: number, z: number, onRoof: boolean): Depot => ({ id: 0, pos: { x: x + 0.5, y: surfaceY(x, z), z: z + 0.5 }, onRoof });
  const depots: Depot[] = [
    depotAt(104, 131, true), // Rådhusets tag
    depotAt(88, 108, false), // torvet
    depotAt(61, 74, false), // vestbryggen
    depotAt(134, 144, false), // kirkegården
    depotAt(146, 88, false), // stranden
    depotAt(57, 145, false), // bag byen mod vest
  ].map((d, i) => ({ ...d, id: i }));
  for (const d of depots) for (let z = Math.floor(d.pos.z) - 1; z <= Math.floor(d.pos.z) + 1; z++) for (let x = Math.floor(d.pos.x) - 1; x <= Math.floor(d.pos.x) + 1; x++) for (let y = d.pos.y; y < d.pos.y + 3; y++) if (world.get(x, y, z) !== B.AIR && world.get(x, y, z) !== B.LOG) world.init(x, y, z, B.AIR);

  world.snapshot();
  const gates: V3[] = [
    { x: 96.5, y: G - 3, z: 4.5 }, // sundet – fra havet
    { x: 6.5, y: G, z: 110.5 }, // vest
    { x: 185.5, y: G, z: 110.5 }, // øst
    { x: 96.5, y: G, z: 186.5 }, // syd
  ];
  return {
    id: 'saltvig',
    name: 'Saltvig',
    world, height, open, floor, water, waterY: G - 0.2, falls: [], mills,
    ceiling: 58, fog: [90, 320], backdrop: 'fjord', radarScale: 1.35,
    gates, depots,
    gate: { cells: gateCells, attack: { x: 96.5, y: G, z: 118.5 }, center: { x: 96.5, y: G + 4, z: RZ0 + 0.5 }, name: 'Rådhusporten' },
    torches, windowLights, dayCycle: true,
    spawn: { pos: { x: 90.5, y: RH + 1, z: 127.5 }, yaw: 0 }, // på Rådhusets tag, udsigt over torvet og havnen
    landmarks: [
      { name: 'Rådhuset', x: 96.5, z: 131.5, h: TT + 6, label: 'RÅDHUS' },
      { name: 'Kirken', x: KX + 3.5, z: KZ + 3.5, h: KT + 14, label: 'KIRKE' },
      { name: 'Havørnen', x: 112.5, z: 60, h: G + 28, label: 'SKIB' },
      { name: 'Søfortet', x: FX + 0.5, z: FZ + 0.5, h: G + 19, label: 'FORT' },
      { name: 'Fyrtårnet', x: LX + 0.5, z: LZ + 0.5, h: lightY, label: 'FYR', light: true },
      { name: 'Sundet', x: 96.5, z: 14, h: G, label: 'SUNDET' },
    ],
  };
}
