// Figurernes "skins": 64×64 pixel-lærreder i samme opdeling som klassiske blokfigurer,
// tegnet i kode for hvert hold. Bruges af både figurerne og førstepersons-armene.
import * as THREE from 'three';
import type { Team } from '../core/player';

const S = 64;

interface Look {
  skin: number; skinDark: number; hair: number;
  shirt: number; shirtDark: number; vest: number; vestDark: number; pouch: number;
  pants: number; pantsDark: number; boots: number; glove: number;
  scarf: number; helmet: number; helmetDark: number; accent: number;
}

const LOOKS: Record<Team, Look> = {
  A: {
    skin: 0xc8946a, skinDark: 0xa87650, hair: 0x3a2716,
    shirt: 0xe0702e, shirtDark: 0xb85820, vest: 0x9b8452, vestDark: 0x7a6840, pouch: 0x6e5c36,
    pants: 0x8d7a52, pantsDark: 0x6f603f, boots: 0x4a3423, glove: 0x5a4632,
    scarf: 0xd5562a, helmet: 0x6b4a2c, helmetDark: 0x4d351e, accent: 0xf2c14e,
  },
  D: {
    skin: 0xd9a77e, skinDark: 0xb3845d, hair: 0x2b2118,
    shirt: 0x3f6fb8, shirtDark: 0x2f5592, vest: 0x3c4655, vestDark: 0x2b333e, pouch: 0x252b34,
    pants: 0x2a3a58, pantsDark: 0x1f2b42, boots: 0x1b1d22, glove: 0x23262c,
    scarf: 0x2d3d5c, helmet: 0x2b3f66, helmetDark: 0x1d2c4a, accent: 0x9fd0ff,
  },
};

const rgb = (h: number) => `#${h.toString(16).padStart(6, '0')}`;

