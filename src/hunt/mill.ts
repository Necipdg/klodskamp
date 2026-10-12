// Vindmøllens vinger: fire lange kasser der drejer om navet. De er ankerpunkter for krogen (man kan hænge i
// en vinge og blive båret rundt) og man kan stå på dem. Samme transform bruges til tegning og kollision.
import type { MillDef } from './city';
import { tfChain, tfRotY, tfRotZ, tfTranslate, type Obb } from './tf';

export class Mill {
  angle: number;
  parts: { box: Obb }[] = [];
  constructor(readonly id: number, readonly def: MillDef) {
    this.angle = id * 0.7;
    this.compute();
  }
  update(dt: number) { this.angle += this.def.speed * dt; this.compute(); }
  compute() {
    const d = this.def, L = d.length;
    const base = tfChain(tfTranslate(d.hub.x, d.hub.y, d.hub.z), tfRotY(d.yaw));
    this.parts = [0, 1, 2, 3].map((k) => ({
      box: { tf: tfChain(base, tfRotZ(this.angle + (k * Math.PI) / 2), tfTranslate(0, L / 2 + 0.5, 0)), h: { x: 0.95, y: L / 2, z: 0.12 } },
    }));
  }
}
