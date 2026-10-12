// Våbenmodeller bygget af kasser med flisebare pixel-teksturer (samme pixelstørrelse på alle flader).
import * as THREE from 'three';
import type { WeaponId } from '../config/weapons';
import { T } from '../core/blocks';
import { tileCanvas } from './textures';

type Mat = 'dark' | 'mid' | 'tan' | 'black' | 'steel' | 'clay' | 'green' | 'red' | 'blue' | 'wood';

const PX = 16;
function matTexture(kind: Mat): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const g = c.getContext('2d')!;
  const base: Record<Mat, number[]> = {
    dark: [0x2b2e33, 0x32363c, 0x26292d, 0x3a3e45],
    mid: [0x4a4f57, 0x545a63, 0x424750, 0x5f6670],
    tan: [0xb59a6a, 0xbea474, 0xa88d5e, 0xc8af80],
    black: [0x1c1d20, 0x222327, 0x17181a, 0x2a2b30],
    steel: [0xb9c0c8, 0xc8cfd6, 0xa9b0b8, 0xdfe5ea],
    clay: [0xd8cfa8, 0xcfc59c, 0xe0d8b4, 0xc4b98e],
    green: [0x46c96a, 0x3db35d, 0x5fe080, 0x38a656],
    red: [0xc0392b, 0xa93226, 0xd14636, 0x962b20],
    blue: [0x2e6fc0, 0x275fa6, 0x3a80d6, 0x22549a],
    wood: [0x8a5a32, 0x96653a, 0x7c4f2b, 0xa06c40],
  };
  let s = kind.length * 77;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    const pal = base[kind];
    let col = pal[(rnd() * 3) | 0];
    if (y === 0 || x === 0) col = pal[3]; // lys kant (slid metal)
    g.fillStyle = `#${col.toString(16).padStart(6, '0')}`;
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const mats = new Map<string, THREE.Material>();
export function gunMat(kind: Mat): THREE.Material {
  let m = mats.get(kind);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ map: matTexture(kind), emissive: kind === 'green' ? 0x1f7a3a : 0x000000 });
    mats.set(kind, m);
  }
  return m;
}

/** Kasse hvor teksturen gentages så én pixel ≈ 1/pxPerM meter */
export function pbox(w: number, h: number, d: number, kind: Mat | THREE.Material, pxPerM = 64): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, (uv.getX(i) * dims[f][0] * pxPerM) / PX, (uv.getY(i) * dims[f][1] * pxPerM) / PX);
  }
  const m = new THREE.Mesh(g, typeof kind === 'string' ? gunMat(kind) : kind);
  m.castShadow = true;
  return m;
}

function add(gr: THREE.Group, m: THREE.Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  gr.add(m);
  return m;
}

export interface GunModel {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  /** Hvor venstre hånd holder (forskæfte) */
  support: THREE.Vector3;
  mag?: THREE.Object3D;
}

let blockMat: THREE.Material | null = null;

