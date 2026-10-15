// Formas del terreno desde los polígonos de la malla (docs/MALLA.md §7, docs/TERRENO.md): la malla (cuadrada u orgánica) es
// la entrada y un solo camino de código decide la forma. Cada capa de altura (piso, plataformas, muros) es una meseta con su
// propio contorno: los lados de celda que separan lo que está en la capa de lo que no, encadenados en lazos. Es solo visual.
// Reglas para que el dibujo no le mienta a la colisión:
//   - se cortan solo las esquinas: el borde recto queda exactamente donde está el borde real. Una esquina saliente se corta
//     con un arco de 0,31 del lado más corto de los dos que la forman (tope R_OUT); una entrante lleva un relleno de 0,2
//     (tope R_IN). En la malla cuadrada (lados de 2 m) son los radios de siempre;
//   - el acantilado se abulta y se afina por DEBAJO del borde, nunca a la altura del piso;
//   - al lado de una losa frágil o de una rampa no se corta nada, así las piezas sueltas calzan justas (por eso no hay que
//     recalcular nada cuando una losa se cae: el hueco es el de la losa).
//
// El terreno se arma por capas de altura. Cada capa incluye todo lo que es de su altura o más, así que donde una plataforma
// redondea la esquina se ve el piso que tiene debajo.
import * as THREE from 'three';
import { ISLAND_BOTTOM, LEVEL_H, WALL_TOP } from '../core/constants';
import type { Terrain } from '../core/terrain';
import { inRect, type RampPiece, type Rect, type TerrainMesh } from '../core/terrainMesh';
import { adjOf, boundarySegs, traceLoops, type MeshAdj, type Seg } from './contour';
import type { GroundStyle } from './ground';

/** Radio de las esquinas salientes y de las entrantes (m) en una malla de lados de 2 m. */
export const R_OUT = 0.62;
export const R_IN = 0.4;
/** Cuánto del lado más corto se corta en una esquina saliente y se rellena en una entrante (con tope R_OUT y R_IN). */
const CUT_OUT = 0.31;
const CUT_IN = 0.2;
/** Un quiebre del contorno menor que esto (rad, unos 11°) no es una esquina: el borde sigue derecho. */
const MIN_TURN = 0.2;
/** Un quiebre más cerrado que esto no se redondea. */
const MAX_TURN = 2.8;
/** Tramos de un arco de 90° y largo de los tramos rectos del acantilado. */
const ARC = 4;
const STEP = 0.5;
/** Distancia en la que el relieve del acantilado se apaga al llegar a una esquina viva. */
const TAPER = 0.8;
/** Un vecino más alto que esto oscurece el piso a su pie (sombra de contacto). */
const AO_STEP = 0.6;
const AO_DARK = 0.72;
/** Lo que se levanta el descanso de una rampa sobre la plataforma para que no le pelee la profundidad. */
const LIFT = 0.006;
/** Los lados más largos que esto se parten en tramos de a un metro, para que el color del suelo tenga de dónde tomar. */
const SPLIT = 1.5;

/** Qué hay del otro lado de un tramo de borde, para decidir las formas. */
export const enum Cls { Void, Fragile, Ramp, Solid }

/** Colores de la roca y de los muros (la ambientación de cada juego trae los suyos). */
export interface TerrainLook {
  /** Estratos del acantilado, de arriba hacia abajo. */
  rockTop: number;
  rockBottom: number;
  /** Franja de tierra justo debajo del borde. */
  soil: number;
  /** Cara de arriba de los muros. */
  wallTop: number;
  /** Costados de muros y plataformas, de arriba hacia abajo. */
  wallSide: number;
  wallFoot: number;
  /** Franja pintada sobre el borde que da al vacío (los pianos de la Carrera, las rayas de peligro de la Horda). */
  edge?: EdgePaint;
  /** Juntas: una línea fina pintada sobre los lados entre celdas de la misma capa (un empedrado irregular). Apagadas si falta. */
  joints?: JointPaint;
}

/** stripe: largo de cada raya (m); width: ancho de la franja hacia adentro (m). */
export interface EdgePaint { colors: number[]; stripe: number; width: number }
/** color de la junta y ancho de la línea (m). */
export interface JointPaint { color: number; width: number }

export const DEFAULT_LOOK: TerrainLook = { rockTop: 0xc9b39a, rockBottom: 0x5a4a3e, soil: 0x7a5c44, wallTop: 0x8b7b6c, wallSide: 0xa8957f, wallFoot: 0x6b5a4c };

interface Rim { x: number; z: number; nx: number; nz: number; amp: number }
/** Un anillo del perfil de un costado: altura respecto del borde, cuánto sale hacia afuera y cuánta rugosidad lleva. */
interface Ring { y: number; off: number; rough: number }

const CLIFF: Ring[] = [
  { y: 0, off: 0, rough: 0 },
  { y: -0.26, off: 0.06, rough: 0.03 },
  { y: -0.9, off: 0.15, rough: 0.13 },
  { y: -1.8, off: 0.0, rough: 0.22 },
  { y: ISLAND_BOTTOM, off: -0.4, rough: 0.3 },
  { y: ISLAND_BOTTOM - 1.4, off: -1.0, rough: 0.35 },
];
/** Pared del hueco que deja una losa frágil: recta, para que la losa calce. */
const PIT: Ring[] = [{ y: 0, off: 0, rough: 0 }, { y: ISLAND_BOTTOM / 2, off: 0, rough: 0 }, { y: ISLAND_BOTTOM, off: 0, rough: 0 }];

