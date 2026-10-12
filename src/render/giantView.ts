// Tegning af kæmperne: hver kropsdel er en kasse, der placeres med PRÆCIS samme transform som hitboksen
// i kernen (src/hunt/giant.ts). Pixel-teksturer i samme stil som byen: rødlig ler/sandsten, revner, mos,
// glødende øjne og en glødende krystal i nakken (det svage punkt).
import * as THREE from 'three';
import type { Giant, PartKind } from '../hunt/giant';
import type { Tf } from '../hunt/tf';
import { muzzleFlashTexture } from './characters';
import { HUNT } from '../config/hunt';

const PX = 16;

function canvasTex(draw: (g: CanvasRenderingContext2D, rnd: () => number) => void, seed: number, w = PX, h = PX, repeat = true): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  draw(g, rnd);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

interface Palette { base: number[]; crack: number; moss: number; dark: number }
const PAL_CLAY: Palette = { base: [0xa8714c, 0xb27a53, 0x9c6845, 0xbb8660], crack: 0x5e3a24, moss: 0x5d8a3a, dark: 0x7c5034 };
const PAL_STONE: Palette = { base: [0x8a8379, 0x948d82, 0x7f786e, 0x9e978b], crack: 0x47423b, moss: 0x4f7d34, dark: 0x625c54 };

const PAL_RUNNER: Palette = { base: [0xc2ab84, 0xcdb68e, 0xb59d77, 0xd4c09a], crack: 0x6b5233, moss: 0x8a7a3a, dark: 0x8f7652 };
const PAL_THROWER: Palette = { base: [0x6d6a4e, 0x77735a, 0x625f45, 0x807b60], crack: 0x3a3826, moss: 0x4f7d34, dark: 0x4c4934 };
const PAL_SEA: Palette = { base: [0x3e5a5c, 0x48666a, 0x35504f, 0x557373], crack: 0x1d2c2c, moss: 0x3f7a4a, dark: 0x2a3d3e };
const PAL_MOUNT: Palette = { base: [0x4a4844, 0x55524c, 0x403e3a, 0x5c5850], crack: 0x2a2624, moss: 0x4f7d34, dark: 0x33312e };

/** Hud-tekstur. Med `glowOut` tegnes revnerne også i et separat lys-kort (Bjergkæmpens glødende revner). */
function skinTex(p: Palette, seed: number, glowOut?: { tex: THREE.Texture | null }, cracks = 1, glowCol = '#ff7a2a') {
  const pts: [number, number][] = [];
  const tex = canvasTex((g, rnd) => {
    for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) { g.fillStyle = hex(p.base[(rnd() * p.base.length) | 0]); g.fillRect(x, y, 1, 1); }
    // revner
    g.fillStyle = hex(p.crack);
    for (let c = 0; c < cracks; c++) {
      let x = (rnd() * 16) | 0, y = (rnd() * 4) | 0;
      for (let i = 0; i < 14; i++) { g.fillRect(x, y % 16, 1, 1); pts.push([x, y % 16]); y++; x = (x + (rnd() < 0.4 ? 1 : rnd() < 0.3 ? 15 : 0)) % 16; }
    }
    // mos-pletter
    g.fillStyle = hex(p.moss);
    for (let i = 0; i < 5; i++) g.fillRect((rnd() * 15) | 0, (rnd() * 15) | 0, 1 + ((rnd() * 2) | 0), 1);
    // lyse kanter
    g.fillStyle = 'rgba(255,240,210,0.18)'; g.fillRect(0, 0, 16, 1);
  }, seed);
  if (glowOut) {
    glowOut.tex = canvasTex((g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 16, 16);
      for (const [x, y] of pts) { g.fillStyle = glowCol; g.fillRect(x, y, 1, 1); }
    }, seed);
  }
  return tex;
}

/** Kun øjnene (til at lyse i mørke) */
function eyeTex(big: boolean) {
  return canvasTex((g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = big ? '#ff6a2a' : '#ffb347';
    g.fillRect(4, 7, 2, 1); g.fillRect(10, 7, 2, 1);
  }, 3, PX, PX, false);
}

