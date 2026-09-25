// Simulación autoritativa. Corre SOLO en el host (el navegador que creó la sala) a 60 ticks/s.
// Los clientes mandan inputs y reciben snapshots; nunca simulan combate.
import { CollisionWorld, type Obstacle } from './collision';
import {
  BODY_HIT_SPEED, CHAR_HEIGHT, CHAR_RADIUS, DESTRUCT_RESPAWN, DT, HEAT_MAX, KILL_CREDIT_TIME, KILL_Y,
  LAUNCH_THRESHOLD, MAX_LEVEL, MAX_PICKUPS, MUTATION_LEVELS, PICKUP_COLLECT, PICKUP_MAGNET, PICKUP_TTL,
  PUSH_CD, PUSH_MAX_CHARGE, REPAIR_AMOUNT, REPAIR_COST, REPAIR_TIME, RESPAWN_TIME, SPAWN_INVULN, STAGE_AT,
  STAGE_KB, TICK_RATE, TILE_CRUMBLE, TILE_HP, WALL_SLAM_SPEED, XP_ASSIST, XP_DESTRUCT, XP_KILL, XP_PER_HEAT, XP_PICKUP,
  XP_TABLE, XP_TRICKLE, GRAVITY, LEVEL_H, ULT_PER_HEAT, ULT_PER_PICKUP, ULT_TRICKLE, RECALL_TIME, BASE_RADIUS, ISLAND_BOTTOM,
} from './constants';
import {
  baseStats, Character, DESTRUCT_DEF, type BlastSpec, type Destructible, type HitSpec, type Pickup,
  type Projectile, type Slot, type Structure, type Telegraph, type UnitKind, type Zone,
} from './entities';
import type { SimEvent } from './events';
import { HEROES } from './heroes';
import { BTN, held, pressed, released } from './input';
import { canAfford, ITEM_BY_ID, pay, refund } from './items';
import { dirOf, norm2, type V3 } from './math';
import { createMode, type GameMode, type ModeResult } from './modes';
import { canAct, DASH_IDLE, defaultMoveParams, newMoveOut, stepMove } from './movement';
import { MUTATION_COST, NO_MODS, ROUTE_MODS, SUPPORT_RADIUS, SUPPORT_SHIELD, type Mods } from './mutations';
import { Rng } from './rng';
import { rulesFor, unlockLevel, usesUltCharge, type Ruleset } from './rules';
import { Terrain, TILE_CRUMBLING, TILE_GONE, TILE_INTACT } from './terrain';
import { FAMILIES, type AbilitySlot, type Family, type HeroId, type MatchSettings, type Route, type RosterEntry } from './types';

export interface SimConfig {
  settings: MatchSettings;
  roster: RosterEntry[];
  seed: number;
}

export type Command =
  | { c: 'craft'; id: string }
  | { c: 'sell'; id: string }
  | { c: 'mutate'; slot: AbilitySlot; route: Route };

export interface ProjSpec {
  kind: string;
  speed: number;
  range: number;
  radius: number;
  heat: number;
  kb: number;
  up?: number;
  stun?: number;
  slow?: [number, number];
  pierce?: boolean;
  destruct?: number;
  tile?: number;
  explode?: BlastSpec;
  dirX: number;
  dirZ: number;
  onHit?: (t: Character) => void;
  onSolid?: (p: V3, o: Obstacle | null) => void;
  onEnd?: (p: V3) => void;
  ignoreSolid?: boolean;
  originX?: number;
  originZ?: number;
  originY?: number;
  /** Teledirigido a este cuerpo (solo le pega a él). */
  homing?: number;
}

/** Stats de una unidad nueva (esbirro, neutral). */
export interface UnitSpec {
  name: string;
  family: Family;
  hp: number;
  speed: number;
  kbTaken: number;
  heatTaken?: number;
}

interface MeleeSpec {
  range: number;
  angle: number;
  heat: number;
  kb: number;
  up?: number;
  stun?: number;
  destruct?: number;
  tile?: number;
  fx: string;
  slow?: [number, number];
}

const ABILITY_BTN: Record<AbilitySlot, number> = { q: BTN.Q, e: BTN.E, f: BTN.F, r: BTN.R };
const ITEM_BTN = [BTN.I1, BTN.I2, BTN.I3];
const ITEM_SLOT: Slot[] = ['i1', 'i2', 'i3'];

export class Simulation {
  tick = 0;
  phase: 'countdown' | 'play' | 'end' = 'countdown';
  phaseT = 3;
  elapsed = 0;
  readonly settings: MatchSettings;
  readonly terrain: Terrain;
  readonly cw: CollisionWorld;
  readonly rng: Rng;
  readonly mode: GameMode;
  readonly rules: Ruleset;
  readonly teamCount: number;
  /** Héroes (jugadores y bots). */
  chars: Character[] = [];
  /** Unidades del modo (esbirros, neutrales): mismos cuerpos y física, con vida e IA propia. */
  units: Character[] = [];
  /** Todo lo que tiene cuerpo y se puede golpear: héroes + unidades. */
  bodies: Character[] = [];
  /** Héroes y unidades por id. */
  charById = new Map<number, Character>();
  charByPid = new Map<string, Character>();
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  telegraphs: Telegraph[] = [];
  structures: Structure[] = [];
  destructibles: Destructible[] = [];
  pickups: Pickup[] = [];
  scheduled: { at: number; fn: () => void }[] = [];
  events: SimEvent[] = [];
  result: ModeResult | null = null;
  private nextId = 1;
  private nextUnitId = 1000;
  private unitsDirty = false;
  private obstaclesDirty = true;
  private commands: { pid: string; cmd: Command }[] = [];
  private mo = newMoveOut();
  private mp = defaultMoveParams();
  private lastCount = 4;
  private pendingPickups: number[][] = [];

  constructor(cfg: SimConfig) {
    // El Asedio siempre es por equipos y con sus reglas (bases, forja en base, volver con B).
    this.settings = cfg.settings.mode === 'moba' ? { ...cfg.settings, teams: 'teams', rules: 'moba' } : cfg.settings;
    this.rules = rulesFor(this.settings);
    this.rng = new Rng(cfg.seed);
    this.terrain = new Terrain(this.settings.map);
    this.cw = new CollisionWorld(this.terrain);
    this.mode = createMode(this.settings.mode);

    const ffa = this.settings.teams === 'ffa';
    this.teamCount = ffa ? cfg.roster.length : 2;
    const perTeam = new Array(this.teamCount).fill(0);
    cfg.roster.forEach((r, i) => {
      const team = ffa ? i : Math.max(0, Math.min(1, r.team));
      const hero = HEROES[r.hero] ?? HEROES.canto;
      const ch = new Character(i + 1, r.pid, r.name, team, hero.id, hero.family, r.bot, { x: 0, y: 0, z: 0 });
      ch.hat = r.hat ?? 'none';
      ch.pos = this.spawnPoint(ch, perTeam[team]++);
      ch.ppos = { ...ch.pos };
      ch.facing = ch.pos.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.recalcStats(ch);
      this.chars.push(ch);
      this.charById.set(ch.id, ch);
      this.charByPid.set(ch.pid, ch);
    });

    this.bodies = [...this.chars];
    this.terrain.destructs.forEach((d, idx) => {
      const def = DESTRUCT_DEF[d.kind];
      const h = def.size / 2;
      this.destructibles.push({
        idx, kind: d.kind, x: d.x, y: d.y, z: d.z, hp: def.hp, maxHp: def.hp, stage: 0, respawnT: 0,
        obstacle: { id: idx, minX: d.x - h, maxX: d.x + h, minZ: d.z - h, maxZ: d.z + h, base: d.y, top: d.y + def.h, kind: 'd' },
      });
    });
    this.mode.init(this);
    this.rebuildObstacles();
  }

  // ───────────────────────────── utilidades públicas ─────────────────────────────

  emit(e: SimEvent) { this.events.push(e); }

  drainEvents(): SimEvent[] {
    if (this.pendingPickups.length) {
      this.events.push({ k: 'pspawn', l: this.pendingPickups });
      this.pendingPickups = [];
    }
    const e = this.events;
    this.events = [];
    return e;
  }

  queueCommand(pid: string, cmd: Command) { this.commands.push({ pid, cmd }); }

  schedule(delay: number, fn: () => void) {
    this.scheduled.push({ at: this.tick + Math.max(1, Math.round(delay * TICK_RATE)), fn });
  }

  groundY(x: number, z: number, fallback: number) {
    const g = this.cw.groundAt(x, z, 50);
    return g === -Infinity ? fallback : g;
  }

  clampAim(ch: Character, ax: number, az: number, maxRange: number) {
    let dx = ax - ch.pos.x, dz = az - ch.pos.z;
    let d = Math.hypot(dx, dz);
    if (d < 0.01) {
      const f = dirOf(ch.facing);
      dx = f.x; dz = f.z; d = 1;
      return { x: ch.pos.x + f.x, z: ch.pos.z + f.z, dx, dz, d: 1 };
    }
    const ux = dx / d, uz = dz / d;
    const dd = Math.min(d, maxRange);
    return { x: ch.pos.x + ux * dd, z: ch.pos.z + uz * dd, dx: ux, dz: uz, d: dd };
  }

  enemiesInRadius(team: number, x: number, z: number, r: number, y?: number, dy = 2.5): Character[] {
    return this.bodies.filter((c) => c.alive && c.team !== team && Math.hypot(c.pos.x - x, c.pos.z - z) <= r + CHAR_RADIUS && (y === undefined || Math.abs(c.pos.y - y) <= dy));
  }

  alliesInRadius(team: number, x: number, z: number, r: number, y?: number, dy = 2.5): Character[] {
    return this.chars.filter((c) => c.alive && c.team === team && Math.hypot(c.pos.x - x, c.pos.z - z) <= r + CHAR_RADIUS && (y === undefined || Math.abs(c.pos.y - y) <= dy));
  }

