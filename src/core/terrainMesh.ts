// El plano del mapa estampado sobre la malla (docs/MALLA.md §4): las celdas con forma, clase y vecinas que después
// va a usar la física. Lee un `Terrain` sin cambiarlo.
//
// Dos formas de armarla, con el mismo resultado hacia afuera:
//  - cuadrada: un cuadrado por cada celda no vacía del plano, sin generador;
//  - orgánica: la malla de `mesh.ts` sobre la región del mapa (espejada en Arena y Asedio), estampada, con las rampas
//    apoyadas sobre piso llano y la franja de llegada bajada.
//
// Mismo determinismo que `mesh.ts`: solo `+ - * /`, `sqrt` y las funciones exactas. Host y clientes tienen que llegar
// a la misma malla, y por eso a la misma huella.
import { CELL, LEVEL_H, WALL_TOP } from './constants';
import { CellType, RampDir, type Terrain } from './terrain';
import { generateMesh, type QuadMesh } from './mesh';

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

/** Altura de la superficie de una cuña en (x,z), recortado a la cuña: lineal a lo largo de la dirección en que sube. */
export function wedgeTop(p: RampPiece, x: number, z: number): number {
  const w = p.wedge;
  const cx = x < w.minX ? w.minX : x > w.maxX ? w.maxX : x;
  const cz = z < w.minZ ? w.minZ : z > w.maxZ ? w.maxZ : z;
  const t = p.dx > 0 ? (cx - w.minX) / CELL : p.dx < 0 ? (w.maxX - cx) / CELL : p.dz > 0 ? (cz - w.minZ) / CELL : (w.maxZ - cz) / CELL;
  return (p.level + t) * LEVEL_H;
}

/** Clase de una celda de la malla: piso o muro. (El vacío no tiene celda.) */
export const MESH_FLOOR = 1, MESH_WALL = 2;
/** Qué hay en un punto (`surfaceAt`): `clase * 8 + nivel`. Cero = nada. */
export const SURF_NONE = 0, SURF_FLOOR = 1, SURF_WALL = 2, SURF_RAMP = 3;
export const surfaceKind = (s: number) => s >> 3;
export const surfaceLevel = (s: number) => s & 7;

/**
 * Pieza de una rampa. Dos partes apoyadas sobre piso llano: la cuña (la celda de rampa del plano, que sube de `level` a
 * `level + 1`) y el descanso, una losa llana al nivel de arriba que sigue 2 m más allá de la línea alta, ensanchada 1 m
 * de cada lado donde la plataforma sigue. Los dos son bloques sólidos desde el piso.
 */
export interface RampPiece {
  /** Celda de rampa del plano. */
  src: number;
  dir: RampDir;
  /** Nivel de abajo; el de arriba es `level + 1`. */
  level: number;
  /** Hacia donde sube, en x y en z (uno solo es distinto de cero). */
  dx: number;
  dz: number;
  /** Línea alta: la x (o la z) donde la cuña llega al nivel de arriba. */
  high: number;
  wedge: Rect;
  landing: Rect;
  /** Celdas de la malla que bajó la franja de llegada (vacío en la cuadrada). */
  lowered: number[];
}

export interface OrganicResult {
  /** La malla que pasó la comprobación, o null si ninguna de las semillas pasó. */
  mesh: TerrainMesh | null;
  /** La semilla de la última malla armada (la que pasó, si pasó alguna). */
  seed: number;
  attempts: number;
  /** Los problemas de la última malla probada: vacío si pasó. */
  problems: string[];
}

/** Intentos de la malla orgánica antes de rendirse y usar la cuadrada. */
export const ORGANIC_ATTEMPTS = 5;
const SEED_STEP = 65537;
/** Lado de los baldes del índice espacial. */
const BUCKET = 1;
const EPS = 1e-9;

/** ¿Las dos mitades del plano son espejo una de la otra? Arena y Asedio se arman así y la malla se espeja. */
export function isMirrored(t: Terrain): boolean {
  const k = t.def.kind ?? 'arena';
  return k === 'arena' || k === 'moba';
}

export const inRect = (r: Rect, x: number, z: number, tol = 0) => x >= r.minX - tol && x <= r.maxX + tol && z >= r.minZ - tol && z <= r.maxZ + tol;

export class TerrainMesh {
  readonly count: number;
  readonly vx: Float64Array;
  readonly vz: Float64Array;
  readonly quads: Int32Array;
  readonly cx: Float64Array;
  readonly cz: Float64Array;
  /** Distancia del centro al vértice más lejano. */
  readonly radius: Float64Array;
  /** `MESH_FLOOR` o `MESH_WALL`. */
  readonly cls: Uint8Array;
  readonly level: Int8Array;
  /** Celda del plano de la que salió. */
  readonly src: Int32Array;
  /** Losa frágil (índice de `Terrain.fragile`) o -1. */
  readonly slab: Int32Array;
  readonly pad: Uint8Array;
  /** 1 si la bajó una franja de llegada. */
  readonly lowered: Uint8Array;
  /** La celda vecina por cada lado k (del vértice k al k+1), o -1. */
  readonly nbr: Int32Array;
  readonly ramps: RampPiece[];
  /** Un número que cambia si cambia un vértice o una clase: host y cliente lo comparan. */
  readonly hash: number;
  /** Altura de lo plano de cada celda (un muro vale `WALL_TOP`). */
  readonly top: Float64Array;
  /** La caja que envuelve a cada celda. */
  readonly minX: Float64Array;
  readonly maxX: Float64Array;
  readonly minZ: Float64Array;
  readonly maxZ: Float64Array;
  /** Solo en la cuadrada: la celda de la malla de cada celda del plano (o -1), para responder sin buscar. */
  /** Cada lado k de cada celda q (índice q·4+k): su vértice inicial, su vector y el inverso de su largo al cuadrado (para las consultas). */
  private readonly edgeAx: Float64Array;
  private readonly edgeAz: Float64Array;
  private readonly edgeEx: Float64Array;
  private readonly edgeEz: Float64Array;
  private readonly edgeIl: Float64Array;
  private readonly grid: Int32Array | null;
  private readonly gw: number;
  private readonly gh: number;
  private readonly gx0: number;
  private readonly gz0: number;
  private readonly bx0: number;
  private readonly bz0: number;
  private readonly nbx: number;
  private readonly nbz: number;
  private readonly bStart: Int32Array;
  private readonly bItems: Int32Array;
  /** La altura de la celda más alta de cada balde: un balde de puro piso bajo se salta entero en `cellsNear`. */
  private readonly bTop: Float64Array;
  private readonly mark: Int32Array;
  private gen = 0;

