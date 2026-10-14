// Generador de la malla irregular (docs/MALLA.md §3): cuadriláteros de ~1 m de lado, distintos en cada semilla.
// Es un módulo puro: no importa nada del juego salvo el Rng, así que host y clientes obtienen la misma malla.
//
// DETERMINISMO. El cliente predice su movimiento contra su propia copia de la malla: tiene que dar los mismos
// números, bit a bit, en cualquier navegador. Por eso este archivo solo usa `+ - * /`, `Math.sqrt` (el estándar
// la exige correctamente redondeada), las funciones exactas (`floor`, `ceil`, `round`, `abs`, `min`, `max`) y el
// `Rng` del proyecto. Nada de seno, coseno, `atan2`, `hypot` ni potencias: pueden diferir en el último bit. Los
// giros que hacen falta son de 90°, que son intercambios de coordenadas.
//
// SENTIDO DE GIRO. Los cuatro vértices de cada cuadrilátero van en el sentido que lleva de +x hacia +z (el mismo
// en que giran los vértices (1,0) → (0,1)): el área con signo de la fórmula del cordón, ½·Σ(x·z' − x'·z), da
// positivo. Vista desde arriba con +z hacia abajo de la pantalla, eso es el sentido de las agujas del reloj.
import { Rng } from './rng';

export interface MeshRegion { minX: number; maxX: number; minZ: number; maxZ: number }

export interface MeshOptions {
  region: MeshRegion;
  /** Semilla de la partida. Si no pasa la revisión se prueba la siguiente (`QuadMesh.seed` dice cuál se usó). */
  seed: number;
  /** Espejada sobre x = 0: se genera la mitad x ≥ 0 y se copia. La región tiene que ser simétrica (se usa max(|minX|, |maxX|)). */
  mirror?: boolean;
  /** Lado buscado de cada cuadrilátero, en metros (1). */
  side?: number;
}

export interface QuadMesh {
  /** Coordenadas de cada vértice (en metros, redondeadas a 1/256). */
  vx: Float64Array;
  vz: Float64Array;
  /** Cuatro índices de vértice por cuadrilátero, con el sentido de giro de arriba. */
  quads: Int32Array;
  /** La semilla con la que se generó (la pedida o una de las siguientes). */
  seed: number;
  /** Cuántas semillas hubo que probar (1 = la primera). */
  attempts: number;
}

/** Cuánto más que la región cubre la trama: la rigidez de su borde queda afuera. */
const MARGIN = 3;
/** Vueltas de relajado. */
const ITERATIONS = 40;
/** Cuánto se acerca el largo de `a` al ideal en cada vuelta (0,5 = a medio camino). */
const SIZE_PULL = 0.5;
/**
 * Un cuadrilátero que se acerca a lo que la revisión no tolera pesa BOOST veces más en el tirón de sus vértices.
 * Sin esto, en una malla grande siempre queda alguno de los 15.000 pasado del radio o del ángulo y ninguna semilla pasa.
 * Los umbrales "blandos" están un poco adentro de los de la revisión: radio, lado mínimo y cos² del ángulo.
 */
const BOOST = 8;
const SOFT_RADIUS = 0.86;
const SOFT_SIDE = 0.5;
const SOFT_COS2 = 0.6;
/** Hasta cuántas semillas se prueban. */
const MAX_ATTEMPTS = 64;
const SQRT3 = Math.sqrt(3);
/** Pasadas como máximo al reparar el apareo. */
const REPAIR_PASSES = 20;

// Revisión de MALLA.md §3.
const MIN_SIDE = 0.35;
const MAX_RADIUS = 0.97;
/** cos 35° = 0,81915: un ángulo entre 35° y 145° tiene |cos| menor o igual a esto (con un pelo de tolerancia). */
const MAX_COS = 0.8192;

export const meshQuadCount = (m: QuadMesh) => m.quads.length >> 2;