/**
 * Un tramo del contorno de una capa, con la normal hacia afuera en cada punto: lo que necesita la decoración para ir
 * pegada al borde (tarea 16). Entre dos tramos consecutivos cambia lo que hay del otro lado, o hay una esquina viva.
 */
export interface ShapeContour {
  /** Altura de la capa. */
  h: number;
  /** Qué hay del otro lado: vacío, una losa frágil o piso más bajo. */
  out: Cls;
  /** ¿La cara de arriba pegada a este tramo está justo a la altura de la capa (y no más alto)? */
  mine: boolean;
  /** El tramo es un lazo entero: el último punto vuelve a ser el primero. */
  closed: boolean;
  x: number[];
  z: number[];
  nx: number[];
  nz: number[];
}

export interface TerrainShape {
  /** Caras de arriba (piso, plataformas y muros), con textura de suelo. */
  top: THREE.BufferGeometry;
  /** Roca facetada: acantilados y costados de muros y plataformas. */
  rock: THREE.BufferGeometry;
  /** Tiras sobre los bordes que dan al vacío. */
  neon: THREE.BufferGeometry | null;
  /** Pintura sobre el piso: la franja del borde, el cordón de las plataformas y las juntas. */
  paint: THREE.BufferGeometry | null;
  /** El contorno de cada capa, ya con las esquinas cortadas. */
  contours: ShapeContour[];
}

/**
 * Un punto de una cara de arriba: posición, sombra de contacto y, si es un vértice de la malla, cuál. `e` es el lado de la celda
 * (0 a 3) sobre el que va el tramo que sale de este punto hacia el siguiente, o -1 si ese tramo es una cuerda de un arco.
 */
interface Pt { x: number; z: number; ao: number; v?: number; e?: number }

/** Una esquina saliente cortada: el cono de su interior y, por cada cuerda del arco, un punto y la normal hacia afuera. */
interface Cut {
  vx: number; vz: number;
  /** Los dos rayos que salen del vértice por los lados de la esquina. */
  r1x: number; r1z: number; r2x: number; r2z: number;
  chord: number[];
}

const inWedge = (c: Cut, x: number, z: number) => {
  const ux = x - c.vx, uz = z - c.vz, det = c.r1x * c.r2z - c.r1z * c.r2x;
  const a = (ux * c.r2z - uz * c.r2x) / det, b = (c.r1x * uz - c.r1z * ux) / det;
  return a >= -1e-9 && b >= -1e-9;
};

/** Recorta un polígono convexo a un semiplano: se queda con lo que está del lado de atrás de la normal (nx, nz) por (px, pz). */
function clipHalf(poly: Pt[], px: number, pz: number, nx: number, nz: number): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const da = (a.x - px) * nx + (a.z - pz) * nz, db = (b.x - px) * nx + (b.z - pz) * nz;
    if (da <= 1e-9) out.push(a);
    if ((da < -1e-9 && db > 1e-9) || (da > 1e-9 && db < -1e-9)) {
      // Desde el corte hacia adelante el tramo sigue sobre el lado de la celda si entraba; si salía, sigue sobre la cuerda.
      const u = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, ao: a.ao + (b.ao - a.ao) * u, e: da > 1e-9 ? a.e : -1 });
    }
  }
  return out;
}

export class TerrainShaper {
  private topPos: number[] = [];
  private topUv: number[] = [];
  private topCol: number[] = [];
  private rockPos: number[] = [];
  private rockCol: number[] = [];
  private neonPos: number[] = [];
  private paintPos: number[] = [];
  private paintCol: number[] = [];
  private contours: ShapeContour[] = [];
  private ground: THREE.Color;
  private ground2: THREE.Color;
  private m: TerrainMesh;
  private adj: MeshAdj;
  /** Color de las caras de arriba de los vértices de la malla en la capa que se está armando. */
  private vcol = new Map<number, THREE.Color>();
  /** Los descansos de rampa de la capa que se está armando: lo que queda debajo de ellos no se pinta (los tapa su cara de arriba). */
  private under: Rect[] = [];

  constructor(t: Terrain, private style: GroundStyle, private look: TerrainLook = DEFAULT_LOOK) {
    this.ground = new THREE.Color(t.def.ground);
    this.ground2 = new THREE.Color(t.def.ground2);
    this.m = t.mesh;
    this.adj = adjOf(t);
  }

  /** Alturas de las capas, de abajo hacia arriba. La 0 es el piso. */
  layers(): number[] {
    const m = this.m;
    const hs = new Set<number>([0]);
    for (let q = 0; q < m.count; q++) if (m.slab[q] < 0 && m.top[q] > 0) hs.add(m.top[q]);
    return [...hs].sort((a, b) => a - b);
  }

  /** ¿La celda de la malla es parte de la meseta de altura h? Las losas frágiles no: son piezas aparte. */
  inLayer(h: number, q: number): boolean {
    const m = this.m;
    return m.slab[q] < 0 && (h === 0 || m.top[q] >= h - 1e-6);
  }

