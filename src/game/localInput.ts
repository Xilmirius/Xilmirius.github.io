// Teclado + mouse → InputFrame. Todo al alcance de una mano (GDD §4).
import { BTN } from '../core/input';

const KEYMAP: Record<string, number> = {
  Space: BTN.JUMP, KeyQ: BTN.Q, KeyE: BTN.E, KeyF: BTN.F, KeyR: BTN.R,
  Digit1: BTN.I1, Digit2: BTN.I2, Digit3: BTN.I3, KeyV: BTN.REPAIR,
};

export class LocalInput {
  keys = new Set<string>();
  mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, left: false, right: false };
  private latch = 0;
  enabled = true;
  onKey: (code: string) => void = () => {};
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    window.addEventListener('blur', this.blur);
    el.addEventListener('mousedown', this.md);
    window.addEventListener('mouseup', this.mu);
    window.addEventListener('mousemove', this.mm);
    el.addEventListener('contextmenu', this.cm);
  }

  private typing(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  }

  private kd = (e: KeyboardEvent) => {
    if (this.typing(e)) return;
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!e.repeat) this.onKey(e.code);
    if (!this.enabled) return;
    this.keys.add(e.code);
    const b = KEYMAP[e.code];
    if (b) this.latch |= b;
  };

  private ku = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private blur = () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; };
  private md = (e: MouseEvent) => {
    if (!this.enabled) return;
    if (e.button === 0) { this.mouse.left = true; this.latch |= BTN.BASIC; }
    if (e.button === 2) { this.mouse.right = true; this.latch |= BTN.PUSH; }
  };
  private mu = (e: MouseEvent) => {
    if (e.button === 0) this.mouse.left = false;
    if (e.button === 2) this.mouse.right = false;
  };
  private mm = (e: MouseEvent) => {
    const r = this.el.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    this.mouse.ndcX = (this.mouse.x / r.width) * 2 - 1;
    this.mouse.ndcY = -(this.mouse.y / r.height) * 2 + 1;
  };
  private cm = (e: Event) => e.preventDefault();

  get shift() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }

  /** Movimiento (-1..1) y botones. Los toques rápidos se registran aunque duren menos de un tick. */
  sample(): { mx: number; mz: number; b: number } {
    if (!this.enabled) { this.latch = 0; return { mx: 0, mz: 0, b: 0 }; }
    const k = this.keys;
    let mx = 0, mz = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
    let b = 0;
    for (const [code, bit] of Object.entries(KEYMAP)) if (k.has(code)) b |= bit;
    if (this.mouse.left) b |= BTN.BASIC;
    if (this.mouse.right) b |= BTN.PUSH;
    // Un toque que empezó y terminó entre dos ticks se cuenta como mantenido en este tick.
    b |= this.latch;
    this.latch = 0;
    return { mx, mz, b };
  }

  dispose() {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    window.removeEventListener('blur', this.blur);
    this.el.removeEventListener('mousedown', this.md);
    window.removeEventListener('mouseup', this.mu);
    window.removeEventListener('mousemove', this.mm);
    this.el.removeEventListener('contextmenu', this.cm);
  }
}
