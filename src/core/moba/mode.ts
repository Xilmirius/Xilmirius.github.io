// Asedio (MOBA): el modo de victoria "destruí el núcleo rival" más los sistemas que lo hacen MOBA:
// oleadas de esbirros por línea, torres que defienden, base que enfría y echa, campamentos
// neutrales y el Coloso. Todo corre en el host sobre el mismo núcleo: los esbirros son cuerpos con
// la misma física y knockback que los héroes (se los puede tirar al vacío) y las torres son
// estructuras del mapa. Ver docs/MOBA.md.
import { BASE_RADIUS, CHAR_RADIUS, TICK_RATE } from '../constants';
import type { Character, Structure } from '../entities';
import type { V3 } from '../math';
import type { GameMode, MobaHud, ModeHud, ModeResult } from '../modes';
import { NO_MODS } from '../mutations';
import type { Simulation } from '../sim';
import { FAMILIES } from '../types';
import {
  BACKDOOR, BLESSING, CAMP, COLOSO, CORE, FOUNTAIN, HERO_VS_UNIT, RESPAWN, REWARD, SUDDEN, TOWER, UNIT_DEFS, WAVE,
  XP_SHARE_RADIUS, type MobaUnit, type UnitDef,
} from './defs';

/** Equipo de los neutrales (campamentos y Coloso): hostiles para los dos. */
export const NEUTRAL_TEAM = 2;

type Target = Character | Structure;

interface UnitAI {
  lane: number;
  wp: number;
  target: Target | null;
  think: number;
  /** Neutrales: casa y campamento. */
  home?: V3;
  camp?: number;
  /** Coloso: enfriamiento del golpe y preparación en curso. */
  windup?: number;
  /** Bendición del Coloso al nacer (daño extra). */
  blessed?: boolean;
}

interface TowerAI {
  lane: number;
  tier: number; // 1 exterior, 2 interior, 0 núcleo
  ramp: number;
  rampTarget: number;
  cool: number;
}

interface Camp { pos: V3; units: Character[]; respawnT: number }

const isStruct = (t: Target): t is Structure => (t as Structure).obstacle !== undefined;
const d2 = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Distancia de un cuerpo al borde de una estructura. */
function edgeDist(p: { x: number; z: number }, s: Structure) {
  const dx = Math.max(0, Math.abs(p.x - s.x) - s.hw), dz = Math.max(0, Math.abs(p.z - s.z) - s.hd);
  return Math.hypot(dx, dz);
}

/** Dirección para caminar hacia (tx,tz) esquivando obstáculos y sin tirarse al vacío. */
function steer(sim: Simulation, u: Character, tx: number, tz: number): [number, number] {
  let dx = tx - u.pos.x, dz = tz - u.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return [0, 0];
  dx /= d; dz /= d;
  for (const a of [0, 0.55, -0.55, 1.1, -1.1, 1.6, -1.6]) {
    const c = Math.cos(a), s = Math.sin(a);
    const rx = dx * c - dz * s, rz = dx * s + dz * c;
    const px = u.pos.x + rx * 1.1, pz = u.pos.z + rz * 1.1;
    if (sim.cw.groundAt(px, pz, u.pos.y + 0.6) === -Infinity) continue;
    if (sim.cw.blockAt(px, pz, CHAR_RADIUS, u.pos.y)) continue;
    return [rx, rz];
  }
  return [0, 0];
}

export class MobaMode implements GameMode {
  id = 'moba' as const;
  lanes: V3[][] = [];
  structs: Structure[] = [];
  cores: Structure[] = [];
  destroyed = [0, 0];
  down: [number, number, number][] = [];
  waveT: number = WAVE.first;
  waveN = 0;
  private queue: { lane: number; team: number; kinds: MobaUnit[]; t: number; rage: boolean }[] = [];
  camps: Camp[] = [];
  coloso: Character | null = null;
  colosoT: number = COLOSO.first;
  blessing = { team: -1, t: 0 };
  sudden = false;
  suddenT = 0;
  private winner = -1;
  private laser = new Map<number, number>();
  private alertT = new Map<string, number>();

