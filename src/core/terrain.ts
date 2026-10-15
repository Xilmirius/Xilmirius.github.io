// Terreno: el plano del mapa (la grilla de celdas de 2 m, con niveles, rampas, losas frágiles y puertas: la capa lógica) y la malla
// que lo estampa (`mesh`: la capa física y visual, cuadrada u orgánica, ver docs/MALLA.md). El plano dice qué hay y dónde; la malla
// dice dónde hay piso, a qué altura y contra qué se choca. Simple, barato de sincronizar (la malla sale de la semilla de la partida)
// y suficiente para "desniveles limitados de 1-2 niveles" (GDD §7).
import { CELL, ISLAND_BOTTOM, LEVEL_H, TILE_HP, WALL_TOP } from './constants';
import { CONTACT_CELL, CONTACT_RAMP, rectContact, type ContactSink } from './contact';
import { circleOverlapsBox, type V3 } from './math';
import { buildOrganicMesh, buildSquareMesh, wedgeTop, type TerrainMesh } from './terrainMesh';
import type { GadgetKind, GadgetSpawn } from './gadgets';
import type { Family } from './types';
import { MAPS, type MapDef } from './maps';

export enum CellType { Void = 0, Floor = 1, Wall = 2, Ramp = 3 }
/** Dirección hacia donde SUBE la rampa. */
export enum RampDir { N = 0, S = 1, W = 2, E = 3 }

export interface Cell {
  type: CellType;
  level: number;
  ramp: RampDir;
  fragile: number; // índice en la lista de frágiles o -1
  /** Resorte: pisarlo te lanza hacia arriba. */
  pad: boolean;
}

/** explosive: barril que explota al romperse (usa el cuerpo de la chatarra). */
/** ¿Está el punto en el rectángulo? Los bordes de abajo y de la izquierda cuentan y los otros no: un punto sobre el borde entre dos celdas es de una sola, como en la grilla. */
const inCell = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number) => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ;

/** Lo que frena a un cuerpo en el terreno (`Terrain.blockAt`). */
export interface TerrainBlock { minX: number; maxX: number; minZ: number; maxZ: number; top: number; cell: number }

export interface DestructSpawn { kind: Family; x: number; z: number; y: number; explosive?: boolean }
/** Pieza fija de un mapa de Asedio (torre o núcleo) de un equipo. */
export interface TeamPiece { team: number; x: number; z: number }

export const TILE_INTACT = 0, TILE_CRACKED = 1, TILE_BROKEN = 2, TILE_CRUMBLING = 3, TILE_GONE = 4;

const DESTRUCT_CHARS: Record<string, [Family, number]> = {
  o: ['stone', 0], m: ['metal', 0], c: ['crystal', 0], g: ['goo', 0],
  O: ['stone', 1], M: ['metal', 1], C: ['crystal', 1], G: ['goo', 1],
};

/** En minúscula van en el piso (n0); en mayúscula, sobre una plataforma (n1). */
const GADGET_CHARS: Record<string, GadgetKind> = { p: 'bumper', r: 'rotor', y: 'geyser', '?': 'box', a: 'boost', P: 'bumper', R: 'rotor', Y: 'geyser' };
/** Lanzabolas: la letra dice hacia dónde ruedan las bolas [dx, dz] (el norte es arriba en el mapa). */
const ROLLER_CHARS: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

/**
 * Puerta de la Carrera: una franja de celdas que hay que pisar (punto de control o meta). `cells` son las celdas reales
 * (sirven para reaparecer y para medir el avance); `detect` son las que cuentan para saber si alguien la pasó: con la malla
 * orgánica el piso puede asomar hasta 1 m fuera de la celda del plano, así que suma las celdas de vacío que la rodean.
 */
export interface Gate { x: number; z: number; cells: Set<number>; detect: Set<number> }

/** Cómo se arma el terreno: con la malla orgánica sembrada por `seed` (si no pasa su comprobación, con la cuadrada). */
export interface TerrainOptions { organic?: boolean; seed?: number }

