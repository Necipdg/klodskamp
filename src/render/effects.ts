// Effekter i verden: blokpartikler, sporlys, skudhuller, eksplosion, bombe, forhåndsvisning af blokke.
import * as THREE from 'three';
import { BLOCKS } from '../core/blocks';
import type { VoxelWorld } from '../core/world';
import type { V3 } from '../core/math';
import { buildGun } from './guns';

const MAX_P = 700;

interface Particle { c: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; spin: number; rx: number; ry: number }

export class Effects {
  readonly group = new THREE.Group();
  private parts: Particle[] = [];
  private inst: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private tracers: { line: THREE.Mesh; t: number }[] = [];
  private holes: { m: THREE.Mesh; x: number; y: number; z: number }[] = [];
  private holeI = 0;
  private flashLight: THREE.PointLight;
  private flashT = 0;
  private boom: THREE.Mesh;
  private boomT = 0;
  readonly preview: THREE.Group;
  private previewFill: THREE.Mesh;
  private previewEdges: THREE.LineSegments;
  readonly bomb: THREE.Group;
  private bombLed: THREE.Mesh;
  private ledMat: THREE.MeshBasicMaterial;
  quality = 2;

  constructor(private world: VoxelWorld) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.inst = new THREE.InstancedMesh(geo, mat, MAX_P);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.count = 0;
    this.inst.frustumCulled = false;
    this.inst.castShadow = false;
    this.group.add(this.inst);
    // sporlys
    const tmat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 1), tmat.clone());
      m.visible = false;
      this.group.add(m);
      this.tracers.push({ line: m, t: 0 });
    }
    // skudhuller
    const hmat = new THREE.MeshBasicMaterial({ color: 0x1d1a16, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075), hmat);
      m.visible = false;
      this.group.add(m);
      this.holes.push({ m, x: 0, y: -1, z: 0 });
    }
    this.flashLight = new THREE.PointLight(0xffc06a, 0, 7, 1.6);
    this.group.add(this.flashLight);
    this.boom = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.8, depthWrite: false }));
    this.boom.visible = false;
    this.group.add(this.boom);
    // forhåndsvisning af blokplacering
    this.preview = new THREE.Group();
    this.previewFill = new THREE.Mesh(new THREE.BoxGeometry(1.002, 1.002, 1.002), new THREE.MeshBasicMaterial({ color: 0x6dff8f, transparent: true, opacity: 0.22, depthWrite: false }));
    this.previewEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)), new THREE.LineBasicMaterial({ color: 0x9dffb2 }));
    this.preview.add(this.previewFill, this.previewEdges);
    this.preview.visible = false;
    this.group.add(this.preview);
    // bomben i verden (tabt eller plantet)
    this.bomb = buildGun('bomb').group;
    this.bomb.scale.setScalar(1.6);
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    this.bombLed = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), this.ledMat);
    this.bombLed.position.set(-0.03, 0.05, -0.02);
    this.bomb.add(this.bombLed);
    this.bomb.visible = false;
    this.group.add(this.bomb);
  }

  // ---------- Partikler ----------
  burst(pos: V3, color: number, n: number, speed = 3, size = 0.09, up = 2) {
    n = Math.round(n * (this.quality === 0 ? 0.4 : this.quality === 1 ? 0.7 : 1));
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_P) this.parts.shift();
      const a = Math.random() * Math.PI * 2, r = Math.random() * speed;
      const life = 0.45 + Math.random() * 0.5;
      this.parts.push({
        c: shadeColor(color, 0.75 + Math.random() * 0.45),
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * r, vy: up + Math.random() * speed, vz: Math.sin(a) * r,
        life, max: life, size: size * (0.6 + Math.random() * 0.8), spin: (Math.random() - 0.5) * 12, rx: Math.random() * 3, ry: Math.random() * 3,
      });
    }
  }

  blockHit(pos: V3, normal: V3, block: number) {
    const def = BLOCKS[block];
    const p = { x: pos.x + normal.x * 0.02, y: pos.y + normal.y * 0.02, z: pos.z + normal.z * 0.02 };
    this.burst(p, def.color, 5, 1.6, 0.06, 1.2);
    this.addHole(pos, normal);
  }
  blockBreak(x: number, y: number, z: number, block: number) {
    const def = BLOCKS[block];
    for (let i = 0; i < 3; i++) this.burst({ x: x + 0.2 + Math.random() * 0.6, y: y + 0.2 + Math.random() * 0.6, z: z + 0.2 + Math.random() * 0.6 }, def.color, 9, 2.6, 0.13, 1.5);
    // fjern skudhuller på den blok
    for (const h of this.holes) if (h.x === x && h.y === y && h.z === z) { h.m.visible = false; h.y = -1; }
  }
  playerHit(pos: V3, teamColor: number, head: boolean) {
    this.burst(pos, 0x8a1f1f, head ? 10 : 6, 1.8, 0.06, 1);
    this.burst(pos, teamColor, 3, 1.2, 0.05, 1);
  }

  private addHole(pos: V3, n: V3) {
    const h = this.holes[this.holeI++ % this.holes.length];
    h.m.visible = true;
    h.m.position.set(pos.x + n.x * 0.004, pos.y + n.y * 0.004, pos.z + n.z * 0.004);
    h.m.lookAt(pos.x + n.x, pos.y + n.y, pos.z + n.z);
    h.m.rotation.z = Math.random() * 3;
    h.x = Math.floor(pos.x - n.x * 0.01); h.y = Math.floor(pos.y - n.y * 0.01); h.z = Math.floor(pos.z - n.z * 0.01);
  }
  clearHoles() { for (const h of this.holes) { h.m.visible = false; h.y = -1; } }

  tracer(from: V3, to: V3, offset: THREE.Vector3 | null) {
    const t = this.tracers.find((x) => x.t <= 0) ?? this.tracers[0];
    const a = new THREE.Vector3(from.x, from.y, from.z);
    if (offset) a.add(offset);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const len = a.distanceTo(b);
    if (len < 1.5) return;
    // Kort lysstreg der bevæger sig mod målet
    t.line.position.copy(a.clone().lerp(b, 0.5));
    t.line.lookAt(b);
    t.line.scale.set(1, 1, len);
    t.t = 0.06;
    t.line.visible = true;
  }

  muzzleLight(pos: V3) {
    this.flashLight.position.set(pos.x, pos.y, pos.z);
    this.flashLight.intensity = 3;
    this.flashT = 0.05;
  }

  explosion(pos: V3) {
    this.boom.visible = true;
    this.boom.position.set(pos.x, pos.y + 0.5, pos.z);
    this.boomT = 0.9;
    this.burst({ x: pos.x, y: pos.y + 0.6, z: pos.z }, 0xffa53a, 60, 9, 0.22, 5);
    this.burst({ x: pos.x, y: pos.y + 0.6, z: pos.z }, 0x555555, 70, 6, 0.35, 3);
    this.flashLight.position.set(pos.x, pos.y + 2, pos.z);
    this.flashLight.intensity = 40;
    this.flashLight.distance = 30;
    this.flashT = 0.5;
  }

  setPreview(t: { x: number; y: number; z: number; valid: boolean } | null) {
    if (!t) { this.preview.visible = false; return; }
    this.preview.visible = true;
    this.preview.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
    const c = t.valid ? 0x6dff8f : 0xff5a4a;
    (this.previewFill.material as THREE.MeshBasicMaterial).color.setHex(c);
    (this.previewEdges.material as THREE.LineBasicMaterial).color.setHex(t.valid ? 0xb8ffc8 : 0xff8a7a);
  }

  setBomb(visible: boolean, pos: V3, planted: boolean, blink: boolean) {
    this.bomb.visible = visible;
    if (!visible) return;
    this.bomb.position.set(pos.x, pos.y + 0.06, pos.z);
    this.bomb.rotation.y = planted ? 0.4 : 1.2;
    this.ledMat.color.setHex(blink ? 0xff3030 : 0x3a0a0a);
  }

  update(dt: number) {
    // partikler
    const w = this.world;
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy -= 18 * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (w.solidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        if (w.solidAt(Math.floor(p.x), Math.floor(ny), Math.floor(p.z))) { p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
        else { p.vx *= -0.3; p.vz *= -0.3; }
      } else { p.x = nx; p.y = ny; p.z = nz; }
      p.rx += p.spin * dt;
      const s = p.size * Math.min(1, p.life / p.max * 2.5);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.rx, p.ry, 0);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.inst.setMatrixAt(n, this.dummy.matrix);
      this.color.setHex(p.c);
      this.inst.setColorAt(n, this.color);
      n++;
    }
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;
    // sporlys
    for (const t of this.tracers) {
      if (t.t <= 0) continue;
      t.t -= dt;
      (t.line.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t.t / 0.06) * 0.8;
      if (t.t <= 0) t.line.visible = false;
    }
    // skudhuller forsvinder hvis blokken er væk
    for (const h of this.holes) if (h.y >= 0 && !w.solidAt(h.x, h.y, h.z)) { h.m.visible = false; h.y = -1; }
    // lys
    this.flashT -= dt;
    if (this.flashT <= 0) { this.flashLight.intensity = 0; this.flashLight.distance = 7; }
    else if (this.flashLight.intensity > 5) this.flashLight.intensity *= Math.exp(-dt * 6);
    if (this.boomT > 0) {
      this.boomT -= dt;
      const k = 1 - this.boomT / 0.9;
      this.boom.scale.setScalar(1 + k * 9);
      (this.boom.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - k));
      if (this.boomT <= 0) this.boom.visible = false;
    }
  }
}

