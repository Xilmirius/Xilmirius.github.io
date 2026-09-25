// Asedio (MOBA): números del modo. Todo lo tuneable vive acá (igual que constants.ts para el núcleo).
// Ver docs/MOBA.md para el porqué de cada número.
import type { UnitKind } from '../entities';
import type { Family } from '../types';

export type MobaUnit = Exclude<UnitKind, 'hero'>;

export interface UnitDef {
  name: string;
  family: Family;
  hp: number;
  speed: number;
  kbTaken: number;
  /** Alcance de ataque (borde a borde) y distancia a la que se enoja con algo. */
  range: number;
  aggro: number;
  /** Segundos entre ataques. */
  cd: number;
  /** Heat/daño por ataque a cuerpos, y daño a torres/núcleo. */
  heat: number;
  kb: number;
  structDmg: number;
  /** XP que reparte al morir (entre los héroes rivales cerca) y materiales para quien lo remata. */
  xp: number;
  reward: number;
  melee: boolean;
}

export const UNIT_DEFS: Record<MobaUnit, UnitDef> = {
  melee: { name: 'Guijarro', family: 'stone', hp: 62, speed: 4.3, kbTaken: 0.9, range: 1.4, aggro: 7, cd: 1.1, heat: 5, kb: 3, structDmg: 18, xp: 16, reward: 1, melee: true },
  ranged: { name: 'Chispa', family: 'crystal', hp: 40, speed: 4.3, kbTaken: 1, range: 6, aggro: 7.5, cd: 1.4, heat: 4, kb: 0, structDmg: 12, xp: 14, reward: 1, melee: false },
  siege: { name: 'Ariete', family: 'metal', hp: 150, speed: 3.9, kbTaken: 0.5, range: 7, aggro: 8, cd: 2.4, heat: 8, kb: 6, structDmg: 60, xp: 35, reward: 3, melee: false },
  neutral: { name: 'Babosa', family: 'goo', hp: 95, speed: 4.6, kbTaken: 0.8, range: 1.6, aggro: 0, cd: 1.2, heat: 6, kb: 4, structDmg: 0, xp: 26, reward: 2, melee: true },
  coloso: { name: 'Coloso', family: 'stone', hp: 760, speed: 0, kbTaken: 0.06, range: 4.2, aggro: 0, cd: 3.2, heat: 16, kb: 17, structDmg: 0, xp: 70, reward: 0, melee: true },
};

/** Torres: la exterior (nivel 1) protege a la interior (nivel 2), las dos protegen al núcleo. */
export const TOWER = {
  hp: [0, 650, 850] as number[], // por nivel
  hw: 0.9,
  h: 4,
  range: 8.5,
  cd: 1,
  /** Heat a héroes: sube con cada disparo seguido al mismo héroe (no conviene quedarse abajo). */
  heat: 9,
  ramp: 1.35,
  rampMax: 3,
  kb: 9,
  /** Daño a esbirros. */
  unitDmg: 14,
  /** Cerca de una torre propia te enfriás de a poco si no te pegan. */
  coolRadius: 9,
  cool: 4,
  coolDelay: 3,
  /** Blindaje de los primeros minutos (las torres no caen antes de que la partida arranque de verdad). */
  earlyArmor: 0.5,
  earlyTime: 210,
};

export const CORE = { hp: 1300, hw: 1.6, h: 3.4, range: 7, cd: 1.3, heat: 8, kb: 11, unitDmg: 18 };

export const WAVE = {
  /** Primera oleada a los N s de empezar; después cada `every`. */
  first: 4,
  every: 24,
  melee: 3,
  ranged: 2,
  /** Cada cuántas oleadas viene un Ariete. */
  siegeEvery: 2,
  /** Separación entre esbirros de la misma oleada al salir (s). */
  gap: 0.55,
  /** Los esbirros ganan vida con el tiempo (por minuto) y pegan más a las estructuras. */
  scalePerMin: 0.07,
  structPerMin: 0.06,
};

/** Base: refugio y forja. Te enfría rápido; al rival lo quema y lo echa. */
export const FOUNTAIN = { cool: 60, every: 0.4, heat: 18, kb: 20 };

/** Reaparecer: tarda más cuanto más nivel tenés. */
export const RESPAWN = { base: 4, perLevel: 1.2 };

export const COLOSO = { first: 120, respawn: 150, buff: 90, slamWindup: 0.75, radius: 4.2, leash: 7, regen: 0.06 };
/** Bendición del Coloso: esbirros del equipo con más vida y más daño. */
export const BLESSING = { hp: 1.5, dmg: 1.3, structDmg: 1.6 };

export const CAMP = { perCamp: 2, respawn: 50, leash: 6.5 };

/** Los héroes les pegan más fuerte a las unidades (limpiar una oleada no puede ser eterno). */
export const HERO_VS_UNIT = 2;
/** Sin esbirros rivales cerca, torres y núcleo reciben menos daño (no se "roban" sin oleada). */
export const BACKDOOR = { armor: 0.4, radius: 12 };

/** Recompensas en materiales. */
export const REWARD = { kill: 3, assist: 1, structEach: 1, structXp: 80, colosoXp: 60, colosoMats: 2 };
/** Radio en el que los héroes comparten la XP de una unidad que muere. */
export const XP_SHARE_RADIUS = 13;

/** Se acaba el tiempo: los núcleos quedan vulnerables y los esbirros pegan el doble a estructuras. */
export const SUDDEN = { extra: 180, structMul: 2 };
