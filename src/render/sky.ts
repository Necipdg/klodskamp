// Himmel (gradient + sol) og firkantede skyer der driver langsomt.
import * as THREE from 'three';
import { Rng } from '../core/math';

export const SKY = {
  zenith: new THREE.Color(0x4f95e0),
  horizon: new THREE.Color(0xcfe2ea),
  fog: 0xd2e0e2,
  sunDir: new THREE.Vector3(-0.55, 0.78, 0.32).normalize(),
};

export function makeSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(450, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: SKY.zenith.clone() },
      horizon: { value: SKY.horizon.clone() },
      sunDir: { value: SKY.sunDir.clone() },
      sunCol: { value: new THREE.Color(0xfff7d9) },
      night: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 c = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += mix(vec3(1.0, 0.86, 0.6), vec3(0.6, 0.7, 1.0), night) * pow(s, 18.0) * 0.35;
        // Stjerner om natten (firkantede pixels)
        if (night > 0.01 && h > 0.04) {
          vec3 q = floor(normalize(vDir) * 160.0);
          float st = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          if (st > 0.996) c += vec3(0.85, 0.9, 1.0) * night * (st - 0.996) * 220.0;
        }
        // Firkantet sol (pixel-stil)
        vec3 d = normalize(vDir);
        vec3 t1 = normalize(cross(sunDir, vec3(0.0,1.0,0.0)));
        vec3 t2 = cross(t1, sunDir);
        float a = abs(dot(d, t1)), b = abs(dot(d, t2));
        if (dot(d, sunDir) > 0.0 && max(a, b) < 0.045) c = mix(c, sunCol, 0.95);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

export class Clouds {
  readonly mesh: THREE.Mesh;
  private span = 360;
  constructor() {
    const rng = new Rng(5);
    const cell = 8, n = this.span / cell;
    const grid: boolean[] = [];
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const v = Math.sin(x * 0.45) * Math.cos(z * 0.38) + Math.sin(x * 0.13 + z * 0.21) * 0.9 + rng.next() * 0.7;
      grid.push(v > 0.95);
    }
    const geos: THREE.BufferGeometry[] = [];
    const box = new THREE.BoxGeometry(cell, 2.4, cell);
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      if (!grid[z * n + x]) continue;
      const g = box.clone();
      g.translate(x * cell - this.span / 2, 0, z * cell - this.span / 2);
      geos.push(g);
    }
    const merged = mergeGeos(geos);
    this.mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa6b0, transparent: true, opacity: 0.88, fog: false }));
    this.mesh.position.y = 52;
    this.mesh.renderOrder = -5;
  }
  private t = 0;
  update(dt: number, cx: number, cz: number) {
    this.t += dt;
    this.mesh.position.x = cx + ((this.t * 0.7) % 180) - 90;
    this.mesh.position.z = cz;
  }
}

/** Enkel sammensmeltning af ikke-indekserede/indekserede geometrier med samme attributter */
export function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = Object.keys(geos[0].attributes);
  const out = new THREE.BufferGeometry();
  let vcount = 0;
  const idx: number[] = [];
  const data: Record<string, number[]> = {};
  for (const n of names) data[n] = [];
  for (const g of geos) {
    for (const n of names) { const a = g.attributes[n].array; for (let i = 0; i < a.length; i++) data[n].push(a[i]); }
    const gi = g.index;
    if (gi) for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + vcount);
    else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + vcount);
    vcount += g.attributes.position.count;
  }
  for (const n of names) out.setAttribute(n, new THREE.Float32BufferAttribute(data[n], geos[0].attributes[n].itemSize));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}
