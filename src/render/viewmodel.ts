// Førstepersonsvåbnet: eget lille 3D-rum, der tegnes oven på verden (skærer derfor aldrig ind i vægge).
// Arme i holdfarver, gang-bevægelse, sigte-forsinkelse, rekyl, genladning, skift, knivstik og hylstre.
import * as THREE from 'three';
import type { Player } from '../core/player';
import { WEAPONS } from '../config/weapons';
import { boxSkinUV, skinTexture, SKIN_PARTS } from './skins';
import { buildGun, pbox, type GunModel } from './guns';
import { muzzleFlashTexture } from './characters';
import { SKY } from './sky';

type VmId = 'rifle' | 'smg' | 'pistol' | 'knife' | 'blocks' | 'bomb';

interface Hold { pos: THREE.Vector3; rot: THREE.Euler; grip: THREE.Vector3; support: THREE.Vector3 | null }
const HOLD: Record<VmId, Hold> = {
  rifle: { pos: new THREE.Vector3(0.215, -0.215, -0.54), rot: new THREE.Euler(0.03, 0.1, 0), grip: new THREE.Vector3(0, -0.11, 0.08), support: new THREE.Vector3(0, -0.035, -0.3) },
  smg: { pos: new THREE.Vector3(0.2, -0.205, -0.5), rot: new THREE.Euler(0.03, 0.1, 0), grip: new THREE.Vector3(0, -0.1, 0.06), support: new THREE.Vector3(0, -0.05, -0.22) },
  pistol: { pos: new THREE.Vector3(0.17, -0.18, -0.5), rot: new THREE.Euler(0.04, 0.12, 0), grip: new THREE.Vector3(0, -0.075, 0.035), support: new THREE.Vector3(-0.035, -0.09, 0.045) },
  knife: { pos: new THREE.Vector3(0.2, -0.21, -0.42), rot: new THREE.Euler(0.25, 0.35, -0.3), grip: new THREE.Vector3(0, 0, 0.03), support: null },
  blocks: { pos: new THREE.Vector3(0.2, -0.22, -0.46), rot: new THREE.Euler(0.15, 0.3, 0), grip: new THREE.Vector3(0.1, 0.02, -0.06), support: null },
  bomb: { pos: new THREE.Vector3(0.06, -0.23, -0.45), rot: new THREE.Euler(0.4, 0, 0), grip: new THREE.Vector3(0.09, -0.02, -0.02), support: new THREE.Vector3(-0.09, -0.02, -0.06) },
};

const ARM_PX = 0.026;

