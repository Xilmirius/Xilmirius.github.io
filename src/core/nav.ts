// Navegación a pie de la Horda (docs/ZOMBIS.md §10): un grafo de las celdas caminables del mapa y un campo de
// distancias a los héroes. Una arista existe solo si un cuerpo la puede caminar de verdad, probada contra el mismo
// `CollisionWorld` que usa el movimiento: con esa única regla las rampas se entran por abajo y se salen por arriba, y la
// cobertura, los nidos y las torretas cortan las aristas que tapan.
//
// Solo corre en el host (los zombis los decide el host), así que no necesita ser determinista entre navegadores.
import { CELL, CHAR_RADIUS, STEP_UP } from './constants';
import type { Obstacle } from './collision';
import type { Simulation } from './sim';
import { TILE_GONE } from './terrain';

/** Las ocho direcciones. `OPP[k]` es la contraria de `k`. */
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const OPP = [1, 0, 3, 2, 7, 6, 5, 4];
/** Cuánto más cuesta caminar pegado al vacío (en celdas): que no vayan por el borde. */
const EDGE_COST = 0.6;
/** Cuánto más cuesta una arista que baja: salvo que sirva, mejor por la rampa. */
const DROP_COST = 0.5;
/** Una caída mayor que esto no es una arista. */
const MAX_DROP = 2;
const SAMPLE = 0.25;
/** A cuánto de un héroe que no está sobre un nodo (arriba de un muro, de una cobertura) se siembra el campo. */
const SEED_REACH = 3;

export interface NavRoute {
  /** A dónde caminar ahora (el punto más lejano del camino que se alcanza en línea recta). */
  x: number;
  z: number;
  /** Metros que faltan, por el camino, hasta el héroe. */
  remain: number;
}

export class Nav {
  readonly w: number;
  readonly h: number;
  /** Distancia a pie al héroe vivo más cercano, en celdas; Infinity si no se llega. Indexada como las celdas del plano. */
  readonly field: Float64Array;
  /** Dónde está cada héroe vivo y el nodo donde se sembró el campo (-1 si no hay nodo cerca). */
  seeds: { x: number; z: number; node: number }[] = [];
  private valid: Uint8Array;
  private out: Uint8Array;
  private ecost: Float64Array;
  private extra: Float64Array;
  private built = false;
  private obstacleRev = -1;
  private obstacles = new Map<number, Obstacle>();
  private gone: Uint8Array;
  private heapK: Float64Array;
  private heapV: Int32Array;
  private heapN = 0;
  private cand: { m: number; v: number }[] = [];
  private route_: NavRoute = { x: 0, z: 0, remain: 0 };

  constructor(private sim: Simulation) {
    const t = sim.terrain;
    this.w = t.w;
    this.h = t.h;
    const n = t.cells.length;
    this.field = new Float64Array(n).fill(Infinity);
    this.valid = new Uint8Array(n);
    this.out = new Uint8Array(n);
    this.ecost = new Float64Array(n * 8);
    this.extra = new Float64Array(n);
    this.gone = new Uint8Array(t.fragile.length);
    this.heapK = new Float64Array(n * 9 + 16);
    this.heapV = new Int32Array(n * 9 + 16);
  }

  // ───────────── el grafo ─────────────

  private center(ci: number) {
    return this.sim.terrain.cellCenter(ci % this.w, Math.floor(ci / this.w));
  }

  /** Una celda es nodo si se puede pisar y un cuerpo cabe parado en su centro. */
  private isNode(ci: number): boolean {
    const t = this.sim.terrain;
    if (!t.isWalkable(ci)) return false;
    const c = this.center(ci);
    return !this.sim.cw.blockAt(c.x, c.z, CHAR_RADIUS, t.topAt(ci, c.x, c.z));
  }

