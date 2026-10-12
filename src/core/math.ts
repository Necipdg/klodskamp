// Lille vektorbibliotek uden Three.js, så kernen kan køre i Node.
export interface V3 { x: number; y: number; z: number }

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const copy = (a: V3): V3 => ({ x: a.x, y: a.y, z: a.z });
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
export const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const dist2d = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const DEG = Math.PI / 180;

/** Retning ud fra yaw/pitch. yaw 0 = mod −z (nord), positiv yaw drejer mod venstre (−x). */
export function dirFromYawPitch(yaw: number, pitch: number): V3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** yaw/pitch der peger fra a mod b */
export function yawPitchTo(a: V3, b: V3): { yaw: number; pitch: number } {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** Korteste vinkelforskel b − a i (−π, π] */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Deterministisk tilfældighedsgenerator (mulberry32) */
export class Rng {
  private s: number;
  constructor(seed = 1) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(n: number) { return Math.floor(this.next() * n); }
  pick<T>(arr: readonly T[]): T { return arr[this.int(arr.length)]; }
  chance(p: number) { return this.next() < p; }
}
