// Lectura del mapa para la decoración contextual: mira la forma de la grilla y dice qué hay en cada lugar
// (una hilera de muros, un muro suelto, un puente, un claro, un borde que da al vacío). Con eso cada juego
// pone sus piezas (ambience.ts). No dibuja nada ni toca la simulación: solo clasifica.
import { CELL, LEVEL_H, WALL_TOP } from '../core/constants';
import { CellType, type Cell, type Terrain } from '../core/terrain';

/** Lados de una celda: norte, este, sur, oeste (el norte es arriba en el mapa, -z en el mundo). */
export const SIDES: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * Forma de un muro según sus vecinos:
 *  solo: sin muros al lado · end: punta de una hilera · line: tramo recto · corner: codo · tee/cross: cruce ·
 *  block: parte de un macizo (un cuadrado de 2×2 muros o más).
 */
export type WallShape = 'solo' | 'end' | 'line' | 'corner' | 'tee' | 'cross' | 'block';

export interface WallSpot {
  ix: number; iz: number; x: number; z: number;
  shape: WallShape;
  /** Por lado: ¿hay otro muro? */
  wall: boolean[];
  /** Por lado: ¿da al vacío? */
  void: boolean[];
  /** Largo de la hilera recta más larga que pasa por este muro (en celdas). */
  run: number;
  /** Giro (rad, sobre Y) que orienta la pieza: una hilera a lo largo, una punta mirando hacia afuera. */
  rot: number;
}

/** Piso de una celda de ancho con vacío a los dos lados. axis: 'x' si el puente corre de este a oeste. */
export interface BridgeSpot { ix: number; iz: number; x: number; z: number; axis: 'x' | 'z'; /** Largo del puente (celdas). */ run: number; /** Posición dentro del puente, 0..run-1. */ at: number }

/** Lado de una celda que da al vacío. */
export interface CoastSpot { ix: number; iz: number; side: number; x: number; z: number; nx: number; nz: number; /** Altura del borde. */ y: number }

/** Claro: piso llano y libre alrededor de un punto. r en metros. */
export interface Clearing { ix: number; iz: number; x: number; z: number; r: number }

export interface Topology {
  walls: WallSpot[];
  bridges: BridgeSpot[];
  coasts: CoastSpot[];
  clearings: Clearing[];
}

/** Celdas que tienen que quedar despejadas: donde se aparece, se farmea, se disputa o hay algo del mapa. */
export function reservedCells(t: Terrain): Set<number> {
  const pts: [number, number, number][] = [];
  for (const s of [...t.spawns.team[0], ...t.spawns.team[1], ...t.spawns.ffa]) pts.push([s.x, s.z, 0.5]);
  for (const d of t.destructs) pts.push([d.x, d.z, 0.5]);
  for (const g of t.gadgets) pts.push([g.x, g.z, 0.5]);
  for (const z of t.zonePoints) pts.push([z.x, z.z, 1.3]);
  for (const p of t.towers) pts.push([p.x, p.z, 1.6]);
  for (const p of t.cores) pts.push([p.x, p.z, 3]);
  for (const p of t.camps) pts.push([p.x, p.z, 2.2]);
  for (const p of t.lairs) pts.push([p.x, p.z, 3]);
  const out = new Set<number>();
  for (let i = 0; i < t.cells.length; i++) {
    if (t.cells[i].pad) { out.add(i); continue; }
    const c = t.cellCenter(i % t.w, Math.floor(i / t.w));
    if (pts.some(([x, z, rad]) => Math.hypot(c.x - x, c.z - z) <= rad)) out.add(i);
  }
  for (const g of t.gates) for (const ci of g.cells) out.add(ci);
  return out;
}

