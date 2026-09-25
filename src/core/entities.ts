// Entidades de la simulación (solo viven en el host; los clientes ven "frames").
import type { Obstacle } from './collision';
import { emptyInput, type InputFrame } from './input';
import type { Mods } from './mutations';
import type { V3 } from './math';
import type { MoveState } from './movement';
import type { AbilitySlot, Family, HeroId, Materials, Route } from './types';
import { emptyMats } from './types';

export type Slot = AbilitySlot | 'basic' | 'push' | 'i1' | 'i2' | 'i3';
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
  mats: Materials = emptyMats();
  passives: string[] = [];
  actives: (string | null)[] = [null, null, null];
  mutations: Partial<Record<AbilitySlot, Route>> = {};

  lastHits = new Map<number, number>(); // atacante -> tick
  launcher = -1; // quién lanzó este cuerpo (para crédito de billar y paredes)
  bodyHits = new Map<number, number>();
  kills = 0;
  deaths = 0;
  assists = 0;
  heatDealt = 0;
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
  kind: string; // wall | stonewall | turret
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

export const DESTRUCT_DEF: Record<Family, { size: number; h: number; hp: number }> = {
  stone: { size: 1.4, h: 1.3, hp: 70 },
  metal: { size: 1.4, h: 1.35, hp: 55 },
  crystal: { size: 1.1, h: 1.8, hp: 45 },
  goo: { size: 1.3, h: 1.0, hp: 40 },
};
