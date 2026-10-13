// Reglas de partida: QUÉ sistemas del núcleo están prendidos. Es la otra mitad de un "modo de juego":
//   GameMode (modes.ts) decide CÓMO se gana (vidas, ring-outs, zona...).
//   Ruleset  (este archivo) decide CON QUÉ se juega (niveles, forja, ítems, dash, carga de ulti...).
// Un modo nuevo (MOBA, battle royale, carrera de obstáculos) es una combinación de los dos más un
// tipo de mapa. La simulación nunca pregunta "¿estoy en el modo X?": pregunta "¿está prendido el sistema Y?".
// Ver docs/PLATAFORMA_Y_MODOS.md.
import { DASH_CD } from './constants';
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
  /** Salto (Espacio). Apagado: Espacio no hace nada. */
  jump: boolean;
  /** Cómo se siente el salto: multiplicador de la fuerza (se suma al del héroe), de la gravedad (menos de 1 = flota) y tope de saltos en el aire. */
  jumpMul: number;
  gravityMul: number;
  maxAirJumps: number;
  /** Segundos que tarda en volver el dash (Shift) después de usarlo. */
  dashCd: number;
  /** El clic izquierdo agarra al rival que se tiene adelante en vez de usar el golpe básico del héroe. */
  grab: boolean;
}

export const RULESETS: Record<RulesetId, Ruleset> = {
  brawl: {
    id: 'brawl', name: 'Brawler', icon: '⚡',
    desc: 'Rápido y directo: todas las habilidades desde el principio, la ulti se carga pegando y Shift es un dash. Sin niveles, forja ni ítems que administrar.',
    progression: false, crafting: false, repair: false, pickups: 'ult', dash: true, ultCharge: true,
    forgeAtBase: false, recall: false, tileRegen: 0, tileStep: false, dashBreak: 0, xpMul: 1, abilities: true, itemBoxes: false, weapons: false,
    jump: true, jumpMul: 1, gravityMul: 1, maxAirJumps: 99, dashCd: DASH_CD, grab: false,
  },
  full: {
    id: 'full', name: 'Completo', icon: '🧬',
    desc: 'Todos los sistemas: niveles que desbloquean habilidades, materiales, forja de ítems y mutaciones, reparación. Es la base del futuro modo MOBA.',
    progression: true, crafting: true, repair: true, pickups: 'materials', dash: true, ultCharge: false,
    forgeAtBase: false, recall: false, tileRegen: 0, tileStep: false, dashBreak: 0, xpMul: 1, abilities: true, itemBoxes: false, weapons: false,
    jump: true, jumpMul: 1, gravityMul: 1, maxAirJumps: 99, dashCd: DASH_CD, grab: false,
  },
  moba: {
    id: 'moba', name: 'Asedio', icon: '🏰',
    desc: 'Las del modo Asedio (MOBA): niveles, materiales que sueltan los esbirros, forja solo en tu base, B para volver y el piso roto se rearma solo.',
    progression: true, crafting: true, repair: true, pickups: 'materials', dash: true, ultCharge: false,
    forgeAtBase: true, recall: true, tileRegen: 25, tileStep: false, dashBreak: 0, xpMul: 0.55, abilities: true, itemBoxes: false, weapons: false,
    jump: true, jumpMul: 1, gravityMul: 1, maxAirJumps: 99, dashCd: DASH_CD, grab: false,
  },
  race: {
    id: 'race', name: 'Carrera', icon: '🏁',
    desc: 'Las de la Carrera de obstáculos: sin habilidades de héroe y con un salto flotante, torpe y sin doble salto. El clic agarra al rival que tenés adelante (frena a los dos), el empujón sigue igual y el dash tarda bastante en volver: administralo para cruzar, abrir paso o soltarte de un agarre. Más los ítems de un solo uso que dan las cajas.',
    progression: false, crafting: false, repair: false, pickups: 'none', dash: true, ultCharge: false,
    forgeAtBase: false, recall: false, tileRegen: 4, tileStep: true, dashBreak: 80, xpMul: 1, abilities: false, itemBoxes: true, weapons: false,
    jump: true, jumpMul: 0.75, gravityMul: 0.75, maxAirJumps: 0, dashCd: 5, grab: true,
  },
  horde: {
    id: 'horde', name: 'Horda', icon: '🔫',
    desc: 'Las de la Horda: armas en vez de poderes. Clic dispara, el empujón te saca zombis de encima y hay C4. Las armas y la munición caen en cajas.',
    progression: false, crafting: false, repair: false, pickups: 'none', dash: true, ultCharge: false,
    forgeAtBase: false, recall: false, tileRegen: 12, tileStep: false, dashBreak: 0, xpMul: 1, abilities: false, itemBoxes: false, weapons: true,
    jump: true, jumpMul: 1, gravityMul: 1, maxAirJumps: 99, dashCd: DASH_CD, grab: false,
  },
};

export const getRules = (id: string | undefined): Ruleset => RULESETS[id as RulesetId] ?? RULESETS.brawl;

/** Reglas efectivas de una partida: las que eligió el host si el juego las admite; si no, las del juego (core/games.ts). */
export const rulesFor = (s: { mode: string; rules?: string }): Ruleset => getRules(rulesetFor(s));

/** Nivel en que se desbloquea una habilidad con estas reglas (sin progresión: todas desde el inicio). */
export const unlockLevel = (rules: Ruleset, def: { unlock: number }) => (rules.progression ? def.unlock : 1);

/** La ulti usa carga en vez de enfriamiento. */
export const usesUltCharge = (rules: Ruleset, slot: AbilitySlot) => slot === 'r' && rules.ultCharge;