/** Área con signo de un cuadrilátero (positiva = sentido de giro del módulo). */
export function quadArea(m: QuadMesh, q: number): number {
  const a = m.quads[q * 4], b = m.quads[q * 4 + 1], c = m.quads[q * 4 + 2], d = m.quads[q * 4 + 3];
  return 0.5 * ((m.vx[a] * m.vz[b] - m.vx[b] * m.vz[a]) + (m.vx[b] * m.vz[c] - m.vx[c] * m.vz[b]) + (m.vx[c] * m.vz[d] - m.vx[d] * m.vz[c]) + (m.vx[d] * m.vz[a] - m.vx[a] * m.vz[d]));
}

/**
 * La revisión de MALLA.md §3 sobre un cuadrilátero: convexo y no dado vuelta, ángulos entre 35° y 145°, lados de
 * más de 0,35 m y radio (centro al vértice más lejano) menor que 0,97 m. Devuelve el motivo si falla, o null.
 */
export function checkQuad(m: QuadMesh, q: number): string | null {
  const ix = [m.quads[q * 4], m.quads[q * 4 + 1], m.quads[q * 4 + 2], m.quads[q * 4 + 3]];
  const x = ix.map((i) => m.vx[i]), z = ix.map((i) => m.vz[i]);
  const cx = (x[0] + x[1] + x[2] + x[3]) * 0.25, cz = (z[0] + z[1] + z[2] + z[3]) * 0.25;
  for (let k = 0; k < 4; k++) {
    const p = (k + 3) & 3, n = (k + 1) & 3;
    // Los dos lados que salen del vértice k.
    const ax = x[p] - x[k], az = z[p] - z[k], bx = x[n] - x[k], bz = z[n] - z[k];
    const la = Math.sqrt(ax * ax + az * az), lb = Math.sqrt(bx * bx + bz * bz);
    if (la <= MIN_SIDE || lb <= MIN_SIDE) return 'lado corto';
    // Con el sentido de giro del módulo, ir de a a b gira de +z hacia +x: el giro del contorno es b × a.
    if (bx * az - bz * ax <= 0) return 'no convexo';
    const coseno = (ax * bx + az * bz) / (la * lb);
    if (coseno > MAX_COS || coseno < -MAX_COS) return 'ángulo';
    const dx = x[k] - cx, dz = z[k] - cz;
    if (dx * dx + dz * dz >= MAX_RADIUS * MAX_RADIUS) return 'radio';
  }
  return null;
}

/** Revisa toda la malla: el motivo del primer cuadrilátero que falla, o null si todos pasan. */
export function checkMesh(m: QuadMesh): string | null {
  for (let q = 0; q < meshQuadCount(m); q++) {
    const r = checkQuad(m, q);
    if (r) return `cuadrilátero ${q}: ${r}`;
  }
  return null;
}

/** Genera la malla de la región; si una semilla no pasa la revisión prueba la siguiente. */
export function generateMesh(o: MeshOptions): QuadMesh {
  for (let k = 0; k < MAX_ATTEMPTS; k++) {
    const seed = (o.seed + k) >>> 0;
    const m = buildMesh(o, seed);
    m.attempts = k + 1;
    if (!checkMesh(m)) return m;
  }
  throw new Error(`mesh: ninguna de ${MAX_ATTEMPTS} semillas desde ${o.seed} pasa la revisión`);
}