  constructor(
    readonly mode: 'square' | 'organic',
    readonly seed: number,
    readonly attempts: number,
    d: {
      vx: Float64Array; vz: Float64Array; quads: Int32Array; cx: Float64Array; cz: Float64Array; radius: Float64Array;
      cls: Uint8Array; level: Int8Array; src: Int32Array; slab: Int32Array; pad: Uint8Array; lowered: Uint8Array;
      nbr: Int32Array; ramps: RampPiece[];
      grid?: { cells: Int32Array; w: number; h: number; x0: number; z0: number };
    },
  ) {
    this.grid = d.grid ? d.grid.cells : null;
    this.gw = d.grid ? d.grid.w : 0; this.gh = d.grid ? d.grid.h : 0;
    this.gx0 = d.grid ? d.grid.x0 : 0; this.gz0 = d.grid ? d.grid.z0 : 0;
    this.vx = d.vx; this.vz = d.vz; this.quads = d.quads; this.cx = d.cx; this.cz = d.cz; this.radius = d.radius;
    this.cls = d.cls; this.level = d.level; this.src = d.src; this.slab = d.slab; this.pad = d.pad;
    this.lowered = d.lowered; this.nbr = d.nbr; this.ramps = d.ramps;
    this.count = d.quads.length >> 2;
    this.top = new Float64Array(this.count);
    for (let q = 0; q < this.count; q++) this.top[q] = d.cls[q] === MESH_WALL ? WALL_TOP : d.level[q] * LEVEL_H;
    this.minX = new Float64Array(this.count); this.maxX = new Float64Array(this.count);
    this.minZ = new Float64Array(this.count); this.maxZ = new Float64Array(this.count);
    for (let q = 0; q < this.count; q++) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < 4; k++) {
        const v = d.quads[q * 4 + k];
        if (d.vx[v] < x0) x0 = d.vx[v];
        if (d.vx[v] > x1) x1 = d.vx[v];
        if (d.vz[v] < z0) z0 = d.vz[v];
        if (d.vz[v] > z1) z1 = d.vz[v];
      }
      this.minX[q] = x0; this.maxX[q] = x1; this.minZ[q] = z0; this.maxZ[q] = z1;
    }
    this.edgeAx = new Float64Array(this.count * 4); this.edgeAz = new Float64Array(this.count * 4);
    this.edgeEx = new Float64Array(this.count * 4); this.edgeEz = new Float64Array(this.count * 4);
    this.edgeIl = new Float64Array(this.count * 4);
    for (let q = 0; q < this.count; q++) {
      for (let k = 0; k < 4; k++) {
        const a = d.quads[q * 4 + k], b = d.quads[q * 4 + ((k + 1) & 3)], e = q * 4 + k;
        const ex = d.vx[b] - d.vx[a], ez = d.vz[b] - d.vz[a], l2 = ex * ex + ez * ez;
        this.edgeAx[e] = d.vx[a]; this.edgeAz[e] = d.vz[a]; this.edgeEx[e] = ex; this.edgeEz[e] = ez;
        this.edgeIl[e] = l2 > 0 ? 1 / l2 : 0;
      }
    }
    // Índice por baldes: cada celda en todos los baldes que toca su caja.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < d.vx.length; i++) {
      if (d.vx[i] < minX) minX = d.vx[i];
      if (d.vx[i] > maxX) maxX = d.vx[i];
      if (d.vz[i] < minZ) minZ = d.vz[i];
      if (d.vz[i] > maxZ) maxZ = d.vz[i];
    }
    if (this.count === 0) { minX = maxX = minZ = maxZ = 0; }
    this.bx0 = minX; this.bz0 = minZ;
    this.nbx = Math.floor((maxX - minX) / BUCKET) + 1;
    this.nbz = Math.floor((maxZ - minZ) / BUCKET) + 1;
    const counts = new Int32Array(this.nbx * this.nbz + 1);
    const range = (q: number, f: (b: number) => void) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < 4; k++) {
        const v = d.quads[q * 4 + k];
        if (d.vx[v] < x0) x0 = d.vx[v];
        if (d.vx[v] > x1) x1 = d.vx[v];
        if (d.vz[v] < z0) z0 = d.vz[v];
        if (d.vz[v] > z1) z1 = d.vz[v];
      }
      const i0 = Math.floor((x0 - minX) / BUCKET), i1 = Math.floor((x1 - minX) / BUCKET);
      const j0 = Math.floor((z0 - minZ) / BUCKET), j1 = Math.floor((z1 - minZ) / BUCKET);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * this.nbx + i);
    };
    for (let q = 0; q < this.count; q++) range(q, (b) => { counts[b + 1]++; });
    for (let b = 0; b < this.nbx * this.nbz; b++) counts[b + 1] += counts[b];
    this.bStart = counts;
    this.bItems = new Int32Array(counts[this.nbx * this.nbz]);
    const fill = counts.slice(0, this.nbx * this.nbz);
    for (let q = 0; q < this.count; q++) range(q, (b) => { this.bItems[fill[b]++] = q; });
    this.bTop = new Float64Array(this.nbx * this.nbz).fill(-Infinity);
    for (let b = 0; b < this.nbx * this.nbz; b++) {
      for (let n = counts[b]; n < counts[b + 1]; n++) if (this.top[this.bItems[n]] > this.bTop[b]) this.bTop[b] = this.top[this.bItems[n]];
    }
    this.mark = new Int32Array(this.count);
    // Huella: vértices (en 1/256 m) y clases de cada celda.
    let h = 2166136261;
    const mix = (v: number) => { h = Math.imul(h ^ (v | 0), 16777619); };
    mix(this.count);
    for (let q = 0; q < this.count; q++) {
      for (let k = 0; k < 4; k++) {
        const v = d.quads[q * 4 + k];
        mix(Math.round(d.vx[v] * 256)); mix(Math.round(d.vz[v] * 256));
      }
      mix(d.cls[q]); mix(d.level[q]); mix(d.src[q]); mix(d.slab[q]); mix(d.pad[q]);
    }
    this.hash = h >>> 0;
  }

  /** ¿El punto está dentro de la celda q (el borde cuenta)? Los cuadriláteros giran con área positiva. */
  contains(q: number, x: number, z: number): boolean {
    for (let e = q * 4; e < q * 4 + 4; e++) {
      if (this.edgeEx[e] * (z - this.edgeAz[e]) - this.edgeEz[e] * (x - this.edgeAx[e]) < -EPS) return false;
    }
    return true;
  }

  /** La celda de la malla en un punto, o -1 si es vacío. En un lado compartido, la de menor índice. */
  cellAt(x: number, z: number): number {
    if (this.grid) {
      const gi = Math.floor((x - this.gx0) / CELL), gj = Math.floor((z - this.gz0) / CELL);
      return gi < 0 || gj < 0 || gi >= this.gw || gj >= this.gh ? -1 : this.grid[gj * this.gw + gi];
    }
    const i = Math.floor((x - this.bx0) / BUCKET), j = Math.floor((z - this.bz0) / BUCKET);
    if (i < 0 || j < 0 || i >= this.nbx || j >= this.nbz) return -1;
    const b = j * this.nbx + i;
    for (let n = this.bStart[b]; n < this.bStart[b + 1]; n++) {
      const q = this.bItems[n];
      if (x < this.minX[q] || x > this.maxX[q] || z < this.minZ[q] || z > this.maxZ[q]) continue;
      if (this.contains(q, x, z)) return q;
    }
    return -1;
  }

  /** Distancia al cuadrado del punto al lado `e` (= celda·4 + lado). */
  private edgeDist2(e: number, x: number, z: number): number {
    const ax = this.edgeAx[e], az = this.edgeAz[e], ex = this.edgeEx[e], ez = this.edgeEz[e];
    let u = ((x - ax) * ex + (z - az) * ez) * this.edgeIl[e];
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const dx = x - (ax + ex * u), dz = z - (az + ez * u);
    return dx * dx + dz * dz;
  }

  /**
   * Las celdas que puede tocar un círculo (para la colisión). Llena `out` y lo devuelve. En la cuadrada son las de la caja
   * del círculo, en orden de fila (puede traer alguna que el círculo no toca: quien pregunta lo verifica); en la orgánica,
   * las que el círculo toca de verdad. Solo trae las celdas más altas que `above` (quien pregunta suele descartar las de piso
   * por el que ya camina antes de mirarlas, y así ni se prueba su forma).
   */
  cellsNear(x: number, z: number, r: number, out: number[] = [], above = -Infinity): number[] {
    out.length = 0;
    if (this.grid) {
      const i0 = Math.max(0, Math.floor((x - r - this.gx0) / CELL)), i1 = Math.min(this.gw - 1, Math.floor((x + r - this.gx0) / CELL));
      const j0 = Math.max(0, Math.floor((z - r - this.gz0) / CELL)), j1 = Math.min(this.gh - 1, Math.floor((z + r - this.gz0) / CELL));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) { const q = this.grid[j * this.gw + i]; if (q >= 0 && this.top[q] > above) out.push(q); }
      }
      return out;
    }
    const i0 = Math.max(0, Math.floor((x - r - this.bx0) / BUCKET)), i1 = Math.min(this.nbx - 1, Math.floor((x + r - this.bx0) / BUCKET));
    const j0 = Math.max(0, Math.floor((z - r - this.bz0) / BUCKET)), j1 = Math.min(this.nbz - 1, Math.floor((z + r - this.bz0) / BUCKET));
    const g = ++this.gen;
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const b = j * this.nbx + i;
        if (this.bTop[b] <= above) continue;
        for (let n = this.bStart[b]; n < this.bStart[b + 1]; n++) {
          const q = this.bItems[n];
          if (this.mark[q] === g || this.top[q] <= above) continue;
          this.mark[q] = g;
          if (this.maxX[q] < x - r || this.minX[q] > x + r || this.maxZ[q] < z - r || this.minZ[q] > z + r) continue;
          const e = q * 4;
          if (this.contains(q, x, z) || this.edgeDist2(e, x, z) <= r2 || this.edgeDist2(e + 1, x, z) <= r2
            || this.edgeDist2(e + 2, x, z) <= r2 || this.edgeDist2(e + 3, x, z) <= r2) out.push(q);
        }
      }
    }
    return out;
  }

  /** La rampa cuya cuña o cuyo descanso cubre el punto (la cuña manda), o -1. */
  rampAt(x: number, z: number): number {
    for (let i = 0; i < this.ramps.length; i++) if (inRect(this.ramps[i].wedge, x, z)) return i;
    for (let i = 0; i < this.ramps.length; i++) if (inRect(this.ramps[i].landing, x, z)) return i;
    return -1;
  }

  /**
   * Qué hay en el punto: `SURF_*` y nivel (`surfaceKind`, `surfaceLevel`). Un punto dentro de una cuña es rampa del
   * nivel de abajo; dentro de un descanso, piso del nivel de arriba; si no, lo que diga la celda de la malla.
   */
  surfaceAt(x: number, z: number): number {
    const r = this.rampAt(x, z);
    if (r >= 0) {
      const p = this.ramps[r];
      return inRect(p.wedge, x, z) ? SURF_RAMP * 8 + p.level : SURF_FLOOR * 8 + p.level + 1;
    }
    const q = this.cellAt(x, z);
    return q < 0 ? SURF_NONE : this.cls[q] * 8 + this.level[q];
  }
}