  allyNearPoint(ch: Character, x: number, z: number, range: number): Character | null {
    let best: Character | null = null, bd = Infinity;
    for (const c of this.chars) {
      if (!c.alive || c.team !== ch.team) continue;
      if (Math.hypot(c.pos.x - ch.pos.x, c.pos.z - ch.pos.z) > range) continue;
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** ¿La habilidad ya está disponible para este personaje? (sin progresión: siempre). */
  abilityUnlocked(ch: Character, slot: AbilitySlot) {
    return ch.level >= unlockLevel(this.rules, HEROES[ch.hero].abilities[slot]);
  }

  ultReady(ch: Character) {
    if (!ch.alive) return false;
    return usesUltCharge(this.rules, 'r') ? ch.ult >= 1 : this.abilityUnlocked(ch, 'r') && ch.cds.r <= 0;
  }

  addUlt(ch: Character, amount: number) {
    if (!this.rules.ultCharge || this.phase !== 'play') return;
    ch.ult = Math.min(1, ch.ult + amount);
  }

  /** Centro de la base de un equipo (el promedio de sus puntos de aparición). */
  baseCenter(team: number): V3 {
    const pts = this.terrain.spawns.team[team] ?? [];
    if (!pts.length) return { x: 0, y: 0, z: 0 };
    let x = 0, z = 0;
    for (const p of pts) { x += p.x; z += p.z; }
    return { x: x / pts.length, y: 0, z: z / pts.length };
  }

  /** ¿Está en su base? (refugio: se enfría, forja, reaparición). */
  atBase(ch: Character) {
    const b = this.baseCenter(ch.team);
    return Math.hypot(ch.pos.x - b.x, ch.pos.z - b.z) <= BASE_RADIUS;
  }

  /** Enfría (baja heat) a un héroe: base, cerca de sus torres. */
  coolHeat(ch: Character, amount: number) {
    if (ch.unit === 'hero' && ch.heat > 0) this.setHeat(ch, ch.heat - amount);
  }

  /** Crea una unidad (esbirro, neutral) con cuerpo, física y knockback como un héroe. */
  addUnit(kind: UnitKind, team: number, x: number, z: number, spec: UnitSpec): Character {
    const id = this.nextUnitId++;
    const y = this.groundY(x, z, 0);
    const u = new Character(id, `u${id}`, spec.name, team, 'canto' as HeroId, spec.family, true, { x, y, z });
    u.unit = kind;
    u.hp = u.maxHp = spec.hp;
    u.airJumps = 0;
    u.airDashes = 0;
    const st = baseStats();
    st.speed = spec.speed;
    st.kbTaken = spec.kbTaken;
    st.heatTaken = spec.heatTaken ?? 1;
    st.maxAirJumps = 0;
    st.restitution = 0.2;
    u.stats = st;
    u.input = { seq: 0, mx: 0, mz: 0, ax: x, az: z + 1, b: 0 };
    this.units.push(u);
    this.bodies.push(u);
    this.charById.set(id, u);
    return u;
  }

  /** Mata a una unidad (vida en cero o caída al vacío). */
  killUnit(u: Character, killer: Character | null, fell: boolean) {
    if (!u.alive || u.unit === 'hero') return;
    u.alive = false;
    u.hp = 0;
    this.unitsDirty = true;
    this.emit({ k: 'udie', id: u.id, x: round2(u.pos.x), y: round2(Math.max(u.pos.y, ISLAND_BOTTOM)), z: round2(u.pos.z), tm: u.team, by: killer ? killer.id : -1, fall: fell ? 1 : 0 });
    this.mode.onUnitDeath?.(this, u, killer, fell);
  }

  private cleanupUnits() {
    this.unitsDirty = false;
    for (const u of this.units) if (!u.alive) this.charById.delete(u.id);
    this.units = this.units.filter((u) => u.alive);
    this.bodies = [...this.chars, ...this.units];
  }

  /** Etapa de knockback de una unidad según la vida que le queda (más rota = vuela más). */
  private unitStage(u: Character) {
    const f = u.maxHp > 0 ? u.hp / u.maxHp : 1;
    return f > 0.66 ? 0 : f > 0.33 ? 1 : 2;
  }

  mutationSlots(ch: Character) {
    return MUTATION_LEVELS.filter((l) => ch.level >= l).length;
  }

  modsFor(ch: Character, slot: AbilitySlot): Mods {
    const r = ch.mutations[slot];
    return r ? ROUTE_MODS[r] : NO_MODS;
  }

  // ───────────────────────────── stats y progresión ─────────────────────────────

  recalcStats(ch: Character) {
    const s = baseStats();
    s.speed = HEROES[ch.hero].speed;
    switch (ch.family) {
      case 'stone': s.kbTaken *= 0.8; s.heatTaken *= 1.2; s.speed *= 0.97; break;
      case 'metal': s.kbTaken *= 0.85; s.speed *= 0.97; s.structHp = 1.3; break;
      case 'crystal': s.kbTaken *= 1.1; s.heatDealt *= 1.15; break;
      case 'goo': s.restitution = 0.85; s.slamImmune = true; s.airControl = 1.6; break;
    }
    for (const p of ch.passives) {
      switch (p) {
        case 'coraza': s.heatTaken *= 0.85; break;
        case 'lastre': s.kbTaken *= 0.85; break;
        case 'suela': s.speed *= 1.12; break;
        case 'foco': s.cdMul *= 0.85; break;
        case 'filo': s.heatDealt *= 1.15; break;
        case 'savia': s.regen = true; break;
        case 'resorte': s.maxAirJumps += 1; s.jumpMul *= 1.1; break;
      }
    }
    s.heatDealt *= 1 + 0.03 * (ch.level - 1);
    s.kbTaken *= 1 - 0.02 * (ch.level - 1);
    ch.stats = s;
  }

  addXp(ch: Character, amount: number) {
    if (!this.rules.progression || ch.level >= MAX_LEVEL) return;
    ch.xp += amount * this.rules.xpMul;
    let up = false;
    while (ch.level < MAX_LEVEL && ch.xp >= XP_TABLE[ch.level]) { ch.level++; up = true; }
    if (up) {
      this.recalcStats(ch);
      this.emit({ k: 'lvl', id: ch.id, l: ch.level });
    }
  }

  // ───────────────────────────── bucle principal ─────────────────────────────

  step() {
    this.tick++;
    this.processCommands();

    if (this.phase === 'countdown') {
      this.phaseT -= DT;
      const n = Math.ceil(this.phaseT);
      if (n !== this.lastCount && n > 0) { this.lastCount = n; this.emit({ k: 'count', n }); }
      if (this.phaseT <= 0) {
        this.phase = 'play';
        this.emit({ k: 'count', n: 0 });
      }
    } else if (this.phase === 'play') {
      const before = this.settings.timeLimit - this.elapsed;
      this.elapsed += DT;
      const left = this.settings.timeLimit - this.elapsed;
      if (before > 60 && left <= 60) this.emit({ k: 'msg', tx: '¡Último minuto!' });
      if (before > 30 && left <= 30) this.emit({ k: 'msg', tx: '¡ÚLTIMOS 30 SEGUNDOS!' });
      if (left <= 10 && left > 0 && Math.ceil(before) !== Math.ceil(left)) this.emit({ k: 'final', n: Math.ceil(left) });
    }

    for (const c of this.bodies) { c.ppos.x = c.pos.x; c.ppos.y = c.pos.y; c.ppos.z = c.pos.z; }
    for (const p of this.projectiles) { p.ppos.x = p.pos.x; p.ppos.y = p.pos.y; p.ppos.z = p.pos.z; }

    if (this.scheduled.length && this.phase !== 'end') {
      const due = this.scheduled.filter((s) => s.at <= this.tick);
      if (due.length) {
        this.scheduled = this.scheduled.filter((s) => s.at > this.tick);
        for (const s of due) s.fn();
      }
    }

    if (this.obstaclesDirty) this.rebuildObstacles();
    this.mode.preTick?.(this, DT);
    if (this.unitsDirty) this.cleanupUnits();
    for (const c of this.chars) this.updateChar(c);
    for (const u of this.units) this.updateUnit(u);
    this.bodyCollisions();
    if (this.phase !== 'end') {
      // Terminada la partida no se pelea más: solo física (que caigan al piso) y festejos en el cliente.
      this.updateProjectiles();
      this.updateZones();
      this.updateStructures();
      this.updateDestructibles();
      this.updateTiles();
      this.updatePickups();
    }
    if (this.obstaclesDirty) this.rebuildObstacles();

    this.mode.tick(this, DT);
    if (this.unitsDirty) this.cleanupUnits();
    if (this.phase === 'play') {
      const r = this.mode.result(this);
      if (r) {
        this.result = r;
        this.phase = 'end';
        this.freezeForEnd();
        this.emit({ k: 'msg', tx: r.draw ? '¡Empate!' : '¡Fin de la partida!' });
      }
    }
  }

  /** Fin de partida: se apagan proyectiles, zonas, lo programado y las acciones en curso. */
  private freezeForEnd() {
    this.projectiles = [];
    this.zones = [];
    this.telegraphs = [];
    this.scheduled = [];
    for (const c of this.bodies) {
      c.action = null;
      c.charging = false;
      c.pushCharge = 0;
      c.repairT = 0;
      c.recallT = 0;
      c.buffered = null;
      c.invuln = Math.max(c.invuln, 999);
    }
  }

  private processCommands() {
    if (!this.commands.length) return;
    const cmds = this.commands;
    this.commands = [];
    for (const { pid, cmd } of cmds) {
      const ch = this.charByPid.get(pid);
      if (!ch || !this.rules.crafting) continue;
      if (this.rules.forgeAtBase && ch.alive && !this.atBase(ch) && cmd.c !== 'sell') {
        this.deny(ch, this.rules.recall ? 'La fragua está en tu base (B para volver)' : 'La fragua está en tu base');
        continue;
      }
      if (cmd.c === 'craft') this.craft(ch, cmd.id);
      else if (cmd.c === 'sell') this.sell(ch, cmd.id);
      else if (cmd.c === 'mutate') this.mutate(ch, cmd.slot, cmd.route);
    }
  }

  craft(ch: Character, id: string): boolean {
    const it = ITEM_BY_ID[id];
    if (!it) return false;
    if (ch.passives.includes(id) || ch.actives.includes(id)) return this.deny(ch, 'Ya lo tenés');
    if (!canAfford(ch.mats, it.cost)) return this.deny(ch, 'Faltan materiales');
    if (it.kind === 'passive') {
      if (ch.passives.length >= 3) return this.deny(ch, 'Slots pasivos llenos');
      ch.passives.push(id);
    } else {
      const free = ch.actives.indexOf(null);
      if (free < 0) return this.deny(ch, 'Slots activos llenos');
      ch.actives[free] = id;
      ch.cds[ITEM_SLOT[free]] = 0;
    }
    pay(ch.mats, it.cost);
    this.recalcStats(ch);
    this.emit({ k: 'craft', id: ch.id, w: id });
    return true;
  }

  sell(ch: Character, id: string): boolean {
    const it = ITEM_BY_ID[id];
    if (!it) return false;
    const pi = ch.passives.indexOf(id);
    const ai = ch.actives.indexOf(id);
    if (pi >= 0) ch.passives.splice(pi, 1);
    else if (ai >= 0) ch.actives[ai] = null;
    else return false;
    refund(ch.mats, it.cost, 0.5);
    this.recalcStats(ch);
    return true;
  }

  mutate(ch: Character, slot: AbilitySlot, route: Route): boolean {
    if (!ROUTE_MODS[route]) return false;
    const used = Object.keys(ch.mutations).length;
    if (ch.mutations[slot]) return this.deny(ch, 'Esa habilidad ya mutó');
    if (used >= this.mutationSlots(ch)) return this.deny(ch, 'Necesitás más nivel');
    const def = HEROES[ch.hero].abilities[slot];
    if (ch.level < def.unlock) return this.deny(ch, 'Habilidad bloqueada');
    if (ch.mats[ch.family] < MUTATION_COST) return this.deny(ch, 'Faltan materiales');
    ch.mats[ch.family] -= MUTATION_COST;
    ch.mutations[slot] = route;
    this.emit({ k: 'craft', id: ch.id, w: `mut:${slot}:${route}` });
    return true;
  }

  private deny(ch: Character, why: string): false {
    this.emit({ k: 'deny', id: ch.id, w: why });
    return false;
  }

  // ───────────────────────────── personajes ─────────────────────────────

  spawnPoint(ch: Character, idx: number): V3 {
    const t = this.terrain;
    const list = this.settings.teams === 'ffa' ? t.spawns.ffa : t.spawns.team[ch.team] ?? t.spawns.ffa;
    const pts = list.length ? list : [{ x: 0, y: 0, z: 0 }];
    if (this.settings.teams === 'ffa') return { ...pts[(ch.id - 1) % pts.length] };
    return { ...pts[idx % pts.length] };
  }

  private respawnPoint(ch: Character): V3 {
    const list = this.settings.teams === 'ffa' ? this.terrain.spawns.ffa : this.terrain.spawns.team[ch.team];
    let best = list[0] ?? { x: 0, y: 0, z: 0 }, bestScore = -Infinity;
    for (const p of list) {
      if (this.cw.groundAt(p.x, p.z, 10) === -Infinity) continue;
      let near = Infinity;
      for (const c of this.chars) {
        if (!c.alive || c.team === ch.team) continue;
        near = Math.min(near, Math.hypot(c.pos.x - p.x, c.pos.z - p.z));
      }
      const score = near + this.rng.next();
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return { x: best.x, y: this.groundY(best.x, best.z, 0), z: best.z };
  }

  private respawn(ch: Character) {
    const p = this.respawnPoint(ch);
    ch.alive = true;
    ch.pos = { x: p.x, y: p.y + 5, z: p.z };
    ch.ppos = { ...ch.pos };
    ch.vel = { x: 0, y: -2, z: 0 };
    ch.grounded = false;
    ch.heat = 0;
    ch.stage = 0;
    ch.tumble = ch.hitstun = ch.stun = 0;
    ch.invuln = SPAWN_INVULN;
    ch.shield = 0;
    ch.dashT = 0;
    ch.dashCd = 0;
    ch.crystalBurstUsed = false;
    ch.action = null;
    ch.lastHits.clear();
    ch.launcher = -1;
    this.emit({ k: 'spawn', id: ch.id });
  }

  charSpeed(ch: Character) {
    let s = ch.stats.speed;
    if (ch.slowT > 0) s *= 1 - ch.slowAmt;
    if (ch.hasteT > 0) s *= 1 + ch.hasteAmt;
    if (ch.action && !ch.action.lock) s *= ch.action.slow;
    return s;
  }

  private updateChar(ch: Character) {
    if (!ch.alive) {
      if (!ch.eliminated && this.phase !== 'end') {
        ch.respawnT -= DT;
        if (ch.respawnT <= 0 && this.mode.canRespawn(this, ch)) this.respawn(ch);
      }
      ch.prevB = ch.input.b;
      return;
    }
    const inp = ch.input;
    const pb = ch.prevB;

    ch.invuln = Math.max(0, ch.invuln - DT);
    ch.kbImmune = Math.max(0, ch.kbImmune - DT);
    ch.refractT = Math.max(0, ch.refractT - DT);
    if (ch.shieldT > 0) { ch.shieldT -= DT; if (ch.shieldT <= 0) ch.shield = 0; }
    if (ch.slowT > 0) { ch.slowT -= DT; if (ch.slowT <= 0) ch.slowAmt = 0; }
    if (ch.hasteT > 0) { ch.hasteT -= DT; if (ch.hasteT <= 0) ch.hasteAmt = 0; }
    if (ch.armorT > 0) { ch.armorT -= DT; if (ch.armorT <= 0) ch.armorAmt = 0; }
    for (const k in ch.cds) { const s = k as Slot; if (ch.cds[s] > 0) ch.cds[s] = Math.max(0, ch.cds[s] - DT); }
    for (const [id, t] of ch.bodyHits) if (this.tick - t > 30) ch.bodyHits.delete(id);

    if (this.phase === 'play') {
      this.addXp(ch, XP_TRICKLE * DT);
      this.addUlt(ch, ULT_TRICKLE * DT);
      if (ch.stats.regen && ch.heat > 0 && this.tick - ch.lastHitTick > 4 * TICK_RATE) this.setHeat(ch, ch.heat - 2.5 * DT);
    }

    if (ch.action) this.updateAction(ch);

    const playing = this.phase === 'play';
    const act = playing && canAct(ch) && !(ch.action && ch.action.noCast);
    if (act) {
      // Las habilidades salen cuando llega el bit (flanco): el cliente ya resolvió el apuntado
      // (tecla arma, clic izquierdo lanza) y manda un pulso de un tick con el cursor donde se lanzó.
      for (const slot of ['q', 'e', 'f', 'r'] as AbilitySlot[]) {
        if (pressed(inp.b, pb, ABILITY_BTN[slot])) this.tryAbility(ch, slot, true);
      }
      if (ch.buffered) {
        ch.buffered.t -= DT;
        if (ch.buffered.t <= 0) ch.buffered = null;
        else if (ch.cds[ch.buffered.slot] <= 0) {
          const s = ch.buffered.slot;
          ch.buffered = null;
          if (s === 'q' || s === 'e' || s === 'f' || s === 'r') this.tryAbility(ch, s, false);
        }
      }
      if (this.rules.crafting) for (let i = 0; i < 3; i++) if (pressed(inp.b, pb, ITEM_BTN[i])) this.tryItem(ch, i);

      // Empujón: mantener carga, soltar empuja (D-0028).
      if (held(inp.b, BTN.PUSH) && ch.cds.push <= 0) {
        ch.charging = true;
        ch.pushCharge = Math.min(PUSH_MAX_CHARGE, ch.pushCharge + DT);
      }
      if (ch.charging && released(inp.b, pb, BTN.PUSH)) this.doPush(ch);

      if (held(inp.b, BTN.BASIC) && ch.cds.basic <= 0 && !ch.charging && !ch.action) {
        const b = HEROES[ch.hero].basic;
        b.cast(this, ch, inp.ax, inp.az);
        ch.cds.basic = b.cd;
        ch.cdMax.basic = b.cd;
      }

      if (this.rules.repair && held(inp.b, BTN.REPAIR) && ch.heat > 0 && ch.mats[ch.family] >= REPAIR_COST) {
        ch.repairT += DT;
        if (ch.repairT >= REPAIR_TIME) {
          ch.repairT = 0;
          ch.mats[ch.family] -= REPAIR_COST;
          this.setHeat(ch, ch.heat - REPAIR_AMOUNT);
          this.emit({ k: 'repair', id: ch.id });
        }
      } else ch.repairT = 0;
    } else {
      ch.charging = false;
      ch.pushCharge = 0;
      ch.repairT = 0;
    }
    if (this.rules.recall) this.updateRecall(ch, act);

    if (ch.action && ch.action.direct) {
      ch.prevB = inp.b;
      return;
    }

    const mp = this.mp;
    mp.speed = this.charSpeed(ch);
    mp.lock = !playing || !!(ch.action && ch.action.lock);
    mp.noGravity = !!(ch.action && ch.action.noGravity);
    mp.airControl = ch.stats.airControl;
    mp.restitution = ch.stats.restitution;
    mp.maxAirJumps = ch.stats.maxAirJumps;
    mp.jumpMul = ch.stats.jumpMul;
    mp.dash = this.rules.dash && playing;
    if (!playing) { ch.vel.x = 0; ch.vel.z = 0; }
    const wasTumble = ch.tumble > 0;
    const out = this.mo;
    stepMove(ch, inp, mp, this.cw, DT, out);

    if (out.jumped || out.airJumped) this.emit({ k: 'jump', id: ch.id, air: out.airJumped ? 1 : 0 });
    if (out.dashed) this.emit({ k: 'dash', id: ch.id, dx: Math.round(ch.dashX * 100) / 100, dz: Math.round(ch.dashZ * 100) / 100 });
    if (out.landed > 8) {
      this.emit({ k: 'land', id: ch.id, p: out.landed });
      if (wasTumble && out.landed > 14) this.damageTilesAround(ch.pos.x, ch.pos.z, 1.0, out.landed * 1.2);
    }
    for (const h of out.wallHits) this.onWallHit(ch, h.speed, h.obstacle, h.x, h.y, h.z, h.nx, h.nz, wasTumble);

    if (ch.pos.y < KILL_Y) {
      if (this.phase === 'end') { ch.pos.y = KILL_Y; ch.vel.y = 0; }
      else this.die(ch);
    } else if (ch.lethalAt >= 0 && ch.grounded && ch.tumble <= 0) {
      // Se salvó de un golpe que lo iba a sacar: ¡salvada épica!
      ch.lethalAt = -1;
      ch.saves++;
      this.emit({ k: 'save', id: ch.id });
    }
  }

  // ───────────────────────────── volver a la base (B) ─────────────────────────────

  /** Canalizar RECALL_TIME segundos quieto; moverse, atacar, lanzar o recibir un golpe lo corta. */
  private updateRecall(ch: Character, act: boolean) {
    const inp = ch.input;
    if (ch.recallT > 0) {
      if (!act || this.phase !== 'play' || inp.mx !== 0 || inp.mz !== 0 || (inp.b & ~BTN.RECALL) !== 0 || ch.tumble > 0) {
        this.cancelRecall(ch);
        return;
      }
      ch.recallT += DT;
      if (ch.recallT >= RECALL_TIME) {
        ch.recallT = 0;
        const p = this.respawnPoint(ch);
        this.emit({ k: 'recall', id: ch.id, s: 2, x: round2(ch.pos.x), z: round2(ch.pos.z) });
        ch.pos = { x: p.x, y: p.y, z: p.z };
        ch.ppos = { ...ch.pos };
        ch.vel = { x: 0, y: 0, z: 0 };
        ch.grounded = true;
      }
      return;
    }
    if (!act || this.phase !== 'play' || !pressed(inp.b, ch.prevB, BTN.RECALL)) return;
    if (this.atBase(ch)) { this.deny(ch, 'Ya estás en tu base'); return; }
    if (inp.mx !== 0 || inp.mz !== 0 || !ch.grounded) { this.deny(ch, `Para volver a la base quedate quieto ${RECALL_TIME} s`); return; }
    ch.recallT = DT;
    this.emit({ k: 'recall', id: ch.id, s: 1, x: round2(ch.pos.x), z: round2(ch.pos.z) });
  }

  private cancelRecall(ch: Character) {
    if (ch.recallT <= 0) return;
    ch.recallT = 0;
    this.emit({ k: 'recall', id: ch.id, s: 0, x: round2(ch.pos.x), z: round2(ch.pos.z) });
  }

  // ───────────────────────────── unidades (esbirros, neutrales) ─────────────────────────────

  /** Física y estados de una unidad. Su input (hacia dónde caminar) lo pone la IA del modo en preTick. */
  private updateUnit(u: Character) {
    if (!u.alive) return;
    u.invuln = Math.max(0, u.invuln - DT);
    u.kbImmune = Math.max(0, u.kbImmune - DT);
    if (u.slowT > 0) { u.slowT -= DT; if (u.slowT <= 0) u.slowAmt = 0; }
    if (u.hasteT > 0) { u.hasteT -= DT; if (u.hasteT <= 0) u.hasteAmt = 0; }
    if (u.armorT > 0) { u.armorT -= DT; if (u.armorT <= 0) u.armorAmt = 0; }
    if (u.cds.basic > 0) u.cds.basic = Math.max(0, u.cds.basic - DT);
    for (const [id, t] of u.bodyHits) if (this.tick - t > 30) u.bodyHits.delete(id);
    const mp = this.mp;
    mp.speed = this.charSpeed(u);
    mp.lock = this.phase !== 'play';
    if (mp.lock && u.tumble <= 0) { u.vel.x = 0; u.vel.z = 0; }
    mp.noGravity = false;
    mp.airControl = 0.4;
    mp.restitution = u.stats.restitution;
    mp.maxAirJumps = 0;
    mp.jumpMul = 1;
    mp.dash = false;
    const wasTumble = u.tumble > 0;
    u.input.b = 0;
    stepMove(u, u.input, mp, this.cw, DT, this.mo);
    for (const h of this.mo.wallHits) {
      if (!wasTumble || h.speed < WALL_SLAM_SPEED) continue;
      const launcher = this.recentLauncher(u);
      if (h.obstacle) this.damageObstacle(h.obstacle, h.speed * 1.5, launcher);
      this.applyHeat(u, launcher, (h.speed - WALL_SLAM_SPEED) * 0.9 + 3);
      if (!u.alive) return;
    }
    if (u.pos.y < KILL_Y) {
      if (this.phase === 'end') { u.pos.y = KILL_Y; u.vel.y = 0; }
      else this.killUnit(u, this.recentLauncher(u), true);
    }
  }

  /** Quién lanzó a este cuerpo hace poco (para dar crédito si cae o choca). */
  private recentLauncher(c: Character): Character | null {
    const l = this.charById.get(c.launcher);
    if (!l) return null;
    const t = c.lastHits.get(l.id);
    return t !== undefined && this.tick - t <= KILL_CREDIT_TIME * TICK_RATE ? l : null;
  }

  private onWallHit(ch: Character, speed: number, ob: Obstacle | null, x: number, y: number, z: number, nx: number, nz: number, wasTumble: boolean) {
    if (ch.action && ch.action.kind === 'roll') {
      // Rebote de Gloop: refleja la dirección.
      const d = ch.action.data;
      if (nx !== 0) d.dx = Math.abs(d.dx) * Math.sign(nx);
      if (nz !== 0) d.dz = Math.abs(d.dz) * Math.sign(nz);
      if (ob) this.damageObstacle(ob, 15, ch);
      this.emit({ k: 'bounce', id: ch.id });
      return;
    }
    if (ch.action && ch.action.kind === 'dash') {
      if (ob) this.damageObstacle(ob, ch.action.data.destruct ?? 20, ch);
      this.endAction(ch);
      return;
    }
    if (!wasTumble || speed < WALL_SLAM_SPEED) return;
    const launcher = this.charById.get(ch.launcher) ?? null;
    if (ob) {
      const destroyed = this.damageObstacle(ob, speed * 2.2, launcher);
      if (destroyed) {
        // Atravesó la cobertura: sigue volando (billar contra el mapa).
        if (nx !== 0) ch.vel.x = -Math.sign(nx) * speed * 0.6;
        if (nz !== 0) ch.vel.z = -Math.sign(nz) * speed * 0.6;
        this.emit({ k: 'body', id: ch.id, x, y: y + 0.7, z, a: launcher ? launcher.id : -1 });
        return;
      }
    }
    if (ch.stats.slamImmune) {
      this.emit({ k: 'bounce', id: ch.id });
      return;
    }
    const heat = (speed - WALL_SLAM_SPEED) * 0.9 + 3;
    const applied = this.applyHeat(ch, launcher, heat);
    ch.stun = Math.max(ch.stun, 0.25);
    this.emit({ k: 'slam', id: ch.id, x, y: y + 0.7, z, p: speed, h: Math.round(applied) });
  }

  private bodyCollisions() {
    const cs = this.bodies;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d >= CHAR_RADIUS * 2 || Math.abs(a.pos.y - b.pos.y) > 1.2) continue;
        const aFast = a.tumble > 0 && Math.hypot(a.vel.x, a.vel.z) > BODY_HIT_SPEED;
        const bFast = b.tumble > 0 && Math.hypot(b.vel.x, b.vel.z) > BODY_HIT_SPEED;
        if (aFast && !a.bodyHits.has(b.id)) this.bodyHit(a, b);
        else if (bFast && !b.bodyHits.has(a.id)) this.bodyHit(b, a);
        // Separación suave.
        const push = (CHAR_RADIUS * 2 - d) / 2;
        const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0;
        this.nudge(a, -ux * push, -uz * push);
        this.nudge(b, ux * push, uz * push);
      }
    }
  }