  init(sim: Simulation) {
    sim.heroVsUnit = HERO_VS_UNIT;
    for (const c of sim.chars) c.lives = 99;
    const t = sim.terrain;
    this.lanes = t.lanes.map((l) => l.map((p) => ({ ...p })));
    // Núcleos
    for (const c of t.cores) {
      const st = sim.addFixedStructure(c.team, 'core', 'crystal', c.x, c.z, CORE.hw, CORE.h, CORE.hp);
      st.ai = { lane: -1, tier: 0, ramp: 1, rampTarget: -1, cool: 0 } satisfies TowerAI;
      this.cores[c.team] = st;
      this.structs.push(st);
    }
    // Torres: línea más cercana; la más lejana a su núcleo es la exterior (nivel 1).
    const byLane = new Map<string, { tw: (typeof t.towers)[number]; d: number }[]>();
    for (const tw of t.towers) {
      const lane = this.nearestLane(tw.x, tw.z);
      const core = t.cores.find((c) => c.team === tw.team)!;
      const key = `${tw.team}:${lane}`;
      if (!byLane.has(key)) byLane.set(key, []);
      byLane.get(key)!.push({ tw, d: d2(tw, core) });
    }
    for (const [key, list] of byLane) {
      const lane = Number(key.split(':')[1]);
      list.sort((a, b) => b.d - a.d);
      list.forEach(({ tw }, i) => {
        const tier = i === 0 ? 1 : 2;
        const st = sim.addFixedStructure(tw.team, 'tower', 'metal', tw.x, tw.z, TOWER.hw, TOWER.h, TOWER.hp[tier]);
        st.ai = { lane, tier, ramp: 1, rampTarget: -1, cool: 0 } satisfies TowerAI;
        this.structs.push(st);
      });
    }
    // Campamentos neutrales
    this.camps = t.camps.map((p) => ({ pos: { ...p }, units: [], respawnT: 0 }));
    this.camps.forEach((_, i) => this.spawnCamp(sim, i));
    this.updateProtection(sim);
  }

  // ───────────── utilidades ─────────────

  private nearestLane(x: number, z: number) {
    let best = 0, bd = Infinity;
    this.lanes.forEach((lane, li) => {
      for (let i = 1; i < lane.length; i++) {
        const a = lane[i - 1], b = lane[i];
        const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
        const d = Math.hypot(a.x + dx * u - x, a.z + dz * u - z);
        if (d < bd) { bd = d; best = li; }
      }
    });
    return best;
  }

  private paths = new Map<string, V3[]>();
  /** Recorrido de una línea visto por un equipo (el B la recorre al revés), terminando en el núcleo rival. */
  lanePath(lane: number, team: number): V3[] {
    const key = `${lane}:${team}`;
    let p = this.paths.get(key);
    if (!p) {
      const l = this.lanes[lane];
      p = team === 0 ? [...l] : [...l].reverse();
      const core = this.cores[team === 0 ? 1 : 0];
      if (core) p.push({ x: core.x, y: 0, z: core.z });
      this.paths.set(key, p);
    }
    return p;
  }

