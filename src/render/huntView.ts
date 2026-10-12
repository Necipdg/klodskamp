// Tegning af Kæmpejagt: byen, kæmperne, kastede sten, forsyningsdepoter, krogens wire og støv.
// Kernen (src/hunt) kender ikke Three.js – denne klasse læser kernens tilstand hvert billede.
import * as THREE from 'three';
import type { Hunt } from '../hunt/hunt';
import type { V3 } from '../core/math';
import { WorldRenderer } from './worldMesh';
import { Effects } from './effects';
import { GiantView, rockMaterial, tfToMatrix } from './giantView';
import { muzzleFlashTexture } from './characters';
import type { Quality } from '../game/settings';

const MAX_PUFFS = 90;

function pxTex(size: number, draw: (g: CanvasRenderingContext2D) => void, nearest = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  return t;
}

/** Blød, lidt pixelet støvsky */
function puffTexture() {
  return pxTex(16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
      if (d > 1) continue;
      const a = Math.round((1 - d * d) * 4) / 4; // trin i stedet for glat overgang
      g.fillStyle = `rgba(255,255,255,${a * 0.9})`;
      g.fillRect(x, y, 1, 1);
    }
  });
}

function crateTexture() {
  return pxTex(16, (g) => {
    const cols = ['#9a6a3c', '#8c5f35', '#a57444'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = cols[(x * 7 + y * 3 + (y % 5)) % 3]; g.fillRect(x, y, 1, 1); }
    g.fillStyle = '#5a3a1e';
    g.fillRect(0, 0, 16, 2); g.fillRect(0, 14, 16, 2); g.fillRect(0, 0, 2, 16); g.fillRect(14, 0, 2, 16);
    g.fillStyle = '#e8e2cf'; g.fillRect(5, 5, 6, 6);
    g.fillStyle = '#3fae5a'; g.fillRect(7, 6, 2, 4); g.fillRect(6, 7, 4, 2);
  });
}

function canisterTexture() {
  return pxTex(16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 4 === 0 ? '#58708a' : '#6a86a3'; g.fillRect(x, y, 1, 1); }
    g.fillStyle = '#f2c14e'; g.fillRect(0, 6, 16, 3);
    g.fillStyle = '#2b3542'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1);
  });
}

function beaconTexture() {
  return pxTex(4, (g) => {
    // lodret gradient: stærk forneden, svag foroven
    for (let y = 0; y < 4; y++) { g.fillStyle = `rgba(255,255,255,${0.15 + (y / 3) * 0.85})`; g.fillRect(0, y, 4, 1); }
  }, false);
}

