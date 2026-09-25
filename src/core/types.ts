// Tipos compartidos del dominio.
export type Family = 'stone' | 'metal' | 'crystal' | 'goo';
export const FAMILIES: Family[] = ['stone', 'metal', 'crystal', 'goo'];
export const FAMILY_NAMES: Record<Family, string> = {
  stone: 'Piedra',
  metal: 'Metal',
  crystal: 'Cristal',
  goo: 'Goo',
};
export const FAMILY_COLORS: Record<Family, number> = {
  stone: 0x9a8f86,
  metal: 0x8fa3b8,
  crystal: 0x7fe3ff,
  goo: 0x7bea4f,
};
/** Color de las grietas/brillo de daño por familia. */
export const FAMILY_CRACK: Record<Family, number> = {
  stone: 0xff6a1a,
  metal: 0xff3b2f,
  crystal: 0xb070ff,
  goo: 0x1f5c14,
};

export type Materials = Record<Family, number>;
export const emptyMats = (): Materials => ({ stone: 0, metal: 0, crystal: 0, goo: 0 });

export type AbilitySlot = 'q' | 'e' | 'f' | 'r';
export const ABILITY_SLOTS: AbilitySlot[] = ['q', 'e', 'f', 'r'];
export type Route = 'tank' | 'carry' | 'support';
export const ROUTE_NAMES: Record<Route, string> = { tank: 'Tanque', carry: 'Carry', support: 'Support' };

export type ModeId = 'stock' | 'kills' | 'koth';
export type { RulesetId } from './rules';
export type HeroId = 'canto' | 'prisma' | 'gloop' | 'remache';
export const HERO_IDS: HeroId[] = ['canto', 'prisma', 'gloop', 'remache'];

export interface MatchSettings {
  mode: ModeId;
  rules: import('./rules').RulesetId; // sistemas prendidos (ver rules.ts)
  map: string;
  teams: 'teams' | 'ffa';
  lives: number; // stock
  killTarget: number; // kills
  kothTarget: number; // koth
  timeLimit: number; // segundos
  bots: number;
  botLevel: 1 | 2 | 3;
  theme: string; // tema visual (solo estética)
}

export const DEFAULT_SETTINGS: MatchSettings = {
  mode: 'stock',
  rules: 'brawl',
  map: 'cantera',
  teams: 'teams',
  lives: 3,
  killTarget: 10,
  kothTarget: 100,
  timeLimit: 600,
  bots: 0,
  botLevel: 2,
  theme: 'neon',
};

export interface RosterEntry {
  pid: string; // id estable del jugador (uuid) o "bot-N"
  name: string;
  hero: HeroId;
  team: number;
  bot: boolean;
  botLevel?: number;
  hat?: string;
}
