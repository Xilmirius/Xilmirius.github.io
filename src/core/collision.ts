// Mundo de colisión: terreno (grilla) + obstáculos (destructibles y estructuras, AABB con altura).
// Lo usan el host (simulación completa) y el cliente (predicción de su propio movimiento).
import { CELL, CHAR_HEIGHT, ISLAND_BOTTOM, STEP_UP } from './constants';
import { Terrain } from './terrain';

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

export function circleOverlapsBox(x: number, z: number, r: number, minX: number, maxX: number, minZ: number, maxZ: number) {
  const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
  const dz = z < minZ ? minZ - z : z > maxZ ? z - maxZ : 0;
  return dx * dx + dz * dz < r * r;
}

export class CollisionWorld {
  obstacles: Obstacle[] = [];
  constructor(public terrain: Terrain) {}

  /** Superficie más alta bajo (x,z) cuyo tope sea <= maxY. -Infinity si no hay nada (vacío). */
  groundAt(x: number, z: number, maxY: number): number {
    let g = -Infinity;
    const t = this.terrain;
    const ci = t.cellIndexAt(x, z);
    const tt = t.topAt(ci, x, z);
    if (tt <= maxY + 1e-4) g = tt;
    for (const o of this.obstacles) {
      if (x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ && o.top <= maxY + 1e-4 && o.top > g) g = o.top;
    }
    return g;
  }

  /** ¿Un círculo en (x,z) de radio r con los pies en feetY choca contra algo que no puede subir? */
  blockAt(x: number, z: number, r: number, feetY: number, stepUp = STEP_UP): BlockHit | null {
    const t = this.terrain;
    if (feetY + CHAR_HEIGHT > ISLAND_BOTTOM) {
      const ix0 = Math.floor((x - r - t.originX) / CELL), ix1 = Math.floor((x + r - t.originX) / CELL);
      const iz0 = Math.floor((z - r - t.originZ) / CELL), iz1 = Math.floor((z + r - t.originZ) / CELL);
      for (let iz = iz0; iz <= iz1; iz++) {
        if (iz < 0 || iz >= t.h) continue;
        for (let ix = ix0; ix <= ix1; ix++) {
          if (ix < 0 || ix >= t.w) continue;
          const ci = iz * t.w + ix;
          if (!t.isSolidCell(ci)) continue;
          const b = t.cellBounds(ci);
          if (!circleOverlapsBox(x, z, r, b.minX, b.maxX, b.minZ, b.maxZ)) continue;
          const top = t.topAt(ci, x, z);
          if (top > feetY + stepUp) return { ...b, top, obstacle: null, cell: ci };
        }
      }
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
    const t = this.terrain;
    const ci = t.cellIndexAt(x, z);
    if (ci >= 0 && t.isSolidCell(ci)) {
      const top = t.topAt(ci, x, z);
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
