// Vejfinding for bots: A* på banens søjlegitter (én celle pr. blok i x,z).
// Hver søjle klassificeres ud fra lag 1-3: fri, kan hoppes over, kan skydes væk eller spærret.
// Placerede blokke og kasser opdaterer gitteret med det samme (VoxelWorld.onChange).
import type { VoxelWorld } from './world';
import { isDestructible, isSolid } from './blocks';

export const NAV = { OPEN: 0, HOP: 1, BREAK: 2, BLOCKED: 3 } as const;
const COST = [1, 3.5, 14, Infinity];

export class NavGrid {
  readonly w: number;
  readonly d: number;
  readonly kind: Uint8Array;
  version = 0;

  constructor(private world: VoxelWorld) {
    this.w = world.sx;
    this.d = world.sz;
    this.kind = new Uint8Array(this.w * this.d);
    for (let z = 0; z < this.d; z++) for (let x = 0; x < this.w; x++) this.updateCol(x, z);
    world.onChange((x, y, z) => { if (y >= 1 && y <= 3) { this.updateCol(x, z); this.version++; } });
  }

  idx(x: number, z: number) { return z * this.w + x; }
  kindAt(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.w || z >= this.d) return NAV.BLOCKED;
    return this.kind[this.idx(x, z)];
  }
  walkable(x: number, z: number) { return this.kindAt(x, z) === NAV.OPEN; }

  updateCol(x: number, z: number) {
    const w = this.world;
    const b1 = w.get(x, 1, z), b2 = w.get(x, 2, z), b3 = w.get(x, 3, z);
    const s1 = isSolid(b1), s2 = isSolid(b2), s3 = isSolid(b3);
    let k: number = NAV.BLOCKED;
    if (!s1 && !s2) k = NAV.OPEN;
    else if (s1 && !s2 && !s3) k = NAV.HOP;
    else if ((!s1 || isDestructible(b1)) && (!s2 || isDestructible(b2))) k = NAV.BREAK;
    this.kind[this.idx(x, z)] = k;
  }

  /** Kan man gå i en lige linje (bredde ≈ 0,6) uden forhindringer? */
  clearLine(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax, dz = bz - az;
    const l = Math.hypot(dx, dz);
    if (l < 0.01) return true;
    const nx = -dz / l, nz = dx / l;
    const n = Math.ceil(l / 0.25);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = ax + dx * t, pz = az + dz * t;
      for (const o of [-0.32, 0, 0.32]) {
        if (!this.walkable(Math.floor(px + nx * o), Math.floor(pz + nz * o))) return false;
      }
    }
    return true;
  }

  /** A* fra (sx,sz) til (tx,tz) i verdenskoordinater. Returnerer celler (indeks) eller null. */
  findPath(sx: number, sz: number, tx: number, tz: number, penalty?: Map<number, number>): number[] | null {
    const W = this.w, D = this.d, n = W * D;
    let s = this.idx(clampI(Math.floor(sx), 0, W - 1), clampI(Math.floor(sz), 0, D - 1));
    let t = this.idx(clampI(Math.floor(tx), 0, W - 1), clampI(Math.floor(tz), 0, D - 1));
    if (this.kind[t] === NAV.BLOCKED) t = this.nearestFree(t);
    if (this.kind[s] === NAV.BLOCKED) s = this.nearestFree(s);
    if (s < 0 || t < 0) return null;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const txc = t % W, tzc = Math.floor(t / W);
    const h = (i: number) => {
      const dx = Math.abs((i % W) - txc), dz = Math.abs(Math.floor(i / W) - tzc);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    g[s] = 0;
    heap.push(s, h(s));
    while (heap.size) {
      const cur = heap.pop();
      if (cur === t) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W, cz = Math.floor(cur / W);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= W || z >= D) continue;
        const ni = z * W + x;
        const k = this.kind[ni];
        if (k === NAV.BLOCKED || closed[ni]) continue;
        if (dx && dz) {
          // Diagonalt kun hvis begge hjørner er frie (ellers hænger man fast i kanten)
          if (this.kind[cz * W + x] !== NAV.OPEN || this.kind[z * W + cx] !== NAV.OPEN || k !== NAV.OPEN) continue;
        }
        let c = COST[k] * (dx && dz ? 1.414 : 1);
        if (penalty) c += penalty.get(ni) ?? 0;
        const ng = g[cur] + c;
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; heap.push(ni, ng + h(ni)); }
      }
    }
    if (g[t] === Infinity) return null;
    const path: number[] = [];
    for (let c = t; c !== -1; c = came[c]) path.push(c);
    path.reverse();
    return path;
  }

  private nearestFree(i: number): number {
    const W = this.w;
    const x0 = i % W, z0 = Math.floor(i / W);
    for (let r = 1; r < 6; r++)
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const k = this.kindAt(x0 + dx, z0 + dz);
        if (k === NAV.OPEN) return this.idx(x0 + dx, z0 + dz);
      }
    return -1;
  }
}

const clampI = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() { return this.items.length; }
  push(item: number, p: number) {
    const a = this.items, pr = this.prio;
    a.push(item); pr.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (pr[par] <= pr[i]) break;
      [a[par], a[i]] = [a[i], a[par]]; [pr[par], pr[i]] = [pr[i], pr[par]];
      i = par;
    }
  }
  pop(): number {
    const a = this.items, pr = this.prio;
    const top = a[0];
    const li = a.pop()!, lp = pr.pop()!;
    if (a.length) {
      a[0] = li; pr[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && pr[l] < pr[m]) m = l;
        if (r < a.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; [pr[m], pr[i]] = [pr[i], pr[m]];
        i = m;
      }
    }
    return top;
  }
}
