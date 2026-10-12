// Brugerflade for Kæmpejagt: HUD (bølge, kæmper tilbage, liv, gas, ammo, krogens afstand, radar),
// styrings-kort ved start og sejr-/nederlagsskærm. Al tekst er på dansk.
import { HUNT } from '../config/hunt';
import { WEAPONS } from '../config/weapons';
import { BLOCKS, B } from '../core/blocks';
import { yawPitchTo } from '../core/math';
import type { Hunt, HuntEvent } from '../hunt/hunt';
import type { CityMap } from '../hunt/city';
import { GATE_REPAIR, UPGRADES, UPGRADE_MAX, type UpgradeId } from '../hunt/progress';
import type { HuntRecord } from '../game/records';
import type { Giant, GiantVariant } from '../hunt/giant';

const VARIANT_NAME: Record<GiantVariant, string> = { clay: 'Lerkæmpe', stone: 'Stenkæmpe', mountain: 'Bjergkæmpe', sea: 'Havkæmpe', runner: 'Løberkæmpe', thrower: 'Kaster' };
const GIANT_NAME = (g: Giant) => VARIANT_NAME[g.variant];
/** "2 lerkæmper · 1 løber" – bølgens sammensætning */
function waveText(plan: { variant?: GiantVariant; big: boolean }[]) {
  const n: Partial<Record<GiantVariant, number>> = {};
  for (const s of plan) { const v = s.variant ?? (s.big ? 'stone' : 'clay'); n[v] = (n[v] ?? 0) + 1; }
  const word: Record<GiantVariant, [string, string]> = { clay: ['lerkæmpe', 'lerkæmper'], stone: ['stenkæmpe', 'stenkæmper'], mountain: ['Bjergkæmpen', 'Bjergkæmpen'], sea: ['Havkæmpen', 'Havkæmpen'], runner: ['løber', 'løbere'], thrower: ['kaster', 'kastere'] };
  return (Object.keys(n) as GiantVariant[]).map((v) => v === 'mountain' || v === 'sea' ? word[v][0] : `${n[v]} ${word[v][n[v] === 1 ? 0 : 1]}`).join(' · ');
}
const fmtN = (n: number) => Math.round(n).toLocaleString('da-DK');

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const fmtTime = (s: number) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Touch-styringen forklaret (telefon/tablet) */
export function touchControlsHtml(mode: 'hunt' | 'tactical') {
  const common = `<span class="k">VENSTRE</span><span>Sæt tommelfingeren på venstre side og træk: <b>gå/løb</b> (og styr i luften)</span>
    <span class="k">HØJRE</span><span>Træk på højre side for at <b>kigge og sigte</b> – også mens du holder SKYD${mode === 'hunt' ? ' eller KROG' : ''} nede</span>`;
  const hunt = `<span class="k">KROG</span><span><b>Hold</b>: krogen sidder fast, slip for at løsne · <b>SPOL</b> spoler hurtigt ind</span>
    <span class="k">BOOST</span><span>Hop · hold i luften: gas-boost i sigteretningen · <b>BREMS</b> tager farten og landingen</span>
    <span class="k">SKYD</span><span>Hold for at skyde · <b>↻</b> genlad · <b>⇄</b> skift våben</span>
    <span class="k">OPGRADÉR</span><span>Mellem bølgerne: køb opgraderinger for dine mønter</span>`;
  const tact = `<span class="k">SKYD</span><span>Hold for at skyde · <b>HOP</b> · <b>HUK</b> · <b>↻</b> genlad · <b>⇄</b> skift våben</span>
    <span class="k">BRUG</span><span>Hold for at plante bomben / desarmere · <b>KØB</b> i købsfasen · <b>TAVLE</b> resultater</span>`;
  return `<div class="keys">${common}${mode === 'hunt' ? hunt : tact}<span class="k">II</span><span>Pause</span></div>`;
}

export function huntControlsHtml() {
  return `<div class="keys">
    <span class="k">HØJRE MUS</span><span><b>Hold</b>: skyd krogen ud og hæng i wiren · slip for at løsne den</span>
    <span class="k">SHIFT</span><span>Spol wiren hurtigt ind (bruger gas)</span>
    <span class="k">MELLEMRUM</span><span>Hop · i luften: <b>hold</b> for gas-boost i sigteretningen</span>
    <span class="k">G (hold)</span><span>Bremse-dyser: bremser farten og tager en hård landing (bruger gas)</span>
    <span class="k">W A S D</span><span>Løb · i luften: styr · i wiren: sving og pump farten op</span>
    <span class="k">VENSTRE MUS</span><span>Skyd · <b>R</b> genlad · <b>1 / 2</b> riffel / pistol (også <b>Q</b> og musehjul)</span>
    <span class="k">B</span><span>Mellem bølgerne: opgraderinger (gas, krog, våben, rustning) for dine mønter</span>
    <span class="k">ESC</span><span>Pause (frigiver musen)</span>
  </div>`;
}