export class Terrain {
  readonly def: MapDef;
  readonly w: number;
  readonly h: number;
  readonly cells: Cell[] = [];
  readonly originX: number;
  readonly originZ: number;
  readonly spawns: { team: V3[][]; ffa: V3[] } = { team: [[], []], ffa: [] };
  readonly destructs: DestructSpawn[] = [];
  readonly zonePoints: V3[] = [];
  readonly fragile: number[] = []; // índices de celda
  // Asedio (MOBA)
  readonly towers: TeamPiece[] = [];
  readonly cores: TeamPiece[] = [];
  readonly camps: V3[] = [];
  readonly lairs: V3[] = [];
  /** Recorrido de cada línea en coordenadas del mundo, de la base A a la base B. */
  readonly lanes: V3[][] = [];
  /** Artefactos del mapa (paragolpes, rotores, géiseres, cajas). Los resortes son celdas (`pad`). */
  readonly gadgets: GadgetSpawn[] = [];
  /** Carrera de obstáculos: puntos de control en orden (dígitos 2..9 del mapa) y, al final, la meta ('F'). */
  readonly gates: Gate[] = [];
  tileState: Uint8Array;
  tileHp: Float32Array;
  tileTimer: Float32Array;
  /** Se incrementa cada vez que cambia el terreno (para que el render se entere). */
  version = 0;
  /**
   * La malla: la capa física (docs/MALLA.md). Las preguntas de piso, choque, losa y resorte pasan por acá; el plano
   * (`cells`, `cellIndexAt`, `isWalkable`...) sigue siendo la capa lógica.
   */
  mesh!: TerrainMesh;
  /** Se pidió la malla orgánica y ninguna semilla pasó la comprobación: el terreno quedó cuadrado. */
  meshFellBack = false;
  /** La caja que envuelve a cada losa frágil (4 números por losa: minX, maxX, minZ, maxZ). */
  private slabBox!: Float64Array;
  private nearBuf: number[] = [];
  private sideBuf = new Float64Array(4);