// ── Armado ───────────────────────────────────────────────────────────────────────────────────────

/** Un cuadrado por cada celda no vacía del plano, con los vértices compartidos. */
function squareQuads(t: Terrain): QuadMesh {
  const vw = t.w + 1;
  const vid = new Int32Array(vw * (t.h + 1)).fill(-1);
  const xs: number[] = [], zs: number[] = [], qs: number[] = [];
  const vert = (ix: number, iz: number) => {
    const k = iz * vw + ix;
    if (vid[k] < 0) { vid[k] = xs.length; xs.push(t.originX + ix * CELL); zs.push(t.originZ + iz * CELL); }
    return vid[k];
  };
  for (let iz = 0; iz < t.h; iz++) {
    for (let ix = 0; ix < t.w; ix++) {
      if (t.cells[iz * t.w + ix].type === CellType.Void) continue;
      // (+x, +z): el sentido de giro del módulo de la malla.
      qs.push(vert(ix, iz), vert(ix + 1, iz), vert(ix + 1, iz + 1), vert(ix, iz + 1));
    }
  }
  return { vx: Float64Array.from(xs), vz: Float64Array.from(zs), quads: Int32Array.from(qs), seed: 0, attempts: 1 };
}

const planCell = (t: Terrain, ix: number, iz: number) => (ix < 0 || iz < 0 || ix >= t.w || iz >= t.h ? null : t.cells[iz * t.w + ix]);

