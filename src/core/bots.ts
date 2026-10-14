// IA de bots: generan el mismo InputFrame que un jugador humano (el host no los trata distinto).
// Sirven para practicar solo, completar equipos y reemplazar a quien se desconecta.
import { CELL, MUTATION_LEVELS } from './constants';
import type { Character } from './entities';
import { HEROES } from './heroes';
import { geyserPhase, ROLLER, rollerBalls, ROTOR, rotorAngle } from './gadgets';
import { CRATE_KINDS, HORDE, MISSIONS, type HordeMode } from './horde';
import { BTN, type InputFrame } from './input';
import { ITEM_BY_ID, canAfford } from './items';
import { dirOf, norm2 } from './math';
import { Rng } from './rng';
import { CORE, TOWER } from './moba/defs';
import type { MobaMode } from './moba/mode';
import type { RaceMode } from './race';
import type { Simulation } from './sim';
import { CellType } from './terrain';
import type { AbilitySlot, Route } from './types';
import { C4, WEAPON_IDS, WEAPONS } from './weapons';

/** pace: a qué fracción de su velocidad corre una carrera (los fáciles se dejan alcanzar). */
const DIFF = {
  1: { think: 0.5, aimErr: 2.4, use: 0.12, lead: 0.2, push: 0.15, craftEvery: 8, dash: 0.05, pace: 0.86 },
  2: { think: 0.2, aimErr: 0.8, use: 0.55, lead: 0.7, push: 0.6, craftEvery: 4, dash: 0.2, pace: 0.94 },
  3: { think: 0.1, aimErr: 0.35, use: 0.85, lead: 1, push: 0.9, craftEvery: 2.5, dash: 0.35, pace: 1 },
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

/** Punto del camino. hop: se llega saltando un hueco desde el punto anterior. */
interface PathNode { x: number; z: number; top: number; hop?: boolean }
/** Segundos que se le da a un salto sobre un hueco antes de volver a pensar. */
const HOP_TIME = 1.3;

export class BotBrain {
  private rng: Rng;
  private d: (typeof DIFF)[1 | 2 | 3];
  private seq = 0;
  private thinkT = 0;
  private target: Character | null = null;
  private goal: { x: number; z: number } | null = null;
  private path: PathNode[] = [];
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
  private dashAway: Character | null = null;
  /** Salto en curso sobre un hueco: adónde quiere caer y cuánto le queda para darlo por terminado. */
  private hop: { x: number; z: number; t: number } | null = null;
  /** Había una bola por pasarme por encima en el tick anterior. */
  private ballNear = false;
  // Asedio
  private lane = -1;
  private retreating = false;

  constructor(level: number, seed: number) {
    this.rng = new Rng(seed);
    const l = (Math.max(1, Math.min(3, level)) as 1 | 2 | 3);
    this.d = DIFF[l];
    this.thinkT = this.rng.range(0, this.d.think);
  }

  think(sim: Simulation, ch: Character, dt: number): InputFrame {
    this.seq++;
    // Forja: en el Asedio solo en la base (o esperando para volver).
    this.craftT -= dt;
    if (this.craftT <= 0 && sim.rules.crafting && (!sim.rules.forgeAtBase || !ch.alive || sim.atBase(ch))) {
      this.craftT = sim.rules.forgeAtBase ? 0.5 : this.d.craftEvery;
      this.craft(sim, ch);
    }
    if (!ch.alive) return this.frame(ch, 0);

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = this.d.think;
      this.decide(sim, ch);
    }

    this.navigate(sim, ch, dt);
    if (sim.mode.id === 'race') {
      this.dodgeBalls(sim, ch);
      this.dodgeRotor(sim, ch);
      // Los bots más fáciles corren un poco más lento (salvo en pleno salto sobre un hueco, que necesita toda la carrera).
      if (!this.hop) { this.wishX *= this.d.pace; this.wishZ *= this.d.pace; }
    }

    let b = this.hold;
    if (this.pushT > 0) {
      this.pushT -= dt;
      b |= BTN.PUSH;
    }
    b |= this.tap;
    this.tap = 0;
    // Asegurar flancos: un bit "tap" no puede quedar mantenido dos ticks seguidos.
    const edgeBits = BTN.JUMP | BTN.DASH | BTN.Q | BTN.E | BTN.F | BTN.R | BTN.I1 | BTN.I2 | BTN.I3 | BTN.RECALL;
    b &= ~(this.lastB & edgeBits & ~this.hold);
    this.lastB = b;
    return this.frame(ch, b);
  }

  private frame(ch: Character, b: number): InputFrame {
    return { seq: this.seq, mx: this.wishX, mz: this.wishZ, ax: this.aimX || ch.pos.x + 1, az: this.aimZ || ch.pos.z, b };
  }

  // ───────────── decisión ─────────────

  private decide(sim: Simulation, ch: Character) {
    this.hold = 0;
    if (sim.mode.id === 'moba') { this.decideMoba(sim, ch); return; }
    if (sim.mode.id === 'race') { this.decideRace(sim, ch); return; }
    if (sim.mode.id === 'horde') { this.decideHorde(sim, ch); return; }

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
    if (sim.rules.repair && ch.stage >= 2 && ch.mats[ch.family] >= 4 && dist > 9) {
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
      this.approach(ch, t, dist);
    } else {
      // Farmear: ir al destructible vivo más cercano.
      let bd = Infinity, g: { x: number; z: number } | null = null;
      for (const d of sim.destructibles) {
        if (d.stage >= 3 || d.explosive) continue;
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
    this.engage(sim, ch, t, dist, false);
  }

  /** Posicionarse respecto del objetivo según el alcance preferido del héroe (entrar, alejarse o rodear). */
  private approach(ch: Character, t: Character, dist: number) {
    const pref = HEROES[ch.hero].preferredRange;
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
  }

  /**
   * Pelear contra un objetivo: apuntar, básico, empujón, dash, habilidades e ítems.
   * vsUnits: el objetivo es un esbirro/neutral (se guardan la ulti y las habilidades para los héroes).
   */
  private engage(sim: Simulation, ch: Character, t: Character, dist: number, vsUnits: boolean) {
    const hero = HEROES[ch.hero];
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

    // Empujón cargado: sobre todo si está agrietado o cerca del borde (a un esbirro, solo si hay vacío atrás).
    if (dist < 2.3 && this.pushT <= 0 && ch.cds.push <= 0 && this.rng.chance(this.d.push) && (!vsUnits || this.edgeBehind(sim, ch, t))) {
      const edge = this.edgeBehind(sim, ch, t);
      if (t.stage >= 1 || edge) {
        this.pushT = t.stage >= 2 || edge ? 0.8 : 0.35;
        this.hold &= ~BTN.BASIC;
      }
    }

    // Dash: entrar al cuerpo a cuerpo o escaparse estando muy roto.
    if (!vsUnits && sim.rules.dash && ch.dashCd <= 0 && ch.grounded && this.rng.chance(this.d.dash)) {
      if (hero.preferredRange < 3 && dist > 3.5 && dist < 7) this.tap |= BTN.DASH;
      else if (ch.stage >= 2 && dist < 3) { this.dashAway = t; this.tap |= BTN.DASH; }
    }

    // Habilidades (contra esbirros: solo las de daño en área y si hay varios juntos).
    const clump = vsUnits ? sim.enemiesInRadius(ch.team, t.pos.x, t.pos.z, 3.5).length : 0;
    for (const slot of ['r', 'q', 'e', 'f'] as AbilitySlot[]) {
      const a = hero.abilities[slot];
      if (!sim.abilityUnlocked(ch, slot) || ch.cds[slot] > 0 || (slot === 'r' && !sim.ultReady(ch)) || !this.rng.chance(this.d.use)) continue;
      if (vsUnits && (slot === 'r' || clump < 3 || (a.bot !== 'poke' && a.bot !== 'zone') || !this.rng.chance(0.25))) continue;
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
    for (let i = 0; i < 3 && !vsUnits; i++) {
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

  // ───────────── Horda ─────────────

  /**
   * Cómo juega un bot la Horda: le dispara al zombi más cercano que tenga a tiro sin dejar que se le pegue,
   * va a la zona de la misión (o a romper el nido más cercano), pasa por las cajas que le sirven, planta C4
   * cuando lo rodean y vuelve a una mini base a enfriarse si está muy roto.
   */
  private decideHorde(sim: Simulation, ch: Character) {
    const m = sim.mode as HordeMode;
    const here = (p: { x: number; z: number }) => Math.hypot(p.x - ch.pos.x, p.z - ch.pos.z);

    // El zombi más cercano al que le puede llegar una bala, y cuántos tiene encima.
    let near: Character | null = null, ns = Infinity, crowd = 0;
    for (const u of sim.units) {
      if (!u.alive || u.invuln > 0.3 || Math.abs(u.pos.y - ch.pos.y) > 2.4) continue;
      const d = here(u.pos);
      if (d < 3.2) crowd++;
      const s = d - (u === this.target ? 1.5 : 0);
      if (s < ns) { ns = s; near = u; }
    }
    this.target = near;
    const dist = near ? here(near.pos) : Infinity;

    // Arma: la principal mientras sirva a esa distancia (escopeta de cerca, cohete de lejos); si no, la pistola.
    const pri = ch.primary >= 0 ? WEAPON_IDS[ch.primary] : null;
    const want = pri && (pri !== 'shotgun' || dist < 8) && (pri !== 'launcher' || (dist > 5 && crowd < 2)) ? ch.primary : 0;
    if (want !== ch.weapon) this.tap |= BTN.Q;
    const w = WEAPONS[WEAPON_IDS[ch.weapon]];

    const nest = m.nests.length ? m.nests.reduce((a, b) => (here(a) <= here(b) ? a : b)) : null;
    // Con un nido a tiro y ningún zombi encima, el nido primero: mientras viva, no paran de salir.
    if (nest && here(nest) < w.range * 0.9 && dist > 4.5) {
      this.aimAt(ch, nest.x, nest.z);
      this.hold |= BTN.BASIC;
    } else if (near && dist < w.range * 0.95) {
      const err = this.d.aimErr * 0.5 * (0.3 + Math.min(1, dist / 12));
      this.aimAt(ch, near.pos.x + near.vel.x * 0.1 + this.rng.range(-err, err), near.pos.z + near.vel.z * 0.1 + this.rng.range(-err, err));
      this.hold |= BTN.BASIC;
    } else if (nest && here(nest) < w.range * 0.9) {
      // Sin zombis a tiro: al nido.
      this.aimAt(ch, nest.x, nest.z);
      this.hold |= BTN.BASIC;
    }

    // Rodeado: C4 a los pies y a correr. Uno pegado: empujón.
    if (crowd >= 4 && ch.c4 > 0 && ch.grounded && this.rng.chance(this.d.use)) this.tap |= BTN.R;
    if (near && dist < 1.9 && ch.cds.push <= 0 && this.pushT <= 0 && this.rng.chance(this.d.push * 0.5)) {
      this.pushT = 0.3;
      this.hold &= ~BTN.BASIC;
    }

    // Moverse. Primero, que no se le peguen: retrocede disparando (dentro de la zona, lo justo para no salirse).
    // Con uno solo cerca y un objetivo al que ir, no retrocede: le dispara de paso.
    const z = m.zone;
    const inZone = !!z && here(z) < z.r;
    const fuel = m.crates.filter((c) => CRATE_KINDS[c.kind] === 'fuel');
    const obj = z ?? nest ?? (fuel.length ? fuel.reduce((a, b) => (here(a) <= here(b) ? a : b)) : null);
    if (near && dist < (inZone ? 3 : obj && crowd < 2 ? 2.6 : 5.5)) {
      // Se aleja del zombi, pero tirando hacia el objetivo (la zona, el nido, el bidón) para no regalar terreno.
      const away = norm2(ch.pos.x - near.pos.x, ch.pos.z - near.pos.z);
      const to = obj ? norm2(obj.x - ch.pos.x, obj.z - ch.pos.z) : { x: 0, z: 0 };
      const u = norm2(away.x + to.x * 0.7, away.z + to.z * 0.7);
      let gx = ch.pos.x + u.x * 4, gz = ch.pos.z + u.z * 4;
      if (z && inZone) {
        const o = norm2(gx - z.x, gz - z.z), lim = z.r - 0.8;
        if (Math.hypot(gx - z.x, gz - z.z) > lim) { gx = z.x + o.x * lim; gz = z.z + o.z * lim; }
      }
      this.goal = { x: gx, z: gz };
      if (dist < 2.4 && crowd >= 2 && sim.rules.dash && ch.dashCd <= 0 && ch.grounded && this.rng.chance(this.d.dash)) { this.dashAway = near; this.tap |= BTN.DASH; }
      return;
    }

    // Con poca vida y una mini base cerca: a curarse (salvo en la extracción, que es llegar o nada).
    const base = m.bases.length ? m.bases.reduce((a, c) => (here(a) <= here(c) ? a : c)) : null;
    if (base && here(base) < 18 && MISSIONS[m.step]?.kind !== 'extract' && (ch.hp < 30 || (this.retreating && ch.hp < 60))) {
      this.retreating = true;
      this.goal = here(base) > HORDE.baseR - 1.5 ? { x: base.x, z: base.z } : null;
      return;
    }
    this.retreating = false;

    // Una caja que le sirva y le quede a mano (más lejos si todavía no tiene arma principal). El combustible, siempre.
    let crate: { x: number; z: number } | null = null, cd = ch.primary < 0 ? 20 : 9;
    for (const c of m.crates) {
      const k = CRATE_KINDS[c.kind];
      if (k === 'c4' ? ch.c4 >= C4.max : k === 'med' ? ch.hp > 70 : false) continue;
      const d = k === 'fuel' ? here(c) * 0.2 : here(c);
      if (d < cd) { cd = d; crate = c; }
    }
    if (crate) { this.goal = { x: crate.x, z: crate.z }; return; }

    // El objetivo de la misión.
    if (z) this.goal = inZone && here(z) < z.r - 1.2 ? null : { x: z.x + this.rng.range(-1.2, 1.2), z: z.z + this.rng.range(-1.2, 1.2) };
    else if (nest) this.goal = here(nest) > 7 ? { x: nest.x, z: nest.z } : null;
    else this.goal = null;
  }

  // ───────────── Carrera de obstáculos ─────────────

  /** Corre a la próxima puerta por el camino a pie, salta los rotores, espera los géiseres y empuja al que tenga al lado. */
  private decideRace(sim: Simulation, ch: Character) {
    const m = sim.mode as RaceMode;
    const gate = sim.terrain.gates[m.next.get(ch.id) ?? 0];
    this.target = null;
    this.goal = gate ? { x: gate.x, z: gate.z } : null;
    if (!gate) return;
    const gx = gate.x - ch.pos.x, gz = gate.z - ch.pos.z;
    for (const g of sim.gadgets) {
      const dx = g.x - ch.pos.x, dz = g.z - ch.pos.z;
      const d = Math.hypot(dx, dz);
      // Géiser avisando justo adelante: frenar hasta que dispare.
      if (g.kind === 'geyser' && d < 2.6 && d > 0.9 && dx * gx + dz * gz > 0 && geyserPhase(g.idx, sim.tick) !== 'idle') this.goal = null;
    }
    // Cobertura en el camino: embestirla con el dash (ahora alcanza con una sola embestida). Si no está listo,
    // no insistir: el camino la rodea (findPath la marca como bloqueada).
    const way = this.path[0] ?? gate;
    const wu = norm2(way.x - ch.pos.x, way.z - ch.pos.z);
    for (const d of sim.destructibles) {
      if (d.stage >= 3 || d.explosive || Math.abs(d.y - ch.pos.y) > 1) continue;
      const dx = d.x - ch.pos.x, dz = d.z - ch.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.6 || (dx * wu.x + dz * wu.z) / (dist || 1) < 0.6) continue;
      if (ch.grounded && ch.dashCd <= 0) { this.aimAt(ch, d.x, d.z); this.tap |= BTN.DASH; }
      break;
    }
    // Agarrar al rival que tengo cerca y de frente (más ganas cuanto más difícil el bot); a nadie que ya llegó.
    if (sim.rules.grab && ch.grabbing < 0 && ch.grabbedBy < 0 && ch.cds.basic <= 0 && this.rng.chance(this.d.push)) {
      let best: Character | null = null, bd = Infinity;
      for (const c of sim.chars) {
        if (c === ch || !c.alive || c.grabbedBy >= 0 || c.grabbing >= 0 || c.invuln > 0 || m.finished(c.id)) continue;
        const d = Math.hypot(c.pos.x - ch.pos.x, c.pos.z - ch.pos.z);
        if (d > 1.5 || Math.abs(c.pos.y - ch.pos.y) > 1.6) continue;
        if (d < bd) { bd = d; best = c; }
      }
      if (best) { this.aimAt(ch, best.pos.x, best.pos.z); this.hold |= BTN.BASIC; this.target = best; }
    }
    // Agarrado: soltarse con el dash apenas esté listo.
    if (ch.grabbedBy >= 0 && sim.rules.dash && ch.grounded && ch.dashCd <= 0) this.tap |= BTN.DASH;
    // Empujón al rival que esté pegado (más ganas cuanto más difícil el bot); no mientras se está agarrando a alguien.
    if (!(this.hold & BTN.BASIC)) for (const c of sim.chars) {
      if (c === ch || !c.alive || m.finished(c.id)) continue;
      const d = Math.hypot(c.pos.x - ch.pos.x, c.pos.z - ch.pos.z);
      if (d < 2 && ch.cds.push <= 0 && this.pushT <= 0 && this.rng.chance(this.d.push * 0.25)) {
        this.aimAt(ch, c.pos.x, c.pos.z);
        this.target = c;
        this.pushT = 0.3;
      }
    }
    // Ítems de las cajas: los de moverse, hacia la puerta; el resto, si hay alguien cerca.
    for (let i = 0; i < 3; i++) {
      const id = ch.actives[i];
      if (!id || !this.rng.chance(this.d.use * 0.15)) continue;
      const near = sim.chars.some((c) => c !== ch && c.alive && Math.hypot(c.pos.x - ch.pos.x, c.pos.z - ch.pos.z) < 4);
      if (id === 'garfio' || id === 'parpadeo') {
        // Solo en tramos rectos y firmes: unos metros hacia la puerta, si ahí hay piso.
        const u = norm2(gx, gz);
        const tx = ch.pos.x + u.x * 5, tz = ch.pos.z + u.z * 5;
        if (!ch.grounded || sim.cw.groundAt(tx, tz, ch.pos.y + 1) === -Infinity) continue;
        this.aimAt(ch, tx, tz);
      } else if (!near) continue;
      this.tap |= [BTN.I1, BTN.I2, BTN.I3][i];
      break;
    }
  }

  /**
   * Rotores: en vez de saltar la barra (el salto flotante de la Carrera apenas la libra), correrse hacia el costado del barrido por el que ya está (y
   * solo si ahí hay piso: si no, probar el otro lado, y si ninguno sirve, pararse a bancarse el golpe antes
   * que tirarse al vacío). Corre después de `navigate` porque pisa `wishX/wishZ`.
   */
  private dodgeRotor(sim: Simulation, ch: Character) {
    if (!ch.grounded) return;
    const cw = sim.cw;
    for (const g of sim.gadgets) {
      if (g.kind !== 'rotor') continue;
      const dx = g.x - ch.pos.x, dz = g.z - ch.pos.z, d = Math.hypot(dx, dz);
      if (d > ROTOR.len + 1.8) continue;
      const a = rotorAngle(g.idx, sim.tick + 6);
      const along = -dx * Math.cos(a) - dz * Math.sin(a), perp = dx * Math.sin(a) - dz * Math.cos(a);
      if (Math.abs(along) > ROTOR.len + 0.6 || Math.abs(perp) > 1.3) continue;
      const dir0 = perp >= 0 ? 1 : -1;
      for (const side of [dir0, -dir0]) {
        const sx = Math.sin(a) * side, sz = -Math.cos(a) * side;
        if (cw.groundAt(ch.pos.x + sx * 2.2, ch.pos.z + sz * 2.2, ch.pos.y + 2) === -Infinity) continue;
        this.wishX = sx;
        this.wishZ = sz;
        return;
      }
      // Ningún costado tiene piso (pasillo angosto, el radio del rotor lo cubre entero): ahí no sirve
      // esquivar, total pararse solo alarga cuánto tiempo se está adentro. Mejor cruzar rápido y de una.
      return;
    }
  }

  /**
   * Bolas: saltar cuando una está por pasarme por encima (mirando un instante hacia adelante). Se decide una vez
   * por bola: los bots más fáciles a veces no la ven venir. Sin salto (reglas con `jump` apagado) no hay forma de
   * esquivarlas en el momento: `findPath` ya evita los carriles, y lo que queda es aguantar el golpe.
   */
  private dodgeBalls(sim: Simulation, ch: Character) {
    if (!sim.rules.jump) return;
    const look = 0.26;
    const px = ch.pos.x + ch.vel.x * look, pz = ch.pos.z + ch.vel.z * look;
    let near = false;
    for (const g of sim.gadgets) {
      if (g.kind !== 'roller' || near) continue;
      for (const s of rollerBalls(g.idx, sim.tick, g.len)) {
        const at = s + ROLLER.speed * look;
        if (Math.hypot(g.x + g.dx * at - px, g.z + g.dz * at - pz) < ROLLER.r + 0.75) { near = true; break; }
      }
    }
    if (near && !this.ballNear && ch.grounded && this.rng.chance(Math.min(0.97, this.d.use + 0.25))) this.tap |= BTN.JUMP;
    this.ballNear = near;
  }

  // ───────────── Asedio (MOBA) ─────────────

  /**
   * Cómo juega un bot el Asedio: acompaña a su oleada por su línea, remata esbirros, pelea con héroes
   * cuando le conviene, no se mete bajo una torre rival sin esbirros que la distraigan, pega a las
   * torres cuando su oleada las tanquea, y cuando está muy roto vuelve a la base (B) a enfriarse y comprar.
   */
  private decideMoba(sim: Simulation, ch: Character) {
    const m = sim.mode as MobaMode;
    if (this.lane < 0) {
      const mates = sim.chars.filter((c) => c.team === ch.team).sort((a, b) => a.id - b.id);
      this.lane = mates.indexOf(ch) % Math.max(1, m.lanes.length);
    }
    const path = m.lanePath(this.lane, ch.team);
    const base = sim.baseCenter(ch.team);
    this.target = null;
    this.pushT = 0;
    const enemies = sim.chars.filter((c) => c.alive && c.team !== ch.team && c.invuln <= 0);
    const near = (r: number) => enemies.filter((e) => Math.hypot(e.pos.x - ch.pos.x, e.pos.z - ch.pos.z) < r);

    // Canalizando la vuelta: quieto.
    if (ch.recallT > 0) { this.goal = null; return; }
    // En la base: enfriarse del todo antes de salir (y comprar, lo hace think()).
    if (sim.atBase(ch) && ch.heat > 8 && !near(10).length) { this.goal = { x: base.x, z: base.z }; return; }

    // Muy roto: volver. Si nadie está cerca, B; si no, caminar hacia la base.
    const retreatAt = this.d === DIFF[1] ? 150 : 100;
    if (ch.heat >= retreatAt || (this.retreating && ch.heat > 20)) {
      this.retreating = true;
      // B solo si nadie me puede cortar la vuelta (héroes, esbirros o torres); si no, caminar hacia la base.
      const threat = near(10).length || this.towerOn(sim, m, ch)
        || sim.units.some((u) => u.alive && u.team !== ch.team && u.team < 2 && Math.hypot(u.pos.x - ch.pos.x, u.pos.z - ch.pos.z) < 9);
      if (!threat && sim.tick - ch.lastHitTick > 30) {
        this.goal = null;
        this.tap |= BTN.RECALL;
        return;
      }
      this.goal = { x: base.x, z: base.z };
      const e = near(3)[0];
      if (e) this.engage(sim, ch, e, Math.hypot(e.pos.x - ch.pos.x, e.pos.z - ch.pos.z), false);
      return;
    }
    this.retreating = false;

    // Una torre rival me está apuntando: salir de su alcance.
    const shooter = this.towerOn(sim, m, ch);
    if (shooter) {
      const u = norm2(ch.pos.x - shooter.x, ch.pos.z - shooter.z);
      this.goal = { x: ch.pos.x + u.x * 5, z: ch.pos.z + u.z * 5 };
      return;
    }

    // Héroe rival cerca y conviene pelear (no bajo su torre).
    let foe: Character | null = null, fd = Infinity;
    for (const e of near(8)) {
      if (this.inEnemyTowerRange(sim, m, ch.team, e.pos.x, e.pos.z, 0.5)) continue;
      const d = Math.hypot(e.pos.x - ch.pos.x, e.pos.z - ch.pos.z);
      const s = d - e.stage * 2;
      if (s < fd) { fd = s; foe = e; }
    }
    if (foe && ch.stage <= foe.stage + 1) {
      const d = Math.hypot(foe.pos.x - ch.pos.x, foe.pos.z - ch.pos.z);
      this.target = foe;
      this.approach(ch, foe, d);
      this.engage(sim, ch, foe, d, false);
      return;
    }

    // Esbirros rivales (y neutrales que me estén pegando): rematar el de menos vida.
    let prey: Character | null = null, pv = Infinity;
    for (const u of sim.units) {
      if (!u.alive || u.team === ch.team) continue;
      const d = Math.hypot(u.pos.x - ch.pos.x, u.pos.z - ch.pos.z);
      if (d > 9) continue;
      if (u.team >= 2 && u.lastHits.get(ch.id) === undefined && u.unit !== 'coloso') continue;
      if (u.unit === 'coloso' && !this.colosoOk(sim, ch)) continue;
      if (this.inEnemyTowerRange(sim, m, ch.team, u.pos.x, u.pos.z, 1) && !this.towerBusy(sim, m, ch.team, u.pos.x, u.pos.z)) continue;
      const v = u.hp + d * 3;
      if (v < pv) { pv = v; prey = u; }
    }
    if (prey) {
      const d = Math.hypot(prey.pos.x - ch.pos.x, prey.pos.z - ch.pos.z);
      this.target = prey;
      this.approach(ch, prey, d);
      this.engage(sim, ch, prey, d, true);
      return;
    }

    // Torre o núcleo rival: pegarle si mi oleada la está tanqueando (o si no dispara a nadie).
    const st = this.siegeTarget(sim, m, ch);
    if (st) {
      const b = HEROES[ch.hero].basic;
      const reach = b.kind === 'melee' ? b.range + st.hw - 0.3 : b.range * 0.85;
      const d = Math.hypot(st.x - ch.pos.x, st.z - ch.pos.z);
      this.aimAt(ch, st.x, st.z);
      if (d > reach) this.goal = { x: st.x, z: st.z };
      else { this.goal = null; this.hold |= BTN.BASIC; }
      return;
    }

    // El Coloso: si hay compañeros cerca y ya tengo nivel, a pegarle.
    if (m.coloso && this.colosoOk(sim, ch)) {
      const c = m.coloso;
      const d = Math.hypot(c.pos.x - ch.pos.x, c.pos.z - ch.pos.z);
      if (d < 30) { this.target = c; this.approach(ch, c, d); this.engage(sim, ch, c, d, true); return; }
    }

    // Juntar trozos cerca (si no es bajo una torre rival).
    let pick: { x: number; z: number } | null = null, pd = 5;
    for (const p of sim.pickups) {
      const d = Math.hypot(p.pos.x - ch.pos.x, p.pos.z - ch.pos.z);
      if (d < pd && !this.inEnemyTowerRange(sim, m, ch.team, p.pos.x, p.pos.z, 1)) { pd = d; pick = { x: p.pos.x, z: p.pos.z }; }
    }
    if (pick) { this.goal = pick; return; }

    // Por defecto: detrás de la punta de mi oleada, o en mi torre más adelantada de la línea.
    this.goal = this.laneSpot(sim, m, ch, path);
    const f = dirOf(Math.atan2(this.goal.x - ch.pos.x, this.goal.z - ch.pos.z));
    this.aimAt(ch, ch.pos.x + f.x * 3, ch.pos.z + f.z * 3);
  }

  /** ¿Puedo ir al Coloso? Con nivel y al menos otro compañero cerca de la guarida. */
  private colosoOk(sim: Simulation, ch: Character) {
    const m = sim.mode as MobaMode;
    const c = m.coloso;
    if (!c || ch.level < 5 || ch.heat > 60) return false;
    return sim.chars.filter((a) => a.alive && a.team === ch.team && a !== ch && Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) < 16).length >= 1;
  }

  /** Dónde pararse en la línea: 2.5 m detrás del esbirro propio más adelantado, o en mi torre más adelantada. */
  private laneSpot(sim: Simulation, m: MobaMode, ch: Character, path: { x: number; z: number }[]) {
    let best: Character | null = null, bp = -Infinity;
    for (const u of sim.units) {
      if (!u.alive || u.team !== ch.team || u.ai?.lane !== this.lane) continue;
      const p = laneProgress(path, u.pos.x, u.pos.z);
      if (p > bp) { bp = p; best = u; }
    }
    if (best) {
      const p = pointAt(path, Math.max(0, bp - 2.5));
      return { x: p.x + this.rng.range(-1, 1), z: p.z + this.rng.range(-1, 1) };
    }
    let tp = -Infinity, spot: { x: number; z: number } | null = null;
    for (const s of m.structs) {
      if (s.hp <= 0 || s.team !== ch.team || s.kind !== 'tower' || s.ai?.lane !== this.lane) continue;
      const p = laneProgress(path, s.x, s.z);
      if (p > tp) { tp = p; spot = pointAt(path, Math.max(0, p - 2)); }
    }
    return spot ?? { x: path[0].x, z: path[0].z };
  }

  /** Torre/núcleo rival que me está apuntando, o null. */
  private towerOn(sim: Simulation, m: MobaMode, ch: Character) {
    void sim;
    return m.structs.find((s) => s.hp > 0 && s.team !== ch.team && s.target === ch.id) ?? null;
  }

  private inEnemyTowerRange(_sim: Simulation, m: MobaMode, team: number, x: number, z: number, margin: number) {
    return m.structs.some((s) => s.hp > 0 && s.team !== team && Math.hypot(x - s.x, z - s.z) <= (s.kind === 'core' ? CORE.range : TOWER.range) + s.hw + margin);
  }

  /** ¿La torre rival que cubre ese punto está ocupada con mis esbirros? (entonces se puede entrar un rato) */
  private towerBusy(sim: Simulation, m: MobaMode, team: number, x: number, z: number) {
    const s = m.structs.find((o) => o.hp > 0 && o.team !== team && Math.hypot(x - o.x, z - o.z) <= (o.kind === 'core' ? CORE.range : TOWER.range) + o.hw + 1);
    if (!s) return true;
    const t = s.target !== undefined && s.target >= 0 ? sim.charById.get(s.target) : null;
    const tanks = sim.units.filter((u) => u.alive && u.team === team && Math.hypot(u.pos.x - s.x, u.pos.z - s.z) < TOWER.range + 1).length;
    return !!t && t.unit !== 'hero' && tanks >= 1;
  }

  /** Estructura rival a la que conviene pegarle ahora (no protegida, con mi oleada tanqueando). */
  private siegeTarget(sim: Simulation, m: MobaMode, ch: Character) {
    let best: (typeof m.structs)[number] | null = null, bd = 16;
    for (const s of m.structs) {
      if (s.hp <= 0 || s.team === ch.team || s.invuln) continue;
      const d = Math.hypot(s.x - ch.pos.x, s.z - ch.pos.z);
      if (d > bd) continue;
      // El núcleo expuesto se ataca si no hay héroes rivales defendiéndolo; las torres, solo con la oleada tanqueando.
      const guarded = sim.chars.some((c) => c.alive && c.team !== ch.team && Math.hypot(c.pos.x - s.x, c.pos.z - s.z) < 14);
      if (!this.towerBusy(sim, m, ch.team, s.x, s.z) && !(s.kind === 'core' && !guarded && s.target !== ch.id)) continue;
      bd = d; best = s;
    }
    return best;
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
    if (this.hop) {
      // Saltando un hueco: seguir hacia donde quiero caer; si no llego, segundo salto y después el dash.
      this.hop.t -= dt;
      if ((ch.grounded && this.hop.t < HOP_TIME - 0.25) || this.hop.t <= 0) this.hop = null;
      else {
        if (ch.grounded) this.tap |= BTN.JUMP;
        const hx = this.hop.x - ch.pos.x, hz = this.hop.z - ch.pos.z;
        const u = norm2(hx, hz);
        this.wishX = u.x;
        this.wishZ = u.z;
        if (!ch.grounded && under === -Infinity && ch.vel.y < -3 && Math.hypot(hx, hz) > 1) {
          if (ch.airJumps > 0 && ch.hitstun <= 0) this.tap |= BTN.JUMP;
          else if (sim.rules.dash && ch.airDashes > 0 && ch.dashCd <= 0 && ch.tumble <= 0 && ch.hitstun <= 0) this.tap |= BTN.DASH;
        }
        return;
      }
    }
    if (!ch.grounded && under === -Infinity) {
      const safe = this.nearestSafe(sim, ch.pos.x, ch.pos.z);
      if (safe) {
        const u = norm2(safe.x - ch.pos.x, safe.z - ch.pos.z);
        this.wishX = u.x;
        this.wishZ = u.z;
        if (sim.rules.jump && ch.vel.y < 1 && ch.airJumps > 0 && ch.hitstun <= 0) this.tap |= BTN.JUMP;
        // Sin saltos: el dash aéreo es la última carta (el tumbo ya lo canceló el segundo salto).
        else if (sim.rules.dash && (!sim.rules.jump || ch.airJumps === 0) && ch.airDashes > 0 && ch.dashCd <= 0 && ch.tumble <= 0 && ch.hitstun <= 0) this.tap |= BTN.DASH;
        const gi = ch.actives.indexOf('garfio');
        if (gi >= 0 && ch.pos.y < safe.top - 0.5 && ch.cds[(['i1', 'i2', 'i3'] as const)[gi]] <= 0) {
          this.aimAt(ch, safe.x, safe.z);
          this.tap |= [BTN.I1, BTN.I2, BTN.I3][gi];
        }
      }
      return;
    }

    if (this.repairing || !this.goal) return;

    // Sin salto, un hueco de una celda se cruza con el dash: solo vale la pena buscar un camino que lo cruce si
    // el dash ya está listo (si no, findPath lo deja bloqueado y rodea, que es lo que puede terminar).
    const canHop = sim.rules.jump || (sim.rules.dash && ch.grounded && ch.dashCd <= 0);
    this.pathT -= dt;
    if (this.pathT <= 0 || this.path.length === 0) {
      this.pathT = 0.5;
      this.path = this.findPath(sim, ch.pos.x, ch.pos.z, this.goal.x, this.goal.z, canHop);
    }
    let wx: number, wz: number;
    let next = this.path[0];
    while (next && Math.hypot(next.x - ch.pos.x, next.z - ch.pos.z) < 0.8 && this.path.length > 1) {
      this.path.shift();
      next = this.path[0];
    }
    // El próximo punto del camino queda del otro lado de un hueco: se llega saltando o, sin salto, con el dash.
    const gap = !!next && next.hop && ch.grounded;
    if (next && (this.path.length > 1 || gap)) {
      wx = next.x - ch.pos.x;
      wz = next.z - ch.pos.z;
      if (sim.rules.jump && next.top > ch.pos.y + 0.45 && Math.hypot(wx, wz) < 2.2 && ch.grounded) this.tap |= BTN.JUMP;
    } else {
      wx = this.goal.x - ch.pos.x;
      wz = this.goal.z - ch.pos.z;
      if (Math.hypot(wx, wz) < 0.6) return;
    }
    const u = norm2(wx, wz);
    wx = u.x; wz = u.z;

    // Nunca caminar hacia el vacío... salvo para cruzar un hueco: ahí se toma carrera y se salta (o se dashea) en el borde.
    if (gap && cw.groundAt(ch.pos.x + wx * 0.7, ch.pos.z + wz * 0.7, ch.pos.y + 2) === -Infinity) {
      if (sim.rules.jump) {
        this.tap |= BTN.JUMP;
        this.hop = { x: next!.x, z: next!.z, t: HOP_TIME };
      } else if (sim.rules.dash && ch.dashCd <= 0) {
        this.tap |= BTN.DASH;
      } else {
        // El dash no está listo: no tirarse al vacío. Soltar el camino y dejar que el próximo recálculo rodee.
        this.path = [];
        return;
      }
      this.path.shift();
      this.wishX = wx;
      this.wishZ = wz;
      return;
    }
    for (const k of gap ? [] : [0.9, 1.6]) {
      if (cw.groundAt(ch.pos.x + wx * k, ch.pos.z + wz * k, ch.pos.y + 2) === -Infinity) {
        const c = norm2(-ch.pos.x, -ch.pos.z);
        const nx = c.x * 0.7 - wz * 0.3, nz = c.z * 0.7 + wx * 0.3;
        wx = nx;
        wz = nz;
        break;
      }
    }

    // Atascado: saltar y probar de costado. No cuenta en la cuenta regresiva: ahí nadie se mueve a propósito
    // (si no, al arrancar la partida dispara la recuperación con el personaje todavía quieto en la salida).
    const moved = Math.hypot(ch.pos.x - this.lastX, ch.pos.z - this.lastZ);
    this.lastX = ch.pos.x;
    this.lastZ = ch.pos.z;
    if (sim.phase !== 'play') this.stuckT = 0;
    else if (moved < 0.02 && ch.grounded) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.35) {
      if (sim.rules.jump) this.tap |= BTN.JUMP;
      const s = this.rng.chance(0.5) ? 1 : -1;
      const ox = wx;
      wx = -wz * s;
      wz = ox * s;
      // Romper lo que tape: a golpes si hay golpe, con el dash si en cambio se agarra (Carrera).
      if (sim.rules.grab) { if (sim.rules.dash && ch.grounded && ch.dashCd <= 0) this.tap |= BTN.DASH; }
      else this.hold |= BTN.BASIC;
      if (this.stuckT > 1.2) { this.stuckT = 0; this.path = []; }
    }

    if (this.dashAway && (this.tap & BTN.DASH)) {
      const u = norm2(ch.pos.x - this.dashAway.pos.x, ch.pos.z - this.dashAway.pos.z);
      const c = norm2(-ch.pos.x, -ch.pos.z); // hacia el centro, nunca al vacío
      const d = norm2(u.x + c.x, u.z + c.z);
      wx = d.x; wz = d.z;
    }
    this.dashAway = null;
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

  /** canHop: si un hueco de una celda se puede cruzar (saltando o, sin salto, con el dash ya listo). */
  private findPath(sim: Simulation, sx: number, sz: number, gx: number, gz: number, canHop = false) {
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
    // Mejor rodear paragolpes, ejes de rotor y géiseres que pasarles por encima (sin salto no hay forma de
    // recortar un golpe en el aire). El rotor es el único que evita un radio entero: gira sin parar y barre
    // un círculo completo, así que estar parado adentro ya es peligroso, no solo cruzar su eje. Los paragolpes
    // avisan menos pero son puntuales (algunos mapas los ponen a propósito en el medio del camino).
    for (const g of sim.gadgets) {
      if (g.kind === 'box' || g.kind === 'boost' || g.kind === 'roller') continue;
      if (g.kind !== 'rotor') { blockedByDestruct.add(t.cellIndexAt(g.x, g.z)); continue; }
      const avoid = ROTOR.len;
      const gi = t.cellIndexAt(g.x, g.z), gcx = gi % t.w, gcz = Math.floor(gi / t.w);
      const rCells = Math.ceil(avoid / CELL);
      for (let dz = -rCells; dz <= rCells; dz++) for (let dx = -rCells; dx <= rCells; dx++) {
        const nx = gcx + dx, nz = gcz + dz;
        if (nx < 0 || nz < 0 || nx >= t.w || nz >= t.h) continue;
        const cc = t.cellCenter(nx, nz);
        if (Math.hypot(cc.x - g.x, cc.z - g.z) <= avoid) blockedByDestruct.add(nz * t.w + nx);
      }
    }
    // Carrera: los carriles de bolas se pisan lo menos posible, y un hueco de una celda se cruza si canHop.
    const hops = sim.mode.id === 'race' && canHop;
    const lanes = new Set<number>();
    for (const g of sim.gadgets) {
      if (g.kind !== 'roller') continue;
      for (let s = 0; s <= g.len; s += CELL) lanes.add(t.cellIndexAt(g.x + g.dx * s, g.z + g.dz * s));
    }
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
          if (!t.isWalkable(ni)) {
            // Hueco (vacío o piso caído) de una celda con piso del otro lado, en línea recta.
            if (!hops || (dx && dz) || t.cells[ni].type === CellType.Wall) continue;
            const fx = cx + dx * 2, fz = cz + dz * 2;
            if (fx < 0 || fz < 0 || fx >= t.w || fz >= t.h) continue;
            const fi = fz * t.w + fx;
            if (!t.isWalkable(fi) || level(fi) > level(cur) || blockedByDestruct.has(fi)) continue;
            const hc = cost[cur] + 4.5;
            if (hc < cost[fi]) {
              if (cost[fi] === Infinity) open.push(fi);
              cost[fi] = hc;
              prev[fi] = cur;
            }
            continue;
          }
          if (dx && dz && (!t.isWalkable(cz * t.w + nx) || !t.isWalkable(nz * t.w + cx))) continue;
          const dl = level(ni) - level(cur);
          if (dl > 1) continue;
          let c = dx && dz ? 1.42 : 1;
          if (dl >= 1) c += 2; // salto
          if (blockedByDestruct.has(ni)) c += 3;
          if (lanes.has(ni)) c += 1.2;
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
    const out: PathNode[] = [];
    for (let i = goal; i !== start && i >= 0; i = prev[i]) {
      const c = t.cellCenter(i % t.w, Math.floor(i / t.w));
      const p = prev[i];
      const far = p >= 0 && Math.abs((p % t.w) - (i % t.w)) + Math.abs(Math.floor(p / t.w) - Math.floor(i / t.w)) > 1 && ((p % t.w) === (i % t.w) || Math.floor(p / t.w) === Math.floor(i / t.w));
      out.push({ x: c.x, z: c.z, top: t.topAt(i, c.x, c.z), hop: far });
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

/** Distancia recorrida a lo largo de un recorrido hasta la proyección de (x,z). */
export function laneProgress(path: { x: number; z: number }[], x: number, z: number): number {
  let best = 0, bd = Infinity, acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const u = Math.max(0, Math.min(l, ((x - a.x) * dx + (z - a.z) * dz) / l));
    const d = Math.hypot(a.x + (dx / l) * u - x, a.z + (dz / l) * u - z);
    if (d < bd) { bd = d; best = acc + u; }
    acc += l;
  }
  return best;
}

/** Punto a cierta distancia a lo largo de un recorrido. */
export function pointAt(path: { x: number; z: number }[], dist: number): { x: number; z: number } {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + l >= dist) { const u = (dist - acc) / (l || 1); return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }; }
    acc += l;
  }
  const last = path[path.length - 1];
  return { x: last.x, z: last.z };
}
