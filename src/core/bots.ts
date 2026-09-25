// IA de bots: generan el mismo InputFrame que un jugador humano (el host no los trata distinto).
// Sirven para practicar solo, completar equipos y reemplazar a quien se desconecta.
import { MUTATION_LEVELS } from './constants';
import type { Character } from './entities';
import { HEROES } from './heroes';
import { BTN, type InputFrame } from './input';
import { ITEM_BY_ID, canAfford } from './items';
import { dirOf, norm2 } from './math';
import { Rng } from './rng';
import type { Simulation } from './sim';
import { CellType } from './terrain';
import type { AbilitySlot, Route } from './types';

const DIFF = {
  1: { think: 0.5, aimErr: 2.4, use: 0.12, lead: 0.2, push: 0.15, craftEvery: 8 },
  2: { think: 0.2, aimErr: 0.8, use: 0.55, lead: 0.7, push: 0.6, craftEvery: 4 },
  3: { think: 0.1, aimErr: 0.35, use: 0.85, lead: 1, push: 0.9, craftEvery: 2.5 },
} as const;

const ITEM_PRIORITY: Record<string, string[]> = {
  canto: ['lastre', 'onda', 'coraza', 'garfio', 'ancla', 'resorte'],
  prisma: ['filo', 'parpadeo', 'foco', 'garfio', 'lastre', 'suela'],
  gloop: ['foco', 'frasco', 'savia', 'garfio', 'lastre', 'resorte'],
  remache: ['lastre', 'muralla', 'coraza', 'garfio', 'onda', 'filo'],
};

const ROUTE_PREF: Record<string, Route[]> = {
  canto: ['tank', 'tank', 'carry'],
  prisma: ['carry', 'carry', 'support'],
  gloop: ['support', 'tank', 'support'],
  remache: ['tank', 'support', 'carry'],
};

export class BotBrain {
  private rng: Rng;
  private d: (typeof DIFF)[1 | 2 | 3];
  private seq = 0;
  private thinkT = 0;
  private target: Character | null = null;
  private goal: { x: number; z: number } | null = null;
  private path: { x: number; z: number; top: number }[] = [];
  private pathT = 0;
  private wishX = 0;
  private wishZ = 0;
  private aimX = 0;
  private aimZ = 0;
  private hold = 0;
  private tap = 0;
  private lastB = 0;
  private pushT = 0;
  private strafe = 1;
  private strafeT = 0;
  private stuckT = 0;
  private lastX = 0;
  private lastZ = 0;
  private craftT = 0;
  private repairing = false;

  constructor(level: number, seed: number) {
    this.rng = new Rng(seed);
    const l = (Math.max(1, Math.min(3, level)) as 1 | 2 | 3);
    this.d = DIFF[l];
    this.thinkT = this.rng.range(0, this.d.think);
  }

  think(sim: Simulation, ch: Character, dt: number): InputFrame {
    this.seq++;
    if (!ch.alive) return this.frame(ch, 0);

    this.craftT -= dt;
    if (this.craftT <= 0) {
      this.craftT = this.d.craftEvery;
      this.craft(sim, ch);
    }

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = this.d.think;
      this.decide(sim, ch);
    }

    this.navigate(sim, ch, dt);