function faceTex(p: Palette, big: boolean) {
  return canvasTex((g, rnd) => {
    for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) { g.fillStyle = hex(p.base[(rnd() * p.base.length) | 0]); g.fillRect(x, y, 1, 1); }
    g.fillStyle = hex(p.dark); g.fillRect(2, 4, 12, 2); // bryn
    g.fillStyle = '#1b120c'; g.fillRect(3, 6, 4, 3); g.fillRect(9, 6, 4, 3); // øjenhuler
    g.fillStyle = big ? '#ff6a2a' : '#ffb347'; g.fillRect(4, 7, 2, 1); g.fillRect(10, 7, 2, 1); // gløder
    g.fillStyle = hex(p.dark); g.fillRect(7, 8, 2, 3); // næse
    g.fillStyle = '#2a1810'; g.fillRect(4, 12, 8, 2); // mund
    g.fillStyle = '#d9cfa9'; for (let x = 5; x < 11; x += 2) g.fillRect(x, 12, 1, 1); // tænder
    g.fillStyle = hex(p.crack); g.fillRect(12, 2, 1, 4); g.fillRect(13, 5, 1, 2);
  }, big ? 91 : 17, PX, PX, false);
}

function crystalTex() {
  return canvasTex((g) => {
    const cols = ['#ffd27a', '#ffb347', '#ff8a2a', '#fff2c4'];
    for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      g.fillStyle = d < 3 ? cols[3] : d < 6 ? cols[0] : d < 9 ? cols[1] : cols[2];
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = '#7a2e0c'; for (let i = 0; i < 16; i += 5) { g.fillRect(i, 0, 1, 16); }
  }, 5, PX, PX, false);
}

function clothTex() {
  return canvasTex((g, rnd) => {
    for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) { g.fillStyle = (x + y) % 5 === 0 ? '#3f2a1c' : rnd() < 0.5 ? '#5a3d28' : '#634430'; g.fillRect(x, y, 1, 1); }
    g.fillStyle = '#c9a050'; g.fillRect(0, 2, 16, 1);
  }, 33);
}

/** Kasse hvor teksturen gentages med en fast pixeltæthed (pxPerM) */
function tiledBox(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], pxPerM: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    if (Array.isArray(mat) && f === 5) continue; // ansigtet strækkes over hele forsiden
    uv.setXY(i, (uv.getX(i) * dims[f][0] * pxPerM) / PX, (uv.getY(i) * dims[f][1] * pxPerM) / PX);
  }
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Stenmateriale til kastede klipper og stenen i hånden */
export function rockMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: skinTex(PAL_STONE, 123) });
}

export function tfToMatrix(tf: Tf, out = new THREE.Matrix4()): THREE.Matrix4 {
  const r = tf.r, t = tf.t;
  out.set(r[0], r[1], r[2], t.x, r[3], r[4], r[5], t.y, r[6], r[7], r[8], t.z, 0, 0, 0, 1);
  return out;
}

let warnTex: THREE.Texture | null = null;
function warningTexture() {
  if (warnTex) return warnTex;
  warnTex = canvasTex((g) => {
    g.clearRect(0, 0, 16, 16);
    g.fillStyle = '#ff3b1f';
    for (let y = 1; y < 15; y++) { const w = Math.floor((y / 15) * 7); g.fillRect(8 - w, y, w * 2, 1); }
    g.fillStyle = '#fff3c8'; g.fillRect(7, 5, 2, 6); g.fillRect(7, 12, 2, 2);
  }, 3, 16, 16, false);
  return warnTex;
}

export class GiantView {
  readonly root = new THREE.Group();
  private meshes = new Map<PartKind, THREE.Mesh>();
  private extras: { mesh: THREE.Mesh; part: PartKind; local: THREE.Matrix4 }[] = [];
  private bodyMat: THREE.MeshLambertMaterial;
  private armMats: THREE.MeshLambertMaterial[];
  private crystalMat: THREE.MeshLambertMaterial;
  private glow: THREE.Sprite;
  private warn: THREE.Sprite;
  private rock: THREE.Mesh;
  private allMats: THREE.MeshLambertMaterial[] = [];
  private tmp = new THREE.Matrix4();

