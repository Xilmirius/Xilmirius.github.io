// Formas del terreno por vecindario: la grilla sigue siendo la entrada (y la colisión), pero cada esquina mira
// a sus vecinas para decidir qué pieza va: costa redondeada, esquina interior, acantilado de roca o borde recto.
// Es solo visual. Reglas para que el dibujo no le mienta a la colisión:
//   - se redondean solo las esquinas (R_OUT hacia adentro en las salientes, R_IN de relleno en las entrantes):
//     el borde recto de cada celda queda exactamente donde está el borde real;
//   - el acantilado se abulta y se afina por DEBAJO del borde, nunca a la altura del piso;
//   - al lado de una losa frágil o de una rampa no se redondea nada, así las piezas sueltas calzan justas
//     (por eso no hay que recalcular nada cuando una losa se cae: el hueco es el de la celda).
//
// El terreno se arma por capas de altura (piso, plataformas, muros). Cada capa es una meseta con su propio
// contorno; las de arriba apoyan sobre las de abajo, así que donde una plataforma redondea la esquina se ve
// el piso que tiene debajo.
import * as THREE from 'three';
import { CELL, ISLAND_BOTTOM, LEVEL_H, WALL_TOP } from '../core/constants';
import { CellType, type Terrain } from '../core/terrain';
import type { GroundStyle } from './ground';

/** Radio de las esquinas salientes y de las entrantes (m). La celda mide CELL. */
export const R_OUT = 0.62;
export const R_IN = 0.4;
/** Tramos de cada arco y largo de los tramos rectos del acantilado. */
const ARC = 4;
const STEP = 0.5;
/** Distancia en la que el relieve del acantilado se apaga al llegar a una esquina viva. */
const TAPER = 0.8;
/** Un vecino más alto que esto oscurece el piso a su pie (sombra de contacto). */
const AO_STEP = 0.6;
const AO_DARK = 0.72;

/** Normal hacia afuera de cada lado de una celda: norte, este, sur, oeste. El lado s va de la esquina s a la s+1. */
const SIDE: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/** Esquinas NO, NE, SE, SO, en medias celdas desde el centro. */
const CORNER: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/** Qué hay en una celda, para decidir las formas. */
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
}

/** stripe: largo de cada raya (m); width: ancho de la franja hacia adentro (m). */
export interface EdgePaint { colors: number[]; stripe: number; width: number }

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

export interface TerrainShape {
  /** Caras de arriba (piso, plataformas y muros), con textura de suelo. */
  top: THREE.BufferGeometry;
  /** Roca facetada: acantilados y costados de muros y plataformas. */
  rock: THREE.BufferGeometry;
  /** Tiras sobre los bordes que dan al vacío. */
  neon: THREE.BufferGeometry | null;
  /** Pintura sobre el piso: la franja del borde y el cordón de las plataformas. */
  paint: THREE.BufferGeometry | null;
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
  private ground: THREE.Color;
  private ground2: THREE.Color;

  constructor(private t: Terrain, private style: GroundStyle, private look: TerrainLook = DEFAULT_LOOK) {
    this.ground = new THREE.Color(t.def.ground);
    this.ground2 = new THREE.Color(t.def.ground2);
  }

  cls(ix: number, iz: number): Cls {
    const t = this.t;
    if (ix < 0 || iz < 0 || ix >= t.w || iz >= t.h) return Cls.Void;
    const c = t.cells[iz * t.w + ix];
    if (c.type === CellType.Void) return Cls.Void;
    if (c.fragile >= 0) return Cls.Fragile;
    return c.type === CellType.Ramp ? Cls.Ramp : Cls.Solid;
  }

  /** Altura de la cara de arriba de una celda firme (las rampas cuentan como piso: su cuña va aparte). */
  topOf(ix: number, iz: number): number {
    const k = this.cls(ix, iz);
    if (k < Cls.Ramp) return -Infinity;
    if (k === Cls.Ramp) return 0;
    const c = this.t.cells[iz * this.t.w + ix];
    return c.type === CellType.Wall ? WALL_TOP : c.level * LEVEL_H;
  }

