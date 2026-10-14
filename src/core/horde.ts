// Horda: cooperativo con armas (reglas 'horde', ver core/weapons.ts). Todos los héroes están en el mismo
// equipo contra zombis que salen de los bordes del mapa. Los zombis son unidades como los esbirros del
// Asedio: tienen vida, la misma física y se los puede tirar al vacío.
//
// Las oleadas salen por tiempo y no paran de crecer, así que no se gana limpiando: se gana cumpliendo la
// cadena de misiones del mapa (MISSIONS) y llegando a la extracción. Cada zona asegurada queda como mini
// base (torreta, punto de reaparición y lugar donde enfriarse). Las armas y la munición caen en cajas.
// Se pierde cuando a nadie le quedan vidas. Diseño completo: docs/ZOMBIS.md.
import { CHAR_RADIUS, LEVEL_H } from './constants';
import type { Character, Structure, UnitKind } from './entities';
import type { GameMode, ModeHud, ModeResult } from './modes';
import { steer } from './moba/mode';
import { NO_MODS } from './mutations';
import { PERK, PERK_IDS, PERKS, perkLv } from './perks';
import type { Simulation } from './sim';
import { CellType } from './terrain';
import type { Family } from './types';
import { C4, c4Max, giveWeapon, refillWeapons, type WeaponId } from './weapons';

export const ZOMBIE_TEAM = 1;
export type ZombieKind = 'zombie' | 'runner' | 'brute' | 'spitter' | 'titan';
export const ZOMBIE_KINDS: ZombieKind[] = ['zombie', 'runner', 'brute', 'spitter', 'titan'];

/** Dificultad (MatchSettings.difficulty): cuántos zombis salen y cuánto pegan. */
export const HORDE_LEVELS: Record<number, { count: number; dmg: number }> = {
  1: { count: 0.7, dmg: 0.8 },
  2: { count: 1, dmg: 1 },
  3: { count: 1.35, dmg: 1.2 },
};

export const HORDE = {
  /** Segundos antes de la primera oleada y entre oleadas (no esperan a que se limpie la anterior). */
  first: 5,
  waveEvery: 22,
  /** Si no queda ningún zombi, la próxima oleada sale en estos segundos. */
  quick: 4,
  /** Zombis vivos a la vez (más por cada héroe): el resto espera para salir. */
  maxAlive: 14,
  maxAlivePerHero: 7,
  maxAliveCap: 48,
  /** Salen de a tandas (más grandes con más héroes). */
  batch: 2,
  batchEvery: 1,
  /** Los héroes les pegan más fuerte a los zombis que entre ellos. */
  heroVsUnit: 1.6,
  /** Un zombi que no logra avanzar tanto tiempo vuelve a salir por otro borde. */
  stuck: 7,
  /** Cajas de suministros: cada cuánto cae una, cuántas puede haber, cuánto tardan en caer y desde dónde se agarran. */
  crateEvery: 15,
  maxCrates: 3,
  crateLand: 0.9,
  crateReach: 1.25,
  /** Vida que cura un botiquín (a quien lo agarra y a los que tenga cerca). */
  medHeal: 60,
  medRadius: 5,
  /** Zonas de misión y mini bases. */
  zoneR: 3.6,
  /** La de la extracción es más grande: tiene que entrar medio equipo. */
  extractR: 4.4,
  /** Con zombis adentro la zona avanza más lento. */
  contested: 0.5,
  baseR: 4,
  /** Vida por segundo que recupera un héroe parado en una mini base. */
  baseHeal: 7,
  /** Vida que recupera todo el equipo al cumplir una misión. */
  missionHeal: 30,
  /** Vida máxima que suma cada héroe al cumplir una misión (y se cura esa cantidad al momento). */
  missionMaxHp: 15,
  /** Al cumplir una misión, la próxima oleada no sale antes de estos segundos: un respiro para elegir la mejora. */
  breather: 7,
  /**
   * La horda también crece: por cada misión cumplida (que es cuando los héroes eligen una mejora) los zombis
   * aguantan más, pegan más y salen más. Sin esto, con las mejoras el final sería un paseo.
   */
  threatHp: 0.3,
  threatDmg: 0.08,
  threatCount: 0.2,
  /** Sin recibir golpes durante `healAfter` segundos, un héroe se cura solo a `healRate` por segundo: despegarse sirve. */
  healAfter: 3,
  healRate: 5,
  /** A partir de esta oleada, las siguientes crecen a la mitad del ritmo. */
  softCap: 12,
  /** Nidos: cuántos (uno menos jugando solo), cuánto aguantan (más por cada héroe) y cada cuánto escupe un zombi cada uno. */
  nests: 3,
  nestHp: 170,
  nestHpPerHero: 60,
  /** Segundos entre zombis de cada nido: más seguido cuantos más héroes haya (con un mínimo). */
  nestEvery: 12,
  nestEveryPerHero: 1.5,
  nestEveryMin: 4,
  /** Chatarra que suelta un nido al caer. */
  nestScrap: 10,
  /** Bidones de combustible a juntar. */
  fuel: 3,
  /** El jefe: vida base y por cada héroe, y cuántas moles lo escoltan. */
  bossHp: 700,
  bossHpPerHero: 450,
  bossEscort: 2,
};

export type MissionKind = 'hold' | 'nests' | 'fetch' | 'boss' | 'extract';
/** need: segundos dentro de la zona (hold, extract) o cuántos hay que destruir o juntar (nests, fetch). */
export interface MissionDef { kind: MissionKind; title: string; hint: string; need: number }

/** La cadena de misiones de una partida, en orden. La última es la extracción: cumplirla es ganar. */
export const MISSIONS: MissionDef[] = [
  { kind: 'hold', title: 'Encender el generador', hint: 'Aguantá dentro de la zona', need: 30 },
  { kind: 'nests', title: 'Destruir los nidos', hint: 'Mientras vivan, escupen zombis', need: HORDE.nests },
  { kind: 'hold', title: 'Asegurar la antena', hint: 'Aguantá dentro de la zona', need: 34 },
  { kind: 'fetch', title: 'Juntar el combustible', hint: 'Los bidones están repartidos por el mapa', need: HORDE.fuel },
  { kind: 'boss', title: 'Derribar a la Mole Madre', hint: 'Su golpe se ve venir: salí del círculo', need: 1 },
  { kind: 'extract', title: 'Extracción', hint: 'La mitad del equipo dentro de la zona', need: 20 },
];