  /**
   * ¿Un cuerpo de radio `CHAR_RADIUS` camina de (x0,z0) con los pies en y0 hasta (x1,z1) siguiendo el piso?
   * 0: no; 1: sí; 2: sí, pero baja un desnivel (se cae el último tramo: ahí solo hace falta que haya piso).
   */
  walk(x0: number, z0: number, y0: number, x1: number, z1: number): number {
    const cw = this.sim.cw;
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(d / SAMPLE));
    let y = y0, dropped = false;
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      const g = cw.groundAt(x, z, y + STEP_UP);
      if (g === -Infinity) return 0;
      if (g < y - 0.5) {
        if (y0 - g > MAX_DROP) return 0;
        dropped = true;
      }
      y = g;
      if (!dropped && cw.blockAt(x, z, CHAR_RADIUS, y)) return 0;
    }
    if (dropped && cw.blockAt(x1, z1, CHAR_RADIUS, y)) return 0;
    return dropped ? 2 : 1;
  }

  /** Las aristas que salen de un nodo. */
  private buildEdges(ci: number) {
    this.out[ci] = 0;
    if (!this.valid[ci]) return;
    const t = this.sim.terrain;
    const ix = ci % this.w, iz = Math.floor(ci / this.w);
    const a = this.center(ci);
    const y = t.topAt(ci, a.x, a.z);
    for (let k = 0; k < 8; k++) {
      const nx = ix + DX[k], nz = iz + DZ[k];
      if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
      const m = nz * this.w + nx;
      if (!this.valid[m]) continue;
      // Las diagonales, solo si las dos celdas de los costados también se pueden pisar.
      if (DX[k] && DZ[k] && (!this.valid[iz * this.w + nx] || !this.valid[nz * this.w + ix])) continue;
      const b = this.center(m);
      const r = this.walk(a.x, a.z, y, b.x, b.z);
      if (!r) continue;
      this.out[ci] |= 1 << k;
      this.ecost[ci * 8 + k] = (DX[k] && DZ[k] ? 1.42 : 1) + this.extra[m] + (r === 2 ? DROP_COST : 0);
    }
  }

  /** Celdas que tocan el vacío (cualquiera de las ocho vecinas): cuestan un poco más. */
  private buildExtra(ci: number) {
    const t = this.sim.terrain;
    const ix = ci % this.w, iz = Math.floor(ci / this.w);
    let near = false;
    for (let k = 0; k < 8 && !near; k++) {
      const nx = ix + DX[k], nz = iz + DZ[k];
      near = nx < 0 || nz < 0 || nx >= this.w || nz >= this.h || !t.isSolidCell(nz * this.w + nx);
    }
    this.extra[ci] = near ? EDGE_COST : 0;
  }

  /** Rehace las aristas que pueden haber cambiado: nodos dentro de `box` (en metros) y una celda más. */
  private refresh(minX: number, maxX: number, minZ: number, maxZ: number) {
    const t = this.sim.terrain;
    const ix0 = Math.max(0, Math.floor((minX - 1.5 - t.originX) / CELL)), ix1 = Math.min(this.w - 1, Math.floor((maxX + 1.5 - t.originX) / CELL));
    const iz0 = Math.max(0, Math.floor((minZ - 1.5 - t.originZ) / CELL)), iz1 = Math.min(this.h - 1, Math.floor((maxZ + 1.5 - t.originZ) / CELL));
    for (let iz = Math.max(0, iz0 - 1); iz <= Math.min(this.h - 1, iz1 + 1); iz++) {
      for (let ix = Math.max(0, ix0 - 1); ix <= Math.min(this.w - 1, ix1 + 1); ix++) this.buildExtra(iz * this.w + ix);
    }
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) this.valid[iz * this.w + ix] = this.isNode(iz * this.w + ix) ? 1 : 0;
    for (let iz = Math.max(0, iz0 - 1); iz <= Math.min(this.h - 1, iz1 + 1); iz++) {
      for (let ix = Math.max(0, ix0 - 1); ix <= Math.min(this.w - 1, ix1 + 1); ix++) this.buildEdges(iz * this.w + ix);
    }
  }

  /** Pone al día el grafo con lo que cambió desde la última vez: obstáculos que aparecieron o se rompieron, losas que se cayeron. */
  update() {
    const sim = this.sim, t = sim.terrain;
    if (!this.built) {
      this.built = true;
      for (let i = 0; i < t.cells.length; i++) this.buildExtra(i);
      for (let i = 0; i < t.cells.length; i++) this.valid[i] = this.isNode(i) ? 1 : 0;
      for (let i = 0; i < t.cells.length; i++) this.buildEdges(i);
      this.obstacleRev = sim.obstacleRev;
      for (const o of sim.cw.obstacles) this.obstacles.set(o.id, o);
      for (let i = 0; i < this.gone.length; i++) this.gone[i] = t.tileState[i] === TILE_GONE ? 1 : 0;
      return;
    }
    if (this.obstacleRev !== sim.obstacleRev) {
      this.obstacleRev = sim.obstacleRev;
      const now = new Map<number, Obstacle>();
      for (const o of sim.cw.obstacles) now.set(o.id, o);
      for (const [id, o] of now) if (!this.obstacles.has(id)) this.refresh(o.minX, o.maxX, o.minZ, o.maxZ);
      for (const [id, o] of this.obstacles) if (!now.has(id)) this.refresh(o.minX, o.maxX, o.minZ, o.maxZ);
      this.obstacles = now;
    }
    for (let i = 0; i < this.gone.length; i++) {
      const g = t.tileState[i] === TILE_GONE ? 1 : 0;
      if (g === this.gone[i]) continue;
      this.gone[i] = g;
      const b = t.cellBounds(t.fragile[i]);
      this.refresh(b.minX, b.maxX, b.minZ, b.maxZ);
    }
  }

  // ───────────── el campo ─────────────

  /** El nodo más cercano a un punto, a no más de `reach` metros (su propia celda si es nodo); -1 si no hay. */
  nodeNear(x: number, z: number, reach = SEED_REACH): number {
    const t = this.sim.terrain;
    const ci = t.cellIndexAt(x, z);
    if (ci >= 0 && this.valid[ci]) return ci;
    const cx = Math.floor((x - t.originX) / CELL), cz = Math.floor((z - t.originZ) / CELL);
    const r = Math.ceil(reach / CELL) + 1;
    let best = -1, bd = reach;
    for (let iz = cz - r; iz <= cz + r; iz++) {
      for (let ix = cx - r; ix <= cx + r; ix++) {
        if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) continue;
        const i = iz * this.w + ix;
        if (!this.valid[i]) continue;
        const c = this.center(i);
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  private push(k: number, v: number) {
    if (this.heapN >= this.heapK.length) {
      const nk = new Float64Array(this.heapK.length * 2), nv = new Int32Array(this.heapV.length * 2);
      nk.set(this.heapK); nv.set(this.heapV);
      this.heapK = nk; this.heapV = nv;
    }
    let i = this.heapN++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heapK[p] <= k) break;
      this.heapK[i] = this.heapK[p]; this.heapV[i] = this.heapV[p];
      i = p;
    }
    this.heapK[i] = k; this.heapV[i] = v;
  }

  private pop(): number {
    const v = this.heapV[0];
    const k = this.heapK[--this.heapN];
    const lv = this.heapV[this.heapN];
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= this.heapN) break;
      if (c + 1 < this.heapN && this.heapK[c + 1] < this.heapK[c]) c++;
      if (this.heapK[c] >= k) break;
      this.heapK[i] = this.heapK[c]; this.heapV[i] = this.heapV[c];
      i = c;
    }
    this.heapK[i] = k; this.heapV[i] = lv;
    return v;
  }

  /** Recalcula el campo: distancia a pie, por las aristas hacia atrás, al héroe vivo más cercano. */
  buildField() {
    this.update();
    const f = this.field;
    f.fill(Infinity);
    this.heapN = 0;
    this.seeds = [];
    for (const h of this.sim.chars) {
      if (!h.alive) continue;
      const node = this.nodeNear(h.pos.x, h.pos.z);
      this.seeds.push({ x: h.pos.x, z: h.pos.z, node });
      if (node >= 0 && f[node] !== 0) { f[node] = 0; this.push(0, node); }
    }
    while (this.heapN) {
      const k0 = this.heapK[0];
      const n = this.pop();
      if (k0 > f[n]) continue;
      const ix = n % this.w, iz = Math.floor(n / this.w);
      for (let k = 0; k < 8; k++) {
        const px = ix + DX[k], pz = iz + DZ[k];
        if (px < 0 || pz < 0 || px >= this.w || pz >= this.h) continue;
        const p = pz * this.w + px;
        // La arista que importa va de `p` a `n`: sale de `p` hacia la dirección contraria a `k`.
        const o = OPP[k];
        if (!(this.out[p] & (1 << o))) continue;
        const nc = k0 + this.ecost[p * 8 + o];
        if (nc < f[p]) { f[p] = nc; this.push(nc, p); }
      }
    }
  }

  // ───────────── seguir el campo ─────────────

  /** Los vecinos a los que se puede ir desde `ci`, del que más acerca al que menos. */
  private neighbours(ci: number): { m: number; v: number }[] {
    const cand = this.cand;
    cand.length = 0;
    const ix = ci % this.w, iz = Math.floor(ci / this.w);
    for (let k = 0; k < 8; k++) {
      if (!(this.out[ci] & (1 << k))) continue;
      const m = (iz + DZ[k]) * this.w + ix + DX[k];
      if (this.field[m] === Infinity) continue;
      cand.push({ m, v: this.field[m] + this.ecost[ci * 8 + k] });
    }
    cand.sort((a, b) => a.v - b.v);
    return cand;
  }

  /**
   * Hacia dónde caminar desde (x,z) con los pies en y para llegar a un héroe: el nodo vecino que más baja en el campo y, si
   * se alcanza en línea recta, uno más adelante (corta las esquinas). `alt` = 1 elige el segundo mejor vecino: para salir
   * de un atasco. Null si el campo no llega hasta acá.
   */
  route(x: number, z: number, y: number, alt = 0): NavRoute | null {
    const n0 = this.nodeNear(x, z, CELL);
    if (n0 < 0 || this.field[n0] === Infinity) return null;
    const path: number[] = [];
    let cur = n0;
    for (let s = 0; s < 3; s++) {
      const cand = this.neighbours(cur);
      if (!cand.length || (cand[0].v >= this.field[cur] + 1e-4 && !(s === 0 && alt))) break;
      const pick = s === 0 && alt && cand.length > 1 ? cand[1] : cand[0];
      path.push(pick.m);
      cur = pick.m;
      if (this.field[cur] === 0) break;
    }
    if (!path.length) return null;
    let goal = path[0];
    for (let j = path.length - 1; j >= 1; j--) {
      const c = this.center(path[j]);
      if (this.walk(x, z, y, c.x, c.z)) { goal = path[j]; break; }
    }
    const g = this.center(goal), m = this.center(path[0]);
    const r = this.route_;
    r.x = g.x; r.z = g.z;
    r.remain = (this.field[path[0]]) * CELL + Math.hypot(m.x - x, m.z - z);
    return r;
  }

  /** Para el escupidor: el nodo vecino que más lo aleja de los héroes (por las aristas). */
  retreat(x: number, z: number): NavRoute | null {
    const n0 = this.nodeNear(x, z, CELL);
    if (n0 < 0) return null;
    let best = -1, bv = this.field[n0] === Infinity ? -1 : this.field[n0] + 0.5;
    const ix = n0 % this.w, iz = Math.floor(n0 / this.w);
    for (let k = 0; k < 8; k++) {
      if (!(this.out[n0] & (1 << k))) continue;
      const m = (iz + DZ[k]) * this.w + ix + DX[k];
      const v = this.field[m];
      if (v === Infinity || v <= bv) continue;
      bv = v; best = m;
    }
    if (best < 0) return null;
    const c = this.center(best);
    const r = this.route_;
    r.x = c.x; r.z = c.z; r.remain = 0;
    return r;
  }

  /** ¿El campo llega a esta celda? (las cajas se tiran donde los héroes alcanzan) */
  reaches(ci: number) { return this.field[ci] !== Infinity; }
}

