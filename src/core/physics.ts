// Kollision mellem en stående kasse (spilleren) og blokverdenen. Akse for akse med små delskridt.
import type { VoxelWorld } from './world';
import type { V3 } from './math';

const EPS = 1e-4;

export interface Body {
  pos: V3; // fødder, midt på
  vel: V3;
  halfW: number;
  height: number;
  onGround: boolean;
}

/** Overlapper kassen en fast blok? */
export function boxHitsWorld(w: VoxelWorld, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
  const x0 = Math.floor(minX), x1 = Math.floor(maxX - EPS);
  const y0 = Math.floor(minY), y1 = Math.floor(maxY - EPS);
  const z0 = Math.floor(minZ), z1 = Math.floor(maxZ - EPS);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) if (w.solidAt(x, y, z)) return true;
  return false;
}

export function bodyHitsWorld(w: VoxelWorld, b: Body, px = b.pos.x, py = b.pos.y, pz = b.pos.z, h = b.height) {
  return boxHitsWorld(w, px - b.halfW, py, pz - b.halfW, px + b.halfW, py + h, pz + b.halfW);
}

/** Flyt kroppen dt sekunder med dens hastighed. Returnerer faldhastighed ved landing (0 hvis ingen landing). */
export function moveBody(w: VoxelWorld, b: Body, dt: number): number {
  const wasGround = b.onGround;
  let landing = 0;
  const maxStep = 0.3;
  const dist = Math.max(Math.abs(b.vel.x), Math.abs(b.vel.y), Math.abs(b.vel.z)) * dt;
  const steps = Math.max(1, Math.ceil(dist / maxStep));
  const sdt = dt / steps;
  b.onGround = false;
  for (let s = 0; s < steps; s++) {
    // Y
    const dy = b.vel.y * sdt;
    if (dy !== 0) {
      const ny = b.pos.y + dy;
      if (bodyHitsWorld(w, b, b.pos.x, ny, b.pos.z)) {
        if (dy < 0) {
          b.pos.y = Math.floor(ny) + 1;
          if (!wasGround && b.vel.y < -3) landing = -b.vel.y;
          b.onGround = true;
        } else {
          b.pos.y = Math.floor(ny + b.height) - b.height - EPS;
        }
        b.vel.y = 0;
      } else b.pos.y = ny;
    }
    // X
    const dx = b.vel.x * sdt;
    if (dx !== 0) {
      const nx = b.pos.x + dx;
      if (bodyHitsWorld(w, b, nx, b.pos.y, b.pos.z)) {
        b.pos.x = dx > 0 ? Math.floor(nx + b.halfW) - b.halfW - EPS : Math.floor(nx - b.halfW) + 1 + b.halfW + EPS;
        b.vel.x = 0;
      } else b.pos.x = nx;
    }
    // Z
    const dz = b.vel.z * sdt;
    if (dz !== 0) {
      const nz = b.pos.z + dz;
      if (bodyHitsWorld(w, b, b.pos.x, b.pos.y, nz)) {
        b.pos.z = dz > 0 ? Math.floor(nz + b.halfW) - b.halfW - EPS : Math.floor(nz - b.halfW) + 1 + b.halfW + EPS;
        b.vel.z = 0;
      } else b.pos.z = nz;
    }
  }
  // Står vi på jorden? (også når lodret fart er 0)
  if (!b.onGround && b.vel.y <= 0 && bodyHitsWorld(w, b, b.pos.x, b.pos.y - 0.02, b.pos.z)) b.onGround = true;
  return landing;
}
