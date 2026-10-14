// Entidades de la simulación (solo viven en el host; los clientes ven "frames").
import type { Obstacle } from './collision';
import { AIR_DASHES } from './constants';
import { emptyInput, type InputFrame } from './input';
import type { Mods } from './mutations';
import type { V3 } from './math';
import type { MoveState } from './movement';
import type { AbilitySlot, Family, HeroId, Materials, Route } from './types';
import { emptyMats } from './types';

export type Slot = AbilitySlot | 'basic' | 'push' | 'i1' | 'i2' | 'i3';

/**
 * Qué es un cuerpo: un héroe (jugador o bot) o una unidad del modo Asedio (esbirros, neutrales).
 * Las unidades usan la misma física, knockback y ring-out que los héroes (se pueden tirar al vacío),
 * pero tienen vida (hp) en vez de heat y las maneja la IA del modo, no un InputFrame de jugador.
 */
export type UnitKind = 'hero' | 'melee' | 'ranged' | 'siege' | 'neutral' | 'coloso' | 'zombie' | 'runner' | 'brute' | 'spitter' | 'titan';
/** El índice viaja por la red: los tipos nuevos se agregan siempre al final. */
export const UNIT_KINDS: UnitKind[] = ['hero', 'melee', 'ranged', 'siege', 'neutral', 'coloso', 'zombie', 'runner', 'brute', 'spitter', 'titan'];
export const SLOTS: Slot[] = ['q', 'e', 'f', 'r', 'basic', 'push', 'i1', 'i2', 'i3'];

export interface ActionState {
  kind: string; // dash | leap | roll | wind | zip
  t: number;
  dur: number;
  lock: boolean; // controla la velocidad
  direct: boolean; // controla la posición directamente (sin física)
  noGravity: boolean;
  noCast: boolean;
  slow: number; // multiplicador de velocidad si no bloquea
  data: any;
}

export class Character implements MoveState {
  unit: UnitKind = 'hero';
  /** Vida: la de las unidades y la de los héroes en reglas con `health` (Horda). Sin ellas los héroes se agrietan con heat y mueren por ring-out. */
  hp = 0;
  maxHp = 0;
  /** Unidades: estado de su IA (lo maneja el modo). */
  ai: any = null;
  /** Canalizando "volver a la base" (segundos acumulados, 0 = no). */
  recallT = 0;
  /** Último tick en que este héroe le pegó a un héroe rival, y a quién (los esbirros acuden). */
  hitHeroTick = -9999;
  hitHeroVictim = -1;
  pos: V3;
  ppos: V3;
  vel: V3 = { x: 0, y: 0, z: 0 };
  facing = 0;
  grounded = true;
  airJumps = 1;
  coyote = 0;
  prevB = 0;
  tumble = 0;
  hitstun = 0;
  stun = 0;
  hitSlide = 0;
  dashT = 0;
  dashCd = 0;
  dashX = 0;
  dashZ = 0;
  airDashes = AIR_DASHES;

  alive = true;
  respawnT = 0;
  lives = 3;
  eliminated = false;
  invuln = 0;
  kbImmune = 0;
  heat = 0;
  stage = 0;
  shield = 0;
  shieldT = 0;
  slowT = 0;
  slowAmt = 0;
  hasteT = 0;
  hasteAmt = 0;
  armorT = 0;
  armorAmt = 0;
  refractT = 0;
  lastHitTick = -9999;

  cds: Record<Slot, number> = { q: 0, e: 0, f: 0, r: 0, basic: 0, push: 0, i1: 0, i2: 0, i3: 0 };
  cdMax: Record<Slot, number> = { q: 1, e: 1, f: 1, r: 1, basic: 1, push: 1, i1: 1, i2: 1, i3: 1 };
  charging = false;
  pushCharge = 0;
  repairT = 0;
  action: ActionState | null = null;
  buffered: { slot: Slot; t: number } | null = null;

