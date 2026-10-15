// Contornos de una región de celdas de la malla (docs/MALLA.md §7): los lados que separan lo que está adentro de lo
// que no, encadenados en lazos. Los usan las formas del terreno (una región por capa de altura) y las losas frágiles
// (una región por losa). Es solo dibujo: no toca la física.
import { LEVEL_H } from '../core/constants';
import { CellType, type Terrain } from '../core/terrain';
import type { TerrainMesh } from '../core/terrainMesh';

/** Un lado de celda que da afuera de la región: de `a` a `b`, con la región a la izquierda (las celdas giran con área positiva). */
export interface Seg {
  /** La celda de adentro y su lado (del vértice k al k+1). */
  q: number;
  k: number;
  a: number;
  b: number;
  /** La celda de afuera por ese lado, o -1 si no hay (vacío). */
  nb: number;
}

/** Los lados de las celdas de la región `inside` que dan a una celda que no es de la región (o a nada). */
export function boundarySegs(m: TerrainMesh, inside: Uint8Array): Seg[] {
  const out: Seg[] = [];
  for (let q = 0; q < m.count; q++) {
    if (!inside[q]) continue;
    for (let k = 0; k < 4; k++) {
      const nb = m.nbr[q * 4 + k];
      if (nb >= 0 && inside[nb]) continue;
      out.push({ q, k, a: m.quads[q * 4 + k], b: m.quads[q * 4 + ((k + 1) & 3)], nb });
    }
  }
  return out;
}

/**
 * Encadena los lados en lazos cerrados. Donde dos celdas se tocan solo en un vértice (un damero) hay dos lados que salen de
 * ahí: se sigue el que da vuelta más cerrado alrededor de la región, así cada rincón queda como un lazo propio y no se cruzan.
 */
export function traceLoops(m: TerrainMesh, segs: Seg[]): Seg[][] {
  const byStart = new Map<number, number[]>();
  for (let i = 0; i < segs.length; i++) {
    const l = byStart.get(segs[i].a);
    if (l) l.push(i); else byStart.set(segs[i].a, [i]);
  }
  const used = new Uint8Array(segs.length);
  const dir = (s: Seg): [number, number] => {
    const ex = m.vx[s.b] - m.vx[s.a], ez = m.vz[s.b] - m.vz[s.a], l = Math.hypot(ex, ez) || 1;
    return [ex / l, ez / l];
  };
  const loops: Seg[][] = [];
  for (let i0 = 0; i0 < segs.length; i0++) {
    if (used[i0]) continue;
    const loop: Seg[] = [segs[i0]];
    used[i0] = 1;
    let cur = i0;
    for (;;) {
      const cand = (byStart.get(segs[cur].b) ?? []).filter((i) => !used[i] || i === i0);
      if (!cand.length) break;
      let pick = cand[0];
      if (cand.length > 1) {
        // Ángulo, girando en el sentido de las agujas desde el lado por el que llegamos, hasta cada candidato.
        const [ix, iz] = dir(segs[cur]);
        const back = Math.atan2(-iz, -ix);
        let best = Infinity;
        for (const c of cand) {
          const [cx, cz] = dir(segs[c]);
          let a = back - Math.atan2(cz, cx);
          while (a <= 1e-9) a += Math.PI * 2;
          if (a < best) { best = a; pick = c; }
        }
      }
      if (pick === i0) break;
      used[pick] = 1;
      loop.push(segs[pick]);
      cur = pick;
    }
    loops.push(loop);
  }
  return loops;
}

/**
 * Lo que el dibujo necesita saber de la malla además de sus celdas: qué celdas rodean a cada vértice, qué tan alto es lo
 * que lo toca (la sombra de contacto) y dónde no se redondea nada porque hay una losa frágil o una rampa (las piezas
 * sueltas tienen que calzar).
 */
export class MeshAdj {
  readonly vStart: Int32Array;
  readonly vCells: Int32Array;
  /** Altura aproximada de cada celda para la sombra de contacto: las rampas cuentan como media altura. */
  readonly aoTop: Float64Array;
  /** La celda más alta que toca cada vértice. */
  readonly vTop: Float64Array;
  /** 1 si el vértice toca una losa frágil, una celda de rampa o una celda que bajó la franja de llegada. */
  readonly vBlocked: Uint8Array;

  constructor(t: Terrain) {
    const m = t.mesh;
    const nv = m.vx.length;
    const counts = new Int32Array(nv + 1);
    for (let i = 0; i < m.quads.length; i++) counts[m.quads[i] + 1]++;
    for (let v = 0; v < nv; v++) counts[v + 1] += counts[v];
    this.vStart = counts;
    this.vCells = new Int32Array(m.quads.length);
    const fill = counts.slice(0, nv);
    for (let q = 0; q < m.count; q++) for (let k = 0; k < 4; k++) this.vCells[fill[m.quads[q * 4 + k]]++] = q;
    this.aoTop = new Float64Array(m.count);
    const special = new Uint8Array(m.count);
    for (let q = 0; q < m.count; q++) {
      const c = t.cells[m.src[q]];
      const ramp = c.type === CellType.Ramp;
      this.aoTop[q] = ramp ? (c.level + 0.5) * LEVEL_H : m.top[q];
      special[q] = ramp || m.slab[q] >= 0 || m.lowered[q] ? 1 : 0;
    }
    this.vTop = new Float64Array(nv).fill(-Infinity);
    this.vBlocked = new Uint8Array(nv);
    for (let v = 0; v < nv; v++) {
      for (let n = counts[v]; n < counts[v + 1]; n++) {
        const q = this.vCells[n];
        if (this.aoTop[q] > this.vTop[v]) this.vTop[v] = this.aoTop[q];
        if (special[q]) this.vBlocked[v] = 1;
      }
    }
  }
}

const cache = new WeakMap<TerrainMesh, MeshAdj>();
/** El `MeshAdj` de la malla de un terreno (se arma una vez). */
export function adjOf(t: Terrain): MeshAdj {
  let a = cache.get(t.mesh);
  if (!a) { a = new MeshAdj(t); cache.set(t.mesh, a); }
  return a;
}
