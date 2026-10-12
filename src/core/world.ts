import { B, BLOCKS, isSolid } from './blocks';

export const CHUNK = 16;

/** Blokverden: x (øst), y (op), z (syd). Gulvet er lag y = 0, man står i lag 1. */
export class VoxelWorld {
  readonly blocks: Uint8Array;
  readonly hp: Float32Array;
  private orig: Uint8Array;
  /** Stiger hver gang en blok ændres (bots bruger den til at genberegne ruter) */
  version = 0;
  readonly dirtyChunks = new Set<number>();
  private listeners: ((x: number, y: number, z: number, oldB: number, newB: number) => void)[] = [];

  constructor(readonly sx: number, readonly sy: number, readonly sz: number) {
    this.blocks = new Uint8Array(sx * sy * sz);
    this.hp = new Float32Array(sx * sy * sz);
    this.orig = new Uint8Array(sx * sy * sz);
  }

  get chunksX() { return Math.ceil(this.sx / CHUNK); }
  get chunksZ() { return Math.ceil(this.sz / CHUNK); }

  idx(x: number, y: number, z: number) { return (y * this.sz + z) * this.sx + x; }
  inside(x: number, y: number, z: number) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  get(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= this.sy) return B.AIR;
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return B.STONE;
    return this.blocks[this.idx(x, y, z)];
  }

  solidAt(x: number, y: number, z: number) { return isSolid(this.get(x, y, z)); }

  /** Sæt en blok under opbygning (ingen hændelser) */
  init(x: number, y: number, z: number, b: number) {
    if (!this.inside(x, y, z)) return;
    const i = this.idx(x, y, z);
    this.blocks[i] = b;
    this.hp[i] = BLOCKS[b].hp;
  }

  set(x: number, y: number, z: number, b: number) {
    if (!this.inside(x, y, z)) return;
    const i = this.idx(x, y, z);
    const old = this.blocks[i];
    if (old === b) return;
    this.blocks[i] = b;
    this.hp[i] = BLOCKS[b].hp;
    this.version++;
    this.markDirty(x, z);
    for (const l of this.listeners) l(x, y, z, old, b);
  }

  /** Skad en blok. Returnerer true hvis den gik i stykker. */
  damage(x: number, y: number, z: number, amount: number): boolean {
    if (!this.inside(x, y, z)) return false;
    const i = this.idx(x, y, z);
    const b = this.blocks[i];
    if (BLOCKS[b].hp <= 0) return false;
    this.hp[i] -= amount;
    if (this.hp[i] <= 0) { this.set(x, y, z, B.AIR); return true; }
    return false;
  }

  onChange(fn: (x: number, y: number, z: number, oldB: number, newB: number) => void) { this.listeners.push(fn); }

  private markDirty(x: number, z: number) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    this.dirtyChunks.add(cz * 1000 + cx);
    // Naboklumper skal også genbygges, hvis blokken ligger på kanten
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (lx === 0 && cx > 0) this.dirtyChunks.add(cz * 1000 + cx - 1);
    if (lx === CHUNK - 1 && cx < this.chunksX - 1) this.dirtyChunks.add(cz * 1000 + cx + 1);
    if (lz === 0 && cz > 0) this.dirtyChunks.add((cz - 1) * 1000 + cx);
    if (lz === CHUNK - 1 && cz < this.chunksZ - 1) this.dirtyChunks.add((cz + 1) * 1000 + cx);
  }

  /** Gem nuværende tilstand som banens udgangspunkt */
  snapshot() { this.orig.set(this.blocks); }

  /** Gendan banen (mellem runder). Returnerer antal ændrede blokke. */
  reset(): number {
    let changed = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      if (this.blocks[i] !== this.orig[i]) {
        const old = this.blocks[i];
        this.blocks[i] = this.orig[i];
        const x = i % this.sx, z = Math.floor(i / this.sx) % this.sz, y = Math.floor(i / (this.sx * this.sz));
        this.markDirty(x, z);
        for (const l of this.listeners) l(x, y, z, old, this.orig[i]);
        changed++;
      }
      this.hp[i] = BLOCKS[this.blocks[i]].hp;
    }
    if (changed) this.version++;
    return changed;
  }

  /** Antal blokke der afviger fra udgangspunktet (til tests) */
  diffFromOriginal(): number {
    let n = 0;
    for (let i = 0; i < this.blocks.length; i++) if (this.blocks[i] !== this.orig[i]) n++;
    return n;
  }
  original(x: number, y: number, z: number) { return this.inside(x, y, z) ? this.orig[this.idx(x, y, z)] : B.STONE; }
}
