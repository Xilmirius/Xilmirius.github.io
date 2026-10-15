// Piezas sueltas del terreno que no salen de las capas de altura (terrainShape.ts): las losas frágiles, que se agrietan y se
// caen enteras. Una losa es el conjunto de celdas de la malla que salieron de la misma celda frágil del plano: una sola
// pieza con su biselado en el contorno, sea una celda (malla cuadrada) o varias (orgánica).
import * as THREE from 'three';
import { ISLAND_BOTTOM, WALL_TOP } from '../core/constants';
import type { Terrain } from '../core/terrain';
import { adjOf, traceLoops, type Seg } from './contour';
import type { GroundStyle } from './ground';

/** Relieve de cada losa: el borde se mete BEVEL_IN y baja BEVEL_DROP, así las juntas tienen sombra propia. */
export const BEVEL_IN = 0.09;
export const BEVEL_DROP = 0.06;
/** Un vecino más alto que esto oscurece el piso a su pie (sombra de contacto). */
export const AO_STEP = 0.6;
/** Una esquina muy aguda no se mete más que esto (en veces el bisel). */
const MITER_MAX = 2.6;

export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  quad(p: number[][], n: number[], uv: number[][], c: THREE.Color[]) {
    const b = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(...p[i]);
      this.nor.push(...n);
      this.uv.push(...uv[i]);
      this.col.push(c[i].r, c[i].g, c[i].b);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  /** Un cuadrilátero que mira hacia donde dice `n`, vengan los puntos en el orden que vengan. */
  faced(p: number[][], n: number[], uv: number[][], c: THREE.Color[]) {
    const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
    const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
    const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    if (dot >= 0) this.quad(p, n, uv, c);
    else this.quad([p[0], p[3], p[2], p[1]], n, [uv[0], uv[3], uv[2], uv[1]], [c[0], c[3], c[2], c[1]]);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Las celdas de la malla de cada losa frágil (por índice de losa). */
export function slabCells(t: Terrain): number[][] {
  const out: number[][] = Array.from({ length: t.fragile.length }, () => []);
  const m = t.mesh;
  for (let q = 0; q < m.count; q++) if (m.slab[q] >= 0) out[m.slab[q]].push(q);
  return out;
}

/**
 * La losa frágil `fi` en `b`: la cara de arriba (las celdas de la losa, con los vértices del contorno metidos un bisel), el
 * bisel que baja hacia la junta y los costados hasta el fondo de la isla (una columna entera, que se cae). `loose` es el
 * piso flojo de la Carrera. Devuelve la geometría de la calcomanía de las grietas: las mismas celdas, sin el bisel, un poco
 * más arriba, con el UV de la caja de la losa entera (las grietas quedan repartidas por toda la losa).
 */
export function buildSlab(t: Terrain, style: GroundStyle, fi: number, cells: number[], loose: boolean, b: GeoBuilder): THREE.BufferGeometry {
  const m = t.mesh, adj = adjOf(t), def = t.def;
  const ci = t.fragile[fi], ix = ci % t.w, iz = Math.floor(ci / t.w);
  const cell = t.cells[ci];
  const y = m.top[cells[0]];
  const bb = t.slabBounds(fi);
  const bw = bb.maxX - bb.minX, bd = bb.maxZ - bb.minZ;

  // Color de la losa: damero suave, un tono más claro por ser frágil (en la Carrera se nota de lejos) y variación por losa.
  const base = new THREE.Color((ix + iz) % 2 ? def.ground : def.ground2);
  if (cell.level >= 1) base.lerp(new THREE.Color(0xffffff), 0.12);
  base.lerp(new THREE.Color(loose ? 0xfff2c0 : 0xffe0a0), loose ? 0.5 : 0.18);
  base.offsetHSL(0, 0, style.jitter(ix, iz) * 0.022);

  // El contorno: los lados de las celdas de la losa que no tocan otra celda de la losa.
  const segs: Seg[] = [];
  for (const q of cells) {
    for (let k = 0; k < 4; k++) {
      const nb = m.nbr[q * 4 + k];
      if (nb >= 0 && m.slab[nb] === fi) continue;
      segs.push({ q, k, a: m.quads[q * 4 + k], b: m.quads[q * 4 + ((k + 1) & 3)], nb });
    }
  }
  const loops = traceLoops(m, segs);
  // Cada vértice del contorno se mete un bisel hacia adentro, parejo contra los dos lados que lo forman.
  const inner = new Map<number, [number, number]>();
  for (const loop of loops) {
    const n = loop.length;
    const nrm = loop.map((s) => {
      const ex = m.vx[s.b] - m.vx[s.a], ez = m.vz[s.b] - m.vz[s.a], l = Math.hypot(ex, ez) || 1;
      return [ez / l, -ex / l];
    });
    for (let i = 0; i < n; i++) {
      const p = nrm[(i + n - 1) % n], c = nrm[i];
      const k = 1 + p[0] * c[0] + p[1] * c[1];
      let mx = (p[0] + c[0]) / Math.max(k, 1e-3), mz = (p[1] + c[1]) / Math.max(k, 1e-3);
      const l = Math.hypot(mx, mz);
      if (l > MITER_MAX) { mx *= MITER_MAX / l; mz *= MITER_MAX / l; }
      const v = loop[i].a;
      if (!inner.has(v)) inner.set(v, [m.vx[v] - mx * BEVEL_IN, m.vz[v] - mz * BEVEL_IN]);
    }
  }
  const at = (v: number): [number, number] => inner.get(v) ?? [m.vx[v], m.vz[v]];
  // La textura de la losa trae un borde dibujado: en la cuadrada coincide con el de la losa; en la orgánica, con el contorno
  // irregular, la raya recta se vería cruzando la losa, así que se usa solo el interior de la textura.
  const organic = m.mode === 'organic';
  const uvOf = (x: number, z: number) => {
    const u = (x - bb.minX) / bw, v = (z - bb.minZ) / bd;
    return organic ? [0.04 + u * 0.42, 0.96 - v * 0.92] : [0.004 + u * 0.492, 0.996 - v * 0.992];
  };
  // Sombra de contacto de cada vértice: oscura si un vecino más alto toca un lado de la losa en él, más leve si solo lo toca la punta.
  const aoOf = (v: number) => {
    for (const q of cells) {
      for (let k = 0; k < 4; k++) {
        if (m.quads[q * 4 + k] !== v) continue;
        for (const side of [k, (k + 3) & 3]) {
          const nb = m.nbr[q * 4 + side];
          if (nb >= 0 && m.slab[nb] !== fi && adj.aoTop[nb] - y > AO_STEP) return 0.7;
        }
      }
    }
    return adj.vTop[v] - y > AO_STEP ? 0.85 : 1;
  };
  const aoCache = new Map<number, number>();
  const ao = (v: number) => { let a = aoCache.get(v); if (a === undefined) { a = aoOf(v); aoCache.set(v, a); } return a; };
  const tint = (v: number) => base.clone().multiplyScalar(ao(v));

  // Cara de arriba.
  for (const q of cells) {
    const vs = [0, 1, 2, 3].map((k) => m.quads[q * 4 + k]);
    const p = vs.map((v) => { const [x, z] = at(v); return [x, y, z]; });
    b.faced(p, [0, 1, 0], p.map((pt) => uvOf(pt[0], pt[2])), vs.map(tint));
  }
  // Bisel y costados de cada tramo del contorno.
  const up = new THREE.Vector3(0, 1, 0);
  const vOf = (yy: number) => Math.min(1, Math.max(0, (yy - ISLAND_BOTTOM) / (WALL_TOP - ISLAND_BOTTOM + 1)));
  const cTop = new THREE.Color(0xc9b39a), cBot = new THREE.Color(0x5a4a3e);
  const colAt = (yy: number) => cBot.clone().lerp(cTop, vOf(yy));
  for (const loop of loops) {
    for (const s of loop) {
      const ax = m.vx[s.a], az = m.vz[s.a], bx = m.vx[s.b], bz = m.vz[s.b];
      const ex = bx - ax, ez = bz - az, l = Math.hypot(ex, ez) || 1;
      const nx = ez / l, nz = -ex / l;
      const [iax, iaz] = at(s.a), [ibx, ibz] = at(s.b);
      const bn = new THREE.Vector3(nx, 0, nz).multiplyScalar(BEVEL_DROP).addScaledVector(up, BEVEL_IN).normalize();
      const inA = tint(s.a), inB = tint(s.b), outA = inA.clone().multiplyScalar(0.78), outB = inB.clone().multiplyScalar(0.78);
      const h1 = y - BEVEL_DROP;
      b.faced(
        [[iax, y, iaz], [ax, h1, az], [bx, h1, bz], [ibx, y, ibz]],
        [bn.x, bn.y, bn.z],
        [uvOf(iax, iaz), uvOf(ax, az), uvOf(bx, bz), uvOf(ibx, ibz)],
        [inA, outA, outB, inB],
      );
      b.faced(
        [[ax, h1, az], [ax, ISLAND_BOTTOM, az], [bx, ISLAND_BOTTOM, bz], [bx, h1, bz]],
        [nx, 0, nz],
        [[0.504, vOf(h1)], [0.504, vOf(ISLAND_BOTTOM)], [0.996, vOf(ISLAND_BOTTOM)], [0.996, vOf(h1)]],
        [colAt(h1), colAt(ISLAND_BOTTOM), colAt(ISLAND_BOTTOM), colAt(h1)],
      );
    }
  }

  // Calcomanía de las grietas: las celdas enteras, un poco por encima de la cara de arriba.
  const pos: number[] = [], uv: number[] = [];
  for (const q of cells) {
    const p = [0, 1, 2, 3].map((k) => { const v = m.quads[q * 4 + k]; return [m.vx[v], y + 0.02, m.vz[v]]; });
    for (const tri of [[0, 3, 2], [0, 2, 1]]) {
      for (const i of tri) {
        pos.push(p[i][0], p[i][1], p[i][2]);
        uv.push((p[i][0] - bb.minX) / bw, 1 - (p[i][2] - bb.minZ) / bd);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  return g;
}