function shadeColor(hex: number, f: number) {
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f);
  return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
}

/** Bombeområdets mærkning malet på gulvet */
export function siteDecal(x0: number, z0: number, x1: number, z1: number): THREE.Mesh {
  const w = x1 - x0 + 1, d = z1 - z0 + 1;
  const c = document.createElement('canvas');
  c.width = w * 16; c.height = d * 16;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  // Stiplet kant og et stort, slidt bogstav
  g.fillStyle = 'rgba(255,236,190,0.85)';
  for (let x = 0; x < c.width; x += 8) { g.fillRect(x, 0, 5, 3); g.fillRect(x, c.height - 3, 5, 3); }
  for (let y = 0; y < c.height; y += 8) { g.fillRect(0, y, 3, 5); g.fillRect(c.width - 3, y, 3, 5); }
  const cx = c.width / 2, cy = c.height / 2;
  const A = [
    '..XXXX..', '.XX..XX.', 'XX....XX', 'XX....XX', 'XXXXXXXX', 'XX....XX', 'XX....XX', 'XX....XX',
  ];
  const s = 7;
  g.fillStyle = 'rgba(255,236,190,0.8)';
  A.forEach((row, ry) => [...row].forEach((ch, rx) => {
    if (ch === 'X' && Math.random() > 0.08) g.fillRect(cx - 28 + rx * s, cy - 28 + ry * s, s, s);
  }));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x0 + w / 2, 1.005, z0 + d / 2);
  m.receiveShadow = true;
  return m;
}