  private nudge(c: Character, dx: number, dz: number) {
    if (c.action && c.action.direct) return;
    if (!this.cw.blockAt(c.pos.x + dx, c.pos.z + dz, CHAR_RADIUS, c.pos.y)) { c.pos.x += dx; c.pos.z += dz; }
  }

  /** El cuerpo lanzado es un proyectil (D-0016): le pega a quien choca. */
  private bodyHit(a: Character, b: Character) {
    a.bodyHits.set(b.id, this.tick);
    const launcher = this.charById.get(a.launcher) ?? null;
    if (launcher && launcher.team === b.team) return;
    if (!launcher && a.team === b.team) return;
    const sp = Math.hypot(a.vel.x, a.vel.z);
    const d = norm2(a.vel.x, a.vel.z);
    if (this.hit(b, launcher, { heat: sp * 0.35, kb: sp * 0.75, dirX: d.x, dirZ: d.z, fx: 'body' }) && launcher) launcher.billiards++;
    a.vel.x *= 0.55;
    a.vel.z *= 0.55;
    this.emit({ k: 'body', id: b.id, x: (a.pos.x + b.pos.x) / 2, y: b.pos.y + 0.8, z: (a.pos.z + b.pos.z) / 2, a: launcher ? launcher.id : -1 });
  }