  constructor(mapId: string, opts: TerrainOptions = {}) {
    const def = MAPS[mapId] ?? MAPS.cantera;
    this.def = def;
    this.h = def.rows.length;
    this.w = Math.max(...def.rows.map((r) => r.length));
    this.originX = (-this.w * CELL) / 2;
    this.originZ = (-this.h * CELL) / 2;
    const zoneCells: [number, number, number][] = [];
    const lairCells: [number, number, number][] = [];
    const gateCells = new Map<number, number[]>(); // 2..9 puntos de control, 99 la meta
    const mark = (n: number, ci: number) => { if (!gateCells.has(n)) gateCells.set(n, []); gateCells.get(n)!.push(ci); };
    for (let iz = 0; iz < this.h; iz++) {
      const row = def.rows[iz];
      for (let ix = 0; ix < this.w; ix++) {
        const ch = row[ix] ?? ' ';
        const cell: Cell = { type: CellType.Floor, level: 0, ramp: RampDir.N, fragile: -1, pad: false };
        const c = this.cellCenter(ix, iz);
        switch (ch) {
          case ' ': cell.type = CellType.Void; break;
          case '.': break;
          case ',': cell.fragile = this.fragile.length; this.fragile.push(iz * this.w + ix); break;
          case '1': cell.level = 1; break;
          case ':': cell.level = 1; cell.fragile = this.fragile.length; this.fragile.push(iz * this.w + ix); break;
          case '#': cell.type = CellType.Wall; cell.level = 2; break;
          case '^': cell.type = CellType.Ramp; cell.ramp = RampDir.N; break;
          case 'v': cell.type = CellType.Ramp; cell.ramp = RampDir.S; break;
          case '<': cell.type = CellType.Ramp; cell.ramp = RampDir.W; break;
          case '>': cell.type = CellType.Ramp; cell.ramp = RampDir.E; break;
          case 'A': this.spawns.team[0].push({ x: c.x, y: 0, z: c.z }); this.spawns.ffa.push({ x: c.x, y: 0, z: c.z }); break;
          case 'B': this.spawns.team[1].push({ x: c.x, y: 0, z: c.z }); this.spawns.ffa.push({ x: c.x, y: 0, z: c.z }); break;
          case '*': this.spawns.ffa.push({ x: c.x, y: 0, z: c.z }); break;
          case 'z': zoneCells.push([ix, iz, 0]); break;
          case 'Z': cell.level = 1; zoneCells.push([ix, iz, 1]); break;
          case 'X': this.towers.push({ team: 0, x: c.x, z: c.z }); break;
          case 'x': this.towers.push({ team: 1, x: c.x, z: c.z }); break;
          case 'K': this.cores.push({ team: 0, x: c.x, z: c.z }); break;
          case 'k': this.cores.push({ team: 1, x: c.x, z: c.z }); break;
          case 'n': this.camps.push({ x: c.x, y: 0, z: c.z }); break;
          case '@': lairCells.push([ix, iz, 0]); break;
          case 'J': cell.pad = true; break;
          case 'e': this.destructs.push({ kind: 'metal', x: c.x, z: c.z, y: 0, explosive: true }); break;
          case 'F': mark(99, iz * this.w + ix); break;
          default: {
            const d = DESTRUCT_CHARS[ch];
            const g = GADGET_CHARS[ch];
            const roll = ROLLER_CHARS[ch];
            if (roll) {
              this.gadgets.push({ kind: 'roller', x: c.x, y: 0, z: c.z, dx: roll[0], dz: roll[1], len: 0 });
            } else if (d) {
              cell.level = d[1];
              this.destructs.push({ kind: d[0], x: c.x, z: c.z, y: d[1] * LEVEL_H });
            } else if (g) {
              const up = ch >= 'A' && ch <= 'Z' ? 1 : 0;
              cell.level = up;
              this.gadgets.push({ kind: g, x: c.x, y: up * LEVEL_H, z: c.z });
            } else if (ch >= '2' && ch <= '9') {
              mark(Number(ch), iz * this.w + ix);
            }
          }
        }
        this.cells.push(cell);
      }
    }
    this.zonePoints.push(...this.groupCells(zoneCells));
    this.lairs.push(...this.groupCells(lairCells));
    for (const n of [...gateCells.keys()].sort((a, b) => a - b)) {
      const cells = gateCells.get(n)!;
      let x = 0, z = 0;
      for (const ci of cells) { const c = this.cellCenter(ci % this.w, Math.floor(ci / this.w)); x += c.x; z += c.z; }
      const set = new Set(cells);
      this.gates.push({ x: x / cells.length, z: z / cells.length, cells: set, detect: set });
    }
    for (const lane of def.lanes ?? []) {
      this.lanes.push(lane.map(([ix, iz]) => { const c = this.cellCenter(ix, iz); return { x: c.x, y: 0, z: c.z }; }));
    }
    const n = this.fragile.length;
    this.tileState = new Uint8Array(n);
    this.tileHp = new Float32Array(n).fill(TILE_HP);
    this.tileTimer = new Float32Array(n);
    this.mesh = buildSquareMesh(this);
    if (opts.organic) {
      const r = buildOrganicMesh(this, opts.seed ?? 0);
      if (r.mesh) this.mesh = r.mesh;
      else {
        this.meshFellBack = true;
        console.warn(`[terreno] la malla orgánica de ${mapId} no pasó su comprobación en ${r.attempts} semillas; la partida usa la cuadrada.`, r.problems);
      }
    }
    this.measureRollers();
    this.widenGates();
    this.measureSlabs();
  }

