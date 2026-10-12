// Brugerfladen: startskærm, styring, HUD, købsmenu, pausemenu, resultattavle og slutskærm.
// Ren HTML/CSS oven på 3D-billedet. Al tekst er på dansk.
import { TUNING, type Difficulty } from '../config/tuning';
import { BUY_ITEMS, WEAPONS, type BuyId } from '../config/weapons';
import type { Game, GameEvent } from '../core/game';
import { REASON_TEXT } from '../core/game';
import { TEAM_NAME, type Player, type Team } from '../core/player';
import { inRect } from '../core/map';
import { QUALITY_NAME, type Quality, type Settings } from '../game/settings';
import { buyIcons } from '../render/icons';
import { huntControlsHtml, touchControlsHtml } from './huntUi';
import { HUNT_MAPS } from '../hunt/maps';
import type { HuntMapId } from '../hunt/city';
import { HUNT_DIFF } from '../hunt/progress';
import { getRecords } from '../game/records';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const fmtTime = (s: number) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const teamCls = (t: Team) => (t === 'A' ? 'a' : 'd');

// Pixel-ikoner som SVG (skarpe kanter)
const svgPx = (rows: string[], col: string) => {
  const h = rows.length, w = rows[0].length;
  let r = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
  return `<svg class="ico" viewBox="0 0 ${w} ${h}" fill="${col}">${r}</svg>`;
};
const ICON_HP = svgPx(['...##...', '...##...', '...##...', '########', '########', '...##...', '...##...', '...##...'], '#ff6a50');
const ICON_AR = svgPx(['########', '########', '########', '########', '.######.', '.######.', '..####..', '...##...'], '#8fb6d8');

export interface UICallbacks {
  start(team: Team, diff: Difficulty): void;
  startHunt(map: HuntMapId, diff: Difficulty): void;
  /** Kæmpejagt sammen med andre (null = ikke muligt i denne udgave) */
  coop: ((map: HuntMapId, diff: Difficulty) => void) | null;
  /** Ydelsestest fra pausemenuen – returnerer resultatet som tekst */
  benchmark(): string;
  /** "Installér som app" (Android/computer: browserens egen dialog) */
  install(): void;
  begin(): void; // klik på "start" i styrings-kortet
  resume(): void;
  quit(): void;
  buy(id: BuyId): void;
  settings(s: Settings): void;
  again(): void;
  closeBuy(): void;
}

export class UI {
  private root = document.getElementById('ui')!;
  private menu = el('div', '');
  private hud = el('div', '');
  private buy = el('div', 'overlay hidden');
  private pause = el('div', 'overlay hidden');
  private intro = el('div', 'overlay hidden');
  private end = el('div', 'overlay hidden');
  private board = el('div', 'panel hidden');
  private diff: Difficulty = 'normal';
  private h: Record<string, HTMLElement> = {};
  private radar!: HTMLCanvasElement;
  private radarImg: HTMLCanvasElement | null = null;
  private feed: { e: HTMLElement; t: number }[] = [];
  private bannerT = 0;
  private hitT = 0;
  private hurtA = 0;
  private dirs: { e: HTMLElement; t: number; yaw: number }[] = [];
  private noteT = 0;
  private moneyShown = -1;
  private moneyDeltaT = 0;
  buyOpen = false;
  spotted = new Set<number>();
  specId = -1;

  constructor(private settings: Settings, private cb: UICallbacks) {
    this.menu.id = 'menu';
    this.hud.id = 'hud';
    this.buy.id = 'buy';
    this.pause.id = 'pause';
    this.intro.id = 'intro';
    this.end.id = 'matchend';
    this.board.id = 'scoreboard';
    this.root.append(this.menu, this.hud, this.board, this.buy, this.intro, this.pause, this.end);
    this.buildMenu();
    this.buildHud();
    this.hud.classList.add('hidden');
  }

  // ================= Startskærm =================

