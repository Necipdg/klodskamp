// Tastatur og mus. Musens bevægelse samles op mellem billeder; enkelt-tryk registreres som hændelser
// (ikke som "holdt nede"), så korte tryk aldrig går tabt.
export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  mouseDown = false;
  mousePressed = false;
  rightPressed = false;
  rightDown = false;
  /** Analog styrepind fra touch (-1..1; y = frem) */
  axisX = 0;
  axisY = 0;
  /** Touch-styring aktiv (ingen pointer lock på telefoner) */
  touchMode = false;
  wheel = 0;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (this.blocks(e)) e.preventDefault(); return; }
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (this.blocks(e)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; this.rightDown = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Nogle browsere giver af og til et enormt spring lige efter låsning – ignorér det
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouseDown = true; this.mousePressed = true; }
      if (e.button === 2) { this.rightPressed = true; this.rightDown = true; }
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; if (e.button === 2) this.rightDown = false; });
    document.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    document.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.mouseDown = false; this.rightDown = false; this.keys.clear(); }
      this.onLockChange?.(this.locked);
    });
  }

  private blocks(e: KeyboardEvent) {
    // Stop browserens egne genveje i spillet (Tab, mellemrum, F-taster undtaget F5/F12)
    return this.locked && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Digit') || e.code === 'KeyB' || e.code === 'KeyG' || e.code === 'ShiftLeft');
  }

  lock() {
    if (this.locked) return;
    try {
      const r = (this.canvas as HTMLCanvasElement).requestPointerLock?.({ unadjustedMovement: false } as never) as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => { /* kræver et nyt klik */ });
    } catch { /* ignorer */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  /** Knapper på skærmen trykker "virtuelle" taster */
  virtualDown(code: string) { if (!this.keys.has(code)) { this.keys.add(code); this.pressed.add(code); } }
  virtualUp(code: string) { this.keys.delete(code); }

  down(code: string) { return this.keys.has(code); }
  /** Blev tasten trykket siden sidste nulstilling? */
  hit(code: string) { return this.pressed.has(code); }
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0; this.mouseDY = 0;
    this.mousePressed = false; this.rightPressed = false; this.wheel = 0;
  }
}