/** Las piezas de las rampas del plano (cuña y descanso). */
function buildRamps(t: Terrain): RampPiece[] {
  const out: RampPiece[] = [];
  for (let iz = 0; iz < t.h; iz++) {
    for (let ix = 0; ix < t.w; ix++) {
      const c = t.cells[iz * t.w + ix];
      if (c.type !== CellType.Ramp) continue;
      const dx = c.ramp === RampDir.W ? -1 : c.ramp === RampDir.E ? 1 : 0;
      const dz = c.ramp === RampDir.N ? -1 : c.ramp === RampDir.S ? 1 : 0;
      const b = t.cellBounds(iz * t.w + ix);
      const wedge: Rect = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
      const high = dx !== 0 ? (dx > 0 ? b.maxX : b.minX) : dz > 0 ? b.maxZ : b.minZ;
      // La celda de más allá de la línea alta, y las dos de sus costados (en x si la rampa sube en z, y al revés).
      const lx = ix + dx, lz = iz + dz;
      const upper = c.level + 1;
      const platform = (x: number, z: number) => { const o = planCell(t, x, z); return !!o && o.type === CellType.Floor && o.level === upper; };
      const extNeg = dx !== 0 ? platform(lx, lz - 1) : platform(lx - 1, lz);
      const extPos = dx !== 0 ? platform(lx, lz + 1) : platform(lx + 1, lz);
      const landing: Rect = dx !== 0
        ? { minX: dx > 0 ? high : high - CELL, maxX: dx > 0 ? high + CELL : high, minZ: b.minZ - (extNeg ? 1 : 0), maxZ: b.maxZ + (extPos ? 1 : 0) }
        : { minX: b.minX - (extNeg ? 1 : 0), maxX: b.maxX + (extPos ? 1 : 0), minZ: dz > 0 ? high : high - CELL, maxZ: dz > 0 ? high + CELL : high };
      out.push({ src: iz * t.w + ix, dir: c.ramp, level: c.level, dx, dz, high, wedge, landing, lowered: [] });
    }
  }
  return out;
}

