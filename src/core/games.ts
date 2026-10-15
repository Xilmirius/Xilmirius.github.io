// Los juegos de la plataforma. RUBBLE no es un solo juego: es un núcleo (movimiento, física, red, sala y bots)
// sobre el que corren varios. Cada juego se declara acá, y el menú, la sala, el host, la simulación y la pantalla
// le preguntan a esta tabla en vez de comparar el nombre del modo.
//
// Sumar un juego = una entrada en GAMES + sus modos en MODE_INFO + su GameMode (modes.ts) + sus reglas (rules.ts)
// + sus mapas (maps/). Ver docs/PLATAFORMA_Y_MODOS.md.
import { MAP_IDS, MAPS, type MapKind } from './maps';
import type { RulesetId } from './rules';
import type { MatchSettings, ModeId } from './types';

export type GameId = 'arena' | 'siege' | 'race' | 'horde';
export const GAME_IDS: GameId[] = ['arena', 'siege', 'race', 'horde'];

/** Cómo se reparten los jugadores. 'choice': el host elige entre equipos y todos contra todos. */
export type Sides = 'choice' | 'teams' | 'ffa' | 'coop';

/** Opciones de la partida que el host puede tocar en la sala. */
export type LobbyOption = 'lives' | 'killTarget' | 'kothTarget' | 'timeLimit' | 'difficulty' | 'cup' | 'organic';
/** names: cómo se muestra cada valor, si no alcanza con el número. */
export const LOBBY_OPTIONS: Record<LobbyOption, { label: string; values: number[]; names?: string[] }> = {
  difficulty: { label: 'Dificultad', values: [1, 2, 3], names: ['Fácil', 'Normal', 'Difícil'] },
  cup: { label: 'Formato', values: [1, 3, 4], names: ['Una carrera', 'Copa de 3 pistas', 'Copa de 4 pistas'] },
  lives: { label: 'Vidas', values: [1, 2, 3, 4, 5] },
  killTarget: { label: 'Ring-outs para ganar', values: [5, 10, 15, 20] },
  kothTarget: { label: 'Puntos para ganar', values: [60, 100, 150] },
  timeLimit: { label: 'Tiempo límite', values: [300, 480, 600, 900, 1200] },
  // Es un sí o no (`MatchSettings.organic`): 1 es la malla orgánica y 0 la cuadrada.
  organic: { label: 'Terreno', values: [1, 0], names: ['Orgánico', 'Cuadrado'] },
};

export interface GameDef {
  id: GameId;
  name: string;
  icon: string;
  /** Qué clase de juego es, en tres o cuatro palabras. */
  tagline: string;
  desc: string;
  /** Lo que lo distingue: se muestra en la vitrina del menú. */
  highlights: string[];
  /** Color de acento de la tarjeta. */
  color: number;
  players: string;
  /** Formas de ganar. La primera es con la que se entra. */
  modes: ModeId[];
  /** Reglas que admite. Una sola = vienen fijas. */
  rulesets: RulesetId[];
  mapKinds: MapKind[];
  /** El mapa no se elige: sale del tamaño de los equipos al empezar. */
  autoMap?: string;
  sides: Sides;
  minPlayers: number;
  /** Con qué se larga la partida al terminar la cuenta: [el cartel, lo que dice el locutor]. */
  go: [string, string];
  /** Cooperativo: cómo se llama cada bando en el resultado [los jugadores, lo que enfrentan]. */
  coopNames?: [string, string];
  /** Con qué se entra al juego (el host después cambia lo que el juego deje). */
  defaults: Partial<MatchSettings>;
  /** Bots con los que arranca la práctica. */
  practiceBots: number;
  /** Vitrina: la partida de bots que se ve detrás del menú. tour: cada vez que vuelve a empezar pasa al mapa siguiente del juego. */
  demo: { map: string; theme: string; bots: number; tour?: boolean };
}

export interface ModeInfo {
  name: string;
  desc: string;
  game: GameId;
  options: LobbyOption[];
  /** Etiquetas propias de las opciones, si las genéricas no alcanzan. */
  labels?: Partial<Record<LobbyOption, string>>;
  /** Columna propia en la tabla de la partida. */
  stat?: { label: string; key: 'lives' | 'cs' };
}