  private alert(sim: Simulation, w: string, team: number, x = 0, z = 0, every = 0) {
    if (every > 0) {
      const key = `${w}:${team}`;
      const last = this.alertT.get(key) ?? -Infinity;
      if (sim.elapsed - last < every) return;
      this.alertT.set(key, sim.elapsed);
    }
    sim.emit({ k: 'alert', w, tm: team, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
  }

  private give(sim: Simulation, h: Character, mat: number, n: number) {
    if (mat === 4) for (const f of FAMILIES) h.mats[f] += n;
    else h.mats[FAMILIES[mat]] += n;
    sim.emit({ k: 'gold', id: h.id, m: mat, n });
  }

  // ───────────── bucle ─────────────

  preTick(sim: Simulation, dt: number) {
    if (sim.phase === 'play') {
      this.waves(sim, dt);
      this.neutrals(sim, dt);
    }
    this.updateProtection(sim);
    for (const u of sim.units) if (u.alive) this.think(sim, u, dt);
    if (sim.phase === 'play') {
      this.towers(sim, dt);
      this.bases(sim, dt);
    }
  }

  tick(sim: Simulation, dt: number) {
    if (sim.phase !== 'play') return;
    this.structScale = 1 + WAVE.structPerMin * (sim.elapsed / 60);
    if (this.blessing.t > 0) {
      this.blessing.t -= dt;
      if (this.blessing.t <= 0) { this.blessing.team = -1; this.alert(sim, 'blessing_end', -1); }
    }
    if (!this.sudden && sim.elapsed >= sim.settings.timeLimit) {
      this.sudden = true;
      this.suddenT = SUDDEN.extra;
      this.alert(sim, 'sudden', -1);
      sim.emit({ k: 'msg', tx: '¡MUERTE SÚBITA! Los núcleos quedan expuestos' });
    }
    if (this.sudden) this.suddenT = Math.max(0, this.suddenT - dt);
  }

  // ───────────── oleadas ─────────────

  private waves(sim: Simulation, dt: number) {
    this.waveT -= dt;
    if (this.waveT <= 0) {
      this.waveT = WAVE.every;
      this.waveN++;
      const kinds: MobaUnit[] = [];
      for (let i = 0; i < WAVE.melee; i++) kinds.push('melee');
      if (this.waveN % WAVE.siegeEvery === 0) kinds.push('siege');
      for (let i = 0; i < WAVE.ranged; i++) kinds.push('ranged');
      for (let lane = 0; lane < this.lanes.length; lane++) {
        for (const team of [0, 1]) {
          // Línea abierta (el rival ya no tiene torres en ella): cada oleada trae un Ariete extra.
          const open = !this.structs.some((s) => s.hp > 0 && s.team !== team && s.kind === 'tower' && (s.ai as TowerAI).lane === lane);
          this.queue.push({ lane, team, kinds: open ? ['siege', ...kinds] : [...kinds], t: 0, rage: open });
        }
      }
      this.alert(sim, 'wave', -1);
    }
    for (const q of this.queue) {
      q.t -= dt;
      if (q.t > 0 || !q.kinds.length) continue;
      q.t = WAVE.gap;
      this.spawnMinion(sim, q.kinds.shift()!, q.team, q.lane, q.rage);
    }
    this.queue = this.queue.filter((q) => q.kinds.length);
  }

  private spawnMinion(sim: Simulation, kind: MobaUnit, team: number, lane: number, rage = false) {
    const def = UNIT_DEFS[kind];
    const path = this.lanePath(lane, team);
    const p = path[0];
    // Bendición del Coloso o línea abierta (Enfurecidos): más vida y más daño.
    const blessed = this.blessing.team === team || rage;
    const scale = (1 + WAVE.scalePerMin * (sim.elapsed / 60)) * (blessed ? BLESSING.hp : 1);
    const u = sim.addUnit(kind, team, p.x + sim.rng.range(-0.4, 0.4), p.z + sim.rng.range(-0.4, 0.4), {
      name: def.name, family: def.family, hp: Math.round(def.hp * scale), speed: def.speed, kbTaken: def.kbTaken,
    });
    u.ai = { lane, wp: 1, target: null, think: sim.rng.range(0, 0.25), blessed } satisfies UnitAI;
  }

  // ───────────── neutrales ─────────────

  private spawnCamp(sim: Simulation, i: number) {
    const camp = this.camps[i];
    const def = UNIT_DEFS.neutral;
    const scale = 1 + WAVE.scalePerMin * (sim.elapsed / 60);
    camp.units = [];
    for (let k = 0; k < CAMP.perCamp; k++) {
      const a = (k / CAMP.perCamp) * Math.PI * 2;
      const u = sim.addUnit('neutral', NEUTRAL_TEAM, camp.pos.x + Math.cos(a) * 0.9, camp.pos.z + Math.sin(a) * 0.9, {
        name: def.name, family: def.family, hp: Math.round(def.hp * scale), speed: def.speed, kbTaken: def.kbTaken,
      });
      u.ai = { lane: -1, wp: 0, target: null, think: 0, home: { x: u.pos.x, y: u.pos.y, z: u.pos.z }, camp: i } satisfies UnitAI;
      camp.units.push(u);
    }
  }

  private neutrals(sim: Simulation, dt: number) {
    this.camps.forEach((camp, i) => {
      if (camp.units.some((u) => u.alive)) return;
      camp.respawnT -= dt;
      if (camp.respawnT <= 0) this.spawnCamp(sim, i);
    });
    const lair = sim.terrain.lairs[0];
    if (lair && !this.coloso) {
      this.colosoT -= dt;
      if (this.colosoT <= 0) {
        const def = UNIT_DEFS.coloso;
        const scale = 1 + WAVE.scalePerMin * (sim.elapsed / 60);
        const u = sim.addUnit('coloso', NEUTRAL_TEAM, lair.x, lair.z, { name: def.name, family: def.family, hp: Math.round(def.hp * scale), speed: def.speed, kbTaken: def.kbTaken });
        u.ai = { lane: -1, wp: 0, target: null, think: 0, home: { ...lair }, windup: 0 } satisfies UnitAI;
        this.coloso = u;
        this.alert(sim, 'coloso_up', -1, lair.x, lair.z);
      }
    }
  }

  // ───────────── IA de unidades ─────────────

  private think(sim: Simulation, u: Character, dt: number) {
    const ai = u.ai as UnitAI | null;
    const inp = u.input;
    inp.mx = 0; inp.mz = 0; inp.b = 0;
    if (!ai) return; // unidad sin IA (p. ej. creada a mano en un test): se queda quieta
    if (sim.phase !== 'play' || u.stun > 0 || u.hitstun > 0 || u.tumble > 0) return;
    if (u.unit === 'coloso') { this.thinkColoso(sim, u, ai, dt); return; }
    if (u.unit === 'neutral') { this.thinkNeutral(sim, u, ai); return; }
    const def = UNIT_DEFS[u.unit as MobaUnit];
    ai.think -= dt;
    if (ai.think <= 0 || !this.validTarget(u, ai.target, def.aggro + 2)) {
      ai.think = 0.25;
      ai.target = this.pickTarget(sim, u, def);
    }
    const tg = ai.target;
    if (tg) {
      const tp = isStruct(tg) ? { x: tg.x, z: tg.z } : tg.pos;
      const gap = isStruct(tg) ? edgeDist(u.pos, tg) - CHAR_RADIUS : d2(u.pos, tp) - CHAR_RADIUS * 2;
      inp.ax = tp.x; inp.az = tp.z;
      if (gap > def.range) {
        [inp.mx, inp.mz] = steer(sim, u, tp.x, tp.z);
      } else if (u.cds.basic <= 0) this.attack(sim, u, def, tg, ai);
      return;
    }
    // Sin objetivo: seguir la línea.
    const path = this.lanePath(ai.lane, u.team);
    while (ai.wp < path.length - 1 && d2(u.pos, path[ai.wp]) < 1.6) ai.wp++;
    const a = path[Math.max(0, ai.wp - 1)], b = path[ai.wp];
    // Punto de la línea un poco adelante de donde estoy (vuelve al centro si lo corrieron).
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const along = Math.max(0, Math.min(l, ((u.pos.x - a.x) * dx + (u.pos.z - a.z) * dz) / l + 3));
    const gx = a.x + (dx / l) * along, gz = a.z + (dz / l) * along;
    [inp.mx, inp.mz] = steer(sim, u, gx, gz);
    inp.ax = gx; inp.az = gz;
  }

  private validTarget(u: Character, t: Target | null, maxD: number) {
    if (!t) return false;
    if (isStruct(t)) return t.hp > 0 && !t.invuln && edgeDist(u.pos, t) <= maxD;
    return t.alive && t.invuln <= 0 && d2(u.pos, t.pos) <= maxD;
  }

  private pickTarget(sim: Simulation, u: Character, def: UnitDef): Target | null {
    // 1) Llamada de ayuda: un héroe rival le pegó a un héroe aliado cerca mío.
    let best: Target | null = null, bd = Infinity;
    for (const h of sim.chars) {
      if (!h.alive || h.team === u.team || h.invuln > 0) continue;
      if (sim.tick - h.hitHeroTick > 1.5 * TICK_RATE) continue;
      const v = sim.charById.get(h.hitHeroVictim);
      if (!v || v.team !== u.team || d2(u.pos, v.pos) > 9) continue;
      const d = d2(u.pos, h.pos);
      if (d < def.aggro + 1 && d < bd) { bd = d; best = h; }
    }
    if (best) return best;
    // 2) Esbirros rivales.
    for (const o of sim.units) {
      if (!o.alive || o.team === u.team || o.team === NEUTRAL_TEAM) continue;
      const d = d2(u.pos, o.pos);
      if (d < def.aggro && d < bd) { bd = d; best = o; }
    }
    if (best) return best;
    // 3) Torres y núcleo rivales (si no están protegidos).
    for (const s of this.structs) {
      if (s.hp <= 0 || s.team === u.team || s.invuln) continue;
      const d = edgeDist(u.pos, s);
      if (d < def.aggro && d < bd) { bd = d; best = s; }
    }
    if (best) return best;
    // 4) Héroes rivales.
    for (const h of sim.chars) {
      if (!h.alive || h.team === u.team || h.invuln > 0) continue;
      const d = d2(u.pos, h.pos);
      if (d < def.aggro * 0.85 && d < bd) { bd = d; best = h; }
    }
    return best;
  }

  /** Multiplicador de daño de una unidad (Bendición del Coloso, muerte súbita). */
  private dmgMul(ai: UnitAI) { return ai.blessed ? BLESSING.dmg : 1; }
  private structMul(ai: UnitAI) { return (ai.blessed ? BLESSING.structDmg : 1) * (this.sudden ? SUDDEN.structMul : 1) * this.structScale; }
  /** Los esbirros pegan más a las estructuras a medida que pasa la partida. */
  private structScale = 1;

  private attack(sim: Simulation, u: Character, def: UnitDef, tg: Target, ai: UnitAI) {
    u.cds.basic = def.cd;
    const tp = isStruct(tg) ? { x: tg.x, y: tg.y, z: tg.z } : tg.pos;
    const dx = tp.x - u.pos.x, dz = tp.z - u.pos.z, l = Math.hypot(dx, dz) || 1;
    if (u.unit === 'siege') {
      // Cañonazo parabólico: daña a lo que esté donde cae (y mucho a las estructuras).
      const dmg = def.heat * this.dmgMul(ai), sd = def.structDmg * this.structMul(ai);
      sim.lob(u, 'cannon', tp.x, tp.z, 0.7, (x, y, z) => {
        sim.blast(u, u.team, x, y + 0.5, z, { radius: 1.6, heat: dmg, kb: def.kb, destruct: sd, fx: 'cannon' }, NO_MODS);
      });
      return;
    }
    if (isStruct(tg)) {
      if (def.melee) {
        sim.damageObstacle(tg.obstacle, def.structDmg * this.structMul(ai), u);
        sim.emit({ k: 'uatk', id: u.id, tg: -tg.id - 1 });
      } else {
        sim.fireProjectile(u, { kind: 'spark', speed: 20, range: def.range + 3, radius: 0.25, heat: 0, kb: 0, destruct: def.structDmg * this.structMul(ai), dirX: dx / l, dirZ: dz / l }, NO_MODS);
      }
      return;
    }
    if (def.melee) {
      sim.hit(tg, u, { heat: def.heat * this.dmgMul(ai), kb: def.kb, dirX: dx / l, dirZ: dz / l, fx: 'minion', noLaunch: tg.unit === 'hero' });
      sim.emit({ k: 'uatk', id: u.id, tg: tg.id });
    } else {
      sim.fireProjectile(u, { kind: 'spark', speed: 20, range: def.range + 6, radius: 0.25, heat: def.heat * this.dmgMul(ai), kb: 0, dirX: dx / l, dirZ: dz / l, homing: tg.id, ignoreSolid: true }, NO_MODS);
    }
  }

  private thinkNeutral(sim: Simulation, u: Character, ai: UnitAI) {
    const def = UNIT_DEFS.neutral;
    const home = ai.home!;
    const camp = this.camps[ai.camp ?? 0];
    // El campamento pelea junto: si le pegan a uno, se enojan todos con ese héroe.
    if (!ai.target) {
      let who: Character | null = null, last = -Infinity;
      for (const m of camp.units) {
        for (const [id, t] of m.lastHits) {
          const h = sim.charById.get(id);
          if (h && h.unit === 'hero' && h.alive && t > last && sim.tick - t < 4 * TICK_RATE) { last = t; who = h; }
        }
      }
      ai.target = who;
    }
    const tg = ai.target as Character | null;
    if (tg && (!tg.alive || d2(tg.pos, home) > CAMP.leash || tg.invuln > 0)) {
      // Se fue lejos: vuelven a casa y se curan.
      for (const m of camp.units) { m.lastHits.clear(); if (m.ai) (m.ai as UnitAI).target = null; }
      ai.target = null;
    }
    if (ai.target) {
      const t = ai.target as Character;
      u.input.ax = t.pos.x; u.input.az = t.pos.z;
      if (d2(u.pos, t.pos) - CHAR_RADIUS * 2 > def.range) [u.input.mx, u.input.mz] = steer(sim, u, t.pos.x, t.pos.z);
      else if (u.cds.basic <= 0) this.attack(sim, u, def, t, ai);
      return;
    }
    if (d2(u.pos, home) > 0.6) [u.input.mx, u.input.mz] = steer(sim, u, home.x, home.z);
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.25 * (1 / TICK_RATE));
  }

  private thinkColoso(sim: Simulation, u: Character, ai: UnitAI, dt: number) {
    const home = ai.home!;
    u.input.ax = home.x + 1; u.input.az = home.z;
    // Objetivo: el héroe más cercano que le pegó hace poco, o cualquiera que se le pegue.
    let tg: Character | null = null, bd = Infinity;
    for (const h of sim.chars) {
      if (!h.alive || h.invuln > 0) continue;
      const d = d2(h.pos, u.pos);
      const hit = u.lastHits.get(h.id);
      const angry = hit !== undefined && sim.tick - hit < 6 * TICK_RATE;
      if ((angry && d < COLOSO.leash) || d < 2.5) if (d < bd) { bd = d; tg = h; }
    }
    if (tg) { u.input.ax = tg.pos.x; u.input.az = tg.pos.z; }
    else if (sim.tick - u.lastHitTick > 8 * TICK_RATE) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * COLOSO.regen * dt);
    if (ai.windup && ai.windup > 0) {
      ai.windup -= dt;
      if (ai.windup <= 0) {
        const def = UNIT_DEFS.coloso;
        sim.blast(u, NEUTRAL_TEAM, u.pos.x, u.pos.y + 0.5, u.pos.z, { radius: COLOSO.radius, heat: def.heat, kb: def.kb, up: 3, destruct: 30, tile: 40, tileRadius: 2, fx: 'quake' }, NO_MODS);
        u.cds.basic = UNIT_DEFS.coloso.cd;
      }
      return;
    }
    if (tg && bd < COLOSO.radius + 0.5 && u.cds.basic <= 0) {
      ai.windup = COLOSO.slamWindup;
      sim.telegraph('quake', NEUTRAL_TEAM, u.pos.x, u.pos.y, u.pos.z, COLOSO.radius, COLOSO.slamWindup);
      sim.emit({ k: 'uatk', id: u.id, tg: tg.id });
    }
  }