  /**
   * Lanzabolas: las bolas ruedan hasta donde termina el piso llano que tienen por delante. En la malla cuadrada es el borde
   * de la última celda de piso de nivel 0; en la orgánica se mide caminando el piso real (docs/MALLA.md §5).
   */
  private measureRollers() {
    for (const g of this.gadgets) {
      if (g.kind !== 'roller') continue;
      if (this.mesh.mode === 'square') {
        let ix = Math.floor((g.x - this.originX) / CELL), iz = Math.floor((g.z - this.originZ) / CELL), n = 0;
        for (;;) {
          ix += g.dx!; iz += g.dz!;
          const c = ix < 0 || iz < 0 || ix >= this.w || iz >= this.h ? null : this.cells[iz * this.w + ix];
          if (!c || c.type !== CellType.Floor || c.level !== 0) break;
          n++;
        }
        g.len = (n + 0.5) * CELL;
        continue;
      }
      const flat = (d: number) => this.groundAt(g.x + g.dx! * d, g.z + g.dz! * d) === 0;
      const STEP = 0.1, MAX = (this.w + this.h) * CELL;
      let good = 0;
      while (good + STEP < MAX && flat(good + STEP)) good += STEP;
      // El borde está entre `good` y `good + STEP`: se afina a la mitad hasta el milímetro.
      let bad = good + STEP;
      for (let i = 0; i < 12; i++) { const mid = (good + bad) / 2; if (flat(mid)) good = mid; else bad = mid; }
      g.len = good;
    }
  }

