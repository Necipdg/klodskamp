// Kulisse uden for banen: lave sandstenshuse med tage, træer og marker, så byen fortsætter i disen.
// Kun pynt – den indgår ikke i kollision eller skud.
import * as THREE from 'three';
import { B } from '../core/blocks';
import { VoxelWorld } from '../core/world';
import { Rng } from '../core/math';
import { meshRegion } from './worldMesh';

const M = 34; // kant rundt om banen

export function buildBackdrop(mapW: number, mapD: number, material: THREE.Material): THREE.Group {
  const W = mapW + M * 2, D = mapD + M * 2, H = 13;
  const w = new VoxelWorld(W, H, D);
  const rng = new Rng(99);
  const inner = (x: number, z: number) => x >= M && x < M + mapW && z >= M && z < M + mapD;
  // Jorden
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (inner(x, z)) continue;
    const edge = Math.min(Math.abs(x - M), Math.abs(x - (M + mapW - 1)), Math.abs(z - M), Math.abs(z - (M + mapD - 1)));
    w.init(x, 0, z, edge < 8 ? (rng.chance(0.3) ? B.PATH : B.SAND) : rng.chance(0.08) ? B.SAND : B.GRASS);
  }
  const free = (x0: number, z0: number, x1: number, z1: number) => {
    for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (x < 0 || z < 0 || x >= W || z >= D) return false;
      if (inner(x, z) || w.get(x, 1, z) !== B.AIR) return false;
    }
    return true;
  };
  // Huse: tæt ved banen er der flest
  for (let i = 0; i < 260; i++) {
    const bw = 4 + rng.int(6), bd = 4 + rng.int(6);
    const x0 = rng.int(W - bw), z0 = rng.int(D - bd);
    const cx = x0 + bw / 2, cz = z0 + bd / 2;
    const dEdge = Math.max(M - cx, cx - (M + mapW), M - cz, cz - (M + mapD), 0);
    if (dEdge > 28 || (dEdge > 14 && rng.chance(0.6))) continue;
    if (!free(x0, z0, x0 + bw - 1, z0 + bd - 1)) continue;
    const h = 3 + rng.int(4);
    const mat = rng.pick([B.SANDSTONE, B.SANDSTONE, B.PLASTER, B.PLASTER, B.BRICK]);
    for (let z = z0; z < z0 + bd; z++) for (let x = x0; x < x0 + bw; x++) {
      for (let y = 1; y <= h; y++) {
        const edge = x === x0 || x === x0 + bw - 1 || z === z0 || z === z0 + bd - 1;
        let b: number = mat;
        if (edge && y === 2 && (x + z) % 3 === 0) b = B.WINDOW;
        if (!edge && y < h) b = B.STONE;
        w.init(x, y, z, b);
      }
      // trappetag
      const dd = Math.min(x - x0, x0 + bw - 1 - x, z - z0, z0 + bd - 1 - z);
      for (let y = h + 1; y <= h + 1 + Math.min(dd, 3); y++) w.init(x, y, z, B.ROOFTILE);
    }
  }
  // Træer og buske
  for (let i = 0; i < 160; i++) {
    const x = 2 + rng.int(W - 4), z = 2 + rng.int(D - 4);
    if (!free(x - 1, z - 1, x + 1, z + 1)) continue;
    const h = 3 + rng.int(3);
    for (let y = 1; y <= h; y++) w.init(x, y, z, B.LOG);
    for (let dy = 0; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dz) + dy > 3) continue;
      if (w.get(x + dx, h + dy, z + dz) === B.AIR) w.init(x + dx, h + dy, z + dz, B.LEAVES);
    }
  }
  const group = new THREE.Group();
  const C = 32;
  for (let z0 = 0; z0 < D; z0 += C) for (let x0 = 0; x0 < W; x0 += C) {
    const g = meshRegion(w, x0, z0, Math.min(W, x0 + C), Math.min(D, z0 + C), -M, -M);
    if (!g) continue;
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    group.add(m);
  }
  // Uendelig mark under disen
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: 0x7a9f55 }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(mapW / 2, 0.98, mapD / 2);
  group.add(plane);
  return group;
}