function drawSkin(team: Team): HTMLCanvasElement {
  const L = LOOKS[team];
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  let seed = team === 'A' ? 3 : 9;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const fill = (x: number, y: number, w: number, h: number, col: number, noise = 0.06) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const f = 1 + (rnd() - 0.5) * noise * 2;
      const r = Math.min(255, ((col >> 16) & 255) * f), gg = Math.min(255, ((col >> 8) & 255) * f), b = Math.min(255, (col & 255) * f);
      g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
      g.fillRect(xx, yy, 1, 1);
    }
  };
  const px = (x: number, y: number, col: number) => { g.fillStyle = rgb(col); g.fillRect(x, y, 1, 1); };

  // ---- Hoved (8×8×8 ved 0,0) ----
  fill(0, 0, 32, 16, L.skin, 0.04);
  // hår/hjelm øverst og bagpå
  fill(8, 0, 8, 8, team === 'D' ? L.helmet : L.hair); // top
  fill(16, 0, 8, 8, L.skinDark); // bund
  for (const fx of [0, 8, 16, 24]) fill(fx, 8, 8, 2, team === 'D' ? L.helmet : L.hair);
  fill(24, 8, 8, 6, team === 'D' ? L.helmet : L.hair); // bagside
  fill(0, 8, 2, 5, team === 'D' ? L.helmet : L.hair); fill(22, 8, 2, 5, team === 'D' ? L.helmet : L.hair);
  // ansigt (front 8,8)
  px(9, 11, 0xffffff); px(10, 11, 0x24303c); px(13, 11, 0x24303c); px(14, 11, 0xffffff);
  fill(9, 10, 2, 1, L.hair, 0); fill(13, 10, 2, 1, L.hair, 0);
  if (team === 'A') {
    // tørklæde over næse og mund
    fill(8, 12, 8, 4, L.scarf);
    for (let x = 8; x < 16; x += 2) px(x, 13, 0xb2461f);
    fill(0, 12, 8, 4, L.scarf); fill(16, 12, 8, 4, L.scarf); fill(24, 12, 8, 4, L.scarf);
  } else {
    // briller på hjelmen og hagerem
    fill(8, 9, 8, 1, 0x1a1f28, 0); px(9, 9, 0x7fc4ff); px(14, 9, 0x7fc4ff);
    px(11, 13, L.skinDark); px(12, 13, L.skinDark);
    fill(8, 15, 1, 1, L.helmetDark, 0); fill(15, 15, 1, 1, L.helmetDark, 0);
  }
  // ---- Krop (8×12×4 ved 16,16) ----
  fill(16, 16, 24, 16, L.shirt);
  fill(20, 20, 8, 12, L.vest); // front
  fill(32, 20, 8, 12, L.vest); // bag
  fill(16, 20, 4, 12, L.vestDark); fill(28, 20, 4, 12, L.vestDark);
  fill(20, 16, 8, 4, L.vest); // top
  // skulderstropper og lommer
  fill(21, 20, 1, 4, L.vestDark, 0); fill(26, 20, 1, 4, L.vestDark, 0);
  for (const lx of [20, 23, 26]) { fill(lx, 26, 2, 3, L.pouch); px(lx, 26, L.vestDark); }
  fill(20, 30, 8, 2, L.pantsDark); // bælte
  px(23, 30, L.accent); px(24, 30, L.accent);
  fill(33, 22, 6, 6, L.pouch);
  // holdmærke på brystet
  px(25, 22, L.accent); px(26, 22, L.accent); px(25, 23, L.accent);
  // ---- Arme (4×12×4 ved 40,16) ----
  fill(40, 16, 16, 16, L.shirt);
  fill(40, 20, 16, 2, L.shirtDark); // ærmekant
  fill(40, 28, 16, 4, L.glove); fill(44, 16, 4, 4, L.shirt); fill(48, 16, 4, 4, L.glove);
  fill(40, 26, 16, 2, L.shirtDark); // manchet
  for (let x = 40; x < 56; x += 3) px(x, 24, L.shirtDark); // folder
  fill(41, 21, 2, 2, L.accent, 0); px(41, 21, 0xffffff); // holdmærke på ærmet
  fill(53, 21, 2, 2, L.accent, 0);
  px(42, 29, L.skinDark); px(46, 29, L.skinDark); px(50, 29, L.skinDark); px(54, 29, L.skinDark); // knoer
  // ---- Ben (4×12×4 ved 0,16) ----
  fill(0, 16, 16, 16, L.pants);
  fill(0, 22, 16, 1, L.pantsDark); fill(4, 24, 4, 3, L.pouch); // lårlomme
  fill(0, 28, 16, 4, L.boots); fill(8, 16, 4, 4, L.pants); fill(4, 16, 4, 4, L.pants);
  // ---- Hjelm-overlag (32,0 til 64,16) ----
  fill(32, 0, 32, 16, team === 'D' ? L.helmet : L.helmet);
  if (team === 'A') {
    // kasket med skygge
    fill(40, 0, 8, 8, L.helmet); fill(32, 8, 32, 3, L.helmet); fill(40, 10, 8, 1, L.helmetDark, 0);
  } else {
    fill(40, 8, 8, 1, L.helmetDark, 0); fill(32, 8, 32, 1, L.helmetDark, 0);
    for (let x = 32; x < 64; x += 3) px(x, 12, L.helmetDark);
  }
  return c;
}

const cache = new Map<Team, THREE.Texture>();
export function skinTexture(team: Team): THREE.Texture {
  let t = cache.get(team);
  if (!t) {
    t = new THREE.CanvasTexture(drawSkin(team));
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    cache.set(team, t);
  }
  return t;
}

/** Sæt UV på en BoxGeometry efter skin-opdelingen (u,v = øverste venstre hjørne; w,h,d i pixels) */
export function boxSkinUV(geo: THREE.BoxGeometry, u: number, v: number, w: number, h: number, d: number) {
  // BoxGeometry-fladernes rækkefølge: +x, −x, +y, −y, +z, −z. Figuren kigger mod −z.
  const rects: [number, number, number, number][] = [
    [u, v + d, d, h], // +x = figurens højre side
    [u + d + w, v + d, d, h], // −x = venstre side
    [u + d, v, w, d], // top
    [u + d + w, v, w, d], // bund
    [u + d + w + d, v + d, w, h], // +z = ryg
    [u + d, v + d, w, h], // −z = front
  ];
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const [rx, ry, rw, rh] = rects[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const ou = uv.getX(i), ov = uv.getY(i);
      uv.setXY(i, (rx + ou * rw) / S, 1 - (ry + (1 - ov) * rh) / S);
    }
  }
  uv.needsUpdate = true;
}

export const SKIN_PARTS = {
  head: [0, 0, 8, 8, 8] as const,
  hat: [32, 0, 8, 8, 8] as const,
  body: [16, 16, 8, 12, 4] as const,
  arm: [40, 16, 4, 12, 4] as const,
  leg: [0, 16, 4, 12, 4] as const,
};

export const TEAM_COLOR: Record<Team, number> = { A: 0xf07a32, D: 0x4a90f0 };