  private die(ch: Character) {
    if (!ch.alive) return;
    ch.alive = false;
    ch.deaths++;
    ch.respawnT = this.mode.respawnTime?.(this, ch) ?? RESPAWN_TIME;
    ch.recallT = 0;
    ch.action = null;
    ch.charging = false;
    ch.pushCharge = 0;
    ch.tumble = 0;
    ch.vel = { x: 0, y: 0, z: 0 };
    const window = KILL_CREDIT_TIME * TICK_RATE;
    let killer: Character | null = null, bestT = -Infinity;
    const assists: number[] = [];
    for (const [id, t] of ch.lastHits) {
      if (this.tick - t > window) continue;
      const c = this.charById.get(id);
      if (!c || c.team === ch.team) continue;
      if (t > bestT) { bestT = t; killer = c; }
    }
    for (const [id, t] of ch.lastHits) {
      if (this.tick - t > window || !killer || id === killer.id) continue;
      const c = this.charById.get(id);
      if (!c || c.team === ch.team) continue;
      c.assists++;
      assists.push(c.id);
      this.addXp(c, XP_ASSIST);
    }
    if (killer) {
      killer.kills++;
      this.addXp(killer, XP_KILL);
    }
    ch.lethalAt = -1;
    if (this.phase === 'play') this.mode.onDeath(this, ch, killer);
    this.emit({ k: 'ring', id: ch.id, x: ch.pos.x, z: ch.pos.z, tm: ch.team, last: ch.eliminated ? 1 : 0 });
    this.emit({ k: 'feed', a: killer ? killer.id : -1, v: ch.id, as: assists });
    ch.pos.y = KILL_Y;
  }

  // ───────────────────────────── combate ─────────────────────────────

  private setHeat(ch: Character, heat: number) {
    ch.heat = Math.max(0, Math.min(HEAT_MAX, heat));
    let s = 0;
    for (let i = STAGE_AT.length - 1; i >= 0; i--) if (ch.heat >= STAGE_AT[i]) { s = i; break; }
    if (s !== ch.stage) {
      const up = s > ch.stage;
      ch.stage = s;
      this.emit({ k: 'stage', id: ch.id, s });
      if (up && s === 3 && ch.family === 'crystal' && !ch.crystalBurstUsed) {
        ch.crystalBurstUsed = true;
        this.schedule(0.05, () => {
          if (!ch.alive) return;
          this.emit({ k: 'burst', id: ch.id });
          this.blast(ch, ch.team, ch.pos.x, ch.pos.y + 0.7, ch.pos.z, { radius: 3.6, heat: 8, kb: 16, up: 2, destruct: 30, fx: 'crystal' }, NO_MODS);
        });
      }
    }
  }

  /** Suma heat sin knockback (paredes, daño en el tiempo). */
  /** Daño de héroe a unidad (el modo lo sube para que limpiar oleadas no sea eterno). */
  heroVsUnit = 1;

  private damageUnit(u: Character, attacker: Character | null, amount: number) {
    if (attacker && attacker.team === u.team) return 0;
    let dmg = amount * u.stats.heatTaken * (u.armorT > 0 ? 1 - u.armorAmt : 1);
    if (attacker && attacker.unit === 'hero') dmg *= attacker.stats.heatDealt * this.heroVsUnit;
    u.hp -= dmg;
    u.lastHitTick = this.tick;
    if (attacker) u.lastHits.set(attacker.id, this.tick);
    if (u.hp <= 0) this.killUnit(u, attacker, false);
    return dmg;
  }

  private applyHeat(t: Character, attacker: Character | null, amount: number) {
    if (!t.alive || t.invuln > 0) return 0;
    if (t.unit !== 'hero') return this.damageUnit(t, attacker, amount);
    if (t.recallT > 0) this.cancelRecall(t);
    let heat = amount * t.stats.heatTaken * (t.armorT > 0 ? 1 - t.armorAmt : 1);
    if (attacker && attacker.team !== t.team && attacker.unit === 'hero') heat *= attacker.stats.heatDealt;
    if (t.shield > 0) {
      const a = Math.min(t.shield, heat);
      t.shield -= a;
      heat -= a;
    }
    this.setHeat(t, t.heat + heat);
    t.lastHitTick = this.tick;
    if (attacker && attacker.team !== t.team) {
      if (attacker.unit === 'hero') {
        t.lastHits.set(attacker.id, this.tick);
        attacker.heatDealt += heat;
        attacker.hitHeroTick = this.tick;
        attacker.hitHeroVictim = t.id;
        this.addXp(attacker, heat * XP_PER_HEAT);
        this.addUlt(attacker, heat * ULT_PER_HEAT);
      }
      // Esbirros y torres no se llevan el crédito del ring-out: queda para el último héroe que pegó.
    }
    return heat;
  }

  dot(t: Character, attacker: Character | null, amount: number) {
    this.applyHeat(t, attacker, amount);
  }

  hit(t: Character, attacker: Character | null, spec: HitSpec): boolean {
    if (!t.alive || t.invuln > 0) return false;
    if (attacker && attacker !== t && attacker.team === t.team) return false;
    const hadShield = t.shield > 0;
    const applied = this.applyHeat(t, attacker, spec.heat);
    const isUnit = t.unit !== 'hero';
    const stage = isUnit ? this.unitStage(t) : t.stage;
    let lethal = 0;
    if (!t.alive) {
      // La unidad murió con este golpe: solo el efecto.
      this.emit({ k: 'hit', x: t.pos.x, y: t.pos.y + 0.8, z: t.pos.z, p: 0, f: spec.fx ?? t.family, id: t.id, a: attacker ? attacker.id : -1, h: Math.round(applied), st: stage, l: 0, dx: 0, dz: 0 });
      return true;
    }
    let force = spec.kb * STAGE_KB[stage] * (isUnit ? 1 : 1 + 0.003 * (t.heat - STAGE_AT[stage])) * t.stats.kbTaken;
    if (hadShield) force *= 0.6;
    if (t.kbImmune > 0) force = 0;
    let dx = spec.dirX, dz = spec.dirZ;
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) { const f = attacker ? dirOf(attacker.facing) : { x: 0, z: 1 }; dx = f.x; dz = f.z; } else { dx /= l; dz /= l; }

