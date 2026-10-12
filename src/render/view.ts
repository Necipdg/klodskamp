// Samler hele 3D-billedet: verden, kulisse, himmel, figurer, effekter og førstepersonsvåbnet.
import * as THREE from 'three';
import type { Game } from '../core/game';
import { eyePos, type Player } from '../core/player';
import { DEG, dirFromYawPitch } from '../core/math';
import { raycastVoxels } from '../core/ray';
import { makeAtlasTexture } from './textures';
import { WorldRenderer } from './worldMesh';
import { buildBackdrop, buildMountainBackdrop } from './backdrop';
import { Clouds, SKY, makeSky } from './sky';
import { Character } from './characters';
import { ViewModel } from './viewmodel';
import { Effects, siteDecal } from './effects';
import type { Quality } from '../game/settings';
import type { Hunt } from '../hunt/hunt';
import { HuntScene } from './huntView';
import { Giant } from '../hunt/giant';
import { GiantView, rockMaterial } from './giantView';
import { makeHuntPlayer } from '../hunt/hunt';
import type { Mate } from '../net/sync';

export type CamMode = { mode: 'first' } | { mode: 'orbit' } | { mode: 'spectate'; pid: number };

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(78, 1, 0.05, 600);
  private atlasMat: THREE.MeshLambertMaterial;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private clouds: Clouds;
  private worldR: WorldRenderer | null = null;
  private dynamic = new THREE.Group();
  private chars = new Map<number, Character>();
  /** Co-op: medspillernes figurer og wirer */
  private mates = new Map<number, { c: Character; p: Player; rope: THREE.Line }>();
  vm: ViewModel | null = null;
  fx: Effects | null = null;
  private game: Game | null = null;
  private orbitT = 0;
  shake = 0;
  quality: Quality = 2;
  private backdrops = new Map<string, THREE.Group>();
  private hunt: Hunt | null = null;
  huntScene: HuntScene | null = null;
  private baseFov = 78;
  /** Ekstra synsfelt ved høj fart (Kæmpejagt) */
  private fovBoost = 0;
  private roll = 0;
  private sky: THREE.Mesh;
  private sunDir = SKY.sunDir.clone();
  private dayT = -1;
  /** 0 = dag, 1 = nat (til fakler, øjne, vinduer) */
  night = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.atlasMat = new THREE.MeshLambertMaterial({ map: makeAtlasTexture(aniso), vertexColors: true });

    this.scene.fog = new THREE.Fog(SKY.fog, 38, 175);
    this.scene.background = SKY.horizon.clone();
    this.sky = makeSky();
    this.scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight(0xd2e4ff, 0xa8916a, 0.95);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffeccc, 2.9);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 160;
    this.scene.add(this.sun, this.sun.target);
    this.clouds = new Clouds();
    this.scene.add(this.clouds.mesh);
    this.scene.add(this.dynamic);
    this.camera.rotation.order = 'YXZ';
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 0 ? Math.min(dpr, 1) * 0.8 : q === 1 ? Math.min(dpr, 1.25) : Math.min(dpr, 2));
    this.renderer.shadowMap.enabled = q > 0;
    this.sun.castShadow = q > 0;
    const size = q === 2 ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as never;
    }
    this.clouds.mesh.visible = q > 0;
    if (this.fx) this.fx.quality = q;
    this.huntScene?.setQuality(q);
    this.applyRange();
    // materialer skal kompileres om, når skygger slås til/fra
    this.atlasMat.needsUpdate = true;
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm?.setAspect(w / h);
  }

  setFov(f: number) { this.baseFov = f; this.camera.fov = f + this.fovBoost; this.camera.updateProjectionMatrix(); }

  /** Vis kun kulissen der passer til banens størrelse (bygges første gang den bruges) */
  private useBackdrop(sx: number, sz: number, kind: 'city' | 'mountains' | 'fjord' = 'city', fjord?: { x0: number; x1: number; waterY: number }) {
    const key = `${kind}${sx}x${sz}`;
    let b = this.backdrops.get(key);
    if (!b) {
      b = kind === 'mountains' ? buildMountainBackdrop(sx, sz, this.atlasMat)
        : kind === 'fjord' ? buildMountainBackdrop(sx, sz, this.atlasMat, fjord)
        : buildBackdrop(sx, sz, this.atlasMat);
      this.backdrops.set(key, b); this.scene.add(b);
    }
    for (const [k, g] of this.backdrops) g.visible = k === key;
  }

  private setShadowBox(half: number, far: number) {
    const sc = this.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = far;
    sc.updateProjectionMatrix();
  }

  /** Byg scenen for en ny kamp */
  attach(game: Game) {
    this.detach();
    this.game = game;
    const w = game.world;
    this.worldR = new WorldRenderer(w, this.atlasMat);
    this.dynamic.add(this.worldR.group);
    this.useBackdrop(w.sx, w.sz);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = 38; fog.far = 175;
    this.camera.far = 600; this.camera.updateProjectionMatrix();
    this.setShadowBox(40, 160);
    this.fovBoost = 0; this.roll = 0;
    this.setFov(this.baseFov);
    this.applyDay(0);
    const s = game.map.site;
    this.dynamic.add(siteDecal(s.x0, s.z0, s.x1, s.z1));
    this.fx = new Effects(w);
    this.fx.quality = this.quality;
    this.dynamic.add(this.fx.group);
    for (const p of game.players) {
      const c = new Character(p, p.team === game.humanTeam && p.id !== game.humanId);
      this.chars.set(p.id, c);
      this.dynamic.add(c.root);
    }
    this.vm = new ViewModel(game.human);
    const cx = w.sx / 2, cz = w.sz / 2;
    this.sun.position.set(cx + SKY.sunDir.x * 80, SKY.sunDir.y * 80, cz + SKY.sunDir.z * 80);
    this.sun.target.position.set(cx, 0, cz);
    this.resize();
  }

  /** Synsvidde: på grafik Lav (telefoner) tegnes kortere ud, så langt mindre skal tegnes */
  private applyRange() {
    const fog = this.scene.fog as THREE.Fog;
    if (!this.hunt) { this.camera.far = 600; this.camera.updateProjectionMatrix(); return; }
    const [near, far] = this.hunt.city.fog;
    const f = this.quality === 0 ? Math.min(far, 190) : far;
    fog.near = Math.min(near, f * 0.45); fog.far = f;
    this.camera.far = this.quality === 0 ? f + 30 : 600;
    this.camera.updateProjectionMatrix();
  }

  /** Lys og himmel efter tidspunktet på dagen (0 formiddag … 4 nat) */
  applyDay(t: number) {
    if (Math.abs(t - this.dayT) < 0.002) return;
    this.dayT = t;
    const i = Math.min(DAY.length - 2, Math.floor(t)), f = t - i;
    const a = DAY[i], b = DAY[i + 1];
    const col = (x: number, y: number) => new THREE.Color(x).lerp(new THREE.Color(y), f);
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    u.zenith.value.copy(col(a.zenith, b.zenith));
    u.horizon.value.copy(col(a.horizon, b.horizon));
    this.sunDir.set(a.sun[0] + (b.sun[0] - a.sun[0]) * f, a.sun[1] + (b.sun[1] - a.sun[1]) * f, a.sun[2] + (b.sun[2] - a.sun[2]) * f).normalize();
    u.sunDir.value.copy(this.sunDir);
    u.sunCol.value.copy(col(a.disk, b.disk));
    this.night = a.night + (b.night - a.night) * f;
    u.night.value = this.night;
    (this.scene.background as THREE.Color).copy(col(a.horizon, b.horizon));
    (this.scene.fog as THREE.Fog).color.copy(col(a.fog, b.fog));
    this.sun.color.copy(col(a.sunCol, b.sunCol));
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * f;
    this.hemi.color.copy(col(a.hemiSky, b.hemiSky));
    this.hemi.groundColor.copy(col(a.hemiG, b.hemiG));
    this.hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * f;
    const cm = this.clouds.mesh.material as THREE.MeshLambertMaterial;
    cm.color.copy(col(a.cloud, b.cloud));
    cm.emissive.copy(col(a.cloud, b.cloud)).multiplyScalar(0.55);
  }

  /** Byg scenen for Kæmpejagt */
  attachHunt(h: Hunt) {
    this.detach();
    this.hunt = h;
    this.dayT = -1;
    this.applyDay(h.dayTime());
    this.huntScene = new HuntScene(h, this.atlasMat);
    this.huntScene.setQuality(this.quality);
    this.dynamic.add(this.huntScene.group);
    this.fx = this.huntScene.fx;
    this.vm = new ViewModel(h.player);
    // Fjord: vandet ved banens nordkant fortsætter ud gennem kulissen
    let fj: { x0: number; x1: number; waterY: number } | undefined;
    if (h.city.backdrop === 'fjord' && h.city.water) {
      const xs = [...Array(h.world.sx).keys()].filter((x) => h.city.water![x]);
      if (xs.length) fj = { x0: xs[0], x1: xs[xs.length - 1] + 1, waterY: h.city.waterY };
    }
    this.useBackdrop(h.world.sx, h.world.sz, h.city.backdrop, fj);
    this.applyRange();
    this.setShadowBox(50, 260);
    this.resize();
    // Forvarm kæmpernes shadere, så den første kæmpe ikke giver et hak i billedet
    const sp = h.city.spawn.pos;
    const dummies = (['clay', 'runner', 'thrower'] as const).map((v) => new GiantView(new Giant({ x: sp.x, y: sp.y, z: sp.z - 30 }, 0, 1, 1, false, v), rockMaterial()));
    for (const d of dummies) { this.scene.add(d.root); d.update(0, 0); }
    this.renderer.compile(this.scene, this.camera);
    for (const d of dummies) { this.scene.remove(d.root); d.dispose(); }
  }

  detach() {
    this.huntScene?.dispose();
    this.huntScene = null;
    this.hunt = null;
    this.dynamic.clear();
    this.chars.clear();
    this.mates.clear();
    this.worldR = null;
    this.fx = null;
    this.vm = null;
    this.game = null;
  }

  character(pid: number) { return this.chars.get(pid); }

  /** Co-op: sæt medspillernes figurer (kaldes hvert billede før render) */
  setMates(list: Mate[]) {
    for (const m of list) {
      let e = this.mates.get(m.pid);
      if (!e) {
        const p = makeHuntPlayer(m.pos, m.yaw);
        p.id = m.pid;
        p.name = m.name;
        p.team = m.pid % 2 ? 'D' : 'A';
        const c = new Character(p, true);
        const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
        const rope = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2b2722 }));
        rope.frustumCulled = false;
        this.dynamic.add(c.root, rope);
        e = { c, p, rope };
        this.mates.set(m.pid, e);
      }
      const p = e.p;
      p.body.pos = { ...m.pos }; p.prevPos = { ...m.pos }; p.body.vel = { ...m.vel }; p.body.onGround = m.onGround;
      p.yaw = m.yaw; p.pitch = m.pitch; p.alive = m.alive; p.slot = m.slot; p.hp = m.hp;
      const r = e.rope;
      r.visible = !!m.hook && m.alive;
      if (m.hook) {
        const a = r.geometry.getAttribute('position') as THREE.BufferAttribute;
        a.setXYZ(0, m.pos.x, m.pos.y + 1.05, m.pos.z);
        a.setXYZ(1, m.hook.x, m.hook.y, m.hook.z);
        a.needsUpdate = true;
      }
    }
    for (const [pid, e] of this.mates) {
      if (list.some((m) => m.pid === pid)) continue;
      this.dynamic.remove(e.c.root, e.rope);
      this.mates.delete(pid);
    }
  }
  mateShot(pid: number) { this.mates.get(pid)?.c.onShot(); }

  render(dt: number, alpha: number, cam: CamMode, mouseDX = 0, mouseDY = 0) {
    if (this.hunt) { this.renderHunt(dt, alpha, cam, mouseDX, mouseDY); return; }
    const g = this.game;
    if (!g) return;
    this.worldR?.update();
    for (const c of this.chars.values()) {
      const d = this.camera.position.distanceTo(c.root.position);
      c.markerOk = d > 3.5 && !(cam.mode === 'spectate' && cam.pid === c.p.id);
      c.update(dt, alpha);
    }
    this.fx?.update(dt);
    const human = g.human;

    // --- Kamera ---
    let showVm = false;
    if (cam.mode === 'first' && human.alive) {
      const p = human;
      const pos = lerpPos(p, alpha);
      this.camera.position.set(pos.x, pos.y + p.eyeH, pos.z);
      this.camera.rotation.set(p.pitch + p.recoilP * DEG * 0.4, p.yaw + p.recoilY * DEG * 0.3, 0);
      this.chars.get(p.id)!.root.visible = false;
      showVm = true;
    } else {
      this.chars.get(human.id)!.root.visible = true;
      if (cam.mode === 'spectate') this.spectateCam(g.players[cam.pid] ?? human, alpha);
      else this.orbitCam(dt);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.06;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.clouds.mesh.position.y = 52;
    this.clouds.update(dt, g.world.sx / 2, g.world.sz / 2);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (showVm && this.vm) {
      this.vm.update(human, dt, mouseDX, mouseDY);
      this.renderer.clearDepth();
      this.renderer.render(this.vm.scene, this.vm.camera);
    }
  }

  private renderHunt(dt: number, alpha: number, cam: CamMode, mouseDX: number, mouseDY: number) {
    const h = this.hunt!, hs = this.huntScene!;
    const p = h.player;
    const pos = lerpPos(p, alpha);
    const first = cam.mode === 'first' && p.alive;
    // Fart giver større synsfelt og en let krængning i sving
    const v = p.body.vel;
    const sp = Math.hypot(v.x, v.y, v.z);
    const wantBoost = first ? Math.max(0, Math.min(1, (sp - 10) / 30)) * 14 : 0;
    this.fovBoost += (wantBoost - this.fovBoost) * Math.min(1, dt * 4);
    if (Math.abs(this.camera.fov - (this.baseFov + this.fovBoost)) > 0.05) { this.camera.fov = this.baseFov + this.fovBoost; this.camera.updateProjectionMatrix(); }
    const side = v.x * Math.cos(p.yaw) - v.z * Math.sin(p.yaw);
    const wantRoll = first && !p.body.onGround ? Math.max(-0.07, Math.min(0.07, -side / 40 * 0.07)) : 0;
    this.roll += (wantRoll - this.roll) * Math.min(1, dt * 5);
    if (first) {
      this.camera.position.set(pos.x, pos.y + p.eyeH, pos.z);
      this.camera.rotation.set(p.pitch + p.recoilP * DEG * 0.4, p.yaw + p.recoilY * DEG * 0.3, this.roll);
    } else {
      // Langsom kreds rundt om spilleren (efter død eller sejr), så man ser kæmperne
      this.orbitT += dt * 0.12;
      const r = 16, a = this.orbitT;
      const c = { x: pos.x, y: pos.y + 1, z: pos.z };
      let cx = c.x + Math.sin(a) * r, cz = c.z + Math.cos(a) * r, cy = c.y + 9;
      const d = { x: cx - c.x, y: cy - c.y, z: cz - c.z };
      const dl = Math.hypot(d.x, d.y, d.z);
      const hit = raycastVoxels(h.world, c, { x: d.x / dl, y: d.y / dl, z: d.z / dl }, dl);
      if (hit) { const k = Math.max(1.5, hit.dist - 0.5) / dl; cx = c.x + d.x * k; cy = c.y + d.y * k; cz = c.z + d.z * k; }
      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(c.x, c.y, c.z);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.08;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.camera.updateMatrixWorld();
    for (const e of this.mates.values()) {
      e.c.markerOk = this.camera.position.distanceTo(e.c.root.position) > 2.5;
      e.c.update(dt, 1);
    }
    this.applyDay(h.dayTime());
    hs.update(dt, this.camera, first, this.night);
    // Solens skyggeboks følger spilleren (afrundet, så skyggerne ikke flimrer)
    const sx = Math.round(pos.x / 4) * 4, sz = Math.round(pos.z / 4) * 4;
    this.sun.position.set(sx + this.sunDir.x * 120, this.sunDir.y * 120, sz + this.sunDir.z * 120);
    this.sun.target.position.set(sx, 0, sz);
    this.clouds.mesh.position.y = 95;
    this.clouds.update(dt, h.world.sx / 2, h.world.sz / 2);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (first && this.vm) {
      this.vm.update(p, dt, mouseDX, mouseDY);
      this.renderer.clearDepth();
      this.renderer.render(this.vm.scene, this.vm.camera);
    }
  }

  private spectateCam(p: Player, alpha: number) {
    const g = this.game!;
    const pos = lerpPos(p, alpha);
    const eye = { x: pos.x, y: pos.y + p.eyeH + 0.3, z: pos.z };
    const back = dirFromYawPitch(p.yaw, p.pitch * 0.5 - 0.25);
    const d = { x: -back.x, y: -back.y, z: -back.z };
    const hit = raycastVoxels(g.world, eye, d, 3.2);
    const dist = hit ? Math.max(0.4, hit.dist - 0.25) : 3.2;
    this.camera.position.set(eye.x + d.x * dist, eye.y + d.y * dist, eye.z + d.z * dist);
    this.camera.lookAt(eye.x + back.x * 4, eye.y + back.y * 4, eye.z + back.z * 4);
    this.chars.get(p.id)!.root.visible = true;
  }

  /** Langsom kameratur gennem byen bag startskærmen */
  private orbitCam(dt: number) {
    this.orbitT += dt * 0.05;
    const P = MENU_PATH, n = P.length;
    const t = this.orbitT % n, i = Math.floor(t), f = t - i;
    const a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n];
    const cr = (k: number) => catmull(a[k], b[k], c[k], d[k], f);
    this.camera.position.set(cr(0), cr(1), cr(2));
    this.camera.lookAt(cr(3), cr(4), cr(5));
  }

  /** Kameraets øjenposition og retning (til lyd og effekter) */
  eye(p: Player) { return eyePos(p); }
}

