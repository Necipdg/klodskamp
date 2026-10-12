// Alle blokteksturer tegnes i kode som 16×16 pixel-kunst (ensartet pixelskala) og samles i ét atlas.
// Hvert felt får 8 px kant (kopi af kanten), så mipmaps ikke bløder over i nabofelterne.
import * as THREE from 'three';
import { T } from '../core/blocks';

export const TILE = 16;
const PAD = 8;
const CELL = TILE + PAD * 2;
export const ATLAS_COLS = 8;
const TILE_COUNT = 52;
export const ATLAS_ROWS = Math.ceil(TILE_COUNT / ATLAS_COLS);

type RGB = [number, number, number];
const hex = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

/** Lille 16×16-lærred med pixel-hjælpere */
export class Px {
  readonly d = new Uint8ClampedArray(TILE * TILE * 4);
  private s: number;
  constructor(seed: number) { this.s = seed * 9301 + 49297; }
  rnd() { this.s = (this.s * 1103515245 + 12345) & 0x7fffffff; return this.s / 0x7fffffff; }
  set(x: number, y: number, c: RGB | number, a = 255) {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const rgb = typeof c === 'number' ? hex(c) : c;
    const i = (y * TILE + x) * 4;
    this.d[i] = rgb[0]; this.d[i + 1] = rgb[1]; this.d[i + 2] = rgb[2]; this.d[i + 3] = a;
  }
  get(x: number, y: number): RGB { const i = (y * TILE + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  shade(x: number, y: number, f: number) {
    const c = this.get(x, y);
    this.set(x, y, [c[0] * f, c[1] * f, c[2] * f]);
  }
  /** Fyld med en palet, vægtet tilfældigt (lav-frekvent støj via små klatter) */
  noise(pal: number[], weights?: number[]) {
    const w = weights ?? pal.map(() => 1);
    const tot = w.reduce((a, b) => a + b, 0);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      let r = this.rnd() * tot, k = 0;
      while (r > w[k]) { r -= w[k]; k++; }
      this.set(x, y, pal[Math.min(k, pal.length - 1)]);
    }
  }
  rect(x0: number, y0: number, w: number, h: number, c: number) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  hline(x0: number, x1: number, y: number, c: number) { for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  vline(x: number, y0: number, y1: number, c: number) { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
  /** Skyg hele feltet let i en retning (lys oppefra) */
  vgrad(top: number, bottom: number) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) this.shade(x, y, top + (bottom - top) * (y / (TILE - 1)));
  }
}

// ---------- Paletter ----------
const GRASS = [0x5f9e3f, 0x6aab47, 0x74b64f, 0x7fc057, 0x568f39];
const DIRT = [0x7d5636, 0x8a6142, 0x956b49, 0x6f4b2f, 0x9d7552];
const SAND = [0xe3cb8e, 0xe9d39a, 0xdcc283, 0xefdba6, 0xd6ba7a];
const SST = { base: 0xdcbd84, light: 0xead1a0, dark: 0xc4a36c, mortar: 0xb08f5c, deep: 0x9c7c4c };
const STONE = [0x8f9094, 0x9a9b9f, 0xa6a7aa, 0x85868a, 0x7b7c80];

function grassTop(p: Px) {
  p.noise(GRASS, [3, 4, 3, 2, 2]);
  for (let i = 0; i < 10; i++) { const x = (p.rnd() * 16) | 0, y = (p.rnd() * 16) | 0; p.set(x, y, 0x8ccc62); }
}

const TILES: ((p: Px) => void)[] = [];
TILES[T.grassTop] = grassTop;
TILES[T.grassFlowers] = (p) => {
  grassTop(p);
  const cols = [0xf2d34b, 0xe8604c, 0xffffff, 0xb07ce0];
  for (let i = 0; i < 4; i++) {
    const x = 1 + ((p.rnd() * 13) | 0), y = 1 + ((p.rnd() * 13) | 0), c = cols[(p.rnd() * cols.length) | 0];
    p.set(x, y, c); p.set(x, y + 1, 0x3f7a2a);
  }
};
TILES[T.grassSide] = (p) => {
  p.noise(DIRT, [3, 4, 3, 2, 1]);
  for (let x = 0; x < 16; x++) {
    const h = 3 + ((p.rnd() * 3) | 0) - (x % 5 === 0 ? 1 : 0);
    for (let y = 0; y < h; y++) p.set(x, y, GRASS[(p.rnd() * GRASS.length) | 0]);
    p.set(x, h, 0x4d7f33);
  }
  for (let i = 0; i < 5; i++) p.set((p.rnd() * 16) | 0, 8 + ((p.rnd() * 7) | 0), 0x5e4029);
};
TILES[T.dirt] = (p) => {
  p.noise(DIRT, [3, 4, 3, 2, 1]);
  for (let i = 0; i < 6; i++) p.set((p.rnd() * 16) | 0, (p.rnd() * 16) | 0, 0xa98a6a);
};
TILES[T.sand] = (p) => {
  p.noise(SAND, [4, 3, 3, 1, 1]);
  for (let i = 0; i < 5; i++) p.set((p.rnd() * 16) | 0, (p.rnd() * 16) | 0, 0xc7a96a);
};
TILES[T.sand2] = (p) => {
  p.noise(SAND, [4, 3, 3, 1, 1]);
  for (let r = 0; r < 3; r++) {
    const y0 = 3 + r * 5;
    for (let x = 0; x < 16; x++) p.set(x, y0 + Math.round(Math.sin(x * 0.6 + r) * 0.8), 0xd2b577);
  }
};
TILES[T.path] = (p) => {
  p.noise([0xc4a874, 0xbb9d68, 0xcdb27e, 0xb2935f, 0xa88a58], [3, 3, 2, 2, 1]);
  for (let i = 0; i < 7; i++) {
    const x = (p.rnd() * 15) | 0, y = (p.rnd() * 15) | 0;
    p.set(x, y, 0x9a9a92); p.set(x + 1, y, 0x85857d);
  }
};

function ashlar(p: Px, rowH: number, base: number[], mortar: number, light: number, dark: number) {
  p.noise(base, [4, 3, 2, 2]);
  for (let row = 0; row < 16 / rowH; row++) {
    const y0 = row * rowH;
    const off = row % 2 ? 4 : 0;
    p.hline(0, 15, y0 + rowH - 1, mortar);
    for (let x = off; x < 16 + off; x += 8) {
      const xx = x % 16;
      p.vline(xx, y0, y0 + rowH - 2, mortar);
      // lys overkant og mørk underkant på hver sten
      for (let k = 1; k < 8; k++) { p.set((xx + k) % 16, y0, light); p.set((xx + k) % 16, y0 + rowH - 2, dark); }
    }
  }
}
TILES[T.sandstoneSide] = (p) => ashlar(p, 8, [SST.base, SST.light, SST.dark, 0xd5b47a], SST.mortar, SST.light, SST.dark);
TILES[T.sandstoneCrack] = (p) => {
  TILES[T.sandstoneSide](p);
  let x = 5, y = 1;
  for (let i = 0; i < 12; i++) { p.set(x, y, SST.deep); y++; x += p.rnd() < 0.4 ? 1 : p.rnd() < 0.3 ? -1 : 0; }
};
TILES[T.sandstoneVine] = (p) => {
  TILES[T.sandstoneSide](p);
  for (const vx of [3, 9, 12]) {
    const len = 5 + ((p.rnd() * 9) | 0);
    for (let y = 0; y < len; y++) {
      const x = vx + (y % 4 === 2 ? 1 : 0);
      p.set(x, y, y % 3 === 0 ? 0x5c9b3c : 0x477f2e);
      if (y % 3 === 1) p.set(x + 1, y, 0x6fb24a);
    }
  }
};
TILES[T.sandstoneTop] = (p) => {
  p.noise([SST.base, SST.light, 0xd8b97e], [4, 2, 3]);
  p.hline(0, 15, 0, SST.light); p.vline(0, 0, 15, SST.light);
  p.hline(0, 15, 15, SST.dark); p.vline(15, 0, 15, SST.dark);
};
TILES[T.stone] = (p) => ashlar(p, 4, STONE, 0x6a6b6f, 0xb3b4b7, 0x77787c);
TILES[T.cobble] = (p) => {
  p.noise([0x6d6e70, 0x737476], [1, 1]);
  const stones: [number, number, number][] = [[3, 3, 3], [10, 2, 3], [6, 8, 3], [13, 9, 3], [2, 12, 3], [9, 13, 3], [14, 15, 2], [0, 7, 2]];
  for (const [cx, cy, r] of stones) {
    const c = STONE[(p.rnd() * STONE.length) | 0];
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r + 1) continue;
      p.set((cx + x + 16) % 16, (cy + y + 16) % 16, y < 0 ? 0xadaeb1 : y > 1 ? 0x7e7f83 : c);
    }
  }
};
TILES[T.brick] = (p) => ashlar(p, 4, [0xa65a3f, 0xb3654a, 0x9a5038, 0xae5e42], 0xd6c4a8, 0xc07558, 0x87442d);
TILES[T.brick2] = (p) => {
  TILES[T.brick](p);
  for (let x = 1; x < 7; x++) for (let y = 4; y < 7; y++) p.shade(x, y, 0.82);
  p.set(11, 9, 0x6f9a48); p.set(12, 9, 0x5f8a3a);
};
TILES[T.plaster] = (p) => {
  p.noise([0xefe6d2, 0xf4ecda, 0xe8ddc6, 0xe2d6bd], [4, 3, 3, 1]);
  // enkelte afskallede pletter med sten bagved
  const x0 = 3 + ((p.rnd() * 8) | 0), y0 = 4 + ((p.rnd() * 8) | 0);
  p.rect(x0, y0, 3, 2, SST.dark); p.set(x0 + 3, y0, SST.base); p.hline(x0, x0 + 2, y0 - 1, 0xcfc2a6);
};
TILES[T.plasterVine] = (p) => {
  TILES[T.plaster](p);
  for (const vx of [2, 7, 13]) {
    const len = 6 + ((p.rnd() * 9) | 0);
    for (let y = 0; y < len; y++) { const x = vx + (y % 5 === 3 ? 1 : 0); p.set(x, y, y % 2 ? 0x4b8a33 : 0x5fa242); if (y % 3 === 2) p.set(x - 1, y, 0x72b84f); }
  }
};
TILES[T.planks] = (p) => {
  p.noise([0xb48a54, 0xbd9460, 0xa97f4b, 0xc09a66], [3, 2, 2, 1]);
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4;
    p.hline(0, 15, y0 + 3, 0x7e5a32);
    p.hline(0, 15, y0, 0xc9a472);
    const cut = (row * 7 + 3) % 16;
    p.vline(cut, y0, y0 + 2, 0x7e5a32);
    p.set((cut + 3) % 16, y0 + 1, 0x8e683d); p.set((cut + 10) % 16, y0 + 2, 0x9a7244);
  }
};
TILES[T.logSide] = (p) => {
  p.noise([0x6e4f2e, 0x765634, 0x634628, 0x5a3f24], [3, 2, 2, 1]);
  for (let x = 0; x < 16; x += 3) for (let y = 0; y < 16; y++) if (p.rnd() < 0.6) p.set(x, y, 0x4e3620);
};
TILES[T.logTop] = (p) => {
  p.noise([0xb58c57, 0xa98050], [1, 1]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const r = Math.hypot(x - 7.5, y - 7.5);
    if (r > 7) p.set(x, y, 0x5e4226);
    else if ((r | 0) % 2 === 0) p.set(x, y, 0x9a7244);
  }
};
TILES[T.leaves] = (p) => {
  p.noise([0x3f8a33, 0x4f9a3a, 0x5aa843, 0x2f6e27, 0x67b44d], [3, 4, 3, 2, 1]);
  for (let i = 0; i < 14; i++) p.set((p.rnd() * 16) | 0, (p.rnd() * 16) | 0, 0x24531e);
  for (let i = 0; i < 6; i++) p.set((p.rnd() * 16) | 0, (p.rnd() * 16) | 0, 0x7cc65a);
};
TILES[T.crateSide] = (p) => {
  p.noise([0xc19355, 0xb98a4b, 0xc89c60], [3, 3, 2]);
  for (let y = 0; y < 16; y += 4) p.hline(1, 14, y + 3, 0x8f6534);
  p.rect(0, 0, 16, 2, 0x8a5f2f); p.rect(0, 14, 16, 2, 0x8a5f2f); p.rect(0, 0, 2, 16, 0x8a5f2f); p.rect(14, 0, 2, 16, 0x8a5f2f);
  for (let i = 2; i < 14; i++) { p.set(i, i, 0x7d5428); p.set(i + 1, i, 0x9b6e3a); }
  for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) p.set(x, y, 0x50504f);
  p.hline(0, 15, 0, 0xa87a44);
};
TILES[T.crateTop] = (p) => {
  TILES[T.planks](p);
  p.rect(0, 0, 16, 2, 0x8a5f2f); p.rect(0, 14, 16, 2, 0x8a5f2f); p.rect(0, 0, 2, 16, 0x8a5f2f); p.rect(14, 0, 2, 16, 0x8a5f2f);
};
TILES[T.build] = (p) => {
  // Sandsække: to rækker afrundede sække med søm
  p.noise([0x9a8a5c], [1]);
  for (let row = 0; row < 2; row++) {
    const y0 = row * 8, off = row ? 4 : 0;
    for (let s = -1; s < 2; s++) {
      const x0 = s * 8 + off;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const dx = (x - 3.5) / 4, dy = (y - 3.5) / 4;
        if (dx * dx * 0.6 + dy * dy > 1) continue;
        const c = y < 2 ? 0xd6c899 : y > 5 ? 0xa59666 : (x + y) % 5 === 0 ? 0xbfae7c : 0xc8b886;
        p.set(x0 + x, y0 + y, c);
      }
      p.set(x0 + 1, y0 + 4, 0x8b7c52); p.set(x0 + 6, y0 + 4, 0x8b7c52);
    }
  }
};
TILES[T.site] = (p) => {
  // Terrakottafliser med malet advarselskant
  p.noise([0xc4673d, 0xcf7246, 0xb95e37, 0xd27a4c], [3, 3, 2, 1]);
  p.hline(0, 15, 0, 0x8d4527); p.vline(0, 0, 15, 0x8d4527); p.hline(0, 15, 8, 0x9d4d2c); p.vline(8, 0, 15, 0x9d4d2c);
  for (const [x, y] of [[3, 3], [11, 12], [12, 4]]) p.set(x, y, 0xe08c5c);
};
TILES[T.spawnA] = (p) => {
  p.noise([0xd2a05f, 0xc99656, 0xdaa96a], [3, 3, 2]);
  p.hline(0, 15, 0, 0xa27440); p.vline(0, 0, 15, 0xa27440);
  for (let i = 3; i < 13; i++) { p.set(i, 7, 0xe07a33); p.set(i, 8, 0xe07a33); }
};
TILES[T.spawnD] = (p) => {
  p.noise([0x7f8fa6, 0x8898ae, 0x77879d], [3, 3, 2]);
  p.hline(0, 15, 0, 0x5e6c80); p.vline(0, 0, 15, 0x5e6c80);
  for (let i = 3; i < 13; i++) { p.set(7, i, 0x3f7fd8); p.set(8, i, 0x3f7fd8); }
};
TILES[T.bedrock] = (p) => p.noise([0x3d3d40, 0x4a4a4e, 0x2f2f32], [2, 2, 1]);
TILES[T.roof] = (p) => ashlar(p, 8, [0x5b5f66, 0x656970, 0x52565c], 0x3e4146, 0x737880, 0x474a50);
TILES[T.woodwall] = (p) => {
  // Tilmurede plader: lodrette brædder med to tværbrædder og søm
  p.noise([0xc49a5a, 0xb88d4f, 0xcda465], [3, 3, 2]);
  for (let x = 0; x < 16; x += 4) { p.vline(x, 0, 15, 0x6b4a26); p.vline(x + 1, 0, 15, 0xd6af74); }
  for (const y0 of [3, 11]) {
    p.rect(0, y0, 16, 2, 0x9a6f3c); p.hline(0, 15, y0, 0xb48650); p.hline(0, 15, y0 + 2, 0x5a3d1f);
    for (let x = 2; x < 16; x += 4) p.set(x, y0, 0x404040);
  }
  for (let i = 0; i < 4; i++) p.set((p.rnd() * 16) | 0, (p.rnd() * 16) | 0, 0x8a6236);
};
TILES[T.rooftile] = (p) => {
  // Terrakottatagsten set fra siden: rækker af buede tegl
  p.noise([0xb5532f, 0xc05d36, 0xa84b2a], [3, 3, 2]);
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4;
    for (let x = 0; x < 16; x++) {
      const k = (x + row * 2) % 4;
      p.set(x, y0, k === 0 ? 0x7a3019 : 0xd8754a);
      p.set(x, y0 + 3, 0x8c3a1f);
      if (k === 1) p.set(x, y0 + 1, 0xe08458);
    }
  }
};
TILES[T.rooftileTop] = (p) => {
  p.noise([0xb5532f, 0xc05d36, 0xa84b2a], [3, 3, 2]);
  for (let x = 0; x < 16; x += 4) { p.vline(x, 0, 15, 0x7a3019); p.vline(x + 2, 0, 15, 0xd8754a); }
  for (let y = 0; y < 16; y += 4) p.hline(0, 15, y, 0x96401f);
};
TILES[T.window] = (p) => {
  ashlar(p, 8, [SST.base, SST.light, SST.dark, 0xd5b47a], SST.mortar, SST.light, SST.dark);
  // Ramme, skodder og glas
  p.rect(3, 2, 10, 12, 0x6e4a2a);
  p.rect(4, 3, 8, 10, 0x223349);
  p.rect(5, 4, 3, 4, 0x3a5675); p.rect(9, 4, 2, 4, 0x2c4560); p.set(5, 4, 0x9fc3e0); p.set(6, 4, 0x6f95b8);
  p.rect(5, 9, 6, 3, 0x2a4058);
  p.vline(8, 3, 12, 0x6e4a2a); p.hline(4, 11, 8, 0x6e4a2a);
  for (let y = 2; y < 14; y++) { p.set(1, y, y % 2 ? 0x3f8a7a : 0x357868); p.set(2, y, 0x2f6a5c); p.set(13, y, 0x2f6a5c); p.set(14, y, y % 2 ? 0x3f8a7a : 0x357868); }
  p.hline(2, 13, 14, 0xe9d7ae); p.hline(2, 13, 15, 0xa7865a);
};
TILES[T.doorLo] = (p) => {
  ashlar(p, 8, [SST.base, SST.light, SST.dark, 0xd5b47a], SST.mortar, SST.light, SST.dark);
  p.rect(2, 0, 12, 16, 0x6b4426);
  for (let x = 3; x < 13; x++) for (let y = 0; y < 16; y++) p.set(x, y, (x - 3) % 3 === 0 ? 0x5a381e : y % 7 === 3 ? 0x7d5230 : 0x845a35);
  p.hline(3, 12, 4, 0x4c2f18); p.hline(3, 12, 12, 0x4c2f18);
  p.set(11, 7, 0xd9b44a); p.set(11, 8, 0xa98a32);
};
TILES[T.doorHi] = (p) => {
  ashlar(p, 8, [SST.base, SST.light, SST.dark, 0xd5b47a], SST.mortar, SST.light, SST.dark);
  p.rect(1, 1, 14, 15, 0xe9d7ae);
  p.rect(2, 2, 12, 14, 0x6b4426);
  for (let x = 3; x < 13; x++) for (let y = 3; y < 16; y++) p.set(x, y, (x - 3) % 3 === 0 ? 0x5a381e : 0x845a35);
  p.rect(5, 4, 6, 4, 0x223349); p.set(6, 5, 0x6f95b8); p.vline(8, 4, 7, 0x5a381e);
  p.hline(3, 12, 11, 0x4c2f18);
};
function banner(p: Px, cloth: number, dark: number, light: number, emblem: (p: Px) => void, wall: () => void) {
  wall();
  p.rect(3, 0, 10, 16, cloth);
  p.vline(3, 0, 15, dark); p.vline(12, 0, 15, dark);
  p.vline(4, 0, 15, light);
  for (let y = 0; y < 16; y += 2) p.set(7 + (y % 4 ? 1 : 0), y, dark);
  emblem(p);
}
TILES[T.bannerA] = (p) => banner(p, 0xe0702e, 0xa94c1b, 0xf08a48, (q) => {
  // Emblem: en stiliseret flamme/pil
  for (const [x, y] of [[8, 4], [7, 5], [8, 5], [9, 5], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [7, 7], [8, 7], [9, 7], [8, 8], [8, 9], [8, 10]]) q.set(x, y, 0xfff1d6);
}, () => ashlar(p, 4, [0xa65a3f, 0xb3654a, 0x9a5038, 0xae5e42], 0xd6c4a8, 0xc07558, 0x87442d));
TILES[T.bannerD] = (p) => banner(p, 0x3f78d0, 0x24508f, 0x5b92e6, (q) => {
  // Emblem: et skjold
  for (let y = 4; y < 11; y++) { const w = y < 8 ? 3 : 10 - y; for (let x = 8 - w; x <= 7 + w; x++) q.set(x, y, 0xe8f0ff); }
  q.vline(7, 5, 9, 0x3f78d0); q.vline(8, 5, 9, 0x3f78d0);
}, () => ashlar(p, 4, STONE, 0x6a6b6f, 0xb3b4b7, 0x77787c));
TILES[T.planterSide] = (p) => {
  p.noise([0xb0603a, 0xbb6a42, 0xa45732], [3, 2, 2]);
  p.rect(0, 0, 16, 3, 0xc9784c); p.hline(0, 15, 3, 0x7d3d20);
  for (let x = 2; x < 16; x += 5) p.vline(x, 6, 13, 0xc47248);
  p.hline(0, 15, 15, 0x7d3d20);
};
TILES[T.planterTop] = (p) => {
  p.noise(DIRT, [2, 3, 2, 2, 1]);
  p.rect(0, 0, 16, 2, 0xc9784c); p.rect(0, 14, 16, 2, 0xc9784c); p.rect(0, 0, 2, 16, 0xc9784c); p.rect(14, 0, 2, 16, 0xc9784c);
};

