// Vejfinding for kæmper: A* på byens gadegitter. En kæmpe er bred, så et felt er kun farbart,
// hvis der er fri gade hele vejen rundt i kæmpens radius – de går aldrig gennem huse eller ned i smalle gyder.
import { MinHeap } from '../core/nav';
import type { CityMap } from './city';

export class GiantNav {
  readonly w: number;
  readonly d: number;
  /** Afstand (i felter) til nærmeste ikke-farbare felt */
  readonly clear: Float32Array;

  constructor(city: CityMap) {
    const W = (this.w = city.world.sx), D = (this.d = city.world.sz);
    const open = city.open;
    // To-pas afstandstransform (chamfer)
    const c = new Float32Array(W * D).fill(1e9);
    for (let i = 0; i < W * D; i++) if (!open[i]) c[i] = 0;
    const pass = (xs: number[], zs: number[], nb: [number, number, number][]) => {
      for (const z of zs) for (const x of xs) {
        const i = z * W + x;
        for (const [dx, dz, w] of nb) {
          const nx = x + dx, nz = z + dz;
          const v = nx < 0 || nz < 0 || nx >= W || nz >= D ? 0 : c[nz * W + nx];
          if (v + w < c[i]) c[i] = v + w;
        }
      }
    };
    const xsF = [...Array(W).keys()], zsF = [...Array(D).keys()];
    pass(xsF, zsF, [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.414], [1, -1, 1.414]]);
    pass([...xsF].reverse(), [...zsF].reverse(), [[1, 0, 1], [0, 1, 1], [1, 1, 1.414], [-1, 1, 1.414]]);
    this.clear = c;
  }

  walkable(x: number, z: number, r: number) {
    if (x < 0 || z < 0 || x >= this.w || z >= this.d) return false;
    return this.clear[z * this.w + x] >= r;
  }

  /** Nærmeste farbare felt til (x,z) */
  nearest(x: number, z: number, r: number): { x: number; z: number } | null {
    const cx = Math.floor(x), cz = Math.floor(z);
    for (let rad = 0; rad < 40; rad++)
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
        if (this.walkable(cx + dx, cz + dz, r)) return { x: cx + dx, z: cz + dz };
      }
    return null;
  }

  /** A* mellem to punkter; returnerer punkter (feltmidter) eller null */
  path(sx: number, sz: number, tx: number, tz: number, r: number): { x: number; z: number }[] | null {
    const s = this.nearest(sx, sz, r), t = this.nearest(tx, tz, r);
    if (!s || !t) return null;
    const W = this.w, n = W * this.d;
    const si = s.z * W + s.x, ti = t.z * W + t.x;
    const g = new Float32Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const h = (i: number) => Math.hypot((i % W) - t.x, Math.floor(i / W) - t.z);
    const heap = new MinHeap();
    g[si] = 0; heap.push(si, h(si));
    while (heap.size) {
      const cur = heap.pop();
      if (cur === ti) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W, cz = Math.floor(cur / W);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx, z = cz + dz;
        if (!this.walkable(x, z, r)) continue;
        const ni = z * W + x;
        if (closed[ni]) continue;
        // Midten af gaden er billigere end kanten
        const ng = g[cur] + (dx && dz ? 1.414 : 1) + 2 / Math.max(1, this.clear[ni] - r + 1);
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; heap.push(ni, ng + h(ni)); }
      }
    }
    if (g[ti] === Infinity) return null;
    const out: { x: number; z: number }[] = [];
    for (let c = ti; c !== -1; c = came[c]) out.push({ x: (c % W) + 0.5, z: Math.floor(c / W) + 0.5 });
    out.reverse();
    // Udtynd: behold kun knæk
    const thin: { x: number; z: number }[] = [];
    for (let i = 0; i < out.length; i += 4) thin.push(out[i]);
    if (thin[thin.length - 1] !== out[out.length - 1]) thin.push(out[out.length - 1]);
    return thin;
  }
}