  build(): TerrainShape {
    for (const h of this.layers()) this.buildLayer(h);
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(this.topPos, 3));
    top.setAttribute('uv', new THREE.Float32BufferAttribute(this.topUv, 2));
    top.setAttribute('color', new THREE.Float32BufferAttribute(this.topCol, 3));
    const nor = new Float32Array(this.topPos.length);
    for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
    top.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    top.computeBoundingSphere();
    const rock = new THREE.BufferGeometry();
    rock.setAttribute('position', new THREE.Float32BufferAttribute(this.rockPos, 3));
    rock.setAttribute('color', new THREE.Float32BufferAttribute(this.rockCol, 3));
    rock.computeVertexNormals();
    rock.computeBoundingSphere();
    let neon: THREE.BufferGeometry | null = null;
    if (this.neonPos.length) {
      neon = new THREE.BufferGeometry();
      neon.setAttribute('position', new THREE.Float32BufferAttribute(this.neonPos, 3));
      neon.computeBoundingSphere();
    }
    let paint: THREE.BufferGeometry | null = null;
    if (this.paintPos.length) {
      paint = new THREE.BufferGeometry();
      paint.setAttribute('position', new THREE.Float32BufferAttribute(this.paintPos, 3));
      paint.setAttribute('color', new THREE.Float32BufferAttribute(this.paintCol, 3));
      const pn = new Float32Array(this.paintPos.length);
      for (let i = 1; i < pn.length; i += 3) pn[i] = 1;
      paint.setAttribute('normal', new THREE.BufferAttribute(pn, 3));
      paint.computeBoundingSphere();
    }
    return { top, rock, neon, paint, contours: this.contours };
  }

  // ───────────── una capa ─────────────

  private buildLayer(h: number) {
    const m = this.m;
    this.vcol.clear();
    this.under = m.mode === 'organic' ? m.ramps.filter((p) => Math.abs((p.level + 1) * LEVEL_H - h) < 1e-6).map((p) => p.landing) : [];
    const inL = new Uint8Array(m.count);
    for (let q = 0; q < m.count; q++) inL[q] = this.inLayer(h, q) ? 1 : 0;
    const cuts = new Map<number, Cut[]>();
    for (const loop of traceLoops(m, boundarySegs(m, inL))) this.contour(h, loop, cuts);
    for (let q = 0; q < m.count; q++) if (inL[q]) this.topFace(h, q, cuts);
    if (this.look.joints) this.joints(h, inL, cuts);
    // El descanso de una rampa es una losa llana al nivel de arriba (en la cuadrada coincide con la plataforma y no se dibuja).
    if (m.mode === 'organic') for (const p of m.ramps) if (Math.abs((p.level + 1) * LEVEL_H - h) < 1e-6) this.landing(h, p);
  }

  /** Sombra de contacto de un vértice de la malla: oscuro si lo toca algo bastante más alto que la capa. */
  private vAO(h: number, v: number) { return this.adj.vTop[v] > h + AO_STEP ? AO_DARK : 1; }

  /**
   * Un lazo del contorno de la capa: clasifica cada vértice (recto, esquina saliente, entrante o viva), arma el borde con las
   * esquinas cortadas y cuelga de él los costados, el neón y la pintura. Las esquinas salientes quedan anotadas en `cuts`
   * para recortar las caras de arriba; las entrantes se rellenan acá.
   */
  private contour(h: number, loop: Seg[], cuts: Map<number, Cut[]>) {
    const m = this.m, adj = this.adj, n = loop.length;
    const ux = new Float64Array(n), uz = new Float64Array(n), len = new Float64Array(n);
    const cls: Cls[] = new Array(n), mine: boolean[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const s = loop[i];
      const ex = m.vx[s.b] - m.vx[s.a], ez = m.vz[s.b] - m.vz[s.a];
      len[i] = Math.hypot(ex, ez);
      ux[i] = ex / len[i]; uz[i] = ez / len[i];
      cls[i] = s.nb < 0 ? Cls.Void : m.slab[s.nb] >= 0 ? Cls.Fragile : Cls.Solid;
      mine[i] = Math.abs(m.top[s.q] - h) < 1e-6;
    }
    // Vértice i: donde termina el lado i-1 y empieza el i.
    const kind = new Uint8Array(n); // 0 recto, 1 saliente, 2 entrante, 3 vivo
    const cutD = new Float64Array(n), turn = new Float64Array(n);
    const taper = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const p = (i + n - 1) % n;
      const cross = ux[p] * uz[i] - uz[p] * ux[i], dot = ux[p] * ux[i] + uz[p] * uz[i];
      const phi = Math.atan2(Math.abs(cross), dot);
      turn[i] = phi;
      const blocked = adj.vBlocked[loop[i].a] === 1;
      if (phi < MIN_TURN) { kind[i] = 0; taper[i] = cls[p] !== cls[i] ? 1 : 0; continue; }
      if (blocked || phi > MAX_TURN) { kind[i] = 3; taper[i] = 1; continue; }
      kind[i] = cross > 0 ? 1 : 2;
      const short = Math.min(len[p], len[i]);
      cutD[i] = kind[i] === 1 ? Math.min(CUT_OUT * short, R_OUT) : Math.min(CUT_IN * short, R_IN);
    }

    // El borde, punto por punto. Cada punto lleva el atributo del tramo que sale de él (clase de lo de afuera y si la cara
    // de arriba es de esta capa), o BREAK si ahí hay una esquina viva (el borde se parte y el relieve se apaga).
    const BREAK = -1;
    const px: number[] = [], pz: number[] = [], pnx: number[] = [], pnz: number[] = [], pattr: number[] = [], psharp: number[] = [];
    const push = (x: number, z: number, nx: number, nz: number, attr: number, sharp: boolean) => {
      px.push(x); pz.push(z); pnx.push(nx); pnz.push(nz); pattr.push(attr); psharp.push(sharp ? 1 : 0);
    };
    const attrOf = (i: number) => cls[i] * 2 + (mine[i] ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const p = (i + n - 1) % n, a = loop[i].a;
      const vx = m.vx[a], vz = m.vz[a];
      const n1x = uz[p], n1z = -ux[p], n2x = uz[i], n2z = -ux[i];
      if (kind[i] === 0) {
        const sx = n1x + n2x, sz = n1z + n2z, l = Math.hypot(sx, sz) || 1;
        push(vx, vz, sx / l, sz / l, attrOf(i), taper[i] === 1);
      } else if (kind[i] === 3) {
        push(vx, vz, n1x, n1z, BREAK, true);
        push(vx, vz, n2x, n2z, attrOf(i), true);
      } else {
        const arc = this.arcPoints(h, loop[i].a, vx, vz, ux[p], uz[p], ux[i], uz[i], turn[i], cutD[i], kind[i] === 1, cuts);
        const arcCls = cls[p] === Cls.Void && cls[i] === Cls.Void ? Cls.Void : Cls.Solid;
        const arcAttr = arcCls * 2 + (mine[p] && mine[i] ? 1 : 0);
        for (let j = 0; j < arc.length; j += 4) push(arc[j], arc[j + 1], arc[j + 2], arc[j + 3], j + 4 < arc.length ? arcAttr : attrOf(i), false);
      }
      // Los puntos del tramo recto, sin los extremos (los pone el vértice).
      const next = (i + 1) % n;
      const l2 = len[i] - cutD[i] - cutD[next];
      const steps = Math.max(1, Math.round(l2 / STEP));
      const x0 = vx + ux[i] * cutD[i], z0 = vz + uz[i] * cutD[i];
      for (let j = 1; j < steps; j++) {
        const u = (l2 * j) / steps;
        push(x0 + ux[i] * u, z0 + uz[i] * u, n2x, n2z, attrOf(i), false);
      }
    }
    const N = px.length;

    // Relieve: se apaga a TAPER metros de cada esquina viva.
    const amp = new Float64Array(N).fill(1);
    const cum = new Float64Array(N + 1);
    for (let j = 0; j < N; j++) cum[j + 1] = cum[j] + Math.hypot(px[(j + 1) % N] - px[j], pz[(j + 1) % N] - pz[j]);
    const total = cum[N];
    if (psharp.some((s) => s === 1)) {
      let last = -Infinity;
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < N; j++) {
          const s = cum[j] + pass * total;
          if (psharp[j]) last = s;
          if (pass === 1 || last > -Infinity) amp[j] = Math.min(amp[j], Math.max(0, Math.min(1, (s - last) / TAPER)));
        }
      }
      let next = Infinity;
      for (let pass = 1; pass >= 0; pass--) {
        for (let j = N - 1; j >= 0; j--) {
          const s = cum[j] + pass * total;
          if (psharp[j]) next = s;
          if (pass === 0 || next < Infinity) amp[j] = Math.min(amp[j], Math.max(0, Math.min(1, (next - s) / TAPER)));
        }
      }
    }

    // Los tramos: puntos consecutivos con el mismo atributo.
    const starts: number[] = [];
    for (let j = 0; j < N; j++) if (pattr[j] !== BREAK && pattr[(j + N - 1) % N] !== pattr[j]) starts.push(j);
    const runs: [number, number][] = []; // desde el punto j hasta el punto e (inclusive)
    if (!starts.length) runs.push([0, N]);
    for (const j of starts) {
      let e = j;
      while (e - j < N && pattr[e % N] === pattr[j]) e++;
      runs.push([j, e]);
    }
    for (const [j, e] of runs) {
      const attr = pattr[j % N];
      const out = (attr >> 1) as Cls, own = (attr & 1) === 1;
      const rim: Rim[] = [];
      for (let k = j; k <= e; k++) {
        const i = k % N;
        rim.push({ x: px[i], z: pz[i], nx: pnx[i], nz: pnz[i], amp: out === Cls.Fragile ? 0 : amp[i] });
      }
      this.side(h, rim, out);
      if (own) this.trim(h, rim, out === Cls.Void);
      this.contours.push({ h, out, mine: own, closed: !starts.length, x: rim.map((r) => r.x), z: rim.map((r) => r.z), nx: rim.map((r) => r.nx), nz: rim.map((r) => r.nz) });
    }
  }

  /**
   * El arco de una esquina: de un punto a `d` antes del vértice a otro a `d` después, tangente a los dos lados. Devuelve
   * x, z, nx, nz de cada punto (la normal sale del piso). En una saliente el centro queda adentro y el arco le corta la punta
   * a la capa; en una entrante queda afuera y el arco rellena el rincón (las caras de ese relleno se arman acá).
   */
  private arcPoints(h: number, v: number, vx: number, vz: number, ix: number, iz: number, ox: number, oz: number, phi: number, d: number, salient: boolean, cuts: Map<number, Cut[]>): number[] {
    const r = d / Math.tan(phi / 2);
    const segs = Math.max(1, Math.ceil(phi / (Math.PI / 2 / ARC) - 1e-6));
    const lx = -iz, lz = ix; // a la izquierda de la entrada: de ese lado está la capa
    const p1x = vx - ix * d, p1z = vz - iz * d;
    const sgn = salient ? 1 : -1;
    const cx = p1x + sgn * lx * r, cz = p1z + sgn * lz * r;
    const u0x = -sgn * lx, u0z = -sgn * lz;
    const out: number[] = [];
    for (let j = 0; j <= segs; j++) {
      const th = sgn * phi * (j / segs), c = Math.cos(th), s = Math.sin(th);
      const ux = u0x * c - u0z * s, uz = u0x * s + u0z * c;
      out.push(cx + ux * r, cz + uz * r, sgn * ux, sgn * uz);
    }
    if (salient) {
      const chord: number[] = [];
      for (let j = 0; j < segs; j++) {
        const a = j * 4, b = (j + 1) * 4;
        const nx = out[a + 2] + out[b + 2], nz = out[a + 3] + out[b + 3], l = Math.hypot(nx, nz) || 1;
        chord.push(out[a], out[a + 1], nx / l, nz / l);
      }
      const cut: Cut = { vx, vz, r1x: -ix, r1z: -iz, r2x: ox, r2z: oz, chord };
      const l = cuts.get(v);
      if (l) l.push(cut); else cuts.set(v, [cut]);
    } else {
      // Relleno: abanico desde el vértice por los puntos del arco.
      const vc = this.topColor(h, vx, vz, this.vAO(h, v));
      const cols: THREE.Color[] = [];
      for (let j = 0; j <= segs; j++) cols.push(this.topColor(h, out[j * 4], out[j * 4 + 1], 1));
      for (let j = 0; j < segs; j++) {
        this.topTri(h, [vx, vz], vc, [out[j * 4], out[j * 4 + 1]], cols[j], [out[(j + 1) * 4], out[(j + 1) * 4 + 1]], cols[j + 1]);
      }
    }
    return out;
  }

  // ───────────── caras ─────────────

  /** La cara de arriba de una celda: su polígono, sin la punta de las esquinas salientes que el contorno corta. */
  private topFace(h: number, q: number, cuts: Map<number, Cut[]>) {
    const m = this.m;
    let poly: Pt[] = [];
    const covered = this.adj.aoTop[q] > h + AO_STEP;
    for (let k = 0; k < 4; k++) { const v = m.quads[q * 4 + k]; poly.push({ x: m.vx[v], z: m.vz[v], ao: this.vAO(h, v), v, e: k }); }
    if (cuts.size) {
      // Las esquinas salientes cortadas que tocan a esta celda: la punta que se corta no ensombrece el arco que la reemplaza.
      const mine: Cut[] = [];
      for (let k = 0; k < 4; k++) {
        const list = cuts.get(m.quads[q * 4 + k]);
        if (!list) continue;
        for (const c of list) {
          if (!inWedge(c, m.cx[q], m.cz[q])) continue;
          mine.push(c);
          poly[k].ao = covered ? AO_DARK : 1;
        }
      }
      for (const c of mine) {
        for (let j = 0; j < c.chord.length; j += 4) poly = clipHalf(poly, c.chord[j], c.chord[j + 1], c.chord[j + 2], c.chord[j + 3]);
        if (poly.length < 3) return;
      }
    }
    // Los lados largos se parten, para que el color del suelo se tome cada metro como siempre. En un lado de la celda, el punto
    // del medio se oscurece si lo que hay del otro lado es bastante más alto.
    const ring: Pt[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      ring.push(a);
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      if (l > SPLIT) {
        const parts = Math.ceil(l / 1);
        const nb = a.e !== undefined && a.e >= 0 ? m.nbr[q * 4 + a.e] : -2;
        for (let j = 1; j < parts; j++) {
          const u = j / parts;
          const ao = nb === -2 ? a.ao + (b.ao - a.ao) * u : covered || (nb >= 0 && this.adj.aoTop[nb] > h + AO_STEP) ? AO_DARK : 1;
          ring.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, ao });
        }
      }
    }
    // El abanico sale del centro de la celda (si el recorte no se lo llevó) y si no, del promedio de sus puntos.
    let cx = m.cx[q], cz = m.cz[q];
    for (let i = 0; i < poly.length && cx !== undefined; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if ((b.x - a.x) * (cz - a.z) - (b.z - a.z) * (cx - a.x) < 0) { cx = NaN; break; }
    }
    if (Number.isNaN(cx)) {
      cx = 0; cz = 0;
      for (const p of ring) { cx += p.x; cz += p.z; }
      cx /= ring.length; cz /= ring.length;
    }
    this.fan(h, h, { x: cx, z: cz, ao: covered ? AO_DARK : 1 }, ring);
  }

  private pointColor(h: number, p: Pt): THREE.Color {
    if (p.v === undefined) return this.topColor(h, p.x, p.z, p.ao);
    const key = p.v * 2 + (p.ao < 1 ? 1 : 0);
    let c = this.vcol.get(key);
    if (!c) { c = this.topColor(h, p.x, p.z, p.ao); this.vcol.set(key, c); }
    return c;
  }

  /** Abanico desde `center` por los puntos de `ring`, a la altura y. */
  private fan(h: number, y: number, center: Pt, ring: Pt[]) {
    const cc = this.pointColor(h, center);
    const cols = ring.map((p) => this.pointColor(h, p));
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      this.topTri(y, [center.x, center.z], cc, [ring[i].x, ring[i].z], cols[i], [ring[j].x, ring[j].z], cols[j]);
    }
  }

  private topColor(h: number, x: number, z: number, ao: number): THREE.Color {
    const st = this.style;
    if (h >= WALL_TOP - 1e-6) return new THREE.Color(this.look.wallTop).offsetHSL(0, 0, (st.tone(x, z) - 0.5) * 0.09).multiplyScalar(ao);
    const base = this.ground.clone().lerp(this.ground2, st.tone(x, z));
    if (h > 0) base.lerp(new THREE.Color(0xffffff), 0.12);
    const grass = base.clone().offsetHSL(0.075, 0.07, -0.07);
    const dirt = base.clone().offsetHSL(-0.015, -0.1, -0.12);
    return base.lerp(grass, st.patch(x, z) * 0.75).lerp(dirt, st.path(x, z) * 0.8).multiplyScalar(ao);
  }

  /** Triángulo de una cara de arriba a la altura y. */
  private topTri(y: number, a: [number, number], ca: THREE.Color, b: [number, number], cb: THREE.Color, c: [number, number], cc: THREE.Color) {
    // Que mire hacia arriba, venga en el orden que venga.
    const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
    const pts: [[number, number], THREE.Color][] = up ? [[a, ca], [b, cb], [c, cc]] : [[a, ca], [c, cc], [b, cb]];
    for (const [p, col] of pts) {
      this.topPos.push(p[0], y, p[1]);
      this.topUv.push(p[0] * 0.23, p[1] * 0.23);
      this.topCol.push(col.r, col.g, col.b);
    }
  }

  // ───────────── el descanso de una rampa ─────────────

  /** ¿Hay algo sólido de la altura de la capa (o más) en este punto? Lo que tapa el costado de un descanso. */
  private coveredAt(h: number, x: number, z: number): boolean {
    const m = this.m;
    for (const p of m.ramps) if (inRect(p.wedge, x, z) || inRect(p.landing, x, z)) return true;
    const q = m.cellAt(x, z);
    return q >= 0 && m.slab[q] < 0 && m.top[q] >= h - 1e-6;
  }

  /**
   * El descanso de una rampa: una losa llana al nivel de arriba, apoyada sobre la malla (que ahí bajó la franja de llegada).
   * Se levanta un poco sobre la plataforma, que lo pisa en parte, y cuelga su costado donde no hay plataforma que lo tape.
   */
  private landing(h: number, p: RampPiece) {
    const l = p.landing, y = h + LIFT;
    const nx = Math.max(1, Math.ceil((l.maxX - l.minX) / 1)), nz = Math.max(1, Math.ceil((l.maxZ - l.minZ) / 1));
    const col: THREE.Color[] = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) col.push(this.topColor(h, l.minX + ((l.maxX - l.minX) * i) / nx, l.minZ + ((l.maxZ - l.minZ) * j) / nz, 1));
    const at = (i: number, j: number): [number, number] => [l.minX + ((l.maxX - l.minX) * i) / nx, l.minZ + ((l.maxZ - l.minZ) * j) / nz];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const c00 = col[j * (nx + 1) + i], c10 = col[j * (nx + 1) + i + 1], c01 = col[(j + 1) * (nx + 1) + i], c11 = col[(j + 1) * (nx + 1) + i + 1];
        this.topTri(y, at(i, j), c00, at(i + 1, j), c10, at(i + 1, j + 1), c11);
        this.topTri(y, at(i, j), c00, at(i + 1, j + 1), c11, at(i, j + 1), c01);
      }
    }
    // Costados: por cada lado del rectángulo, los tramos que no tapa ni la plataforma ni la cuña.
    const sides: [number, number, number, number, number, number][] = [
      [l.minX, l.minZ, l.maxX, l.minZ, 0, -1], [l.maxX, l.minZ, l.maxX, l.maxZ, 1, 0],
      [l.maxX, l.maxZ, l.minX, l.maxZ, 0, 1], [l.minX, l.maxZ, l.minX, l.minZ, -1, 0],
    ];
    for (const [ax, az, bx, bz, snx, snz] of sides) {
      const L = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.round(L / STEP));
      let rim: Rim[] = [];
      const flush = () => { if (rim.length > 1) { this.side(h, rim, Cls.Void); this.trim(h, rim, false); } rim = []; };
      for (let s = 0; s < steps; s++) {
        const u0 = s / steps, u1 = (s + 1) / steps, um = (u0 + u1) / 2;
        const exposed = !this.coveredAt(h, ax + (bx - ax) * um + snx * 0.15, az + (bz - az) * um + snz * 0.15);
        if (!exposed) { flush(); continue; }
        if (!rim.length) rim.push({ x: ax + (bx - ax) * u0, z: az + (bz - az) * u0, nx: snx, nz: snz, amp: 0 });
        rim.push({ x: ax + (bx - ax) * u1, z: az + (bz - az) * u1, nx: snx, nz: snz, amp: 0 });
      }
      flush();
    }
  }

  // ───────────── juntas ─────────────

  /** Líneas finas sobre los lados entre dos celdas de la capa (las dos con su cara de arriba a la altura de la capa). */
  private joints(h: number, inL: Uint8Array, cuts: Map<number, Cut[]>) {
    const jp = this.look.joints!, m = this.m;
    const col = new THREE.Color(jp.color), w = jp.width / 2, y = h + 0.011;
    for (let q = 0; q < m.count; q++) {
      if (!inL[q] || Math.abs(m.top[q] - h) > 1e-6) continue;
      for (let k = 0; k < 4; k++) {
        const nb = m.nbr[q * 4 + k];
        if (nb <= q || !inL[nb] || Math.abs(m.top[nb] - h) > 1e-6) continue;
        const a = m.quads[q * 4 + k], b = m.quads[q * 4 + ((k + 1) & 3)];
        const ex = m.vx[b] - m.vx[a], ez = m.vz[b] - m.vz[a], l = Math.hypot(ex, ez) || 1;
        const ox = (-ez / l) * w, oz = (ex / l) * w;
        let poly: Pt[] = [
          { x: m.vx[a] + ox, z: m.vz[a] + oz, ao: 1 }, { x: m.vx[b] + ox, z: m.vz[b] + oz, ao: 1 },
          { x: m.vx[b] - ox, z: m.vz[b] - oz, ao: 1 }, { x: m.vx[a] - ox, z: m.vz[a] - oz, ao: 1 },
        ];
        const mx = (m.vx[a] + m.vx[b]) / 2, mz = (m.vz[a] + m.vz[b]) / 2;
        if (this.hidden(mx, mz)) continue;
        for (const v of [a, b]) {
          const list = cuts.get(v);
          if (!list) continue;
          for (const c of list) {
            if (!inWedge(c, mx, mz)) continue;
            for (let j = 0; j < c.chord.length; j += 4) poly = clipHalf(poly, c.chord[j], c.chord[j + 1], c.chord[j + 2], c.chord[j + 3]);
          }
        }
        if (poly.length < 3) continue;
        for (let i = 1; i + 1 < poly.length; i++) {
          const t3 = [poly[0], poly[i], poly[i + 1]];
          const up = (t3[1].z - t3[0].z) * (t3[2].x - t3[0].x) - (t3[1].x - t3[0].x) * (t3[2].z - t3[0].z) > 0;
          for (const p of up ? t3 : [t3[0], t3[2], t3[1]]) { this.paintPos.push(p.x, y, p.z); this.paintCol.push(col.r, col.g, col.b); }
        }
      }
    }
  }

  // ───────────── costados ─────────────

  /** Costado que cuelga de un tramo del borde: acantilado si da al vacío, pared recta si da a una losa frágil, muro si es una capa de arriba. */
  private side(h: number, rim: Rim[], outCls: Cls) {
    const lk = this.look;
    if (h > 0) {
      // Roca apilada: una cornisa que sobresale apenas arriba, hiladas irregulares y un pie más ancho.
      const prof: Ring[] = [{ y: 0, off: 0, rough: 0 }, { y: -0.13, off: 0.05, rough: 0 }, { y: -0.27, off: 0, rough: 0.02 }];
      const courses = Math.max(1, Math.round((h - 0.27) / 0.62));
      for (let i = 1; i < courses; i++) prof.push({ y: -0.27 - ((h - 0.27) * i) / courses, off: 0.02, rough: 0.09 });
      prof.push({ y: -h, off: 0.09, rough: 0.05 });
      const cap = new THREE.Color(h >= WALL_TOP - 1e-6 ? lk.wallTop : lk.wallSide).offsetHSL(0, 0, 0.06), mid = new THREE.Color(lk.wallSide), foot = new THREE.Color(lk.wallFoot);
      this.skirt(h, rim, prof, (j, x, y, z) => {
        if (j < 2) return cap;
        const k = (j - 2) / (prof.length - 3);
        return mid.clone().lerp(foot, k * k).offsetHSL(0, 0, (j % 2 ? 0.03 : -0.03) + this.style.rock(x, y, z) * 0.04);
      });
      return;
    }
    if (outCls === Cls.Fragile) {
      const dark = new THREE.Color(lk.rockBottom);
      this.skirt(h, rim, PIT, (j) => (j === 0 ? new THREE.Color(lk.soil) : dark));
      return;
    }
    const soil = new THREE.Color(lk.soil), rt = new THREE.Color(lk.rockTop), rb = new THREE.Color(lk.rockBottom);
    this.skirt(h, rim, CLIFF, (j, x, y, z) => {
      if (j === 0) return soil.clone().offsetHSL(0, 0, 0.06);
      if (j === 1) return soil;
      const k = (j - 2) / (CLIFF.length - 3);
      return rt.clone().lerp(rb, k).offsetHSL(0, 0, (j % 2 ? 0.025 : -0.025) + this.style.rock(x, y, z) * 0.045);
    });
  }

  private skirt(h: number, rim: Rim[], prof: Ring[], colorOf: (ring: number, x: number, y: number, z: number) => THREE.Color) {
    const P: number[][][] = [], Cc: THREE.Color[][] = [];
    for (const r of rim) {
      const col: number[][] = [], cc: THREE.Color[] = [];
      for (let j = 0; j < prof.length; j++) {
        const y = h + prof[j].y;
        const d = r.amp * (prof[j].off + prof[j].rough * this.style.rock(r.x, y, r.z));
        const p = [r.x + r.nx * d, y, r.z + r.nz * d];
        col.push(p);
        cc.push(colorOf(j, p[0], p[1], p[2]));
      }
      P.push(col);
      Cc.push(cc);
    }
    for (let i = 0; i + 1 < rim.length; i++) {
      const nx = rim[i].nx + rim[i + 1].nx, nz = rim[i].nz + rim[i + 1].nz;
      for (let j = 0; j + 1 < prof.length; j++) {
        const a = P[i][j], b = P[i][j + 1], c = P[i + 1][j + 1], d = P[i + 1][j];
        // Normal del triángulo a-b-c: tiene que mirar hacia afuera.
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const out = (uy * vz - uz * vy) * nx + (ux * vy - uy * vx) * nz > 0;
        const ca = Cc[i][j], cb = Cc[i][j + 1], cc = Cc[i + 1][j + 1], cd = Cc[i + 1][j];
        const tris: [number[], THREE.Color][] = out ? [[a, ca], [b, cb], [c, cc], [a, ca], [c, cc], [d, cd]] : [[a, ca], [c, cc], [b, cb], [a, ca], [d, cd], [c, cc]];
        for (const [p, col] of tris) {
          this.rockPos.push(p[0], p[1], p[2]);
          this.rockCol.push(col.r, col.g, col.b);
        }
      }
    }
  }

  /** Remate de un tramo del borde: el neón y la franja pintada si da al vacío, y el cordón si es el borde de una plataforma. */
  private trim(h: number, rim: Rim[], toVoid: boolean) {
    if (toVoid) {
      this.neon(h, rim);
      const e = this.look.edge;
      if (e && h < WALL_TOP - 1e-6) {
        const n = e.colors.length;
        this.paint(h, rim, e.width, (x, z) => new THREE.Color(e.colors[((Math.floor((x + z) / e.stripe) % n) + n) % n]));
        return;
      }
    }
    if (h > 0 && h < WALL_TOP - 1e-6) this.paint(h, rim, 0.2, (x, z) => this.topColor(h, x, z, 1).offsetHSL(0, -0.05, 0.09));
  }

  /** ¿El punto queda debajo del descanso de una rampa de esta capa? */
  private hidden(x: number, z: number) {
    for (const r of this.under) if (inRect(r, x, z, -0.02)) return true;
    return false;
  }

  /** Franja pintada sobre el piso, del borde hacia adentro. */
  private paint(h: number, rim: Rim[], width: number, colorOf: (x: number, z: number) => THREE.Color) {
    const y = h + 0.012;
    for (let i = 0; i + 1 < rim.length; i++) {
      const a = rim[i], b = rim[i + 1];
      if (this.hidden((a.x + b.x) / 2, (a.z + b.z) / 2)) continue;
      const q = [[a.x, a.z], [b.x, b.z], [b.x - b.nx * width, b.z - b.nz * width], [a.x - a.nx * width, a.z - a.nz * width]];
      const col = colorOf((a.x + b.x) / 2, (a.z + b.z) / 2);
      const up = (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]) - (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) > 0;
      for (const k of up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
        this.paintPos.push(q[k][0], y, q[k][1]);
        this.paintCol.push(col.r, col.g, col.b);
      }
    }
  }

  /** Tira luminosa apoyada sobre el borde: marca dónde se termina el mapa. */
  private neon(h: number, rim: Rim[]) {
    const W = 0.1, UP = 0.05;
    for (let i = 0; i + 1 < rim.length; i++) {
      const a = rim[i], b = rim[i + 1];
      if (this.hidden((a.x + b.x) / 2, (a.z + b.z) / 2)) continue;
      const quad = (p: number[][]) => { for (const k of [0, 1, 2, 0, 2, 3]) this.neonPos.push(p[k][0], p[k][1], p[k][2]); };
      quad([[a.x, h + UP, a.z], [b.x, h + UP, b.z], [b.x - b.nx * W, h + UP, b.z - b.nz * W], [a.x - a.nx * W, h + UP, a.z - a.nz * W]]);
      quad([[a.x, h + UP, a.z], [b.x, h + UP, b.z], [b.x, h - 0.03, b.z], [a.x, h - 0.03, a.z]]);
    }
  }
}