  // ───────────── torres, núcleo y bases ─────────────

  private updateProtection(sim: Simulation) {
    const minionsNear = (s: Structure) => sim.units.some((u) => u.alive && u.team !== s.team && u.team !== NEUTRAL_TEAM && d2(u.pos, s) < BACKDOOR.radius);
    for (const s of this.structs) {
      if (s.hp <= 0) continue;
      const ai = s.ai as TowerAI;
      if (ai.tier === 2) s.invuln = this.structs.some((o) => o.hp > 0 && o.team === s.team && (o.ai as TowerAI).lane === ai.lane && (o.ai as TowerAI).tier === 1);
      else if (ai.tier === 0) {
        // El núcleo queda expuesto cuando cae una línea entera (o en muerte súbita).
        const laneOpen = this.lanes.some((_, li) => !this.structs.some((o) => o.hp > 0 && o.team === s.team && (o.ai as TowerAI).lane === li));
        s.invuln = !(laneOpen || this.sudden);
      } else s.invuln = false;
      s.armor = (minionsNear(s) || this.sudden ? 1 : BACKDOOR.armor) * (ai.tier > 0 && sim.elapsed < TOWER.earlyTime ? TOWER.earlyArmor : 1);
    }
  }

  private towers(sim: Simulation, dt: number) {
    for (const s of this.structs) {
      if (s.hp <= 0) continue;
      const ai = s.ai as TowerAI;
      const core = ai.tier === 0;
      const range = core ? CORE.range : TOWER.range;
      const inRange = (c: Character) => c.alive && c.invuln <= 0 && c.team !== s.team && c.team !== NEUTRAL_TEAM && edgeDist(c.pos, s) <= range;
      let tg = s.target !== undefined && s.target >= 0 ? sim.charById.get(s.target) ?? null : null;
      if (tg && !inRange(tg)) tg = null;
      // Prioridad: el héroe rival que le pegue a un héroe aliado bajo la torre.
      for (const h of sim.chars) {
        if (!inRange(h) || sim.tick - h.hitHeroTick > 1.5 * TICK_RATE) continue;
        const v = sim.charById.get(h.hitHeroVictim);
        if (v && v.team === s.team && edgeDist(v.pos, s) <= range + 2) { tg = h; break; }
      }
      if (!tg) {
        let bd = Infinity;
        for (const u of sim.units) if (inRange(u) && d2(u.pos, s) < bd) { bd = d2(u.pos, s); tg = u; }
      }
      if (!tg) {
        let bd = Infinity;
        for (const h of sim.chars) if (inRange(h) && d2(h.pos, s) < bd) { bd = d2(h.pos, s); tg = h; }
      }
      if ((s.lastHitTick ?? -99) >= sim.tick - 1 && (s.lastHitBy ?? -1) >= 0) this.alert(sim, 'tower_hit', s.team, s.x, s.z, 12);
      s.target = tg ? tg.id : -1;
      if (!tg || tg.id !== ai.rampTarget) { ai.ramp = 1; ai.rampTarget = tg ? tg.id : -1; }
      s.fireT -= dt;
      if (!tg || s.fireT > 0) continue;
      s.fireT = core ? CORE.cd : TOWER.cd;
      const hero = tg.unit === 'hero';
      const heat = hero ? (core ? CORE.heat : TOWER.heat) * ai.ramp : core ? CORE.unitDmg : TOWER.unitDmg;
      if (hero) ai.ramp = Math.min(TOWER.rampMax, ai.ramp * TOWER.ramp);
      const dx = tg.pos.x - s.x, dz = tg.pos.z - s.z, l = Math.hypot(dx, dz) || 1;
      sim.spawnProjectile(-1, s.team, s.x + (dx / l) * s.hw, s.y + s.h + 0.2, s.z + (dz / l) * s.hw, {
        kind: core ? 'coreshot' : 'tbolt', speed: 24, range: range + 8, radius: 0.35, heat, kb: hero ? (core ? CORE.kb : TOWER.kb) : 0,
        dirX: dx / l, dirZ: dz / l, homing: tg.id, ignoreSolid: true,
      }, NO_MODS);
      sim.emit({ k: 'tshot', id: s.id, tg: tg.id });
      if (hero) this.alert(sim, 'tower_dive', tg.team, s.x, s.z, 6);
    }
  }