/** Una malla de este `QuadMesh`: clasifica, baja las franjas de llegada (orgánica), limpia y arma el índice. */
function assemble(t: Terrain, qm: QuadMesh, mode: 'square' | 'organic', seed: number, attempts: number, mirror = false): TerrainMesh {
  const nq = qm.quads.length >> 2;
  // 1. Clase de cada celda de la malla: la del plano en su centro. Las que caen en vacío se descartan.
  const oq: number[] = [], kcx: number[] = [], kcz: number[] = [], kr: number[] = [];
  const kcls: number[] = [], klv: number[] = [], ksrc: number[] = [], kslab: number[] = [], kpad: number[] = [];
  for (let q = 0; q < nq; q++) {
    const v0 = qm.quads[q * 4], v1 = qm.quads[q * 4 + 1], v2 = qm.quads[q * 4 + 2], v3 = qm.quads[q * 4 + 3];
    const cx = (qm.vx[v0] + qm.vx[v1] + qm.vx[v2] + qm.vx[v3]) * 0.25, cz = (qm.vz[v0] + qm.vz[v1] + qm.vz[v2] + qm.vz[v3]) * 0.25;
    // En una malla espejada, un centro justo sobre el borde de dos celdas del plano se resuelve igual para los dos
    // gemelos: se mira el punto con x positiva y a la gemela se le da la celda espejada.
    let p = t.cellIndexAt(mirror ? Math.abs(cx) : cx, cz);
    if (p < 0) continue;
    if (mirror && cx < 0) p = Math.floor(p / t.w) * t.w + (t.w - 1 - (p % t.w));
    const c = t.cells[p];
    if (c.type === CellType.Void) continue;
    let r2 = 0;
    for (let k = 0; k < 4; k++) {
      const v = qm.quads[q * 4 + k];
      const dx = qm.vx[v] - cx, dz = qm.vz[v] - cz;
      if (dx * dx + dz * dz > r2) r2 = dx * dx + dz * dz;
    }
    oq.push(q); kcx.push(cx); kcz.push(cz); kr.push(Math.sqrt(r2));
    // Bajo una rampa hay piso llano del nivel de abajo (la pieza se apoya encima).
    kcls.push(c.type === CellType.Wall ? MESH_WALL : MESH_FLOOR);
    klv.push(c.level);
    ksrc.push(p);
    kslab.push(c.type === CellType.Floor ? c.fragile : -1);
    kpad.push(c.pad ? 1 : 0);
  }
  const nk = oq.length;
  const ramps = buildRamps(t);
  const lowered = new Uint8Array(nk);
  // 2. Franja de llegada: las celdas de plataforma con el centro en el primer metro después de la línea alta, a lo ancho
  // de la rampa, bajan al nivel de abajo. Ninguna celda de la plataforma llega entonces a taparle la subida a la cuña.
  if (mode === 'organic') {
    for (const p of ramps) {
      const a0 = p.dx !== 0 ? Math.min(p.high, p.high + p.dx) : Math.min(p.high, p.high + p.dz);
      const a1 = a0 + 1;
      const w = p.wedge;
      for (let k = 0; k < nk; k++) {
        if (kcls[k] !== MESH_FLOOR || klv[k] !== p.level + 1) continue;
        const along = p.dx !== 0 ? kcx[k] : kcz[k];
        const across = p.dx !== 0 ? kcz[k] : kcx[k];
        const c0 = p.dx !== 0 ? w.minZ : w.minX, c1 = p.dx !== 0 ? w.maxZ : w.maxX;
        if (along > a0 && along < a1 && across > c0 && across < c1) { klv[k] = p.level; lowered[k] = 1; p.lowered.push(k); }
      }
      // Una celda de la plataforma que asoma en la esquina de la cuña también baja si entra más de lo que se tolera
      // (la comprobación §6): el descanso, ensanchado, la tapa.
      const far = wedgeFarPart(p);
      for (let k = 0; k < nk; k++) {
        if (kcls[k] !== MESH_FLOOR || klv[k] !== p.level + 1) continue;
        if (Math.abs(kcx[k] - (w.minX + w.maxX) * 0.5) > CELL * 1.5 || Math.abs(kcz[k] - (w.minZ + w.maxZ) * 0.5) > CELL * 1.5) continue;
        const px: number[] = [], pz: number[] = [];
        for (let i = 0; i < 4; i++) { px.push(qm.vx[qm.quads[oq[k] * 4 + i]]); pz.push(qm.vz[qm.quads[oq[k] * 4 + i]]); }
        if (clippedArea(px, pz, far) > INTRUSION_EPS) { klv[k] = p.level; lowered[k] = 1; p.lowered.push(k); }
      }
    }
  }
  // 3. Vecinas de a pares (provisorias: la limpieza saca celdas).
  const nv = qm.vx.length;
  const nbrOld = new Int32Array(nk * 4).fill(-1);
  const edges = new Map<number, number>();
  for (let k = 0; k < nk; k++) {
    for (let s = 0; s < 4; s++) {
      const a = qm.quads[oq[k] * 4 + s], b = qm.quads[oq[k] * 4 + ((s + 1) & 3)];
      const key = a < b ? a * nv + b : b * nv + a;
      const other = edges.get(key);
      if (other === undefined) edges.set(key, k * 4 + s);
      else { nbrOld[k * 4 + s] = other >> 2; nbrOld[other] = k; }
    }
  }
  // 4. Limpieza: un grupito de piso sin conexión a pie con el resto (mismo nivel, lado compartido) que no contiene el
  // centro de ninguna celda del plano se elimina.
  const comp = new Int32Array(nk).fill(-1);
  const keep = new Uint8Array(nk).fill(1);
  const stack: number[] = [];
  const members: number[] = [];
  for (let k0 = 0; k0 < nk; k0++) {
    if (kcls[k0] !== MESH_FLOOR || comp[k0] >= 0) continue;
    members.length = 0;
    comp[k0] = k0; stack.push(k0);
    let hasCenter = false;
    while (stack.length) {
      const k = stack.pop()!;
      members.push(k);
      if (!hasCenter) {
        const cc = t.cellCenter(ksrc[k] % t.w, Math.floor(ksrc[k] / t.w));
        hasCenter = polyContains(qm, oq[k], cc.x, cc.z);
      }
      for (let s = 0; s < 4; s++) {
        const o = nbrOld[k * 4 + s];
        if (o >= 0 && comp[o] < 0 && kcls[o] === MESH_FLOOR && klv[o] === klv[k]) { comp[o] = k0; stack.push(o); }
      }
    }
    if (!hasCenter) for (const k of members) keep[k] = 0;
  }
  // 5. Compactar: celdas y vértices que quedan.
  const remap = new Int32Array(nk).fill(-1);
  let n = 0;
  for (let k = 0; k < nk; k++) if (keep[k]) remap[k] = n++;
  const vmap = new Int32Array(nv).fill(-1);
  const xs: number[] = [], zs: number[] = [];
  const quads = new Int32Array(n * 4);
  const cx = new Float64Array(n), cz = new Float64Array(n), radius = new Float64Array(n);
  const cls = new Uint8Array(n), level = new Int8Array(n), src = new Int32Array(n), slab = new Int32Array(n), pad = new Uint8Array(n), low = new Uint8Array(n);
  const nbr = new Int32Array(n * 4).fill(-1);
  for (let k = 0; k < nk; k++) {
    const j = remap[k];
    if (j < 0) continue;
    for (let s = 0; s < 4; s++) {
      const v = qm.quads[oq[k] * 4 + s];
      if (vmap[v] < 0) { vmap[v] = xs.length; xs.push(qm.vx[v]); zs.push(qm.vz[v]); }
      quads[j * 4 + s] = vmap[v];
      const o = nbrOld[k * 4 + s];
      if (o >= 0 && remap[o] >= 0) nbr[j * 4 + s] = remap[o];
    }
    cx[j] = kcx[k]; cz[j] = kcz[k]; radius[j] = kr[k];
    cls[j] = kcls[k]; level[j] = klv[k]; src[j] = ksrc[k]; slab[j] = kslab[k]; pad[j] = kpad[k]; low[j] = lowered[k];
  }
  for (const p of ramps) p.lowered = p.lowered.filter((k) => remap[k] >= 0).map((k) => remap[k]);
  let grid: { cells: Int32Array; w: number; h: number; x0: number; z0: number } | undefined;
  if (mode === 'square') {
    const cells = new Int32Array(t.w * t.h).fill(-1);
    for (let j = 0; j < n; j++) cells[src[j]] = j;
    grid = { cells, w: t.w, h: t.h, x0: t.originX, z0: t.originZ };
  }
  return new TerrainMesh(mode, seed, attempts, { vx: Float64Array.from(xs), vz: Float64Array.from(zs), quads, cx, cz, radius, cls, level, src, slab, pad, lowered: low, nbr, ramps, grid });
}

