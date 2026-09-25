// Reglas de partida: QUÉ sistemas del núcleo están prendidos. Es la otra mitad de un "modo de juego":
//   GameMode (modes.ts) decide CÓMO se gana (vidas, ring-outs, zona...).
//   Ruleset  (este archivo) decide CON QUÉ se juega (niveles, forja, ítems, dash, carga de ulti...).
// Un modo nuevo (MOBA, battle royale, carrera de obstáculos) es una combinación de los dos más un
// tipo de mapa. La simulación nunca pregunta "¿estoy en el modo X?": pregunta "¿está prendido el sistema Y?".
// Ver docs/PLATAFORMA_Y_MODOS.md.
import type { AbilitySlot } from './types';

export type RulesetId = 'brawl' | 'full' | 'moba';
/** Reglas que se eligen a mano en el lobby. 'moba' viene atada al modo Asedio (necesita bases). */
export const RULESET_IDS: RulesetId[] = ['brawl', 'full'];

export interface Ruleset {
  id: RulesetId;
  name: string;
  icon: string;
  desc: string;
  /** Niveles y XP dentro de la partida: desbloquean habilidades y dan stats. Apagado: todo desbloqueado desde el inicio. */
  progression: boolean;
  /** Forja (C): ítems pasivos/activos y mutaciones de habilidad. */
  crafting: boolean;
  /** Reparar el cuerpo gastando material (V). */
  repair: boolean;
  /** Qué hacen los trozos que sueltan los destructibles: nada, materiales para la forja o carga de ulti. */
  pickups: 'none' | 'materials' | 'ult';
  /** Dash universal (Shift). */
  dash: boolean;
  /** La ulti se carga pegando y juntando trozos (en vez de desbloquearse por nivel y tener enfriamiento). */
  ultCharge: boolean;
  /** La forja solo funciona en tu base (o mientras esperás para volver): hay que volver a comprar. */
  forgeAtBase: boolean;
  /** B: volver a la base canalizando unos segundos. */
  recall: boolean;
  /** Segundos para que una baldosa frágil que se cayó vuelva a estar (0 = nunca). */
  tileRegen: number;
  /** Multiplicador de la XP (el Asedio es más largo: se sube de nivel más despacio). */
  xpMul: number;
}

export const RULESETS: Record<RulesetId, Ruleset> = {
  brawl: {
    id: 'brawl', name: 'Brawler', icon: '⚡',
    desc: 'Rápido y directo: todas las habilidades desde el principio, la ulti se carga pegando y Shift es un dash. Sin niveles, forja ni ítems que administrar.',
    progression: false, crafting: false, repair: false, pickups: 'ult', dash: true, ultCharge: true,
    forgeAtBase: false, recall: false, tileRegen: 0, xpMul: 1,
  },
  full: {
    id: 'full', name: 'Completo', icon: '🧬',
    desc: 'Todos los sistemas: niveles que desbloquean habilidades, materiales, forja de ítems y mutaciones, reparación. Es la base del futuro modo MOBA.',
    progression: true, crafting: true, repair: true, pickups: 'materials', dash: true, ultCharge: false,
    forgeAtBase: false, recall: false, tileRegen: 0, xpMul: 1,
  },
  moba: {
    id: 'moba', name: 'Asedio', icon: '🏰',
    desc: 'Las del modo Asedio (MOBA): niveles, materiales que sueltan los esbirros, forja solo en tu base, B para volver y el piso roto se rearma solo.',
    progression: true, crafting: true, repair: true, pickups: 'materials', dash: true, ultCharge: false,
    forgeAtBase: true, recall: true, tileRegen: 25, xpMul: 0.55,
  },
};

export const getRules = (id: string | undefined): Ruleset => RULESETS[id as RulesetId] ?? RULESETS.brawl;

/** Reglas efectivas de una partida: el modo Asedio siempre juega con las suyas. */
export const rulesFor = (s: { mode: string; rules?: string }): Ruleset => getRules(s.mode === 'moba' ? 'moba' : s.rules);

/** Nivel en que se desbloquea una habilidad con estas reglas (sin progresión: todas desde el inicio). */
export const unlockLevel = (rules: Ruleset, def: { unlock: number }) => (rules.progression ? def.unlock : 1);

/** La ulti usa carga en vez de enfriamiento. */
export const usesUltCharge = (rules: Ruleset, slot: AbilitySlot) => slot === 'r' && rules.ultCharge;