// Kamerapunkter (x, y, z, kig-x, kig-y, kig-z) for startskærmen
const MENU_PATH: number[][] = [
  [26.5, 3.2, 40, 26.5, 2.4, 28], // op gennem Midten
  [26, 3.0, 30, 20, 2.4, 22], // ind i Tunnelhallen
  [19.5, 3.1, 22.5, 10, 2, 12], // ud på bombeområdet
  [8, 5.5, 20, 12, 2, 8], // hen over gården
  [5.5, 3.6, 24, 5.5, 2.4, 40], // ned ad Lang
  [5.5, 3.4, 42, 18, 2.2, 47], // rundt om hjørnet
  [22, 4.2, 46, 28, 2.4, 36], // angribernes base
];
const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

function lerpPos(p: Player, a: number) {
  const b = p.body.pos, q = p.prevPos;
  return { x: q.x + (b.x - q.x) * a, y: q.y + (b.y - q.y) * a, z: q.z + (b.z - q.z) * a };
}

/** Dagens gang i Ravnsdalen: formiddag, middag, eftermiddag, solnedgang, nat */
interface DayPreset { zenith: number; horizon: number; fog: number; sun: [number, number, number]; sunCol: number; sunI: number; hemiSky: number; hemiG: number; hemiI: number; cloud: number; disk: number; night: number }
const DAY: DayPreset[] = [
  { zenith: 0x4f95e0, horizon: 0xcfe2ea, fog: 0xd2e0e2, sun: [-0.55, 0.78, 0.32], sunCol: 0xffeccc, sunI: 2.9, hemiSky: 0xd2e4ff, hemiG: 0xa8916a, hemiI: 0.95, cloud: 0xffffff, disk: 0xfff7d9, night: 0 },
  { zenith: 0x3f88db, horizon: 0xd8e8ee, fog: 0xd6e3e6, sun: [-0.2, 0.95, 0.22], sunCol: 0xfff2dc, sunI: 3.0, hemiSky: 0xd8e8ff, hemiG: 0xa8916a, hemiI: 1.0, cloud: 0xffffff, disk: 0xfff9e6, night: 0 },
  { zenith: 0x4a7fc8, horizon: 0xf0d4a8, fog: 0xe6d0aa, sun: [0.72, 0.44, 0.3], sunCol: 0xffc98a, sunI: 2.6, hemiSky: 0xe2d4c4, hemiG: 0x9a7a5a, hemiI: 0.85, cloud: 0xffe8cc, disk: 0xffe2a8, night: 0 },
  { zenith: 0x2f3f7a, horizon: 0xf08a5a, fog: 0xc28470, sun: [0.93, 0.13, 0.25], sunCol: 0xff8c4c, sunI: 1.8, hemiSky: 0x9a86a8, hemiG: 0x5a4636, hemiI: 0.62, cloud: 0xf2a482, disk: 0xffb070, night: 0.35 },
  { zenith: 0x0a1230, horizon: 0x26335e, fog: 0x1c2644, sun: [-0.4, 0.75, -0.42], sunCol: 0xa8c0f4, sunI: 1.05, hemiSky: 0x5464a0, hemiG: 0x262632, hemiI: 0.78, cloud: 0x4a5470, disk: 0xe2ecff, night: 1 },
];