/** Fjerne bjergtinder rundt om en dal. Bygget af blokke på 4×4×4 m, så de er billige at tegne og ser
 * voldsomme ud på afstand (disen tager det meste af detaljen). */
/** Bjergkulisse. Med `fjord` fortsætter et sund (vand) ud gennem bjergene mod nord fra banens kant (x0..x1). */
export function buildMountainBackdrop(mapW: number, mapD: number, material: THREE.Material, fjord?: { x0: number; x1: number; waterY: number }): THREE.Group {
  const S = 4, M = 30; // celler à 4 m; ringens bredde i celler
  const iw = Math.ceil(mapW / S), id = Math.ceil(mapD / S);
  const W = iw + M * 2, D = id + M * 2, H = 30;
  const w = new VoxelWorld(W, H, D);
  const n2 = (x: number, z: number, f: number) => {
    const xi = Math.floor(x * f), zi = Math.floor(z * f), fx = x * f - xi, fz = z * f - zi;
    const hsh = (a: number, b: number) => { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const a = hsh(xi, zi), b = hsh(xi + 1, zi), c = hsh(xi, zi + 1), d = hsh(xi + 1, zi + 1);
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const inner = x >= M && x < M + iw && z >= M && z < M + id;
    if (inner) continue;
    const d = Math.max(M - x, x - (M + iw - 1), M - z, z - (M + id - 1), 0);
    const ridge = 1 - Math.abs(n2(x, z, 1 / 7) * 2 - 1);
    let h = Math.round(7 + ridge * 13 + n2(x, z, 1 / 3) * 5 + Math.min(d, 6) * 0.6 - Math.max(0, d - 22) * 0.9);
    h = Math.max(1, Math.min(H - 1, h));
    if (fjord && z < M) {
      // Sundet bugter sig ud mod havet; bredderne skråner ned mod vandet
      const dd = M - z;
      const cx = M + (fjord.x0 + fjord.x1) / 2 / S + Math.sin(dd / 8) * 2.5 + dd * 0.22;
      const half = (fjord.x1 - fjord.x0) / 2 / S + dd * 0.06;
      const a = Math.abs(x + 0.5 - cx);
      if (a < half) h = 0;
      else if (a < half + 6) h = Math.min(h, 2 + Math.round((a - half) * 2.2));
    }
    for (let y = 0; y < h; y++) {
      let b: number = y < h - 1 ? B.STONE : B.ROCK;
      if (y === h - 1 && h * S > 56) b = B.SNOW;
      else if (y === h - 1 && h * S < 26) b = B.GRASS;
      w.init(x, y, z, b);
    }
  }
  const group = new THREE.Group();
  const C = 32;
  for (let z0 = 0; z0 < D; z0 += C) for (let x0 = 0; x0 < W; x0 += C) {
    const g = meshRegion(w, x0, z0, Math.min(W, x0 + C), Math.min(D, z0 + C), -M, -M);
    if (!g) continue;
    const m = new THREE.Mesh(g, material);
    group.add(m);
  }
  group.scale.setScalar(S);
  group.position.y = -2;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshLambertMaterial({ color: 0x7a8a6a }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(mapW / 2, 1.5, mapD / 2);
  const out = new THREE.Group();
  out.add(group, plane);
  if (fjord) {
    const len = M * S, wx = (fjord.x1 - fjord.x0) + 140;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(wx, len + 4), new THREE.MeshLambertMaterial({ color: 0x3a74a0, emissive: 0x0d2a44 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set((fjord.x0 + fjord.x1) / 2 + 40, fjord.waterY - 0.02, -len / 2 + 1);
    out.add(water);
  }
  return out;
}
