// Teclado + mouse → InputFrame. Todo al alcance de una mano (GDD §4).
// Habilidades e ítems: tecla = armar (se ve el área), clic izquierdo = lanzar, clic derecho/Esc = cancelar
// (ver castControl.ts). Las teclas de habilidad no se mandan "mantenidas": salen como un pulso al lanzar.
import { BTN } from '../core/input';
import { CAST_CODE, CastControl, type CastCheck, type CastKey } from './castControl';

const KEYMAP: Record<string, number> = {
  Space: BTN.JUMP, KeyV: BTN.REPAIR, KeyB: BTN.RECALL,
  ShiftLeft: BTN.DASH, ShiftRight: BTN.DASH,
};

/** Clics sobre estos elementos son de la interfaz, no del juego. */
const UI_TARGET = 'button, input, select, textarea, a, .forge, .results, .modal-wrap, .board, .gallery';

export class LocalInput {
  keys = new Set<string>();
  mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, left: false, right: false };
  private latch = 0;
  enabled = true;
  onKey: (code: string) => void = () => {};
  /** Habilidad armada y lanzamientos (la conecta la partida con el estado del personaje). */
  cast: CastControl;
  /** Un clic que se usó para lanzar/cancelar no cuenta como ataque/empujón hasta soltarlo. */
  private eatLeft = false;
  private eatRight = false;
  private el: HTMLElement;

  constructor(el: HTMLElement, check: (k: CastKey) => CastCheck = () => 'aim', deny?: (k: CastKey, why: string) => void) {
    this.el = el;
    this.cast = new CastControl(check, deny);
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    window.addEventListener('blur', this.blur);
    // En window (no solo el canvas): así pegar con el cursor encima del HUD también cuenta.
    window.addEventListener('mousedown', this.md);
    window.addEventListener('mouseup', this.mu);
    window.addEventListener('mousemove', this.mm);
    window.addEventListener('contextmenu', this.cm);
  }

  private typing(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  }

  private uiTarget(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t?.closest?.(UI_TARGET);
  }

  private kd = (e: KeyboardEvent) => {
    if (this.typing(e)) return;
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!e.repeat) this.onKey(e.code);
    if (!this.enabled) return;
    const ck = CAST_CODE[e.code];
    if (ck) { if (!e.repeat) this.cast.key(ck); return; }
    this.keys.add(e.code);
    const b = KEYMAP[e.code];
    if (b) this.latch |= b;
  };

  private ku = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private blur = () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; this.cast.cancel(); };
  private md = (e: MouseEvent) => {
    if (!this.enabled || this.uiTarget(e)) return;
    if (e.button === 0) {
      this.mouse.left = true;
      if (this.cast.leftClick()) this.eatLeft = true;
      else this.latch |= BTN.BASIC;
    }
    if (e.button === 2) {
      this.mouse.right = true;
      if (this.cast.cancel()) this.eatRight = true;
      else this.latch |= BTN.PUSH;
    }
  };
  private mu = (e: MouseEvent) => {
    if (e.button === 0) { this.mouse.left = false; this.eatLeft = false; }
    if (e.button === 2) { this.mouse.right = false; this.eatRight = false; }
  };
  private mm = (e: MouseEvent) => {
    const r = this.el.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    this.mouse.ndcX = (this.mouse.x / r.width) * 2 - 1;
    this.mouse.ndcY = -(this.mouse.y / r.height) * 2 + 1;
  };
  private cm = (e: Event) => { if (!this.typing(e) && !this.uiTarget(e)) e.preventDefault(); };

  /** Habilidad/ítem armado (se está apuntando), o null. */
  armed(): CastKey | null {
    return this.enabled ? this.cast.armed : null;
  }

  /** Movimiento (-1..1) y botones. Los toques rápidos se registran aunque duren menos de un tick. */
  sample(): { mx: number; mz: number; b: number } {
    if (!this.enabled) { this.latch = 0; this.cast.take(); this.cast.cancel(); return { mx: 0, mz: 0, b: 0 }; }
    const k = this.keys;
    let mx = 0, mz = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
    let b = 0;
    for (const [code, bit] of Object.entries(KEYMAP)) if (k.has(code)) b |= bit;
    if (this.mouse.left && !this.eatLeft) b |= BTN.BASIC;
    if (this.mouse.right && !this.eatRight) b |= BTN.PUSH;
    // Un toque que empezó y terminó entre dos ticks se cuenta como mantenido en este tick.
    b |= this.latch;
    this.latch = 0;
    // Lanzamientos: un pulso de un tick por habilidad (la simulación lanza al apretar).
    b |= this.cast.take();
    return { mx, mz, b };
  }

  dispose() {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('mousedown', this.md);
    window.removeEventListener('mouseup', this.mu);
    window.removeEventListener('mousemove', this.mm);
    window.removeEventListener('contextmenu', this.cm);
  }
}