export type CrateKind = WeaponId | 'c4' | 'med' | 'fuel';
/** El índice viaja por la red: los tipos nuevos se agregan siempre al final. 'fuel' no cae en cajas: es el bidón de una misión. */
export const CRATE_KINDS: CrateKind[] = ['uzi', 'shotgun', 'launcher', 'c4', 'med', 'fuel'];
const FUEL = CRATE_KINDS.indexOf('fuel');
export const CRATE_INFO: Record<string, { name: string; icon: string }> = {
  uzi: { name: 'Uzi', icon: '⚡' },
  shotgun: { name: 'Escopeta', icon: '💥' },
  launcher: { name: 'Lanzacohetes', icon: '🚀' },
  c4: { name: 'C4', icon: '🧨' },
  med: { name: 'Botiquín', icon: '❄️' },
  fuel: { name: 'Combustible', icon: '⛽' },
};

export interface Crate { id: number; kind: number; x: number; y: number; z: number; /** Segundos desde que empezó a caer. */ t: number }

interface ZombieDef {
  name: string;
  family: Family;
  hp: number;
  speed: number;
  kbTaken: number;
  /** Daño por golpe (se resta de la vida del héroe). */
  dmg: number;
  /** Trozos de chatarra que suelta al morir. */
  scrap: number;
  kb: number;
  /** Distancia (entre bordes de los cuerpos) desde la que ataca. */
  range: number;
  cd: number;
  /** Segundos que tarda en pegar desde que decide atacar (se ve venir). */
  windup: number;
  /** Pega en área a su alrededor (radio), avisando antes dónde. */
  slam?: number;
}

export const ZOMBIES: Record<ZombieKind, ZombieDef> = {
  zombie: { name: 'Zombi', family: 'goo', hp: 55, speed: 3.4, kbTaken: 1, dmg: 8, scrap: 1, kb: 7, range: 0.5, cd: 1.1, windup: 0.3 },
  runner: { name: 'Corredor', family: 'crystal', hp: 30, speed: 6.3, kbTaken: 1.25, dmg: 5, scrap: 1, kb: 5, range: 0.5, cd: 0.8, windup: 0.2 },
  brute: { name: 'Mole', family: 'stone', hp: 320, speed: 2.6, kbTaken: 0.4, dmg: 14, scrap: 6, kb: 13, range: 0.9, cd: 2.2, windup: 0.75, slam: 2.4 },
  spitter: { name: 'Escupidor', family: 'goo', hp: 40, speed: 3, kbTaken: 1.1, dmg: 7, scrap: 2, kb: 6, range: 9, cd: 2.3, windup: 0.45 },
  // El jefe de la misión "Derribar a la Mole Madre": su vida sale de HORDE.bossHp.
  titan: { name: 'Mole Madre', family: 'stone', hp: 1, speed: 3.1, kbTaken: 0.12, dmg: 19, scrap: 30, kb: 17, range: 1.3, cd: 2.5, windup: 0.85, slam: 3.6 },
};

const SPIT_RADIUS = 1.7;
const SPIT_TIME = 0.75;

interface ZombieAI {
  kind: ZombieKind;
  target: Character | null;
  think: number;
  /** > 0: preparando el golpe. */
  windup: number;
  /** Dónde va a caer el escupitajo que está preparando. */
  aim: { x: number; z: number } | null;
  stuck: number;
  /** Último lugar firme que pisó (ahí suelta la chatarra si cae al vacío). */
  gx: number; gy: number; gz: number;
}

type P2 = { x: number; z: number };
const d2 = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.z - b.z);
const r1 = (n: number) => Math.round(n * 10) / 10;

export class HordeMode implements GameMode {
  id = 'horde' as const;
  untimed = true;
  /** Oleada actual; 0 antes de la primera. */
  wave = 0;
  kills = 0;
  /** Misión en curso (índice en MISSIONS). */
  step = 0;
  /** Zona de la misión en curso (hold, extract); null en las que no tienen. */
  zone: { x: number; y: number; z: number; r: number } | null = null;
  /** Nidos en pie. */
  nests: Structure[] = [];
  /** El jefe, mientras dure su misión. */
  boss: Character | null = null;
  /** Mini bases: zonas ya aseguradas. */
  bases: { x: number; y: number; z: number }[] = [];
  crates: Crate[] = [];
  private pending: ZombieKind[] = [];
  private spawnT = 0;
  private waveT = HORDE.first;
  private won = false;
  private started = false;
  /** Segundos acumulados dentro de la zona. */
  private prog = 0;
  private inside = 0;
  private needIn = 1;
  private contested = false;
  private nestsPlaced = HORDE.nests;
  private fuelPlaced = HORDE.fuel;
  private level = HORDE_LEVELS[2];
  private nestT = HORDE.nestEvery;
  private crateT = HORDE.crateEvery;
  private crateId = 1;
  /** Lugares donde puede ir una zona: los puntos de zona del mapa y el centro de cada grupo de salida. */
  private points: P2[] = [];
  private used = new Set<number>();
  private last: P2 = { x: 0, z: 0 };
  /** Celdas de borde por donde salen los zombis. */
  private edges: number[] = [];
  /** Distancia a pie de cada celda al héroe más cercano (los zombis bajan por este campo). */
  private field = new Float32Array(0);
  private fieldT = 0;
  private fieldOk = false;
  /** Torretas de bolsillo elegidas por alguien que no tenía dónde plantarla (estaba fuera de juego o en el aire). */
  private owed = new Map<Character, number>();

