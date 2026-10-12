// Ikoner til købsmenuen: de samme 3D-modeller som i spillet, tegnet én gang fra siden.
import * as THREE from 'three';
import type { BuyId } from '../config/weapons';
import { buildGun, colorMat, pbox } from './guns';

let cache: Record<BuyId, string> | null = null;

export function buyIcons(): Record<BuyId, string> {
  if (cache) return cache;
  const out = {} as Record<BuyId, string>;
  let r: THREE.WebGLRenderer;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 110;
    r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    for (const id of ['smg', 'rifle', 'vest', 'ammo', 'blocks'] as BuyId[]) out[id] = '';
    return (cache = out);
  }
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 1.6);
  d.position.set(1, 2, 2);
  scene.add(d);
  const cam = new THREE.OrthographicCamera(-0.48, 0.48, 0.22, -0.22, 0.01, 10);
  cam.position.set(2, 0.5, 0);
  cam.lookAt(0, 0, 0);
  const shoot = (obj: THREE.Object3D, zoom = 1) => {
    scene.add(obj);
    cam.zoom = zoom; cam.updateProjectionMatrix();
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, cam);
    scene.remove(obj);
    return r.domElement.toDataURL('image/png');
  };
  const center = (g: THREE.Object3D) => {
    const b = new THREE.Box3().setFromObject(g);
    const c = b.getCenter(new THREE.Vector3());
    g.position.sub(c);
    const wrap = new THREE.Group();
    wrap.add(g);
    return wrap;
  };
  out.smg = shoot(center(buildGun('smg').group), 1.15);
  out.rifle = shoot(center(buildGun('rifle').group), 0.72);
  // Vest
  const vest = new THREE.Group();
  vest.add(pbox(0.06, 0.34, 0.3, colorMat(0x6d6a50), 64));
  for (const z of [-0.09, 0, 0.09]) { const p = pbox(0.04, 0.09, 0.07, colorMat(0x4f4c38), 64); p.position.set(0.05, -0.06, z); vest.add(p); }
  const strap = pbox(0.065, 0.1, 0.05, colorMat(0x4f4c38), 64); strap.position.set(0, 0.2, 0.1); vest.add(strap);
  const strap2 = strap.clone(); strap2.position.z = -0.1; vest.add(strap2);
  vest.rotation.y = 0.5;
  out.vest = shoot(center(vest), 1.0);
  // Ammunition
  const ammo = new THREE.Group();
  for (let i = 0; i < 3; i++) { const m = pbox(0.05, 0.17, 0.085, 'dark'); m.position.set(0, 0, (i - 1) * 0.11); m.rotation.x = 0.15; ammo.add(m); const tip = pbox(0.03, 0.02, 0.02, 'clay'); tip.position.set(0, 0.095, (i - 1) * 0.11 - 0.015); ammo.add(tip); }
  out.ammo = shoot(center(ammo), 1.2);
  // Byggeblokke
  const blocks = new THREE.Group();
  const b1 = buildGun('blocks').group; b1.position.set(0, 0, -0.12);
  const b2 = buildGun('blocks').group; b2.position.set(0, 0, 0.12);
  const b3 = buildGun('blocks').group; b3.position.set(0, 0.2, 0);
  blocks.add(b1, b2, b3);
  blocks.rotation.y = 0.6;
  out.blocks = shoot(center(blocks), 1.0);
  r.dispose();
  r.forceContextLoss();
  return (cache = out);
}