/** Una malla de esta semilla, sin revisar (para herramientas: `generateMesh` es lo que usa el juego). */
export function buildMesh(o: MeshOptions, seed: number): QuadMesh {
  const rng = new Rng(seed);
  const side = o.side ?? 1;
  const mirror = !!o.mirror;
  const r = o.region;
  // Sobre la trama de 2·side de lado, con un lado vertical (así x = 0 puede ser una línea de la trama).
  const edge = 2 * side;
  const h = SQRT3 * side; // distancia entre columnas
  const reach = mirror ? Math.max(Math.abs(r.minX), Math.abs(r.maxX)) : 0;
  const x0 = mirror ? 0 : r.minX - MARGIN;
  const z0 = r.minZ - MARGIN;
  const x1 = (mirror ? reach : r.maxX) + MARGIN;
  const z1 = r.maxZ + MARGIN;
  const NX = Math.ceil((x1 - x0) / h) + 1;
  const NZ = Math.ceil((z1 - z0) / edge) + 2;

  // ── 1. La trama de triángulos. Los vértices de la columna i están en x0 + i·h; las columnas impares, medio lado más arriba.
  const nLat = NX * NZ;
  const lx = new Float64Array(nLat), lz = new Float64Array(nLat);
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    lx[i * NZ + j] = x0 + i * h;
    lz[i * NZ + j] = z0 + (j + (i & 1) * 0.5) * edge;
  }
  const tri: number[] = [];
  for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NZ - 1; j++) {
    const a = i * NZ + j, b = a + 1, c = (i + 1) * NZ + j, d = c + 1;
    if (i & 1) tri.push(a, b, d, c, d, a); // apunta a la derecha: (i,j) (i,j+1) (i+1,j+1); a la izquierda: (i+1,j) (i+1,j+1) (i,j)
    else tri.push(a, b, c, c, d, b); // a la derecha: (i,j) (i,j+1) (i+1,j); a la izquierda: (i+1,j) (i+1,j+1) (i,j+1)
  }
  const nTri = tri.length / 3;

  // Vecinos por lado, y lados sueltos (los del borde de la trama; los del eje espejo no cuentan).
  const edgeOf = new Map<number, number>();
  const nbr = new Int32Array(nTri * 3).fill(-1);
  const key = (a: number, b: number) => (a < b ? a * nLat + b : b * nLat + a);
  for (let t = 0; t < nTri; t++) for (let e = 0; e < 3; e++) {
    const k = key(tri[t * 3 + e], tri[t * 3 + ((e + 1) % 3)]);
    const other = edgeOf.get(k);
    if (other === undefined) edgeOf.set(k, t * 3 + e);
    else { nbr[t * 3 + e] = other / 3 | 0; nbr[other] = t; }
  }

  const fixed: number[] = new Array(nLat).fill(0); // 1 = no se mueve; 2 = sobre el eje (solo se mueve en z)
  // Lado suelto de la trama (le falta el triángulo del otro lado): sus extremos y su punto medio no se mueven. Los del eje
  // espejo solo se deslizan sobre él (2). Un vértice en una esquina de la trama que además toca el eje queda fijo.
  const loose = new Map<number, number>();
  for (let t = 0; t < nTri; t++) for (let e = 0; e < 3; e++) {
    if (nbr[t * 3 + e] >= 0) continue;
    const a = tri[t * 3 + e], b = tri[t * 3 + ((e + 1) % 3)];
    const kind = mirror && lx[a] === 0 && lx[b] === 0 ? 2 : 1;
    loose.set(key(a, b), kind);
    if (kind === 1) fixed[a] = fixed[b] = 1;
    else { if (fixed[a] === 0) fixed[a] = 2; if (fixed[b] === 0) fixed[b] = 2; }
  }
  // ── 2. Apareo al azar de triángulos vecinos.
  const order = new Int32Array(nTri);
  for (let t = 0; t < nTri; t++) order[t] = t;
  for (let t = nTri - 1; t > 0; t--) { const s = rng.int(0, t); const v = order[t]; order[t] = order[s]; order[s] = v; }
  const mate = new Int32Array(nTri).fill(-1);
  // Diagonales (lados que se borran al juntar dos triángulos) que tocan cada vértice de la trama.
  const diag = new Int32Array(nLat);
  const edgeIndex = (t: number, u: number) => { for (let e = 0; e < 3; e++) if (nbr[t * 3 + e] === u) return e; return 0; };
  const pair = (t: number, u: number) => {
    mate[t] = u; mate[u] = t;
    const e = edgeIndex(t, u);
    diag[tri[t * 3 + e]]++; diag[tri[t * 3 + ((e + 1) % 3)]]++;
  };
  const unpair = (t: number) => {
    const u = mate[t];
    const e = edgeIndex(t, u);
    diag[tri[t * 3 + e]]--; diag[tri[t * 3 + ((e + 1) % 3)]]--;
    mate[t] = mate[u] = -1;
  };
  const free: number[] = [];
  const pairWithRandom = (t: number) => {
    free.length = 0;
    for (let e = 0; e < 3; e++) { const u = nbr[t * 3 + e]; if (u >= 0 && mate[u] < 0) free.push(u); }
    if (free.length) pair(t, free[rng.int(0, free.length - 1)]);
  };
  for (let n = 0; n < nTri; n++) { const t = order[n]; if (mate[t] < 0) pairWithRandom(t); }

  // Un vértice sin ninguna diagonal queda con seis cuadriláteros de 60°, que no pasan la revisión del radio. Se repara:
  // se juntan dos triángulos vecinos de ese vértice (soltando a sus parejas, que se vuelven a aparear si pueden).
  const around = new Int32Array(nLat).fill(-1); // un triángulo que toca cada vértice
  for (let t = 0; t < nTri; t++) for (let e = 0; e < 3; e++) around[tri[t * 3 + e]] = t;
  const fan: number[] = [];
  /** Los triángulos que rodean a v, en orden (un anillo, o un abanico si v está en el borde de la trama). */
  const fanOf = (v: number) => {
    fan.length = 0;
    const start = around[v];
    if (start < 0) return;
    let t = start, came = -1;
    for (let k = 0; k < 8; k++) {
      fan.push(t);
      let next = -1;
      for (let e = 0; e < 3 && next < 0; e++) {
        if (tri[t * 3 + e] !== v && tri[t * 3 + ((e + 1) % 3)] !== v) continue; // el lado no toca a v
        const u = nbr[t * 3 + e];
        if (u >= 0 && u !== came) next = u;
      }
      if (next < 0 || next === start) break;
      came = t; t = next;
    }
  };
  for (let pass = 0; pass < REPAIR_PASSES; pass++) {
    let bad = 0;
    for (let v = 0; v < nLat; v++) {
      if (diag[v] > 0 || fixed[v] === 1) continue;
      fanOf(v);
      if (fan.length < 2) continue;
      bad++;
      const i = rng.int(0, fan.length - 2), a = fan[i], b = fan[i + 1];
      const ma = mate[a], mb = mate[b];
      if (ma >= 0) unpair(a);
      if (mb >= 0) unpair(b);
      pair(a, b);
      if (ma >= 0 && ma !== b) pairWithRandom(ma);
      if (mb >= 0 && mb !== a) pairWithRandom(mb);
    }
    if (!bad) break;
  }

  // ── 3. Subdivisión: cada rombo en cuatro cuadriláteros, cada triángulo en tres.
  const vx: number[] = Array.from(lx), vz: number[] = Array.from(lz);
  const midOf = new Map<number, number>();
  const mid = (a: number, b: number) => {
    const k = key(a, b);
    let m = midOf.get(k);
    if (m === undefined) {
      m = vx.length;
      vx.push((lx[a] + lx[b]) * 0.5); vz.push((lz[a] + lz[b]) * 0.5);
      fixed.push(loose.get(k) ?? 0);
      midOf.set(k, m);
    }
    return m;
  };

  const quads: number[] = [];
  // Cuadriláteros de una cara de n vértices (en el sentido de giro): [V_k, medio(k,k+1), centro, medio(k-1,k)].
  const face = (v: number[]) => {
    const n = v.length;
    let cx = 0, cz = 0;
    for (let k = 0; k < n; k++) { cx += lx[v[k]]; cz += lz[v[k]]; }
    const c = vx.length;
    vx.push(cx / n); vz.push(cz / n); fixed.push(0);
    for (let k = 0; k < n; k++) { quads.push(v[k], mid(v[k], v[(k + 1) % n]), c, mid(v[(k + n - 1) % n], v[k])); }
  };
  // Que la cara quede en el sentido de giro del módulo.
  const orient = (v: number[]) => {
    let s = 0;
    for (let k = 0; k < v.length; k++) { const a = v[k], b = v[(k + 1) % v.length]; s += lx[a] * lz[b] - lx[b] * lz[a]; }
    return s > 0 ? v : v.reverse();
  };
  for (let t = 0; t < nTri; t++) {
    const u = mate[t];
    if (u < 0) { face(orient([tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]])); continue; }
    if (u < t) continue; // el rombo se arma una vez
    // El lado compartido (p,q); la punta de cada triángulo (r, s): el rombo da la vuelta r, p, s, q.
    let ep = 0;
    for (let e = 0; e < 3; e++) if (nbr[t * 3 + e] === u) ep = e;
    const p = tri[t * 3 + ep], q = tri[t * 3 + ((ep + 1) % 3)], rr = tri[t * 3 + ((ep + 2) % 3)];
    let s = -1;
    for (let e = 0; e < 3; e++) { const w = tri[u * 3 + e]; if (w !== p && w !== q) s = w; }
    face(orient([rr, p, s, q]));
  }

  // ── 4. Relajado.
  const nV = vx.length, nQ = quads.length >> 2;
  const X = Float64Array.from(vx), Z = Float64Array.from(vz);
  const Q = Int32Array.from(quads);
  const px = new Float64Array(nV), pz = new Float64Array(nV), pn = new Float64Array(nV);
  // Media diagonal de un cuadrado del tamaño que les toca: el área de la trama repartida entre los cuadriláteros.
  const ideal = Math.sqrt(0.5 * nTri * SQRT3 * side * side / nQ);
  const softR2 = SOFT_RADIUS * SOFT_RADIUS * side * side;
  const softMin2 = SOFT_SIDE * SOFT_SIDE * side * side;
  for (let it = 0; it < ITERATIONS; it++) {
    px.fill(0); pz.fill(0); pn.fill(0);
    for (let q = 0; q < nQ; q++) {
      const i0 = Q[q * 4], i1 = Q[q * 4 + 1], i2 = Q[q * 4 + 2], i3 = Q[q * 4 + 3];
      const x0 = X[i0], x1 = X[i1], x2 = X[i2], x3 = X[i3], z0 = Z[i0], z1 = Z[i1], z2 = Z[i2], z3 = Z[i3];
      const cx = (x0 + x1 + x2 + x3) * 0.25, cz = (z0 + z1 + z2 + z3) * 0.25;
      const d0x = x0 - cx, d0z = z0 - cz, d1x = x1 - cx, d1z = z1 - cz;
      const d2x = x2 - cx, d2z = z2 - cz, d3x = x3 - cx, d3z = z3 - cz;
      // Cada d_k girado hacia atrás k cuartos de vuelta apunta como d0: (x,z) → (z,−x), (−x,−z), (−z,x).
      let ax = (d0x + d1z - d2x - d3z) * 0.25, az = (d0z - d1x - d2z + d3x) * 0.25;
      const len = Math.sqrt(ax * ax + az * az);
      if (len > 1e-9) { const k = 1 + SIZE_PULL * (ideal / len - 1); ax *= k; az *= k; }
      // Un cuadrilátero muy grande, muy torcido o con un lado muy corto pesa más en el tirón de sus vértices.
      let w = 1;
      if (d0x * d0x + d0z * d0z > softR2 || d1x * d1x + d1z * d1z > softR2 || d2x * d2x + d2z * d2z > softR2 || d3x * d3x + d3z * d3z > softR2) w = BOOST;
      else {
        const s0x = x1 - x0, s0z = z1 - z0, s1x = x2 - x1, s1z = z2 - z1, s2x = x3 - x2, s2z = z3 - z2, s3x = x0 - x3, s3z = z0 - z3;
        const l0 = s0x * s0x + s0z * s0z, l1 = s1x * s1x + s1z * s1z, l2 = s2x * s2x + s2z * s2z, l3 = s3x * s3x + s3z * s3z;
        if (l0 < softMin2 || l1 < softMin2 || l2 < softMin2 || l3 < softMin2) w = BOOST;
        else {
          // cos² del ángulo en cada vértice (producto punto entre los dos lados) contra el tope.
          const c0 = s3x * s0x + s3z * s0z, c1 = s0x * s1x + s0z * s1z, c2 = s1x * s2x + s1z * s2z, c3 = s2x * s3x + s2z * s3z;
          if (c0 * c0 > SOFT_COS2 * l3 * l0 || c1 * c1 > SOFT_COS2 * l0 * l1 || c2 * c2 > SOFT_COS2 * l1 * l2 || c3 * c3 > SOFT_COS2 * l2 * l3) w = BOOST;
        }
      }
      // El lugar ideal de cada vértice: c + a girado k cuartos de vuelta hacia adelante, (x,z) → (−z,x).
      px[i0] += w * (cx + ax - x0); pz[i0] += w * (cz + az - z0); pn[i0] += w;
      px[i1] += w * (cx - az - x1); pz[i1] += w * (cz + ax - z1); pn[i1] += w;
      px[i2] += w * (cx - ax - x2); pz[i2] += w * (cz - az - z2); pn[i2] += w;
      px[i3] += w * (cx + az - x3); pz[i3] += w * (cz - ax - z3); pn[i3] += w;
    }
    for (let v = 0; v < nV; v++) {
      const f = fixed[v];
      if (f === 1 || pn[v] === 0) continue;
      const k = 0.5 / pn[v];
      if (f === 0) X[v] += px[v] * k;
      Z[v] += pz[v] * k;
    }
  }

  // ── 5. Recorte a lo que se usa (los cuadriláteros que tocan la región), redondeo y espejo.
  const lo = r.minX, hi = mirror ? reach : r.maxX, zlo = r.minZ, zhi = r.maxZ;
  const remap = new Int32Array(nV).fill(-1);
  const ox: number[] = [], oz: number[] = [], oq: number[] = [];
  const round = (v: number) => Math.round(v * 256) / 256;
  for (let q = 0; q < nQ; q++) {
    const a = Q[q * 4], b = Q[q * 4 + 1], c = Q[q * 4 + 2], d = Q[q * 4 + 3];
    const mnx = Math.min(X[a], X[b], X[c], X[d]), mxx = Math.max(X[a], X[b], X[c], X[d]);
    const mnz = Math.min(Z[a], Z[b], Z[c], Z[d]), mxz = Math.max(Z[a], Z[b], Z[c], Z[d]);
    if (mxx < lo || mnx > hi || mxz < zlo || mnz > zhi) continue;
    for (let k = 0; k < 4; k++) {
      const v = Q[q * 4 + k];
      if (remap[v] < 0) { remap[v] = ox.length; ox.push(round(X[v])); oz.push(round(Z[v])); }
      oq.push(remap[v]);
    }
  }
  if (!mirror) return { vx: Float64Array.from(ox), vz: Float64Array.from(oz), quads: Int32Array.from(oq), seed, attempts: 1 };

  // Espejo: los vértices del eje son los mismos; los demás se copian con x cambiado de signo, y los cuadriláteros
  // de la copia van con los vértices en el orden inverso para conservar el sentido de giro.
  const nHalf = ox.length;
  const twin = new Int32Array(nHalf);
  const fx = ox.slice(), fz = oz.slice();
  for (let v = 0; v < nHalf; v++) {
    if (ox[v] === 0) { twin[v] = v; continue; }
    twin[v] = fx.length;
    fx.push(-ox[v]); fz.push(oz[v]);
  }
  const fq = oq.slice();
  for (let q = 0; q < oq.length; q += 4) fq.push(twin[oq[q + 3]], twin[oq[q + 2]], twin[oq[q + 1]], twin[oq[q]]);
  return { vx: Float64Array.from(fx), vz: Float64Array.from(fz), quads: Int32Array.from(fq), seed, attempts: 1 };
}