  init(sim: Simulation) {
    sim.heroVsUnit = HORDE.heroVsUnit;
    this.level = HORDE_LEVELS[sim.settings.difficulty] ?? HORDE_LEVELS[2];
    for (const c of sim.chars) c.lives = sim.settings.lives;
    const t = sim.terrain;
    this.field = new Float32Array(t.cells.length);
    for (let i = 0; i < t.cells.length; i++) {
      const c = t.cells[i];
      if (c.type !== CellType.Floor || c.level !== 0 || c.fragile >= 0 || c.pad) continue;
      const ix = i % t.w, iz = Math.floor(i / t.w);
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
        const nx = ix + dx, nz = iz + dz;
        return nx < 0 || nz < 0 || nx >= t.w || nz >= t.h || t.cells[nz * t.w + nx].type === CellType.Void;
      });
      if (open) this.edges.push(i);
    }
    const mid = (l: P2[]): P2[] => (l.length ? [{ x: l.reduce((s, p) => s + p.x, 0) / l.length, z: l.reduce((s, p) => s + p.z, 0) / l.length }] : []);
    this.points = [...t.zonePoints.map((p) => ({ x: p.x, z: p.z })), ...mid(t.spawns.team[0]), ...mid(t.spawns.team[1])]
      .filter((p) => sim.cw.groundAt(p.x, p.z, 50) !== -Infinity);
    if (!this.points.length) this.points = [{ x: 0, z: 0 }];
    this.startMission(sim);
  }

  onDeath(_sim: Simulation, v: Character) {
    v.lives = Math.max(0, v.lives - 1);
    if (v.lives <= 0) v.eliminated = true;
  }

  canRespawn(_sim: Simulation, ch: Character) { return ch.lives > 0; }

  /** El taller de armas: una mini base o el campamento de salida (el centro de los puntos de aparición). */
  workshop(sim: Simulation, ch: Character) {
    if (this.bases.some((b) => d2(ch.pos, b) <= HORDE.baseR && Math.abs(ch.pos.y - b.y) < 2.2)) return true;
    const camp = sim.baseCenter(ch.team);
    return d2(ch.pos, camp) <= HORDE.baseR && Math.abs(ch.pos.y - sim.groundY(camp.x, camp.z, ch.pos.y)) < 2.2;
  }

  /** Con una mini base en pie, se reaparece en la última. */
  respawnAt(sim: Simulation, _ch: Character) {
    const b = this.bases[this.bases.length - 1];
    return b ? { x: b.x + sim.rng.range(-1, 1), z: b.z + sim.rng.range(-1, 1) } : null;
  }

  private maxAlive(sim: Simulation) { return Math.min(HORDE.maxAliveCap, HORDE.maxAlive + HORDE.maxAlivePerHero * sim.chars.length); }

  private aliveCount(sim: Simulation) {
    let n = 0;
    for (const u of sim.units) if (u.alive) n++;
    return n;
  }

  // ───────────── oleadas ─────────────

  /** Quiénes salen en la oleada n: más y más variados a medida que avanza, y según cuántos héroes hay. No tiene tope. */
  private compose(sim: Simulation, n: number): ZombieKind[] {
    const heroes = sim.chars.length;
    const grow = n <= HORDE.softCap ? n : HORDE.softCap + (n - HORDE.softCap) * 0.5;
    const total = Math.round((4 + 1.7 * grow) * (0.2 + 0.7 * heroes) * this.level.count * (1 + HORDE.threatCount * this.step));
    const out: ZombieKind[] = [];
    const brutes = n >= 3 ? Math.ceil((Math.floor(n / 3) * heroes) / 2) : 0;
    while (out.length < total - brutes) {
      const r = sim.rng.next();
      out.push(n >= 2 && r < 0.18 ? 'spitter' : n >= 2 && r < 0.18 + Math.min(0.36, 0.12 + n * 0.03) ? 'runner' : 'zombie');
    }
    // Las moles salen cuando la oleada ya está en marcha.
    for (let i = 0; i < brutes; i++) out.splice(Math.floor(out.length * (0.4 + (0.5 * i) / Math.max(1, brutes))), 0, 'brute');
    return out;
  }

  private startWave(sim: Simulation) {
    this.wave++;
    this.pending.push(...this.compose(sim, this.wave));
    this.waveT = HORDE.waveEvery;
    sim.emit({ k: 'alert', w: 'horde_wave', tm: this.wave, x: 0, z: 0 });
  }

  /** Un borde lejos de los héroes (si no hay ninguno lejos, el más lejano). */
  private spawnCell(sim: Simulation): number {
    const t = sim.terrain;
    const heroes = sim.chars.filter((c) => c.alive);
    let far = -1, farD = -1;
    const ok: number[] = [];
    for (const i of this.edges) {
      if (!t.isWalkable(i)) continue;
      const c = t.cellCenter(i % t.w, Math.floor(i / t.w));
      let near = Infinity;
      for (const h of heroes) near = Math.min(near, d2(c, h.pos));
      if (near >= 9) ok.push(i);
      if (near > farD) { farD = near; far = i; }
    }
    return ok.length ? sim.rng.pick(ok) : far;
  }

  private spawnAt(sim: Simulation, kind: ZombieKind, x: number, z: number, fixedHp = 0): Character {
    const def = ZOMBIES[kind];
    // Cada oleada llegan un poco más duros, y cada misión cumplida, bastante más.
    const hp = (fixedHp || def.hp * (1 + 0.06 * Math.max(0, this.wave - 1))) * (1 + HORDE.threatHp * this.step);
    const u = sim.addUnit(kind as UnitKind, ZOMBIE_TEAM, x, z, { name: def.name, family: def.family, hp, speed: def.speed, kbTaken: def.kbTaken });
    u.ai = { kind, target: null, think: sim.rng.range(0, 0.3), windup: 0, aim: null, stuck: 0, gx: x, gy: u.pos.y, gz: z } satisfies ZombieAI;
    u.invuln = 0.5;
    u.cds.basic = 0.6;
    sim.emit({ k: 'gad', w: 'rise', i: -1, id: u.id, x: u.pos.x, y: u.pos.y, z: u.pos.z });
    return u;
  }

  private spawn(sim: Simulation, kind: ZombieKind): Character | null {
    const ci = this.spawnCell(sim);
    if (ci < 0) return null;
    const t = sim.terrain;
    const c = t.cellCenter(ci % t.w, Math.floor(ci / t.w));
    return this.spawnAt(sim, kind, c.x + sim.rng.range(-0.5, 0.5), c.z + sim.rng.range(-0.5, 0.5));
  }

  tick(sim: Simulation, dt: number) {
    if (sim.phase !== 'play' || this.won) return;
    if (!this.started) {
      // Todos arrancan con un arma cargada además de la pistola (uzi o escopeta, alternadas), y cae una caja cerca.
      this.started = true;
      sim.chars.forEach((c, i) => giveWeapon(sim, c, i % 2 ? 'shotgun' : 'uzi'));
      this.dropCrate(sim, this.rollCrate(sim), sim.chars[0]?.pos ?? null);
    }

    let alive = this.aliveCount(sim);
    this.waveT -= dt;
    if (this.wave > 0 && !this.pending.length && alive === 0) this.waveT = Math.min(this.waveT, HORDE.quick);
    if (this.waveT <= 0) this.startWave(sim);
    if (this.pending.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = HORDE.batchEvery;
        for (let k = 0; k < HORDE.batch + sim.chars.length && this.pending.length && alive < this.maxAlive(sim); k++) {
          if (this.spawn(sim, this.pending.shift()!)) alive++;
        }
      }
    }

    this.tickNests(sim, dt, alive);
    this.tickCrates(sim, dt);
    this.tickBases(sim, dt);
    this.tickPerks(sim, dt);
    this.tickMission(sim, dt);
  }

  // ───────────── mejoras (core/perks.ts) ─────────────

  /** Tres mejoras distintas para este héroe, sorteadas por peso entre las que todavía puede subir. */
  private rollOffer(sim: Simulation, ch: Character): number[] {
    const fallen = sim.chars.some((c) => c.eliminated);
    const pool = PERK_IDS.map((id, i) => ({ i, w: perkLv(ch, id) >= PERKS[id].max ? 0 : PERKS[id].weight * (id === 'life' && fallen ? 4 : 1) })).filter((p) => p.w > 0);
    const out: number[] = [];
    while (out.length < PERK.options && pool.length) {
      let r = sim.rng.next() * pool.reduce((s, p) => s + p.w, 0);
      let k = pool.findIndex((p) => (r -= p.w) < 0);
      if (k < 0) k = pool.length - 1;
      out.push(pool.splice(k, 1)[0].i);
    }
    return out;
  }

  private tickPerks(sim: Simulation, dt: number) {
    for (const c of sim.chars) {
      if (!c.offer.length) {
        if (c.picks <= 0 || c.eliminated) continue;
        c.picks--;
        c.offer = this.rollOffer(sim, c);
        c.offerT = PERK.time;
        continue;
      }
      c.offerT -= dt;
      // Los bots eligen al rato (cualquiera); a una persona que no eligió se le da la primera.
      if (c.bot && c.offerT <= PERK.time - PERK.botTime) this.onPerk(sim, c, sim.rng.int(0, c.offer.length - 1));
      else if (c.offerT <= 0) this.onPerk(sim, c, 0);
    }
    for (const [c, n] of this.owed) {
      if (!c.alive || !c.grounded || !this.plantTurret(sim, c)) continue;
      if (n <= 1) this.owed.delete(c);
      else this.owed.set(c, n - 1);
    }
  }

  onPerk(sim: Simulation, ch: Character, i: number) {
    const idx = ch.offer[i];
    if (idx === undefined) return;
    const id = PERK_IDS[idx];
    ch.offer = [];
    while (ch.perks.length < PERK_IDS.length) ch.perks.push(0);
    ch.perks[idx]++;
    // Las que hacen algo en el momento.
    if (id === 'ammo') refillWeapons(ch);
    else if (id === 'demo') ch.c4 = Math.min(c4Max(ch), ch.c4 + PERK.c4);
    else if (id === 'turret') this.owed.set(ch, (this.owed.get(ch) ?? 0) + 1);
    else if (id === 'life') {
      ch.lives++;
      const back = sim.chars.find((c) => c.eliminated);
      if (back) {
        back.eliminated = false;
        back.lives = 1;
        back.respawnT = 1.5;
      }
    }
    sim.recalcStats(ch);
    sim.emit({ k: 'perk', id: ch.id, p: idx });
  }

  /** Una torreta al lado del héroe, del lado que haya lugar. */
  private plantTurret(sim: Simulation, ch: Character): boolean {
    const f = ch.facing;
    for (const a of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const x = ch.pos.x + Math.sin(f + a) * 1.3, z = ch.pos.z + Math.cos(f + a) * 1.3;
      if (Math.abs(sim.groundY(x, z, -99) - ch.pos.y) > 0.3 || sim.cw.blockAt(x, z, 0.5, ch.pos.y)) continue;
      if (sim.buildTurret(ch, x, z, PERK.turretHp, PERK.turretTime, { ...NO_MODS, heat: 3 })) return true;
    }
    return false;
  }

  // ───────────── misiones ─────────────

  private get mission(): MissionDef { return MISSIONS[Math.min(this.step, MISSIONS.length - 1)]; }

  /** Dónde va la zona: la primera, cerca del centro del mapa; las siguientes, lo más lejos posible de la anterior. */
  private pickPoint(): P2 {
    if (this.used.size >= this.points.length) this.used.clear();
    let best = -1, bs = -Infinity;
    this.points.forEach((p, i) => {
      if (this.used.has(i)) return;
      const s = this.step === 0 ? -Math.hypot(p.x, p.z) : d2(p, this.last);
      if (s > bs) { bs = s; best = i; }
    });
    this.used.add(best);
    return this.points[best];
  }

  private startMission(sim: Simulation) {
    const m = this.mission;
    this.prog = 0;
    this.inside = 0;
    this.contested = false;
    this.zone = null;
    if (m.kind === 'nests') this.placeNests(sim);
    else if (m.kind === 'fetch') this.placeFuel(sim);
    else if (m.kind === 'boss') this.spawnBoss(sim);
    else {
      const p = this.pickPoint();
      this.last = p;
      this.zone = { x: p.x, y: sim.groundY(p.x, p.z, 0), z: p.z, r: m.kind === 'extract' ? HORDE.extractR : HORDE.zoneR };
    }
    sim.emit({ k: 'alert', w: 'horde_obj', tm: this.step, x: this.zone?.x ?? 0, z: this.zone?.z ?? 0 });
  }

  private completeMission(sim: Simulation) {
    const m = this.mission;
    const z = this.zone;
    sim.emit({ k: 'alert', w: 'horde_done', tm: this.step, x: z?.x ?? 0, z: z?.z ?? 0 });
    if (m.kind === 'extract') { this.won = true; return; }
    if (m.kind === 'hold' && z) this.makeBase(sim, z);
    for (const c of sim.chars) {
      c.maxHp += HORDE.missionMaxHp;
      if (c.alive) c.hp += HORDE.missionMaxHp;
      sim.coolHeat(c, HORDE.missionHeal);
    }
    // El premio: una mejora a elegir para cada uno, y un respiro antes de la próxima oleada.
    for (const c of sim.chars) if (!c.eliminated) c.picks++;
    this.waveT = Math.max(this.waveT, HORDE.breather);
    this.step++;
    this.startMission(sim);
  }

  private tickMission(sim: Simulation, dt: number) {
    const m = this.mission;
    const z = this.zone;
    if (m.kind === 'nests') {
      if (!this.nests.length) this.completeMission(sim);
      return;
    }
    if (m.kind === 'fetch') {
      if (!this.crates.some((c) => c.kind === FUEL)) this.completeMission(sim);
      return;
    }
    if (m.kind === 'boss') {
      if (!this.boss || !this.boss.alive) { this.boss = null; this.completeMission(sim); }
      return;
    }
    if (!z) return;
    let inside = 0, team = 0;
    for (const c of sim.chars) {
      if (c.eliminated) continue;
      team++;
      if (c.alive && d2(c.pos, z) <= z.r && Math.abs(c.pos.y - z.y) < 2.2) inside++;
    }
    this.contested = sim.units.some((u) => u.alive && d2(u.pos, z) <= z.r && Math.abs(u.pos.y - z.y) < 2.2);
    this.inside = inside;
    // La extracción no se hace dejando gente atrás: hace falta la mitad de los que siguen en juego.
    this.needIn = m.kind === 'extract' ? Math.max(1, Math.ceil(team / 2)) : 1;
    if (inside >= this.needIn) this.prog += dt * (this.contested ? HORDE.contested : 1);
    if (this.prog >= m.need) this.completeMission(sim);
  }

  /** La zona asegurada queda como mini base: una torreta que no vence y una caja de suministros. */
  private makeBase(sim: Simulation, z: { x: number; y: number; z: number }) {
    this.bases.push({ x: z.x, y: z.y, z: z.z });
    let owner: Character | null = null, bd = Infinity;
    for (const c of sim.chars) {
      const d = d2(c.pos, z) + (c.alive ? 0 : 1000);
      if (d < bd) { bd = d; owner = c; }
    }
    if (owner) {
      for (const [ox, oz] of [[1.7, 0], [-1.7, 0], [0, 1.7], [0, -1.7]]) {
        const x = z.x + ox, zz = z.z + oz;
        if (Math.abs(sim.groundY(x, zz, -99) - z.y) > 0.3 || sim.cw.blockAt(x, zz, 0.5, z.y)) continue;
        if (sim.buildTurret(owner, x, zz, 420, Infinity, { ...NO_MODS, heat: 3 })) break;
      }
    }
    this.dropCrate(sim, this.rollCrate(sim), z);
  }

  /** Curarse: solo, al rato de no recibir golpes; y más rápido parado en una mini base. */
  private tickBases(sim: Simulation, dt: number) {
    for (const c of sim.chars) {
      if (!c.alive || !sim.isHurt(c)) continue;
      let rate = sim.tick - c.lastHitTick > HORDE.healAfter * 60 ? HORDE.healRate : 0;
      if (this.bases.some((b) => d2(c.pos, b) <= HORDE.baseR && Math.abs(c.pos.y - b.y) < 2.2)) rate += HORDE.baseHeal;
      if (rate) sim.coolHeat(c, rate * dt);
    }
  }

  // ───────────── nidos ─────────────

  /** ¿Se puede poner algo en esta celda? Piso firme y sin nada encima ni al lado. */
  private freeSpot(sim: Simulation, p: P2, gap: number) {
    return !sim.destructibles.some((d) => d.stage < 3 && d2(d, p) < gap)
      && !sim.gadgets.some((g) => d2(g, p) < gap + 0.4)
      && !sim.structures.some((s) => d2(s, p) < gap + 0.6)
      && !this.crates.some((c) => d2(c, p) < gap);
  }

  /** Nidos en los bordes, lejos de los héroes y separados entre sí. */
  private placeNests(sim: Simulation) {
    const t = sim.terrain;
    const heroes = sim.chars.filter((c) => c.alive);
    const cand = this.edges
      .filter((i) => t.isWalkable(i))
      .map((i) => t.cellCenter(i % t.w, Math.floor(i / t.w)))
      .filter((p) => this.freeSpot(sim, p, 1.4) && !this.bases.some((b) => d2(b, p) < 6) && heroes.every((h) => d2(h.pos, p) > 5));
    const hp = HORDE.nestHp + HORDE.nestHpPerHero * sim.chars.length;
    const count = sim.chars.length > 1 ? HORDE.nests : HORDE.nests - 1;
    const chosen: P2[] = [];
    for (let n = 0; n < count && cand.length; n++) {
      // El primero, el más lejano a los héroes; los demás, lo más lejos posible de los que ya están.
      let best = 0, bs = -Infinity;
      cand.forEach((p, i) => {
        let s = Infinity;
        for (const q of chosen) s = Math.min(s, d2(p, q));
        for (const h of heroes) s = Math.min(s, d2(p, h.pos) * (chosen.length ? 0.6 : 1));
        if (s > bs) { bs = s; best = i; }
      });
      const p = cand.splice(best, 1)[0];
      chosen.push(p);
      this.nests.push(sim.addFixedStructure(ZOMBIE_TEAM, 'nest', 'goo', p.x, p.z, 0.75, 1.5, hp));
    }
    this.nestsPlaced = Math.max(1, this.nests.length);
    this.nestT = HORDE.nestEvery * 0.5;
  }

  private tickNests(sim: Simulation, dt: number, alive: number) {
    if (!this.nests.length) return;
    this.nestT -= dt;
    if (this.nestT > 0) return;
    this.nestT = Math.max(HORDE.nestEveryMin, HORDE.nestEvery - HORDE.nestEveryPerHero * sim.chars.length);
    for (const n of this.nests) {
      if (alive >= this.maxAlive(sim)) break;
      // Sale del lado del nido que da al mapa.
      const l = Math.hypot(n.x, n.z) || 1;
      const kind: ZombieKind = sim.rng.chance(0.3) ? 'runner' : 'zombie';
      this.spawnAt(sim, kind, n.x - (n.x / l) * 1.5, n.z - (n.z / l) * 1.5);
      alive++;
    }
  }

  // ───────────── combustible y jefe ─────────────

  /** Puntos de piso firme repartidos por el mapa, lejos de los héroes y entre sí. */
  private spread(sim: Simulation, count: number): P2[] {
    const t = sim.terrain;
    const heroes = sim.chars.filter((c) => c.alive);
    const cand: P2[] = [];
    for (let i = 0; i < t.cells.length; i++) {
      const c = t.cells[i];
      if (c.type !== CellType.Floor || c.fragile >= 0 || c.pad || !t.isWalkable(i)) continue;
      const p = t.cellCenter(i % t.w, Math.floor(i / t.w));
      if (this.freeSpot(sim, p, 1.3)) cand.push(p);
    }
    const out: P2[] = [];
    while (out.length < count && cand.length) {
      let best = 0, bs = -Infinity;
      cand.forEach((p, i) => {
        let s = Infinity;
        for (const q of out) s = Math.min(s, d2(p, q));
        for (const h of heroes) s = Math.min(s, d2(p, h.pos));
        if (s > bs) { bs = s; best = i; }
      });
      out.push(cand.splice(best, 1)[0]);
    }
    return out;
  }

  private placeFuel(sim: Simulation) {
    const pts = this.spread(sim, HORDE.fuel);
    for (const p of pts) this.crates.push({ id: this.crateId++, kind: FUEL, x: p.x, y: sim.groundY(p.x, p.z, 0), z: p.z, t: 0 });
    this.fuelPlaced = Math.max(1, pts.length);
  }

  /** La Mole Madre sale por un borde lejano con su escolta. */
  private spawnBoss(sim: Simulation) {
    const ci = this.spawnCell(sim);
    if (ci < 0) return;
    const t = sim.terrain;
    const c = t.cellCenter(ci % t.w, Math.floor(ci / t.w));
    this.boss = this.spawnAt(sim, 'titan', c.x, c.z, HORDE.bossHp + HORDE.bossHpPerHero * sim.chars.length);
    for (let i = 0; i < HORDE.bossEscort; i++) this.pending.unshift('brute');
  }

  onStructureDown(sim: Simulation, st: Structure, by: Character | null) {
    if (st.kind !== 'nest') return;
    this.nests = this.nests.filter((n) => n !== st);
    if (by && by.unit === 'hero') by.destroyed++;
    sim.dropMaterials('stone', st.x, st.y + 0.8, st.z, HORDE.nestScrap);
    sim.emit({ k: 'alert', w: 'horde_nest', tm: this.nests.length, x: st.x, z: st.z });
  }

  // ───────────── cajas de suministros ─────────────

  /** Qué trae la próxima caja: más lanzacohetes con las oleadas, más botiquines con el equipo muy roto. */
  private rollCrate(sim: Simulation): number {
    let hurt = 0, n = 0;
    for (const c of sim.chars) if (c.alive) { hurt += 1 - c.hp / c.maxHp; n++; }
    // (el combustible no entra en el sorteo: lo pone su misión)
    const w = [30, 26, 10 + Math.min(12, this.wave), 16, n && hurt / n > 0.4 ? 32 : 8];
    let r = sim.rng.next() * w.reduce((s, x) => s + x, 0);
    for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i;
    return 0;
  }

  /** Una celda de piso firme para la caja: pegada a `near` si se pide, o a unos pasos de los héroes. */
  private crateCell(sim: Simulation, near: P2 | null): P2 | null {
    const t = sim.terrain;
    const ok: P2[] = [], any: P2[] = [];
    for (let i = 0; i < t.cells.length; i++) {
      const c = t.cells[i];
      if (c.type !== CellType.Floor || c.fragile >= 0 || c.pad || !t.isWalkable(i) || this.field[i] === Infinity) continue;
      const p = t.cellCenter(i % t.w, Math.floor(i / t.w));
      if (!this.freeSpot(sim, p, 1.3)) continue;
      any.push(p);
      if (near ? d2(p, near) > 1 && d2(p, near) < 3.4 : this.field[i] >= 2 && this.field[i] <= 7) ok.push(p);
    }
    if (ok.length) return sim.rng.pick(ok);
    if (!any.length) return null;
    if (!near) return sim.rng.pick(any);
    return any.reduce((a, b) => (d2(a, near) <= d2(b, near) ? a : b));
  }

  private dropCrate(sim: Simulation, kind: number, near: P2 | null = null) {
    // El campo de distancias hace falta para saber qué celdas alcanzan los héroes.
    if (!this.fieldOk) this.buildField(sim);
    const p = this.crateCell(sim, near);
    if (!p) return;
    this.crates.push({ id: this.crateId++, kind, x: p.x, y: sim.groundY(p.x, p.z, 0), z: p.z, t: 0 });
  }

  private take(sim: Simulation, c: Character, cr: Crate) {
    const kind = CRATE_KINDS[cr.kind];
    if (kind === 'fuel') { /* cuenta para la misión: ver tickMission */ }
    else if (kind === 'c4') c.c4 = Math.min(c4Max(c), c.c4 + C4.perCrate);
    else if (kind === 'med') {
      for (const h of sim.chars) if (h.alive && d2(h.pos, c.pos) <= HORDE.medRadius) sim.coolHeat(h, HORDE.medHeal);
    } else giveWeapon(sim, c, kind);
    c.pickups++;
    sim.emit({ k: 'loot', id: c.id, c: cr.kind, x: r1(cr.x), y: r1(cr.y), z: r1(cr.z) });
  }

  private tickCrates(sim: Simulation, dt: number) {
    this.crateT -= dt;
    if (this.crateT <= 0) {
      this.crateT = HORDE.crateEvery;
      if (this.crates.filter((c) => c.kind !== FUEL).length < HORDE.maxCrates) this.dropCrate(sim, this.rollCrate(sim));
    }
    for (const cr of this.crates) {
      cr.t += dt;
      if (cr.t < HORDE.crateLand) continue;
      for (const c of sim.chars) {
        if (!c.alive || d2(c.pos, cr) > HORDE.crateReach || Math.abs(c.pos.y - cr.y) > 1.6) continue;
        this.take(sim, c, cr);
        cr.t = -1;
        break;
      }
    }
    if (this.crates.some((c) => c.t < 0)) this.crates = this.crates.filter((c) => c.t >= 0);
  }

  // ───────────── IA de los zombis ─────────────

  /** Distancia a pie de cada celda al héroe vivo más cercano (subiendo solo por rampas, bajando por donde sea). */
  private buildField(sim: Simulation) {
    const t = sim.terrain;
    const f = this.field;
    this.fieldOk = true;
    f.fill(Infinity);
    const level = (i: number) => {
      const c = t.cells[i];
      return c.type === CellType.Ramp ? c.level + 0.5 : c.level;
    };
    const open: number[] = [];
    for (const h of sim.chars) {
      if (!h.alive) continue;
      const ci = t.cellIndexAt(h.pos.x, h.pos.z);
      if (ci >= 0 && t.isWalkable(ci) && f[ci] !== 0) { f[ci] = 0; open.push(ci); }
    }
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open.splice(bi, 1)[0];
      const cx = cur % t.w, cz = Math.floor(cur / t.w);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= t.w || nz >= t.h) continue;
          const ni = nz * t.w + nx;
          if (!t.isWalkable(ni)) continue;
          if (dx && dz && (!t.isWalkable(cz * t.w + nx) || !t.isWalkable(nz * t.w + cx))) continue;
          // El zombi camina de `ni` a `cur`: no puede subir más de medio nivel (no salta).
          if (level(cur) - level(ni) > 0.55) continue;
          const nc = f[cur] + (dx && dz ? 1.42 : 1);
          if (nc < f[ni]) {
            if (f[ni] === Infinity) open.push(ni);
            f[ni] = nc;
          }
        }
      }
    }
  }

  /** Hacia dónde caminar para acercarse a un héroe: la celda vecina que más baja en el campo. */
  private nextStep(sim: Simulation, u: Character): P2 | null {
    const t = sim.terrain;
    const ci = t.cellIndexAt(u.pos.x, u.pos.z);
    if (ci < 0 || this.field[ci] === Infinity) return null;
    const cx = ci % t.w, cz = Math.floor(ci / t.w);
    let best = -1, bv = this.field[ci];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= t.w || nz >= t.h) continue;
        const ni = nz * t.w + nx;
        if (this.field[ni] === Infinity) continue;
        if (dx && dz && (!t.isWalkable(cz * t.w + nx) || !t.isWalkable(nz * t.w + cx))) continue;
        const v = this.field[ni] + (dx && dz ? 0.42 : 0);
        if (v < bv) { bv = v; best = ni; }
      }
    }
    return best < 0 ? null : t.cellCenter(best % t.w, Math.floor(best / t.w));
  }

  preTick(sim: Simulation, dt: number) {
    if (sim.phase !== 'play') {
      for (const u of sim.units) { u.input.mx = 0; u.input.mz = 0; }
      return;
    }
    this.fieldT -= dt;
    if (this.fieldT <= 0) {
      this.fieldT = 0.4;
      this.buildField(sim);
    }
    for (const u of sim.units) if (u.alive) this.think(sim, u, dt);
  }

  private think(sim: Simulation, u: Character, dt: number) {
    const ai = u.ai as ZombieAI | null;
    const inp = u.input;
    inp.mx = 0; inp.mz = 0;
    if (!ai) return;
    if (u.grounded) { ai.gx = u.pos.x; ai.gy = u.pos.y; ai.gz = u.pos.z; }
    if (u.stun > 0 || u.hitstun > 0 || u.tumble > 0) { ai.windup = 0; ai.aim = null; return; }
    const def = ZOMBIES[ai.kind];

    ai.think -= dt;
    if (ai.think <= 0 || !ai.target || !ai.target.alive) {
      ai.think = 0.35;
      let best: Character | null = null, bd = Infinity;
      for (const h of sim.chars) {
        if (!h.alive || h.invuln > 0.6) continue;
        // Se queda con el que ya perseguía salvo que otro esté claramente más cerca.
        const d = d2(u.pos, h.pos) - (h === ai.target ? 2 : 0);
        if (d < bd) { bd = d; best = h; }
      }
      ai.target = best;
    }
    const tg = ai.target;
    if (!tg) return;
    inp.ax = tg.pos.x; inp.az = tg.pos.z;

    // Golpe en preparación: quieto hasta que sale.
    if (ai.windup > 0) {
      ai.windup -= dt;
      if (ai.windup <= 0) this.strike(sim, u, def, ai, tg);
      return;
    }

    const dist = d2(u.pos, tg.pos);
    const gap = dist - CHAR_RADIUS * 2;
    const sameFloor = Math.abs(tg.pos.y - u.pos.y) < LEVEL_H + 0.4;
    if (gap <= def.range && sameFloor && u.cds.basic <= 0 && (ai.kind !== 'spitter' || gap > 1.5)) {
      ai.windup = def.windup;
      if (def.slam) sim.telegraph('quake', ZOMBIE_TEAM, u.pos.x, u.pos.y, u.pos.z, def.slam, def.windup);
      if (ai.kind === 'spitter') {
        // Apunta adonde va a estar el héroe y avisa dónde cae.
        ai.aim = { x: tg.pos.x + tg.vel.x * SPIT_TIME * 0.5, z: tg.pos.z + tg.vel.z * SPIT_TIME * 0.5 };
        sim.telegraph('quake', ZOMBIE_TEAM, ai.aim.x, sim.groundY(ai.aim.x, ai.aim.z, tg.pos.y), ai.aim.z, SPIT_RADIUS, def.windup + SPIT_TIME);
      }
      return;
    }

    let goal: P2 | null;
    if (ai.kind === 'spitter' && gap < 4 && sameFloor) {
      // El escupidor no se deja alcanzar: retrocede.
      goal = { x: u.pos.x + (u.pos.x - tg.pos.x), z: u.pos.z + (u.pos.z - tg.pos.z) };
    } else if (ai.kind === 'spitter' && gap <= def.range && sameFloor) {
      goal = null;
    } else {
      goal = dist < 2.6 && sameFloor ? tg.pos : this.nextStep(sim, u) ?? tg.pos;
    }
    if (goal) [inp.mx, inp.mz] = steer(sim, u, goal.x, goal.z);

    // Trabado (un héroe subido a donde no llega, un muro que apareció): volver a salir por otro borde.
    const moving = Math.hypot(u.vel.x, u.vel.z) > 0.4;
    ai.stuck = moving || gap <= def.range + 1 ? 0 : ai.stuck + dt;
    if (ai.stuck > HORDE.stuck) {
      ai.stuck = 0;
      const ci = this.spawnCell(sim);
      if (ci >= 0) {
        const t = sim.terrain;
        const c = t.cellCenter(ci % t.w, Math.floor(ci / t.w));
        u.pos = { x: c.x, y: sim.groundY(c.x, c.z, 0), z: c.z };
        u.ppos = { ...u.pos };
        u.vel = { x: 0, y: 0, z: 0 };
        sim.emit({ k: 'gad', w: 'rise', i: -1, id: u.id, x: u.pos.x, y: u.pos.y, z: u.pos.z });
      }
    }
  }

  private strike(sim: Simulation, u: Character, def: ZombieDef, ai: ZombieAI, tg: Character) {
    u.cds.basic = def.cd;
    const dmg = def.dmg * this.level.dmg * (1 + HORDE.threatDmg * this.step);
    if (def.slam) {
      sim.blast(u, ZOMBIE_TEAM, u.pos.x, u.pos.y + 0.6, u.pos.z, { radius: def.slam, heat: dmg, kb: def.kb, up: 1.5, destruct: 30, tile: 30, fx: 'slam' }, NO_MODS);
      sim.emit({ k: 'uatk', id: u.id, tg: tg.id });
      return;
    }
    if (ai.kind === 'spitter') {
      const a = ai.aim ?? tg.pos;
      ai.aim = null;
      sim.lob(u, 'goolob', a.x, a.z, SPIT_TIME, (x, y, z) => {
        sim.blast(u, ZOMBIE_TEAM, x, y + 0.4, z, { radius: SPIT_RADIUS, heat: dmg, kb: def.kb, slow: [0.35, 1.2], fx: 'goo' }, NO_MODS);
      });
      return;
    }
    sim.emit({ k: 'uatk', id: u.id, tg: tg.id });
    // Si el héroe se corrió mientras preparaba el golpe, pega al aire.
    const dx = tg.pos.x - u.pos.x, dz = tg.pos.z - u.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (!tg.alive || d - CHAR_RADIUS * 2 > def.range + 0.7 || Math.abs(tg.pos.y - u.pos.y) > 1.6) return;
    sim.hit(tg, u, { heat: dmg, kb: def.kb, dirX: dx / d, dirZ: dz / d, fx: 'minion' });
  }

  onUnitDeath(sim: Simulation, u: Character, killer: Character | null, fell: boolean) {
    this.kills++;
    // Chatarra: queda donde cayó (o en el último lugar firme que pisó, si se fue al vacío).
    const ai = u.ai as ZombieAI | null;
    if (ai) {
      const n = ZOMBIES[ai.kind].scrap;
      if (fell) sim.dropMaterials(u.family, ai.gx, ai.gy + 0.8, ai.gz, n);
      else sim.dropMaterials(u.family, u.pos.x, u.pos.y + 0.8, u.pos.z, n);
    }
    if (!killer || killer.unit !== 'hero') return;
    killer.cs++;
    const cold = perkLv(killer, 'cold');
    if (cold) sim.coolHeat(killer, PERK.cold * cold);
    // Reacción en cadena: el que cae explota, y lo que mate esa explosión explota también.
    const chain = perkLv(killer, 'chain');
    if (chain && !fell) {
      const { x, y, z } = u.pos;
      sim.schedule(PERK.chainDelay, () => {
        sim.blast(killer, killer.team, x, y + 0.6, z, {
          radius: PERK.chainRadius + PERK.chainRadiusPerLevel * (chain - 1), heat: PERK.chainHeat * chain, kb: PERK.chainKb, up: 1.5, fx: 'chain',
        }, NO_MODS);
      });
    }
  }

  result(sim: Simulation): ModeResult | null {
    if (this.won) return { winner: 0, draw: false, reason: `Extracción completa en la oleada ${this.wave}` };
    if (sim.chars.every((c) => c.eliminated)) {
      return { winner: ZOMBIE_TEAM, draw: false, reason: `La horda ganó en la oleada ${Math.max(1, this.wave)} (misión ${this.step + 1} de ${MISSIONS.length})` };
    }
    return null;
  }

  hud(sim: Simulation): ModeHud {
    let lives = 0;
    for (const c of sim.chars) lives += c.lives;
    const m = this.mission;
    const z = this.zone;
    const fuel = this.crates.filter((c) => c.kind === FUEL).length;
    const p = m.kind === 'nests' ? 1 - this.nests.length / this.nestsPlaced
      : m.kind === 'fetch' ? 1 - fuel / this.fuelPlaced
      : m.kind === 'boss' ? (this.boss && this.boss.alive ? 1 - Math.max(0, this.boss.hp / this.boss.maxHp) : 1)
      : Math.min(1, this.prog / m.need);
    return {
      id: 'horde', title: 'Horda', label: 'misiones', time: Math.max(0, this.waveT), scores: [lives, this.kills], target: MISSIONS.length,
      zone: z ? { x: z.x, y: z.y, z: z.z, r: z.r, owner: this.inside >= this.needIn ? 0 : -1, contested: this.contested, next: 0 } : undefined,
      horde: {
        wave: this.wave, left: this.aliveCount(sim) + this.pending.length, next: Math.max(0, Math.ceil(this.waveT)), lives,
        step: this.won ? MISSIONS.length : this.step, p: Math.round(p * 100) / 100, in: this.inside, need: this.needIn, nests: this.nests.length,
        boss: this.boss && this.boss.alive ? this.boss.id : -1,
        crates: this.crates.map((c) => [c.id, r1(c.x), r1(c.y), r1(c.z), c.kind]),
        bases: this.bases.map((b) => [r1(b.x), r1(b.y), r1(b.z)]),
      },
    };
  }
}

export function createHordeMode(): GameMode {
  return new HordeMode();
}
