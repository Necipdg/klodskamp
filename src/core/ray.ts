import type { VoxelWorld } from './world';
import { isSolid } from './blocks';
import type { V3 } from './math';

export interface VoxelHit { x: number; y: number; z: number; nx: number; ny: number; nz: number; dist: number; block: number }

/** Voxel-strålegang (Amanatides & Woo). d skal være normaliseret. */
export function raycastVoxels(w: VoxelWorld, o: V3, d: V3, maxDist: number): VoxelHit | null {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const stepX = d.x > 0 ? 1 : -1, stepY = d.y > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
  const tdx = d.x !== 0 ? Math.abs(1 / d.x) : Infinity;
  const tdy = d.y !== 0 ? Math.abs(1 / d.y) : Infinity;
  const tdz = d.z !== 0 ? Math.abs(1 / d.z) : Infinity;
  let tmx = d.x !== 0 ? (d.x > 0 ? x + 1 - o.x : o.x - x) * tdx : Infinity;
  let tmy = d.y !== 0 ? (d.y > 0 ? y + 1 - o.y : o.y - y) * tdy : Infinity;
  let tmz = d.z !== 0 ? (d.z > 0 ? z + 1 - o.z : o.z - z) * tdz : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  // Startcellen (hvis man står inde i en blok, tæller den ikke)
  for (let i = 0; i < 512; i++) {
    if (tmx < tmy && tmx < tmz) { x += stepX; t = tmx; tmx += tdx; nx = -stepX; ny = 0; nz = 0; }
    else if (tmy < tmz) { y += stepY; t = tmy; tmy += tdy; nx = 0; ny = -stepY; nz = 0; }
    else { z += stepZ; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -stepZ; }
    if (t > maxDist) return null;
    if (y >= w.sy && stepY > 0) return null;
    const b = w.get(x, y, z);
    if (isSolid(b)) return { x, y, z, nx, ny, nz, dist: t, block: b };
  }
  return null;
}

/** Er der frit udsyn mellem a og b? */
export function lineOfSight(w: VoxelWorld, a: V3, b: V3): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const l = Math.hypot(dx, dy, dz);
  if (l < 1e-6) return true;
  return raycastVoxels(w, a, { x: dx / l, y: dy / l, z: dz / l }, l) === null;
}

/** Stråle mod kasse. Returnerer afstand eller null. */
export function rayAabb(o: V3, d: V3, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, maxDist: number): number | null {
  let tmin = 0, tmax = maxDist;
  const axes: [number, number, number, number][] = [[o.x, d.x, minX, maxX], [o.y, d.y, minY, maxY], [o.z, d.z, minZ, maxZ]];
  for (const [oo, dd, mn, mx] of axes) {
    if (Math.abs(dd) < 1e-9) { if (oo < mn || oo > mx) return null; continue; }
    let t1 = (mn - oo) / dd, t2 = (mx - oo) / dd;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin;
}