  private bases(sim: Simulation, dt: number) {
    for (const h of sim.chars) {
      if (!h.alive) continue;
      for (const team of [0, 1]) {
        const b = sim.baseCenter(team);
        const d = d2(h.pos, b);
        if (d > BASE_RADIUS) continue;
        if (h.team === team) sim.coolHeat(h, FOUNTAIN.cool * dt);
        else {
          // La base echa a los intrusos: quema y empuja hacia afuera.
          const t = (this.laser.get(h.id) ?? 0) - dt;
          if (t <= 0 && h.invuln <= 0) {
            const u = d > 0.1 ? { x: (h.pos.x - b.x) / d, z: (h.pos.z - b.z) / d } : { x: team === 0 ? 1 : -1, z: 0 };
            sim.hit(h, null, { heat: FOUNTAIN.heat, kb: FOUNTAIN.kb, dirX: u.x, dirZ: u.z, up: 2, fx: 'fountain' });
            this.laser.set(h.id, FOUNTAIN.every);
          } else this.laser.set(h.id, t);
        }
      }
      // Cerca de una torre propia te enfriás de a poco si no te vienen pegando.
      if (h.heat > 0 && sim.tick - h.lastHitTick > TOWER.coolDelay * TICK_RATE) {
        if (this.structs.some((s) => s.hp > 0 && s.team === h.team && d2(h.pos, s) <= TOWER.coolRadius)) sim.coolHeat(h, TOWER.cool * dt);
      }
    }
  }

