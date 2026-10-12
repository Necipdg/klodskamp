// Al lyd er syntetiseret med Web Audio (ingen lydfiler). Lyde i verden placeres med stereo,
// afstandsdæmpning og et lavpasfilter, der lukker mere, når lyden er langt væk eller bag en mur.
import type { V3 } from '../core/math';

type Surface = 'wood' | 'stone' | 'soft';

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private verb!: ConvolverNode;
  private verbGain!: GainNode;
  private noise!: AudioBuffer;
  private ambient: GainNode | null = null;
  private birdT = 4;
  volume = 0.7;
  listener = { x: 0, y: 0, z: 0, yaw: 0 };
  /** 0 = dag, 1 = nat (fugle om dagen, fårekyllinger om natten) */
  night = 0;

  /** Skal kaldes fra et klik/tastetryk (browserne kræver det) */
  /** Sluk lyden, mens siden er skjult (app-skift på telefonen). unlock() tænder den igen. */
  suspend() { if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend(); }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.connect(comp);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(1.4);
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.32;
    this.verb.connect(this.verbGain);
    this.verbGain.connect(comp);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbient();
  }

  setVolume(v: number) { this.volume = v; if (this.ctx) this.master.gain.value = v; }

  private impulse(sec: number) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (i < 200 ? i / 200 : 1);
    }
    return b;
  }

  // ---------- Byggesten ----------

  /** Udgang for en lyd: rumlig placering eller direkte (egne lyde) */
  private out(pos: V3 | null, gain: number, occluded = false, verb = 0.5): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const g = ctx.createGain();
    let vol = gain;
    let last: AudioNode = g;
    if (pos) {
      const L = this.listener;
      const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
      const d = Math.hypot(dx, dy, dz);
      vol *= 1 / (1 + d * 0.09 + d * d * 0.0025);
      if (vol < 0.003) return null;
      // vinkel i forhold til hvor man kigger: højre = +
      const right = { x: Math.cos(L.yaw), z: -Math.sin(L.yaw) };
      const pan = d > 0.1 ? (dx * right.x + dz * right.z) / Math.hypot(dx, dz || 0.0001) : 0;
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-0.9, Math.min(0.9, pan * 0.85));
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(700, 16000 / (1 + d * 0.06)) * (occluded ? 0.18 : 1);
      if (occluded) vol *= 0.55;
      g.connect(lp); lp.connect(p);
      last = p;
    }
    g.gain.value = vol;
    last.connect(this.sfx);
    if (verb > 0) {
      const vg = ctx.createGain();
      vg.gain.value = verb * (pos ? 1.2 : 0.6);
      last.connect(vg); vg.connect(this.verb);
    }
    return g;
  }

  private noiseBurst(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.002, freqEnd?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(dest: AudioNode, t: number, dur: number, type: OscillatorType, f0: number, f1: number, gain: number, attack = 0.003) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private get now() { return this.ctx?.currentTime ?? 0; }

  // ---------- Lyde ----------

  shot(weapon: string, pos: V3 | null, occluded = false) {
    const o = this.out(pos, pos ? 1.6 : 0.85, occluded, 0.55);
    if (!o) return;
    const t = this.now;
    const prof = weapon === 'rifle' ? { band: 900, dur: 0.26, thump: 0.9, crack: 0.5 } : weapon === 'smg' ? { band: 1500, dur: 0.14, thump: 0.55, crack: 0.45 } : { band: 1900, dur: 0.17, thump: 0.6, crack: 0.6 };
    this.noiseBurst(o, t, 0.035, 'highpass', 3500, 0.7, prof.crack);
    this.noiseBurst(o, t, prof.dur, 'bandpass', prof.band, 0.8, 1.0, 0.002, prof.band * 0.45);
    this.tone(o, t, 0.12, 'sine', 160, 45, prof.thump);
    this.noiseBurst(o, t + 0.01, prof.dur * 1.6, 'lowpass', 600, 0.5, 0.35);
  }

  empty() {
    const o = this.out(null, 0.4, false, 0);
    if (!o) return;
    this.noiseBurst(o, this.now, 0.03, 'bandpass', 3200, 4, 0.8);
    this.tone(o, this.now, 0.03, 'square', 1800, 1400, 0.15);
  }

  reload(weapon: string, duration: number) {
    const o = this.out(null, 0.5, false, 0.1);
    if (!o) return;
    const t = this.now;
    const click = (dt: number, f: number, g = 0.8) => { this.noiseBurst(o, t + dt, 0.04, 'bandpass', f, 3, g); this.tone(o, t + dt, 0.03, 'square', f / 2, f / 3, 0.08); };
    click(0.15, 2200); // magasin ud
    click(duration * 0.55, 1800); // magasin ind
    click(duration * 0.58, 2600, 0.5);
    if (weapon !== 'pistol') { click(duration * 0.82, 1500); click(duration * 0.87, 2400); } // ladegreb
    else click(duration * 0.82, 3000);
  }

  switchWeapon() {
    const o = this.out(null, 0.3, false, 0);
    if (!o) return;
    this.noiseBurst(o, this.now, 0.07, 'bandpass', 2600, 2, 0.6, 0.01, 1600);
  }

  knife(pos: V3 | null) {
    const o = this.out(pos, 0.6, false, 0.1);
    if (!o) return;
    this.noiseBurst(o, this.now, 0.16, 'bandpass', 700, 1.5, 0.8, 0.03, 3200);
  }

  hitmarker(head: boolean) {
    const o = this.out(null, head ? 0.55 : 0.35, false, 0);
    if (!o) return;
    const t = this.now;
    if (head) { this.tone(o, t, 0.28, 'sine', 2600, 2550, 0.6); this.tone(o, t, 0.22, 'sine', 3920, 3900, 0.3); }
    else this.tone(o, t, 0.045, 'square', 1500, 1200, 0.25);
  }

  hurt() {
    const o = this.out(null, 0.7, false, 0.1);
    if (!o) return;
    this.tone(o, this.now, 0.18, 'sine', 120, 50, 0.9);
    this.noiseBurst(o, this.now, 0.12, 'lowpass', 500, 0.7, 0.6);
  }

  footstep(pos: V3 | null, surface: Surface, occluded = false) {
    const o = this.out(pos, pos ? 0.75 : 0.22, occluded, 0.15);
    if (!o) return;
    const t = this.now;
    if (surface === 'stone') { this.noiseBurst(o, t, 0.06, 'bandpass', 1500 + Math.random() * 500, 1.6, 0.9); this.tone(o, t, 0.04, 'sine', 180, 90, 0.25); }
    else if (surface === 'wood') { this.noiseBurst(o, t, 0.07, 'bandpass', 700, 2, 0.8); this.tone(o, t, 0.06, 'sine', 220, 120, 0.35); }
    else this.noiseBurst(o, t, 0.09, 'lowpass', 900 + Math.random() * 300, 0.7, 0.9, 0.01);
  }

  jump() { const o = this.out(null, 0.2, false, 0); if (o) this.noiseBurst(o, this.now, 0.08, 'lowpass', 700, 0.7, 0.6, 0.01); }
  land(speed: number) {
    const o = this.out(null, Math.min(0.7, 0.2 + speed * 0.04), false, 0.1);
    if (!o) return;
    this.noiseBurst(o, this.now, 0.1, 'lowpass', 500, 0.7, 0.9);
    this.tone(o, this.now, 0.09, 'sine', 110, 50, 0.5);
  }

  blockHit(pos: V3, kind: Surface) {
    const o = this.out(pos, 0.5, false, 0.2);
    if (!o) return;
    const t = this.now;
    if (kind === 'wood') { this.noiseBurst(o, t, 0.07, 'bandpass', 800, 2, 0.8); this.tone(o, t, 0.07, 'triangle', 260, 160, 0.3); }
    else if (kind === 'stone') { this.noiseBurst(o, t, 0.05, 'bandpass', 2800, 1.5, 0.8); this.tone(o, t, 0.03, 'square', 900, 600, 0.06); }
    else this.noiseBurst(o, t, 0.08, 'lowpass', 600, 0.7, 0.8);
  }

  blockBreak(pos: V3, kind: Surface) {
    const o = this.out(pos, 0.9, false, 0.35);
    if (!o) return;
    const t = this.now;
    for (let i = 0; i < 4; i++) {
      const dt = i * 0.035 + Math.random() * 0.02;
      if (kind === 'wood') { this.noiseBurst(o, t + dt, 0.12, 'bandpass', 500 + i * 180, 1.2, 0.8); this.tone(o, t + dt, 0.08, 'triangle', 200 - i * 20, 90, 0.3); }
      else this.noiseBurst(o, t + dt, 0.12, 'lowpass', 700 - i * 80, 0.7, 0.9);
    }
  }

  place(pos: V3) {
    const o = this.out(pos, 0.7, false, 0.2);
    if (!o) return;
    this.tone(o, this.now, 0.12, 'sine', 140, 60, 0.8);
    this.noiseBurst(o, this.now, 0.1, 'lowpass', 600, 0.7, 0.7);
  }

  bombBeep(pos: V3 | null, occluded = false) {
    const o = this.out(pos, pos ? 1.1 : 0.5, occluded, 0.3);
    if (!o) return;
    this.tone(o, this.now, 0.09, 'square', 1450, 1450, 0.35, 0.002);
  }

  keypad() {
    const o = this.out(null, 0.35, false, 0.05);
    if (!o) return;
    const f = 900 + Math.random() * 900;
    this.tone(o, this.now, 0.07, 'square', f, f, 0.2);
  }

  defuseTick() {
    const o = this.out(null, 0.3, false, 0);
    if (!o) return;
    this.noiseBurst(o, this.now, 0.03, 'bandpass', 3800, 4, 0.7);
  }

  explosion(pos: V3) {
    const o = this.out(pos, 4, false, 1);
    if (!o) return;
    const t = this.now;
    this.noiseBurst(o, t, 2.6, 'lowpass', 900, 0.6, 1.0, 0.004, 120);
    this.tone(o, t, 1.2, 'sine', 90, 25, 1.0);
    this.noiseBurst(o, t, 0.4, 'bandpass', 2400, 0.8, 0.6);
  }

  ui() { const o = this.out(null, 0.25, false, 0); if (o) this.tone(o, this.now, 0.05, 'triangle', 900, 1200, 0.4); }
  buy() {
    const o = this.out(null, 0.35, false, 0.1);
    if (!o) return;
    this.tone(o, this.now, 0.12, 'triangle', 1320, 1320, 0.5);
    this.tone(o, this.now + 0.08, 0.2, 'triangle', 1760, 1760, 0.5);
  }
  denied() { const o = this.out(null, 0.3, false, 0); if (o) this.tone(o, this.now, 0.16, 'square', 220, 180, 0.25); }

  /** Radiolyd ved rundestart */
  roundStart() {
    const o = this.out(null, 0.35, false, 0.1);
    if (!o) return;
    const t = this.now;
    this.noiseBurst(o, t, 0.12, 'bandpass', 2000, 1, 0.4);
    this.tone(o, t + 0.12, 0.08, 'square', 880, 880, 0.2);
    this.tone(o, t + 0.24, 0.12, 'square', 1175, 1175, 0.2);
  }
  live() {
    const o = this.out(null, 0.4, false, 0.2);
    if (!o) return;
    const t = this.now;
    for (const [i, f] of [[0, 523], [1, 659], [2, 784]] as const) this.tone(o, t + i * 0.09, 0.22, 'triangle', f, f, 0.4);
  }
  roundEnd(win: boolean) {
    const o = this.out(null, 0.5, false, 0.4);
    if (!o) return;
    const t = this.now;
    const notes = win ? [523, 659, 784, 1047] : [440, 392, 349, 262];
    notes.forEach((f, i) => { this.tone(o, t + i * 0.13, 0.5, 'triangle', f, f, 0.4); this.tone(o, t + i * 0.13, 0.5, 'sine', f / 2, f / 2, 0.25); });
  }
  matchEnd(win: boolean) {
    const o = this.out(null, 0.55, false, 0.5);
    if (!o) return;
    const t = this.now;
    const seq = win ? [523, 659, 784, 659, 784, 1047] : [392, 349, 311, 262];
    seq.forEach((f, i) => this.tone(o, t + i * 0.16, 0.6, 'triangle', f, f, 0.45));
  }

  // ---------- Kæmpejagt ----------

  hookFire() {
    const o = this.out(null, 0.45, false, 0.05);
    if (!o) return;
    const t = this.now;
    this.noiseBurst(o, t, 0.05, 'bandpass', 2400, 2, 0.9); // affyring
    this.tone(o, t, 0.06, 'square', 300, 180, 0.2);
    this.noiseBurst(o, t + 0.02, 0.32, 'bandpass', 4200, 6, 0.35, 0.01, 1800); // wiren ruller ud
  }
  hookAttach(pos: V3, giant: boolean) {
    const o = this.out(pos, 0.9, false, 0.25);
    if (!o) return;
    const t = this.now;
    if (giant) { this.noiseBurst(o, t, 0.12, 'lowpass', 600, 1, 0.9); this.tone(o, t, 0.1, 'sine', 140, 70, 0.6); }
    else { this.noiseBurst(o, t, 0.05, 'bandpass', 3000, 2, 0.9); this.tone(o, t, 0.05, 'square', 1200, 700, 0.15); }
  }
  hookMiss() { const o = this.out(null, 0.3, false, 0); if (o) { this.tone(o, this.now, 0.1, 'square', 300, 220, 0.2); } }
  hookRelease() { const o = this.out(null, 0.25, false, 0); if (o) this.noiseBurst(o, this.now, 0.08, 'bandpass', 1800, 3, 0.6, 0.005, 3600); }
  depot() {
    const o = this.out(null, 0.5, false, 0.2);
    if (!o) return;
    const t = this.now;
    this.noiseBurst(o, t, 0.4, 'highpass', 3000, 0.7, 0.4, 0.01); // gas fyldes
    [660, 880, 1320].forEach((f, i) => this.tone(o, t + i * 0.07, 0.18, 'triangle', f, f, 0.4));
  }
  weakHit(kill: boolean) {
    const o = this.out(null, kill ? 0.7 : 0.5, false, 0.15);
    if (!o) return;
    const t = this.now;
    this.tone(o, t, 0.32, 'sine', 1760, 1740, 0.6);
    this.tone(o, t, 0.26, 'triangle', 2637, 2600, 0.3);
    this.noiseBurst(o, t, 0.08, 'highpass', 5000, 0.7, 0.4); // krystallen knaser
  }
  giantHit(pos: V3) {
    const o = this.out(pos, 1.1, false, 0.2);
    if (!o) return;
    this.noiseBurst(o, this.now, 0.07, 'lowpass', 900, 0.8, 0.7);
  }
  giantStep(pos: V3, scale: number) {
    const o = this.out(pos, 3.2 * scale, false, 0.6);
    if (!o) return;
    const t = this.now;
    this.tone(o, t, 0.5, 'sine', 62 / scale, 28, 1.0, 0.01);
    this.noiseBurst(o, t, 0.45, 'lowpass', 260, 0.7, 0.9, 0.01, 90);
    this.noiseBurst(o, t + 0.05, 0.25, 'bandpass', 900, 1, 0.25); // grus
  }
  giantRoar(pos: V3, big: boolean) {
    const o = this.out(pos, big ? 3.4 : 2.6, false, 0.9);
    if (!o) return;
    const t = this.now;
    const f = big ? 70 : 95;
    this.tone(o, t, 1.5, 'sawtooth', f, f * 0.7, 0.35, 0.2);
    this.tone(o, t, 1.5, 'sawtooth', f * 1.51, f * 1.05, 0.2, 0.25);
    this.noiseBurst(o, t, 1.4, 'bandpass', 420, 1.2, 0.6, 0.25, 220);
  }
  giantWindup(pos: V3, kind: 'swipe' | 'throw' | 'leap') {
    const o = this.out(pos, 2.2, false, 0.5);
    if (!o) return;
    const t = this.now;
    if (kind === 'leap') {
      // Løberen: hurtigt, knurrende og stigende – springet kommer om under et sekund
      this.tone(o, t, 0.8, 'square', 90, 260, 0.22, 0.25);
      this.tone(o, t + 0.05, 0.75, 'sawtooth', 140, 380, 0.15, 0.2);
      this.noiseBurst(o, t, 0.8, 'bandpass', 600, 2, 0.4, 0.2, 1800);
      return;
    }
    // Tydelig, stigende advarsel – samme varighed som angrebets optakt
    const dur = kind === 'swipe' ? 0.9 : 1.2;
    this.tone(o, t, dur, 'sawtooth', 70, kind === 'swipe' ? 150 : 120, 0.3, 0.3);
    this.noiseBurst(o, t, dur, 'bandpass', 300, 1.5, 0.5, 0.3, 900);
  }
  giantSmash(pos: V3) {
    const o = this.out(pos, 3.5, false, 0.8);
    if (!o) return;
    const t = this.now;
    this.noiseBurst(o, t, 0.25, 'bandpass', 600, 0.8, 1, 0.005, 200); // sus
    this.tone(o, t + 0.05, 0.6, 'sine', 70, 25, 1);
    this.noiseBurst(o, t + 0.05, 0.8, 'lowpass', 500, 0.6, 1, 0.005, 80);
  }
  giantFlinch(pos: V3) {
    const o = this.out(pos, 2.2, false, 0.5);
    if (!o) return;
    this.tone(o, this.now, 0.45, 'sawtooth', 160, 90, 0.35, 0.02);
  }
  giantDeath(pos: V3, big: boolean) {
    const o = this.out(pos, 3.4, false, 1);
    if (!o) return;
    const t = this.now;
    const f = big ? 80 : 110;
    this.tone(o, t, 1.6, 'sawtooth', f, f * 0.45, 0.4, 0.05);
    this.noiseBurst(o, t, 1.2, 'bandpass', 500, 1, 0.5, 0.05, 150);
  }
  giantFell(pos: V3) {
    const o = this.out(pos, 4.2, false, 1);
    if (!o) return;
    const t = this.now;
    this.tone(o, t, 1.1, 'sine', 55, 20, 1);
    this.noiseBurst(o, t, 1.8, 'lowpass', 700, 0.6, 1, 0.005, 90);
    for (let i = 0; i < 5; i++) this.noiseBurst(o, t + 0.15 + i * 0.12 + Math.random() * 0.08, 0.14, 'bandpass', 900 + Math.random() * 900, 1.4, 0.4);
  }
  gateHit(pos: V3, broken: boolean) {
    const o = this.out(pos, broken ? 4 : 2.6, false, 0.7);
    if (!o) return;
    const t = this.now;
    this.tone(o, t, 0.4, 'sine', 80, 35, 1);
    for (let i = 0; i < (broken ? 8 : 4); i++) { this.noiseBurst(o, t + i * 0.05, 0.14, 'bandpass', 500 + i * 160, 1.3, 0.8); this.tone(o, t + i * 0.05, 0.1, 'triangle', 220 - i * 15, 90, 0.3); }
  }
  gateRepair() {
    const o = this.out(null, 0.4, false, 0.2);
    if (!o) return;
    const t = this.now;
    for (let i = 0; i < 4; i++) { this.noiseBurst(o, t + i * 0.22, 0.06, 'bandpass', 1600, 3, 0.8); this.tone(o, t + i * 0.22, 0.08, 'square', 900, 600, 0.12); }
  }
  splash(pos: V3, big: boolean) {
    const o = this.out(pos, big ? 1.6 : 0.6, false, 0.3);
    if (!o) return;
    const t = this.now;
    this.noiseBurst(o, t, big ? 0.5 : 0.22, 'bandpass', 1400, 0.8, 0.9, 0.01, 500);
    this.noiseBurst(o, t + 0.04, big ? 0.35 : 0.15, 'highpass', 3500, 0.7, 0.4);
  }
  rockThrow(pos: V3) {
    const o = this.out(pos, 2.2, false, 0.4);
    if (!o) return;
    this.noiseBurst(o, this.now, 0.4, 'bandpass', 500, 1, 0.8, 0.02, 1400);
  }
  rockImpact(pos: V3, big = false) {
    const o = this.out(pos, big ? 3.2 : 2.4, false, 0.6);
    if (!o) return;
    const t = this.now;
    this.tone(o, t, big ? 0.5 : 0.3, 'sine', big ? 70 : 90, big ? 25 : 35, big ? 1.1 : 0.9);
    if (big) for (let i = 0; i < 5; i++) this.noiseBurst(o, t + 0.05 + i * 0.05, 0.18, 'bandpass', 400 + i * 250, 1, 0.6);
    for (let i = 0; i < 4; i++) this.noiseBurst(o, t + i * 0.04, 0.12, 'bandpass', 700 + i * 300, 1.2, 0.7);
  }
  waveStart(final: boolean) {
    const o = this.out(null, 0.6, false, 0.6);
    if (!o) return;
    const t = this.now;
    // Et dybt horn
    const f = final ? 98 : 131;
    this.tone(o, t, 1.6, 'sawtooth', f, f, 0.22, 0.25);
    this.tone(o, t, 1.6, 'sawtooth', f * 1.5, f * 1.5, 0.12, 0.3);
    this.tone(o, t + 0.9, 1.0, 'sawtooth', f * 1.335, f * 1.335, 0.18, 0.1);
  }

  private loops: { wind: GainNode; windF: BiquadFilterNode; gas: GainNode; reel: GainNode; reelO: OscillatorNode; fall: GainNode; srcs: AudioScheduledSourceNode[] } | null = null;
  /** Vedvarende lyde i Kæmpejagt: fartvind, gas-sus og wirens summen */
  huntLoops(speed: number, gas: boolean, reel: boolean, hooked: boolean, fallDist = 999) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.loops) {
      const mk = (type: BiquadFilterType, f: number, q: number) => {
        const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
        const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0;
        s.connect(fl); fl.connect(g); g.connect(this.sfx); s.start();
        return { s, fl, g };
      };
      const wind = mk('bandpass', 500, 0.6);
      const gasN = mk('highpass', 2500, 0.7);
      const reelO = ctx.createOscillator(); reelO.type = 'sawtooth'; reelO.frequency.value = 90;
      const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 900;
      const rg = ctx.createGain(); rg.gain.value = 0;
      reelO.connect(rf); rf.connect(rg); rg.connect(this.sfx); reelO.start();
      const fall = mk('lowpass', 900, 0.5);
      this.loops = { wind: wind.g, windF: wind.fl, gas: gasN.g, reel: rg, reelO, fall: fall.g, srcs: [wind.s, gasN.s, reelO, fall.s] };
    }
    const L = this.loops, t = this.now;
    const w = Math.min(1, Math.max(0, (speed - 6) / 34));
    L.wind.gain.setTargetAtTime(w * w * 0.55, t, 0.15);
    L.windF.frequency.setTargetAtTime(300 + w * 1400, t, 0.2);
    L.gas.gain.setTargetAtTime(gas ? 0.16 : 0, t, 0.04);
    L.reel.gain.setTargetAtTime(reel ? 0.06 : hooked ? 0.012 : 0, t, 0.05);
    L.reelO.frequency.setTargetAtTime(reel ? 140 : 80, t, 0.1);
    const f = Math.max(0, 1 - fallDist / 90);
    L.fall.gain.setTargetAtTime(f * f * 0.5, t, 0.3);
  }
  get loopsActive() { return !!this.loops; }
  stopLoops() {
    if (!this.loops) return;
    for (const s of this.loops.srcs) { try { s.stop(); } catch { /* allerede stoppet */ } }
    this.loops = null;
  }

  // ---------- Stemning: vind og fugle ----------

  private startAmbient() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.ambient = g;
  }

  tick(dt: number) {
    if (!this.ctx || !this.ambient) return;
    this.birdT -= dt;
    if (this.night > 0.5 && this.birdT <= 0) {
      // fårekyllinger
      this.birdT = 0.4 + Math.random() * 1.2;
      const o = this.ctx.createGain();
      o.gain.value = 0.025 * this.night;
      const p = this.ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8;
      o.connect(p); p.connect(this.master);
      const t = this.now, f = 4200 + Math.random() * 600;
      for (let i = 0; i < 3; i++) this.tone(o, t + i * 0.05, 0.03, 'sine', f, f, 0.8, 0.003);
      return;
    }
    if (this.birdT <= 0) {
      this.birdT = 5 + Math.random() * 9;
      const o = this.ctx.createGain();
      o.gain.value = 0.05;
      const p = this.ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8;
      o.connect(p); p.connect(this.master);
      const t = this.now;
      const base = 2400 + Math.random() * 1400;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(o, t + i * 0.14, 0.09, 'sine', base, base * 1.35, 0.6, 0.01);
    }
  }
}