  private buildMenu() {
    const col = el('div', 'col interactive');
    col.append(
      el('div', 'label', 'Blokspil · to spiltyper'),
      el('h1', 'title', 'KLODS<br>KAMP'),
      el('p', 'tag', 'Taktiske bomberunder mod bots – eller jagt på kæmper med krog og gas over byens tage.'),
    );
    col.append(el('div', 'label', 'Vælg spiltype'));
    const modes = el('div', 'modes');
    const mT = el('button', 'mode on', '<span class="t">Taktisk kamp</span><span class="s">3 mod 3 · bombe · køb og byg</span>');
    const mH = el('button', 'mode hunt', '<span class="t">Kæmpejagt</span><span class="s">Alene eller sammen · krog, gas, opgraderinger og bølger af kæmper</span>');
    modes.append(mT, mH);
    col.append(modes);
    // Taktisk kamp
    const paneT = el('div', 'pane');
    const a = el('button', 'btn team-a', `Spil som angriber <span class="key">ANGRIB</span>`);
    const d = el('button', 'btn team-d', `Spil som forsvarer <span class="key">FORSVAR</span>`);
    a.onclick = () => this.cb.start('A', this.diff);
    d.onclick = () => this.cb.start('D', this.diff);
    paneT.append(a, d);
    paneT.append(el('div', 'label', 'Bots'));
    const seg = el('div', 'seg');
    for (const [k, n] of [['let', 'Let'], ['normal', 'Normal'], ['svaer', 'Svær']] as [Difficulty, string][]) {
      const b = el('button', k === this.diff ? 'on' : '', n);
      b.onclick = () => { this.diff = k; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
      seg.append(b);
    }
    paneT.append(seg);
    // Kæmpejagt
    const paneH = el('div', 'pane hidden');
    paneH.append(el('p', 'info', 'Kæmper bryder ind i bølger. Sving dig mellem tårne og træer med krogen, skyd den glødende krystal i nakken, og køb opgraderinger for mønterne mellem bølgerne.'));
    paneH.append(el('div', 'label', 'Bane'));
    const mseg = el('div', 'seg');
    for (const m of HUNT_MAPS) {
      const b = el('button', m.id === this.huntMap ? 'on' : '', m.name);
      b.dataset.map = m.id;
      b.onclick = () => { this.huntMap = m.id; mseg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); this.selectMode(true); };
      mseg.append(b);
    }
    paneH.append(mseg);
    paneH.append(el('div', 'label', 'Sværhed'));
    const dseg = el('div', 'seg');
    for (const k of ['let', 'normal', 'svaer'] as Difficulty[]) {
      const b = el('button', k === this.settings.huntDiff ? 'on' : '', HUNT_DIFF[k].name);
      b.dataset.diff = k;
      b.onclick = () => { this.settings.huntDiff = k; this.cb.settings(this.settings); dseg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); this.selectMode(true); };
      dseg.append(b);
    }
    paneH.append(dseg);
    const go = el('button', 'btn hunt', `Start jagten <span class="key">JAGT</span>`);
    go.onclick = () => this.cb.startHunt(this.huntMap, this.settings.huntDiff);
    paneH.append(go);
    if (this.cb.coop) {
      const co = el('button', 'btn coop', `Spil sammen <span class="key">DEL LINK</span>`);
      co.onclick = () => this.cb.coop?.(this.huntMap, this.settings.huntDiff);
      paneH.append(co);
    }
    col.append(paneT, paneH);
    const ctl = el('button', 'btn small', 'Styring');
    ctl.onclick = () => this.showControls(null);
    const set = el('button', 'btn small', 'Indstillinger');
    set.onclick = () => this.showSettings(null);
    const small = el('div', 'smallrow');
    small.append(ctl, set);
    col.append(small);
    const inst = el('button', 'btn small install hidden', '⬇ Installér som app');
    inst.onclick = () => (this.installMode === 'ios' ? this.showIosInstall() : this.cb.install());
    this.h.install = inst;
    col.append(inst);
    this.menu.append(col);
    const foot = el('div', 'foot', 'Mus + tastatur · Taktisk kamp: første hold til 5 vundne runder · Al grafik og lyd er lavet i kode til dette spil');
    this.menu.append(foot);
    const card = el('div', 'mapcard panel');
    const mc = el('canvas');
    this.menu.append(card);
    this.h.mapcanvas = mc;
    const select = (hunt: boolean) => {
      this.menuMode = hunt ? 'hunt' : 'tactical';
      mT.classList.toggle('on', !hunt); mH.classList.toggle('on', hunt);
      paneT.classList.toggle('hidden', hunt); paneH.classList.toggle('hidden', !hunt);
      foot.innerHTML = hunt ? 'Mus + tastatur eller touch · Alene mod bølger af kæmper · Al grafik og lyd er lavet i kode til dette spil' : 'Mus + tastatur · Taktisk kamp: første hold til 5 vundne runder · Al grafik og lyd er lavet i kode til dette spil';
      const hm = HUNT_MAPS.find((m) => m.id === this.huntMap)!;
      card.innerHTML = hunt
        ? `<div class="label">Bane</div><h2 class="heading">${hm.name}</h2><p>${hm.desc}</p>${this.recordsHtml()}`
        : `<div class="label">Bane</div><h2 class="heading">Sandgården</h2><p>Solbeskinnet sandstensby. To veje til bombeområdet: <b>Lang</b> mod vest og <b>Tunnelen</b> gennem midten – plus en tilmuret smutvej, der kan skydes op.</p>`;
      card.append(mc);
      if (hunt) this.drawHuntMap?.(mc, this.huntMap);
      else if (this.menuGame) this.drawMinimap(mc, this.menuGame, 2);
    };
    mT.onclick = () => select(false);
    mH.onclick = () => select(true);
    this.selectMode = select;
    select(false);
  }

  /** Bedste resultat for den valgte bane og sværhedsgrad */
  private recordsHtml() {
    const d = this.settings.huntDiff;
    const best = getRecords(this.huntMap, d)[0];
    return `<div class="rec">${best ? `Rekord (${HUNT_DIFF[d].name}): <b>${best.score.toLocaleString('da-DK')}</b> point${best.won ? ' · sejr' : ` · bølge ${best.wave}`}` : `Ingen rekord endnu på ${HUNT_DIFF[d].name}`}</div>`;
  }

  /** Hvilken spiltype der er valgt på startskærmen (styrer også styrings-kortet) */
  menuMode: 'tactical' | 'hunt' = 'tactical';
  /** Hvilken spiltype der spilles lige nu (styrer styrings-kortet i pausemenuen) */
  playMode: 'tactical' | 'hunt' | null = null;
  drawHuntMap: ((c: HTMLCanvasElement, id: HuntMapId) => void) | null = null;
  huntMap: HuntMapId = 'ravnsdalen';
  private menuGame: Game | null = null;
  private selectMode: (hunt: boolean) => void = () => {};

  showMenu(game: Game | null) {
    this.playMode = null;
    this.menuGame = game;
    this.menu.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.end.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.intro.classList.add('hidden');
    this.closeBuy();
    this.selectMode(this.menuMode === 'hunt');
  }
  hideMenu() { this.menu.classList.add('hidden'); }

  // ================= App (installér) =================

  private installMode: 'prompt' | 'ios' | null = null;
  /** Vis/skjul knappen "Installér som app" (null = allerede installeret eller ikke muligt her) */
  setInstall(mode: 'prompt' | 'ios' | null) {
    this.installMode = mode;
    this.h.install?.classList.toggle('hidden', !mode);
  }
  /** iPhone/iPad: Safari har ingen installér-dialog – forklar hvordan */
  showIosInstall() {
    this.pause.innerHTML = '';
    const c = el('div', 'card interactive');
    c.append(el('h2', 'heading', 'Installér på iPhone'), el('div', 'sub', 'Så ligger Klodskamp på hjemmeskærmen med sit eget ikon, kører i fuld skærm og virker uden internet.'));
    c.insertAdjacentHTML('beforeend', `<div class="keys">
      <span class="k">1</span><span>Åbn siden i <b>Safari</b></span>
      <span class="k">2</span><span>Tryk på <b>Del</b>-knappen (firkanten med pilen op ⬆︎)</span>
      <span class="k">3</span><span>Vælg <b>Føj til hjemmeskærm</b> og tryk <b>Tilføj</b></span>
    </div>`);
    const b = el('button', 'btn primary', 'OK');
    b.onclick = () => this.pause.classList.add('hidden');
    c.append(b);
    this.pause.append(c);
    this.pause.classList.remove('hidden');
  }

  // ================= Styring / indstillinger =================

  /** Touch-styring på skærmen (telefon/tablet) */
  touch = false;
  /** Tastens navn – eller knappens navn på skærmen, når man spiller med touch */
  private key(k: 'E' | 'B') { return this.touch ? (k === 'E' ? 'BRUG' : 'KØB') : k; }

  private controlsHtml() {
    if (this.touch) return touchControlsHtml('tactical');
    return `<div class="keys">
      <span class="k">W A S D</span><span>Gå · <b>Shift</b> = gå lydløst · <b>C</b> = hug</span>
      <span class="k">MUS</span><span>Kig og sigt · <b>venstre knap</b> = skyd / placér blok</span>
      <span class="k">MELLEMRUM</span><span>Hop (én blok højt)</span>
      <span class="k">R</span><span>Genlad</span>
      <span class="k">1 2 3 4 5</span><span>Riffel · pistol · kniv · byggeblokke · bombe (også musehjul)</span>
      <span class="k">E (hold)</span><span>Plant bomben på bombeområdet / desarmér den</span>
      <span class="k">B</span><span>Købsmenu (kun i købsfasen)</span>
      <span class="k">G</span><span>Smid bomben</span>
      <span class="k">TAB</span><span>Resultattavle</span>
      <span class="k">ESC</span><span>Pause (frigiver musen)</span>
    </div>`;
  }

  private showControls(back: (() => void) | null) {
    this.pause.innerHTML = '';
    const c = el('div', 'card interactive');
    const hunt = (this.playMode ?? this.menuMode) === 'hunt';
    c.append(el('h2', 'heading', hunt ? 'Styring · Kæmpejagt' : 'Styring · Taktisk kamp'), el('div', 'sub', hunt ? 'I Kæmpejagt rammer våbnene præcist, også i fuld fart – det svære er at komme bag kæmperne.' : 'Riffel og pistol spreder mere, når du løber – stå stille eller gå (Shift) for at ramme præcist.'));
    c.insertAdjacentHTML('beforeend', hunt ? (this.touch ? touchControlsHtml('hunt') : huntControlsHtml()) : this.controlsHtml());
    const b = el('button', 'btn', 'Tilbage');
    b.onclick = () => { this.pause.classList.add('hidden'); back?.(); };
    c.append(b);
    this.pause.append(c);
    this.pause.classList.remove('hidden');
  }

  private showSettings(back: (() => void) | null) {
    const s = this.settings;
    this.pause.innerHTML = '';
    const c = el('div', 'card interactive');
    c.append(el('h2', 'heading', 'Indstillinger'), el('div', 'sub', 'Gemmes i din browser.'));
    const slider = (name: string, min: number, max: number, step: number, val: number, fmt: (v: number) => string, set: (v: number) => void) => {
      const row = el('div', 'setting');
      const inp = el('input') as HTMLInputElement;
      inp.type = 'range'; inp.min = String(min); inp.max = String(max); inp.step = String(step); inp.value = String(val);
      const v = el('span', 'v', fmt(val));
      inp.oninput = () => { const x = +inp.value; v.textContent = fmt(x); set(x); this.cb.settings(s); };
      row.append(el('span', '', name), inp, v);
      c.append(row);
    };
    slider('Musefølsomhed', 0.2, 3, 0.05, s.sensitivity, (v) => v.toFixed(2), (v) => (s.sensitivity = v));
    slider('Lydstyrke', 0, 1, 0.05, s.volume, (v) => `${Math.round(v * 100)}`, (v) => (s.volume = v));
    slider('Synsfelt', 65, 100, 1, s.fov, (v) => `${v}°`, (v) => (s.fov = v));
    const q = el('div', 'setting');
    const seg = el('div', 'seg');
    for (const k of [0, 1, 2] as Quality[]) {
      const b = el('button', k === s.quality ? 'on' : '', QUALITY_NAME[k]);
      b.onclick = () => { s.quality = k; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); this.cb.settings(s); };
      seg.append(b);
    }
    q.append(el('span', '', 'Grafik'), seg, el('span', 'v', ''));
    c.append(q);
    const sq = el('div', 'setting');
    const sseg = el('div', 'seg');
    for (const [k, n] of [['auto', 'Auto'], ['lav', 'Lav'], ['mellem', 'Mellem'], ['hoj', 'Høj']] as [Settings['sharp'], string][]) {
      const b = el('button', k === s.sharp ? 'on' : '', n);
      b.dataset.sharp = k;
      b.onclick = () => { s.sharp = k; sseg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); this.cb.settings(s); };
      sseg.append(b);
    }
    sq.append(el('span', '', 'Skarphed'), sseg, el('span', ''));
    sq.title = 'Hvor mange pixels der tegnes. Auto: så skarpt som telefonen/computeren kan nå med jævn billedhastighed.';
    c.append(sq);
    const inv = el('div', 'setting');
    const cb = el('input') as HTMLInputElement;
    cb.type = 'checkbox'; cb.checked = s.invertY;
    cb.onchange = () => { s.invertY = cb.checked; this.cb.settings(s); };
    inv.append(el('span', '', 'Omvendt mus (Y)'), cb, el('span', ''));
    c.append(inv);
    const tq = el('div', 'setting');
    const tseg = el('div', 'seg');
    for (const [k, n] of [['auto', 'Auto'], ['on', 'Til'], ['off', 'Fra']] as const) {
      const b = el('button', k === s.touch ? 'on' : '', n);
      b.onclick = () => { s.touch = k; tseg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); this.cb.settings(s); };
      tseg.append(b);
    }
    tq.append(el('span', '', 'Touch-knapper'), tseg, el('span', ''));
    c.append(tq);
    const bq = el('div', 'setting');
    const bseg = el('div', 'seg');
    for (const [k, n] of [['lille', 'Små'], ['normal', 'Normale'], ['stor', 'Store']] as const) {
      const b = el('button', k === s.buttons ? 'on' : '', n);
      b.onclick = () => { s.buttons = k; bseg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); this.cb.settings(s); };
      bseg.append(b);
    }
    bq.append(el('span', '', 'Knapstørrelse'), bseg, el('span', ''));
    c.append(bq);
    const rq = el('div', 'setting');
    const rseg = el('div', 'seg');
    for (const [k, n] of [['auto', 'Auto-skyd'], ['skyd', 'Kig + skyd'], ['kig', 'Kun kig']] as const) {
      const b = el('button', k === s.rightTouch ? 'on' : '', n);
      b.dataset.right = k;
      b.onclick = () => { s.rightTouch = k; rseg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); this.cb.settings(s); };
      rseg.append(b);
    }
    rq.append(el('span', '', 'Højre side (touch)'), rseg, el('span', ''));
    rq.title = 'Auto-skyd: højre side kigger, og i Kæmpejagt skyder du af dig selv, når sigtekornet er på en kæmpe. Kig + skyd: du skyder, så længe tommelfingeren er på højre side. Kun kig: skyd med SKYD-knappen.';
    c.append(rq);
    const check = (name: string, val: boolean, set: (v: boolean) => void) => {
      const row = el('div', 'setting');
      const x = el('input') as HTMLInputElement;
      x.type = 'checkbox'; x.checked = val;
      x.onchange = () => { set(x.checked); this.cb.settings(s); };
      row.append(el('span', '', name), x, el('span', ''));
      c.append(row);
    };
    check('Vibration (telefon)', s.vibrate, (v) => (s.vibrate = v));
    check('Vis FPS', s.showFps, (v) => (s.showFps = v));
    c.append(el('div', 'sub', 'Lav: ingen skygger og lavere opløsning · Mellem: bløde skygger · Høj: skarpe skygger, skyer og fuld opløsning.'));
    const b = el('button', 'btn', 'Tilbage');
    b.onclick = () => { this.pause.classList.add('hidden'); back?.(); };
    c.append(b);
    this.pause.append(c);
    this.pause.classList.remove('hidden');
  }

  // ================= Intro ved kampstart =================

  showIntro(team: Team) {
    this.intro.innerHTML = '';
    const c = el('div', 'card interactive');
    c.append(el('div', 'label', `Du spiller som ${team === 'A' ? 'angriber' : 'forsvarer'}`), el('h2', 'heading', 'Klar til kamp'));
    const goal = team === 'A'
      ? `Før bomben frem til <b>bombeområdet</b> (det orange felt med A) og plant den med <b>${this.key('E')}</b>. Forsvar den i 40 sekunder – eller eliminér alle forsvarere.`
      : `Forhindr angriberne i at plante bomben. Bliver den plantet, skal den <b>desarmeres</b> (hold <b>${this.key('E')}</b> ved bomben i 5 s) – også hvis alle angribere er døde.`;
    c.append(el('div', `goal team-${teamCls(team)}`, goal));
    c.insertAdjacentHTML('beforeend', this.controlsHtml());
    const b = el('button', 'btn primary', 'Klik for at starte');
    b.onclick = () => this.cb.begin();
    c.append(b);
    this.intro.append(c);
    this.intro.classList.remove('hidden');
  }
  hideIntro() { this.intro.classList.add('hidden'); }

  // ================= Pause =================

  showPause() {
    this.pause.innerHTML = '';
    const c = el('div', 'card interactive');
    c.append(el('h2', 'heading', 'Pause'), el('div', 'sub', this.playMode === 'hunt' ? 'Jagten står stille, mens menuen er åben.' : 'Kampen står stille, mens menuen er åben.'));
    const add = (txt: string, fn: () => void, cls = '') => { const b = el('button', `btn ${cls}`, txt); b.onclick = fn; c.append(b); };
    add('Fortsæt', () => this.cb.resume(), 'primary');
    add('Indstillinger', () => this.showSettings(() => this.showPause()));
    add('Styring', () => this.showControls(() => this.showPause()));
    const res = el('div', 'sub bench', '');
    add('Mål ydelse', () => { res.textContent = 'Måler …'; setTimeout(() => { res.textContent = this.cb.benchmark(); }, 30); }, 'small');
    c.append(res);
    add(this.playMode === 'hunt' ? 'Forlad jagten' : 'Forlad kampen', () => this.cb.quit());
    this.pause.append(c);
    this.pause.classList.remove('hidden');
  }
  hidePause() { this.pause.classList.add('hidden'); }
  get pauseVisible() { return !this.pause.classList.contains('hidden'); }

  // ================= Købsmenu =================

  openBuy(g: Game) {
    this.buyOpen = true;
    this.renderBuy(g, '');
    this.buy.classList.remove('hidden');
  }
  closeBuy() { this.buyOpen = false; this.buy.classList.add('hidden'); }

  /** Opdatér tiden og hvad man har råd til uden at bygge knapperne om */
  refreshBuy(g: Game) {
    const t = this.buy.querySelector('.timer');
    if (t) t.textContent = this.touch ? `Købsfasen slutter om ${Math.ceil(g.phaseT)} s · tryk på det du vil købe` : `Købsfasen slutter om ${Math.ceil(g.phaseT)} s · tryk tallet eller klik · B/Esc lukker`;
    const p = g.human;
    this.buy.querySelectorAll('.item').forEach((b, i) => b.classList.toggle('no', p.money < BUY_ITEMS[i].price));
    const m = this.buy.querySelector('.head .money');
    if (m) m.textContent = `$${p.money}`;
  }

  renderBuy(g: Game, msg: string) {
    const p = g.human;
    const icons = buyIcons();
    this.buy.innerHTML = '';
    const c = el('div', 'card interactive');
    const head = el('div', 'head');
    head.append(el('h2', 'heading', 'Køb'), el('div', 'money', `$${p.money}`));
    c.append(head);
    c.append(el('div', 'timer', g.phase === 'buy' ? this.touch ? `Købsfasen slutter om ${Math.ceil(g.phaseT)} s · tryk på det du vil købe` : `Købsfasen slutter om ${Math.ceil(g.phaseT)} s · tryk tallet eller klik · B/Esc lukker` : 'Købsfasen er slut'));
    const grid = el('div', 'grid');
    for (const it of BUY_ITEMS) {
      const owned = (it.id === 'smg' || it.id === 'rifle') ? p.primary?.id === it.id : it.id === 'vest' ? p.armor >= 100 : it.id === 'blocks' ? p.blocks >= TUNING.maxBlocksCarried : false;
      const b = el('button', `item${p.money < it.price ? ' no' : ''}${owned ? ' owned' : ''}`);
      b.innerHTML = `<span class="kk">${it.key}</span><span class="p">$${it.price}</span>${icons[it.id] ? `<img src="${icons[it.id]}" alt="">` : '<div style="height:64px"></div>'}
        <span class="n">${it.name}</span><span class="d">${owned ? 'Har du allerede' : it.desc}${it.id === 'blocks' ? ` · du har ${p.blocks}` : ''}</span>`;
      b.onclick = () => this.cb.buy(it.id);
      grid.append(b);
    }
    c.append(grid);
    c.append(el('div', 'msg', msg));
    const close = el('button', 'btn small', 'Luk');
    close.onclick = () => this.cb.closeBuy();
    c.append(close);
    this.buy.append(c);
  }

  // ================= Slutskærm =================

  showMatchEnd(g: Game) {
    const win = g.matchWinner === g.humanTeam;
    this.end.innerHTML = '';
    const c = el('div', 'card interactive');
    c.append(el('div', 'label', `${TEAM_NAME[g.matchWinner!]} vinder kampen`));
    const res = el('div', 'res', win ? 'SEJR!' : 'NEDERLAG');
    res.style.color = win ? 'var(--ok)' : 'var(--danger)';
    c.append(res);
    c.append(el('div', 'score', `<span style="color:var(--team-a)">${g.score.A}</span> – <span style="color:var(--team-d)">${g.score.D}</span>`));
    c.append(this.boardTable(g));
    const btns = el('div', 'btns');
    const a = el('button', 'btn primary', 'Spil igen');
    a.onclick = () => this.cb.again();
    const m = el('button', 'btn', 'Hovedmenu');
    m.onclick = () => this.cb.quit();
    btns.append(a, m);
    c.append(btns);
    this.end.append(c);
    this.end.classList.remove('hidden');
  }
  hideMatchEnd() { this.end.classList.add('hidden'); }

  private boardTable(g: Game): HTMLElement {
    const wrap = el('div');
    for (const t of ['A', 'D'] as Team[]) {
      wrap.append(el('div', 'tt', `<span style="color:var(--team-${teamCls(t)})">${TEAM_NAME[t]}</span> <span class="muted">${g.score[t]}</span>`));
      const tb = el('table');
      tb.innerHTML = '<tr><th>Navn</th><th>Drab</th><th>Død</th><th>Penge</th></tr>';
      for (const p of g.players.filter((q) => q.team === t).sort((a, b) => b.kills - a.kills)) {
        const tr = el('tr', `${p.id === g.humanId ? 'me' : ''} ${p.alive ? '' : 'dead'}`);
        tr.innerHTML = `<td class="n">${p.name}${p.hasBomb && t === g.humanTeam ? ' <span class="bombtag">BOMBE</span>' : ''}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${t === g.humanTeam ? '$' + p.money : '–'}</td>`;
        tb.append(tr);
      }
      wrap.append(tb);
    }
    return wrap;
  }

  setBoard(g: Game | null, show: boolean) {
    if (!show || !g) { this.board.classList.add('hidden'); return; }
    this.board.innerHTML = '';
    this.board.append(el('div', 'label', `Runde ${g.round} · Først til ${TUNING.winsToWinMatch}`), this.boardTable(g));
    this.board.classList.remove('hidden');
  }

  // ================= HUD =================

  private buildHud() {
    const H = this.h;
    const radarBox = el('div', 'radarbox panel');
    this.radar = el('canvas');
    this.radar.width = this.radar.height = 190;
    radarBox.append(this.radar);
    H.money = el('div', 'money panel');
    const top = el('div', 'top');
    H.scA = el('div', 'sc a panel');
    H.clock = el('div', 'clock panel');
    H.scD = el('div', 'sc d panel');
    top.append(H.scA, H.clock, H.scD);
    H.pips = el('div', 'pips');
    const vitals = el('div', 'vitals');
    H.hp = el('div', 'vital hp panel');
    H.ar = el('div', 'vital ar panel');
    vitals.append(H.hp, H.ar);
    H.weapon = el('div', 'weapon panel');
    H.slots = el('div', 'slots');
    H.feed = el('div', 'feed');
    H.cross = el('div', 'cross');
    for (let i = 0; i < 4; i++) H.cross.append(el('i'));
    H.cross.append(el('i', 'dot'));
    H.hitm = el('div', 'hitm');
    for (let i = 0; i < 4; i++) { const x = el('i'); x.style.transform = `translate(-50%,-50%) rotate(${45 + i * 90}deg) translateX(9px)`; H.hitm.append(x); }
    H.progress = el('div', 'progress panel hidden', '<div class="t"></div><div class="b"><i></i></div>');
    H.hint = el('div', 'hint panel hidden');
    H.banner = el('div', 'banner', '<div class="big"></div><div class="small"></div>');
    H.hurt = el('div', 'hurt');
    H.dirs = el('div', 'dirs');
    H.spec = el('div', 'spec panel hidden');
    H.note = el('div', 'note');
    this.hud.append(H.hurt, radarBox, H.money, top, H.pips, vitals, H.weapon, H.slots, H.feed, H.cross, H.hitm, H.dirs, H.progress, H.hint, H.banner, H.spec, H.note);
  }

  showHud() { this.hud.classList.remove('hidden'); }
  hideHud() { this.hud.classList.add('hidden'); }

  /** Kort note under sigtekornet (f.eks. hvorfor en blok ikke kan placeres) */
  note(text: string) { this.h.note.textContent = text; this.noteT = 2.2; }

  banner(big: string, small: string, cls = '', dur = 2.6) {
    const b = this.h.banner;
    (b.querySelector('.big') as HTMLElement).className = `big ${cls}`;
    (b.querySelector('.big') as HTMLElement).textContent = big;
    (b.querySelector('.small') as HTMLElement).textContent = small;
    b.classList.add('on');
    this.bannerT = dur;
  }

  hitmarker(kill: boolean) {
    this.h.hitm.classList.toggle('kill', kill);
    this.h.hitm.classList.add('on');
    this.hitT = kill ? 0.3 : 0.12;
  }

  hurt(dmg: number, fromYaw: number | null) {
    this.hurtA = Math.min(1, this.hurtA + dmg / 45);
    if (fromYaw !== null) {
      const e = el('i');
      this.h.dirs.append(e);
      this.dirs.push({ e, t: 1.2, yaw: fromYaw });
    }
  }

  addFeed(g: Game, killer: Player | undefined, victim: Player, weapon: string, head: boolean) {
    const wname = weapon === 'bomb' ? 'bombe' : WEAPONS[weapon as keyof typeof WEAPONS]?.name.split(' ')[0] ?? weapon;
    const d = el('div', killer?.id === g.humanId || victim.id === g.humanId ? 'mine' : '');
    d.innerHTML = `${killer && killer !== victim ? `<span class="${teamCls(killer.team)}">${killer.name}</span>` : ''}<span class="w">${head ? '<span class="hs">HOVED</span>' : ''}${wname}</span><span class="${teamCls(victim.team)}">${victim.name}</span>`;
    this.h.feed.prepend(d);
    this.feed.push({ e: d, t: 6 });
    while (this.feed.length > 5) this.feed.shift()!.e.remove();
  }

  update(g: Game, dt: number, viewYaw: number) {
    const H = this.h;
    const p = g.human;
    // Score og tid
    H.scA.innerHTML = `${g.score.A}<small>${g.humanTeam === 'A' ? 'DIT HOLD' : 'ANGRIB'}</small>`;
    H.scD.innerHTML = `${g.score.D}<small>${g.humanTeam === 'D' ? 'DIT HOLD' : 'FORSVAR'}</small>`;
    let clock = fmtTime(g.roundT), sub = 'RUNDETID';
    H.clock.classList.toggle('bomb', g.phase === 'planted');
    if (g.phase === 'buy') { clock = fmtTime(g.phaseT); sub = 'KØBSFASE'; }
    else if (g.phase === 'planted') { clock = fmtTime(g.bomb.timer); sub = 'BOMBEN ER PLANTET'; }
    else if (g.phase === 'end' || g.phase === 'over') { clock = fmtTime(g.phaseT); sub = 'NÆSTE RUNDE'; }
    H.clock.innerHTML = `${clock}<small>${sub}</small>`;
    H.pips.innerHTML = (['A', 'D'] as Team[]).map((t) => `<div>${g.players.filter((q) => q.team === t).map((q) => `<span class="${q.alive ? '' : 'dead'}" style="background:var(--team-${teamCls(t)})"></span>`).join('')}</div>`).join('');

    // Penge
    if (this.moneyShown !== p.money) {
      const delta = this.moneyShown >= 0 ? p.money - this.moneyShown : 0;
      this.moneyShown = p.money;
      H.money.innerHTML = `$${p.money}${delta > 0 ? `<span class="delta">+${delta}</span>` : ''}`;
      if (delta > 0) this.moneyDeltaT = 2.5;
    }
    if (this.moneyDeltaT > 0) { this.moneyDeltaT -= dt; if (this.moneyDeltaT <= 0) H.money.innerHTML = `$${p.money}`; }

    // Liv og vest
    const watch = p.alive ? p : g.players[this.specId] ?? p;
    H.hp.innerHTML = `<div class="row">${ICON_HP}<span class="num">${Math.max(0, Math.ceil(watch.hp))}</span></div><div class="bar"><i style="width:${Math.max(0, watch.hp)}%"></i></div>`;
    H.hp.classList.toggle('low', watch.alive && watch.hp <= 25);
    H.ar.innerHTML = `<div class="row">${ICON_AR}<span class="num">${Math.ceil(watch.armor)}</span></div><div class="bar"><i style="width:${watch.armor}%"></i></div>`;

    // Våben og ammo
    const ws = g.currentWeaponState(watch);
    let ammo = '', name = '';
    if (watch.slot === 'knife') { ammo = '—'; name = 'Kniv'; }
    else if (watch.slot === 'blocks') { ammo = `${watch.blocks}`; name = 'Byggeblokke'; }
    else if (watch.slot === 'bomb') { ammo = '1'; name = 'Bombe'; }
    else if (ws) { ammo = `${ws.mag}<small> / ${ws.reserve}</small>`; name = WEAPONS[ws.id].name; }
    const low = ws && ws.mag <= WEAPONS[ws.id].mag * 0.25;
    H.weapon.innerHTML = `<div class="ammo${low ? ' low' : ''}">${ammo}</div><div class="name">${watch.reloadT > 0 ? 'Genlader…' : name}</div>`;
    const slots: [string, string, boolean][] = [
      ['1', watch.primary ? WEAPONS[watch.primary.id].name.split(' ')[0] : '', !!watch.primary],
      ['2', 'Pistol', true], ['3', 'Kniv', true],
      ['4', `Blokke ×${watch.blocks}`, watch.blocks > 0], ['5', 'Bombe', watch.hasBomb],
    ];
    const cur = { primary: '1', pistol: '2', knife: '3', blocks: '4', bomb: '5' }[watch.slot];
    H.slots.innerHTML = slots.filter((s) => s[2]).map((s) => `<div class="${s[0] === cur ? 'on' : ''}"><b>${s[0]}</b>${s[1]}</div>`).join('');

    // Sigtekorn: afstand = spredning
    const spread = p.alive ? g.spreadDeg(p) : 0;
    const gap = 4 + spread * 4.2;
    const lines = H.cross.querySelectorAll('i');
    const len = 7;
    const set = (i: number, x: number, y: number, w: number, h: number) => { const s = (lines[i] as HTMLElement).style; s.left = `${x}px`; s.top = `${y}px`; s.width = `${w}px`; s.height = `${h}px`; };
    set(0, -1, -gap - len, 2, len); set(1, -1, gap, 2, len); set(2, -gap - len, -1, len, 2); set(3, gap, -1, len, 2);
    H.cross.style.display = p.alive && (p.slot !== 'blocks') ? '' : 'none';
    (lines[4] as HTMLElement).style.display = p.slot === 'knife' ? 'none' : '';

    // Træfmarkør
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) H.hitm.classList.remove('on'); }
    // Skade
    this.hurtA = Math.max(0, this.hurtA - dt * 1.4);
    H.hurt.style.opacity = String(this.hurtA);
    for (let i = this.dirs.length - 1; i >= 0; i--) {
      const d = this.dirs[i];
      d.t -= dt;
      const rel = -(d.yaw - viewYaw);
      d.e.style.transform = `rotate(${rel}rad)`;
      d.e.style.opacity = String(Math.min(1, d.t));
      if (d.t <= 0) { d.e.remove(); this.dirs.splice(i, 1); }
    }
    // Drabsliste
    for (let i = this.feed.length - 1; i >= 0; i--) {
      const f = this.feed[i];
      f.t -= dt;
      if (f.t < 0.5) f.e.style.opacity = String(Math.max(0, f.t * 2));
      if (f.t <= 0) { f.e.remove(); this.feed.splice(i, 1); }
    }
    // Banner
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) H.banner.classList.remove('on'); }
    if (this.noteT > 0) { this.noteT -= dt; H.note.style.opacity = String(Math.min(1, this.noteT * 2)); }

    // Fremskridt for plantning/desarmering
    const act = watch.action;
    if (act && watch.alive) {
      const tot = act.kind === 'plant' ? TUNING.plantTime : TUNING.defuseTime;
      H.progress.classList.remove('hidden');
      (H.progress.querySelector('.t') as HTMLElement).textContent = `${act.kind === 'plant' ? 'Planter bomben' : 'Desarmerer'} · ${(tot - act.t).toFixed(1).replace('.', ',')} s`;
      (H.progress.querySelector('i') as HTMLElement).style.width = `${(act.t / tot) * 100}%`;
      (H.progress.querySelector('i') as HTMLElement).style.background = act.kind === 'plant' ? 'var(--team-a)' : 'var(--team-d)';
    } else {
      // vis også holdkammeratens desarmering
      const other = g.players.find((q) => q.alive && q.action && q.team === g.humanTeam && q !== watch);
      if (other && other.action) {
        const tot = other.action.kind === 'plant' ? TUNING.plantTime : TUNING.defuseTime;
        H.progress.classList.remove('hidden');
        (H.progress.querySelector('.t') as HTMLElement).textContent = `${other.name} ${other.action.kind === 'plant' ? 'planter' : 'desarmerer'}`;
        (H.progress.querySelector('i') as HTMLElement).style.width = `${(other.action.t / tot) * 100}%`;
      } else H.progress.classList.add('hidden');
    }

    // Hjælpetekst
    let hint = '', warn = false;
    if (p.alive) {
      if (g.phase === 'buy') hint = this.buyOpen ? '' : `Købsfase – tryk <b>${this.key('B')}</b> for at købe`;
      else if (p.hasBomb && g.phase === 'live') {
        hint = g.inSite(p) ? `Hold <b>${this.key('E')}</b> for at plante bomben` : 'Du har bomben – før den til bombeområdet <b>A</b>';
      } else if (p.slot === 'blocks') hint = `Venstreklik: placér sandsæk (${p.blocks} tilbage) · man kan ikke bygge i spawn eller på bombeområdet`;
      else if (p.team === 'D' && g.phase === 'planted' && g.bomb.state === 'planted') {
        const d = Math.hypot(p.body.pos.x - g.bomb.pos.x, p.body.pos.z - g.bomb.pos.z);
        hint = d <= TUNING.defuseRange ? `Hold <b>${this.key('E')}</b> for at desarmere` : 'Bomben er plantet – find den og desarmér';
        warn = true;
      } else if (p.team === 'A' && g.bomb.state === 'dropped' && g.phase === 'live') { hint = 'Bomben er tabt – saml den op'; warn = true; }
    }
    H.hint.innerHTML = hint;
    H.hint.classList.toggle('hidden', !hint);
    H.hint.classList.toggle('warn', warn);

    // Tilskuer
    if (!p.alive && g.phase !== 'over') {
      const s = g.players[this.specId];
      H.spec.classList.remove('hidden');
      H.spec.innerHTML = s && s !== p ? `Du er død · ser <b>${s.name}</b> · klik for at skifte · næste runde starter automatisk` : 'Du er død · venter på næste runde';
    } else H.spec.classList.add('hidden');

    this.drawRadar(g, viewYaw, watch);
  }

  // ================= Radar =================

  private buildRadarImage(g: Game, scale: number) {
    const w = g.world, m = g.map;
    const c = el('canvas');
    c.width = w.sx * scale; c.height = w.sz * scale;
    const ctx = c.getContext('2d')!;
    for (let z = 0; z < w.sz; z++) for (let x = 0; x < w.sx; x++) {
      const ch = m.cols[z][x];
      let col = '#cbb78c';
      if (ch === 'B' || ch === '#' || ch === 'P') col = '#2a2722';
      else if (ch === 'r' || ch === 'X') col = '#8d8a83';
      else if (inRect(m.site, x, z)) col = '#c9683e';
      else if (inRect(m.zoneA, x, z)) col = '#d79c62';
      else if (inRect(m.zoneD, x, z)) col = '#8aa3c8';
      else if (ch === '.' || ch === 't') col = '#a9b878';
      if (ch === 'c' || ch === 'k' || ch === 'w' || ch === 'f') col = '#8a6a40';
      if (ch === 'X') col = '#b5874c';
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, z * scale, scale, scale);
    }
    return c;
  }

  drawMinimap(c: HTMLCanvasElement, g: Game, scale: number) {
    const img = this.buildRadarImage(g, scale);
    c.width = img.width; c.height = img.height;
    c.getContext('2d')!.drawImage(img, 0, 0);
  }

  private drawRadar(g: Game, yaw: number, me: Player) {
    if (!this.radarImg) this.radarImg = this.buildRadarImage(g, 4);
    const c = this.radar, ctx = c.getContext('2d')!;
    const S = 4, R = c.width / 2;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, c.width, c.height); ctx.clip();
    ctx.fillStyle = '#1b1915'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(R, R);
    ctx.rotate(yaw);
    ctx.translate(-me.body.pos.x * S, -me.body.pos.z * S);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.radarImg, 0, 0);
    ctx.globalAlpha = 1;
    // Bombeområdets bogstav
    const sc = { x: (g.map.site.x0 + g.map.site.x1 + 1) / 2, z: (g.map.site.z0 + g.map.site.z1 + 1) / 2 };
    ctx.save(); ctx.translate(sc.x * S, sc.z * S); ctx.rotate(-yaw);
    ctx.fillStyle = '#fff1d0'; ctx.font = 'bold 18px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('A', 0, 0); ctx.restore();
    const dot = (x: number, z: number, col: string, r = 4, ring = '#000') => { ctx.beginPath(); ctx.arc(x * S, z * S, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = ring; ctx.stroke(); };
    for (const q of g.players) {
      if (!q.alive || q === me) continue;
      if (q.team === g.humanTeam) dot(q.body.pos.x, q.body.pos.z, q.team === 'A' ? '#f07a32' : '#4a90f0', 4, '#fff');
      else if (this.spotted.has(q.id)) dot(q.body.pos.x, q.body.pos.z, '#ff3b30', 4, '#000');
    }
    // Bomben
    const bomb = g.bomb;
    const showBomb = g.humanTeam === 'A' || bomb.state === 'planted' || (bomb.state === 'dropped' && this.spotted.has(-1));
    if (showBomb && bomb.state !== 'exploded' && bomb.state !== 'defused' && (bomb.state !== 'planted' || Math.floor(performance.now() / 300) % 2 === 0)) {
      ctx.save(); ctx.translate(bomb.pos.x * S, bomb.pos.z * S); ctx.rotate(-yaw);
      ctx.fillStyle = bomb.state === 'planted' ? '#ff3b30' : '#f2c14e';
      ctx.fillRect(-4, -3, 8, 6); ctx.strokeStyle = '#000'; ctx.strokeRect(-4, -3, 8, 6);
      ctx.restore();
    }
    ctx.restore();
    // Mig selv: pil i midten
    ctx.save(); ctx.translate(R, R);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(242,193,78,0.35)'; ctx.strokeRect(0.5, 0.5, c.width - 1, c.height - 1);
  }

  resetMatch() {
    this.radarImg = null;
    this.moneyShown = -1;
    this.feed.forEach((f) => f.e.remove());
    this.feed = [];
    this.h.banner.classList.remove('on');
  }

  // ================= Hændelser fra spillet =================

  onEvent(e: GameEvent, g: Game) {
    const me = g.human;
    switch (e.type) {
      case 'roundStart': {
        const obj = g.humanTeam === 'A' ? 'Plant bomben på A' : 'Forsvar bombeområdet A';
        this.banner(`RUNDE ${e.round}`, `${obj} · tryk ${this.key('B')} for at købe`, '', 3);
        break;
      }
      case 'live': this.banner('AFSTED!', g.humanTeam === 'A' ? 'Gå efter bombeområdet' : 'Tag jeres positioner', '', 1.4); break;
      case 'planted': this.banner('BOMBEN ER PLANTET', g.humanTeam === 'D' ? 'Find den og desarmér den – 40 sekunder' : 'Forsvar den i 40 sekunder', 'red', 3); break;
      case 'defused': this.banner('BOMBEN ER DESARMERET', '', 'd', 3); break;
      case 'roundEnd': {
        const win = e.winner === g.humanTeam;
        this.banner(`${TEAM_NAME[e.winner].toUpperCase()} VINDER`, `${REASON_TEXT[e.reason](e.winner)} · ${win ? 'runden er jeres' : 'runden er tabt'}`, teamCls(e.winner), 4.6);
        break;
      }
      case 'kill': {
        const k = g.players[e.killer], v = g.players[e.victim];
        this.addFeed(g, k, v, e.weapon, e.head);
        if (e.killer === me.id && e.victim !== me.id) this.hitmarker(true);
        if (e.victim === me.id) {
          // Find en holdkammerat at se på
          const mate = g.players.find((q) => q.alive && q.team === me.team);
          this.specId = mate ? mate.id : me.id;
        }
        if (v.id === this.specId && v.id !== me.id) {
          const mate = g.players.find((q) => q.alive && q.team === me.team);
          if (mate) this.specId = mate.id;
        }
        break;
      }
      case 'hit':
        if (e.attacker === me.id && e.target !== me.id && g.players[e.target].alive) this.hitmarker(false);
        break;
      case 'message':
        if (e.pid === me.id) this.note(e.text);
        break;
    }
  }

  cycleSpectate(g: Game) {
    const mates = g.players.filter((q) => q.alive && q.team === g.humanTeam);
    const pool = mates.length ? mates : g.players.filter((q) => q.alive);
    if (!pool.length) return;
    const i = pool.findIndex((q) => q.id === this.specId);
    this.specId = pool[(i + 1) % pool.length].id;
  }
}