  level = 1;
  xp = 0;
  ult = 0; // carga de ulti 0..1 (reglas con ultCharge)
  mats: Materials = emptyMats();
  passives: string[] = [];
  actives: (string | null)[] = [null, null, null];
  mutations: Partial<Record<AbilitySlot, Route>> = {};

  /** Último tick en que embistió cobertura con el dash (reglas con `dashBreak`). */
  ramTick = -9999;
  /** Agarrar (reglas con `grab`, ver core/sim.ts): a quién agarro, quién me agarra (-1 = nadie), cuánto dura el
   *  agarre en curso y, tras soltarme, cuánto me falta para poder ser agarrado de nuevo. */
  grabbing = -1;
  grabbedBy = -1;
  grabT = 0;
  grabImmuneT = 0;
  lastHits = new Map<number, number>(); // atacante -> tick
  launcher = -1; // quién lanzó este cuerpo (para crédito de billar y paredes)
  bodyHits = new Map<number, number>();
  kills = 0;
  deaths = 0;
  assists = 0;
  cs = 0; // unidades rematadas (Asedio)
  heatDealt = 0;
  // Armas (reglas con `weapons`, ver core/weapons.ts): índices en WEAPON_IDS.
  /** Arma en la mano. 0 = pistola. */
  weapon = 0;
  /** Arma principal que lleva además de la pistola (-1 = ninguna) y las balas que le quedan. */
  primary = -1;
  ammo = 0;
  /** Cargas de C4. */
  c4 = 0;
  /** > 0: acaba de disparar (se mueve más lento, ver WeaponDef.move). */
  gunT = 0;
  gunMove = 1;
  // Mejoras (core/perks.ts): cuántas veces eligió cada una (por índice en PERK_IDS), las que tiene para elegir
  // ahora (índices; vacío = ninguna oferta), los segundos que le quedan para decidir y las ofertas que le deben.
  perks: number[] = [];
  offer: number[] = [];
  offerT = 0;
  picks = 0;
  // Estadísticas para premios y feedback
  destroyed = 0;
  pickups = 0;
  billiards = 0;
  bestLaunch = 0;
  lethals = 0;
  saves = 0;
  lethalAt = -1; // tick en que recibió un golpe letal (para detectar salvadas)
  crystalBurstUsed = false;

  input: InputFrame = emptyInput();
  ack = 0;
  disconnected = false;
  hat = 'none';
  stats: Stats = baseStats();

  constructor(
    public id: number,
    public pid: string,
    public name: string,
    public team: number,
    public hero: HeroId,
    public family: Family,
    public bot: boolean,
    spawn: V3,
  ) {
    this.pos = { ...spawn };
    this.ppos = { ...spawn };
  }
}

export interface Stats {
  speed: number;
  heatDealt: number;
  heatTaken: number;
  kbTaken: number;
  cdMul: number;
  airControl: number;
  restitution: number;
  maxAirJumps: number;
  jumpMul: number;
  regen: boolean;
  structHp: number;
  slamImmune: boolean;
}

export const baseStats = (): Stats => ({
  speed: 6.2, heatDealt: 1, heatTaken: 1, kbTaken: 1, cdMul: 1, airControl: 1, restitution: 0.3,
  maxAirJumps: 1, jumpMul: 1, regen: false, structHp: 1, slamImmune: false,
});

export interface HitSpec {
  heat: number;
  kb: number;
  dirX: number;
  dirZ: number;
  up?: number;
  stun?: number;
  slow?: [number, number];
  noLaunch?: boolean;
  /** El knockback no escala con la etapa de la víctima (artefactos del mapa: pegan igual a todos). */
  flat?: boolean;
  /** No emite el evento de golpe (balas en ráfaga: el disparo ya viaja como evento `shot`). */
  quiet?: boolean;
  fx?: string;
}

