// Controles táctiles: la palanca de movimiento y los botones. Los botones son los casilleros del HUD (así
// muestran solos el enfriamiento, el bloqueo y lo que está armado); acá se les conectan los dedos.
// Qué significa cada gesto está en game/touchInput.ts; dónde va cada botón, en styles.css (.hud.touch).
//
//   - Mitad izquierda: palanca. Aparece donde apoyás el dedo y lo sigue si te pasás del borde.
//   - Golpe (o disparo) y empujón: se mantienen; arrastrando el dedo apuntás vos, sin arrastrar apunta solo.
//   - Habilidades e ítems: apoyar = armar (se ve el área), arrastrar = apuntar, soltar = lanzar.
//     Soltar sobre la ✕ cancela. Las que no se apuntan salen al toque.
//   - Saltar, dash, reparar y volver a la base: botones comunes.
import { BTN } from '../core/input';
import type { CastControl, CastKey } from '../game/castControl';
import { stick, type AimKind, type TouchInput } from '../game/touchInput';
import { h } from './dom';
import type { Hud } from './hud';

/** Botones que se mantienen apretados y van como un bit del input. */
const HOLD: Record<string, number> = { jump: BTN.JUMP, dash: BTN.DASH, repair: BTN.REPAIR, recall: BTN.RECALL };
/** Botones que apuntan mientras se mantienen. */
const AIM: Record<string, number> = { basic: BTN.BASIC, push: BTN.PUSH };
const CASTS: CastKey[] = ['q', 'e', 'f', 'r', 'i1', 'i2', 'i3'];

interface Gesture {
  /** Devolver false para no seguir este dedo (no había nada que mantener). */
  down(e: PointerEvent): boolean | void;
  /** dx, dy: cuánto se movió el dedo desde donde se apoyó (px). */
  move?(dx: number, dy: number, e: PointerEvent): void;
  up(e: PointerEvent, cancelled: boolean): void;
}

export class TouchControls {
  private zone = h('div', { class: 'touch-zone' });
  private base = h('div', { class: 'touch-stick' });
  private knob = h('i');
  private cancel = h('div', { class: 'touch-cancel' }, '✕');
  private reticle = h('div', { class: 'touch-reticle' });
  private offs: (() => void)[] = [];

  constructor(private hud: Hud, private input: TouchInput, private cast: CastControl, private hooks: { forge(): void }) {
    this.base.append(this.knob);
    this.zone.append(this.base);
    hud.root.prepend(this.zone);
    hud.root.append(this.cancel, this.reticle);
    this.bindStick();

    for (const [slot, bit] of Object.entries(HOLD)) {
      this.bind(hud.slot(slot), { down: () => this.input.press(bit), up: () => this.input.release(bit) });
    }
    for (const [slot, bit] of Object.entries(AIM)) {
      const el = hud.slot(slot), kind = slot as AimKind;
      this.bind(el, {
        down: () => { this.input.press(bit); this.input.aimStart(kind); },
        move: (dx, dy) => this.drag(el!, kind, dx, dy),
        up: (_e, cancelled) => { this.input.release(bit); this.input.aimEnd(kind, !cancelled); this.drop(el!); },
      });
    }
    for (const k of CASTS) {
      const el = hud.slot(k);
      this.bind(el, {
        down: () => {
          this.input.use();
          if (!this.cast.hold(k)) return false;
          this.input.aimStart(k);
          hud.root.classList.add('aiming');
        },
        move: (dx, dy, e) => { this.drag(el!, k, dx, dy); this.cancel.classList.toggle('hot', this.overCancel(e)); },
        up: (e, cancelled) => {
          const drop = cancelled || this.overCancel(e);
          // Si mientras tanto se armó otra cosa con otro dedo, esta ya no es la que sale.
          if (this.cast.armed === k) { if (drop) this.cast.cancel(); else this.cast.leftClick(); }
          this.input.aimEnd(k, !drop);
          this.drop(el!);
          this.cancel.classList.remove('hot');
          if (!CASTS.some((c) => this.input.aiming?.kind === c)) hud.root.classList.remove('aiming');
        },
      });
    }
    this.bind(hud.slot('forge'), { down: () => {}, up: (_e, cancelled) => { if (!cancelled) this.hooks.forge(); } });
  }

  /** Radio de las palancas en pantalla (px). */
  private radius() { return this.base.offsetWidth / 2 || 56; }