  // ───────────── muertes y estructuras ─────────────

  onDeath(sim: Simulation, victim: Character, killer: Character | null) {
    if (!killer) return;
    this.give(sim, killer, FAMILIES.indexOf(victim.family), REWARD.kill);
    for (const [id, t] of victim.lastHits) {
      if (id === killer.id || sim.tick - t > 8 * TICK_RATE) continue;
      const a = sim.charById.get(id);
      if (a && a.unit === 'hero' && a.team !== victim.team) this.give(sim, a, FAMILIES.indexOf(victim.family), REWARD.assist);
    }
  }

  respawnTime(_sim: Simulation, ch: Character) {
    return RESPAWN.base + RESPAWN.perLevel * ch.level;
  }

  canRespawn() { return true; }

  onUnitDeath(sim: Simulation, u: Character, killer: Character | null, fell: boolean) {
    const def = UNIT_DEFS[u.unit as MobaUnit];
    if (!def) return;
    const hero = killer && killer.unit === 'hero' ? killer : null;
    // Equipo que se lleva la XP: el del que lo mató, o el rival del esbirro.
    const team = hero ? hero.team : u.team === 0 ? 1 : u.team === 1 ? 0 : -1;
    if (team >= 0) {
      const near = sim.chars.filter((h) => h.alive && h.team === team && d2(h.pos, u.pos) <= XP_SHARE_RADIUS);
      const each = def.xp * (near.length > 1 ? 0.7 : 1);
      for (const h of near) sim.addXp(h, each);
    }
    if (hero) {
      hero.cs++;
      if (def.reward) this.give(sim, hero, FAMILIES.indexOf(def.family), def.reward);
    }
    // El esbirro se desarma en un trozo de su material: lo junta el que esté cerca (se puede robar).
    if (!fell && (u.unit === 'melee' || u.unit === 'ranged' || u.unit === 'siege')) sim.dropMaterials(def.family, u.pos.x, u.pos.y + 0.8, u.pos.z, 1);
    if (u.unit === 'neutral') {
      const camp = this.camps[(u.ai as UnitAI).camp ?? 0];
      if (camp && !camp.units.some((m) => m.alive)) camp.respawnT = CAMP.respawn;
    }
    if (u.unit === 'coloso') {
      this.coloso = null;
      this.colosoT = COLOSO.respawn;
      // El último héroe que le pegó define el equipo que se lleva la bendición.
      let who: Character | null = hero, last = -Infinity;
      if (!who) for (const [id, t] of u.lastHits) { const h = sim.charById.get(id); if (h && h.unit === 'hero' && t > last) { last = t; who = h; } }
      if (who) {
        this.blessing = { team: who.team, t: COLOSO.buff };
        for (const h of sim.chars) if (h.team === who.team) {
          sim.addXp(h, REWARD.colosoXp);
          this.give(sim, h, FAMILIES.indexOf('crystal'), REWARD.colosoMats);
        }
        this.alert(sim, 'coloso_down', who.team, u.pos.x, u.pos.z);
      }
    }
  }

