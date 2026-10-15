// Mundo de colisión: terreno (la malla, ver terrain.ts) + obstáculos (destructibles y estructuras, AABB con altura).
// Lo usan el host (simulación completa) y el cliente (predicción de su propio movimiento).
import { CHAR_HEIGHT, ISLAND_BOTTOM, STEP_UP } from './constants';
import { CONTACT_OBSTACLE, rectContact, type ContactSink } from './contact';
import { circleOverlapsBox } from './math';
import { Terrain } from './terrain';

export { circleOverlapsBox };
export { CONTACT_CELL, CONTACT_OBSTACLE, CONTACT_RAMP } from './contact';

export interface Obstacle {
  id: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
  base: number; top: number;
  kind: string;
}

export interface BlockHit {
  minX: number; maxX: number; minZ: number; maxZ: number;
  top: number;
  obstacle: Obstacle | null;
  cell: number;
}

/**
 * Un contacto de un círculo con algo que bloquea (docs/MALLA.md §6): la normal unitaria va de la superficie hacia el
 * cuerpo; `depth` es cuánto se mete el círculo; `top`, la altura de la cara de arriba de lo tocado; `kind`, qué es
 * (`CONTACT_*`); `cell`, la celda del plano de la que salió (-1 si es un obstáculo).
 */
export interface Contact {
  nx: number; nz: number;
  depth: number;
  top: number;
  kind: number;
  cell: number;
  obstacle: Obstacle | null;
}

/** La lista de contactos de la última pregunta. Los objetos se reusan: no se guardan de una pregunta a otra. */
class ContactList implements ContactSink {
  readonly list: Contact[] = [];
  private pool: Contact[] = [];

  add(nx: number, nz: number, depth: number, top: number, kind: number, cell: number, ob: unknown) {
    if (depth <= 0) return;
    const n = this.list.length;
    const c = this.pool[n] ?? (this.pool[n] = { nx: 0, nz: 0, depth: 0, top: 0, kind: 0, cell: -1, obstacle: null });
    c.nx = nx; c.nz = nz; c.depth = depth; c.top = top; c.kind = kind; c.cell = cell; c.obstacle = ob as Obstacle | null;
    this.list.push(c);
  }
}

export class CollisionWorld {
  obstacles: Obstacle[] = [];
  private found = new ContactList();
  constructor(public terrain: Terrain) {}

  /**
   * Contra qué está encimado un círculo en (x,z) de radio r con los pies en feetY: las celdas de la malla, las rampas y
   * los obstáculos que no puede subir. Es la misma lista que `blockAt`, pero con la normal y la profundidad de cada
   * contacto. La lista es de este mundo y se pisa en la próxima pregunta.
   */
  contacts(x: number, z: number, r: number, feetY: number, stepUp = STEP_UP): readonly Contact[] {
    const f = this.found;
    f.list.length = 0;
    if (feetY + CHAR_HEIGHT > ISLAND_BOTTOM) this.terrain.contacts(x, z, r, feetY, stepUp, f);
    for (const o of this.obstacles) {
      if (o.top <= feetY + stepUp || o.base >= feetY + CHAR_HEIGHT) continue;
      rectContact(f, x, z, r, o.minX, o.maxX, o.minZ, o.maxZ, o.top, CONTACT_OBSTACLE, -1, o);
    }
    return f.list;
  }

  /** Superficie más alta bajo (x,z) cuyo tope sea <= maxY. -Infinity si no hay nada (vacío). */
  groundAt(x: number, z: number, maxY: number): number {
    let g = -Infinity;
    const tt = this.terrain.groundAt(x, z);
    if (tt <= maxY + 1e-4) g = tt;
    for (const o of this.obstacles) {
      if (x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ && o.top <= maxY + 1e-4 && o.top > g) g = o.top;
    }
    return g;
  }

  /** ¿Un círculo en (x,z) de radio r con los pies en feetY choca contra algo que no puede subir? */
  blockAt(x: number, z: number, r: number, feetY: number, stepUp = STEP_UP): BlockHit | null {
    if (feetY + CHAR_HEIGHT > ISLAND_BOTTOM) {
      const hit = this.terrain.blockAt(x, z, r, feetY, stepUp);
      if (hit) return { ...hit, obstacle: null };
    }
    for (const o of this.obstacles) {
      if (o.top <= feetY + stepUp || o.base >= feetY + CHAR_HEIGHT) continue;
      if (circleOverlapsBox(x, z, r, o.minX, o.maxX, o.minZ, o.maxZ)) {
        return { minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ, top: o.top, obstacle: o, cell: -1 };
      }
    }
    return null;
  }

  /** Para proyectiles: ¿hay algo sólido que tape una esfera en (x,y,z)? */
  solidAt(x: number, y: number, z: number, r: number): { obstacle: Obstacle | null; cell: number } | null {
    const ci = this.terrain.groundCellAt(x, z);
    if (ci >= 0) {
      const top = this.terrain.groundAt(x, z);
      if (y < top && y > ISLAND_BOTTOM) return { obstacle: null, cell: ci };
    }
    for (const o of this.obstacles) {
      if (y - r > o.top || y + r < o.base) continue;
      if (circleOverlapsBox(x, z, r, o.minX, o.maxX, o.minZ, o.maxZ)) return { obstacle: o, cell: -1 };
    }
    return null;
  }

  /** Busca un punto con piso firme a lo largo de un segmento (para blinks/teleports). */
  lastSafePoint(x0: number, z0: number, x1: number, z1: number, feetY: number, r: number) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(d / 0.25));
    let best: { x: number; z: number; y: number } | null = null;
    for (let i = n; i >= 0; i--) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      const g = this.groundAt(x, z, feetY + 2);
      if (g === -Infinity) continue;
      if (this.blockAt(x, z, r, g)) continue;
      best = { x, z, y: g };
      break;
    }
    return best;
  }
}
