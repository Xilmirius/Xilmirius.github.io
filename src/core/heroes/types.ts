import type { Character } from '../entities';
import type { Mods } from '../mutations';
import type { Simulation } from '../sim';
import type { AbilitySlot, Family, HeroId } from '../types';

export type BotUse = 'engage' | 'poke' | 'escape' | 'finisher' | 'buff' | 'zone';

/**
 * Cómo se dibuja el área al apuntar (mientras mantenés la tecla). Las medidas son las base:
 * el cliente las escala con la mutación de área si la hay.
 */
export type AimShape =
  | { k: 'circle'; r: number } // área en el punto apuntado (hasta `range`)
  | { k: 'line'; w: number } // recorrido en línea recta de largo `range`
  | { k: 'cone'; deg: number } // cono desde vos con radio `range`
  | { k: 'wall'; len: number } // muro perpendicular a tu mirada, en el punto
  | { k: 'self'; r: number } // área alrededor tuyo (0 = solo te afecta a vos)
  | { k: 'point'; r?: number } // lugar exacto (teletransporte, torreta) + radio de efecto opcional
  | { k: 'blink'; r: number }; // te movés al punto y dejás un área donde estabas

export interface AbilityDef {
  name: string;
  desc: string;
  icon: string;
  cd: number;
  unlock: number;
  range: number;
  aim: 'dir' | 'point' | 'self' | 'ally';
  radius?: number;
  shape: AimShape;
  bot: BotUse;
  /** Devuelve false si no se pudo usar (no consume enfriamiento). */
  cast(sim: Simulation, ch: Character, ax: number, az: number, m: Mods): boolean | void;
}

export interface BasicDef {
  name: string;
  desc: string;
  kind: 'melee' | 'ranged';
  cd: number;
  range: number;
  cast(sim: Simulation, ch: Character, ax: number, az: number): void;
}

export interface HeroDef {
  id: HeroId;
  name: string;
  family: Family;
  role: string;
  desc: string;
  passive: string;
  color: number;
  speed: number;
  preferredRange: number;
  basic: BasicDef;
  abilities: Record<AbilitySlot, AbilityDef>;
}

export const UNLOCK: Record<AbilitySlot, number> = { q: 1, e: 2, f: 3, r: 5 };
