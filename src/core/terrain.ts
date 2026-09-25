// Terreno como grilla de alturas (heightfield por celdas). Simple, barato de sincronizar y
// suficiente para "desniveles limitados de 1-2 niveles" (GDD §7).
import { CELL, ISLAND_BOTTOM, LEVEL_H, TILE_HP, WALL_TOP } from './constants';
import type { V3 } from './math';
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
}

export interface DestructSpawn { kind: Family; x: number; z: number; y: number }
/** Pieza fija de un mapa de Asedio (torre o núcleo) de un equipo. */
export interface TeamPiece { team: number; x: number; z: number }

export const TILE_INTACT = 0, TILE_CRACKED = 1, TILE_BROKEN = 2, TILE_CRUMBLING = 3, TILE_GONE = 4;

const DESTRUCT_CHARS: Record<string, [Family, number]> = {
  o: ['stone', 0], m: ['metal', 0], c: ['crystal', 0], g: ['goo', 0],
  O: ['stone', 1], M: ['metal', 1], C: ['crystal', 1], G: ['goo', 1],
};

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
  tileState: Uint8Array;
  tileHp: Float32Array;
  tileTimer: Float32Array;
  /** Se incrementa cada vez que cambia el terreno (para que el render se entere). */
  version = 0;

  constructor(mapId: string) {
    const def = MAPS[mapId] ?? MAPS.cantera;
    this.def = def;
    this.h = def.rows.length;
    this.w = Math.max(...def.rows.map((r) => r.length));
    this.originX = (-this.w * CELL) / 2;
    this.originZ = (-this.h * CELL) / 2;
    const zoneCells: [number, number, number][] = [];
    const lairCells: [number, number, number][] = [];
    for (let iz = 0; iz < this.h; iz++) {
      const row = def.rows[iz];
      for (let ix = 0; ix < this.w; ix++) {
        const ch = row[ix] ?? ' ';
        const cell: Cell = { type: CellType.Floor, level: 0, ramp: RampDir.N, fragile: -1 };
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
          default: {
            const d = DESTRUCT_CHARS[ch];
            if (d) {
              cell.level = d[1];
              this.destructs.push({ kind: d[0], x: c.x, z: c.z, y: d[1] * LEVEL_H });
            }
          }
        }
        this.cells.push(cell);
      }
    }
    this.zonePoints.push(...this.groupCells(zoneCells));
    this.lairs.push(...this.groupCells(lairCells));
    for (const lane of def.lanes ?? []) {
      this.lanes.push(lane.map(([ix, iz]) => { const c = this.cellCenter(ix, iz); return { x: c.x, y: 0, z: c.z }; }));
    }
    const n = this.fragile.length;
    this.tileState = new Uint8Array(n);
    this.tileHp = new Float32Array(n).fill(TILE_HP);
    this.tileTimer = new Float32Array(n);
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

  groundAt(x: number, z: number): number {
    return this.topAt(this.cellIndexAt(x, z), x, z);
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

  fragileIndexAt(x: number, z: number): number {
    const i = this.cellIndexAt(x, z);
    return i < 0 ? -1 : this.cells[i].fragile;
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
