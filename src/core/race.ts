// Carrera de obstáculos: todos contra todos desde la salida hasta la meta, pasando por los puntos de
// control en orden. Caerse no elimina a nadie: reaparecés en la última puerta que pasaste. Cuando llega
// el primero empieza una cuenta regresiva y la carrera termina cuando llegan todos o se acaba el tiempo.
// Se juega con las reglas 'race' (rules.ts): sin habilidades de héroe y con las cajas de ítems.
import type { Character } from './entities';
import type { GameMode, ModeHud, ModeResult } from './modes';
import type { Simulation } from './sim';

export const RACE = {
  /** Segundos que quedan para terminar desde que llega el primero. */
  finishWindow: 25,
  respawn: 1.4,
};

export class RaceMode implements GameMode {
  id = 'race' as const;
  /** Próxima puerta de cada héroe (índice en terrain.gates; igual a su largo = llegó a la meta). */
  next = new Map<number, number>();
  /** Ids en orden de llegada. */
  order: number[] = [];
  private endT = -1;

  init(sim: Simulation) {
    for (const c of sim.chars) {
      c.lives = 99;
      this.next.set(c.id, 0);
    }
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
      if (!t.gates[i].cells.has(t.cellIndexAt(c.pos.x, c.pos.z)) || c.pos.y > 4) continue;
      this.next.set(c.id, i + 1);
      const last = i + 1 >= n;
      if (last) {
        this.order.push(c.id);
        if (this.order.length === 1) this.endT = RACE.finishWindow;
      }
      sim.emit({ k: 'gate', id: c.id, i, n, fin: last ? this.order.length : 0 });
    }
    if (this.endT > 0) this.endT = Math.max(0, this.endT - dt);
  }

  /** Cuánto avanzó un héroe: puertas pasadas más la fracción del tramo hasta la siguiente. */
  progress(sim: Simulation, c: Character): number {
    const gates = sim.terrain.gates;
    const n = gates.length;
    const i = this.next.get(c.id) ?? 0;
    if (i >= n) return n;
    const start = sim.terrain.spawns.ffa[0] ?? { x: 0, z: 0 };
    const from = i === 0 ? start : gates[i - 1];
    const to = gates[i];
    const seg = Math.hypot(to.x - from.x, to.z - from.z) || 1;
    const d = Math.hypot(to.x - c.pos.x, to.z - c.pos.z);
    return i + Math.max(0, Math.min(0.99, 1 - d / seg));
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
      race: { next: sim.chars.map((c) => this.next.get(c.id) ?? 0), gates: sim.terrain.gates.length, order: [...this.order], end: this.endT },
    };
  }
}

export function createRaceMode(): GameMode {
  return new RaceMode();
}
