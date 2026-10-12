// Reglas de partida: QUÉ sistemas del núcleo están prendidos. Es la otra mitad de un "modo de juego":
//   GameMode (modes.ts) decide CÓMO se gana (vidas, ring-outs, zona...).
//   Ruleset  (este archivo) decide CON QUÉ se juega (niveles, forja, ítems, dash, carga de ulti...).
// Un modo nuevo (MOBA, battle royale, carrera de obstáculos) es una combinación de los dos más un
// tipo de mapa. La simulación nunca pregunta "¿estoy en el modo X?": pregunta "¿está prendido el sistema Y?".
// Ver docs/PLATAFORMA_Y_MODOS.md.
import { rulesetFor } from './games';
import type { AbilitySlot } from './types';

export type RulesetId = 'brawl' | 'full' | 'moba' | 'race' | 'horde';

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
  /** El piso frágil se cae al pisarlo (no hace falta romperlo a golpes). */
  tileStep: boolean;
  /** Daño que le hace el dash a la cobertura contra la que choca (0 = no la rompe). */
  dashBreak: number;
  /** Multiplicador de la XP (el Asedio es más largo: se sube de nivel más despacio). */
  xpMul: number;
  /** Habilidades del héroe (Q, 2, 3 y ulti). Apagado: solo golpes, empujón, salto y dash. */
  abilities: boolean;
  /** Las cajas del mapa dan ítems activos de un solo uso. */
  itemBoxes: boolean;
  /** Armas: el clic dispara en vez del golpe básico del héroe (ver core/weapons.ts). */
  weapons: boolean;
}

export const RULESETS: Record<RulesetId, Ruleset> = {
  brawl: {
    id: 'brawl', name: 'Brawler', icon: '⚡',
    desc: 'Rápido y directo: todas las habilidades desde el principio, la ulti se carga pegando y Shift es un dash. Sin niveles, forja ni ítems que administrar.',
    progression: false, crafting: false, repair: false, pickups: 'ult', dash: true, ultCharge: true,
    forgeAtBase: false, recall: false, tileRegen: 0, tileStep: false, dashBreak: 0, xpMul: 1, abilities: true, itemBoxes: false, weapons: false,
  },
  full: {
    id: 'full', name: 'Completo', icon: '🧬',
    desc: 'Todos los sistemas: niveles que desbloquean habilidades, materiales, forja de ítems y mutaciones, reparación. Es la base del futuro modo MOBA.',
    progression: true, crafting: true, repair: true, pickups: 'materials', dash: true, ultCharge: false,
    forgeAtBase: false, recall: false, tileRegen: 0, tileStep: false, dashBreak: 0, xpMul: 1, abilities: true, itemBoxes: false, weapons: false,
  },
  moba: {
    id: 'moba', name: 'Asedio', icon: '🏰',
    desc: 'Las del modo Asedio (MOBA): niveles, materiales que sueltan los esbirros, forja solo en tu base, B para volver y el piso roto se rearma solo.',
    progression: true, crafting: true, repair: true, pickups: 'materials', dash: true, ultCharge: false,
    forgeAtBase: true, recall: true, tileRegen: 25, tileStep: false, dashBreak: 0, xpMul: 0.55, abilities: true, itemBoxes: false, weapons: false,
  },
  race: {
    id: 'race', name: 'Carrera', icon: '🏁',
    desc: 'Las de la Carrera de obstáculos: sin habilidades de héroe. Golpes, empujón, salto y dash, más los ítems de un solo uso que dan las cajas. El dash rompe la cobertura y el piso flojo se cae al pisarlo.',
    progression: false, crafting: false, repair: false, pickups: 'none', dash: true, ultCharge: false,
    forgeAtBase: false, recall: false, tileRegen: 4, tileStep: true, dashBreak: 50, xpMul: 1, abilities: false, itemBoxes: true, weapons: false,
  },
  horde: {
    id: 'horde', name: 'Horda', icon: '🔫',
    desc: 'Las de la Horda: armas en vez de poderes. Clic dispara, el empujón te saca zombis de encima y hay C4. Las armas y la munición caen en cajas.',
    progression: false, crafting: false, repair: false, pickups: 'none', dash: true, ultCharge: false,
    forgeAtBase: false, recall: false, tileRegen: 12, tileStep: false, dashBreak: 0, xpMul: 1, abilities: false, itemBoxes: false, weapons: true,
  },
};

export const getRules = (id: string | undefined): Ruleset => RULESETS[id as RulesetId] ?? RULESETS.brawl;

/** Reglas efectivas de una partida: las que eligió el host si el juego las admite; si no, las del juego (core/games.ts). */
export const rulesFor = (s: { mode: string; rules?: string }): Ruleset => getRules(rulesetFor(s));

/** Nivel en que se desbloquea una habilidad con estas reglas (sin progresión: todas desde el inicio). */
export const unlockLevel = (rules: Ruleset, def: { unlock: number }) => (rules.progression ? def.unlock : 1);

/** La ulti usa carga en vez de enfriamiento. */
export const usesUltCharge = (rules: Ruleset, slot: AbilitySlot) => slot === 'r' && rules.ultCharge;
