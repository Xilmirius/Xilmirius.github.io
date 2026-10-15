// Apoyos: dónde hay lo que una pieza necesita para apoyarse (un muro, piso llano, el borde que da al vacío), medido sobre
// la malla real del terreno (docs/MALLA.md §5): el plano dice qué va y dónde, y esto dice si lo que se apoya ahí tiene
// dónde. Con la malla cuadrada la respuesta es la de siempre (el borde de la celda del plano); con la orgánica, la del
// contorno irregular. Es solo dibujo: no toca la simulación.
import { CELL } from '../core/constants';
import type { Terrain } from '../core/terrain';
import { SURF_FLOOR, SURF_NONE, SURF_RAMP, SURF_WALL, surfaceKind, type TerrainMesh } from '../core/terrainMesh';

/** Algo que se pregunta de un punto del mundo: ¿vale acá? */
export type Region = (x: number, z: number) => boolean;

/** Un punto del borde real que da al vacío, con su normal hacia afuera (unitaria) y la altura del piso ahí. */
export interface EdgePoint { x: number; z: number; nx: number; nz: number; y: number }

/** Paso con el que se camina buscando un borde: más fino que lo más angosto que se decora. */
const STEP = 0.05;
/** Cuánto más allá del borde tiene que haber vacío para que ese borde sea una costa y no el límite entre dos clases. */
const BEYOND = 0.12;

export class Support {
  readonly mesh: TerrainMesh;

  constructor(readonly t: Terrain) {
    this.mesh = t.mesh;
  }

  /** Qué hay en el punto: `SURF_*` (ver `surfaceAt`). */
  kind(x: number, z: number): number {
    return surfaceKind(this.mesh.surfaceAt(x, z));
  }

  /** La cara de arriba de un muro. */
  readonly wall: Region = (x, z) => this.kind(x, z) === SURF_WALL;

  /** Piso o rampa, de cualquier nivel (también las losas frágiles): todo lo que no es vacío ni muro. */
  readonly land: Region = (x, z) => {
    const k = this.kind(x, z);
    return k === SURF_FLOOR || k === SURF_RAMP;
  };

  /** Piso firme donde se pisa, de cualquier nivel, o una rampa: donde crece el pasto y se ponen las piedras. */
  readonly ground: Region = (x, z) => {
    const m = this.mesh, s = m.surfaceAt(x, z), k = surfaceKind(s);
    if (k === SURF_RAMP) return true;
    return k === SURF_FLOOR && m.slab[m.cellAt(x, z)] < 0;
  };

  /** Piso llano del nivel de abajo y firme, sin nada encima: donde va la pintura. */
  readonly paint: Region = (x, z) => {
    const m = this.mesh;
    if (m.surfaceAt(x, z) !== SURF_FLOOR * 8) return false;
    return m.slab[m.cellAt(x, z)] < 0;
  };

  /**
   * Cuánto se puede avanzar desde (x, z) en la dirección unitaria (dx, dz) sin salir de `inside`: la distancia hasta el borde,
   * afinada hasta menos de una milésima, o `max` si no sale nunca. El punto de partida tiene que estar adentro.
   */
  march(x: number, z: number, dx: number, dz: number, max: number, inside: Region): number {
    for (let d = STEP; ; d += STEP) {
      if (d > max) return max;
      if (inside(x + dx * d, z + dz * d)) continue;
      let lo = d - STEP, hi = d;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (inside(x + dx * mid, z + dz * mid)) lo = mid; else hi = mid;
      }
      return lo;
    }
  }

  /**
   * Hasta dónde llega `inside` a cada lado de (x, z) sobre la recta de dirección unitaria (dx, dz): [hacia atrás, hacia adelante],
   * en metros y los dos positivos. Si el punto mismo no está adentro, [0, 0].
   */
  span(x: number, z: number, dx: number, dz: number, max: number, inside: Region): [number, number] {
    if (!inside(x, z)) return [0, 0];
    return [this.march(x, z, -dx, -dz, max, inside), this.march(x, z, dx, dz, max, inside)];
  }

  /**
   * El borde real que da al vacío, siguiendo desde el centro (cx, cz) de una celda del plano hacia afuera por la normal unitaria
   * (nx, nz) de uno de sus lados, a `u` metros del medio del lado (sobre la tangente (-nz, nx)). `wall`: el borde es el de un muro
   * y no el de un piso. Si ahí no hay un borde que dé al vacío se prueba más cerca del medio; null si ni en el medio.
   */
  edgeAt(cx: number, cz: number, nx: number, nz: number, u: number, wall: boolean): EdgePoint | null {
    const inside = wall ? this.wall : this.land;
    for (const k of [1, 0.5, 0.25, 0]) {
      const uu = u * k, sx = cx - nz * uu, sz = cz + nx * uu;
      if (!inside(sx, sz)) continue;
      const d = this.march(sx, sz, nx, nz, CELL, inside);
      if (d >= CELL) continue;
      const px = sx + nx * d, pz = sz + nz * d;
      if (this.mesh.surfaceAt(px + nx * BEYOND, pz + nz * BEYOND) !== SURF_NONE) continue;
      return this.pointAt(px, pz, nx, nz);
    }
    return null;
  }

  /** El punto (px, pz) del borde, con la normal real del lado de la malla que lo forma (si no hay una a mano, la de referencia). */
  private pointAt(px: number, pz: number, nx: number, nz: number): EdgePoint {
    const m = this.mesh;
    const q = m.cellAt(px - nx * 0.01, pz - nz * 0.01);
    if (q < 0) return { x: px, z: pz, nx, nz, y: 0 };
    let bx = nx, bz = nz, best = 0.03;
    for (let k = 0; k < 4; k++) {
      if (m.nbr[q * 4 + k] >= 0) continue;
      const a = m.quads[q * 4 + k], b = m.quads[q * 4 + ((k + 1) & 3)];
      const ex = m.vx[b] - m.vx[a], ez = m.vz[b] - m.vz[a], l2 = ex * ex + ez * ez;
      if (l2 === 0) continue;
      const w = Math.min(1, Math.max(0, ((px - m.vx[a]) * ex + (pz - m.vz[a]) * ez) / l2));
      const d = Math.hypot(px - (m.vx[a] + ex * w), pz - (m.vz[a] + ez * w));
      if (d >= best) continue;
      const l = Math.sqrt(l2), ox = ez / l, oz = -ex / l;
      // Una normal casi perpendicular a la de referencia es la de otro lado de la celda (una esquina): no sirve.
      if (ox * nx + oz * nz < 0.3) continue;
      best = d; bx = ox; bz = oz;
    }
    return { x: px, z: pz, nx: bx, nz: bz, y: m.top[q] };
  }
}
