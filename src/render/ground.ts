// Estilo del suelo compartido por la malla del terreno y su decoración: manchas grandes de vegetación
// y, en los mapas con líneas (Asedio), senderos gastados. Es solo estética: no toca la simulación.
import { CELL } from '../core/constants';
import type { Terrain } from '../core/terrain';

function hash(ix: number, iz: number, seed: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function distToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const k = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - ax - dx * k, z - az - dz * k);
}

export class GroundStyle {
  private seed: number;

  constructor(private t: Terrain) {
    this.seed = t.w * 31 + t.h * 7 + t.def.id.length;
  }

  /** 0..1: cuánta vegetación hay en ese punto (manchas suaves de varios metros). */
  patch(x: number, z: number) {
    const n = valueNoise(x / 7, z / 7, this.seed) * 0.7 + valueNoise(x / 2.6, z / 2.6, this.seed + 9) * 0.3;
    return smooth(Math.min(1, Math.max(0, (n - 0.42) / 0.26)));
  }

  /** 0..1: cuánto sendero hay en ese punto (1 = centro de una línea). */
  path(x: number, z: number) {
    let best = Infinity;
    for (const lane of this.t.lanes) {
      for (let i = 1; i < lane.length; i++) {
        const d = distToSegment(x, z, lane[i - 1].x, lane[i - 1].z, lane[i].x, lane[i].z);
        if (d < best) best = d;
      }
    }
    const wobble = (valueNoise(x / 1.7, z / 1.7, this.seed + 3) - 0.5) * 0.8;
    return smooth(Math.min(1, Math.max(0, (CELL * 1.25 - best - wobble) / (CELL * 0.6))));
  }

  /** Variación fija por celda (-1..1), para que no todas las losas tengan el mismo tono. */
  jitter(ix: number, iz: number) {
    return hash(ix, iz, this.seed + 17) * 2 - 1;
  }
}