  /** Sigue a un dedo sobre un botón: uno por botón, capturado hasta que se levanta. */
  private bind(el: HTMLElement | null, g: Gesture) {
    if (!el) return;
    let id = -1, ox = 0, oy = 0;
    const down = (e: PointerEvent) => {
      if (id !== -1) return;
      // Sin esto el navegador manda después un clic de mouse (y sería un golpe).
      e.preventDefault();
      if (g.down(e) === false) return;
      id = e.pointerId;
      ox = e.clientX;
      oy = e.clientY;
      try { el.setPointerCapture(id); } catch { /* el dedo ya se fue */ }
      this.input.engaged++;
      el.classList.add('down');
    };
    const move = (e: PointerEvent) => { if (e.pointerId === id) g.move?.(e.clientX - ox, e.clientY - oy, e); };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      this.input.engaged = Math.max(0, this.input.engaged - 1);
      el.classList.remove('down');
      g.up(e, e.type !== 'pointerup');
    };
    const evs: [string, (e: PointerEvent) => void][] = [['pointerdown', down], ['pointermove', move], ['pointerup', end], ['pointercancel', end], ['lostpointercapture', end]];
    for (const [n, f] of evs) el.addEventListener(n, f as EventListener);
    el.classList.add('tbtn');
    this.offs.push(() => {
      for (const [n, f] of evs) el.removeEventListener(n, f as EventListener);
      el.classList.remove('tbtn', 'down');
    });
  }

  /** El dedo se arrastra sobre un botón que apunta: marca hacia dónde. */
  private drag(el: HTMLElement, kind: AimKind, dx: number, dy: number) {
    const r = this.radius();
    const s = stick(dx / r, dy / r);
    this.input.aimMove(kind, s.x, s.y);
    const d = Math.hypot(dx, dy), k = d > r ? r / d : 1;
    el.style.setProperty('--kx', `${dx * k}px`);
    el.style.setProperty('--ky', `${dy * k}px`);
    el.classList.toggle('dragged', s.m > 0);
  }

  private drop(el: HTMLElement) {
    el.classList.remove('dragged');
    el.style.removeProperty('--kx');
    el.style.removeProperty('--ky');
  }

  private overCancel(e: PointerEvent) {
    const r = this.cancel.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  /** La palanca de movimiento: aparece donde se apoya el dedo. */
  private bindStick() {
    const zone = this.zone;
    let id = -1, ox = 0, oy = 0;
    const place = () => {
      const r = zone.getBoundingClientRect();
      this.base.style.left = `${ox - r.left}px`;
      this.base.style.top = `${oy - r.top}px`;
      this.base.style.bottom = 'auto';
    };
    const set = (e: PointerEvent) => {
      const rad = this.radius();
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > rad) {
        // Te pasaste del borde: la base acompaña al dedo, así nunca "se te escapa" la palanca.
        ox += (dx / d) * (d - rad);
        oy += (dy / d) * (d - rad);
        dx = e.clientX - ox;
        dy = e.clientY - oy;
        place();
      }
      const s = stick(dx / rad, dy / rad);
      // Pantalla → mundo: derecha es +x y abajo es +z (hacia la cámara), igual que las teclas.
      this.input.move(s.x, s.y);
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const down = (e: PointerEvent) => {
      if (id !== -1) return;
      e.preventDefault();
      id = e.pointerId;
      ox = e.clientX;
      oy = e.clientY;
      try { zone.setPointerCapture(id); } catch { /* */ }
      this.input.engaged++;
      place();
      this.base.classList.add('on');
      set(e);
    };
    const move = (e: PointerEvent) => { if (e.pointerId === id) set(e); };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      this.input.engaged = Math.max(0, this.input.engaged - 1);
      this.input.move(0, 0);
      this.base.classList.remove('on');
      this.knob.style.transform = '';
      // Vuelve a su lugar de reposo (el del CSS).
      this.base.style.left = this.base.style.top = this.base.style.bottom = '';
    };
    const evs: [string, (e: PointerEvent) => void][] = [['pointerdown', down], ['pointermove', move], ['pointerup', end], ['pointercancel', end], ['lostpointercapture', end]];
    for (const [n, f] of evs) zone.addEventListener(n, f as EventListener);
  }

  /** Mira en pantalla: dónde se está apuntando el golpe o el disparo (no hay cursor que lo muestre). */
  aimAt(x: number, y: number, on: boolean) {
    this.reticle.classList.toggle('on', on);
    if (on) this.reticle.style.transform = `translate(${x}px, ${y}px)`;
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
    this.hud.root.classList.remove('aiming');
    this.zone.remove();
    this.cancel.remove();
    this.reticle.remove();
  }
}
