// Blokfigurer for alle seks spillere: holdfarver, vest, hjelm/kasket, våben i hænderne,
// gå-, hug- og dødsanimation. Tegnes ud fra spillernes tilstand i kernen.
import * as THREE from 'three';
import type { Player, Team } from '../core/player';
import { boxSkinUV, skinTexture, SKIN_PARTS, TEAM_COLOR } from './skins';
import { buildGun, colorMat, pbox, type GunModel } from './guns';

const PXM = 1.8 / 32; // meter pr. skin-pixel

function part(key: keyof typeof SKIN_PARTS, mat: THREE.Material, scale = 1): THREE.Mesh {
  const [u, v, w, h, d] = SKIN_PARTS[key];
  const geo = new THREE.BoxGeometry(w * PXM * scale, h * PXM * scale, d * PXM * scale);
  boxSkinUV(geo, u, v, w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

const GEAR: Record<Team, { vest: number; pouch: number; hat: number; hatDark: number }> = {
  A: { vest: 0x9b8452, pouch: 0x6e5c36, hat: 0x6b4a2c, hatDark: 0x4d351e },
  D: { vest: 0x3c4655, pouch: 0x252b34, hat: 0x2b3f66, hatDark: 0x1d2c4a },
};

let flashTex: THREE.Texture | null = null;
export function muzzleFlashTexture(): THREE.Texture {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const pts: [number, number, string][] = [];
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    const dx = i - 7.5, dy = j - 7.5;
    const r = Math.hypot(dx, dy);
    const star = Math.abs(dx) < 1.2 || Math.abs(dy) < 1.2 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 1;
    if (r < 2.5) pts.push([i, j, '#fffbe6']);
    else if (r < 4.5) pts.push([i, j, '#ffd66b']);
    else if (star && r < 7.5) pts.push([i, j, r < 6 ? '#ffb340' : '#ff8a1e']);
  }
  for (const [x, y, col] of pts) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  flashTex = new THREE.CanvasTexture(c);
  flashTex.colorSpace = THREE.SRGBColorSpace;
  flashTex.magFilter = THREE.NearestFilter; flashTex.minFilter = THREE.NearestFilter; flashTex.generateMipmaps = false;
  return flashTex;
}

function nameSprite(name: string, team: Team): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 40;
  const g = c.getContext('2d')!;
  g.font = 'bold 22px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(10,14,20,0.55)';
  const tw = g.measureText(name).width + 14;
  g.fillRect(64 - tw / 2, 2, tw, 24);
  g.fillStyle = `#${TEAM_COLOR[team].toString(16)}`;
  g.fillText(name, 64, 21);
  g.beginPath(); g.moveTo(56, 28); g.lineTo(72, 28); g.lineTo(64, 38); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.1, 0.34, 1);
  s.renderOrder = 10;
  return s;
}

export class Character {
  readonly root = new THREE.Group();
  private pose = new THREE.Group();
  private torso = new THREE.Group();
  private aim = new THREE.Group();
  private head: THREE.Group;
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private guns = new Map<string, GunModel>();
  private curGun = '';
  private flash: THREE.Sprite;
  private pack: THREE.Mesh;
  private marker: THREE.Sprite | null = null;
  private walk = 0;
  private fall = 0;
  private kick = 0;
  private flashT = 0;
  private hitT = 0;
  private mat: THREE.MeshLambertMaterial;