/** ¿El punto está dentro del cuadrilátero q de un `QuadMesh` (el borde cuenta)? */
function polyContains(qm: QuadMesh, q: number, x: number, z: number): boolean {
  for (let k = 0; k < 4; k++) {
    const a = qm.quads[q * 4 + k], b = qm.quads[q * 4 + ((k + 1) & 3)];
    if ((qm.vx[b] - qm.vx[a]) * (z - qm.vz[a]) - (qm.vz[b] - qm.vz[a]) * (x - qm.vx[a]) < -EPS) return false;
  }
  return true;
}

/** La malla cuadrada: un cuadrado por celda del plano. Siempre sale, y no tiene semilla. */
export function buildSquareMesh(t: Terrain): TerrainMesh {
  return assemble(t, squareQuads(t), 'square', 0, 1);
}

/** Una sola malla orgánica de esta semilla, sin comprobar. */
export function stampOrganic(t: Terrain, seed: number): TerrainMesh {
  const b = t.bounds();
  const qm = generateMesh({ region: b, seed, mirror: isMirrored(t) });
  return assemble(t, qm, 'organic', qm.seed, 1, isMirrored(t));
}

/**
 * La malla orgánica del mapa: prueba semillas sucesivas hasta que la comprobación pasa (`ORGANIC_ATTEMPTS`). Dice cuál
 * usó; si ninguna pasa, `mesh` es null y quien la pidió usa la cuadrada.
 */
export function buildOrganicMesh(t: Terrain, seed: number): OrganicResult {
  let problems: string[] = [];
  let used = seed >>> 0;
  for (let k = 0; k < ORGANIC_ATTEMPTS; k++) {
    used = (seed + Math.imul(k, SEED_STEP)) >>> 0;
    let m: TerrainMesh;
    try {
      m = stampOrganic(t, used);
    } catch (e) {
      problems = [`el generador falló con la semilla ${used}: ${(e as Error).message}`];
      continue;
    }
    problems = checkTerrainMesh(t, m);
    if (problems.length === 0) return { mesh: m, seed: used, attempts: k + 1, problems };
  }
  return { mesh: null, seed: used, attempts: ORGANIC_ATTEMPTS, problems };
}

// ── Comprobación (MALLA.md §4) ───────────────────────────────────────────────────────────────────

