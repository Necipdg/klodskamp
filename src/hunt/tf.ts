// Små stive transformationer (rotation + flytning) til kæmpernes skelet. Ingen Three.js, så det kan testes i Node.
// Samme transformationer bruges til både hitbokse og tegning, så man rammer det, man ser.
import type { V3 } from '../core/math';
import { rayAabb } from '../core/ray';

export interface Tf { r: number[]; t: V3 } // p' = R·p + t, R er 3×3 rækkevis

export const tfIdentity = (): Tf => ({ r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: { x: 0, y: 0, z: 0 } });
export const tfTranslate = (x: number, y: number, z: number): Tf => ({ r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: { x, y, z } });
export function tfRotX(a: number): Tf { const c = Math.cos(a), s = Math.sin(a); return { r: [1, 0, 0, 0, c, -s, 0, s, c], t: { x: 0, y: 0, z: 0 } }; }
export function tfRotY(a: number): Tf { const c = Math.cos(a), s = Math.sin(a); return { r: [c, 0, s, 0, 1, 0, -s, 0, c], t: { x: 0, y: 0, z: 0 } }; }
export function tfRotZ(a: number): Tf { const c = Math.cos(a), s = Math.sin(a); return { r: [c, -s, 0, s, c, 0, 0, 0, 1], t: { x: 0, y: 0, z: 0 } }; }

/** a∘b: først b, så a */
export function tfMul(a: Tf, b: Tf): Tf {
  const A = a.r, B = b.r, r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return { r, t: tfApply(a, b.t) };
}
export function tfChain(...ts: Tf[]): Tf { return ts.reduce((acc, t) => tfMul(acc, t)); }

export function tfApply(a: Tf, p: V3): V3 {
  const R = a.r;
  return { x: R[0] * p.x + R[1] * p.y + R[2] * p.z + a.t.x, y: R[3] * p.x + R[4] * p.y + R[5] * p.z + a.t.y, z: R[6] * p.x + R[7] * p.y + R[8] * p.z + a.t.z };
}
export function tfApplyDir(a: Tf, d: V3): V3 {
  const R = a.r;
  return { x: R[0] * d.x + R[1] * d.y + R[2] * d.z, y: R[3] * d.x + R[4] * d.y + R[5] * d.z, z: R[6] * d.x + R[7] * d.y + R[8] * d.z };
}
/** Verdenspunkt → lokalt */
export function tfInverseApply(a: Tf, p: V3): V3 {
  const R = a.r, x = p.x - a.t.x, y = p.y - a.t.y, z = p.z - a.t.z;
  return { x: R[0] * x + R[3] * y + R[6] * z, y: R[1] * x + R[4] * y + R[7] * z, z: R[2] * x + R[5] * y + R[8] * z };
}
export function tfInverseDir(a: Tf, d: V3): V3 {
  const R = a.r;
  return { x: R[0] * d.x + R[3] * d.y + R[6] * d.z, y: R[1] * d.x + R[4] * d.y + R[7] * d.z, z: R[2] * d.x + R[5] * d.y + R[8] * d.z };
}

/** Orienteret kasse: transform til kassens midte + halve mål */
export interface Obb { tf: Tf; h: V3 }

/** Stråle mod orienteret kasse. Returnerer afstand eller null. */
export function rayObb(o: V3, d: V3, box: Obb, maxDist: number): number | null {
  const lo = tfInverseApply(box.tf, o), ld = tfInverseDir(box.tf, d);
  return rayAabb(lo, ld, -box.h.x, -box.h.y, -box.h.z, box.h.x, box.h.y, box.h.z, maxDist);
}

/** Nærmeste punkt i kassen til p (verden), og afstanden */
export function obbClosest(box: Obb, p: V3): { point: V3; dist: number; local: V3 } {
  const l = tfInverseApply(box.tf, p);
  const c = { x: Math.max(-box.h.x, Math.min(box.h.x, l.x)), y: Math.max(-box.h.y, Math.min(box.h.y, l.y)), z: Math.max(-box.h.z, Math.min(box.h.z, l.z)) };
  const w = tfApply(box.tf, c);
  return { point: w, dist: Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z), local: l };
}