  onStructureDown(sim: Simulation, st: Structure, _by: Character | null) {
    const enemy = st.team === 0 ? 1 : 0;
    this.destroyed[enemy]++;
    this.down.push([Math.round(st.x * 10) / 10, Math.round(st.z * 10) / 10, st.team]);
    for (const h of sim.chars) if (h.team === enemy) {
      this.give(sim, h, 4, REWARD.structEach);
      sim.addXp(h, REWARD.structXp);
    }
    if (st.kind === 'core') {
      this.winner = enemy;
      return;
    }
    this.alert(sim, 'tower_down', st.team, st.x, st.z);
    this.updateProtection(sim);
    const core = this.cores[st.team];
    if (core && !core.invuln) this.alert(sim, 'core_open', st.team, core.x, core.z);
  }

  // ───────────── resultado y HUD ─────────────

  result(sim: Simulation): ModeResult | null {
    if (this.winner >= 0) return { winner: this.winner, draw: false, reason: 'Destruyó el núcleo rival' };
    if (this.sudden && this.suddenT <= 0) {
      // Desempate: estructuras destruidas y, si empatan, la vida que le queda a cada núcleo.
      const score = [0, 1].map((t) => this.destroyed[t] * 10 + (1 - (this.cores[t === 0 ? 1 : 0]?.hp ?? 0) / CORE.hp));
      if (Math.abs(score[0] - score[1]) < 0.01) return { winner: -1, draw: true, reason: 'Tiempo: empate de estructuras' };
      return { winner: score[0] > score[1] ? 0 : 1, draw: false, reason: 'Tiempo: más estructuras destruidas' };
    }
    void sim;
    return null;
  }

  hud(sim: Simulation): ModeHud {
    const moba: MobaHud = {
      alive: [0, 1].map((t) => this.structs.filter((s) => s.team === t && s.hp > 0).map((s) => [s.id, Math.round((s.hp / s.maxHp) * 100) / 100, s.invuln ? 1 : 0] as [number, number, number])),
      down: this.down,
      wave: Math.max(0, Math.ceil(this.waveT)),
      coloso: [this.coloso ? 1 : 0, Math.max(0, Math.ceil(this.colosoT)), this.blessing.team, Math.max(0, Math.ceil(this.blessing.t))],
      sudden: this.sudden ? 1 : 0,
    };
    const total = this.structs.filter((s) => s.team === 0).length;
    return {
      id: 'moba', title: 'Asedio', label: 'estructuras',
      time: this.sudden ? this.suddenT : Math.max(0, sim.settings.timeLimit - sim.elapsed),
      scores: [...this.destroyed], target: total, moba,
    };
  }
}

export function createMobaMode(): GameMode {
  return new MobaMode();
}