  /** Alturas de las capas, de abajo hacia arriba. La 0 es el piso. */
  layers(): number[] {
    const hs = new Set<number>([0]);
    for (let iz = 0; iz < this.t.h; iz++) for (let ix = 0; ix < this.t.w; ix++) { const h = this.topOf(ix, iz); if (h > 0) hs.add(h); }
    return [...hs].sort((a, b) => a - b);
  }

  /** ¿La celda es parte de la meseta de altura h? */
  inLayer(h: number, ix: number, iz: number): boolean {
    return h === 0 ? this.cls(ix, iz) >= Cls.Ramp : this.cls(ix, iz) === Cls.Solid && this.topOf(ix, iz) >= h - 1e-6;
  }

  /** Vértice de la grilla (vx, vz): la esquina que comparten las celdas (vx-1..vx, vz-1..vz). No se redondea si toca una losa frágil o una rampa. */
  blocked(vx: number, vz: number): boolean {
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const k = this.cls(vx + dx, vz + dz);
      if (k === Cls.Fragile || k === Cls.Ramp) return true;
    }
    return false;
  }

  /** ¿Se redondea la esquina k de la celda en la capa h? Tiene que ser saliente (los dos lados que la forman dan afuera). */
  rounded(h: number, ix: number, iz: number, k: number): boolean {
    const a = SIDE[(k + 3) % 4], b = SIDE[k];
    if (this.inLayer(h, ix + a[0], iz + a[1]) || this.inLayer(h, ix + b[0], iz + b[1])) return false;
    return !this.blocked(ix + (CORNER[k][0] + 1) / 2, iz + (CORNER[k][1] + 1) / 2);
  }

  /** Esquina entrante en el vértice (vx, vz) de la capa h: tres celdas adentro y una afuera. Devuelve hacia dónde queda la de afuera, o null. */
  fillet(h: number, vx: number, vz: number): [number, number] | null {
    let out: [number, number] | null = null, n = 0;
    for (const q of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]) {
      if (this.inLayer(h, vx + (q[0] - 1) / 2, vz + (q[1] - 1) / 2)) n++;
      else out = q;
    }
    return n === 3 && out && !this.blocked(vx, vz) ? out : null;
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
    return { top, rock, neon, paint };
  }

  // ───────────── una capa ─────────────

  private wx(vx: number) { return this.t.originX + vx * CELL; }
  private wz(vz: number) { return this.t.originZ + vz * CELL; }

  private buildLayer(h: number) {
    const t = this.t;
    for (let iz = 0; iz < t.h; iz++) for (let ix = 0; ix < t.w; ix++) {
      if (!this.inLayer(h, ix, iz)) continue;
      const cx = this.wx(ix + 0.5), cz = this.wz(iz + 0.5), half = CELL / 2;
      const round = [0, 1, 2, 3].map((k) => this.rounded(h, ix, iz, k));
      const mine = this.cls(ix, iz) === Cls.Solid && this.topOf(ix, iz) === h;
      const covered = this.heightOf(ix, iz) > h + AO_STEP;

      // Cara de arriba: abanico desde el centro, con las esquinas salientes hechas arco.
      const ring: [number, number, number][] = [];
      for (let k = 0; k < 4; k++) {
        const px = cx + CORNER[k][0] * half, pz = cz + CORNER[k][1] * half;
        if (round[k]) for (const p of this.arc(px, pz, k)) ring.push([p.x, p.z, covered ? AO_DARK : 1]);
        else ring.push([px, pz, this.aoAround(h, ix + (CORNER[k][0] + 1) / 2, iz + (CORNER[k][1] + 1) / 2)]);
        const n = SIDE[k];
        ring.push([cx + n[0] * half, cz + n[1] * half, covered || this.heightOf(ix + n[0], iz + n[1]) > h + AO_STEP ? AO_DARK : 1]);
      }
      const center: [number, number, number] = [cx, cz, covered ? AO_DARK : 1];
      for (let i = 0; i < ring.length; i++) this.topTri(h, center, ring[i], ring[(i + 1) % ring.length]);

      // Costados: los tramos rectos que dan afuera y los arcos de las esquinas salientes.
      for (let s = 0; s < 4; s++) {
        const n = SIDE[s];
        const ox = ix + n[0], oz = iz + n[1];
        if (this.inLayer(h, ox, oz)) continue;
        const outCls = this.cls(ox, oz);
        const ends = [this.sideEnd(h, ix, iz, s, false), this.sideEnd(h, ix, iz, s, true)];
        const a = [cx + CORNER[s][0] * half, cz + CORNER[s][1] * half];
        const d = SIDE[(s + 1) % 4];
        const from = ends[0].trim, len = CELL - ends[0].trim - ends[1].trim;
        const steps = Math.max(1, Math.round(len / STEP));
        const rim: Rim[] = [];
        for (let i = 0; i <= steps; i++) {
          const u = (len * i) / steps;
          let amp = 1;
          if (ends[0].sharp) amp = Math.min(amp, u / TAPER);
          if (ends[1].sharp) amp = Math.min(amp, (len - u) / TAPER);
          rim.push({ x: a[0] + d[0] * (from + u), z: a[1] + d[1] * (from + u), nx: n[0], nz: n[1], amp: outCls === Cls.Fragile ? 0 : amp });
        }
        this.side(h, rim, outCls);
        if (mine) this.trim(h, rim, outCls === Cls.Void);
      }
      for (let k = 0; k < 4; k++) {
        if (!round[k]) continue;
        const rim = this.arc(cx + CORNER[k][0] * half, cz + CORNER[k][1] * half, k);
        const a = SIDE[(k + 3) % 4], b = SIDE[k];
        const toVoid = this.cls(ix + a[0], iz + a[1]) === Cls.Void && this.cls(ix + b[0], iz + b[1]) === Cls.Void;
        this.side(h, rim, toVoid ? Cls.Void : Cls.Solid);
        if (mine) this.trim(h, rim, toVoid);
      }
    }

    // Esquinas entrantes: un relleno curvo en el rincón de la celda de afuera.
    for (let vz = 0; vz <= t.h; vz++) for (let vx = 0; vx <= t.w; vx++) {
      const q = this.fillet(h, vx, vz);
      if (!q) continue;
      const px = this.wx(vx), pz = this.wz(vz);
      const rim: Rim[] = [];
      for (let i = 0; i <= ARC; i++) {
        const th = (Math.PI / 2) * (i / ARC), c = Math.cos(th), s = Math.sin(th);
        rim.push({ x: px + q[0] * R_IN * (1 - s), z: pz + q[1] * R_IN * (1 - c), nx: q[0] * s, nz: q[1] * c, amp: 1 });
      }
      const v: [number, number, number] = [px, pz, this.aoAround(h, vx, vz)];
      for (let i = 0; i < ARC; i++) this.topTri(h, v, [rim[i].x, rim[i].z, 1], [rim[i + 1].x, rim[i + 1].z, 1]);
      const ox = vx + (q[0] - 1) / 2, oz = vz + (q[1] - 1) / 2;
      const outCls = this.cls(ox, oz);
      this.side(h, rim, outCls);
      // Brilla si las dos celdas que arman el rincón tienen su cara de arriba en esta capa.
      if (this.topOf(ox - q[0], oz) === h && this.topOf(ox, oz - q[1]) === h) this.trim(h, rim, outCls === Cls.Void);
    }
  }

  /** Arco de la esquina saliente k (con centro en la esquina px, pz corrida R_OUT hacia adentro). */
  private arc(px: number, pz: number, k: number): Rim[] {
    const a = SIDE[(k + 3) % 4], b = SIDE[k];
    const ox = px - (a[0] + b[0]) * R_OUT, oz = pz - (a[1] + b[1]) * R_OUT;
    const out: Rim[] = [];
    for (let i = 0; i <= ARC; i++) {
      const th = (Math.PI / 2) * (i / ARC), c = Math.cos(th), s = Math.sin(th);
      const nx = a[0] * c + b[0] * s, nz = a[1] * c + b[1] * s;
      out.push({ x: ox + nx * R_OUT, z: oz + nz * R_OUT, nx, nz, amp: 1 });
    }
    return out;
  }

  /** Cómo termina el tramo recto del lado s en uno de sus extremos: cuánto se recorta y si ahí hay una esquina viva. */
  private sideEnd(h: number, ix: number, iz: number, s: number, atEnd: boolean): { trim: number; sharp: boolean } {
    const k = atEnd ? (s + 1) % 4 : s;
    const along = SIDE[atEnd ? (s + 1) % 4 : (s + 3) % 4];
    const n = SIDE[s];
    const vx = ix + (CORNER[k][0] + 1) / 2, vz = iz + (CORNER[k][1] + 1) / 2;
    if (!this.inLayer(h, ix + along[0], iz + along[1])) {
      return this.blocked(vx, vz) ? { trim: 0, sharp: true } : { trim: R_OUT, sharp: false };
    }
    const dx = ix + along[0] + n[0], dz = iz + along[1] + n[1];
    if (this.inLayer(h, dx, dz)) return this.blocked(vx, vz) ? { trim: 0, sharp: true } : { trim: R_IN, sharp: false };
    // Sigue derecho: solo es esquina viva si del otro lado cambia lo que hay (vacío ↔ losa frágil).
    return { trim: 0, sharp: this.cls(dx, dz) !== this.cls(ix + n[0], iz + n[1]) };
  }

  // ───────────── caras ─────────────

  /** Altura aproximada de una celda (para la sombra de contacto). -Infinity si es vacío o está fuera del mapa. */
  heightOf(ix: number, iz: number) {
    const t = this.t;
    if (ix < 0 || iz < 0 || ix >= t.w || iz >= t.h) return -Infinity;
    const c = t.cells[iz * t.w + ix];
    if (c.type === CellType.Void) return -Infinity;
    if (c.type === CellType.Wall) return WALL_TOP;
    return (c.level + (c.type === CellType.Ramp ? 0.5 : 0)) * LEVEL_H;
  }

  private aoAround(h: number, vx: number, vz: number) {
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (this.heightOf(vx + dx, vz + dz) > h + AO_STEP) return AO_DARK;
    return 1;
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

  /** Triángulo de una cara de arriba. Cada punto: [x, z, sombra]. */
  private topTri(h: number, a: [number, number, number], b: [number, number, number], c: [number, number, number]) {
    // Que mire hacia arriba, venga en el orden que venga.
    const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
    for (const p of up ? [a, b, c] : [a, c, b]) {
      this.topPos.push(p[0], h, p[1]);
      this.topUv.push(p[0] * 0.23, p[1] * 0.23);
      const col = this.topColor(h, p[0], p[1], p[2]);
      this.topCol.push(col.r, col.g, col.b);
    }
  }

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

  /** Franja pintada sobre el piso, del borde hacia adentro. */
  private paint(h: number, rim: Rim[], width: number, colorOf: (x: number, z: number) => THREE.Color) {
    const y = h + 0.012;
    for (let i = 0; i + 1 < rim.length; i++) {
      const a = rim[i], b = rim[i + 1];
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
      const quad = (p: number[][]) => { for (const k of [0, 1, 2, 0, 2, 3]) this.neonPos.push(p[k][0], p[k][1], p[k][2]); };
      quad([[a.x, h + UP, a.z], [b.x, h + UP, b.z], [b.x - b.nx * W, h + UP, b.z - b.nz * W], [a.x - a.nx * W, h + UP, a.z - a.nz * W]]);
      quad([[a.x, h + UP, a.z], [b.x, h + UP, b.z], [b.x, h - 0.03, b.z], [a.x, h - 0.03, a.z]]);
    }
  }
}