    const interrupt = () => {
      if (t.action && !t.action.direct) t.action = null;
      t.charging = false;
      t.pushCharge = 0;
      t.repairT = 0;
    };

    if (force >= LAUNCH_THRESHOLD && !spec.noLaunch) {
      t.vel.x = dx * force;
      t.vel.z = dz * force;
      t.vel.y = Math.max(t.vel.y, force * 0.2 + 2.5 + (spec.up ?? 0));
      t.grounded = false;
      t.tumble = 3;
      t.hitstun = 0.15 + force * 0.012;
      t.launcher = attacker ? attacker.id : -1;
      t.bodyHits.clear();
      interrupt();
      if (attacker) attacker.bestLaunch = Math.max(attacker.bestLaunch, force);
      if (!isUnit && this.predictLethal(t)) {
        lethal = 1;
        t.lethalAt = this.tick;
        if (attacker) attacker.lethals++;
      }
    } else if (force > 0) {
      t.vel.x += dx * force * 1.1;
      t.vel.z += dz * force * 1.1;
      t.hitSlide = 0.22;
      if (attacker) t.launcher = attacker.id;
    }
    if (spec.stun && spec.stun > 0 && !(t.action && t.action.direct)) {
      t.stun = Math.max(t.stun, spec.stun);
      interrupt();
    }
    if (spec.slow) {
      t.slowAmt = Math.max(t.slowAmt, spec.slow[0]);
      t.slowT = Math.max(t.slowT, spec.slow[1]);
    }
    this.emit({
      k: 'hit', x: t.pos.x, y: t.pos.y + 0.8, z: t.pos.z, p: Math.round(force * 10) / 10, f: spec.fx ?? t.family, id: t.id,
      a: attacker ? attacker.id : -1, h: Math.round(applied), st: t.stage, l: lethal, dx: Math.round(dx * 10) / 10, dz: Math.round(dz * 10) / 10,
    });
    return true;
  }

  /** ¿Este lanzamiento termina fuera del mapa si la víctima no hace nada? (para el "zoom de KO"). */
  private predictLethal(t: Character): boolean {
    const s = {
      pos: { ...t.pos }, vel: { ...t.vel }, facing: t.facing, grounded: false, airJumps: 0, coyote: 0, prevB: 0,
      tumble: t.tumble, hitstun: t.hitstun, stun: t.stun, hitSlide: 0, ...DASH_IDLE, airDashes: 0,
    };
    const mp = defaultMoveParams();
    mp.speed = 0;
    mp.airControl = t.stats.airControl;
    mp.restitution = t.stats.restitution;
    mp.maxAirJumps = 0;
    const out = newMoveOut();
    const inp = { seq: 0, mx: 0, mz: 0, ax: t.pos.x, az: t.pos.z + 1, b: 0 };
    for (let i = 0; i < 200; i++) {
      stepMove(s, inp, mp, this.cw, DT, out);
      if (s.pos.y < KILL_Y) return true;
      if (s.grounded && s.tumble <= 0) return false;
    }
    return false;
  }

  meleeArc(ch: Character, o: MeleeSpec, _m: Mods): number {
    const f = dirOf(ch.facing);
    const half = (o.angle * Math.PI) / 360;
    let hits = 0;
    for (const t of this.bodies) {
      if (t === ch || !t.alive || t.team === ch.team) continue;
      const dx = t.pos.x - ch.pos.x, dz = t.pos.z - ch.pos.z;
      const d = Math.hypot(dx, dz);
      if (d - CHAR_RADIUS > o.range || Math.abs(t.pos.y - ch.pos.y) > 1.6) continue;
      if (d > 0.4) {
        const cos = (dx * f.x + dz * f.z) / d;
        const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
        if (ang > half + Math.atan2(CHAR_RADIUS, d)) continue;
      }
      const kd = norm2(f.x * 0.55 + (d > 0.01 ? dx / d : f.x) * 0.45, f.z * 0.55 + (d > 0.01 ? dz / d : f.z) * 0.45);
      if (this.hit(t, ch, { heat: o.heat, kb: o.kb, dirX: kd.x, dirZ: kd.z, up: o.up, stun: o.stun, slow: o.slow, fx: o.fx })) hits++;
    }
    if (o.destruct) {
      for (const ob of [...this.cw.obstacles]) {
        const cx = (ob.minX + ob.maxX) / 2, cz = (ob.minZ + ob.maxZ) / 2;
        const dx = cx - ch.pos.x, dz = cz - ch.pos.z;
        const d = Math.hypot(dx, dz);
        const rad = (ob.maxX - ob.minX) / 2;
        if (d - rad > o.range || ob.top < ch.pos.y - 0.2 || ob.base > ch.pos.y + 1.6) continue;
        if (d > 0.4) {
          const ang = Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dz * f.z) / d)));
          if (ang > half + Math.atan2(rad, d)) continue;
        }
        this.damageObstacle(ob, o.destruct, ch);
      }
    }
    if (o.tile) {
      const t = this.terrain;
      for (let fi = 0; fi < t.fragile.length; fi++) {
        const ci = t.fragile[fi];
        const b = t.cellBounds(ci);
        const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
        const dx = cx - ch.pos.x, dz = cz - ch.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > o.range + 0.6) continue;
        if (d > 1) {
          const ang = Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dz * f.z) / d)));
          if (ang > half + 0.3) continue;
        }
        this.damageTile(fi, o.tile);
      }
    }
    this.emit({ k: 'swing', id: ch.id, r: o.range, a: o.angle, c: o.fx });
    return hits;
  }

  blast(owner: Character | null, team: number, x: number, y: number, z: number, s: BlastSpec, _m: Mods): number {
    let hits = 0;
    for (const t of this.bodies) {
      if (!t.alive || t.team === team) continue;
      const dx = t.pos.x - x, dz = t.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d > s.radius + CHAR_RADIUS || Math.abs(t.pos.y + 0.7 - y) > s.radius * 0.6 + 1.2) continue;
      const u = d > 0.2 ? { x: dx / d, z: dz / d } : owner ? dirOf(owner.facing) : { x: 0, z: 1 };
      const fall = 1 - 0.3 * Math.min(1, d / s.radius);
      if (this.hit(t, owner, { heat: s.heat * fall, kb: s.kb * fall, dirX: u.x, dirZ: u.z, up: s.up, stun: s.stun, slow: s.slow, fx: s.fx })) hits++;
    }
    if (s.destruct) {
      for (const ob of [...this.cw.obstacles]) {
        const cx = (ob.minX + ob.maxX) / 2, cz = (ob.minZ + ob.maxZ) / 2;
        if (Math.hypot(cx - x, cz - z) <= s.radius + 0.6 && ob.top > y - s.radius && ob.base < y + s.radius) this.damageObstacle(ob, s.destruct, owner);
      }
    }
    if (s.tile) this.damageTilesAround(x, z, s.tileRadius ?? s.radius * 0.6, s.tile, y);
    this.emit({ k: 'boom', x, y, z, r: s.radius, c: s.fx });
    return hits;
  }

  private doPush(ch: Character) {
    const c = Math.min(1, ch.pushCharge / PUSH_MAX_CHARGE);
    ch.charging = false;
    ch.pushCharge = 0;
    ch.cds.push = PUSH_CD;
    ch.cdMax.push = PUSH_CD;
    this.meleeArc(ch, { range: 1.7 + 0.8 * c, angle: 95, heat: 3, kb: 8 + 14 * c, up: c * 1.5, destruct: 6 + 10 * c, fx: c > 0.6 ? 'pushbig' : 'push' }, NO_MODS);
  }

  private tryAbility(ch: Character, slot: AbilitySlot, fresh: boolean): boolean {
    const def = HEROES[ch.hero].abilities[slot];
    if (!this.abilityUnlocked(ch, slot)) {
      if (fresh) this.deny(ch, `${def.name}: se desbloquea en nivel ${def.unlock}`);
      return false;
    }
    const ultCharge = usesUltCharge(this.rules, slot);
    if (ultCharge && ch.ult < 1) {
      if (fresh) this.deny(ch, `${def.name}: la ulti se carga pegando (${Math.floor(ch.ult * 100)}%)`);
      return false;
    }
    if (ch.cds[slot] > 0) {
      if (fresh && ch.cds[slot] < 0.3) ch.buffered = { slot, t: 0.3 };
      return false;
    }
    if (ch.action && (ch.action.noCast || ch.action.lock)) {
      if (fresh) ch.buffered = { slot, t: 0.3 };
      return false;
    }
    const m = this.modsFor(ch, slot);
    const ok = def.cast(this, ch, ch.input.ax, ch.input.az, m);
    if (ok === false) return false;
    const cd = ultCharge ? 0.5 : def.cd * m.cd * ch.stats.cdMul;
    if (ultCharge) ch.ult = 0;
    ch.cds[slot] = cd;
    ch.cdMax[slot] = cd;
    ch.charging = false;
    ch.pushCharge = 0;
    if (m.support) this.supportPulse(ch);
    this.emit({ k: 'cast', id: ch.id, s: slot });
    return true;
  }

  private supportPulse(ch: Character) {
    for (const a of this.alliesInRadius(ch.team, ch.pos.x, ch.pos.z, SUPPORT_RADIUS)) this.giveShield(a, SUPPORT_SHIELD, 3);
  }

  private tryItem(ch: Character, i: number) {
    const id = ch.actives[i];
    if (!id) return;
    const slot = ITEM_SLOT[i];
    if (ch.cds[slot] > 0) return;
    const it = ITEM_BY_ID[id];
    const ax = ch.input.ax, az = ch.input.az;
    let ok = true;
    switch (id) {
      case 'parpadeo': ok = this.blink(ch, ax, az, 6); break;
      case 'ancla':
        ch.kbImmune = Math.max(ch.kbImmune, 2.5);
        ch.armorT = 2.5;
        ch.armorAmt = 0.3;
        this.emit({ k: 'shield', id: ch.id });
        break;
      case 'onda':
        this.blast(ch, ch.team, ch.pos.x, ch.pos.y + 0.6, ch.pos.z, { radius: 3.5, heat: 5, kb: 13, up: 1, destruct: 20, fx: 'wave' }, NO_MODS);
        break;
      case 'muralla': {
        const a = this.clampAim(ch, ax, az, 8);
        this.buildWall(ch, 'stonewall', 'stone', a.x, a.z, a.dx, a.dz, 80, 8, 3);
        break;
      }
      case 'garfio': {
        const a = this.clampAim(ch, ax, az, 10);
        this.zip(ch, a.x, a.z, 24, 0.7);
        break;
      }
      case 'frasco': {
        const a = this.clampAim(ch, ax, az, 9);
        this.lob(ch, 'goolob', a.x, a.z, 0.4, (x, y, z) => {
          this.addZone(ch, 'puddle', x, y, z, 2.5, 3, (zn) => {
            for (const e of this.enemiesInRadius(ch.team, zn.x, zn.z, zn.r, zn.y)) {
              e.slowT = Math.max(e.slowT, 0.3);
              e.slowAmt = Math.max(e.slowAmt, 0.5);
            }
          });
        });
        break;
      }
    }
    if (!ok) return;
    ch.cds[slot] = (it.cd ?? 10) * ch.stats.cdMul;
    ch.cdMax[slot] = ch.cds[slot];
    this.emit({ k: 'cast', id: ch.id, s: slot });
  }

  giveShield(t: Character, amount: number, dur: number) {
    t.shield = Math.max(t.shield, amount);
    t.shieldT = Math.max(t.shieldT, dur);
    this.emit({ k: 'shield', id: t.id });
  }

  blink(ch: Character, tx: number, tz: number, maxDist: number): boolean {
    const a = this.clampAim(ch, tx, tz, maxDist);
    const p = this.cw.lastSafePoint(ch.pos.x, ch.pos.z, a.x, a.z, ch.pos.y, CHAR_RADIUS);
    if (!p || Math.hypot(p.x - ch.pos.x, p.z - ch.pos.z) < 0.5) return false;
    this.emit({ k: 'blink', id: ch.id, x: ch.pos.x, z: ch.pos.z, x2: p.x, z2: p.z });
    ch.pos.x = p.x;
    ch.pos.z = p.z;
    ch.pos.y = Math.max(p.y, ch.pos.y > p.y + 0.5 ? ch.pos.y : p.y);
    ch.ppos = { ...ch.pos };
    ch.tumble = 0;
    ch.vel.x *= 0.2;
    ch.vel.z *= 0.2;
    if (ch.vel.y < 0) ch.vel.y = 0;
    return true;
  }

  pullTo(t: Character, ch: Character, heat: number, stun: number) {
    if (!t.alive || t.team === ch.team || t.invuln > 0) return;
    this.applyHeat(t, ch, heat);
    if (t.kbImmune > 0) return;
    const dx = ch.pos.x - t.pos.x, dz = ch.pos.z - t.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const sp = Math.min(20, 6 + d * 1.6);
    t.vel.x = (dx / d) * sp;
    t.vel.z = (dz / d) * sp;
    t.vel.y = 4;
    t.grounded = false;
    t.tumble = 0.6;
    t.hitstun = 0.3;
    t.stun = Math.max(t.stun, stun);
    t.launcher = ch.id;
    t.bodyHits.clear();
    if (t.action && !t.action.direct) t.action = null;
    this.emit({ k: 'hit', x: t.pos.x, y: t.pos.y + 0.8, z: t.pos.z, p: 4, f: 'hook', id: t.id, a: ch.id, h: Math.round(heat), st: t.stage, l: 0, dx: 0, dz: 0 });
  }

  // ───────────────────────────── acciones (dash, salto, rodar, cargar) ─────────────────────────────

  private setAction(ch: Character, a: Partial<import('./entities').ActionState> & { kind: string; dur: number }) {
    ch.action = { t: 0, lock: false, direct: false, noGravity: false, noCast: false, slow: 1, data: {}, ...a };
  }

  private endAction(ch: Character) {
    const a = ch.action;
    if (!a) return;
    ch.action = null;
    if (a.kind === 'dash') { ch.vel.x *= 0.3; ch.vel.z *= 0.3; }
    if (a.kind === 'zip') { ch.vel.x *= 0.35; ch.vel.z *= 0.35; ch.vel.y = Math.max(ch.vel.y, 5); ch.airJumps = Math.max(ch.airJumps, 1); }
    if (a.kind === 'roll') { ch.vel.x *= 0.4; ch.vel.z *= 0.4; }
  }

  windup(ch: Character, time: number, fn: () => void, o: { lock?: boolean; slow?: number; kind?: string } = {}) {
    this.setAction(ch, { kind: o.kind ?? 'wind', dur: time, lock: !!o.lock, noCast: true, slow: o.slow ?? 0.4, data: { fn } });
    if (o.lock) { ch.vel.x *= 0.2; ch.vel.z *= 0.2; }
  }

  dash(ch: Character, o: { dirX: number; dirZ: number; dist: number; speed: number; destruct?: number; onHit: (t: Character) => boolean }) {
    this.setAction(ch, {
      kind: 'dash', dur: o.dist / o.speed, lock: true, noGravity: true, noCast: true,
      data: { dx: o.dirX, dz: o.dirZ, speed: o.speed, onHit: o.onHit, destruct: o.destruct, hit: new Set<number>() },
    });
    ch.facing = Math.atan2(o.dirX, o.dirZ);
    ch.vel.y = 0;
    ch.tumble = 0;
  }

  leap(ch: Character, tx: number, tz: number, time: number, height: number, onLand: () => void) {
    let ty = this.cw.groundAt(tx, tz, 50);
    let x = tx, z = tz;
    if (ty > -Infinity && this.cw.blockAt(tx, tz, CHAR_RADIUS, ty)) {
      const p = this.cw.lastSafePoint(ch.pos.x, ch.pos.z, tx, tz, ty, CHAR_RADIUS);
      if (p) { x = p.x; z = p.z; ty = p.y; }
    }
    if (ty === -Infinity) ty = ch.pos.y - 1;
    this.setAction(ch, {
      kind: 'leap', dur: time, direct: true, noCast: true,
      data: { sx: ch.pos.x, sy: ch.pos.y, sz: ch.pos.z, tx: x, ty, tz: z, h: height, onLand },
    });
    ch.kbImmune = Math.max(ch.kbImmune, time + 0.1);
    ch.tumble = 0;
    ch.facing = Math.atan2(x - ch.pos.x, z - ch.pos.z);
  }

  roll(ch: Character, dx: number, dz: number, dur: number, speed: number, onHit: (t: Character, dx: number, dz: number) => void) {
    this.setAction(ch, { kind: 'roll', dur, lock: true, noCast: true, data: { dx, dz, speed, onHit, hit: new Set<number>() } });
    ch.kbImmune = Math.max(ch.kbImmune, dur);
    ch.tumble = 0;
  }

  zip(ch: Character, tx: number, tz: number, speed: number, maxTime: number) {
    const ty = this.cw.groundAt(tx, tz, 50);
    this.setAction(ch, { kind: 'zip', dur: maxTime, lock: true, noGravity: true, noCast: true, data: { tx, tz, ty: ty === -Infinity ? ch.pos.y : ty, speed } });
    ch.tumble = 0;
    ch.hitstun = 0;
  }

  private updateAction(ch: Character) {
    const a = ch.action!;
    a.t += DT;
    const d = a.data;
    switch (a.kind) {
      case 'dash': {
        ch.vel.x = d.dx * d.speed;
        ch.vel.z = d.dz * d.speed;
        ch.vel.y = 0;
        for (const t of this.bodies) {
          if (t === ch || !t.alive || t.team === ch.team || d.hit.has(t.id)) continue;
          if (Math.hypot(t.pos.x - ch.pos.x, t.pos.z - ch.pos.z) < CHAR_RADIUS * 2.3 && Math.abs(t.pos.y - ch.pos.y) < 1.3) {
            d.hit.add(t.id);
            if (d.onHit(t)) { this.endAction(ch); return; }
          }
        }
        break;
      }
      case 'roll': {
        // Se puede dirigir un poco hacia el cursor.
        const want = norm2(ch.input.ax - ch.pos.x, ch.input.az - ch.pos.z);
        if (want.x || want.z) {
          const k = 2.2 * DT;
          const n = norm2(d.dx + want.x * k, d.dz + want.z * k);
          d.dx = n.x; d.dz = n.z;
        }
        ch.vel.x = d.dx * d.speed;
        ch.vel.z = d.dz * d.speed;
        ch.facing = Math.atan2(d.dx, d.dz);
        for (const t of this.bodies) {
          if (t === ch || !t.alive || t.team === ch.team || d.hit.has(t.id)) continue;
          if (Math.hypot(t.pos.x - ch.pos.x, t.pos.z - ch.pos.z) < CHAR_RADIUS * 2.4 && Math.abs(t.pos.y - ch.pos.y) < 1.4) {
            d.hit.add(t.id);
            d.onHit(t, d.dx, d.dz);
          }
        }
        break;
      }
      case 'leap': {
        const u = Math.min(1, a.t / a.dur);
        ch.pos.x = d.sx + (d.tx - d.sx) * u;
        ch.pos.z = d.sz + (d.tz - d.sz) * u;
        ch.pos.y = d.sy + (d.ty - d.sy) * u + d.h * 4 * u * (1 - u);
        ch.vel.x = (d.tx - d.sx) / a.dur;
        ch.vel.z = (d.tz - d.sz) / a.dur;
        ch.vel.y = 0;
        if (u >= 1) {
          ch.action = null;
          const g = this.cw.groundAt(ch.pos.x, ch.pos.z, ch.pos.y + 0.3);
          ch.grounded = g > -Infinity && ch.pos.y - g < 0.3;
          ch.vel.x = ch.vel.z = 0;
          ch.airJumps = ch.stats.maxAirJumps;
          d.onLand();
          return;
        }
        break;
      }
      case 'zip': {
        const dx = d.tx - ch.pos.x, dz = d.tz - ch.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.8) { this.endAction(ch); return; }
        ch.vel.x = (dx / dist) * d.speed;
        ch.vel.z = (dz / dist) * d.speed;
        ch.vel.y = Math.max(-2, Math.min(8, (d.ty + 0.4 - ch.pos.y) * 6));
        break;
      }
    }
    if (ch.action && a.t >= a.dur) {
      if (a.data.fn) { ch.action = null; a.data.fn(); } else this.endAction(ch);
    }
  }

  // ───────────────────────────── proyectiles ─────────────────────────────

  fireProjectile(ch: Character, s: ProjSpec, m: Mods): Projectile {
    const p = this.spawnProjectile(ch.id, ch.team, s.originX ?? ch.pos.x + s.dirX * 0.5, s.originY ?? ch.pos.y + 0.8, s.originZ ?? ch.pos.z + s.dirZ * 0.5, s, m);
    this.emit({ k: 'shoot', id: ch.id, c: s.kind });
    return p;
  }

  /** Proyectil sin personaje que dispare (torres): owner -1 = nadie se lleva el crédito. */
  spawnProjectile(owner: number, team: number, ox: number, y: number, oz: number, s: ProjSpec, m: Mods): Projectile {
    const p: Projectile = {
      id: this.nextId++, kind: s.kind, owner, team,
      pos: { x: ox, y, z: oz }, ppos: { x: ox, y, z: oz },
      vel: { x: s.dirX * s.speed, y: 0, z: s.dirZ * s.speed },
      radius: s.radius, range: s.range, gravity: 0, heat: s.heat, kb: s.kb, up: s.up ?? 0, stun: s.stun ?? 0, slow: s.slow,
      pierce: !!s.pierce, hit: new Set(), destruct: s.destruct ?? 0, tile: s.tile ?? 0, noCharHit: false, explode: s.explode,
      onHit: s.onHit, onSolid: s.onSolid, onEnd: s.onEnd, mods: m, dead: false, ignoreSolid: !!s.ignoreSolid, life: -1,
      homing: s.homing ?? -1,
    };
    this.projectiles.push(p);
    return p;
  }

  /** Proyectil parabólico que cae exactamente en (tx,tz) después de `time` segundos. */
  lob(ch: Character, kind: string, tx: number, tz: number, time: number, onLand: (x: number, y: number, z: number) => void): Projectile {
    const ty = this.groundY(tx, tz, ch.pos.y);
    const y0 = ch.pos.y + 1.2;
    const vy = (ty - y0 + (GRAVITY * time * time) / 2) / time;
    const p = this.fireProjectile(ch, { kind, speed: 0, range: Infinity, radius: 0.5, heat: 0, kb: 0, dirX: 0, dirZ: 0, originX: ch.pos.x, originZ: ch.pos.z, originY: y0 }, NO_MODS);
    p.vel = { x: (tx - ch.pos.x) / time, y: vy, z: (tz - ch.pos.z) / time };
    p.gravity = GRAVITY;
    p.noCharHit = true;
    p.ignoreSolid = true;
    p.life = Math.round(time * TICK_RATE);
    p.onEnd = () => onLand(tx, ty, tz);
    return p;
  }

  private updateProjectiles() {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      const owner = this.charById.get(p.owner) ?? null;
      if (p.life >= 0) {
        p.vel.y -= p.gravity * DT;
        p.pos.x += p.vel.x * DT;
        p.pos.y += p.vel.y * DT;
        p.pos.z += p.vel.z * DT;
        p.life--;
        if (p.life <= 0) { p.dead = true; p.onEnd?.(p.pos); }
        continue;
      }
      if (p.homing >= 0) {
        // Teledirigido: sigue al objetivo; si el objetivo ya no está, se apaga.
        const tg = this.charById.get(p.homing);
        if (!tg || !tg.alive) { p.dead = true; continue; }
        const sp = Math.hypot(p.vel.x, p.vel.z) || 1;
        const dx = tg.pos.x - p.pos.x, dz = tg.pos.z - p.pos.z, dy = tg.pos.y + 0.8 - p.pos.y;
        const d = Math.hypot(dx, dz) || 1;
        p.vel.x = (dx / d) * sp;
        p.vel.z = (dz / d) * sp;
        p.pos.y += Math.max(-sp * DT, Math.min(sp * DT, dy));
        p.range = Math.max(p.range, d + 1);
      }
      const speed = Math.hypot(p.vel.x, p.vel.z);
      const stepLen = speed * DT;
      const n = Math.max(1, Math.ceil(stepLen / Math.max(0.25, p.radius)));
      const ux = speed > 0 ? p.vel.x / speed : 0, uz = speed > 0 ? p.vel.z / speed : 0;
      for (let i = 0; i < n && !p.dead; i++) {
        p.pos.x += (p.vel.x * DT) / n;
        p.pos.z += (p.vel.z * DT) / n;
        // Los proyectiles "abrazan" el terreno: si el piso baja, bajan con él (se puede pegar desde lo alto).
        const g = this.terrain.groundAt(p.pos.x, p.pos.z);
        if (g > -Infinity && g + 0.8 < p.pos.y) p.pos.y = Math.max(g + 0.8, p.pos.y - (14 * DT) / n);
        for (const t of this.bodies) {
          if (!t.alive || t.team === p.team || p.hit.has(t.id)) continue;
          if (p.homing >= 0 && t.id !== p.homing) continue;
          if (Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) > p.radius + CHAR_RADIUS) continue;
          if (p.pos.y < t.pos.y - p.radius - 0.3 || p.pos.y > t.pos.y + CHAR_HEIGHT + p.radius) continue;
          p.hit.add(t.id);
          if (p.onHit) p.onHit(t);
          else this.hit(t, owner, { heat: p.heat, kb: p.kb, dirX: ux, dirZ: uz, up: p.up, stun: p.stun, slow: p.slow, fx: p.kind, noLaunch: p.homing >= 0 && t.unit !== 'hero' });
          if (!p.pierce) { this.endProjectile(p, owner); break; }
        }
        if (p.dead) break;
        if (!p.ignoreSolid) {
          const s = this.cw.solidAt(p.pos.x, p.pos.y, p.pos.z, p.radius * 0.6);
          if (s) {
            const st = s.obstacle ? this.structureOf(s.obstacle) : null;
            if (st && st.team === p.team) continue; // atraviesa construcciones propias
            if (s.obstacle && p.destruct) this.damageObstacle(s.obstacle, p.destruct, owner);
            p.onSolid?.(p.pos, s.obstacle);
            this.endProjectile(p, owner);
            this.emit({ k: 'boom', x: p.pos.x, y: p.pos.y, z: p.pos.z, r: 0.4, c: p.kind });
            break;
          }
        } else if (p.destruct) {
          // Ola: rompe lo que atraviesa (una vez por obstáculo).
          const s = this.cw.solidAt(p.pos.x, p.pos.y, p.pos.z, p.radius * 0.6);
          if (s && s.obstacle && !p.hit.has(-s.obstacle.id - 1)) {
            p.hit.add(-s.obstacle.id - 1);
            this.damageObstacle(s.obstacle, p.destruct, owner);
          }
        }
      }
      if (p.dead) continue;
      p.range -= stepLen;
      if (p.range <= 0) {
        p.onEnd?.(p.pos);
        this.endProjectile(p, owner);
      }
    }
    if (this.projectiles.some((p) => p.dead)) this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private endProjectile(p: Projectile, owner: Character | null) {
    if (p.dead) return;
    p.dead = true;
    if (p.explode) this.blast(owner, p.team, p.pos.x, p.pos.y, p.pos.z, p.explode, p.mods);
  }

  // ───────────────────────────── zonas, estructuras, telegrafías ─────────────────────────────

  addZone(owner: Character, kind: string, x: number, y: number, z: number, r: number, dur: number, tick?: (z: Zone, dt: number) => void, end?: (z: Zone) => void): Zone {
    const zn: Zone = { id: this.nextId++, kind, owner: owner.id, team: owner.team, x, y, z, r, t: 0, dur, tick, end };
    this.zones.push(zn);
    return zn;
  }

  telegraph(kind: string, team: number, x: number, y: number, z: number, r: number, dur: number) {
    this.telegraphs.push({ id: this.nextId++, kind, team, x, y, z, r, t: 0, dur });
  }

  private updateZones() {
    for (const z of this.zones) {
      z.t += DT;
      z.tick?.(z, DT);
      if (z.t >= z.dur) z.end?.(z);
    }
    if (this.zones.some((z) => z.t >= z.dur)) this.zones = this.zones.filter((z) => z.t < z.dur);
    for (const t of this.telegraphs) t.t += DT;
    if (this.telegraphs.some((t) => t.t >= t.dur)) this.telegraphs = this.telegraphs.filter((t) => t.t < t.dur);
  }

  /** Pieza fija del mapa (torre, núcleo): sin dueño ni vencimiento. */
  addFixedStructure(team: number, kind: string, family: Family, x: number, z: number, hw: number, h: number, hp: number): Structure {
    const y = this.groundY(x, z, 0);
    const id = this.nextId++;
    const st: Structure = {
      id, kind, owner: -1, team, family, x, y, z, hw, hd: hw, h, rot: team === 0 ? Math.PI / 2 : -Math.PI / 2,
      hp, maxHp: hp, t: 0, dur: Infinity, fireT: 1, fixed: true, armor: 1, target: -1,
      obstacle: { id: 100000 + id, minX: x - hw, maxX: x + hw, minZ: z - hw, maxZ: z + hw, base: y, top: y + h, kind: 's' },
    };
    this.structures.push(st);
    this.obstaclesDirty = true;
    return st;
  }

  private makeStructure(owner: Character, kind: string, family: Family, x: number, z: number, hw: number, hd: number, h: number, hp: number, dur: number, rot: number): Structure {
    const y = this.groundY(x, z, owner.pos.y);
    const id = this.nextId++;
    const st: Structure = {
      id, kind, owner: owner.id, team: owner.team, family, x, y, z, hw, hd, h, rot,
      hp: hp * owner.stats.structHp, maxHp: hp * owner.stats.structHp, t: 0, dur, fireT: 0.3,
      obstacle: { id: 100000 + id, minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, base: y, top: y + h, kind: 's' },
    };
    this.structures.push(st);
    this.obstaclesDirty = true;
    // Empujar a quien quede adentro.
    for (const c of this.bodies) {
      if (!c.alive) continue;
      if (c.pos.x + CHAR_RADIUS > st.obstacle.minX && c.pos.x - CHAR_RADIUS < st.obstacle.maxX && c.pos.z + CHAR_RADIUS > st.obstacle.minZ && c.pos.z - CHAR_RADIUS < st.obstacle.maxZ && c.pos.y < st.obstacle.top && c.pos.y + CHAR_HEIGHT > st.obstacle.base) {
        const u = norm2(c.pos.x - x, c.pos.z - z);
        const ux = u.x || 1, uz = u.z;
        if (c.team !== owner.team) this.hit(c, owner, { heat: 3, kb: 8, dirX: ux, dirZ: uz, fx: 'metal' });
        // Aliado con el centro adentro: queda parado arriba. Si solo lo roza, el movimiento lo saca al costado (depenetrate).
        else if (c.pos.x > st.obstacle.minX && c.pos.x < st.obstacle.maxX && c.pos.z > st.obstacle.minZ && c.pos.z < st.obstacle.maxZ) { c.pos.y = st.obstacle.top + 0.01; c.grounded = false; }
      }
    }
    return st;
  }

  buildWall(owner: Character, kind: string, family: Family, x: number, z: number, dirX: number, dirZ: number, hp: number, dur: number, segments: number) {
    // Muro perpendicular a la mirada, hecho de segmentos (cada uno se rompe por separado).
    const px = -dirZ, pz = dirX;
    const seg = 1.15;
    const half = (segments - 1) / 2;
    for (let i = 0; i < segments; i++) {
      const o = (i - half) * seg;
      const sx = x + px * o, sz = z + pz * o;
      if (this.cw.groundAt(sx, sz, owner.pos.y + 3) === -Infinity) continue;
      this.makeStructure(owner, kind, family, sx, sz, 0.55, 0.55, 1.8, hp, dur, Math.atan2(dirX, dirZ));
    }
    this.emit({ k: 'boom', x, y: owner.pos.y, z, r: 1.5, c: family === 'metal' ? 'build' : 'buildstone' });
  }

  buildTurret(owner: Character, x: number, z: number, hp: number, dur: number, m: Mods): boolean {
    if (this.cw.groundAt(x, z, owner.pos.y + 3) === -Infinity) return false;
    const st = this.makeStructure(owner, 'turret', 'metal', x, z, 0.4, 0.4, 1.2, hp, dur, owner.facing);
    st.mods = m;
    this.emit({ k: 'boom', x, y: st.y, z, r: 1, c: 'build' });
    return true;
  }

  structureOf(o: Obstacle): Structure | null {
    if (o.kind !== 's') return null;
    return this.structures.find((s) => s.obstacle === o) ?? null;
  }

  private updateStructures() {
    for (const s of this.structures) {
      s.t += DT;
      if (s.kind === 'turret' && s.hp > 0) {
        s.fireT -= DT;
        if (s.fireT <= 0) {
          let best: Character | null = null, bd = 10;
          for (const c of this.bodies) {
            if (!c.alive || c.team === s.team) continue;
            const d = Math.hypot(c.pos.x - s.x, c.pos.z - s.z);
            if (d < bd) { bd = d; best = c; }
          }
          if (best) {
            const owner = this.charById.get(s.owner);
            const m: Mods = s.mods ?? NO_MODS;
            if (owner) {
              const u = norm2(best.pos.x - s.x, best.pos.z - s.z);
              this.fireProjectile(owner, {
                kind: 'bolt', speed: 22, range: 11, radius: 0.25, heat: 3 * m.heat, kb: 0, destruct: 4,
                dirX: u.x, dirZ: u.z, originX: s.x + u.x * 0.5, originZ: s.z + u.z * 0.5, originY: s.y + 1.0,
              }, m);
            }
            s.fireT = 0.5;
          } else s.fireT = 0.2;
        }
      }
      if (s.t >= s.dur && s.hp > 0) {
        s.hp = 0;
        this.emit({ k: 'boom', x: s.x, y: s.y + 0.8, z: s.z, r: 0.8, c: s.family === 'metal' ? 'metal' : 'stone' });
      }
    }
    if (this.structures.some((s) => s.hp <= 0)) {
      this.structures = this.structures.filter((s) => s.hp > 0);
      this.obstaclesDirty = true;
    }
  }

  // ───────────────────────────── destructibles, baldosas, materiales ─────────────────────────────

  private rebuildObstacles() {
    const obs: Obstacle[] = [];
    for (const d of this.destructibles) if (d.stage < 3) obs.push(d.obstacle);
    for (const s of this.structures) if (s.hp > 0) obs.push(s.obstacle);
    this.cw.obstacles = obs;
    this.obstaclesDirty = false;
  }

  /** Devuelve true si el obstáculo quedó destruido. */
  damageObstacle(o: Obstacle, dmg: number, by: Character | null): boolean {
    if (dmg <= 0) return false;
    if (o.kind === 'd') {
      const d = this.destructibles[o.id];
      if (!d || d.stage >= 3) return false;
      d.hp -= dmg;
      const frac = d.hp / d.maxHp;
      const ns = d.hp <= 0 ? 3 : frac <= 0.34 ? 2 : frac <= 0.67 ? 1 : 0;
      if (ns !== d.stage) {
        const drops = ns === 3 ? 4 + (ns - d.stage - 1) : ns - d.stage;
        d.stage = ns;
        this.emit({ k: 'dstage', i: d.idx, s: ns, by: by ? by.id : -1 });
        this.dropMaterials(d.kind, d.x, d.y + 0.8, d.z, drops);
        if (ns === 3) {
          d.respawnT = DESTRUCT_RESPAWN;
          this.obstaclesDirty = true;
          if (by) { this.addXp(by, XP_DESTRUCT); by.destroyed++; }
          return true;
        }
      }
      return false;
    }
    const s = this.structureOf(o);
    if (!s || s.hp <= 0) return false;
    if (by && by.team === s.team) return false;
    if (s.fixed) {
      // Torres y núcleos: pueden estar protegidas (invulnerables o con menos daño sin esbirros).
      if (s.invuln) {
        if (by?.unit === 'hero' && (s.lastHitTick ?? -999) < this.tick - 20) this.emit({ k: 'shit', id: s.id, h: 0, x: s.x, y: s.y + s.h, z: s.z, by: by.id });
        s.lastHitTick = this.tick;
        return false;
      }
      const d = dmg * (s.armor ?? 1);
      s.hp -= d;
      s.lastHitBy = by ? by.id : -1;
      s.lastHitTick = this.tick;
      if (by?.unit === 'hero') this.emit({ k: 'shit', id: s.id, h: Math.max(1, Math.round(d)), x: s.x, y: s.y + s.h, z: s.z, by: by.id });
      if (s.hp <= 0) {
        s.hp = 0;
        this.obstaclesDirty = true;
        this.emit({ k: 'sdown', id: s.id, kd: s.kind, tm: s.team, x: s.x, z: s.z, by: by ? by.id : -1 });
        this.mode.onStructureDown?.(this, s, by);
        return true;
      }
      return false;
    }
    s.hp -= dmg;
    if (s.hp <= 0) {
      this.obstaclesDirty = true;
      this.dropMaterials(s.family, s.x, s.y + 0.8, s.z, 1);
      this.emit({ k: 'boom', x: s.x, y: s.y + 0.8, z: s.z, r: 1, c: s.family === 'metal' ? 'metal' : 'stone' });
      return true;
    }
    return false;
  }

  private updateDestructibles() {
    for (const d of this.destructibles) {
      if (d.stage < 3) continue;
      d.respawnT -= DT;
      if (d.respawnT > 0) continue;
      const blocked = this.bodies.some((c) => c.alive && Math.hypot(c.pos.x - d.x, c.pos.z - d.z) < 1.6 && c.pos.y < d.obstacle.top + 0.5);
      if (blocked) { d.respawnT = 1; continue; }
      d.hp = d.maxHp;
      d.stage = 0;
      this.obstaclesDirty = true;
      this.emit({ k: 'dstage', i: d.idx, s: 0, by: -1 });
    }
  }

  damageTile(fi: number, dmg: number) {
    const t = this.terrain;
    if (t.damageTile(fi, dmg)) this.emit({ k: 'tile', i: fi, s: t.tileState[fi] });
  }

  damageTilesAround(x: number, z: number, r: number, dmg: number, y?: number) {
    const t = this.terrain;
    for (let fi = 0; fi < t.fragile.length; fi++) {
      const ci = t.fragile[fi];
      const b = t.cellBounds(ci);
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      if (y !== undefined && Math.abs(t.cells[ci].level * LEVEL_H - y) > 2.5) continue;
      if (Math.hypot(cx - x, cz - z) <= r + 1) this.damageTile(fi, dmg);
    }
  }

  private updateTiles() {
    const t = this.terrain;
    const regen = this.rules.tileRegen;
    for (let fi = 0; fi < t.fragile.length; fi++) {
      if (regen > 0 && t.tileState[fi] === TILE_GONE) {
        // El piso se rearma solo (Asedio): las líneas no quedan cortadas para siempre.
        t.tileTimer[fi] += DT;
        if (t.tileTimer[fi] >= TILE_CRUMBLE + regen) {
          const b = t.cellBounds(t.fragile[fi]);
          const inside = this.bodies.some((c) => c.alive && c.pos.x > b.minX - 0.5 && c.pos.x < b.maxX + 0.5 && c.pos.z > b.minZ - 0.5 && c.pos.z < b.maxZ + 0.5 && c.pos.y < 0.2);
          if (inside) { t.tileTimer[fi] -= 1; continue; }
          t.tileHp[fi] = TILE_HP;
          t.setTileState(fi, TILE_INTACT);
          this.emit({ k: 'tile', i: fi, s: TILE_INTACT });
        }
        continue;
      }
      if (t.tileState[fi] !== TILE_CRUMBLING) continue;
      t.tileTimer[fi] += DT;
      if (t.tileTimer[fi] >= TILE_CRUMBLE) {
        t.setTileState(fi, TILE_GONE);
        this.emit({ k: 'tile', i: fi, s: TILE_GONE });
        const b = t.cellBounds(t.fragile[fi]);
        this.dropMaterials('stone', (b.minX + b.maxX) / 2, 0.5, (b.minZ + b.maxZ) / 2, 1);
        for (const s of this.structures) {
          if (s.x >= b.minX && s.x <= b.maxX && s.z >= b.minZ && s.z <= b.maxZ) s.hp = 0;
        }
        for (const c of this.bodies) if (c.alive && c.grounded && t.cellIndexAt(c.pos.x, c.pos.z) === t.fragile[fi]) c.grounded = false;
      }
    }
  }

  dropMaterials(kind: Family, x: number, y: number, z: number, n: number) {
    if (this.rules.pickups === 'none') return;
    const mat = FAMILIES.indexOf(kind);
    for (let i = 0; i < n; i++) {
      if (this.pickups.length >= MAX_PICKUPS) {
        const old = this.pickups.shift()!;
        this.emit({ k: 'pdel', i: old.id });
      }
      const a = this.rng.range(0, Math.PI * 2), sp = this.rng.range(1.5, 4);
      const p: Pickup = {
        id: this.nextId++, mat, pos: { x, y, z }, vel: { x: Math.cos(a) * sp, y: this.rng.range(5, 8), z: Math.sin(a) * sp },
        t: 0, grounded: false, target: -1,
      };
      this.pickups.push(p);
      this.pendingPickups.push([p.id, mat, round2(x), round2(y), round2(z), round2(p.vel.x), round2(p.vel.y), round2(p.vel.z)]);
    }
  }

  private updatePickups() {
    for (const p of this.pickups) {
      p.t += DT;
      let target: Character | null = null, bd = PICKUP_MAGNET;
      if (p.t > 0.35) {
        for (const c of this.chars) {
          if (!c.alive) continue;
          const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
          if (d < bd && Math.abs(c.pos.y + 0.5 - p.pos.y) < 2) { bd = d; target = c; }
        }
      }
      if (target) {
        if (bd < PICKUP_COLLECT) {
          if (this.rules.pickups === 'ult') this.addUlt(target, ULT_PER_PICKUP);
          else target.mats[FAMILIES[p.mat]]++;
          target.pickups++;
          this.addXp(target, XP_PICKUP);
          this.emit({ k: 'pick', i: p.id, id: target.id, m: p.mat });
          p.t = Infinity;
          continue;
        }
        const u = norm2(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
        p.pos.x += u.x * 11 * DT;
        p.pos.z += u.z * 11 * DT;
        p.pos.y += (target.pos.y + 0.5 - p.pos.y) * Math.min(1, 10 * DT);
        continue;
      }
      stepPickup(p, this.cw);
      if (p.pos.y < KILL_Y || p.t > PICKUP_TTL) {
        this.emit({ k: 'pdel', i: p.id });
        p.t = Infinity;
      }
    }
    if (this.pickups.some((p) => p.t === Infinity)) this.pickups = this.pickups.filter((p) => p.t !== Infinity);
  }

  // Estado por equipos (para UI/resultados).
  teamMembers(team: number) { return this.chars.filter((c) => c.team === team); }
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Física cosmética de los trozos de material (la usan host y clientes). */
export function stepPickup(p: { pos: V3; vel: V3; grounded: boolean }, cw: CollisionWorld) {
  if (p.grounded) {
    const g = cw.groundAt(p.pos.x, p.pos.z, p.pos.y + 0.3);
    if (g === -Infinity || p.pos.y - g > 0.3) p.grounded = false;
    else return;
  }
  p.vel.y -= GRAVITY * DT;
  const nx = p.pos.x + p.vel.x * DT, nz = p.pos.z + p.vel.z * DT;
  if (cw.solidAt(nx, p.pos.y, nz, 0.15)) { p.vel.x *= -0.4; p.vel.z *= -0.4; } else { p.pos.x = nx; p.pos.z = nz; }
  const prevY = p.pos.y;
  p.pos.y += p.vel.y * DT;
  const g = cw.groundAt(p.pos.x, p.pos.z, prevY + 0.2);
  if (g > -Infinity && p.pos.y <= g + 0.15 && p.vel.y < 0) {
    p.pos.y = g + 0.15;
    if (Math.abs(p.vel.y) > 3) { p.vel.y = -p.vel.y * 0.35; p.vel.x *= 0.6; p.vel.z *= 0.6; }
    else { p.vel.x = p.vel.y = p.vel.z = 0; p.grounded = true; }
  }
}