/** Área de un polígono convexo recortado a un rectángulo (Sutherland–Hodgman). 0 si no se tocan. */
function clippedArea(px: number[], pz: number[], r: Rect): number {
  let x = px, z = pz;
  const clip = (axisX: boolean, bound: number, keepGreater: boolean) => {
    const nx: number[] = [], nz: number[] = [];
    const n = x.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = axisX ? x[i] : z[i], b = axisX ? x[j] : z[j];
      const ina = keepGreater ? a >= bound : a <= bound, inb = keepGreater ? b >= bound : b <= bound;
      if (ina) { nx.push(x[i]); nz.push(z[i]); }
      if (ina !== inb) {
        const u = (bound - a) / (b - a);
        nx.push(x[i] + (x[j] - x[i]) * u); nz.push(z[i] + (z[j] - z[i]) * u);
      }
    }
    x = nx; z = nz;
  };
  clip(true, r.minX, true); if (!x.length) return 0;
  clip(true, r.maxX, false); if (!x.length) return 0;
  clip(false, r.minZ, true); if (!z.length) return 0;
  clip(false, r.maxZ, false); if (!z.length) return 0;
  let a = 0;
  for (let i = 0; i < x.length; i++) { const j = (i + 1) % x.length; a += x[i] * z[j] - x[j] * z[i]; }
  return Math.abs(a) * 0.5;
}

const CAP = 6;
/** Lo que una celda alta puede meterse en la cuña, en m²: menos que esto no cuenta. */
const INTRUSION_EPS = 1e-4;
/** Cuánto puede asomar una celda bajada fuera de la cuña y el descanso sin contar como pozo, en metros: una rendija más angosta que un cuerpo (0,5 m de diámetro) no lo atrapa. */
const COVER_TOL = 0.25;

/** La parte de la cuña que queda a más de 0,5 m de su línea alta: ahí no puede entrar ninguna celda más alta. */
function wedgeFarPart(p: RampPiece): Rect {
  const w = p.wedge;
  return p.dx !== 0
    ? { minX: p.dx > 0 ? w.minX : w.minX + 0.5, maxX: p.dx > 0 ? w.maxX - 0.5 : w.maxX, minZ: w.minZ, maxZ: w.maxZ }
    : { minX: w.minX, maxX: w.maxX, minZ: p.dz > 0 ? w.minZ : w.minZ + 0.5, maxZ: p.dz > 0 ? w.maxZ - 0.5 : w.maxZ };
}

/**
 * La comprobación de MALLA.md §4: la lista de problemas de la malla sobre el mapa (vacía si está todo bien). Para ella,
 * un punto que cae dentro de un descanso está al nivel de arriba de esa rampa.
 */
