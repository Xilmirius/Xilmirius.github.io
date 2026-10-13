// Controles táctiles, la parte que no toca el DOM: qué dirección da la palanca, qué botones están apretados
// y a dónde se apunta. ui/touchControls.ts la conecta a los dedos y LocalInput la suma al teclado y al mouse.
//
// Apuntar con los dedos: no hay cursor, así que el punto apuntado se arma desde el personaje.
//   - nadie toca nada → mira hacia donde camina;
//   - dedo apoyado en un botón sin arrastrar → apunta solo al rival más cercano (la partida dice cuál);
//   - dedo arrastrado → apunta hacia donde se arrastra (y, si es un área en el piso, tan lejos como se arrastre).
import type { CastKey } from './castControl';

/** Palancas: zona muerta y desde dónde ya cuenta como "a fondo" (en radios). */
export const STICK = { dead: 0.14, full: 0.8 };
/** Segundos que se sigue apuntando a lo último después de soltar: el lanzamiento sale en el tick siguiente. */
const KEEP = 0.3;
/** A cuántos metros se apunta cuando solo importa la dirección. */
const REACH = 7;

/** Qué se apunta: el golpe (o el disparo), el empujón o una habilidad o ítem. */
export type AimKind = 'basic' | 'push' | CastKey;

export interface AimSpec {
  /** Hasta dónde llega (m). */
  reach: number;
  /** true: importa la distancia (un área en el piso). false: solo la dirección. */
  point: boolean;
}

interface Vec { x: number; z: number }
interface Aiming { kind: AimKind; x: number; z: number; dragged: boolean }

/** Del desplazamiento del dedo (en radios) a una dirección con fuerza 0..1. */
export function stick(dx: number, dy: number): { x: number; y: number; m: number } {
  const d = Math.hypot(dx, dy);
  if (d <= STICK.dead) return { x: 0, y: 0, m: 0 };
  const m = Math.min(1, (d - STICK.dead) / (STICK.full - STICK.dead));
  return { x: (dx / d) * m, y: (dy / d) * m, m };
}

export class TouchInput {
  /** Palanca de movimiento (-1..1; z positivo = hacia la cámara, como las teclas). */
  mx = 0;
  mz = 0;
  /** Cuándo se usó por última vez (ms): decide si se apunta con los dedos o con el mouse. */
  usedAt = -1e9;
  /** Dedos apoyados en los controles ahora. */
  engaged = 0;
  private bits = 0;
  private latch = 0;
  /** Botones que apuntan con el dedo apoyado, en el orden en que se apretaron: manda el último. */
  private aims: Aiming[] = [];
  private kept: Aiming | null = null;
  private keptT = 0;
  private face: Vec = { x: 0, z: 1 };

  /** Se tocó un control: desde ahora se apunta con los dedos (hasta que se mueva el mouse). */
  use() { this.usedAt = performance.now(); }

  /** Palanca de movimiento. */
  move(x: number, z: number) {
    this.mx = x;
    this.mz = z;
    this.use();
  }

  /** Botón apretado (un bit de BTN). Un toque más corto que un tick igual se registra. */
  press(bit: number) {
    this.bits |= bit;
    this.latch |= bit;
    this.use();
  }

  release(bit: number) { this.bits &= ~bit; }

  /** Se apoyó un dedo en un botón que apunta. */
  aimStart(kind: AimKind) {
    this.aimEnd(kind, false);
    this.aims.push({ kind, x: 0, z: 0, dragged: false });
    this.kept = null;
    this.use();
  }

  /** El dedo se movió: (x, z) es la palanca del botón (-1..1). */
  aimMove(kind: AimKind, x: number, z: number) {
    const a = this.aims.find((q) => q.kind === kind);
    if (!a) return;
    // Una vez que arrastró, volver al centro no lo devuelve a "apuntá solo": queda la última dirección.
    if (x !== 0 || z !== 0) { a.x = x; a.z = z; a.dragged = true; }
    this.use();
  }

  /** Se levantó el dedo. keep: seguir apuntando ahí un instante (lo que se lanza sale en el próximo tick). */
  aimEnd(kind: AimKind, keep = true) {
    const i = this.aims.findIndex((q) => q.kind === kind);
    if (i < 0) return;
    const [a] = this.aims.splice(i, 1);
    if (keep && !this.aims.length) { this.kept = a; this.keptT = KEEP; }
  }

  /** Lo que se está apuntando con un dedo apoyado, o null. */
  get aiming(): Readonly<Aiming> | null {
    return this.aims.length ? this.aims[this.aims.length - 1] : null;
  }

  /** Se soltó todo (la ventana perdió el foco, terminó la partida). */
  reset() {
    this.mx = this.mz = 0;
    this.bits = this.latch = 0;
    this.engaged = 0;
    this.aims = [];
    this.kept = null;
  }

  /** Movimiento y botones de este tick. */
  sample(): { mx: number; mz: number; b: number } {
    const b = this.bits | this.latch;
    this.latch = 0;
    return { mx: this.mx, mz: this.mz, b };
  }

  /**
   * Punto apuntado en este tick, relativo al personaje.
   * specOf: alcance de lo que se apunta. targetOf: a quién le apuntaría la ayuda (relativo al personaje), o null.
   */
  aim(dt: number, specOf: (k: AimKind) => AimSpec, targetOf: (k: AimKind) => Vec | null): Vec {
    const ml = Math.hypot(this.mx, this.mz);
    if (ml > 0.25) this.face = { x: this.mx / ml, z: this.mz / ml };
    let a: Aiming | null = this.aims.length ? this.aims[this.aims.length - 1] : null;
    if (!a && this.kept) {
      this.keptT -= dt;
      if (this.keptT <= 0) this.kept = null;
      a = this.kept;
    }
    if (!a) return { x: this.face.x * REACH, z: this.face.z * REACH };

    const spec = specOf(a.kind);
    let x: number, z: number;
    if (a.dragged) {
      const m = Math.hypot(a.x, a.z) || 1;
      const k = spec.point ? spec.reach : REACH / m;
      x = a.x * k;
      z = a.z * k;
    } else {
      const t = targetOf(a.kind);
      if (t) {
        const d = Math.hypot(t.x, t.z);
        const k = spec.point && d > spec.reach ? spec.reach / d : 1;
        x = t.x * k;
        z = t.z * k;
      } else {
        const d = spec.point ? spec.reach * 0.75 : REACH;
        x = this.face.x * d;
        z = this.face.z * d;
      }
    }
    // Queda mirando hacia donde apuntó hasta que vuelva a caminar.
    const l = Math.hypot(x, z);
    if (l > 0.3) this.face = { x: x / l, z: z / l };
    return { x, z };
  }
}