  constructor(readonly p: Player, showName: boolean) {
    const team = p.team;
    const mat = new THREE.MeshLambertMaterial({ map: skinTexture(team) });
    this.mat = mat;
    const gear = GEAR[team];
    const legH = 12 * PXM;
    // Ben (omdrejningspunkt i hoften)
    for (const [leg, sx] of [[this.legL, -1], [this.legR, 1]] as const) {
      const m = part('leg', mat);
      m.position.y = -legH / 2;
      leg.add(m);
      leg.position.set(sx * 2 * PXM, legH, 0);
      this.pose.add(leg);
    }
    // Krop
    this.torso.position.y = legH;
    const body = part('body', mat);
    body.position.y = 6 * PXM;
    this.torso.add(body);
    const vest = pbox(8.6 * PXM, 7 * PXM, 4.8 * PXM, colorMat(gear.vest), 40);
    vest.position.set(0, 7.6 * PXM, 0);
    this.torso.add(vest);
    for (const x of [-2.6, 0, 2.6]) {
      const pouch = pbox(2 * PXM, 2.4 * PXM, 1 * PXM, colorMat(gear.pouch), 40);
      pouch.position.set(x * PXM, 5.6 * PXM, -2.8 * PXM);
      this.torso.add(pouch);
    }
    this.pack = pbox(6 * PXM, 5 * PXM, 2.4 * PXM, 'clay', 40);
    this.pack.position.set(0, 8 * PXM, 3.4 * PXM);
    this.torso.add(this.pack);
    this.pose.add(this.torso);
    // Sigte-gruppe: arme og våben drejer med pitch fra skulderen
    this.aim.position.y = 12 * PXM;
    this.torso.add(this.aim);
    for (const [arm, sx] of [[this.armL, -1], [this.armR, 1]] as const) {
      const m = part('arm', mat);
      m.position.y = -5 * PXM;
      arm.add(m);
      arm.position.set(sx * 6 * PXM, -1 * PXM, 0);
      this.aim.add(arm);
    }
    // Hoved
    this.head = new THREE.Group();
    this.head.position.y = 12 * PXM;
    const hm = part('head', mat);
    hm.position.y = 4 * PXM;
    this.head.add(hm);
    if (team === 'D') {
      const helmet = pbox(9 * PXM, 3.4 * PXM, 9 * PXM, colorMat(gear.hat), 40);
      helmet.position.set(0, 7.4 * PXM, 0.2 * PXM);
      this.head.add(helmet);
      const rim = pbox(9.4 * PXM, 0.8 * PXM, 9.4 * PXM, colorMat(gear.hatDark), 40);
      rim.position.set(0, 5.8 * PXM, 0.2 * PXM);
      this.head.add(rim);
    } else {
      const cap = pbox(8.6 * PXM, 2.2 * PXM, 8.6 * PXM, colorMat(gear.hat), 40);
      cap.position.set(0, 7.9 * PXM, 0);
      this.head.add(cap);
      const visor = pbox(7 * PXM, 0.6 * PXM, 3 * PXM, colorMat(gear.hatDark), 40);
      visor.position.set(0, 7.0 * PXM, -5.4 * PXM);
      this.head.add(visor);
    }
    this.torso.add(this.head);
    this.root.add(this.pose);

    const fm = new THREE.SpriteMaterial({ map: muzzleFlashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flash = new THREE.Sprite(fm);
    this.flash.scale.set(0.45, 0.45, 1);
    this.flash.visible = false;
    if (showName) {
      this.marker = nameSprite(p.name, team);
      this.marker.position.y = 2.25;
      this.root.add(this.marker);
    }
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  }

  private setGun(id: string) {
    if (id === this.curGun) return;
    const old = this.guns.get(this.curGun);
    if (old) old.group.visible = false;
    let gm = this.guns.get(id);
    if (!gm) {
      gm = buildGun(id as never);
      gm.group.scale.setScalar(1.15);
      this.aim.add(gm.group);
      this.guns.set(id, gm);
    }
    gm.group.visible = true;
    gm.muzzle.add(this.flash);
    this.curGun = id;
  }

  /** Navneskiltet skjules helt tæt på (og på den man selv ser fra) */
  markerOk = true;

  /** Kort rødt glimt når figuren bliver ramt */
  onHit() { this.hitT = 0.12; }

  onShot() { this.kick = 1; this.flashT = 0.05; this.flash.material.rotation = Math.random() * Math.PI; }

  update(dt: number, alpha: number) {
    const p = this.p;
    const pos = p.body.pos, prev = p.prevPos;
    this.root.position.set(prev.x + (pos.x - prev.x) * alpha, prev.y + (pos.y - prev.y) * alpha, prev.z + (pos.z - prev.z) * alpha);
    this.root.rotation.y = p.yaw;

    // Død: fald bagover
    if (!p.alive) this.fall = Math.min(1, this.fall + dt * 3.2);
    else this.fall = 0;
    const f = this.fall;
    this.pose.rotation.x = (f * f) * (Math.PI / 2) * 0.98;
    this.pose.position.y = f * 0.12;
    if (this.marker) this.marker.visible = p.alive && this.markerOk;
    if (!p.alive) { this.flash.visible = false; return; }

    // Våben
    const slot = p.slot;
    const id = slot === 'primary' ? p.primary!.id : slot === 'pistol' ? 'pistol' : slot;
    this.setGun(id);
    const gm = this.guns.get(id)!;
    this.pack.visible = p.hasBomb;

    // Gang
    const hs = Math.hypot(p.body.vel.x, p.body.vel.z);
    const k = Math.min(1, hs / 5);
    this.walk += hs * dt * 1.9;
    const swing = Math.sin(this.walk) * 0.75 * k * (p.body.onGround ? 1 : 0.3);
    const crouch = p.crouching ? 1 : 0;
    this.legL.rotation.x = swing - crouch * 1.0;
    this.legR.rotation.x = -swing - crouch * 0.6;
    this.torso.position.y = 12 * PXM - crouch * 0.3 + Math.abs(Math.cos(this.walk)) * 0.03 * k;
    this.torso.rotation.x = -crouch * 0.18;
    // Sigte
    const pitch = p.pitch;
    this.aim.rotation.x = pitch + crouch * 0.18;
    this.head.rotation.x = pitch * 0.7 + crouch * 0.18;
    this.kick = Math.max(0, this.kick - dt * 9);
    // Armene peger frem mod våbnet
    const melee = slot === 'knife' || slot === 'blocks' || slot === 'bomb';
    this.armR.rotation.set(-1.45 + (melee ? 0.35 : 0), 0.1, 0);
    this.armL.rotation.set(melee ? -0.3 + swing * 0.5 : -1.35, melee ? 0 : -0.55, 0);
    gm.group.position.set(0.17 + (melee ? 0.02 : 0), -0.13 - (melee ? 0.15 : 0), -0.5 + this.kick * 0.05 + (melee ? 0.12 : 0));
    gm.group.rotation.set(melee ? -0.3 : 0, 0, 0);
    if (p.reloadT > 0) gm.group.rotation.x = -0.5;

    this.flashT -= dt;
    this.flash.visible = this.flashT > 0 && !melee;
    this.hitT -= dt;
    this.mat.emissive.setHex(this.hitT > 0 ? 0x8a1c10 : 0x000000);
  }
}
