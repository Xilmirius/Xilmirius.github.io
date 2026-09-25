import type { Character } from '../entities';
import type { Mods } from '../mutations';
import type { Simulation } from '../sim';
import type { AbilitySlot, Family, HeroId } from '../types';

export type BotUse = 'engage' | 'poke' | 'escape' | 'finisher' | 'buff' | 'zone';

export interface AbilityDef {
  name: string;
  desc: string;
  icon: string;
  cd: number;
  unlock: number;
  range: number;
  aim: 'dir' | 'point' | 'self' | 'ally';
  radius?: number;
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