// ---------- Eventyrdalen ----------
const ROCK = [0x7d7a74, 0x86837c, 0x74716b, 0x8f8b83, 0x6a6762];
function rockSide(p: Px) {
  p.noise(ROCK, [3, 3, 2, 2, 1]);
  // klumper af lysere og mørkere sten
  for (let i = 0; i < 5; i++) {
    const cx = (p.rnd() * 16) | 0, cy = (p.rnd() * 16) | 0, r = 1 + ((p.rnd() * 2) | 0), c = p.rnd() < 0.5 ? 0x948f86 : 0x6c6963;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r && p.rnd() < 0.8) p.set((cx + x + 16) % 16, (cy + y + 16) % 16, c);
  }
  // korte, skæve sprækker (ikke hele rækker – så det ikke ligner mursten)
  for (let i = 0; i < 4; i++) {
    let x = (p.rnd() * 16) | 0, y = (p.rnd() * 16) | 0;
    const len = 3 + ((p.rnd() * 5) | 0), dir = p.rnd() < 0.5 ? 1 : -1;
    for (let k = 0; k < len; k++) {
      p.set((x + 16) % 16, (y + 16) % 16, 0x55524d);
      p.set((x + 16) % 16, (y + 17) % 16, 0x9a968e);
      x += dir; if (p.rnd() < 0.45) y++;
    }
  }
}
TILES[T.rock] = rockSide;
TILES[T.rock2] = (p) => {
  rockSide(p);
  // lidt mos i sprækkerne
  for (let i = 0; i < 6; i++) { const x = (p.rnd() * 15) | 0, y = 3 + ((p.rnd() * 3) | 0) * 6; p.set(x, y, 0x5d7f3c); p.set(x + 1, y, 0x4e6f33); }
};
TILES[T.rockTop] = (p) => {
  p.noise(ROCK, [2, 3, 2, 2, 1]);
  for (let i = 0; i < 9; i++) { const x = (p.rnd() * 15) | 0, y = (p.rnd() * 15) | 0; p.set(x, y, 0x6a8f45); p.set(x + 1, y, 0x5b7f3b); }
};
TILES[T.snow] = (p) => {
  p.noise([0xf3f7fa, 0xe8eef3, 0xffffff, 0xdfe7ee], [3, 3, 2, 1]);
  for (let i = 0; i < 6; i++) p.set((p.rnd() * 16) | 0, (p.rnd() * 16) | 0, 0xcdd8e2);
};
TILES[T.snowSide] = (p) => {
  rockSide(p);
  for (let x = 0; x < 16; x++) {
    const h = 3 + ((p.rnd() * 3) | 0) + (x % 6 === 2 ? 2 : 0);
    for (let y = 0; y < h; y++) p.set(x, y, y === h - 1 ? 0xd3dde6 : p.rnd() < 0.3 ? 0xe8eef3 : 0xf6f9fb);
  }
};
TILES[T.mossStone] = (p) => {
  ashlar(p, 8, [0x868a80, 0x7d8178, 0x91958b, 0x74786f], 0x5c6058, 0xa3a79c, 0x65695f);
  for (let i = 0; i < 18; i++) {
    const x = (p.rnd() * 16) | 0, y = (p.rnd() * 16) | 0;
    if (y > 8 && p.rnd() < 0.5) continue;
    p.set(x, y, p.rnd() < 0.5 ? 0x5f8a3a : 0x4c7530);
  }
  for (const vx of [4, 11]) for (let y = 0; y < 4 + ((p.rnd() * 6) | 0); y++) p.set(vx, y, 0x3f6b2a);
};
TILES[T.slate] = (p) => {
  p.noise([0x3f4a5c, 0x46526a, 0x384254, 0x4d5a70], [3, 3, 2, 1]);
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4, off = row % 2 ? 2 : 0;
    p.hline(0, 15, y0 + 3, 0x262d38);
    for (let x = off; x < 16; x += 4) { p.vline(x, y0, y0 + 2, 0x2b323e); p.set(x + 1, y0, 0x5d6a80); }
  }
};
TILES[T.slateTop] = (p) => {
  p.noise([0x3f4a5c, 0x46526a, 0x384254], [3, 2, 2]);
  p.hline(0, 15, 7, 0x2b323e); p.hline(0, 15, 15, 0x2b323e);
};
TILES[T.wheatTop] = (p) => {
  p.noise([0xd9b24a, 0xe3c05a, 0xc9a03c, 0xedd078], [3, 3, 2, 1]);
  for (let i = 0; i < 20; i++) { const x = (p.rnd() * 16) | 0, y = (p.rnd() * 16) | 0; p.set(x, y, 0xb08a2e); }
};
TILES[T.wheatSide] = (p) => {
  p.noise(DIRT, [3, 4, 3, 2, 1]);
  for (let x = 0; x < 16; x++) {
    const h = 10 + ((p.rnd() * 5) | 0);
    for (let y = 0; y < h; y++) p.set(x, y, y < 3 ? (p.rnd() < 0.5 ? 0xedd078 : 0xd9b24a) : x % 2 ? 0xc49a3e : 0xb58b34);
  }
};
TILES[T.darkLeaves] = (p) => {
  p.noise([0x2f6b2c, 0x3a7a33, 0x275c26, 0x45893b, 0x1f4a1f], [3, 4, 3, 2, 2]);
  for (let i = 0; i < 16; i++) p.set((p.rnd() * 16) | 0, (p.rnd() * 16) | 0, 0x173a18);
  for (let i = 0; i < 6; i++) p.set((p.rnd() * 16) | 0, (p.rnd() * 16) | 0, 0x5aa04a);
};
TILES[T.gravel] = (p) => {
  p.noise([0x9a948a, 0x8a847a, 0xa8a296, 0x7c766d, 0xb3ad9f], [3, 3, 2, 2, 1]);
};
TILES[T.sail] = (p) => {
  // sejldug: lyst lærred med syninger og lidt slid
  p.noise([0xf1e9d6, 0xf6efdf, 0xe9e0ca, 0xece3cf], [4, 3, 2, 2]);
  for (let x = 0; x < 16; x++) { p.set(x, 7, 0xd8ccb0); p.set(x, 15, 0xd8ccb0); }
  for (let y = 0; y < 16; y += 2) p.set(5, y, 0xddd2b8);
  for (let i = 0; i < 4; i++) p.set((p.rnd() * 16) | 0, (p.rnd() * 16) | 0, 0xcfc2a2);
};