export const GAMES: Record<GameId, GameDef> = {
  arena: {
    id: 'arena', name: 'Arena', icon: '🥊', tagline: 'Brawler de ring-outs', color: 0xff8a3c,
    desc: 'Pelea en una arena flotante. No hay barra de vida: cuanto más te pegan, más lejos volás. Gana el que saca a los demás del mapa.',
    highlights: ['4 héroes con 4 habilidades', 'El piso y el mapa se rompen', 'Equipos o todos contra todos'],
    players: '2 a 6',
    modes: ['stock', 'kills', 'koth'], rulesets: ['brawl', 'full'], mapKinds: ['arena'],
    sides: 'choice', minPlayers: 2, go: ['¡PELEEN!', '¡A pelear!'],
    defaults: { timeLimit: 600, theme: 'neon', teams: 'teams' }, practiceBots: 3,
    demo: { map: 'cantera', theme: 'neon', bots: 4 },
  },
  siege: {
    id: 'siege', name: 'Asedio', icon: '🏰', tagline: 'MOBA de bolsillo', color: 0x6aa8ff,
    desc: 'Dos bases, torres y oleadas de esbirros. Subí de nivel, forjá ítems, empujá las líneas y destruí el núcleo rival.',
    highlights: ['Niveles, forja y mutaciones', 'Torres, esbirros y el Coloso', 'Las líneas son puentes sobre el vacío'],
    players: '1v1 a 3v3',
    modes: ['moba'], rulesets: ['moba'], mapKinds: ['moba'],
    autoMap: 'Sale del tamaño de los equipos: El Puente (1 línea) hasta 2v2 · Las Dos Cornisas (2 líneas) en 3v3.',
    sides: 'teams', minPlayers: 2, go: ['¡PELEEN!', '¡A pelear!'],
    defaults: { timeLimit: 900, theme: 'atardecer' }, practiceBots: 3,
    demo: { map: 'puente', theme: 'atardecer', bots: 4 },
  },
  race: {
    id: 'race', name: 'Carrera', icon: '🏁', tagline: 'Pista de obstáculos', color: 0x4fe0a0,
    desc: 'Todos contra todos hasta la meta. Cuatro pistas con lo suyo: rotores y géiseres, curvas con atajos, bolas que ruedan contra vos y paredes que se rompen a puro dash. Sin poderes y con un salto flotante y torpe: el clic agarra al rival que tenés adelante, el empujón sigue y el dash tarda bastante en volver.',
    highlights: ['4 pistas y copa por puntos', 'Agarrá al rival en vez de pegarle', 'Te caés y volvés a la última puerta'],
    players: '1 a 6',
    modes: ['race'], rulesets: ['race'], mapKinds: ['race'],
    sides: 'ffa', minPlayers: 1, go: ['¡A CORRER!', '¡A correr!'],
    defaults: { timeLimit: 300, theme: 'clasico', cup: 3 }, practiceBots: 4,
    demo: { map: 'pista', theme: 'clasico', bots: 5, tour: true },
  },
  horde: {
    id: 'horde', name: 'Horda', icon: '🧟', tagline: 'Cooperativo contra zombis', color: 0x9be04f,
    desc: 'Todos del mismo lado, con armas en vez de poderes. Las oleadas no paran de crecer: cumplí las misiones del mapa, armá mini bases y llegá a la extracción.',
    highlights: ['Uzi, escopeta, lanzacohetes y C4', 'Misiones, mini bases y extracción', 'Solo o con amigos'],
    players: '1 a 6',
    modes: ['horde'], rulesets: ['horde'], mapKinds: ['horde'],
    sides: 'coop', minPlayers: 1, go: ['¡A SOBREVIVIR!', '¡A sobrevivir!'], coopNames: ['los sobrevivientes', 'la horda'],
    defaults: { theme: 'noche', lives: 3, difficulty: 2 }, practiceBots: 2,
    demo: { map: 'refugio', theme: 'noche', bots: 3 },
  },
};

