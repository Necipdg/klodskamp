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
  /** Skarphed (opløsning): auto justerer efter billedhastigheden */
  sharp: 'auto' | 'lav' | 'mellem' | 'hoj';
  /** Touch, højre side af skærmen: kig + skud af sig selv, når sigtekornet er på en kæmpe ('auto'),
   *  kig + skyd så længe fingeren er der ('skyd'), eller kun kig ('kig') */
  rightTouch: 'auto' | 'skyd' | 'kig';
  /** Version af standarden for rightTouch (2 = "Kun kig" er standard – ældre gemte indstillinger sættes om én gang) */
  rtV: number;
  /** Navn når man spiller sammen med andre */
  name: string;
}

const KEY = 'klodskamp.indstillinger';
/** Er det en telefon eller tablet (grov pegeenhed, ingen mus)? */
export const isTouchDevice = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
const DEFAULTS: Settings = { sensitivity: 1, volume: 0.7, quality: 2, fov: 78, invertY: false, seenIntro: false, touch: 'auto', buttons: 'normal', vibrate: true, showFps: false, huntDiff: 'normal', sharp: 'auto', rightTouch: 'kig', rtV: 2, name: '' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s: Settings = { ...DEFAULTS, ...JSON.parse(raw) };
      // Standarden for "Højre side (touch)" er nu "Kun kig" – gælder også telefoner, der har gemt den gamle standard
      if (s.rtV !== 2) { s.rightTouch = 'kig'; s.rtV = 2; }
      return s;
    }
  } catch { /* ingen lagring */ }
  // Første gang på en telefon: lav grafik (skygger fra, lavere opløsning) for en jævn billedhastighed
  return { ...DEFAULTS, quality: isTouchDevice() ? 0 : DEFAULTS.quality };
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ingen lagring */ }
}

export const QUALITY_NAME: Record<Quality, string> = { 0: 'Lav', 1: 'Mellem', 2: 'Høj' };
