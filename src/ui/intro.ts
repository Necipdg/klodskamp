// Åbningen af spillet: en titelskærm med logo af faldende klodser og en kæmpe der rejser sig bag bjergene –
// og en skærm i samme stil, der beder om at dreje telefonen (på højkant). Al grafik er pixel-SVG lavet her i koden.

/** Pixelkunst som SVG: hver række er en streng, hvert tegn en farve fra paletten ('.' = gennemsigtig) */
function pixelSvg(rows: string[], pal: Record<string, string>, stretch = false) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  let r = '';
  rows.forEach((row, y) => {
    // Sammenhængende vandrette stræk samles til ét rektangel (mindre SVG)
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let n = 1;
      while (x + n < row.length && row[x + n] === c) n++;
      if (c !== '.' && pal[c]) r += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${pal[c]}"${c === 'e' || c === 'k' ? ' class="glow"' : ''}/>`;
      x += n;
    }
  });
  return `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" preserveAspectRatio="${stretch ? 'none' : 'xMidYMax meet'}">${r}</svg>`;
}

// Kæmpen: hoved med glødende øjne, brede skuldre, arme ned langs siden, krystallen i nakken (k) lyser
const GIANT = [
  '...........######...........',
  '..........########..........',
  '.........##########.........',
  '.........#ee####ee#.........',
  '.........##########.........',
  '..........##kk####..........',
  '...........######...........',
  '......################......',
  '....####################....',
  '...######################...',
  '..########################..',
  '..#####..############..####.',
  '.#####...############...####',
  '.####....############....###',
  '.####....############....###',
  '.####....############....###',
  '.###.....############.....##',
  '.###.....############.....##',
  '.###.....############.....##',
  '.##......############......#',
  '.........############.......',
  '.........############.......',
];

/** Bjergkæde: deterministisk "støj", så den ser ens ud hver gang */
function ridge(w: number, h: number, seed: number, base: number, amp: number) {
  const hs: number[] = [];
  for (let x = 0; x < w; x++) {
    const v = Math.sin(x * 0.21 + seed) * 0.5 + Math.sin(x * 0.067 + seed * 2.3) * 0.9 + Math.sin(x * 0.53 + seed * 5.1) * 0.18;
    hs.push(Math.round(base + amp * v));
  }
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) {
      const top = h - hs[x];
      s += y < top ? '.' : y === top ? 's' : y < top + 2 && hs[x] > base + amp * 0.6 ? 's' : 'm';
    }
    rows.push(s);
  }
  return rows;
}

// Borgmur med tinder og en port
const WALL = (() => {
  const w = 96, rows: string[] = [];
  rows.push(Array.from({ length: w }, (_, x) => (x % 6 < 3 ? 'w' : '.')).join(''));
  rows.push(Array.from({ length: w }, (_, x) => (x % 6 < 3 ? 'w' : '.')).join(''));
  for (let y = 0; y < 9; y++) {
    rows.push(Array.from({ length: w }, (_, x) => {
      const gx = x - 84;
      if (gx >= 0 && gx < 8 && y >= 2 && !(y === 2 && (gx === 0 || gx === 7))) return y === 2 || gx === 0 || gx === 7 ? 'w' : 'g';
      return (x + y * 3) % 11 === 0 ? 'd' : 'w';
    }).join(''));
  }
  return rows;
})();

const SKY_PAL = { m: '#20263a', s: '#3a4560', w: '#141018', d: '#1c1720', g: '#ffb05a' };
const FAR_PAL = { m: '#2c3350', s: '#48557a' };
const GIANT_PAL = { '#': '#140f1a', r: '#4a2236', t: '#2c1a2e', e: '#ff8a2a', k: '#7ee8ff' };
/** Kanterne af kæmpen får lys fra solnedgangen bag den (r = højre kant, t = overkant) */
function rimLight(rows: string[]) {
  const at = (x: number, y: number) => rows[y]?.[x] ?? '.';
  return rows.map((row, y) => [...row].map((c, x) => {
    if (c !== '#') return c;
    if (at(x + 1, y) === '.') return 'r';
    if (at(x, y - 1) === '.' || at(x - 1, y) === '.') return 't';
    return c;
  }).join(''));
}

/** Fælles scene: himmel, stjerner, bjerge, kæmpen og borgen */
function sceneHtml(stars: number) {
  let st = '';
  for (let i = 0; i < stars; i++) {
    const x = (i * 37.7) % 100, y = (i * 23.3) % 55, d = (i % 7) * 0.4;
    st += `<i style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;animation-delay:${d}s"></i>`;
  }
  return `<div class="sky"></div><div class="stars">${st}</div>
    <div class="far">${pixelSvg(ridge(120, 26, 1.7, 14, 6), FAR_PAL, true)}</div>
    <div class="giant">${pixelSvg(rimLight(GIANT), GIANT_PAL)}</div>
    <div class="near">${pixelSvg(ridge(120, 22, 4.2, 9, 5), SKY_PAL, true)}</div>
    <div class="wall">${pixelSvg(WALL, SKY_PAL, true)}</div>`;
}

function logoHtml() {
  const word = (w: string, off: number) => [...w].map((c, i) => `<span style="--d:${(off + i) * 0.09 + 0.25}s">${c}</span>`).join('');
  return `<h1 class="ilogo"><div>${word('KLODS', 0)}</div><div>${word('KAMP', 5)}</div></h1>`;
}

/** "Drej telefonen" – vises på højkant på telefoner */
export function rotateHtml() {
  return `<div class="iscene">${sceneHtml(40)}</div>
    <div class="ifront">
      ${logoHtml()}
      <div class="itag">Kæmpejagt · Spil sammen · Taktisk kamp</div>
      <div class="iphone"><i></i></div>
      <div class="irot">Drej telefonen vandret<br>for at spille</div>
    </div>`;
}

/** Titelskærmen ved start. Kalder `done` når man trykker (og skal selv låse lyd op m.m.). */
export class Splash {
  readonly el = document.createElement('div');
  private gone = false;

  constructor(touch: boolean, private done: () => void) {
    this.el.id = 'splash';
    this.el.innerHTML = `<div class="iscene">${sceneHtml(60)}</div>
      <div class="bars"><i></i><i></i></div>
      <div class="ifront">
        ${logoHtml()}
        <div class="itag">En by af klodser. Kæmper ved porten.</div>
        <div class="igo">${touch ? 'Tryk' : 'Klik'} for at spille</div>
        <div class="imodes"><span>Kæmpejagt</span><span>Spil sammen</span><span>Taktisk kamp</span></div>
      </div>`;
    document.getElementById('ui')!.append(this.el);
    // Starter man på højkant, har animationen kørt bag "drej telefonen" – vis den forfra, når telefonen drejes
    const mq = matchMedia('(orientation: landscape)');
    const html = this.el.innerHTML;
    mq.addEventListener?.('change', () => { if (mq.matches && !this.gone) this.el.innerHTML = html; });
    const go = (e: Event) => { e.preventDefault(); this.dismiss(); };
    this.el.addEventListener('pointerdown', go);
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => { if (!e.repeat && !['F3', 'F8', 'F9'].includes(e.code)) this.dismiss(); };

  get open() { return !this.gone; }

  dismiss() {
    if (this.gone) return;
    this.gone = true;
    window.removeEventListener('keydown', this.onKey);
    this.done();
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 900);
  }
}
