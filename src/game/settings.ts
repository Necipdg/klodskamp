// Indstillinger gemmes i browseren (hvis muligt). Alt pakket i try/catch – spillet virker også uden.
export type Quality = 0 | 1 | 2; // lav, mellem, høj

export interface Settings {
  sensitivity: number; // 0.2 – 3
  volume: number; // 0 – 1
  quality: Quality;
  fov: number;
  invertY: boolean;
  seenIntro: boolean;
  /** Touch-styring på skærmen: auto (telefoner/tablets), altid til eller fra */
  touch: 'auto' | 'on' | 'off';
  /** Størrelse på touch-knapperne */
  buttons: 'lille' | 'normal' | 'stor';
  /** Vibration ved slag, krog og fældede kæmper (kun telefoner der kan) */
  vibrate: boolean;
  /** Vis billedhastigheden (FPS) i hjørnet */
  showFps: boolean;
  /** Sidst valgte sværhedsgrad i Kæmpejagt */
  huntDiff: 'let' | 'normal' | 'svaer';
  /** Navn når man spiller sammen med andre */
  name: string;
}

const KEY = 'klodskamp.indstillinger';
/** Er det en telefon eller tablet (grov pegeenhed, ingen mus)? */
export const isTouchDevice = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
const DEFAULTS: Settings = { sensitivity: 1, volume: 0.7, quality: 2, fov: 78, invertY: false, seenIntro: false, touch: 'auto', buttons: 'normal', vibrate: true, showFps: false, huntDiff: 'normal', name: '' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ingen lagring */ }
  // Første gang på en telefon: lav grafik (skygger fra, lavere opløsning) for en jævn billedhastighed
  return { ...DEFAULTS, quality: isTouchDevice() ? 0 : DEFAULTS.quality };
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ingen lagring */ }
}

export const QUALITY_NAME: Record<Quality, string> = { 0: 'Lav', 1: 'Mellem', 2: 'Høj' };