export function checkTerrainMesh(t: Terrain, m: TerrainMesh): string[] {
  const out: string[] = [];
  const add = (list: string[], msg: string) => { if (list.length < CAP) list.push(msg); };
  const name = (p: number) => `(${p % t.w},${Math.floor(p / t.w)})`;
  const kindOf = (c: { type: CellType }) => (c.type === CellType.Wall ? SURF_WALL : c.type === CellType.Ramp ? SURF_RAMP : SURF_FLOOR);

  // 1. El centro de cada celda no vacía del plano cae en una celda de la malla que salió de ella.
  const e1: string[] = [];
  for (let p = 0; p < t.cells.length; p++) {
    if (t.cells[p].type === CellType.Void) continue;
    const c = t.cellCenter(p % t.w, Math.floor(p / t.w));
    const q = m.cellAt(c.x, c.z);
    if (q < 0 || m.src[q] !== p) add(e1, `el centro de la celda ${name(p)} del plano no cae en una celda de la malla que salió de ella`);
  }
  out.push(...e1);

  // 2. El radio de toda celda es menor que 1 m (solo en la orgánica).
  if (m.mode === 'organic') {
    for (let q = 0; q < m.count; q++) {
      if (m.radius[q] >= CELL / 2) { out.push(`la celda ${q} de la malla tiene radio ${m.radius[q].toFixed(3)} m`); break; }
    }
  }

  // 3. Entre vecinas del plano de la misma clase y nivel, el segmento entre centros pisa siempre esa clase y ese nivel.
  const e3: string[] = [];
  for (let iz = 0; iz < t.h; iz++) {
    for (let ix = 0; ix < t.w; ix++) {
      const a = t.cells[iz * t.w + ix];
      if (a.type === CellType.Void) continue;
      for (let s = 0; s < 2; s++) {
        const jx = ix + (s === 0 ? 1 : 0), jz = iz + (s === 0 ? 0 : 1);
        const b = planCell(t, jx, jz);
        if (!b || b.type === CellType.Void || b.type !== a.type || b.level !== a.level) continue;
        const want = kindOf(a) * 8 + a.level;
        const ca = t.cellCenter(ix, iz);
        const n = Math.round(CELL / 0.1);
        for (let i = 0; i <= n; i++) {
          const x = ca.x + (s === 0 ? (CELL * i) / n : 0), z = ca.z + (s === 0 ? 0 : (CELL * i) / n);
          const got = m.surfaceAt(x, z);
          if (got !== want) {
            add(e3, `entre ${name(iz * t.w + ix)} y ${name(jz * t.w + jx)} del plano, el segmento pisa ${surfName(got)} en (${x.toFixed(2)}, ${z.toFixed(2)}) y debía ser ${surfName(want)}`);
            break;
          }
        }
      }
    }
  }
  out.push(...e3);

  // 4. Cada cosa del mapa está sobre piso del nivel que esperaba.
  const e4: string[] = [];
  const thing = (what: string, x: number, z: number, y: number) => {
    const want = SURF_FLOOR * 8 + Math.round(y / LEVEL_H);
    const got = m.surfaceAt(x, z);
    if (got !== want) add(e4, `${what} en (${x.toFixed(2)}, ${z.toFixed(2)}) pisa ${surfName(got)} y debía ser ${surfName(want)}`);
  };
  for (const team of t.spawns.team) for (const s of team) thing('una salida', s.x, s.z, s.y);
  for (const s of t.spawns.ffa) thing('una salida', s.x, s.z, s.y);
  for (const d of t.destructs) thing('una cobertura', d.x, d.z, d.y);
  for (const g of t.gadgets) thing(`un artefacto (${g.kind})`, g.x, g.z, g.y);
  for (const z of t.zonePoints) thing('un punto de zona', z.x, z.z, z.y);
  for (const p of t.towers) thing('una torre', p.x, p.z, 0);
  for (const p of t.cores) thing('un núcleo', p.x, p.z, 0);
  for (const c of t.camps) thing('un campamento', c.x, c.z, c.y);
  for (const l of t.lairs) thing('una guarida', l.x, l.z, l.y);
  out.push(...e4);

  const e5: string[] = [], e6: string[] = [], e7: string[] = [], e8: string[] = [];
  for (const p of m.ramps) {
    const tag = `La rampa ${name(p.src)}`;
    // 5. Ninguna rampa está embutida en una plataforma: a sus costados hay piso del nivel de abajo, vacío u otra rampa.
    const ix = p.src % t.w, iz = Math.floor(p.src / t.w);
    const sides = p.dx !== 0 ? [planCell(t, ix, iz - 1), planCell(t, ix, iz + 1)] : [planCell(t, ix - 1, iz), planCell(t, ix + 1, iz)];
    for (const s of sides) {
      if (s && (s.type === CellType.Wall || (s.type === CellType.Floor && s.level > p.level))) { add(e5, `${tag} está embutida en una plataforma`); break; }
    }
    // 6. Ninguna celda más alta que el nivel de abajo entra en la cuña más de 0,5 m antes de su línea alta.
    const w = p.wedge;
    const far = wedgeFarPart(p);
    for (const q of m.cellsNear((w.minX + w.maxX) / 2, (w.minZ + w.maxZ) / 2, CELL, [])) {
      if (m.cls[q] !== MESH_WALL && m.level[q] <= p.level) continue;
      const px: number[] = [], pz: number[] = [];
      for (let k = 0; k < 4; k++) { px.push(m.vx[m.quads[q * 4 + k]]); pz.push(m.vz[m.quads[q * 4 + k]]); }
      const a = clippedArea(px, pz, far);
      if (a > INTRUSION_EPS) { add(e6, `${tag}: una celda más alta (${q}) entra ${a.toFixed(3)} m² en la cuña antes de los últimos 0,5 m`); break; }
    }
    // 7. Toda celda bajada queda cubierta entera por la cuña y el descanso, o comparte un lado con piso de su mismo nivel.
    for (const q of p.lowered) {
      let covered = true;
      for (let k = 0; k < 4 && covered; k++) {
        const a = m.quads[q * 4 + k], b = m.quads[q * 4 + ((k + 1) & 3)];
        for (const [x, z] of [[m.vx[a], m.vz[a]], [(m.vx[a] + m.vx[b]) * 0.5, (m.vz[a] + m.vz[b]) * 0.5]]) {
          if (!inRect(w, x, z, COVER_TOL) && !inRect(p.landing, x, z, COVER_TOL)) { covered = false; break; }
        }
      }
      if (covered) continue;
      let shares = false;
      for (let s = 0; s < 4; s++) {
        const o = m.nbr[q * 4 + s];
        if (o >= 0 && m.cls[o] === MESH_FLOOR && m.level[o] === p.level && !m.lowered[o]) { shares = true; break; }
      }
      if (!shares) { add(e7, `${tag}: la celda ${q} bajada por la franja de llegada es un pozo`); break; }
    }
    // 8. El borde lejano del descanso cae sobre celdas del nivel de arriba.
    const l = p.landing;
    const farLine = p.dx > 0 ? l.maxX : p.dx < 0 ? l.minX : p.dz > 0 ? l.maxZ : l.minZ;
    // Solo el medio del descanso (0,5 m a cada lado del eje de la rampa): los ensanches siguen la plataforma de los
    // costados, que puede ser más corta, y el borde irregular de la plataforma se mete hasta 0,7 m hacia adentro.
    const mid = p.dx !== 0 ? (w.minZ + w.maxZ) * 0.5 : (w.minX + w.maxX) * 0.5;
    const a0 = mid - 0.25, a1 = mid + 0.25;
    const steps = 2;
    for (let i = 0; i <= steps; i++) {
      const u = a0 + ((a1 - a0) * i) / steps;
      const x = p.dx !== 0 ? farLine : u, z = p.dx !== 0 ? u : farLine;
      const q = m.cellAt(x, z);
      if (q < 0 || m.cls[q] !== MESH_FLOOR || m.level[q] !== p.level + 1) { add(e8, `${tag}: el borde lejano del descanso no cae sobre piso del nivel de arriba en (${x.toFixed(2)}, ${z.toFixed(2)})`); break; }
    }
  }
  out.push(...e5, ...e6, ...e7, ...e8);
  return out;
}

function surfName(s: number): string {
  const k = surfaceKind(s), l = surfaceLevel(s);
  return k === SURF_NONE ? 'vacío' : k === SURF_FLOOR ? `piso n${l}` : k === SURF_WALL ? 'muro' : `rampa n${l}`;
}
