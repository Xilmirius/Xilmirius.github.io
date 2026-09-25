// Modos de juego: el núcleo es agnóstico al objetivo de victoria (GDD §11).
// Agregar un modo = implementar esta interfaz; no se toca combate ni red.
import type { Character } from './entities';
import type { Simulation } from './sim';
import type { ModeId } from './types';

export interface ModeHud {
  id: ModeId;
  title: string;
  label: string;
  time: number; // segundos restantes
  scores: number[];
  target: number;
  zone?: { x: number; y: number; z: number; r: number; owner: number; contested: boolean; next: number };
}

export interface ModeResult { winner: number; draw: boolean; reason: string }

export interface GameMode {
  id: ModeId;
  init(sim: Simulation): void;
  onDeath(sim: Simulation, victim: Character, killer: Character | null): void;
  canRespawn(sim: Simulation, ch: Character): boolean;
  tick(sim: Simulation, dt: number): void;
  result(sim: Simulation): ModeResult | null;
  hud(sim: Simulation): ModeHud;
}

export const MODE_INFO: Record<ModeId, { name: string; desc: string }> = {
  stock: { name: 'Vidas', desc: 'Cada uno tiene vidas. Gana el último equipo con alguien en pie.' },
  kills: { name: 'Ring-outs', desc: 'Sumá puntos sacando rivales del mapa. Gana quien llega primero al objetivo.' },
  koth: { name: 'Control de zona', desc: 'Pará en la zona sin rivales para sumar puntos. La zona se mueve.' },
};

function timeLeft(sim: Simulation) {
  return Math.max(0, sim.settings.timeLimit - sim.elapsed);
}

function bestTeam(scores: number[], reason: string): ModeResult {
  let best = -Infinity, winner = -1, tie = false;
  scores.forEach((s, i) => {
    if (s > best) { best = s; winner = i; tie = false; } else if (s === best) tie = true;
  });
  return tie ? { winner: -1, draw: true, reason } : { winner, draw: false, reason };
}

class StockMode implements GameMode {
  id: ModeId = 'stock';
  init(sim: Simulation) { for (const c of sim.chars) c.lives = sim.settings.lives; }
  onDeath(_sim: Simulation, v: Character) {
    v.lives = Math.max(0, v.lives - 1);
    if (v.lives <= 0) v.eliminated = true;
  }
  canRespawn(_sim: Simulation, ch: Character) { return ch.lives > 0; }
  tick() {}
  livesByTeam(sim: Simulation) {
    const s = new Array(sim.teamCount).fill(0);
    for (const c of sim.chars) s[c.team] += c.lives;
    return s;
  }
  result(sim: Simulation): ModeResult | null {
    const s = this.livesByTeam(sim);
    const alive = s.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    if (alive.length === 1) return { winner: alive[0], draw: false, reason: 'Último equipo en pie' };
    if (alive.length === 0) return { winner: -1, draw: true, reason: 'No quedó nadie' };
    if (timeLeft(sim) <= 0) return bestTeam(s, 'Tiempo: más vidas restantes');
    return null;
  }
  hud(sim: Simulation): ModeHud {
    return { id: 'stock', title: 'Vidas', label: 'vidas', time: timeLeft(sim), scores: this.livesByTeam(sim), target: sim.settings.lives };
  }
}

class KillsMode implements GameMode {
  id: ModeId = 'kills';
  scores: number[] = [];
  init(sim: Simulation) { this.scores = new Array(sim.teamCount).fill(0); for (const c of sim.chars) c.lives = 99; }
  onDeath(sim: Simulation, v: Character, killer: Character | null) {
    if (killer && killer.team !== v.team) this.scores[killer.team]++;
    else if (sim.settings.teams === 'teams') {
      for (let t = 0; t < sim.teamCount; t++) if (t !== v.team) this.scores[t]++;
    }
  }
  canRespawn() { return true; }
  tick() {}
  result(sim: Simulation): ModeResult | null {
    const target = sim.settings.killTarget;
    const w = this.scores.findIndex((s) => s >= target);
    if (w >= 0) return { winner: w, draw: false, reason: `Llegó a ${target} ring-outs` };
    if (timeLeft(sim) <= 0) return bestTeam(this.scores, 'Tiempo: más ring-outs');
    return null;
  }
  hud(sim: Simulation): ModeHud {
    return { id: 'kills', title: 'Ring-outs', label: 'ring-outs', time: timeLeft(sim), scores: [...this.scores], target: sim.settings.killTarget };
  }
}

const ZONE_R = 4;
const ZONE_MOVE = 45;

class KothMode implements GameMode {
  id: ModeId = 'koth';
  scores: number[] = [];
  zi = 0;
  zt = 0;
  owner = -1;
  contested = false;
  init(sim: Simulation) {
    this.scores = new Array(sim.teamCount).fill(0);
    for (const c of sim.chars) c.lives = 99;
    // Empezar por la zona más central.
    let best = Infinity;
    sim.terrain.zonePoints.forEach((p, i) => {
      const d = Math.hypot(p.x, p.z);
      if (d < best) { best = d; this.zi = i; }
    });
  }
  onDeath() {}
  canRespawn() { return true; }
  zone(sim: Simulation) {
    return sim.terrain.zonePoints[this.zi] ?? { x: 0, y: 0, z: 0 };
  }
  tick(sim: Simulation, dt: number) {
    if (sim.phase !== 'play') return;
    const pts = sim.terrain.zonePoints;
    this.zt += dt;
    if (this.zt >= ZONE_MOVE && pts.length > 1) {
      this.zt = 0;
      this.zi = (this.zi + 1) % pts.length;
      sim.emit({ k: 'msg', tx: '¡La zona se movió!' });
    }
    const z = this.zone(sim);
    const inside = new Set<number>();
    for (const c of sim.chars) {
      if (!c.alive) continue;
      if (Math.hypot(c.pos.x - z.x, c.pos.z - z.z) <= ZONE_R && Math.abs(c.pos.y - z.y) < 2.2) inside.add(c.team);
    }
    this.contested = inside.size > 1;
    this.owner = inside.size === 1 ? [...inside][0] : -1;
    if (this.owner >= 0) this.scores[this.owner] += dt;
  }
  result(sim: Simulation): ModeResult | null {
    const target = sim.settings.kothTarget;
    const w = this.scores.findIndex((s) => s >= target);
    if (w >= 0) return { winner: w, draw: false, reason: `Controló la zona ${target} s` };
    if (timeLeft(sim) <= 0) return bestTeam(this.scores.map(Math.floor), 'Tiempo: más control de zona');
    return null;
  }
  hud(sim: Simulation): ModeHud {
    const z = this.zone(sim);
    return {
      id: 'koth', title: 'Control de zona', label: 'puntos', time: timeLeft(sim), scores: this.scores.map(Math.floor), target: sim.settings.kothTarget,
      zone: { x: z.x, y: z.y, z: z.z, r: ZONE_R, owner: this.owner, contested: this.contested, next: Math.max(0, ZONE_MOVE - this.zt) },
    };
  }
}

export function createMode(id: ModeId): GameMode {
  switch (id) {
    case 'kills': return new KillsMode();
    case 'koth': return new KothMode();
    default: return new StockMode();
  }
}