let atlasCanvas: HTMLCanvasElement | null = null;

/** Tegn hele atlasset (bruges også af brugerfladen til ikoner) */
export function buildAtlasCanvas(): HTMLCanvasElement {
  if (atlasCanvas) return atlasCanvas;
  const c = document.createElement('canvas');
  c.width = ATLAS_COLS * CELL;
  c.height = ATLAS_ROWS * CELL;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < TILE_COUNT; i++) {
    const draw = TILES[i];
    if (!draw) continue;
    const p = new Px(i + 11);
    draw(p);
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = TILE;
    tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.d), TILE, TILE), 0, 0);
    const cx = (i % ATLAS_COLS) * CELL, cy = Math.floor(i / ATLAS_COLS) * CELL;
    // Feltet gentages rundt om sig selv i kanten, så mipmaps ikke giver sømme
    ctx.save();
    ctx.beginPath(); ctx.rect(cx, cy, CELL, CELL); ctx.clip();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) ctx.drawImage(tmp, cx + PAD + dx * TILE, cy + PAD + dy * TILE);
    ctx.restore();
  }
  atlasCanvas = c;
  return c;
}

export function makeAtlasTexture(anisotropy: number): THREE.Texture {
  const tex = new THREE.CanvasTexture(buildAtlasCanvas());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.flipY = false;
  return tex;
}

/** UV-rektangel for et felt (u0, v0, u1, v1) – v regnes oppefra (flipY = false) */
export function tileUV(tile: number): [number, number, number, number] {
  const W = ATLAS_COLS * CELL, H = ATLAS_ROWS * CELL;
  const cx = (tile % ATLAS_COLS) * CELL + PAD, cy = Math.floor(tile / ATLAS_COLS) * CELL + PAD;
  return [cx / W, cy / H, (cx + TILE) / W, (cy + TILE) / H];
}

/** Et enkelt felt som lærred (til UI-ikoner og partikler) */
export function tileCanvas(tile: number, scale = 4): HTMLCanvasElement {
  const src = buildAtlasCanvas();
  const c = document.createElement('canvas');
  c.width = c.height = TILE * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const cx = (tile % ATLAS_COLS) * CELL + PAD, cy = Math.floor(tile / ATLAS_COLS) * CELL + PAD;
  ctx.drawImage(src, cx, cy, TILE, TILE, 0, 0, TILE * scale, TILE * scale);
  return c;
}
