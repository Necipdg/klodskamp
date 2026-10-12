// Blokverdenen som mesh: én mesh pr. 16×16-klump, kun synlige flader, bløde hjørneskygger (AO) i vertexfarver.
import * as THREE from 'three';
import { BLOCKS, VARIANTS, isSolid } from '../core/blocks';
import { CHUNK, type VoxelWorld } from '../core/world';
import { tileUV } from './textures';

const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const AO_LEVELS = [0.52, 0.7, 0.85, 1];

const vhash = (x: number, y: number, z: number, f: number) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + f * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/** Byg geometri for blokkene i [x0,x1) × [z0,z1) */
export function meshRegion(w: VoxelWorld, x0: number, z0: number, x1: number, z1: number, ox = 0, oz = 0): THREE.BufferGeometry | null {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const solid = (x: number, y: number, z: number) => {
    // Udenfor verdenen regnes som luft på siderne (så kanten tegnes), og fast nedadtil
    if (y < 0) return true;
    if (x < 0 || z < 0 || x >= w.sx || z >= w.sz || y >= w.sy) return false;
    return isSolid(w.blocks[(y * w.sz + z) * w.sx + x]);
  };
  for (let y = 0; y < w.sy; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const b = w.blocks[(y * w.sz + z) * w.sx + x];
    if (!b) continue;
    const def = BLOCKS[b];
    if (!def.solid) continue;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const [nx, ny, nz] = F.n;
      if (solid(x + nx, y + ny, z + nz)) continue;
      // Gulvet under banen og bunden af blokke tegnes ikke, hvis de aldrig kan ses
      if (ny === -1 && y === 0) continue;
      let tile = ny === 1 ? def.tiles[0] : ny === -1 ? def.tiles[2] : def.tiles[1];
      const vars = VARIANTS[tile];
      if (vars) tile = vars[vhash(x, y, z, f) % vars.length];
      const [u0, v0, u1, v1] = tileUV(tile);
      const base = pos.length / 3;
      const ao: number[] = [];
      // tangentakser
      const ax = nx !== 0 ? [1, 2] : ny !== 0 ? [0, 2] : [0, 1];
      for (let k = 0; k < 4; k++) {
        const c = F.c[k];
        pos.push(x + c[0] + ox, y + c[1], z + c[2] + oz);
        nor.push(nx, ny, nz);
        // AO
        const p = [x + nx, y + ny, z + nz];
        const s1 = [0, 0, 0], s2 = [0, 0, 0];
        s1[ax[0]] = c[ax[0]] * 2 - 1;
        s2[ax[1]] = c[ax[1]] * 2 - 1;
        const a = solid(p[0] + s1[0], p[1] + s1[1], p[2] + s1[2]) ? 1 : 0;
        const bb = solid(p[0] + s2[0], p[1] + s2[1], p[2] + s2[2]) ? 1 : 0;
        const cc = solid(p[0] + s1[0] + s2[0], p[1] + s1[1] + s2[1], p[2] + s1[2] + s2[2]) ? 1 : 0;
        const lvl = a && bb ? 0 : 3 - (a + bb + cc);
        ao.push(lvl);
        const l = AO_LEVELS[lvl];
        col.push(l, l, l);
      }
      if (ny === 0) uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
      else uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
      if (ao[0] + ao[2] < ao[1] + ao[3]) idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Holder klump-meshes ajour med verdenen */
export class WorldRenderer {
  readonly group = new THREE.Group();
  private meshes = new Map<number, THREE.Mesh>();

  constructor(private world: VoxelWorld, private material: THREE.Material) {
    for (let cz = 0; cz < world.chunksZ; cz++) for (let cx = 0; cx < world.chunksX; cx++) this.rebuild(cz * 1000 + cx);
    world.dirtyChunks.clear();
  }

  private rebuild(key: number) {
    const cx = key % 1000, cz = Math.floor(key / 1000);
    const old = this.meshes.get(key);
    const g = meshRegion(this.world, cx * CHUNK, cz * CHUNK, Math.min(this.world.sx, (cx + 1) * CHUNK), Math.min(this.world.sz, (cz + 1) * CHUNK));
    if (old) { old.geometry.dispose(); this.group.remove(old); this.meshes.delete(key); }
    if (!g) return;
    const m = new THREE.Mesh(g, this.material);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    this.meshes.set(key, m);
  }

  update() {
    if (!this.world.dirtyChunks.size) return;
    for (const k of this.world.dirtyChunks) this.rebuild(k);
    this.world.dirtyChunks.clear();
  }
}