    let b = this.hold;
    if (this.pushT > 0) {
      this.pushT -= dt;
      b |= BTN.PUSH;
    }
    b |= this.tap;
    this.tap = 0;
    // Asegurar flancos: un bit "tap" no puede quedar mantenido dos ticks seguidos.
    const edgeBits = BTN.JUMP | BTN.Q | BTN.E | BTN.F | BTN.R | BTN.I1 | BTN.I2 | BTN.I3;
    b &= ~(this.lastB & edgeBits & ~this.hold);
    this.lastB = b;
    return this.frame(ch, b);
  }

  private frame(ch: Character, b: number): InputFrame {
    return { seq: this.seq, mx: this.wishX, mz: this.wishZ, ax: this.aimX || ch.pos.x + 1, az: this.aimZ || ch.pos.z, b };
  }

  // ───────────── decisión ─────────────

  private decide(sim: Simulation, ch: Character) {
    const hero = HEROES[ch.hero];
    this.hold = 0;

    // Elegir objetivo: el enemigo más cercano, con preferencia por los golpeados y los que están cerca del borde.
    let best: Character | null = null, bs = Infinity;
    for (const c of sim.chars) {
      if (!c.alive || c.team === ch.team || c.invuln > 0.5) continue;
      const d = Math.hypot(c.pos.x - ch.pos.x, c.pos.z - ch.pos.z);
      const s = d - c.stage * 2 - (c === this.target ? 3 : 0);
      if (s < bs) { bs = s; best = c; }
    }
    this.target = best;
    const t = best;
    const dist = t ? Math.hypot(t.pos.x - ch.pos.x, t.pos.z - ch.pos.z) : Infinity;

    // Reparar si estoy muy roto y nadie cerca.
    this.repairing = false;
    if (ch.stage >= 2 && ch.mats[ch.family] >= 4 && dist > 9) {
      this.repairing = true;
      this.hold |= BTN.REPAIR;
      this.goal = null;
      this.aimAt(ch, t ? t.pos.x : ch.pos.x + 1, t ? t.pos.z : ch.pos.z);
      return;
    }

    // Objetivo de movimiento
    const hud = sim.mode.hud(sim);
    if (hud.zone && (!t || dist > 7)) {
      this.goal = { x: hud.zone.x + this.rng.range(-1.5, 1.5), z: hud.zone.z + this.rng.range(-1.5, 1.5) };
    } else if (t && dist < 22) {
      const pref = hero.preferredRange;
      if (dist > pref + 0.8) this.goal = { x: t.pos.x, z: t.pos.z };
      else if (dist < pref - 2) {
        const u = norm2(ch.pos.x - t.pos.x, ch.pos.z - t.pos.z);
        this.goal = { x: ch.pos.x + u.x * 3, z: ch.pos.z + u.z * 3 };
      } else {
        this.strafeT -= this.d.think;
        if (this.strafeT <= 0) { this.strafe = this.rng.chance(0.5) ? 1 : -1; this.strafeT = this.rng.range(0.6, 1.6); }
        const u = norm2(t.pos.x - ch.pos.x, t.pos.z - ch.pos.z);
        this.goal = pref < 3 ? { x: t.pos.x, z: t.pos.z } : { x: ch.pos.x - u.z * this.strafe * 2, z: ch.pos.z + u.x * this.strafe * 2 };
      }
    } else {
      // Farmear: ir al destructible vivo más cercano.
      let bd = Infinity, g: { x: number; z: number } | null = null;
      for (const d of sim.destructibles) {
        if (d.stage >= 3) continue;
        const dd = Math.hypot(d.x - ch.pos.x, d.z - ch.pos.z);
        if (dd < bd) { bd = dd; g = { x: d.x, z: d.z }; }
      }
      this.goal = g;
      if (g && bd < 2.4) {
        this.aimAt(ch, g.x, g.z);
        this.hold |= BTN.BASIC;
      }
    }

    if (!t) return;

    // Apuntar con anticipación.
    const lead = this.d.lead * Math.min(0.5, dist / 25);
    const err = this.d.aimErr * (0.3 + Math.min(1, dist / 10));
    const ax = t.pos.x + t.vel.x * lead + this.rng.range(-err, err);
    const az = t.pos.z + t.vel.z * lead + this.rng.range(-err, err);
    this.aimAt(ch, ax, az);

    // Ataque básico
    const b = hero.basic;
    const inRange = b.kind === 'melee' ? dist < b.range + 0.4 : dist < b.range * 0.9;
    if (inRange && Math.abs(t.pos.y - ch.pos.y) < 1.8) this.hold |= BTN.BASIC;

    // Empujón cargado: sobre todo si está agrietado o cerca del borde.
    if (dist < 2.3 && this.pushT <= 0 && ch.cds.push <= 0 && this.rng.chance(this.d.push)) {
      const edge = this.edgeBehind(sim, ch, t);
      if (t.stage >= 1 || edge) {
        this.pushT = t.stage >= 2 || edge ? 0.8 : 0.35;
        this.hold &= ~BTN.BASIC;
      }
    }

    // Habilidades
    for (const slot of ['r', 'q', 'e', 'f'] as AbilitySlot[]) {
      const a = hero.abilities[slot];
      if (ch.level < a.unlock || ch.cds[slot] > 0 || !this.rng.chance(this.d.use)) continue;
      if (this.wantsAbility(sim, ch, t, dist, a.bot, a.range)) {
        if (a.bot === 'escape') {
          const u = norm2(-ch.pos.x, -ch.pos.z);
          this.aimAt(ch, ch.pos.x + u.x * 6, ch.pos.z + u.z * 6);
        }
        if (slot === 'q' && ch.hero === 'remache') {
          // Muro detrás del enemigo para estamparlo.
          const u = norm2(t.pos.x - ch.pos.x, t.pos.z - ch.pos.z);
          this.aimAt(ch, t.pos.x + u.x * 1.8, t.pos.z + u.z * 1.8);
        }
        this.tap |= slot === 'q' ? BTN.Q : slot === 'e' ? BTN.E : slot === 'f' ? BTN.F : BTN.R;
        break;
      }
    }

    // Ítems activos
    for (let i = 0; i < 3; i++) {
      const id = ch.actives[i];
      if (!id || ch.cds[(['i1', 'i2', 'i3'] as const)[i]] > 0) continue;
      let use = false;
      if (id === 'onda' && dist < 3) use = true;
      if (id === 'ancla' && ch.stage >= 2 && dist < 5) use = true;
      if (id === 'parpadeo' && ch.stage >= 2 && dist < 4) use = true;
      if (id === 'frasco' && dist < 8) use = true;
      if (id === 'muralla' && dist < 6 && this.rng.chance(0.2)) use = true;
      if (use && this.rng.chance(this.d.use)) {
        if (id === 'parpadeo') {
          const u = norm2(-ch.pos.x, -ch.pos.z);
          this.aimAt(ch, ch.pos.x + u.x * 6, ch.pos.z + u.z * 6);
        }
        this.tap |= [BTN.I1, BTN.I2, BTN.I3][i];
        break;
      }
    }
  }

  private wantsAbility(sim: Simulation, ch: Character, t: Character, dist: number, use: string, range: number): boolean {
    switch (use) {
      case 'engage': return dist > 2.5 && dist < range * 0.85 && Math.abs(t.pos.y - ch.pos.y) < 1;
      case 'poke': return dist < range * 0.8;
      case 'zone': return dist < Math.max(4, range * 0.9);
      case 'finisher': {
        if (dist > range) return false;
        const near = sim.enemiesInRadius(ch.team, t.pos.x, t.pos.z, 4).length;
        return t.stage >= 2 || near >= 2 || (t.stage >= 1 && this.edgeBehind(sim, ch, t));
      }
      case 'escape': return ch.stage >= 2 && dist < 4;
      case 'buff': return dist < 6 && (ch.stage >= 1 || ch.hero === 'prisma');
    }
    return false;
  }

  /** ¿Hay vacío detrás del objetivo (en la dirección en que lo empujaría)? */
  private edgeBehind(sim: Simulation, ch: Character, t: Character) {
    const u = norm2(t.pos.x - ch.pos.x, t.pos.z - ch.pos.z);
    for (const k of [2, 4, 6]) {
      if (sim.cw.groundAt(t.pos.x + u.x * k, t.pos.z + u.z * k, t.pos.y + 1) === -Infinity) return true;
    }
    return false;
  }

  private aimAt(_ch: Character, x: number, z: number) {
    this.aimX = x;
    this.aimZ = z;
  }

  // ───────────── navegación ─────────────

  private navigate(sim: Simulation, ch: Character, dt: number) {
    const cw = sim.cw;
    this.wishX = 0;
    this.wishZ = 0;

    // Recuperación: si estoy sobre el vacío, volver al piso más cercano.
    const under = cw.groundAt(ch.pos.x, ch.pos.z, ch.pos.y + 0.5);
    if (!ch.grounded && under === -Infinity) {
      const safe = this.nearestSafe(sim, ch.pos.x, ch.pos.z);
      if (safe) {
        const u = norm2(safe.x - ch.pos.x, safe.z - ch.pos.z);
        this.wishX = u.x;
        this.wishZ = u.z;
        if (ch.vel.y < 1 && ch.airJumps > 0 && ch.hitstun <= 0) this.tap |= BTN.JUMP;
        const gi = ch.actives.indexOf('garfio');
        if (gi >= 0 && ch.pos.y < safe.top - 0.5 && ch.cds[(['i1', 'i2', 'i3'] as const)[gi]] <= 0) {
          this.aimAt(ch, safe.x, safe.z);
          this.tap |= [BTN.I1, BTN.I2, BTN.I3][gi];
        }
      }
      return;
    }

    if (this.repairing || !this.goal) return;

    this.pathT -= dt;
    if (this.pathT <= 0 || this.path.length === 0) {
      this.pathT = 0.5;
      this.path = this.findPath(sim, ch.pos.x, ch.pos.z, this.goal.x, this.goal.z);
    }
    let wx: number, wz: number;
    let next = this.path[0];
    while (next && Math.hypot(next.x - ch.pos.x, next.z - ch.pos.z) < 0.8 && this.path.length > 1) {
      this.path.shift();
      next = this.path[0];
    }
    if (next && this.path.length > 1) {
      wx = next.x - ch.pos.x;
      wz = next.z - ch.pos.z;
      if (next.top > ch.pos.y + 0.45 && Math.hypot(wx, wz) < 2.2 && ch.grounded) this.tap |= BTN.JUMP;
    } else {
      wx = this.goal.x - ch.pos.x;
      wz = this.goal.z - ch.pos.z;
      if (Math.hypot(wx, wz) < 0.6) return;
    }
    const u = norm2(wx, wz);
    wx = u.x; wz = u.z;

    // Nunca caminar hacia el vacío.
    for (const k of [0.9, 1.6]) {
      if (cw.groundAt(ch.pos.x + wx * k, ch.pos.z + wz * k, ch.pos.y + 2) === -Infinity) {
        const c = norm2(-ch.pos.x, -ch.pos.z);
        const nx = c.x * 0.7 - wz * 0.3, nz = c.z * 0.7 + wx * 0.3;
        wx = nx;
        wz = nz;
        break;
      }
    }

    // Atascado: saltar y probar de costado.
    const moved = Math.hypot(ch.pos.x - this.lastX, ch.pos.z - this.lastZ);
    this.lastX = ch.pos.x;
    this.lastZ = ch.pos.z;
    if (moved < 0.02 && ch.grounded) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.35) {
      this.tap |= BTN.JUMP;
      const s = this.rng.chance(0.5) ? 1 : -1;
      const ox = wx;
      wx = -wz * s;
      wz = ox * s;
      this.hold |= BTN.BASIC; // romper lo que tape
      if (this.stuckT > 1.2) { this.stuckT = 0; this.path = []; }
    }

    this.wishX = wx;
    this.wishZ = wz;
    if (!this.target) {
      const f = dirOf(Math.atan2(wx, wz));
      if (!(this.hold & BTN.BASIC)) this.aimAt(ch, ch.pos.x + f.x * 3, ch.pos.z + f.z * 3);
    }
  }

  private nearestSafe(sim: Simulation, x: number, z: number) {
    const t = sim.terrain;
    let best: { x: number; z: number; top: number } | null = null, bd = Infinity;
    for (let i = 0; i < t.cells.length; i++) {
      if (!t.isWalkable(i)) continue;
      const c = t.cellCenter(i % t.w, Math.floor(i / t.w));
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = { x: c.x, z: c.z, top: t.topAt(i, c.x, c.z) }; }
    }
    return best;
  }

  private findPath(sim: Simulation, sx: number, sz: number, gx: number, gz: number) {
    const t = sim.terrain;
    const start = t.cellIndexAt(sx, sz), goal = t.cellIndexAt(gx, gz);
    if (start < 0 || goal < 0 || start === goal || !t.isWalkable(goal)) return [];
    const n = t.cells.length;
    const cost = new Float32Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const open: number[] = [start];
    const blockedByDestruct = new Set<number>();
    for (const d of sim.destructibles) if (d.stage < 3) blockedByDestruct.add(t.cellIndexAt(d.x, d.z));
    for (const s of sim.structures) blockedByDestruct.add(t.cellIndexAt(s.x, s.z));
    cost[start] = 0;
    const level = (i: number) => {
      const c = t.cells[i];
      return c.type === CellType.Ramp ? c.level + 0.5 : c.level;
    };
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (cost[open[i]] < cost[open[bi]]) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      const cx = cur % t.w, cz = Math.floor(cur / t.w);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= t.w || nz >= t.h) continue;
          const ni = nz * t.w + nx;
          if (!t.isWalkable(ni)) continue;
          if (dx && dz && (!t.isWalkable(cz * t.w + nx) || !t.isWalkable(nz * t.w + cx))) continue;
          const dl = level(ni) - level(cur);
          if (dl > 1) continue;
          let c = dx && dz ? 1.42 : 1;
          if (dl >= 1) c += 2; // salto
          if (blockedByDestruct.has(ni)) c += 3;
          if (t.cells[ni].fragile >= 0 && t.tileState[t.cells[ni].fragile] >= 2) c += 2;
          const nc = cost[cur] + c;
          if (nc < cost[ni]) {
            if (cost[ni] === Infinity) open.push(ni);
            cost[ni] = nc;
            prev[ni] = cur;
          }
        }
      }
    }
    if (prev[goal] < 0) return [];
    const out: { x: number; z: number; top: number }[] = [];
    for (let i = goal; i !== start && i >= 0; i = prev[i]) {
      const c = t.cellCenter(i % t.w, Math.floor(i / t.w));
      out.push({ x: c.x, z: c.z, top: t.topAt(i, c.x, c.z) });
    }
    out.reverse();
    return out;
  }

  // ───────────── crafteo ─────────────

  private craft(sim: Simulation, ch: Character) {
    const slots = MUTATION_LEVELS.filter((l) => ch.level >= l).length;
    const used = Object.keys(ch.mutations).length;
    if (used < slots && ch.mats[ch.family] >= 8) {
      const order: AbilitySlot[] = ['r', 'q', 'e', 'f'];
      const slot = order.find((s) => !ch.mutations[s] && ch.level >= HEROES[ch.hero].abilities[s].unlock);
      if (slot) {
        const prefs = ROUTE_PREF[ch.hero] ?? ['tank'];
        sim.queueCommand(ch.pid, { c: 'mutate', slot, route: prefs[used % prefs.length] });
        return;
      }
    }
    // Guardar material propio para reparar/mutar si estoy golpeado.
    const reserve = ch.stage >= 1 ? 4 : 0;
    for (const id of ITEM_PRIORITY[ch.hero] ?? []) {
      const it = ITEM_BY_ID[id];
      if (ch.passives.includes(id) || ch.actives.includes(id)) continue;
      if (it.kind === 'passive' && ch.passives.length >= 3) continue;
      if (it.kind === 'active' && !ch.actives.includes(null)) continue;
      const m = { ...ch.mats };
      m[ch.family] -= reserve;
      if (canAfford(m, it.cost)) {
        sim.queueCommand(ch.pid, { c: 'craft', id });
        return;
      }
    }
  }
}

export const BOT_NAMES = [
  'Bot Guijarro', 'Bot Tuerca', 'Bot Cuarzo', 'Bot Mocoso', 'Bot Ladrillo', 'Bot Chispa', 'Bot Grava', 'Bot Resina',
];
