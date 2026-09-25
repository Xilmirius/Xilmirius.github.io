// Lanzamiento de habilidades e ítems activos, estilo MOBA:
//   tecla (asignable; por defecto Q 2 3 y E la ulti, ítems 1 R F) → la habilidad queda "armada" y se ve su área;
//   clic izquierdo → se lanza ahí;  clic derecho o Esc → se cancela.
// Las que no se apuntan (solo te afectan a vos o salen a tu alrededor) se lanzan al apretar la tecla.
// Volver a apretar la misma tecla con la habilidad armada también la lanza (para los que prefieren teclado).
// Con "lanzamiento rápido" (Ajustes) todas salen al apretar la tecla, directo al cursor.
// Es lógica pura (sin DOM) para poder testearla; LocalInput la conecta al teclado y al mouse.
import { BTN } from '../core/input';

export type CastKey = 'q' | 'e' | 'f' | 'r' | 'i1' | 'i2' | 'i3';
export const CAST_KEYS: CastKey[] = ['q', 'e', 'f', 'r', 'i1', 'i2', 'i3'];

export const CAST_BIT: Record<CastKey, number> = {
  q: BTN.Q, e: BTN.E, f: BTN.F, r: BTN.R, i1: BTN.I1, i2: BTN.I2, i3: BTN.I3,
};

/**
 * Qué se puede hacer con una tecla ahora:
 *  - 'aim': se arma y se apunta con el mouse;
 *  - 'now': sale al toque (no tiene objetivo);
 *  - un texto: no se puede (bloqueada, en enfriamiento, sin ítem...) y ese es el motivo.
 */
export type CastCheck = 'aim' | 'now' | string;

export class CastControl {
  /** Habilidad armada (se está apuntando), o null. */
  armed: CastKey | null = null;
  /** Lanzamiento rápido: todo sale al apretar la tecla. */
  quick = false;
  private pulses = 0;

  constructor(
    private check: (k: CastKey) => CastCheck,
    private deny: (k: CastKey, why: string) => void = () => {},
  ) {}

  /** Apretaron la tecla de una habilidad/ítem. */
  key(k: CastKey) {
    const c = this.check(k);
    if (c !== 'aim' && c !== 'now') {
      if (this.armed === k) this.armed = null;
      this.deny(k, c);
      return;
    }
    if (c === 'now' || this.quick || this.armed === k) this.fire(k);
    else this.armed = k;
  }

  /** Clic izquierdo. Devuelve true si lo usó para lanzar (entonces no es un ataque básico). */
  leftClick(): boolean {
    if (!this.armed) return false;
    const k = this.armed;
    const c = this.check(k);
    if (c !== 'aim' && c !== 'now') {
      // Dejó de estar disponible mientras apuntabas: avisar y seguir apuntando.
      this.deny(k, c);
      return true;
    }
    this.fire(k);
    return true;
  }

  /** Clic derecho o Esc. Devuelve true si canceló algo (entonces no es un empujón / menú). */
  cancel(): boolean {
    if (!this.armed) return false;
    this.armed = null;
    return true;
  }

  /** Bits de lanzamiento de este tick (cada lanzamiento sale en un solo tick: un "pulso"). */
  take(): number {
    const p = this.pulses;
    this.pulses = 0;
    return p;
  }

  /** Si lo armado ya no se puede usar (te moriste, cambió el estado), se desarma solo. */
  revalidate() {
    if (!this.armed) return;
    const c = this.check(this.armed);
    if (c !== 'aim') this.armed = null;
  }

  private fire(k: CastKey) {
    this.pulses |= CAST_BIT[k];
    this.armed = null;
  }
}
