// Carrera de obstáculos: todos contra todos desde la salida hasta la meta, pasando por los puntos de
// control en orden. Caerse no elimina a nadie: reaparecés en la última puerta que pasaste. Cuando llega
// el primero empieza una cuenta regresiva y la carrera termina cuando llegan todos o se acaba el tiempo.
// Se juega con las reglas 'race' (rules.ts): sin habilidades de héroe, con las cajas de ítems y con el piso
// flojo que se cae al pisarlo. Varias carreras seguidas con puntos son una copa (cup.ts).
import type { Character } from './entities';
import { BOX_ITEMS } from './gadgets';
import { round2 } from './math';
import type { GameMode, ModeHud, ModeResult, Standing } from './modes';
import type { Simulation } from './sim';
import { CellType, type Terrain } from './terrain';

/** Tiempo de carrera: minutos, segundos y décimas. */
export const lapTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s * 10) % 10)}`;

export const RACE = {
  /** Segundos que quedan para terminar desde que llega el primero. */
  finishWindow: 25,
  respawn: 1.4,
  /** Cajas: al que va primero le tocan cosas para molestar; a los del fondo, para alcanzar. */
  ahead: ['frasco', 'muralla', 'onda', 'ancla'],
  behind: ['parpadeo', 'garfio', 'parpadeo', 'garfio', 'onda'],
  /** Cuánto cuesta cruzar una celda de vacío al medir el camino (en celdas de piso). */
  voidCost: 8,
};

/**
 * Distancia a pie (en celdas) desde cada celda del mapa hasta un grupo de celdas. El vacío se puede cruzar pero
 * cuesta mucho y los muros no se cruzan: así la distancia sigue a la pista aunque dé vueltas o tenga saltos.
 */
export function distanceField(t: Terrain, from: Iterable<number>): Float64Array {
  // En doble precisión: lo que se guarda tiene que ser exactamente lo que se comparó, o cada empate
  // volvería a encolar la celda.
  const d = new Float64Array(t.cells.length).fill(Infinity);
  // Montículo de pares (distancia, celda).
  const hk: number[] = [], hi: number[] = [];
  const swap = (a: number, b: number) => { [hk[a], hk[b]] = [hk[b], hk[a]]; [hi[a], hi[b]] = [hi[b], hi[a]]; };
  const push = (k: number, i: number) => {
    hk.push(k); hi.push(i);
    for (let c = hk.length - 1; c > 0;) { const p = (c - 1) >> 1; if (hk[p] <= hk[c]) break; swap(p, c); c = p; }
  };
  const pop = () => {
    const top = hi[0], lk = hk.pop()!, li = hi.pop()!;
    if (hk.length) {
      hk[0] = lk; hi[0] = li;
      for (let c = 0; ;) {
        const l = 2 * c + 1, r = l + 1;
        let m = c;
        if (l < hk.length && hk[l] < hk[m]) m = l;
        if (r < hk.length && hk[r] < hk[m]) m = r;
        if (m === c) break;
        swap(m, c); c = m;
      }
    }
    return top;
  };
  for (const i of from) { d[i] = 0; push(0, i); }
  while (hk.length) {
    const k = hk[0], cur = pop();
    if (k > d[cur]) continue;
    const cx = cur % t.w, cz = Math.floor(cur / t.w);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= t.w || nz >= t.h) continue;
      const ni = nz * t.w + nx, type = t.cells[ni].type;
      if (type === CellType.Wall) continue;
      const nd = k + (dx && dz ? 1.42 : 1) * (type === CellType.Void ? RACE.voidCost : 1);
      if (nd < d[ni]) { d[ni] = nd; push(nd, ni); }
    }
  }
  return d;
}

export class RaceMode implements GameMode {
  id = 'race' as const;
  /** Próxima puerta de cada héroe (índice en terrain.gates; igual a su largo = llegó a la meta). */
  next = new Map<number, number>();
  /** Ids en orden de llegada. */
  order: number[] = [];
  /** Segundos que tardó cada uno de los que llegaron. */
  times = new Map<number, number>();
  private endT = -1;
  /** Distancia por la pista de cada celda a cada puerta, y de cada puerta a la anterior (o a la salida). */
  private dist: Float64Array[] = [];
  private span: number[] = [];
  /** Fracción del tramo en curso que lleva cada héroe (se conserva mientras está en el aire o reapareciendo). */
  private frac = new Map<number, number>();

  init(sim: Simulation) {
    for (const c of sim.chars) {
      c.lives = 99;
      this.next.set(c.id, 0);
    }
    const t = sim.terrain;
    this.placeOnStartLine(sim);
    const start = t.spawns.ffa[0] ?? { x: 0, z: 0 };
    t.gates.forEach((g, i) => {
      const d = distanceField(t, g.cells);
      const from = i === 0 ? start : t.gates[i - 1];
      const s = d[t.cellIndexAt(from.x, from.z)];
      this.dist.push(d);
      this.span.push(s > 0 && s < Infinity ? s : 1);
    });
  }

  /**
   * Si las salidas ('*') están todas en una sola fila o columna, repone a los corredores equidistantes sobre
   * esa línea (del centro de la primera al de la última, no en centros de celda) y sortea el orden con el rng
   * de la partida, mirando todos hacia la primera puerta. Si están desparramadas, no toca nada: se queda con
   * el reparto por celda que ya hizo `Simulation.spawnPoint`.
   */
  private placeOnStartLine(sim: Simulation) {
    const t = sim.terrain;
    const pts = t.spawns.ffa;
    if (pts.length < 2) return;
    const sameX = pts.every((p) => Math.abs(p.x - pts[0].x) < 1e-6);
    const sameZ = pts.every((p) => Math.abs(p.z - pts[0].z) < 1e-6);
    if (!sameX && !sameZ) return;
    const axis: 'x' | 'z' = sameX ? 'z' : 'x';
    const coords = pts.map((p) => p[axis]);
    const lo = Math.min(...coords), hi = Math.max(...coords);
    const other = sameX ? pts[0].x : pts[0].z;
    const gate = t.gates[0];
    const gx = gate ? gate.x : other, gz = gate ? gate.z : (lo + hi) / 2;
    const order = sim.chars.map((c) => c.id);
    for (let i = order.length - 1; i > 0; i--) {
      const j = sim.rng.int(0, i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const n = order.length;
    order.forEach((id, k) => {
      const at = n > 1 ? lo + ((hi - lo) * k) / (n - 1) : (lo + hi) / 2;
      const ch = sim.charById.get(id);
      if (!ch) return;
      const pos = axis === 'z' ? { x: other, y: 0, z: at } : { x: at, y: 0, z: other };
      pos.y = sim.groundY(pos.x, pos.z, pos.y);
      ch.pos = pos;
      ch.ppos = { ...pos };
      ch.facing = Math.atan2(gx - pos.x, gz - pos.z);
    });
  }

  onDeath() {}
  canRespawn() { return true; }
  respawnTime() { return RACE.respawn; }

  /** Reaparece en la última puerta que pasó (cada uno en una celda distinta de la franja). */
  respawnAt(sim: Simulation, ch: Character) {
    const i = this.next.get(ch.id) ?? 0;
    const t = sim.terrain;
    const gate = t.gates[Math.min(i, t.gates.length) - 1];
    if (!gate) return null;
    const cells = [...gate.cells];
    const ci = cells[ch.id % cells.length];
    return t.cellCenter(ci % t.w, Math.floor(ci / t.w));
  }

  finished(id: number) {
    return this.order.includes(id);
  }

  /** Los que ya llegaron se quedan quietos en la meta (y no molestan a los que siguen corriendo). */
  preTick(sim: Simulation) {
    for (const c of sim.chars) {
      if (!this.finished(c.id)) continue;
      c.input = { ...c.input, mx: 0, mz: 0, b: 0 };
      c.invuln = Math.max(c.invuln, 1);
      c.kbImmune = Math.max(c.kbImmune, 1);
    }
  }

  tick(sim: Simulation, dt: number) {
    if (sim.phase !== 'play') return;
    const t = sim.terrain;
    const n = t.gates.length;
    for (const c of sim.chars) {
      if (!c.alive) continue;
      const i = this.next.get(c.id) ?? 0;
      if (i >= n) continue;
      if (!t.gates[i].detect.has(t.cellIndexAt(c.pos.x, c.pos.z)) || c.pos.y > 4) continue;
      this.next.set(c.id, i + 1);
      this.frac.set(c.id, 0);
      const last = i + 1 >= n;
      if (last) {
        this.order.push(c.id);
        this.times.set(c.id, round2(sim.elapsed));
        if (this.order.length === 1) this.endT = RACE.finishWindow;
      }
      sim.emit({ k: 'gate', id: c.id, i, n, fin: last ? this.order.length : 0 });
    }
    if (this.endT > 0) this.endT = Math.max(0, this.endT - dt);
  }

  /** Cuánto avanzó un héroe: puertas pasadas más la fracción del tramo hasta la siguiente, medida por la pista. */
  progress(sim: Simulation, c: Character): number {
    const t = sim.terrain;
    const n = t.gates.length;
    const i = this.next.get(c.id) ?? 0;
    if (i >= n) return n;
    let f = this.frac.get(c.id) ?? 0;
    const ci = c.alive ? t.cellIndexAt(c.pos.x, c.pos.z) : -1;
    const d = ci >= 0 ? this.dist[i]?.[ci] ?? Infinity : Infinity;
    if (d < Infinity) {
      f = Math.max(0, Math.min(0.99, 1 - d / this.span[i]));
      this.frac.set(c.id, f);
    }
    return i + f;
  }

  /** Puesto en vivo (1 = primero): los que llegaron, en orden; después, por lo que avanzaron. */
  rank(sim: Simulation, ch: Character): number {
    const fin = this.order.indexOf(ch.id);
    if (fin >= 0) return fin + 1;
    const p = this.progress(sim, ch);
    return 1 + this.order.length + sim.chars.filter((c) => c !== ch && !this.finished(c.id) && this.progress(sim, c) > p).length;
  }

  /** Cajas: el que va primero recibe ítems para molestar y la mitad de atrás, ítems para alcanzar. */
  boxItem(sim: Simulation, ch: Character): string | null {
    const n = sim.chars.length;
    if (n < 2) return null;
    const r = this.rank(sim, ch);
    if (r === 1) return sim.rng.pick(RACE.ahead);
    if (r > n / 2) return sim.rng.pick(RACE.behind);
    return sim.rng.pick(BOX_ITEMS);
  }

  standings(sim: Simulation): Standing[] {
    const rest = sim.chars.filter((c) => !this.finished(c.id)).sort((a, b) => this.progress(sim, b) - this.progress(sim, a));
    return [
      ...this.order.map((id, k) => ({ id, place: k + 1, time: this.times.get(id) ?? -1 })),
      ...rest.map((c, k) => ({ id: c.id, place: this.order.length + k + 1, time: -1 })),
    ];
  }

  result(sim: Simulation): ModeResult | null {
    const timeUp = sim.elapsed >= sim.settings.timeLimit;
    if (this.order.length < sim.chars.length && this.endT !== 0 && !timeUp) return null;
    const first = sim.charById.get(this.order[0] ?? -1);
    if (first) return { winner: first.team, draw: false, reason: `${first.name} llegó primero a la meta` };
    // Nadie llegó: gana el que más avanzó.
    let best: Character | null = null, bp = -1, tie = false;
    for (const c of sim.chars) {
      const p = this.progress(sim, c);
      if (p > bp + 1e-6) { bp = p; best = c; tie = false; } else if (Math.abs(p - bp) <= 1e-6) tie = true;
    }
    if (!best || tie) return { winner: -1, draw: true, reason: 'Tiempo: nadie llegó a la meta' };
    return { winner: best.team, draw: false, reason: `Tiempo: ${best.name} fue el que más avanzó` };
  }

  hud(sim: Simulation): ModeHud {
    const n = Math.max(1, sim.terrain.gates.length);
    const scores = new Array(sim.teamCount).fill(0);
    for (const c of sim.chars) scores[c.team] = Math.round((this.progress(sim, c) / n) * 100);
    const left = Math.max(0, sim.settings.timeLimit - sim.elapsed);
    return {
      id: 'race', title: 'Carrera', label: '%', time: this.endT >= 0 ? Math.min(this.endT, left) : left, scores, target: 100,
      race: {
        next: sim.chars.map((c) => this.next.get(c.id) ?? 0), gates: sim.terrain.gates.length, rank: sim.chars.map((c) => this.rank(sim, c)),
        order: [...this.order], times: this.order.map((id) => this.times.get(id) ?? 0), end: this.endT, t: Math.floor(sim.elapsed * 10) / 10,
      },
    };
  }
}

export function createRaceMode(): GameMode {
  return new RaceMode();
}