  /** Con la malla orgánica, una puerta detecta también en las celdas de vacío del plano que la rodean. */
  private widenGates() {
    if (this.mesh.mode !== 'organic') return;
    for (const g of this.gates) {
      const wide = new Set(g.cells);
      for (const ci of g.cells) {
        const cx = ci % this.w, cz = Math.floor(ci / this.w);
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, nz = cz + dz;
            if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
            const ni = nz * this.w + nx;
            if (this.cells[ni].type === CellType.Void) wide.add(ni);
          }
        }
      }
      g.detect = wide;
    }
  }

  private measureSlabs() {
    const n = this.fragile.length, m = this.mesh;
    this.slabBox = new Float64Array(n * 4);
    for (let fi = 0; fi < n; fi++) {
      const b = this.cellBounds(this.fragile[fi]);
      this.slabBox.set([b.minX, b.maxX, b.minZ, b.maxZ], fi * 4);
    }
    if (m.mode !== 'organic') return;
    const seen = new Uint8Array(n);
    for (let q = 0; q < m.count; q++) {
      const fi = m.slab[q];
      if (fi < 0) continue;
      const k = fi * 4;
      if (!seen[fi]) { seen[fi] = 1; this.slabBox[k] = m.minX[q]; this.slabBox[k + 1] = m.maxX[q]; this.slabBox[k + 2] = m.minZ[q]; this.slabBox[k + 3] = m.maxZ[q]; continue; }
      if (m.minX[q] < this.slabBox[k]) this.slabBox[k] = m.minX[q];
      if (m.maxX[q] > this.slabBox[k + 1]) this.slabBox[k + 1] = m.maxX[q];
      if (m.minZ[q] < this.slabBox[k + 2]) this.slabBox[k + 2] = m.minZ[q];
      if (m.maxZ[q] > this.slabBox[k + 3]) this.slabBox[k + 3] = m.maxZ[q];
    }
  }

  /** La caja que envuelve a la losa frágil `fi`: la celda del plano en la cuadrada; en la orgánica, todo lo que cubren sus celdas de la malla. */
  slabBounds(fi: number) {
    const k = fi * 4;
    return { minX: this.slabBox[k], maxX: this.slabBox[k + 1], minZ: this.slabBox[k + 2], maxZ: this.slabBox[k + 3] };
  }

  /** Agrupa celdas marcadas contiguas en un solo punto (el promedio). */
  private groupCells(cells: [number, number, number][]): V3[] {
    const out: V3[] = [];
    const used = new Set<number>();
    for (let i = 0; i < cells.length; i++) {
      if (used.has(i)) continue;
      const group = [i];
      used.add(i);
      for (let k = 0; k < group.length; k++) {
        const [ax, az] = cells[group[k]];
        for (let j = 0; j < cells.length; j++) {
          if (used.has(j)) continue;
          const [bx, bz] = cells[j];
          if (Math.abs(ax - bx) + Math.abs(az - bz) === 1) { used.add(j); group.push(j); }
        }
      }
      let x = 0, z = 0, lv = 0;
      for (const g of group) {
        const c = this.cellCenter(cells[g][0], cells[g][1]);
        x += c.x; z += c.z; lv = Math.max(lv, cells[g][2]);
      }
      out.push({ x: x / group.length, y: lv * LEVEL_H, z: z / group.length });
    }
    return out;
  }

  /** ¿Hay un resorte en (x,z)? */
  isPad(x: number, z: number): boolean {
    const q = this.mesh.cellAt(x, z);
    return q >= 0 && this.mesh.pad[q] === 1;
  }

  cellCenter(ix: number, iz: number) {
    return { x: this.originX + (ix + 0.5) * CELL, z: this.originZ + (iz + 0.5) * CELL };
  }

  cellIndexAt(x: number, z: number): number {
    const ix = Math.floor((x - this.originX) / CELL);
    const iz = Math.floor((z - this.originZ) / CELL);
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return -1;
    return iz * this.w + ix;
  }

  cellBounds(i: number) {
    const ix = i % this.w, iz = Math.floor(i / this.w);
    const minX = this.originX + ix * CELL, minZ = this.originZ + iz * CELL;
    return { minX, maxX: minX + CELL, minZ, maxZ: minZ + CELL };
  }

  isSolidCell(i: number): boolean {
    if (i < 0) return false;
    const c = this.cells[i];
    if (c.type === CellType.Void) return false;
    if (c.fragile >= 0 && this.tileState[c.fragile] === TILE_GONE) return false;
    return true;
  }

  /** Altura de la superficie de la celda en (x,z) (clampeado dentro de la celda). -Infinity si no hay piso. */
  topAt(i: number, x: number, z: number): number {
    if (!this.isSolidCell(i)) return -Infinity;
    const c = this.cells[i];
    if (c.type === CellType.Wall) return WALL_TOP;
    if (c.type === CellType.Ramp) {
      const b = this.cellBounds(i);
      const cx = Math.min(Math.max(x, b.minX), b.maxX);
      const cz = Math.min(Math.max(z, b.minZ), b.maxZ);
      let t = 0;
      switch (c.ramp) {
        case RampDir.N: t = (b.maxZ - cz) / CELL; break;
        case RampDir.S: t = (cz - b.minZ) / CELL; break;
        case RampDir.W: t = (b.maxX - cx) / CELL; break;
        case RampDir.E: t = (cx - b.minX) / CELL; break;
      }
      return (c.level + t) * LEVEL_H;
    }
    return c.level * LEVEL_H;
  }

  /** ¿La celda de la malla se puede pisar? (una losa caída no) */
  private meshSolid(q: number): boolean {
    const s = this.mesh.slab[q];
    return s < 0 || this.tileState[s] !== TILE_GONE;
  }

  /** Cuánto sube cada pieza se suma a lo que dice la malla: la cuña de las rampas y, en la orgánica, su descanso. */
  private pieceAt(x: number, z: number): number {
    const m = this.mesh;
    for (let i = 0; i < m.ramps.length; i++) if (inCell(m.ramps[i].wedge, x, z)) return wedgeTop(m.ramps[i], x, z);
    if (m.mode === 'organic') for (let i = 0; i < m.ramps.length; i++) if (inCell(m.ramps[i].landing, x, z)) return (m.ramps[i].level + 1) * LEVEL_H;
    return -Infinity;
  }

  /** Altura del piso en (x,z): la malla y las piezas de las rampas. -Infinity si no hay piso. */
  groundAt(x: number, z: number): number {
    const p = this.pieceAt(x, z);
    if (p !== -Infinity) return p;
    const q = this.mesh.cellAt(x, z);
    return q < 0 || !this.meshSolid(q) ? -Infinity : this.mesh.top[q];
  }

  /** La celda del plano que da el piso en (x,z) (la de la cuña si hay una), o -1 si no hay piso. */
  groundCellAt(x: number, z: number): number {
    const m = this.mesh;
    for (let i = 0; i < m.ramps.length; i++) if (inCell(m.ramps[i].wedge, x, z)) return m.ramps[i].src;
    const q = m.cellAt(x, z);
    return q < 0 || !this.meshSolid(q) ? -1 : m.src[q];
  }

  /**
   * Lo primero que no se puede subir contra un círculo (x,z,r) con los pies en feetY: una celda de la malla, una cuña o un
   * descanso más alto que `feetY + stepUp`. Devuelve su caja, su altura y la celda del plano de la que salió; de varias,
   * la de menor celda del plano (el orden de filas de siempre).
   */
  blockAt(x: number, z: number, r: number, feetY: number, stepUp: number): TerrainBlock | null {
    const m = this.mesh;
    const lim = feetY + stepUp;
    const near = m.cellsNear(x, z, r, this.nearBuf, lim);
    let hit = false, bsrc = Infinity, btop = 0, x0 = 0, x1 = 0, z0 = 0, z1 = 0;
    for (let k = 0; k < near.length; k++) {
      const q = near[k];
      if (m.top[q] <= lim || m.src[q] >= bsrc) continue;
      if (!circleOverlapsBox(x, z, r, m.minX[q], m.maxX[q], m.minZ[q], m.maxZ[q]) || !this.meshSolid(q)) continue;
      hit = true; bsrc = m.src[q]; btop = m.top[q]; x0 = m.minX[q]; x1 = m.maxX[q]; z0 = m.minZ[q]; z1 = m.maxZ[q];
    }
    const rs = m.ramps;
    for (let i = 0; i < rs.length; i++) {
      const p = rs[i];
      if (p.src > bsrc) continue;
      const w = p.wedge;
      if (circleOverlapsBox(x, z, r, w.minX, w.maxX, w.minZ, w.maxZ)) {
        const top = wedgeTop(p, x, z);
        if (top > lim) { hit = true; bsrc = p.src; btop = top; x0 = w.minX; x1 = w.maxX; z0 = w.minZ; z1 = w.maxZ; }
      }
      if (m.mode === 'organic') {
        const l = p.landing, top = (p.level + 1) * LEVEL_H;
        if (top > lim && circleOverlapsBox(x, z, r, l.minX, l.maxX, l.minZ, l.maxZ)) { hit = true; bsrc = p.src; btop = top; x0 = l.minX; x1 = l.maxX; z0 = l.minZ; z1 = l.maxZ; }
      }
    }
    return hit ? { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: btop, cell: bsrc } : null;
  }

  /**
   * Los contactos de un círculo (x,z,r) con los pies en feetY contra lo que no puede subir (docs/MALLA.md §6): de las
   * celdas de la malla solo cuentan los lados expuestos (los que dan a una celda que no bloquea, o a nada), y las
   * cuñas y los descansos de las rampas son rectángulos. Los entrega a `sink`; la lista de qué bloquea es la de `blockAt`.
   */
  contacts(x: number, z: number, r: number, feetY: number, stepUp: number, sink: ContactSink) {
    const m = this.mesh;
    const lim = feetY + stepUp;
    const near = m.cellsNear(x, z, r, this.nearBuf, lim);
    for (let k = 0; k < near.length; k++) {
      const q = near[k];
      if (m.top[q] > lim && this.meshSolid(q)) this.cellContacts(q, x, z, r, lim, sink);
    }
    const rs = m.ramps;
    for (let i = 0; i < rs.length; i++) {
      const p = rs[i], w = p.wedge;
      if (circleOverlapsBox(x, z, r, w.minX, w.maxX, w.minZ, w.maxZ)) {
        const top = wedgeTop(p, x, z);
        if (top > lim) rectContact(sink, x, z, r, w.minX, w.maxX, w.minZ, w.maxZ, top, CONTACT_RAMP, p.src, null);
      }
      if (m.mode === 'organic') {
        const l = p.landing, top = (p.level + 1) * LEVEL_H;
        if (top > lim) rectContact(sink, x, z, r, l.minX, l.maxX, l.minZ, l.maxZ, top, CONTACT_RAMP, p.src, null);
      }
    }
  }

  /**
   * Contactos de un círculo con una celda de la malla que bloquea. Un lado es expuesto si la vecina de ese lado no bloquea.
   * Si el centro está afuera, cuenta cada lado expuesto por delante del cual está (de frente, o por su vértice de salida:
   * cada vértice del contorno lo da el lado que sale de él) y la normal sale del punto más cercano. Si el centro está
   * adentro, se lo saca por el lado expuesto más cercano.
   */
  private cellContacts(q: number, x: number, z: number, r: number, lim: number, sink: ContactSink) {
    const m = this.mesh, base = q * 4, top = m.top[q], src = m.src[q];
    const s = this.sideBuf;
    let inside = true;
    for (let k = 0; k < 4; k++) {
      const a = m.quads[base + k], b = m.quads[base + ((k + 1) & 3)];
      const ex = m.vx[b] - m.vx[a], ez = m.vz[b] - m.vz[a];
      s[k] = ((x - m.vx[a]) * ez - (z - m.vz[a]) * ex) / Math.sqrt(ex * ex + ez * ez);
      if (s[k] > 1e-9) inside = false;
    }
    let best = -1;
    for (let k = 0; k < 4; k++) {
      const nb = m.nbr[base + k];
      if (nb >= 0 && m.top[nb] > lim && this.meshSolid(nb)) continue; // pared interna: lo de atrás también bloquea
      const a = m.quads[base + k], b = m.quads[base + ((k + 1) & 3)];
      const ex = m.vx[b] - m.vx[a], ez = m.vz[b] - m.vz[a];
      const len2 = ex * ex + ez * ez, len = Math.sqrt(len2);
      if (inside) {
        if (best < 0 || s[k] > s[best]) best = k;
        continue;
      }
      if (s[k] <= 0 || s[k] >= r) continue;
      const t = ((x - m.vx[a]) * ex + (z - m.vz[a]) * ez) / len2;
      if (t >= 1) continue;
      if (t > 0) { sink.add(ez / len, -ex / len, r - s[k], top, CONTACT_CELL, src, null); continue; }
      const dx = x - m.vx[a], dz = z - m.vz[a], d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2);
      sink.add(dx / d, dz / d, r - d, top, CONTACT_CELL, src, null);
    }
    if (best >= 0) {
      const a = m.quads[base + best], b = m.quads[base + ((best + 1) & 3)];
      const ex = m.vx[b] - m.vx[a], ez = m.vz[b] - m.vz[a], len = Math.sqrt(ex * ex + ez * ez);
      sink.add(ez / len, -ex / len, r - s[best], top, CONTACT_CELL, src, null);
    }
  }

  bottom() { return ISLAND_BOTTOM; }

  /** Daña una baldosa frágil. Devuelve true si cambió de estado. */
  damageTile(fi: number, dmg: number): boolean {
    const st = this.tileState[fi];
    if (st >= TILE_CRUMBLING) return false;
    this.tileHp[fi] -= dmg;
    const hp = this.tileHp[fi];
    let ns = st;
    if (hp <= 0) { ns = TILE_CRUMBLING; this.tileTimer[fi] = 0; }
    else if (hp <= TILE_HP * 0.33) ns = TILE_BROKEN;
    else if (hp <= TILE_HP * 0.66) ns = TILE_CRACKED;
    if (ns !== st) { this.tileState[fi] = ns; this.version++; return true; }
    return false;
  }

  setTileState(fi: number, s: number) {
    if (this.tileState[fi] !== s) { this.tileState[fi] = s; this.version++; }
  }

  tileString(): string {
    let s = '';
    for (let i = 0; i < this.tileState.length; i++) s += this.tileState[i];
    return s;
  }

  applyTileString(s: string) {
    for (let i = 0; i < this.tileState.length && i < s.length; i++) this.setTileState(i, s.charCodeAt(i) - 48);
  }

  /** La losa frágil que se pisa en (x,z), o -1. */
  fragileIndexAt(x: number, z: number): number {
    const q = this.mesh.cellAt(x, z);
    return q < 0 ? -1 : this.mesh.slab[q];
  }

  /** Celdas caminables (para spawns seguros / IA). */
  isWalkable(i: number) {
    if (!this.isSolidCell(i)) return false;
    return this.cells[i].type !== CellType.Wall;
  }

  bounds() {
    return { minX: this.originX, maxX: this.originX + this.w * CELL, minZ: this.originZ, maxZ: this.originZ + this.h * CELL };
  }
}