/** Kort over byen set fra oven: tagenes farve, mørkere jo lavere */
export function drawCityMap(c: HTMLCanvasElement, city: CityMap, scale: number) {
  const w = city.world;
  c.width = w.sx * scale; c.height = w.sz * scale;
  const ctx = c.getContext('2d')!;
  for (let z = 0; z < w.sz; z++) for (let x = 0; x < w.sx; x++) {
    let y = w.sy - 1;
    while (y > 0 && w.get(x, y, z) === B.AIR) y--;
    const b = w.get(x, y, z);
    let col = BLOCKS[b]?.color ?? 0x888888;
    if (city.water && city.water[z * w.sx + x] && y <= 1) col = 0x3f7fb5;
    const k = y <= 1 ? 0.62 : 0.72 + Math.min(1, y / 30) * 0.45;
    const r = Math.min(255, ((col >> 16) & 255) * k), g = Math.min(255, ((col >> 8) & 255) * k), bl = Math.min(255, (col & 255) * k);
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${bl | 0})`;
    ctx.fillRect(x * scale, z * scale, scale, scale);
  }
  return c;
}

export interface HuntUICallbacks {
  begin(): void; again(): void; menu(): void;
  buy(id: UpgradeId | 'repair'): void;
  skip(): void;
  closeShop(): void;
}

export class HuntUI {
  private hud = el('div', 'hidden');
  private intro = el('div', 'overlay hidden');
  private end = el('div', 'overlay hidden');
  private shop = el('div', 'overlay hidden');
  /** Opgraderingsmenuen er åben (simuleringen står stille imens) */
  shopOpen = false;
  private h: Record<string, HTMLElement> = {};
  private radar!: HTMLCanvasElement;
  private radarImg: HTMLCanvasElement | null = null;
  private hitT = 0;
  private hurtA = 0;
  private dirs: { e: HTMLElement; t: number; yaw: number }[] = [];
  private bannerT = 0;
  private noteT = 0;
  private popT = 0;
  private bossId = -1;
  private bossT = 0;
  private speedA = 0;
  private gateNoteT = -99;
  private coinT = 0;
  /** Kæmpetyper man allerede har fået forklaret i denne jagt */
  private seen = new Set<GiantVariant>();
  /** Touch-styring (telefon/tablet) */
  touch = false;

  constructor(private cb: HuntUICallbacks) {
    const root = document.getElementById('ui')!;
    this.hud.id = 'hunthud';
    this.intro.id = 'huntintro';
    this.end.id = 'huntend';
    this.shop.id = 'huntshop';
    root.prepend(this.hud); // under pausemenuen
    root.append(this.intro, this.shop, this.end);
    this.buildHud();
  }

  private buildHud() {
    const H = this.h;
    H.speed = el('div', 'speedfx');
    H.hurt = el('div', 'hurt');
    const radarBox = el('div', 'radarbox panel');
    this.radar = el('canvas');
    this.radar.width = this.radar.height = 190;
    radarBox.append(this.radar);
    H.wave = el('div', 'wave panel');
    H.boss = el('div', 'boss hidden', '<div class="n"></div><div class="b"><i></i></div>');
    H.gate = el('div', 'gatebar panel hidden', '<div class="n">BORGPORTEN</div><div class="b"><i></i></div>');
    const vitals = el('div', 'vitals');
    H.hp = el('div', 'vital hp panel');
    H.gas = el('div', 'vital gas panel');
    vitals.append(H.hp, H.gas);
    H.weapon = el('div', 'weapon panel');
    H.slots = el('div', 'slots');
    H.cross = el('div', 'cross');
    for (let i = 0; i < 4; i++) H.cross.append(el('i'));
    H.cross.append(el('i', 'dot'));
    H.hook = el('div', 'hookd');
    H.hitm = el('div', 'hitm');
    for (let i = 0; i < 4; i++) { const x = el('i'); x.style.transform = `translate(-50%,-50%) rotate(${45 + i * 90}deg) translateX(9px)`; H.hitm.append(x); }
    H.pop = el('div', 'pop');
    H.flight = el('div', 'flight');
    H.warns = el('div', 'warns');
    H.dirs = el('div', 'dirs');
    H.banner = el('div', 'banner', '<div class="big"></div><div class="small"></div>');
    H.note = el('div', 'note');
    H.dead = el('div', 'spec panel hidden');
    H.shopHint = el('div', 'shophint hidden');
    this.hud.append(H.speed, H.hurt, radarBox, H.wave, H.gate, H.boss, vitals, H.weapon, H.slots, H.cross, H.hook, H.hitm, H.pop, H.flight, H.warns, H.dirs, H.banner, H.note, H.shopHint, H.dead);
  }

  // ---------- Skærme ----------

  showIntro(h: Hunt, diffName = 'Normal') {
    this.intro.innerHTML = '';
    const c = el('div', 'card interactive');
    const city = h.city, waves = h.waves.length;
    c.append(el('div', 'label', `Kæmpejagt · ${city.name} · ${diffName}`), el('h2', 'heading', 'Kæmperne kommer'));
    const tal = ['', 'Én', 'To', 'Tre', 'Fire', 'Fem', 'Seks'][waves] ?? `${waves}`;
    const from = city.id === 'saltvig' ? 'bjergpassene – og vadende ind fra havet gennem sundet' : city.id === 'ravnsdalen' ? 'bjergpassene' : 'byportene';
    const goal = city.gate
      ? `De går efter <b>${city.gate.name}</b> – falder den, er ${city.id === 'ravnsdalen' ? 'dalen' : 'byen'} tabt. Skyd på dem for at lokke dem væk fra porten.${city.dayCycle ? ' Dagen går, mens du kæmper, og den sidste bølge kommer om natten.' : ''}`
      : 'Fæld dem alle.';
    c.append(el('div', 'goal hunt', `${tal} bølger af kæmper bryder ind gennem ${from}. ${goal}
      Den <b>glødende krystal i nakken</b> tager firedobbelt skade – kom op bag dem med krogen.
      Skud mod benene sender dem i knæ. <b>Rødt ! over hovedet</b> = slag på vej: kom væk fra hånden.
      <b>Gult !</b> = stenkast: søg dækning bag et hus. <b>Orange !</b> = løberkæmpen springer: kom ud af den orange ring. Grønne lyssøjler er <b>forsyninger</b> (ammo, gas, liv).
      Fældede kæmper giver <b>mønter</b> – brug dem på opgraderinger mellem bølgerne (<b>${this.touch ? 'OPGRADÉR' : 'B'}</b>).`));
    c.insertAdjacentHTML('beforeend', this.touch ? touchControlsHtml('hunt') : huntControlsHtml());
    const b = el('button', 'btn primary', 'Klik for at starte');
    b.onclick = () => this.cb.begin();
    c.append(b);
    this.intro.append(c);
    this.intro.classList.remove('hidden');
  }
  hideIntro() { this.intro.classList.add('hidden'); }

  showEnd(h: Hunt, rank = -1, records: HuntRecord[] = []) {
    const won = h.phase === 'won';
    const s = h.stats;
    this.end.innerHTML = '';
    const c = el('div', 'card interactive');
    c.append(el('div', 'label', `${won ? `${h.city.name} er reddet` : `${h.lostReason === 'gate' ? `${h.city.gate?.name ?? 'Porten'} faldt` : 'Du faldt'} i bølge ${Math.max(1, h.wave)} af ${h.waves.length}`} · ${h.diff.name}`));
    const res = el('div', 'res', won ? 'SEJR!' : 'NEDERLAG');
    res.style.color = won ? 'var(--ok)' : 'var(--danger)';
    c.append(res);
    c.append(el('div', 'points', `${fmtN(h.score)}<small> point</small>${rank === 0 ? '<b class="new">NY REKORD!</b>' : rank > 0 ? `<b class="place">${rank + 1}. plads</b>` : ''}`));
    if (h.bonus.length) c.append(el('div', 'bonus', h.bonus.map((b) => `${b.label} <b>+${fmtN(b.pts)}</b>`).join(' · ')));
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
    const total = h.waves.reduce((a, w) => a + w.length, 0);
    const grid = el('div', 'stats');
    const row = (n: string, v: string) => grid.append(el('span', 'n', n), el('span', 'v', v));
    row('Kæmper fældet', `${s.kills} / ${total}`);
    row('Tid', fmtTime(s.time));
    row('Træf i nakken', `${s.weakHits}`);
    row('Træfsikkerhed', `${acc} %`);
    row('Skade taget', `${Math.round(s.damageTaken)}`);
    c.append(grid);
    if (records.length) {
      const tb = el('table', 'recs');
      tb.innerHTML = `<tr><th colspan="4">Rekorder · ${h.city.name} · ${h.diff.name}</th></tr>` + records.map((r, i) =>
        `<tr class="${i === rank ? 'me' : ''}"><td>${i + 1}.</td><td class="s">${fmtN(r.score)}</td><td>${r.won ? 'Sejr' : `Bølge ${r.wave}/${r.waves}`}</td><td>${r.date.split('-').reverse().join('.')}</td></tr>`).join('');
      c.append(tb);
    }
    const btns = el('div', 'btns');
    const a = el('button', 'btn primary', 'Prøv igen');
    a.onclick = () => this.cb.again();
    const m = el('button', 'btn', 'Hovedmenu');
    m.onclick = () => this.cb.menu();
    btns.append(a, m);
    c.append(btns);
    this.end.append(c);
    this.end.classList.remove('hidden');
  }

  showHud() { this.hud.classList.remove('hidden'); }
  /** Skjul alt fra Kæmpejagt (ved skift til menu eller anden spiltype) */
  hideAll() {
    this.closeShop();
    this.hud.classList.add('hidden');
    this.intro.classList.add('hidden');
    this.end.classList.add('hidden');
  }

  reset() {
    this.radarImg = null;
    this.coinT = 0;
    this.seen.clear();
    this.hurtA = 0; this.hitT = 0; this.bannerT = 0; this.noteT = 0; this.popT = 0; this.bossT = 0; this.bossId = -1;
    this.dirs.forEach((d) => d.e.remove());
    this.dirs = [];
    this.h.banner.classList.remove('on');
    this.h.hitm.classList.remove('on');
    this.h.pop.classList.remove('on');
    this.h.dead.classList.add('hidden');
  }

  // ---------- Opgraderinger (mellem bølgerne) ----------

  openShop(h: Hunt) {
    this.shopOpen = true;
    this.renderShop(h, '');
    this.shop.classList.remove('hidden');
  }
  closeShop() { this.shopOpen = false; this.shop.classList.add('hidden'); }

  renderShop(h: Hunt, msg: string) {
    this.shop.innerHTML = '';
    const c = el('div', 'card interactive');
    const head = el('div', 'head');
    head.append(el('h2', 'heading', 'Opgraderinger'), el('div', 'money', `◆ ${h.coins}`));
    c.append(head);
    c.append(el('div', 'timer', `${h.wave === 0 ? 'Første bølge' : `Bølge ${h.wave + 1}`} om ${Math.ceil(h.phaseT)} s · tiden står stille, mens menuen er åben`));
    const grid = el('div', 'grid');
    UPGRADES.forEach((u, i) => {
      const lv = h.up[u.id], max = lv >= UPGRADE_MAX, cost = h.upgradeCost(u.id);
      const b = el('button', `item${max ? ' owned' : h.coins < cost ? ' no' : ''}`);
      b.dataset.up = u.id;
      const pips = Array.from({ length: UPGRADE_MAX }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
      b.innerHTML = `${this.touch ? '' : `<span class="kk">${i + 1}</span>`}<span class="p">${max ? 'MAKS' : `◆ ${cost}`}</span>
        <span class="n">${u.name}</span><span class="lv">${pips}</span><span class="d">${max ? u.effect(lv) : `Næste: ${u.effect(lv + 1)}`}</span>`;
      b.onclick = () => this.cb.buy(u.id);
      grid.append(b);
    });
    if (h.gate) {
      const g = h.gate, can = h.canRepairGate();
      const b = el('button', `item gate${!can ? ' owned' : h.coins < GATE_REPAIR.cost ? ' no' : ''}`);
      b.dataset.up = 'repair';
      b.innerHTML = `${this.touch ? '' : `<span class="kk">6</span>`}<span class="p">◆ ${GATE_REPAIR.cost}</span>
        <span class="n">Reparér porten</span><span class="lv gatehp"><i style="width:${(g.hp / g.maxHp) * 100}%"></i></span><span class="d">${can ? `+${GATE_REPAIR.amount * 100} % liv til ${h.city.gate!.name} (nu ${Math.round((g.hp / g.maxHp) * 100)} %)` : 'Porten er hel'}</span>`;
      b.onclick = () => this.cb.buy('repair');
      grid.append(b);
    }
    c.append(grid);
    c.append(el('div', 'msg', msg));
    const btns = el('div', 'btns');
    const go = el('button', 'btn primary', `Start bølgen nu${this.touch ? '' : ' <span class="key">ENTER</span>'}`);
    go.onclick = () => this.cb.skip();
    const close = el('button', 'btn', `Luk${this.touch ? '' : ' <span class="key">B</span>'}`);
    close.onclick = () => this.cb.closeShop();
    btns.append(go, close);
    c.append(btns);
    this.shop.append(c);
  }

  // ---------- Små signaler ----------

  banner(big: string, small: string, cls = '', dur = 2.6) {
    const b = this.h.banner;
    (b.querySelector('.big') as HTMLElement).className = `big ${cls}`;
    (b.querySelector('.big') as HTMLElement).textContent = big;
    (b.querySelector('.small') as HTMLElement).textContent = small;
    b.classList.add('on');
    this.bannerT = dur;
  }
  note(text: string) { this.h.note.textContent = text; this.noteT = 2.2; }
  private hitmarker(kind: 'hit' | 'weak' | 'kill') {
    const m = this.h.hitm;
    m.classList.toggle('kill', kind === 'kill');
    m.classList.toggle('weak', kind === 'weak');
    m.classList.add('on');
    this.hitT = kind === 'hit' ? 0.12 : 0.3;
  }
  private popup(text: string, cls: string) {
    const p = this.h.pop;
    p.textContent = text;
    p.className = `pop on ${cls}`;
    this.popT = 0.9;
  }

  onEvent(e: HuntEvent, h: Hunt) {
    switch (e.type) {
      case 'hitGiant':
        if (e.kill) this.hitmarker('kill'); // teksten kommer med mønterne
        else if (e.weak) { this.hitmarker('weak'); this.popup(`SVAGT PUNKT  −${e.dmg}`, 'weak'); }
        else this.hitmarker('hit');
        this.bossId = e.id; this.bossT = 4;
        break;
      case 'hurt': {
        this.hurtA = Math.min(1, this.hurtA + e.dmg / 40);
        if (e.from) {
          const yaw = yawPitchTo(h.player.body.pos, e.from).yaw;
          const d = el('i');
          this.h.dirs.append(d);
          this.dirs.push({ e: d, t: 1.3, yaw });
        }
        break;
      }
      case 'impact': this.note(`Hårdt sammenstød (−${e.dmg}) – brems med ${this.touch ? 'BREMS' : 'G'}`); break;
      case 'hookMiss': this.note('Krogen når ikke så langt'); break;
      case 'depot': this.note('Forsyninger: fuld ammo og gas, +30 liv'); break;
      case 'waveStart': {
        const plan = h.waves[e.wave - 1], last = e.wave === h.waves.length;
        const sub = `${last && h.city.gate ? 'Natten falder på – ' : ''}${waveText(plan)}`;
        this.banner(`BØLGE ${e.wave}`, sub, last ? 'red' : '', 3.2);
        break;
      }
      case 'waveClear':
        if (e.wave < h.waves.length) this.banner('BØLGEN ER SLÅET', `+40 ◆ · ${this.touch ? 'tryk OPGRADÉR' : 'tryk B'} for opgraderinger${h.gate ? ' · porten repareres' : ''}`, 'ok', 3.6);
        break;
      case 'coins':
        if (e.why === 'kill') this.popup(`KÆMPE FÆLDET  +${e.amount} ◆`, 'kill');
        this.coinT = 0.6;
        break;
      case 'giantSpawn':
        if (e.variant === 'mountain') this.banner('BJERGKÆMPEN ER VÅGNET', 'Den kommer gennem Den gamle port', 'red', 4.5);
        else if (e.variant === 'sea') this.banner('HAVKÆMPEN STIGER OP', 'Den vader ind gennem sundet fra havet', 'red', 4.5);
        else if ((e.variant === 'runner' || e.variant === 'thrower') && !this.seen.has(e.variant)) {
          this.seen.add(e.variant);
          if (e.variant === 'runner') this.banner('LØBERKÆMPEN', 'Hurtig – den springer mod dig. Orange ring = landing: kom væk!', 'red', 4.2);
          else this.banner('KASTEREN', `Bliver på afstand og kaster klippeblokke${h.city.gate ? ' – også mod porten' : ''}. Søg dækning, kom tæt på`, 'red', 4.2);
        }
        break;
      case 'gateHit':
        if (h.time - this.gateNoteT > 8) { this.gateNoteT = h.time; this.note(`${h.city.gate?.name ?? 'Porten'} angribes! Skyd på kæmperne for at lokke dem væk`); }
        break;
    }
  }

  // ---------- Hvert billede ----------

  update(h: Hunt, dt: number, viewYaw: number, hookAim: { dist: number; giant: boolean } | null) {
    const H = this.h, p = h.player;
    // Bølge og kæmper tilbage
    const left = h.giantsLeft();
    let top = '', sub = '';
    if (h.phase === 'break') { top = `${Math.ceil(h.phaseT)}`; sub = h.wave === 0 ? 'FØRSTE BØLGE OM' : 'NÆSTE BØLGE OM'; }
    else if (h.phase === 'fight') { top = `${left}`; sub = left === 1 ? 'KÆMPE TILBAGE' : 'KÆMPER TILBAGE'; }
    else if (h.phase === 'won') { top = '0'; sub = 'BYEN ER REDDET'; }
    else { top = '–'; sub = 'NEDERLAG'; }
    this.coinT = Math.max(0, this.coinT - dt);
    H.wave.innerHTML = `<div class="w">BØLGE ${Math.max(1, h.wave)}<span>/${h.waves.length}</span></div><div class="c">${top}<small>${sub}</small></div><div class="m${this.coinT > 0 ? ' up' : ''}">◆ ${h.coins}<small>${fmtN(h.score)} P</small></div>`;
    // Opgraderinger: kun i pausen mellem bølgerne
    const cheapest = Math.min(...UPGRADES.map((u) => h.up[u.id] < UPGRADE_MAX ? h.upgradeCost(u.id) : Infinity));
    const showHint = h.phase === 'break' && p.alive && !this.shopOpen;
    H.shopHint.classList.toggle('hidden', !showHint);
    if (showHint) {
      H.shopHint.innerHTML = `${this.touch ? 'OPGRADÉR' : '<b>B</b>'} · opgraderinger · ◆ ${h.coins}`;
      H.shopHint.classList.toggle('ready', h.coins >= cheapest);
    }
    if (this.shopOpen) {
      const t = this.shop.querySelector('.timer');
      if (t) t.textContent = `${h.wave === 0 ? 'Første bølge' : `Bølge ${h.wave + 1}`} om ${Math.ceil(h.phaseT)} s · tiden står stille, mens menuen er åben`;
    }
    // Borgporten
    if (h.gate) {
      H.gate.classList.remove('hidden');
      const gn = (H.gate.querySelector('.n') as HTMLElement);
      if (gn.dataset.name !== h.city.gate!.name) { gn.dataset.name = h.city.gate!.name; gn.textContent = h.city.gate!.name.toUpperCase(); }
      const g = h.gate, pct = Math.max(0, g.hp / g.maxHp);
      (H.gate.querySelector('i') as HTMLElement).style.width = `${pct * 100}%`;
      H.gate.classList.toggle('hit', h.time - g.lastHitT < 0.4);
      H.gate.classList.toggle('low', pct < 0.35);
    } else H.gate.classList.add('hidden');
    H.wave.classList.toggle('brk', h.phase === 'break');

    // Kæmpens liv (den man senest ramte)
    this.bossT -= dt;
    const boss = h.giants.find((g) => g.id === this.bossId && g.alive);
    if (boss && this.bossT > 0) {
      H.boss.classList.remove('hidden');
      (H.boss.querySelector('.n') as HTMLElement).textContent = GIANT_NAME(boss);
      (H.boss.querySelector('i') as HTMLElement).style.width = `${(boss.hp / boss.maxHp) * 100}%`;
    } else H.boss.classList.add('hidden');

    // Liv og gas
    const hp = Math.max(0, Math.ceil(p.hp));
    H.hp.innerHTML = `<div class="row"><span class="lbl">LIV</span><span class="num">${hp}</span></div><div class="bar"><i style="width:${(hp / HUNT.maxHp) * 100}%"></i></div>`;
    H.hp.classList.toggle('low', p.alive && hp <= 30);
    const gas = Math.round(h.gas), gmax = h.maxGas;
    const state = h.braking ? 'BREMSER' : h.boosting ? 'BOOST' : h.reeling ? 'SPOLER' : h.hook.state === 'attached' ? 'I WIREN' : gas < gmax ? 'FYLDER OP' : 'KLAR';
    H.gas.innerHTML = `<div class="row"><span class="lbl">GAS</span><span class="num">${gas}</span><span class="st">${state}</span></div><div class="bar"><i style="width:${(gas / gmax) * 100}%"></i></div>`;
    H.gas.classList.toggle('low', gas < 20);
    H.gas.classList.toggle('active', h.boosting || h.braking || h.reeling);

    // Våben
    const ws = p.slot === 'primary' ? p.primary! : p.pistol;
    const max = h.magSize(ws.id as 'rifle' | 'pistol');
    H.weapon.innerHTML = `<div class="ammo${ws.mag <= max * 0.25 ? ' low' : ''}">${ws.mag}<small> / ${ws.reserve}</small></div><div class="name">${p.reloadT > 0 ? 'Genlader…' : WEAPONS[ws.id].name}</div>`;
    H.slots.innerHTML = [['1', 'Riffel', 'primary'], ['2', 'Pistol', 'pistol']].map((s) => `<div class="${p.slot === s[2] ? 'on' : ''}"><b>${s[0]}</b>${s[1]}</div>`).join('');

    // Sigtekorn
    const gap = 4 + h.spreadDeg() * 4.2;
    const lines = H.cross.querySelectorAll('i');
    const len = 7;
    const set = (i: number, x: number, y: number, w: number, hh: number) => { const s = (lines[i] as HTMLElement).style; s.left = `${x}px`; s.top = `${y}px`; s.width = `${w}px`; s.height = `${hh}px`; };
    set(0, -1, -gap - len, 2, len); set(1, -1, gap, 2, len); set(2, -gap - len, -1, len, 2); set(3, gap, -1, len, 2);
    H.cross.style.display = p.alive ? '' : 'none';
    // Krogens afstand under sigtekornet
    if (!p.alive || h.phase === 'won') H.hook.textContent = '';
    else if (h.hook.state === 'attached') { H.hook.textContent = `WIRE ${Math.round(h.hook.len)} m`; H.hook.className = 'hookd on'; }
    else if (!hookAim) { H.hook.textContent = 'INTET MÅL'; H.hook.className = 'hookd far'; }
    else if (hookAim.dist > h.hookRange) { H.hook.textContent = `FOR LANGT · ${Math.round(hookAim.dist)} m`; H.hook.className = 'hookd far'; }
    else { H.hook.textContent = `${Math.round(hookAim.dist)} m${hookAim.giant ? ' · KÆMPE' : ''}`; H.hook.className = `hookd${hookAim.giant ? ' giant' : ''}`; }

    // Fart og højde
    const sp = h.speed;
    H.flight.innerHTML = p.alive ? `<span>${Math.round(sp * 3.6)}<small> km/t</small></span><span>${Math.round(h.heightAboveGround())}<small> m over jorden</small></span>${p.body.pos.y > h.city.ceiling ? '<b>HØJDEGRÆNSE</b>' : ''}` : '';
    this.speedA += ((p.alive ? Math.max(0, Math.min(1, (sp - 14) / 26)) : 0) - this.speedA) * Math.min(1, dt * 5);
    H.speed.style.opacity = String(this.speedA);

    // Advarsler: kæmper der gør klar til at slå/kaste i nærheden, og sten på vej
    let warn = '';
    for (const g of h.giants) {
      const tg = g.telegraph;
      if (!tg) continue;
      const d = Math.hypot(g.pos.x - p.body.pos.x, g.pos.z - p.body.pos.z);
      if (tg === 'swipe' && d > HUNT.swipeReach * g.scale + 8) continue;
      if (tg === 'throw' && d > HUNT.throwRange + 10) continue;
      if (tg === 'leap' && d > HUNT.leapMax + 12) continue;
      const rel = -(yawPitchTo(p.body.pos, g.pos).yaw - viewYaw);
      warn += `<i class="${tg}" style="transform:rotate(${rel}rad)"><b style="transform:rotate(${-rel}rad)">${tg === 'swipe' ? 'SLAG!' : tg === 'leap' ? 'SPRING!' : 'STEN!'}</b></i>`;
    }
    for (const r of h.rocks) {
      const c = h.center();
      const d = Math.hypot(r.pos.x - c.x, r.pos.y - c.y, r.pos.z - c.z);
      if (d > 40) continue;
      const rel = -(yawPitchTo(p.body.pos, r.pos).yaw - viewYaw);
      warn += `<i class="rock" style="transform:rotate(${rel}rad)"></i>`;
    }
    H.warns.innerHTML = warn;

    // Kortvarige ting
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) H.hitm.classList.remove('on'); }
    if (this.popT > 0) { this.popT -= dt; if (this.popT <= 0) H.pop.classList.remove('on'); }
    this.hurtA = Math.max(0, this.hurtA - dt * 1.2);
    H.hurt.style.opacity = String(Math.max(this.hurtA, p.alive && p.hp <= 30 ? 0.25 + 0.1 * Math.sin(performance.now() / 200) : 0));
    for (let i = this.dirs.length - 1; i >= 0; i--) {
      const d = this.dirs[i];
      d.t -= dt;
      d.e.style.transform = `rotate(${-(d.yaw - viewYaw)}rad)`;
      d.e.style.opacity = String(Math.min(1, d.t));
      if (d.t <= 0) { d.e.remove(); this.dirs.splice(i, 1); }
    }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) H.banner.classList.remove('on'); }
    if (this.noteT > 0) { this.noteT -= dt; H.note.style.opacity = String(Math.min(1, this.noteT * 2)); }
    H.dead.classList.toggle('hidden', p.alive);
    if (!p.alive) H.dead.innerHTML = 'Du er faldet';

    this.drawRadar(h, viewYaw);
  }

  private drawRadar(h: Hunt, yaw: number) {
    const S = h.city.radarScale;
    if (!this.radarImg) this.radarImg = drawCityMap(document.createElement('canvas'), h.city, 2);
    const c = this.radar, ctx = c.getContext('2d')!;
    const R = c.width / 2, me = h.player.body.pos;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.fillStyle = '#1b1915'; ctx.fillRect(0, 0, c.width, c.height);
    // Kortet drejer med synsretningen (fremad = op), som i den taktiske kamp
    ctx.translate(R, R);
    ctx.rotate(yaw);
    ctx.translate(-me.x * S, -me.z * S);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.radarImg, 0, 0, h.world.sx * S, h.world.sz * S);
    const up = (fn: () => void, x: number, z: number) => { ctx.save(); ctx.translate(x * S, z * S); ctx.rotate(-yaw); fn(); ctx.restore(); };
    // Pejlemærker
    for (const l of h.city.landmarks) if (l.label) up(() => {
      ctx.font = '600 11px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(l.label!, 0, -6);
      ctx.fillStyle = '#fff1d0'; ctx.fillText(l.label!, 0, -6);
    }, l.x, l.z);
    // Borgporten
    if (h.gate && h.city.gate) {
      const c = h.city.gate.center, hit = h.time - h.gate.lastHitT < 2;
      up(() => {
        ctx.fillStyle = hit && Math.floor(performance.now() / 160) % 2 === 0 ? '#ff3b30' : '#d9b46a';
        ctx.fillRect(-5, -3, 10, 6);
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.strokeRect(-5, -3, 10, 6);
      }, c.x, c.z);
    }
    // Depoter
    for (const d of h.depots) up(() => {
      const ready = d.cd <= 0;
      ctx.fillStyle = ready ? '#6dde8a' : '#5b5f58';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = '#102614'; ctx.fillRect(-1, -3, 2, 6); ctx.fillRect(-3, -1, 6, 2);
    }, d.pos.x, d.pos.z);
    // Kæmper
    const blink = Math.floor(performance.now() / 160) % 2 === 0;
    for (const g of h.giants) {
      if (!g.alive) continue;
      up(() => {
        const r = (g.variant === 'runner' ? 4 : g.variant === 'thrower' ? 5.5 : 5) * g.scale;
        ctx.fillStyle = g.telegraph && blink ? '#ffffff' : g.variant === 'runner' ? '#ff8a2a' : g.variant === 'thrower' ? '#c46cff' : '#ff3b30';
        if (g.variant === 'runner') { ctx.rotate(Math.PI / 4); }
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.strokeRect(-r, -r, r * 2, r * 2);
      }, g.pos.x, g.pos.z);
    }
    for (const r of h.rocks) up(() => { ctx.fillStyle = '#ffd040'; ctx.fillRect(-2, -2, 4, 4); }, r.pos.x, r.pos.z);
    ctx.restore();
    // Kæmper uden for radaren: pil i kanten
    for (const g of h.giants) {
      if (!g.alive) continue;
      const dx = (g.pos.x - me.x) * S, dz = (g.pos.z - me.z) * S;
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
      if (Math.abs(rx) < R - 6 && Math.abs(rz) < R - 6) continue;
      const k = (R - 7) / Math.max(Math.abs(rx), Math.abs(rz));
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(R + rx * k - 3, R + rz * k - 3, 6, 6);
    }
    // Mig selv
    ctx.save(); ctx.translate(R, R);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(242,193,78,0.35)'; ctx.strokeRect(0.5, 0.5, c.width - 1, c.height - 1);
  }
}