export function buildGun(id: WeaponId | 'blocks' | 'bomb'): GunModel {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let support = new THREE.Vector3(0, 0, -0.25);
  let mag: THREE.Object3D | undefined;
  switch (id) {
    case 'rifle': {
      add(g, pbox(0.07, 0.09, 0.3, 'dark'), 0, 0.03, -0.05);
      add(g, pbox(0.06, 0.05, 0.16, 'mid'), 0, -0.035, -0.03);
      add(g, pbox(0.078, 0.078, 0.24, 'tan'), 0, 0.035, -0.32);
      for (let i = 0; i < 4; i++) add(g, pbox(0.082, 0.012, 0.02, 'black'), 0, 0.035, -0.23 - i * 0.055);
      add(g, pbox(0.03, 0.03, 0.15, 'mid'), 0, 0.04, -0.51);
      add(g, pbox(0.046, 0.046, 0.055, 'black'), 0, 0.04, -0.605);
      mag = add(g, pbox(0.05, 0.17, 0.085, 'dark'), 0, -0.11, -0.12, 0.22);
      add(g, pbox(0.045, 0.12, 0.055, 'black'), 0, -0.085, 0.07, -0.32);
      add(g, pbox(0.056, 0.09, 0.22, 'tan'), 0, 0.012, 0.22);
      add(g, pbox(0.06, 0.115, 0.025, 'black'), 0, 0.0, 0.335);
      add(g, pbox(0.036, 0.022, 0.3, 'black'), 0, 0.087, -0.12);
      add(g, pbox(0.03, 0.045, 0.045, 'black'), 0, 0.115, 0.0);
      add(g, pbox(0.012, 0.05, 0.018, 'black'), 0, 0.105, -0.41);
      add(g, pbox(0.02, 0.02, 0.04, 'mid'), 0.045, 0.05, 0.02); // ladegreb
      muzzle.position.set(0, 0.04, -0.65);
      support = new THREE.Vector3(0, -0.01, -0.3);
      break;
    }
    case 'smg': {
      add(g, pbox(0.065, 0.085, 0.26, 'dark'), 0, 0.03, -0.06);
      add(g, pbox(0.07, 0.07, 0.14, 'tan'), 0, 0.03, -0.25);
      add(g, pbox(0.028, 0.028, 0.08, 'mid'), 0, 0.035, -0.36);
      add(g, pbox(0.04, 0.04, 0.04, 'black'), 0, 0.035, -0.41);
      mag = add(g, pbox(0.04, 0.2, 0.05, 'black'), 0, -0.12, -0.1, 0.05);
      add(g, pbox(0.045, 0.11, 0.05, 'black'), 0, -0.075, 0.05, -0.3);
      add(g, pbox(0.012, 0.012, 0.2, 'black'), 0.028, 0.02, 0.17);
      add(g, pbox(0.012, 0.012, 0.2, 'black'), -0.028, 0.02, 0.17);
      add(g, pbox(0.07, 0.06, 0.015, 'black'), 0, 0.01, 0.27);
      add(g, pbox(0.03, 0.035, 0.03, 'black'), 0, 0.085, 0.0);
      add(g, pbox(0.01, 0.035, 0.015, 'black'), 0, 0.08, -0.3);
      muzzle.position.set(0, 0.035, -0.44);
      support = new THREE.Vector3(0, -0.02, -0.22);
      break;
    }
    case 'pistol': {
      add(g, pbox(0.036, 0.042, 0.19, 'dark'), 0, 0.05, -0.065);
      add(g, pbox(0.033, 0.03, 0.165, 'mid'), 0, 0.016, -0.055);
      add(g, pbox(0.034, 0.115, 0.052, 'black'), 0, -0.045, 0.025, -0.25);
      add(g, pbox(0.012, 0.012, 0.045, 'black'), 0, -0.012, -0.045);
      add(g, pbox(0.01, 0.014, 0.012, 'black'), 0, 0.077, -0.15);
      add(g, pbox(0.026, 0.014, 0.012, 'black'), 0, 0.077, 0.02);
      for (let i = 0; i < 4; i++) add(g, pbox(0.038, 0.03, 0.006, 'black'), 0, 0.05, 0.0 + i * 0.006 - 0.005);
      muzzle.position.set(0, 0.05, -0.17);
      support = new THREE.Vector3(0, -0.04, 0.03);
      mag = add(g, pbox(0.028, 0.02, 0.04, 'black'), 0, -0.1, 0.045, -0.25);
      break;
    }
    case 'knife': {
      add(g, pbox(0.032, 0.034, 0.11, 'black'), 0, 0, 0.02);
      add(g, pbox(0.05, 0.014, 0.014, 'mid'), 0, 0.004, -0.04);
      add(g, pbox(0.009, 0.036, 0.15, 'steel'), 0, 0.006, -0.12);
      add(g, pbox(0.009, 0.018, 0.04, 'steel'), 0, 0.012, -0.21);
      muzzle.position.set(0, 0, -0.22);
      break;
    }
    case 'bomb': {
      add(g, pbox(0.17, 0.075, 0.12, 'clay'), 0, 0, -0.05);
      add(g, pbox(0.075, 0.014, 0.07, 'black'), 0.02, 0.043, -0.05);
      add(g, pbox(0.045, 0.006, 0.022, 'green'), 0.02, 0.052, -0.07);
      add(g, pbox(0.012, 0.012, 0.13, 'red'), -0.06, 0.04, -0.05);
      add(g, pbox(0.012, 0.012, 0.13, 'blue'), -0.045, 0.04, -0.05);
      add(g, pbox(0.18, 0.02, 0.02, 'black'), 0, 0.0, -0.0);
      add(g, pbox(0.18, 0.02, 0.02, 'black'), 0, 0.0, -0.1);
      muzzle.position.set(0, 0, -0.12);
      break;
    }
    case 'blocks': {
      if (!blockMat) {
        const t = new THREE.CanvasTexture(tileCanvas(T.build, 1));
        t.colorSpace = THREE.SRGBColorSpace;
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
        blockMat = new THREE.MeshLambertMaterial({ map: t });
      }
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), blockMat);
      add(g, m, 0, 0.06, -0.08);
      muzzle.position.set(0, 0, -0.2);
      break;
    }
  }
  g.add(muzzle);
  return { group: g, muzzle, support, mag };
}

const colorMats = new Map<number, THREE.Material>();
/** Materiale med let pixelstøj i én farve (udstyr, hjelme osv.) */
export function colorMat(hex: number): THREE.Material {
  let m = colorMats.get(hex);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const g = c.getContext('2d')!;
  let s = hex % 997;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    const f = 0.9 + rnd() * 0.18 + (y === 0 ? 0.1 : 0);
    const r = Math.min(255, ((hex >> 16) & 255) * f), gg = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f);
    g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  m = new THREE.MeshLambertMaterial({ map: t });
  colorMats.set(hex, m);
  return m;
}