export interface Projectile {
  id: number;
  kind: string;
  owner: number;
  team: number;
  pos: V3;
  ppos: V3;
  vel: V3;
  radius: number;
  range: number;
  gravity: number;
  heat: number;
  kb: number;
  up: number;
  stun: number;
  slow?: [number, number];
  pierce: boolean;
  hit: Set<number>;
  destruct: number;
  tile: number;
  noCharHit: boolean;
  explode?: BlastSpec;
  onHit?: (target: Character) => void;
  onSolid?: (pos: V3, obstacle: Obstacle | null) => void;
  onEnd?: (pos: V3) => void;
  mods: Mods;
  dead: boolean;
  ignoreSolid: boolean;
  life: number; // ticks restantes para proyectiles parabólicos (-1 = no aplica)
  /** Teledirigido a este cuerpo (disparos de torre): lo sigue y solo le puede pegar a él. -1 = no. */
  homing: number;
}

export interface BlastSpec {
  radius: number;
  heat: number;
  kb: number;
  up?: number;
  stun?: number;
  destruct?: number;
  tile?: number;
  tileRadius?: number;
  fx: string;
  slow?: [number, number];
}

export interface Zone {
  id: number;
  kind: string;
  owner: number;
  team: number;
  x: number; y: number; z: number;
  r: number;
  t: number;
  dur: number;
  tick?: (z: Zone, dt: number) => void;
  end?: (z: Zone) => void;
}

export interface Telegraph {
  id: number;
  kind: string;
  team: number;
  x: number; z: number; y: number;
  r: number;
  t: number;
  dur: number;
}

export interface Structure {
  id: number;
  kind: string; // wall | stonewall | turret | tower | core
  owner: number;
  team: number;
  family: Family;
  x: number; y: number; z: number;
  hw: number; hd: number; h: number;
  rot: number;
  hp: number;
  maxHp: number;
  t: number;
  dur: number;
  fireT: number;
  obstacle: Obstacle;
  mods?: Mods;
  /** Pieza fija del mapa (torre, núcleo): sin dueño ni vencimiento. */
  fixed?: boolean;
  /** No recibe daño (p. ej. torre interior mientras la exterior está en pie). */
  invuln?: boolean;
  /** Multiplicador del daño que recibe (p. ej. 0.4 sin esbirros rivales cerca). */
  armor?: number;
  /** A quién le está apuntando (torres), -1 nadie. Se ve en el cliente como una línea. */
  target?: number;
  /** Último que le pegó y cuándo (para avisos de "tu torre está bajo ataque"). */
  lastHitBy?: number;
  lastHitTick?: number;
  /** Estado del modo (línea, nivel de torre, rampa de daño...). */
  ai?: any;
}

export interface Destructible {
  idx: number;
  kind: Family;
  x: number; y: number; z: number;
  hp: number;
  maxHp: number;
  stage: number; // 0..2 vivo, 3 destruido
  respawnT: number;
  obstacle: Obstacle;
  /** Barril: explota al romperse y no suelta material. */
  explosive?: boolean;
}

export interface Pickup {
  id: number;
  mat: number; // índice en FAMILIES
  pos: V3;
  vel: V3;
  t: number;
  grounded: boolean;
  target: number;
}

/** Artefacto del mapa en la simulación (ver gadgets.ts). */
export interface Gadget {
  idx: number;
  kind: import('./gadgets').GadgetKind;
  x: number; y: number; z: number;
  /** Cajas: disponible para agarrar. */
  on: boolean;
  /** Cajas: segundos para reaparecer. */
  t: number;
  /** Géiser: ya avisó este chorro. */
  fired: boolean;
  /** Último tick en que le pegó a cada cuerpo (para no pegar todos los ticks). */
  last: Map<number, number>;
  /** Lanzabolas: hacia dónde ruedan las bolas y cuántos metros recorren. */
  dx: number; dz: number; len: number;
}

export const DESTRUCT_DEF: Record<Family, { size: number; h: number; hp: number }> = {
  stone: { size: 1.4, h: 1.3, hp: 70 },
  metal: { size: 1.4, h: 1.35, hp: 55 },
  crystal: { size: 1.1, h: 1.8, hp: 45 },
  goo: { size: 1.3, h: 1.0, hp: 40 },
};