/** Vand: blå pixelflade med lyse krusninger (forskydes langsomt) */
function waterTexture() {
  const t = pxTex(16, (g) => {
    const cols = ['#3f7fb5', '#4a8cc2', '#3a76aa', '#5597cc'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = cols[(x * 3 + y * 7 + ((x * y) % 5)) % 4]; g.fillRect(x, y, 1, 1); }
    g.fillStyle = '#9fd0f0';
    for (const [x, y, w] of [[2, 3, 3], [9, 6, 4], [4, 11, 3], [12, 13, 2], [0, 8, 2]]) g.fillRect(x, y, w, 1);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function fallTexture() {
  const t = pxTex(16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = (x * 5 + y * 3) % 7;
      g.fillStyle = v < 2 ? '#e8f6ff' : v < 4 ? '#9fd0f0' : '#5d9fd2';
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = '#ffffff'; for (const x of [1, 6, 11, 14]) g.fillRect(x, 0, 1, 16);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function sailTexture() {
  const t = pxTex(16, (g) => {
    g.fillStyle = '#e9dfc4'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#d8ccab'; for (let y = 1; y < 16; y += 3) g.fillRect(2, y, 12, 1);
    g.fillStyle = '#6e4f2e'; g.fillRect(0, 0, 2, 16); g.fillRect(14, 0, 2, 16); g.fillRect(0, 0, 16, 1); g.fillRect(7, 0, 2, 16);
    g.fillStyle = '#5a3f24'; g.fillRect(0, 8, 16, 1);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

interface Puff { s: THREE.Sprite; life: number; max: number; grow: number; vy: number; vx: number; vz: number; size: number; alpha: number }
interface DepotMesh { group: THREE.Group; beam: THREE.Mesh; beamMat: THREE.MeshBasicMaterial; icon: THREE.Sprite; id: number }

export class HuntScene {
  readonly group = new THREE.Group();
  readonly worldR: WorldRenderer;
  readonly fx: Effects;
  private giants = new Map<number, GiantView>();
  private rockMat = rockMaterial();
  private rockGeo = new THREE.BoxGeometry(1.8, 1.8, 1.8);
  private rocks = new Map<number, THREE.Mesh>();
  private depots: DepotMesh[] = [];
  private rope: THREE.Mesh;
  private hookHead: THREE.Mesh;
  /** Krogens affyringsrør på venstre underarm (ses nederst til venstre i førsteperson) */
  private launcher = new THREE.Group();
  private puffs: Puff[] = [];
  private puffI = 0;
  private time = 0;
  private sinkDustT = 0;
  quality: Quality = 2;
  private disposables: { dispose(): void }[] = [];
  private waterTex: THREE.Texture | null = null;
  private fallTex: THREE.Texture | null = null;
  private sails: { mesh: THREE.Mesh; mill: number; part: number }[] = [];
  private beacon: { glow: THREE.Sprite; beam: THREE.Mesh; y: number } | null = null;
  private mistT = 0;
  private torches: { s: THREE.Sprite; ph: number }[] = [];
  private torchMat: THREE.SpriteMaterial | null = null;
  private windows: THREE.Points | null = null;

  constructor(readonly hunt: Hunt, atlasMat: THREE.Material) {
    this.worldR = new WorldRenderer(hunt.world, atlasMat);
    this.group.add(this.worldR.group);
    this.fx = new Effects(hunt.world);
    this.group.add(this.fx.group);

    // Wire og krog
    const ropeMat = new THREE.MeshLambertMaterial({ color: 0x2a2620 });
    // Tynd ved affyringsrøret, tykkere ude ved krogen – så wiren ses på afstand uden at fylde skærmen tæt på
    const ropeGeo = new THREE.CylinderGeometry(0.045, 0.008, 1, 5, 1);
    ropeGeo.rotateX(Math.PI / 2);
    ropeGeo.translate(0, 0, 0.5);
    this.rope = new THREE.Mesh(ropeGeo, ropeMat);
    this.rope.visible = false;
    this.rope.frustumCulled = false;
    const hookMat = new THREE.MeshLambertMaterial({ color: 0xb8b8b0, emissive: 0x222222 });
    this.hookHead = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.4), hookMat);
    this.hookHead.visible = false;
    this.group.add(this.rope, this.hookHead);
    // Affyringsrør: metalrør med en lille gasflaske under
    const metal = new THREE.MeshLambertMaterial({ color: 0x4a4e54 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x23262a });
    const gasM = new THREE.MeshLambertMaterial({ color: 0x6a86a3 });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      this.launcher.add(b);
      this.disposables.push(b.geometry);
    };
    box(0.075, 0.075, 0.3, metal, 0, 0, 0);
    box(0.05, 0.05, 0.05, dark, 0, 0, -0.17);
    box(0.06, 0.06, 0.2, gasM, 0, -0.07, 0.04);
    box(0.08, 0.02, 0.08, dark, 0, -0.07, 0.15);
    this.launcher.renderOrder = 5;
    this.group.add(this.launcher);
    this.disposables.push(metal, dark, gasM);
    this.disposables.push(ropeMat, hookMat, this.rope.geometry, this.hookHead.geometry, this.rockGeo, this.rockMat);

    // Støvskyer
    const ptex = puffTexture();
    this.disposables.push(ptex);
    for (let i = 0; i < MAX_PUFFS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ptex, color: 0xcdbb98, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      this.group.add(s);
      this.puffs.push({ s, life: 0, max: 1, grow: 1, vy: 0, vx: 0, vz: 0, size: 1, alpha: 1 });
    }

    // Forsyningsdepoter: kasser, gasbeholdere og en grøn lyssøjle der ses på afstand
    const crateMat = new THREE.MeshLambertMaterial({ map: crateTexture() });
    const canMat = new THREE.MeshLambertMaterial({ map: canisterTexture() });
    const btex = beaconTexture();
    this.disposables.push(crateMat, canMat, btex, crateMat.map!, canMat.map!);
    const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const canGeo = new THREE.BoxGeometry(0.42, 1.0, 0.42);
    const iconTex = pxTex(16, (g) => {
      g.fillStyle = '#103018'; g.fillRect(3, 3, 10, 10);
      g.fillStyle = '#6dde8a'; g.fillRect(4, 4, 8, 8);
      g.fillStyle = '#103018'; g.fillRect(7, 5, 2, 6); g.fillRect(5, 7, 6, 2);
    });
    this.disposables.push(crateGeo, canGeo, iconTex);
    for (const d of hunt.depots) {
      const grp = new THREE.Group();
      grp.position.set(d.pos.x, d.pos.y, d.pos.z);
      const place = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z); m.rotation.y = ry;
        m.castShadow = true; m.receiveShadow = true;
        grp.add(m);
      };
      place(crateGeo, crateMat, -0.5, 0.45, -0.3, 0.1);
      place(crateGeo, crateMat, 0.5, 0.45, -0.25, -0.15);
      place(crateGeo, crateMat, 0.0, 1.35, -0.3, 0.3);
      place(canGeo, canMat, -0.6, 0.5, 0.55);
      place(canGeo, canMat, -0.1, 0.5, 0.65);
      place(canGeo, canMat, 0.55, 0.5, 0.5);
      const beamMat = new THREE.MeshBasicMaterial({ map: btex, color: 0x6dde8a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 26, 6, 1, true), beamMat);
      beam.position.y = 13;
      grp.add(beam);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex, depthTest: false, transparent: true }));
      icon.scale.setScalar(0.9);
      icon.position.y = 2.6;
      icon.renderOrder = 15;
      grp.add(icon);
      this.disposables.push(beamMat, beam.geometry, icon.material);
      this.group.add(grp);
      this.depots.push({ group: grp, beam, beamMat, icon, id: d.id });
    }
    this.buildWater();
    this.buildMills();
    this.buildBeacon();
    this.buildNightLights();
  }

  /** Fakler/lygter og oplyste vinduer – usynlige om dagen, tændes i skumringen */
  private buildNightLights() {
    const c = this.hunt.city;
    if (c.torches.length) {
      this.torchMat = new THREE.SpriteMaterial({ map: muzzleFlashTexture(), color: 0xffb04a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
      this.disposables.push(this.torchMat);
      for (const p of c.torches) {
        const sp = new THREE.Sprite(this.torchMat);
        sp.position.set(p.x, p.y, p.z);
        sp.scale.setScalar(1.7);
        sp.visible = false;
        this.group.add(sp);
        this.torches.push({ s: sp, ph: Math.random() * 10 });
      }
    }
    if (c.windowLights.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(c.windowLights.flatMap((p) => [p.x, p.y, p.z]), 3));
      const mat = new THREE.PointsMaterial({ color: 0xffcf7a, size: 0.95, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false });
      this.windows = new THREE.Points(geo, mat);
      this.windows.visible = false;
      this.group.add(this.windows);
      this.disposables.push(geo, mat);
    }
  }

  /** Floden som én flad, halvgennemsigtig flade + vandfald */
  private buildWater() {
    const c = this.hunt.city, w = c.water;
    if (!w) return;
    const W = c.world.sx, D = c.world.sz, y = c.waterY;
    const pos: number[] = [], uv: number[] = [], ind: number[] = [];
    const quad = (a: number[], b: number[], cc: number[], d: number[], uvs: number[]) => {
      const n = pos.length / 3;
      pos.push(...a, ...b, ...cc, ...d);
      uv.push(...uvs);
      ind.push(n, n + 1, n + 2, n, n + 2, n + 3);
    };
    for (let z = 0; z < D; z++) {
      let x = 0;
      while (x < W) {
        if (!w[z * W + x]) { x++; continue; }
        const x0 = x;
        while (x < W && w[z * W + x]) x++;
        quad([x0, y, z], [x0, y, z + 1], [x, y, z + 1], [x, y, z], [x0 / 4, z / 4, x0 / 4, (z + 1) / 4, x / 4, (z + 1) / 4, x / 4, z / 4]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(ind);
    geo.computeVertexNormals();
    this.waterTex = waterTexture();
    const mat = new THREE.MeshLambertMaterial({ map: this.waterTex, transparent: true, opacity: 0.82, emissive: 0x0d2a44, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.disposables.push(geo, mat, this.waterTex);
    // Vandfald: en rende oppe på klippen og et lodret fald ned i floden
    if (c.falls.length) {
      this.fallTex = fallTexture();
      const fm = new THREE.MeshLambertMaterial({ map: this.fallTex, transparent: true, opacity: 0.9, emissive: 0x335577, side: THREE.DoubleSide, depthWrite: false });
      this.disposables.push(fm, this.fallTex);
      for (const f of c.falls) {
        const g2 = new THREE.BufferGeometry();
        const p2: number[] = [], u2: number[] = [];
        const h = f.yTop - f.yBottom, wz = f.z1 - f.z0, len = f.x1 - f.x0;
        // rende
        p2.push(f.x0, f.yTop, f.z0, f.x0, f.yTop, f.z1, f.x1, f.yTop, f.z1, f.x0, f.yTop, f.z0, f.x1, f.yTop, f.z1, f.x1, f.yTop, f.z0);
        u2.push(0, 0, wz / 2, 0, wz / 2, len / 2, 0, 0, wz / 2, len / 2, 0, len / 2);
        // fald (lidt ude fra klippen)
        const X = f.x1 + 0.15;
        p2.push(X, f.yTop, f.z0, X, f.yBottom, f.z0, X, f.yBottom, f.z1, X, f.yTop, f.z0, X, f.yBottom, f.z1, X, f.yTop, f.z1);
        u2.push(0, 0, 0, h / 2, wz / 2, h / 2, 0, 0, wz / 2, h / 2, wz / 2, 0);
        g2.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
        g2.setAttribute('uv', new THREE.Float32BufferAttribute(u2, 2));
        g2.computeVertexNormals();
        const m2 = new THREE.Mesh(g2, fm);
        m2.renderOrder = 2;
        this.group.add(m2);
        this.disposables.push(g2);
      }
    }
  }

  /** Vindmøllernes vinger (følger kernens transform præcis som kæmperne) */
  private buildMills() {
    const h = this.hunt;
    if (!h.mills.length) return;
    const tex = sailTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const hubMat = new THREE.MeshLambertMaterial({ color: 0x5a3f24 });
    this.disposables.push(tex, mat, hubMat);
    for (const m of h.mills) {
      m.parts.forEach((part, k) => {
        const geo = new THREE.BoxGeometry(part.box.h.x * 2, part.box.h.y * 2, part.box.h.z * 2);
        const uv = geo.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * part.box.h.y);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = true;
        this.group.add(mesh);
        this.sails.push({ mesh, mill: m.id, part: k });
        this.disposables.push(geo);
      });
      const hub = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), hubMat);
      hub.position.set(m.def.hub.x, m.def.hub.y, m.def.hub.z);
      hub.rotation.y = m.def.yaw;
      this.group.add(hub);
      this.disposables.push(hub.geometry);
    }
  }

  /** Fyrtårnets lys: en glød og en langsomt drejende lysstråle */
  private buildBeacon() {
    const l = this.hunt.city.landmarks.find((x) => x.light);
    if (!l) return;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: muzzleFlashTexture(), color: 0xffe08a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.position.set(l.x, l.h + 0.5, l.z);
    glow.scale.setScalar(7);
    const bg = new THREE.CylinderGeometry(0.4, 4.5, 60, 10, 1, true);
    bg.rotateZ(-Math.PI / 2);
    bg.translate(30, 0, 0);
    const bm = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(bg, bm);
    beam.position.copy(glow.position);
    this.group.add(glow, beam);
    this.disposables.push(glow.material, bg, bm);
    this.beacon = { glow, beam, y: l.h };
  }

  setQuality(q: Quality) { this.quality = q; this.fx.quality = q; }

  // ---------- Effekter ----------

  /** Støvsky (pos = bunden af skyen) */
  dust(pos: V3, size: number, n: number, color = 0xcdbb98, spread = 1) {
    n = Math.max(1, Math.round(n * (this.quality === 0 ? 0.4 : this.quality === 1 ? 0.7 : 1)));
    for (let i = 0; i < n; i++) {
      const p = this.puffs[this.puffI++ % MAX_PUFFS];
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread * size * 0.6;
      p.s.position.set(pos.x + Math.cos(a) * r, pos.y + size * 0.3 + Math.random() * size * 0.3, pos.z + Math.sin(a) * r);
      p.size = size * (0.6 + Math.random() * 0.6);
      p.max = p.life = 1.2 + Math.random() * 1.2;
      p.grow = 1.6 + Math.random();
      p.vx = Math.cos(a) * size * 0.9; p.vz = Math.sin(a) * size * 0.9;
      p.vy = 0.4 + Math.random() * 0.8;
      p.alpha = 0.55 + Math.random() * 0.25;
      (p.s.material as THREE.SpriteMaterial).color.setHex(color).multiplyScalar(0.85 + Math.random() * 0.25);
      p.s.visible = true;
    }
  }

  /** Klumper og støv når en kæmpe falder om */
  crumble(id: number) {
    const v = this.giants.get(id);
    if (!v) return;
    const col = v.g.variant === 'runner' ? 0xc2ab84 : v.g.variant === 'thrower' ? 0x6d6a4e : v.g.variant === 'sea' ? 0x48666a : v.g.big ? 0x8a8379 : 0xa8714c;
    for (const c of v.partCenters()) {
      this.fx.burst(c, col, 10, 5, 0.35, 3);
      this.dust({ x: c.x, y: Math.max(1, c.y - 2), z: c.z }, 3.2 * v.g.scale, 3);
    }
  }

  giantHit(pos: V3, weak: boolean, big: boolean) {
    if (weak) {
      this.fx.burst(pos, 0xffc060, 14, 5, 0.12, 3);
      this.fx.burst(pos, 0xfff2c4, 6, 3, 0.08, 2);
    } else this.fx.burst(pos, big ? 0x8a8379 : 0xa8714c, 5, 2.5, 0.14, 1.5);
  }

  // ---------- Hvert billede ----------

  update(dt: number, cam: THREE.Camera, firstPerson: boolean, night = 0) {
    const h = this.hunt;
    this.time += dt;
    this.worldR.update();

    // Kæmper: tilføj nye, fjern væk
    for (const g of h.giants) {
      if (!this.giants.has(g.id)) {
        const v = new GiantView(g, this.rockMat);
        this.giants.set(g.id, v);
        this.group.add(v.root);
      }
    }
    for (const [id, v] of this.giants) {
      if (!h.giants.includes(v.g)) { this.group.remove(v.root); v.dispose(); this.giants.delete(id); continue; }
      v.update(dt, this.time, night);
    }
    // Synkende døde kæmper hvirvler støv op
    this.sinkDustT -= dt;
    if (this.sinkDustT <= 0) {
      this.sinkDustT = 0.25;
      for (const g of h.giants) if (g.state === 'dead' && g.sink < g.height * 0.6) {
        const t = g.part('torso').box.tf.t;
        this.dust({ x: t.x + (Math.random() - 0.5) * 6 * g.scale, y: g.pos.y, z: t.z + (Math.random() - 0.5) * 6 * g.scale }, 2.6 * g.scale, 1);
      }
    }

    // Sten
    for (const r of h.rocks) {
      let m = this.rocks.get(r.id);
      if (!m) {
        m = new THREE.Mesh(this.rockGeo, this.rockMat);
        m.castShadow = true;
        if (r.big) m.scale.setScalar(1.6);
        this.rocks.set(r.id, m);
        this.group.add(m);
      }
      m.position.set(r.pos.x, r.pos.y, r.pos.z);
      m.rotation.x += r.spin.x * dt; m.rotation.y += r.spin.y * dt; m.rotation.z += r.spin.z * dt;
    }
    for (const [id, m] of this.rocks) if (!h.rocks.some((r) => r.id === id)) { this.group.remove(m); this.rocks.delete(id); }

    // Depoter: lyssøjlen dæmpes mens depotet fyldes op igen
    for (const d of this.depots) {
      const st = h.depots.find((x) => x.id === d.id)!;
      const ready = st.cd <= 0;
      d.beamMat.opacity = ready ? 0.42 + 0.18 * Math.sin(this.time * 3 + d.id) : 0.08;
      d.beamMat.color.setHex(ready ? 0x6dde8a : 0x8a8a8a);
      d.icon.visible = ready;
      d.icon.position.y = 2.6 + Math.sin(this.time * 2.5 + d.id) * 0.15;
    }

    // Affyringsrøret følger kameraet
    this.launcher.visible = firstPerson && h.player.alive;
    if (this.launcher.visible) {
      this.launcher.position.set(-0.3, -0.27, -0.42).applyQuaternion(cam.quaternion).add(cam.position);
      this.launcher.quaternion.copy(cam.quaternion);
      const kick = h.hook.state === 'flying' ? 0.06 : 0;
      this.launcher.rotateX(0.08 + kick);
    }
    // Wire fra affyringsrøret (nederst til venstre i synsfeltet) til krogen
    const hk = h.hook;
    if (hk.state !== 'idle' && h.player.alive) {
      const from = new THREE.Vector3();
      if (firstPerson) {
        // Fra affyringsrøret, når krogen er foran; ellers fra hoften, så wiren ikke krydser tæt forbi kameraet
        const inv = cam.quaternion.clone().invert();
        const local = new THREE.Vector3(hk.tip.x, hk.tip.y, hk.tip.z).sub(cam.position).applyQuaternion(inv).normalize();
        const k = Math.min(1, Math.max(0, (0.8 - -local.z) / 0.45));
        from.set(-0.3 * (1 - k), -0.27 - 0.65 * k, -0.6 + 0.6 * k).applyQuaternion(cam.quaternion).add(cam.position);
      }
      else from.set(h.player.body.pos.x, h.player.body.pos.y + 1.1, h.player.body.pos.z);
      const to = new THREE.Vector3(hk.tip.x, hk.tip.y, hk.tip.z);
      const len = from.distanceTo(to);
      this.rope.visible = len > 0.05;
      this.rope.position.copy(from);
      this.rope.lookAt(to);
      this.rope.scale.set(1, 1, len);
      this.hookHead.visible = true;
      this.hookHead.position.copy(to);
      this.hookHead.lookAt(from);
    } else { this.rope.visible = false; this.hookHead.visible = false; }

    // Støvskyer
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.vx *= Math.exp(-dt * 2.2); p.vz *= Math.exp(-dt * 2.2);
      p.s.scale.setScalar(p.size * (1 + k * p.grow));
      // Tæt på kameraet blegner støvet, så det aldrig dækker skærmen
      const near = Math.min(1, Math.max(0, (p.s.position.distanceTo(cam.position) - p.s.scale.x * 0.5 - 1) / 4));
      (p.s.material as THREE.SpriteMaterial).opacity = p.alpha * Math.min(1, (1 - k) * 1.6) * Math.min(1, k * 8 + 0.2) * near;
    }
    // Vand, vinger, fyrtårn
    if (this.waterTex) { this.waterTex.offset.x = (this.time * 0.05) % 1; this.waterTex.offset.y = (Math.sin(this.time * 0.4) * 0.03); }
    if (this.fallTex) this.fallTex.offset.y = (-this.time * 1.6) % 1;
    for (const s of this.sails) {
      tfToMatrix(h.mills[s.mill].parts[s.part].box.tf, s.mesh.matrix);
      s.mesh.matrixWorldNeedsUpdate = true;
    }
    // Natlys
    const lit = Math.max(0, Math.min(1, (night - 0.15) / 0.5));
    if (this.torchMat) {
      this.torchMat.opacity = lit;
      for (const t of this.torches) {
        t.s.visible = lit > 0.01;
        if (t.s.visible) t.s.scale.setScalar(1.6 + 0.25 * Math.sin(this.time * 9 + t.ph) + 0.15 * Math.sin(this.time * 23 + t.ph * 2));
      }
    }
    if (this.windows) { this.windows.visible = lit > 0.01; (this.windows.material as THREE.PointsMaterial).opacity = lit * 0.9; }
    if (this.beacon) {
      (this.beacon.beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + night * 0.22;
      this.beacon.beam.rotation.y = this.time * 0.6;
      (this.beacon.glow.material as THREE.SpriteMaterial).opacity = 0.75 + 0.25 * Math.sin(this.time * 3);
    }
    // Skum og dis ved foden af vandfaldet
    this.mistT -= dt;
    if (this.mistT <= 0 && h.city.falls.length) {
      this.mistT = 0.18;
      const f = h.city.falls[0];
      if (cam.position.distanceTo(new THREE.Vector3(f.x1, f.yBottom, (f.z0 + f.z1) / 2)) < 140)
        this.dust({ x: f.x1 + 1 + Math.random() * 2, y: f.yBottom - 0.3, z: f.z0 + Math.random() * (f.z1 - f.z0) }, 1.6, 1, 0xe8f4fb, 0.5);
    }
    this.fx.update(dt);
  }

  dispose() {
    for (const v of this.giants.values()) v.dispose();
    this.giants.clear();
    this.worldR.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    for (const d of this.disposables) d.dispose();
    for (const p of this.puffs) p.s.material.dispose();
    this.group.clear();
  }
}