export function analyze(t: Terrain, reserved = reservedCells(t)): Topology {
  const cell = (ix: number, iz: number): Cell | null => {
    if (ix < 0 || iz < 0 || ix >= t.w || iz >= t.h) return null;
    const c = t.cells[iz * t.w + ix];
    return c.type === CellType.Void ? null : c;
  };
  const isWall = (ix: number, iz: number) => cell(ix, iz)?.type === CellType.Wall;
  /** Piso firme y llano del nivel de abajo, sin nada encima. */
  const plain = (ix: number, iz: number) => {
    const c = cell(ix, iz);
    return !!c && c.type === CellType.Floor && c.level === 0 && c.fragile < 0 && !reserved.has(iz * t.w + ix);
  };

  const walls: WallSpot[] = [], bridges: BridgeSpot[] = [], coasts: CoastSpot[] = [];
  for (let iz = 0; iz < t.h; iz++) for (let ix = 0; ix < t.w; ix++) {
    const c = cell(ix, iz);
    if (!c) continue;
    const ctr = t.cellCenter(ix, iz);
    const nb = SIDES.map(([dx, dz]) => cell(ix + dx, iz + dz));

    if (c.fragile < 0) {
      const y = c.type === CellType.Wall ? WALL_TOP : c.type === CellType.Ramp ? 0 : c.level * LEVEL_H;
      SIDES.forEach(([dx, dz], s) => {
        if (!nb[s]) coasts.push({ ix, iz, side: s, x: ctr.x + dx * (CELL / 2), z: ctr.z + dz * (CELL / 2), nx: dx, nz: dz, y });
      });
    }

    if (c.type === CellType.Wall) {
      const w = SIDES.map(([dx, dz]) => isWall(ix + dx, iz + dz));
      const n = w.filter(Boolean).length;
      const block = [[-1, -1], [0, -1], [-1, 0], [0, 0]].some(([ox, oz]) => isWall(ix + ox, iz + oz) && isWall(ix + ox + 1, iz + oz) && isWall(ix + ox, iz + oz + 1) && isWall(ix + ox + 1, iz + oz + 1));
      let shape: WallShape, rot = 0;
      if (block) shape = 'block';
      else if (n === 0) shape = 'solo';
      else if (n === 1) { shape = 'end'; rot = sideRot((w.indexOf(true) + 2) % 4); }
      else if (n === 2 && w[0] === w[2]) { shape = 'line'; rot = w[1] ? 0 : Math.PI / 2; }
      else if (n === 2) { shape = 'corner'; rot = sideRot(w.findIndex((v, s) => v && w[(s + 1) % 4])); }
      else shape = n === 3 ? 'tee' : 'cross';
      const span = (dx: number, dz: number) => { let k = 0; while (isWall(ix + dx * (k + 1), iz + dz * (k + 1))) k++; return k; };
      const run = Math.max(1 + span(1, 0) + span(-1, 0), 1 + span(0, 1) + span(0, -1));
      walls.push({ ix, iz, x: ctr.x, z: ctr.z, shape, wall: w, void: nb.map((q) => !q), run, rot });
    } else if (plain(ix, iz) || (c.type === CellType.Floor && c.level === 0 && c.fragile < 0)) {
      // Puente: vacío de los dos lados y piso para seguir de largo.
      const ew = !nb[0] && !nb[2] && !!nb[1] && !!nb[3], ns = !nb[1] && !nb[3] && !!nb[0] && !!nb[2];
      if (ew || ns) bridges.push({ ix, iz, x: ctr.x, z: ctr.z, axis: ew ? 'x' : 'z', run: 1, at: 0 });
    }
  }

  // Largo de cada puente y lugar de cada celda en él.
  const bKey = (ix: number, iz: number) => iz * t.w + ix;
  const bMap = new Map(bridges.map((b) => [bKey(b.ix, b.iz), b]));
  for (const b of bridges) {
    const [dx, dz] = b.axis === 'x' ? [1, 0] : [0, 1];
    const same = (k: number) => bMap.get(bKey(b.ix + dx * k, b.iz + dz * k))?.axis === b.axis;
    let back = 0, fwd = 0;
    while (same(-(back + 1))) back++;
    while (same(fwd + 1)) fwd++;
    b.run = back + fwd + 1;
    b.at = back;
  }

  // Claros: qué tan lejos está cada celda llana de la primera cosa que no lo es (distancia en celdas, en cuadrado).
  const dist = new Int32Array(t.w * t.h);
  for (let iz = 0; iz < t.h; iz++) for (let ix = 0; ix < t.w; ix++) {
    if (!plain(ix, iz)) continue;
    let d = 1;
    grow: for (; d < 6; d++) {
      for (let oz = -d; oz <= d; oz++) for (let ox = -d; ox <= d; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) === d && !plain(ix + ox, iz + oz)) break grow;
      }
    }
    dist[iz * t.w + ix] = d - 1;
  }
  // Las celdas igual de despejadas que se tocan forman una meseta: el claro va en su centro (así, si mide un número
  // par de celdas, cae entre dos y no corrido para un lado). Una meseta larga, como una recta de la pista, se parte
  // en tramos parejos a lo largo. Todo simétrico: en un mapa espejado los claros salen espejados.
  const cand: Clearing[] = [];
  const seen = new Uint8Array(t.w * t.h);
  for (let start = 0; start < dist.length; start++) {
    const d = dist[start];
    if (d < 1 || seen[start]) continue;
    const comp: number[] = [start];
    seen[start] = 1;
    for (let q = 0; q < comp.length; q++) {
      const ix = comp[q] % t.w, iz = Math.floor(comp[q] / t.w);
      for (const [dx, dz] of SIDES) {
        const nx = ix + dx, nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= t.w || nz >= t.h) continue;
        const ni = nz * t.w + nx;
        if (seen[ni] || dist[ni] !== d) continue;
        seen[ni] = 1;
        comp.push(ni);
      }
    }
    const xs = comp.map((i) => i % t.w), zs = comp.map((i) => Math.floor(i / t.w));
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const alongX = maxX - minX >= maxZ - minZ;
    const lo = alongX ? minX : minZ, ext = (alongX ? maxX - minX : maxZ - minZ) + 1;
    const parts = Math.max(1, Math.round(ext / ((2 * d + 3) * 1.5)));
    const inComp = new Set(comp);
    for (let part = 0; part < parts; part++) {
      const cells = comp.filter((_, k) => Math.min(parts - 1, Math.floor((((alongX ? xs[k] : zs[k]) - lo + 0.5) * parts) / ext)) === part);
      if (!cells.length) continue;
      let fx = 0, fz = 0;
      for (const i of cells) { fx += i % t.w; fz += Math.floor(i / t.w); }
      fx /= cells.length; fz /= cells.length;
      // La celda de la meseta más cercana a ese centro (a igual distancia, una fija).
      let rep = cells[0], best = Infinity;
      for (const i of cells) {
        const dd = Math.hypot((i % t.w) - fx, Math.floor(i / t.w) - fz);
        if (dd < best - 1e-9) { best = dd; rep = i; }
      }
      const rx = rep % t.w, rz = Math.floor(rep / t.w);
      // Si el centro cae entre celdas de la meseta, se usa tal cual; si cae afuera (una meseta en L), va la celda.
      const around = [[Math.floor(fx), Math.floor(fz)], [Math.ceil(fx), Math.floor(fz)], [Math.floor(fx), Math.ceil(fz)], [Math.ceil(fx), Math.ceil(fz)]];
      const inside = around.every(([ax, az]) => inComp.has(az * t.w + ax));
      const c = t.cellCenter(rx, rz);
      cand.push({ ix: rx, iz: rz, x: inside ? c.x + (fx - rx) * CELL : c.x, z: inside ? c.z + (fz - rz) * CELL : c.z, r: (d + 0.5) * CELL });
    }
  }
  // Primero los más amplios; a igual tamaño, los más cercanos al centro (en un mapa espejado los dos gemelos quedan
  // juntos en la lista, así entran los dos o ninguno), y después un orden fijo para que se vea igual en todas las pantallas.
  const mid = (c: Clearing) => Math.round(Math.hypot(c.x, c.z) * 4);
  cand.sort((a, b) => b.r - a.r || mid(a) - mid(b) || a.z - b.z || a.x - b.x);
  const clearings: Clearing[] = [];
  for (const c of cand) {
    if (clearings.every((o) => Math.hypot(o.x - c.x, o.z - c.z) >= o.r + c.r + CELL)) clearings.push(c);
  }
  return { walls, bridges, coasts, clearings };
}

/** Giro sobre Y para que una pieza que mira al este (+x) mire hacia el lado s. */
export function sideRot(s: number): number {
  return [Math.PI / 2, 0, -Math.PI / 2, Math.PI][s];
}

/** Los primeros `max` claros, sin separar gemelos: en un mapa espejado un claro y su reflejo entran juntos o no entra ninguno. */
export function takeClearings(list: Clearing[], max: number): Clearing[] {
  const out: Clearing[] = [];
  for (let i = 0; i < list.length;) {
    const twin = i + 1 < list.length && list[i + 1].r === list[i].r && Math.abs(list[i + 1].z - list[i].z) < 1e-6 && Math.abs(list[i + 1].x + list[i].x) < 1e-6;
    const n = twin ? 2 : 1;
    if (out.length + n <= max) out.push(...list.slice(i, i + n));
    i += n;
  }
  return out;
}