export const MODE_INFO: Record<ModeId, ModeInfo> = {
  stock: {
    name: 'Vidas', game: 'arena', options: ['lives', 'timeLimit', 'organic'], stat: { label: 'Vidas', key: 'lives' },
    desc: 'Cada uno tiene vidas. Gana el último equipo con alguien en pie.',
  },
  kills: {
    name: 'Ring-outs', game: 'arena', options: ['killTarget', 'timeLimit', 'organic'],
    desc: 'Sumá puntos sacando rivales del mapa. Gana quien llega primero al objetivo.',
  },
  koth: {
    name: 'Control de zona', game: 'arena', options: ['kothTarget', 'timeLimit', 'organic'],
    desc: 'Pará en la zona sin rivales para sumar puntos. La zona se mueve.',
  },
  moba: {
    name: 'Asedio (MOBA)', game: 'siege', options: ['timeLimit', 'organic'], labels: { timeLimit: 'Tiempo (después: muerte súbita)' },
    stat: { label: 'Esbirros', key: 'cs' },
    desc: 'Dos bases, torres y oleadas de esbirros. Empujá las líneas y destruí el núcleo rival. 1 línea hasta 2v2, 2 líneas en 3v3.',
  },
  horde: {
    name: 'Horda (zombis)', game: 'horde', options: ['difficulty', 'lives', 'organic'], labels: { lives: 'Vidas de cada uno' },
    stat: { label: 'Zombis', key: 'cs' },
    desc: 'Cooperativo con armas: las oleadas de zombis no paran de crecer. Cumplí las misiones del mapa y llegá a la extracción antes de quedarte sin vidas.',
  },
  race: {
    name: 'Carrera de obstáculos', game: 'race', options: ['cup', 'timeLimit', 'organic'], labels: { timeLimit: 'Tiempo límite por pista' },
    desc: 'Todos contra todos hasta la meta. Sin habilidades: golpes, empujón, dash y los ítems de las cajas. En copa se corren varias pistas seguidas y gana quien suma más puntos.',
  },
};

/** El juego al que pertenece un modo. */
export const gameOf = (mode: string): GameDef =>
  GAMES[(MODE_INFO as Record<string, ModeInfo | undefined>)[mode]?.game ?? 'arena'];

/** Mapas en los que se puede jugar un juego. */
export const mapsFor = (g: GameDef): string[] => MAP_IDS.filter((id) => g.mapKinds.includes(MAPS[id].kind ?? 'arena'));

/** Formato efectivo de una partida. */
export function sidesOf(s: { mode: string; teams: 'teams' | 'ffa' }): 'teams' | 'ffa' | 'coop' {
  const g = gameOf(s.mode).sides;
  return g === 'choice' ? s.teams : g;
}

/** Reglas efectivas: las elegidas si el juego las admite; si no, las del juego. */
export function rulesetFor(s: { mode: string; rules?: string }): RulesetId {
  const g = gameOf(s.mode);
  return g.rulesets.includes(s.rules as RulesetId) ? (s.rules as RulesetId) : g.rulesets[0];
}

/** Lo que el juego fija de una partida (reglas y formato), sin tocar el mapa. Es lo que aplica la simulación. */
export function fixSettings(s: MatchSettings): MatchSettings {
  const sides = gameOf(s.mode).sides;
  return { ...s, rules: rulesetFor(s), teams: sides === 'choice' ? s.teams : sides === 'ffa' ? 'ffa' : 'teams' };
}

/** Deja los ajustes como el juego los exige, mapa incluido. Es lo que aplican la sala y el host. */
export function normalizeSettings(s: MatchSettings): MatchSettings {
  const maps = mapsFor(gameOf(s.mode));
  // La copa no puede tener más pistas que las que hay, y solo existe en los modos que la ofrecen.
  const cup = MODE_INFO[s.mode]?.options.includes('cup') ? Math.max(1, Math.min(maps.length, Math.round(s.cup) || 1)) : 1;
  return { ...fixSettings(s), map: maps.includes(s.map) ? s.map : maps[0], cup };
}

/** Tema visual que le queda a un mapa (si tiene uno propio). */
export const themeOf = (map: string): string | undefined => MAPS[map]?.theme;

/** Cambiar de modo. Si el modo es de otro juego, entran también los valores de entrada de ese juego. */
export function enterMode(prev: MatchSettings, mode: ModeId): MatchSettings {
  const g = gameOf(mode);
  return normalizeSettings(g.id === gameOf(prev.mode).id ? { ...prev, mode } : { ...prev, ...g.defaults, mode });
}

/** Entrar a un juego (desde el menú o cambiándolo en la sala). */
export const enterGame = (prev: MatchSettings, id: GameId): MatchSettings =>
  gameOf(prev.mode).id === id ? normalizeSettings(prev) : enterMode(prev, GAMES[id].modes[0]);
