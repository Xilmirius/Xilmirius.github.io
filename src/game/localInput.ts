// Teclado + mouse (+ controles táctiles) → InputFrame. Todo al alcance de una mano (GDD §4). Las teclas son
// asignables (keybinds.ts); los dedos entran por touchInput.ts y se suman a lo demás.
// Habilidades e ítems: tecla = armar (se ve el área), clic izquierdo = lanzar, clic derecho/Esc = cancelar
// (ver castControl.ts). Las teclas de habilidad no se mandan "mantenidas": salen como un pulso al lanzar.
import { BTN } from '../core/input';
import { CastControl, type CastCheck, type CastKey } from './castControl';
import { actionOf, type ActionId } from './keybinds';
import type { TouchInput } from './touchInput';

/** Acciones que se mantienen y van como bits del input. */
const HOLD_BITS: Partial<Record<ActionId, number>> = { jump: BTN.JUMP, dash: BTN.DASH, repair: BTN.REPAIR, recall: BTN.RECALL };
const CAST_ACTIONS = new Set<ActionId>(['q', 'e', 'f', 'r', 'i1', 'i2', 'i3']);
/** Las flechas siempre mueven, además de las teclas asignadas. */
const ARROWS: Record<string, ActionId> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** Clics sobre estos elementos son de la interfaz, no del juego. */
const UI_TARGET = 'button, input, select, textarea, a, .forge, .gunrow, .results, .modal-wrap, .board, .gallery, .tbtn, .touch-zone';
/** Después de un toque, el navegador inventa un clic de mouse: durante este rato (ms) no se le hace caso. */
const GHOST_MS = 900;

export class LocalInput {
  keys = new Set<string>();
  mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, left: false, right: false };
  private latch = 0;
  enabled = true;
  /** Tecla apretada. Si devuelve true, la tecla ya se usó (no cuenta para lanzar ni para moverse). */
  onKey: (code: string) => boolean | void = () => {};
  /** Habilidad armada y lanzamientos (la conecta la partida con el estado del personaje). */
  cast: CastControl;
  /** Un clic que se usó para lanzar/cancelar no cuenta como ataque/empujón hasta soltarlo. */
  private eatLeft = false;
  private eatRight = false;
  private el: HTMLElement;
  /** Controles táctiles (si están a la vista). */
  touch: TouchInput | null = null;
  /** Último toque en la pantalla y último uso real del mouse (ms). */
  private touchAt = -1e9;
  private mouseAt = 0;

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
    window.addEventListener('pointerdown', this.pt, true);
    window.addEventListener('pointerup', this.pt, true);
    window.addEventListener('pointercancel', this.pt, true);
  }

  private typing(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  }

  private uiTarget(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t?.closest?.(UI_TARGET);
  }

  private action(code: string): ActionId | null {
    return ARROWS[code] ?? actionOf(code);
  }

  private kd = (e: KeyboardEvent) => {
    if (this.typing(e)) return;
    const a = this.action(e.code);
    // Teclas del juego: que no hagan lo del navegador (Tab cambia el foco, Espacio baja la página...).
    if (a || e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!e.repeat && this.onKey(e.code)) return;
    if (!this.enabled) return;
    if (a && CAST_ACTIONS.has(a)) { if (!e.repeat) this.cast.key(a as CastKey); return; }
    this.keys.add(e.code);
    const b = a ? HOLD_BITS[a] : undefined;
    if (b) this.latch |= b;
  };

  private ku = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private blur = () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; this.cast.cancel(); this.touch?.reset(); };
  private pt = (e: PointerEvent) => { if (e.pointerType === 'touch') this.touchAt = performance.now(); };
  /** ¿Es un clic de mentira, de los que el navegador manda después de un toque? */
  private ghost() { return performance.now() - this.touchAt < GHOST_MS; }
  private md = (e: MouseEvent) => {
    if (!this.enabled || this.uiTarget(e) || this.ghost()) return;
    this.mouseAt = performance.now();
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
    if (this.ghost()) return;
    // Arrastrar un botón táctil con el mouse (pantallas con las dos cosas) no es apuntar con el cursor.
    if (!this.touch?.engaged) this.mouseAt = performance.now();
    const r = this.el.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    this.mouse.ndcX = (this.mouse.x / r.width) * 2 - 1;
    this.mouse.ndcY = -(this.mouse.y / r.height) * 2 + 1;
  };

  /** Habilidad/ítem armado (se está apuntando), o null. */
  armed(): CastKey | null {
    return this.enabled ? this.cast.armed : null;
  }

  /** ¿Se está apuntando con los dedos? (lo último que se usó: los controles táctiles o el mouse) */
  touchAim(): boolean {
    return !!this.touch && this.touch.usedAt > this.mouseAt;
  }

  /** Movimiento (-1..1) y botones. Los toques rápidos se registran aunque duren menos de un tick. */
  sample(): { mx: number; mz: number; b: number } {
    const t = this.touch?.sample();
    if (!this.enabled) { this.latch = 0; this.cast.take(); this.cast.cancel(); return { mx: 0, mz: 0, b: 0 }; }
    const held = new Set<ActionId>();
    for (const code of this.keys) { const a = this.action(code); if (a) held.add(a); }
    let mx = 0, mz = 0;
    if (held.has('left')) mx -= 1;
    if (held.has('right')) mx += 1;
    if (held.has('up')) mz -= 1;
    if (held.has('down')) mz += 1;
    let b = t ? t.b : 0;
    if (t) { mx += t.mx; mz += t.mz; }
    for (const a of held) b |= HOLD_BITS[a] ?? 0;
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
    window.removeEventListener('pointerdown', this.pt, true);
    window.removeEventListener('pointerup', this.pt, true);
    window.removeEventListener('pointercancel', this.pt, true);
  }
}