  private faceMat: THREE.MeshLambertMaterial;
  private cracked: THREE.MeshLambertMaterial[] = [];
  /** Løberen: ring på jorden der, hvor den lander */
  private marker: THREE.Mesh | null = null;

  constructor(readonly g: Giant, rockMat: THREE.Material) {
    const sea = g.variant === 'sea';
    const mountain = g.variant === 'mountain' || sea; // begge bosser har glødende revner
    const runner = g.variant === 'runner', thrower = g.variant === 'thrower';
    const pal = sea ? PAL_SEA : g.variant === 'mountain' ? PAL_MOUNT : runner ? PAL_RUNNER : thrower ? PAL_THROWER : g.big ? PAL_STONE : PAL_CLAY;
    const fierce = g.big || runner;
    const mk = (map: THREE.Texture) => { const m = new THREE.MeshLambertMaterial({ map, transparent: false }); this.allMats.push(m); return m; };
    const skin = (seed: number) => {
      if (!mountain) return mk(skinTex(pal, seed));
      const out = { tex: null as THREE.Texture | null };
      const m = mk(skinTex(pal, seed, out, 2, sea ? '#5ff0e0' : '#ff7a2a'));
      m.emissiveMap = out.tex; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 0.8;
      this.cracked.push(m);
      return m;
    };
    this.bodyMat = skin(g.big ? 77 : runner ? 55 : thrower ? 61 : 7);
    this.armMats = [skin(41), skin(42)];
    const face = mk(faceTex(pal, fierce));
    face.emissiveMap = eyeTex(fierce); face.emissive = new THREE.Color(0xffffff); face.emissiveIntensity = 0.3;
    this.faceMat = face;
    const faceMats = [this.bodyMat, this.bodyMat, this.bodyMat, this.bodyMat, this.bodyMat, face];
    this.crystalMat = new THREE.MeshLambertMaterial({ map: crystalTex(), emissive: new THREE.Color(0xff7a1a), emissiveIntensity: 0.9 });
    const cloth = mk(clothTex());
    const ppm = 3.2 / g.scale; // grov pixeltæthed – kæmper ser ud som klodser, ikke glatte figurer
    for (const part of g.parts) {
      const h = part.box.h;
      let mesh: THREE.Mesh;
      if (part.kind === 'head') mesh = tiledBox(h.x * 2, h.y * 2, h.z * 2, faceMats, ppm);
      else if (part.kind === 'nape') mesh = new THREE.Mesh(new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2), this.crystalMat);
      else if (part.kind === 'armL') mesh = tiledBox(h.x * 2, h.y * 2, h.z * 2, this.armMats[0], ppm);
      else if (part.kind === 'armR') mesh = tiledBox(h.x * 2, h.y * 2, h.z * 2, this.armMats[1], ppm);
      else mesh = tiledBox(h.x * 2, h.y * 2, h.z * 2, this.bodyMat, ppm);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = part.kind !== 'nape';
      this.meshes.set(part.kind, mesh);
      this.root.add(mesh);
    }
    // Pynt der følger kropsdelene (ikke hitbokse): lændeklæde, skulderklipper, knoer, brynkam
    const s = g.scale;
    const extra = (part: PartKind, w: number, hh: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const m = tiledBox(w * s, hh * s, d * s, mat, ppm);
      m.matrixAutoUpdate = false;
      this.root.add(m);
      this.extras.push({ mesh: m, part, local: new THREE.Matrix4().makeTranslation(x * s, y * s, z * s) });
    };
    const D = g.dims;
    extra('torso', D.torsoW + 0.3, 1.5, D.torsoD + 0.3, 0, -D.torsoH / 2 + 0.5, 0, cloth); // lændeklæde
    extra('torso', D.torsoW * 0.38, 0.9, D.torsoD + 0.2, -D.torsoW * 0.32, -D.torsoH / 2 - 0.5, -0.05, cloth);
    extra('torso', D.torsoW * 0.38, 0.9, D.torsoD + 0.2, D.torsoW * 0.32, -D.torsoH / 2 - 0.5, -0.05, cloth);
    extra('torso', D.torsoW * 0.4, 1.0, D.torsoD * 0.78, -(D.torsoW / 2 - 0.1), D.torsoH / 2 - 0.4, 0, this.bodyMat); // skulderklipper
    extra('torso', D.torsoW * 0.4, 1.0, D.torsoD * 0.78, D.torsoW / 2 - 0.1, D.torsoH / 2 - 0.4, 0, this.bodyMat);
    extra('armL', D.armW + 0.3, 1.2, D.armW + 0.3, 0, -D.armL / 2 + 0.5, 0, this.armMats[0]); // næver
    extra('armR', D.armW + 0.3, 1.2, D.armW + 0.3, 0, -D.armL / 2 + 0.5, 0, this.armMats[1]);
    extra('head', D.headW + 0.2, 0.5, 0.6, 0, D.headH * 0.2, -(D.headD / 2 - 0.05), this.bodyMat); // brynkam
    if (runner) {
      // Løberen: kam på hovedet, rygtakker (under krystallen) og kløer
      const bone = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 }); this.allMats.push(bone);
      extra('head', 0.4, 1.0, D.headD * 0.9, 0, D.headH / 2 + 0.4, 0.1, this.bodyMat);
      for (const y of [-1.6, -0.5]) extra('torso', 0.5, 0.7, 0.8, 0, y, D.torsoD / 2 + 0.3, bone);
      for (const side of ['armL', 'armR'] as const) for (const x of [-0.4, 0, 0.4]) extra(side, 0.22, 1.1, 0.22, x, -D.armL / 2 - 0.4, -0.25, bone);
      extra('legL', D.legW + 0.2, 0.6, D.legD + 0.2, 0, -D.hipH * 0.15, 0, cloth); // benviklinger
      extra('legR', D.legW + 0.2, 0.6, D.legD + 0.2, 0, -D.hipH * 0.15, 0, cloth);
    }
    if (thrower) {
      // Kasteren: sæk med klippeblokke på ryggen (under krystallen), store skulderplader af træ og et bælte
      const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2c }); this.allMats.push(wood);
      extra('torso', 4.2, 2.6, 1.8, 0, -1.6, D.torsoD / 2 + 0.9, cloth);
      for (const x of [-1.2, 0, 1.2]) extra('torso', 1.1, 1.0, 1.1, x, -0.1, D.torsoD / 2 + 0.9 + (x === 0 ? 0.2 : 0), this.bodyMat);
      for (const sx of [-1, 1]) extra('torso', 2.8, 0.6, D.torsoD + 0.6, sx * (D.torsoW / 2 + 0.2), D.torsoH / 2 + 0.2, 0, wood);
      extra('torso', D.torsoW + 0.4, 0.5, D.torsoD + 0.4, 0, -D.torsoH / 2 + 1.5, 0, wood);
    }
    if (g.big && !mountain && !thrower) { extra('head', 0.6, 1.4, 0.6, -1.0, 1.9, 0, this.bodyMat); extra('head', 0.6, 1.4, 0.6, 1.0, 1.9, 0, this.bodyMat); }
    if (sea) {
      // Havkæmpen: tang der hænger fra skuldre og arme, rurer, koralhorn og et skæg af tang
      const weed = new THREE.MeshLambertMaterial({ color: 0x2f5a34 }); this.allMats.push(weed);
      const coral = new THREE.MeshLambertMaterial({ color: 0xd27a6a }); this.allMats.push(coral);
      const shell = new THREE.MeshLambertMaterial({ color: 0xe6e0c8 }); this.allMats.push(shell);
      for (const sx of [-1, 1]) {
        extra('head', 0.6, 1.8, 0.6, sx * 1.1, 2.0, 0.1, coral);
        extra('head', 0.5, 0.5, 1.2, sx * 1.1, 2.6, -0.3, coral);
        extra('head', 0.4, 0.9, 0.4, sx * 0.6, 1.8, 0.3, coral);
        for (const k of [0, 1, 2]) extra('torso', 0.35, 2.4 + k * 0.6, 0.35, sx * (1.6 + k * 0.5), 1.4 - k * 0.4, -1.45 + k * 0.2, weed);
        extra('armL', 0.3, 2.6, 0.3, sx * 0.5, -0.5, 0.95, weed);
        extra('armR', 0.3, 2.2, 0.3, sx * 0.5, 0.2, 0.95, weed);
        extra('torso', 0.7, 0.5, 0.7, sx * 1.2, -0.8, -1.45, shell);
        extra('torso', 0.5, 0.4, 0.5, sx * 2.0, 0.6, -1.45, shell);
        extra('legL', 0.6, 0.5, 0.6, sx * 0.6, -1.0, -1.05, shell);
      }
      extra('head', 2.0, 1.4, 0.4, 0, -1.6, -1.25, weed); // skæg af tang
      extra('torso', 3.2, 2.0, 0.4, 0.4, -0.5, 1.45, weed); // tang på ryggen (under krystallen)
    }
    if (mountain && !sea) {
      // Bjergkæmpen: store krumme horn, mos og to små graner på skuldrene, skæg af mos
      const moss = mk(clothTex()); moss.color = new THREE.Color(0x4f7d34); moss.map = null;
      const bark = new THREE.MeshLambertMaterial({ color: 0x5a3f24 }); this.allMats.push(bark);
      const pine = new THREE.MeshLambertMaterial({ color: 0x2f6b2c }); this.allMats.push(pine);
      for (const sx of [-1, 1]) {
        extra('head', 0.8, 1.6, 0.8, sx * 1.2, 1.8, 0.1, this.bodyMat);
        extra('head', 0.7, 0.7, 1.6, sx * 1.55, 2.6, -0.4, this.bodyMat);
        extra('torso', 2.4, 0.5, 2.6, sx * 2.4, 3.0, 0, moss);
        extra('torso', 0.35, 1.4, 0.35, sx * 2.6, 3.9, 0.3, bark);
        extra('torso', 1.5, 0.8, 1.5, sx * 2.6, 4.4, 0.3, pine);
        extra('torso', 1.0, 0.7, 1.0, sx * 2.6, 5.0, 0.3, pine);
        extra('torso', 0.5, 0.6, 0.5, sx * 2.6, 5.5, 0.3, pine);
      }
      extra('head', 2.2, 0.8, 0.5, 0, -1.4, -1.25, moss); // skæg
      extra('torso', 3.0, 2.0, 0.4, 0.8, 0.5, 1.45, moss); // mos på ryggen
    }
    // Glød bag krystallen, så den ses på afstand
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: muzzleFlashTexture(), color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
    this.glow.scale.setScalar(2.5 * s);
    this.root.add(this.glow);
    // Advarsel over hovedet, når et angreb er på vej
    this.warn = new THREE.Sprite(new THREE.SpriteMaterial({ map: warningTexture(), depthTest: false, transparent: true }));
    this.warn.scale.setScalar(2.4 * s);
    this.warn.renderOrder = 20;
    this.warn.visible = false;
    this.root.add(this.warn);
    // Stenen i hånden før kastet
    const rs = thrower ? 3.2 : 2.3;
    this.rock = new THREE.Mesh(new THREE.BoxGeometry(rs, rs, rs), rockMat);
    this.rock.castShadow = true;
    this.rock.visible = false;
    this.root.add(this.rock);
    if (runner) {
      const ring = new THREE.RingGeometry(HUNT.leapRadius * s * 0.82, HUNT.leapRadius * s, 32);
      ring.rotateX(-Math.PI / 2);
      this.marker = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
      this.marker.renderOrder = 5;
      this.marker.visible = false;
      this.root.add(this.marker);
    }
  }

  update(dt: number, time: number, night = 0) {
    const g = this.g;
    for (const part of g.parts) {
      const m = this.meshes.get(part.kind)!;
      tfToMatrix(part.box.tf, m.matrix);
      m.matrixWorldNeedsUpdate = true;
    }
    for (const e of this.extras) {
      const base = tfToMatrix(g.part(e.part).box.tf, this.tmp);
      e.mesh.matrix.multiplyMatrices(base, e.local);
      e.mesh.matrixWorldNeedsUpdate = true;
    }
    // Øjnene lyser (mest om natten); Bjergkæmpens revner gløder
    this.faceMat.emissiveIntensity = g.alive ? 0.3 + night * 1.4 : 0;
    // Træf: kort rødlig glød. Varsling: armen gløder rødt i takt.
    const flash = g.hitFlash > 0 ? g.hitFlash / 0.12 : 0;
    if (this.cracked.length) {
      const k = g.alive ? 0.55 + night * 0.35 + 0.2 * Math.sin(time * 2.2) + flash * 2.5 : Math.max(0, this.cracked[0].emissiveIntensity - dt);
      for (const m of this.cracked) m.emissiveIntensity = k;
      this.armMats[1].emissiveIntensity = g.telegraph === 'swipe' ? k + 1.5 * (0.5 + 0.5 * Math.sin(time * 18)) : k;
      this.armMats[0].emissiveIntensity = g.telegraph === 'throw' ? k + 1.5 * (0.5 + 0.5 * Math.sin(time * 18)) : k;
    }
    const tele = g.telegraph;
    const pulse = 0.5 + 0.5 * Math.sin(time * 18);
    if (!this.cracked.length) {
      if (tele === 'leap' && g.state === 'windLeap') this.bodyMat.emissive.setRGB(0.75 * pulse, 0.28 * pulse, 0.02);
      else this.bodyMat.emissive.setRGB(0.55 * flash, 0.12 * flash, 0.05 * flash);
    }
    if (this.marker) {
      this.marker.visible = tele === 'leap' && g.alive;
      if (this.marker.visible) {
        this.marker.position.set(g.leapTo.x, g.leapTo.y + 0.08, g.leapTo.z);
        (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.4 * pulse;
      }
    }
    if (!this.cracked.length) {
      this.armMats[1].emissive.setRGB(tele === 'swipe' ? 0.8 * pulse : 0.55 * flash, tele === 'swipe' ? 0.08 : 0.12 * flash, 0.05 * flash);
      this.armMats[0].emissive.setRGB(tele === 'throw' ? 0.8 * pulse : 0.55 * flash, tele === 'throw' ? 0.08 : 0.12 * flash, 0.05 * flash);
    }
    // Krystallen pulserer; hvidt blink ved træf
    const wf = g.weakFlash > 0 ? 1 : 0;
    this.crystalMat.emissiveIntensity = g.alive ? 0.7 + 0.35 * Math.sin(time * 4) + wf * 1.5 : Math.max(0, this.crystalMat.emissiveIntensity - dt);
    this.crystalMat.emissive.setHex(wf ? 0xffffff : 0xff7a1a);
    const nape = g.part('nape').box;
    const back = { x: nape.tf.r[2] * nape.h.z, y: nape.tf.r[5] * nape.h.z, z: nape.tf.r[8] * nape.h.z };
    this.glow.position.set(nape.tf.t.x + back.x * 1.5, nape.tf.t.y + back.y * 1.5, nape.tf.t.z + back.z * 1.5);
    (this.glow.material as THREE.SpriteMaterial).opacity = g.alive ? 0.55 + 0.3 * Math.sin(time * 4) + wf * 0.4 : 0;
    // Advarsel
    this.warn.visible = !!tele && g.alive;
    if (this.warn.visible) {
      const head = g.headPos();
      this.warn.position.set(head.x, head.y + 3.2 * g.scale + Math.sin(time * 10) * 0.2, head.z);
      (this.warn.material as THREE.SpriteMaterial).color.setHex(tele === 'throw' ? 0xffd040 : tele === 'leap' ? 0xffa060 : 0xffffff);
    }
    // Sten i hånden
    this.rock.visible = g.rockInHand;
    if (g.rockInHand) {
      const hp = g.handPos('L');
      this.rock.position.set(hp.x, hp.y, hp.z);
      this.rock.rotation.x += dt * 2;
    }
  }

  /** Hvor kroppen er (til smuldre-partikler ved død) */
  partCenters(): THREE.Vector3[] {
    return this.g.parts.map((p) => new THREE.Vector3(p.box.tf.t.x, p.box.tf.t.y, p.box.tf.t.z));
  }

  dispose() {
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    for (const m of this.allMats) { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); }
    this.crystalMat.map?.dispose(); this.crystalMat.dispose();
    if (this.marker) (this.marker.material as THREE.Material).dispose();
  }
}