export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(56, 1, 0.01, 10);
  private root = new THREE.Group();
  private sway = new THREE.Group();
  private guns = new Map<VmId, GunModel>();
  private armR: THREE.Group;
  private armL: THREE.Group;
  private cur: VmId | '' = '';
  private flash: THREE.Sprite;
  private flashLight: THREE.PointLight;
  private flashT = 0;
  private kick = 0;
  private kickRot = 0;
  private bob = 0;
  private swayX = 0;
  private swayY = 0;
  private knifeT = 0;
  private placeT = 0;
  private landT = 0;
  private shells: { m: THREE.Mesh; v: THREE.Vector3; t: number }[] = [];

  constructor(p: Player) {
    this.scene.add(this.camera);
    this.camera.add(this.root);
    this.root.add(this.sway);
    const hemi = new THREE.HemisphereLight(0xdfeeff, 0x8a7656, 1.5);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.0);
    sun.position.copy(SKY.sunDir);
    this.scene.add(sun);
    this.flashLight = new THREE.PointLight(0xffc469, 0, 2.5, 1.5);
    this.flashLight.position.set(0.15, -0.05, -0.8);
    this.camera.add(this.flashLight);

    const mat = new THREE.MeshLambertMaterial({ map: skinTexture(p.team) });
    const mkArm = () => {
      const [u, v, w, h, d] = SKIN_PARTS.arm;
      const geo = new THREE.BoxGeometry(w * ARM_PX, h * ARM_PX * 1.6, d * ARM_PX);
      boxSkinUV(geo, u, v, w, h, d);
      geo.translate(0, (h * ARM_PX * 1.6) / 2 - 0.03, 0);
      const m = new THREE.Mesh(geo, mat);
      const gr = new THREE.Group();
      gr.add(m);
      return gr;
    };
    this.armR = mkArm();
    this.armL = mkArm();
    this.sway.add(this.armR, this.armL);

    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: muzzleFlashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.visible = false;
    for (let i = 0; i < 6; i++) {
      const m = pbox(0.012, 0.012, 0.03, 'clay', 200);
      m.material = new THREE.MeshLambertMaterial({ color: 0xd9a441, emissive: 0x3a2a08 });
      m.visible = false;
      this.camera.add(m);
      this.shells.push({ m, v: new THREE.Vector3(), t: 0 });
    }
  }

  setAspect(a: number) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  private gun(id: VmId): GunModel {
    let gm = this.guns.get(id);
    if (!gm) {
      gm = buildGun(id);
      gm.group.scale.setScalar(0.88);
      this.sway.add(gm.group);
      this.guns.set(id, gm);
    }
    return gm;
  }

  onShot(p: Player) {
    this.kick = 1;
    this.kickRot = 1;
    const ws = p.slot === 'primary' ? p.primary : p.pistol;
    const heavy = ws?.id === 'rifle' ? 1 : ws?.id === 'smg' ? 0.6 : 0.8;
    this.kick *= heavy;
    this.flashT = 0.045;
    this.flash.material.rotation = Math.random() * Math.PI;
    const s = 0.16 + Math.random() * 0.08;
    this.flash.scale.set(s, s, 1);
    // hylster
    const sh = this.shells.find((x) => x.t <= 0);
    if (sh) {
      sh.t = 0.55;
      sh.m.visible = true;
      sh.m.position.set(0.19, -0.1, -0.42);
      sh.v.set(0.9 + Math.random() * 0.5, 1.0 + Math.random() * 0.5, 0.2);
    }
  }
  onKnife() { this.knifeT = 0.32; }
  onPlace() { this.placeT = 0.2; }
  onLand(speed: number) { this.landT = Math.min(1, speed / 12); }

  update(p: Player, dt: number, mouseDX: number, mouseDY: number) {
    this.root.visible = p.alive;
    if (!p.alive) return;
    let id: VmId = p.slot === 'primary' ? (p.primary!.id as VmId) : p.slot === 'pistol' ? 'pistol' : p.slot;
    if (p.action?.kind === 'plant') id = 'bomb';
    if (id !== this.cur) {
      for (const [k, gm] of this.guns) gm.group.visible = k === id;
      this.gun(id).group.visible = true;
      this.gun(id).muzzle.add(this.flash);
      this.cur = id;
    }
    const gm = this.gun(id);
    const hold = HOLD[id];

    // --- Bevægelse ---
    const hs = Math.hypot(p.body.vel.x, p.body.vel.z);
    const k = p.body.onGround ? Math.min(1, hs / 5) : 0;
    this.bob += dt * (6 + hs * 1.3);
    const bx = Math.sin(this.bob) * 0.011 * k;
    const by = -Math.abs(Math.cos(this.bob)) * 0.012 * k;
    // sigte-forsinkelse: våbnet slæber lidt efter musen
    this.swayX += (-mouseDX * 0.00035 - this.swayX) * Math.min(1, dt * 9);
    this.swayY += (mouseDY * 0.00035 - this.swayY) * Math.min(1, dt * 9);
    this.swayX = THREE.MathUtils.clamp(this.swayX, -0.04, 0.04);
    this.swayY = THREE.MathUtils.clamp(this.swayY, -0.03, 0.03);
    this.kick = Math.max(0, this.kick - dt * 11);
    this.kickRot = Math.max(0, this.kickRot - dt * 9);
    this.landT = Math.max(0, this.landT - dt * 4);
    const airY = p.body.onGround ? 0 : THREE.MathUtils.clamp(-p.body.vel.y * 0.004, -0.02, 0.025);

    // --- Skift, genladning, kniv ---
    const draw = p.switchT > 0 ? p.switchT / 0.4 : 0;
    let reload = 0;
    if (p.reloadT > 0) {
      const def = p.slot === 'primary' && p.primary ? WEAPONS[p.primary.id] : WEAPONS.pistol;
      const t = 1 - p.reloadT / def.reload; // 0..1
      reload = Math.sin(Math.min(1, t) * Math.PI);
      if (gm.mag) gm.mag.position.y = (id === 'pistol' ? -0.1 : id === 'smg' ? -0.12 : -0.11) - Math.max(0, Math.sin(Math.min(1, t * 1.6) * Math.PI)) * 0.18;
    } else if (gm.mag) gm.mag.position.y = id === 'pistol' ? -0.1 : id === 'smg' ? -0.12 : -0.11;
    this.knifeT = Math.max(0, this.knifeT - dt);
    const kn = this.knifeT > 0 ? Math.sin((1 - this.knifeT / 0.32) * Math.PI) : 0;
    this.placeT = Math.max(0, this.placeT - dt);
    const pl = this.placeT > 0 ? Math.sin((1 - this.placeT / 0.2) * Math.PI) : 0;
    const busy = p.action?.kind === 'defuse' ? 1 : 0;

    const pos = hold.pos.clone();
    pos.x += bx + this.swayX + kn * -0.12;
    pos.y += by + this.swayY - draw * 0.32 - reload * 0.09 - this.landT * 0.03 + airY - busy * 0.35 + pl * 0.04;
    pos.z += this.kick * 0.045 + kn * -0.12 + pl * -0.06;
    gm.group.position.copy(pos);
    gm.group.rotation.set(
      hold.rot.x + this.kickRot * 0.09 * (id === 'pistol' ? 1.6 : 1) - reload * 0.55 - draw * 0.6 + kn * -0.6 + this.swayY * 2,
      hold.rot.y + this.swayX * 2 + kn * 0.8,
      hold.rot.z + reload * 0.45 + kn * 0.4,
    );
    gm.group.updateMatrix();

    // --- Arme: hånden sidder på grebet, albuen ude til siden og nedad ---
    this.placeArm(this.armR, gm.group, hold.grip, new THREE.Vector3(0.46, -0.72, 0.0));
    if (hold.support) {
      this.armL.visible = true;
      const sup = reload > 0.2 && id !== 'pistol' ? new THREE.Vector3(-0.02, -0.12 - reload * 0.1, -0.05) : hold.support;
      this.placeArm(this.armL, gm.group, sup, new THREE.Vector3(-0.1, -0.8, -0.15));
    } else this.armL.visible = false;

    // --- Mundingsglimt ---
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.flashLight.intensity = this.flashT > 0 ? 6 : 0;
    // --- Hylstre ---
    for (const s of this.shells) {
      if (s.t <= 0) continue;
      s.t -= dt;
      s.v.y -= 6 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += dt * 14; s.m.rotation.z += dt * 9;
      if (s.t <= 0) s.m.visible = false;
    }
  }

  private placeArm(arm: THREE.Group, gun: THREE.Group, local: THREE.Vector3, shoulder: THREE.Vector3) {
    const hand = local.clone().multiplyScalar(gun.scale.x).applyEuler(gun.rotation).add(gun.position);
    arm.position.copy(hand);
    const dir = shoulder.clone().sub(hand).normalize();
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }
}
