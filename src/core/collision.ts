// Mundo de colisión: terreno (grilla) + obstáculos (destructibles y estructuras, AABB con altura).
// Lo usan el host (simulación completa) y el cliente (predicción de su propio movimiento).
import { CHAR_HEIGHT, ISLAND_BOTTOM, STEP_UP } from './constants';
import { circleOverlapsBox } from './math';
import { Terrain } from './terrain';

export { circleOverlapsBox };

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

export class CollisionWorld {
  obstacles: Obstacle[] = [];
  constructor(public terrain: Terrain) {}

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
