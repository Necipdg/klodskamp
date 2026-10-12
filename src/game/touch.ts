// Touch-styring til telefoner og tablets: en styrepind der dukker op, hvor venstre tommelfinger rører
// skærmen, kig ved at trække med højre tommelfinger, og knapper der trykker "virtuelle" taster i Input.
// Skyd- og krog-knappen kan også trækkes, så man kan sigte, mens man holder dem nede.
import type { Input } from './input';

export type TouchLayout = 'hunt' | 'tactical';

interface Btn { act: string; label: string; cls: string; look?: boolean }
const BUTTONS: Record<TouchLayout, Btn[]> = {
  hunt: [
    { act: 'fire', label: 'SKYD', cls: 'b-fire', look: true },
    { act: 'hook', label: 'KROG', cls: 'b-a2', look: true },
    { act: 'key:Space', label: 'BOOST', cls: 'b-jump' },
    { act: 'key:KeyG', label: 'BREMS', cls: 'b-a3' },
    { act: 'key:ShiftLeft', label: 'SPOL', cls: 'b-a4' },
    { act: 'key:KeyR', label: '↻', cls: 'b-reload' },
    { act: 'key:KeyQ', label: '⇄', cls: 'b-weapon' },
    { act: 'key:KeyB', label: 'OPGRADÉR', cls: 'b-shop buy' },
  ],
  tactical: [
    { act: 'fire', label: 'SKYD', cls: 'b-fire', look: true },
    { act: 'key:KeyC', label: 'HUK', cls: 'b-a2' },
    { act: 'key:Space', label: 'HOP', cls: 'b-jump' },
    { act: 'key:KeyE', label: 'BRUG', cls: 'b-a3' },
    { act: 'key:KeyB', label: 'KØB', cls: 'b-a4 buy' },
    { act: 'key:KeyR', label: '↻', cls: 'b-reload' },
    { act: 'key:KeyQ', label: '⇄', cls: 'b-weapon' },
    { act: 'key:Tab', label: 'TAVLE', cls: 'b-board' },
  ],
};

export class TouchControls {
  readonly root = document.createElement('div');
  private base = document.createElement('div');
  private knob = document.createElement('i');
  private layout: TouchLayout | null = null;
  private stick: { id: number; ox: number; oy: number } | null = null;
  private looks = new Map<number, { x: number; y: number }>();
  private held = new Map<number, string>();
  /** Skærmpixel → "musepixel" for kig */
  lookScale = 1.5;

  constructor(private input: Input, private cb: { pause(): void }) {
    this.root.id = 'touch';
    this.root.className = 'hidden';
    this.base.className = 'stick';
    this.knob.className = 'knob';
    this.base.append(this.knob);
    document.getElementById('ui')!.append(this.root);
    this.root.addEventListener('pointerdown', (e) => this.down(e));
    this.root.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) this.root.addEventListener(t, (e) => this.up(e as PointerEvent));
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get visible() { return !this.root.classList.contains('hidden'); }

  /** Vis knapperne for en spiltype (eller skjul med null). Slipper alle knapper, når den skjules. */
  show(layout: TouchLayout | null) {
    if (layout === this.layout && (layout !== null) === this.visible) return;
    this.releaseAll();
    this.layout = layout;
    this.root.classList.toggle('hidden', !layout);
    if (!layout) return;
    this.root.innerHTML = '';
    this.root.append(this.base);
    this.base.classList.remove('on');
    for (const b of BUTTONS[layout]) {
      const el = document.createElement('div');
      el.className = `tb ${b.cls}`;
      el.dataset.act = b.act;
      if (b.look) el.dataset.look = '1';
      el.textContent = b.label;
      this.root.append(el);
    }
    const p = document.createElement('div');
    p.className = 'tb b-pause';
    p.dataset.act = 'pause';
    p.textContent = 'II';
    this.root.append(p);
  }

  /** Vis/skjul KØB-knappen (kun i købsfasen) */
  setBuyVisible(v: boolean) {
    const b = this.root.querySelector('.buy') as HTMLElement | null;
    if (b) b.style.display = v ? '' : 'none';
  }

  private down(e: PointerEvent) {
    e.preventDefault();
    try { this.root.setPointerCapture(e.pointerId); } catch { /* ignorer */ }
    const t = (e.target as HTMLElement).closest('.tb') as HTMLElement | null;
    if (t?.dataset.act) {
      const act = t.dataset.act;
      if (act === 'pause') { this.cb.pause(); return; }
      this.held.set(e.pointerId, act);
      t.classList.add('on');
      this.press(act, true);
      if (t.dataset.look) this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    // Venstre del af skærmen: styrepind. Ellers: kig.
    if (e.clientX < window.innerWidth * 0.42 && !this.stick) {
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('on');
      this.knob.style.transform = 'translate(-50%, -50%)';
    } else this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  private move(e: PointerEvent) {
    if (this.stick && e.pointerId === this.stick.id) {
      const R = Math.min(window.innerWidth, window.innerHeight) * 0.13;
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      // lille dødzone, så man kan stå stille
      const k = (v: number) => (Math.abs(v) < R * 0.18 ? 0 : v / R);
      this.input.axisX = k(dx);
      this.input.axisY = -k(dy);
      return;
    }
    const l = this.looks.get(e.pointerId);
    if (l) {
      this.input.mouseDX += (e.clientX - l.x) * this.lookScale;
      this.input.mouseDY += (e.clientY - l.y) * this.lookScale;
      l.x = e.clientX; l.y = e.clientY;
    }
  }

  private up(e: PointerEvent) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.input.axisX = 0; this.input.axisY = 0;
      this.base.classList.remove('on');
    }
    this.looks.delete(e.pointerId);
    const act = this.held.get(e.pointerId);
    if (act) {
      this.held.delete(e.pointerId);
      this.root.querySelector(`.tb[data-act="${act}"]`)?.classList.remove('on');
      // Knappen er først sluppet, når ingen finger holder den længere
      if (![...this.held.values()].includes(act)) this.press(act, false);
    }
  }

  private press(act: string, on: boolean) {
    const inp = this.input;
    if (act === 'fire') { inp.mouseDown = on; if (on) inp.mousePressed = true; }
    else if (act === 'hook') { inp.rightDown = on; if (on) inp.rightPressed = true; }
    else if (act.startsWith('key:')) { const code = act.slice(4); if (on) inp.virtualDown(code); else inp.virtualUp(code); }
  }

  releaseAll() {
    for (const act of new Set(this.held.values())) this.press(act, false);
    this.held.clear();
    this.looks.clear();
    this.stick = null;
    this.input.axisX = 0; this.input.axisY = 0;
    this.root.querySelectorAll('.tb.on').forEach((b) => b.classList.remove('on'));
    this.base.classList.remove('on');
  }
}
