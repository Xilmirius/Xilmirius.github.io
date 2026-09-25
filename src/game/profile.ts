// Perfil local del jugador: nivel de cuenta, estadísticas totales, logros y sombreros.
// Vive en localStorage (no requiere login). Es la capa de "gamificación" entre partidas.
import { HATS } from '../core/cosmetics';
import type { MatchResultInfo, PlayerResult } from '../core/protocol';

const KEY = 'rubble.profile';

export interface Profile {
  xp: number;
  level: number;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  bestCombo: number;
  bestStreak: number;
  heroes: string[];
  achievements: string[];
  hat: string;
}

export interface AchievementDef { id: string; name: string; desc: string; icon: string }

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_ko', name: 'Primer ring-out', desc: 'Sacá a alguien del mapa.', icon: '💥' },
  { id: 'double', name: '¡Doble!', desc: 'Dos ring-outs en 4 segundos.', icon: '✌️' },
  { id: 'triple', name: '¡Triple!', desc: 'Tres ring-outs seguidos.', icon: '🔥' },
  { id: 'billiards', name: 'Billar', desc: 'Voltea a alguien con el cuerpo de otro.', icon: '🎱' },
  { id: 'wrecker', name: 'Demoledor', desc: 'Rompé 15 coberturas en una partida.', icon: '🔨' },
  { id: 'collector', name: 'Coleccionista', desc: 'Juntá 40 materiales en una partida.', icon: '💎' },
  { id: 'save', name: 'Salvada épica', desc: 'Sobreviví a un golpe que te sacaba.', icon: '🪂' },
  { id: 'untouchable', name: 'Intocable', desc: 'Ganá sin caerte nunca.', icon: '🛡️' },
  { id: 'combo10', name: 'Combo x10', desc: 'Encadená 10 golpes.', icon: '⚡' },
  { id: 'combo25', name: 'Máquina de combos', desc: 'Encadená 25 golpes.', icon: '🌪️' },
  { id: 'streak5', name: 'Imparable', desc: '5 ring-outs sin caerte.', icon: '🚀' },
  { id: 'executioner', name: 'Verdugo', desc: '5 golpes letales en una partida.', icon: '☠️' },
  { id: 'mutant', name: 'Mutante', desc: 'Mutá 3 habilidades en una partida.', icon: '🧬' },
  { id: 'maxlevel', name: 'Tope', desc: 'Llegá a nivel 10 en una partida.', icon: '🔟' },
  { id: 'all_heroes', name: 'Probaste todo', desc: 'Jugá con los 4 héroes.', icon: '🎭' },
  { id: 'veteran', name: 'Veterano', desc: 'Jugá 10 partidas.', icon: '🎖️' },
  { id: 'champion', name: 'Campeón', desc: 'Ganá 10 partidas.', icon: '🏆' },
];

export const ACH_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export const xpToNext = (level: number) => 250 + 120 * (level - 1);

function load(): Profile {
  let p: Partial<Profile> = {};
  try { p = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { /* */ }
  return {
    xp: p.xp ?? 0, level: p.level ?? 1, matches: p.matches ?? 0, wins: p.wins ?? 0, kills: p.kills ?? 0, deaths: p.deaths ?? 0,
    bestCombo: p.bestCombo ?? 0, bestStreak: p.bestStreak ?? 0, heroes: p.heroes ?? [], achievements: p.achievements ?? [], hat: p.hat ?? 'none',
  };
}

let cache: Profile | null = null;
export function getProfile(): Profile {
  if (!cache) cache = load();
  return cache;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(getProfile())); } catch { /* */ }
}

export function setHat(id: string) {
  const p = getProfile();
  const h = HATS.find((x) => x.id === id);
  if (h && h.level <= p.level) { p.hat = id; save(); }
}

export function unlockedHats() {
  const lv = getProfile().level;
  return HATS.filter((h) => h.level <= lv);
}

/** Desbloquea un logro. Devuelve true si es nuevo. */
export function unlock(id: string): boolean {
  const p = getProfile();
  if (!ACH_BY_ID[id] || p.achievements.includes(id)) return false;
  p.achievements.push(id);
  save();
  return true;
}

export interface MatchLiveStats {
  bestCombo: number;
  bestMulti: number;
  bestStreak: number;
  mutations: number;
}

export interface MatchReward {
  xp: { label: string; amount: number }[];
  total: number;
  fromLevel: number;
  fromXp: number;
  toLevel: number;
  toXp: number;
  newAchievements: string[];
  newHats: string[];
}

/** Aplica el resultado de una partida al perfil y devuelve el desglose para animarlo. */
export function applyMatch(res: MatchResultInfo, me: PlayerResult | undefined, live: MatchLiveStats): MatchReward | null {
  if (!me) return null;
  const p = getProfile();
  const won = !res.draw && me.team === res.winner;
  const xp: { label: string; amount: number }[] = [];
  xp.push({ label: 'Partida jugada', amount: 60 });
  if (won) xp.push({ label: '¡Victoria!', amount: 120 });
  if (me.kills) xp.push({ label: `${me.kills} ring-outs`, amount: me.kills * 25 });
  if (me.assists) xp.push({ label: `${me.assists} asistencias`, amount: me.assists * 10 });
  if (me.lethals) xp.push({ label: `${me.lethals} golpes letales`, amount: me.lethals * 10 });
  if (me.billiards) xp.push({ label: `${me.billiards} carambolas`, amount: me.billiards * 15 });
  if (me.saves) xp.push({ label: `${me.saves} salvadas`, amount: me.saves * 30 });
  if (me.destroyed) xp.push({ label: `${me.destroyed} demoliciones`, amount: me.destroyed * 3 });
  if (live.bestCombo >= 5) xp.push({ label: `Combo x${live.bestCombo}`, amount: live.bestCombo * 3 });
  const total = xp.reduce((a, b) => a + b.amount, 0);

  const fromLevel = p.level, fromXp = p.xp;
  p.xp += total;
  while (p.xp >= xpToNext(p.level)) { p.xp -= xpToNext(p.level); p.level++; }
  p.matches++;
  if (won) p.wins++;
  p.kills += me.kills;
  p.deaths += me.deaths;
  p.bestCombo = Math.max(p.bestCombo, live.bestCombo);
  p.bestStreak = Math.max(p.bestStreak, live.bestStreak);
  if (!p.heroes.includes(me.hero)) p.heroes.push(me.hero);
  save();

  const got: string[] = [];
  const check = (id: string, cond: boolean) => { if (cond && unlock(id)) got.push(id); };
  check('first_ko', me.kills >= 1);
  check('double', live.bestMulti >= 2);
  check('triple', live.bestMulti >= 3);
  check('billiards', me.billiards >= 1);
  check('wrecker', me.destroyed >= 15);
  check('collector', me.pickups >= 40);
  check('save', me.saves >= 1);
  check('untouchable', won && me.deaths === 0 && res.players.length >= 2);
  check('combo10', live.bestCombo >= 10);
  check('combo25', live.bestCombo >= 25);
  check('streak5', live.bestStreak >= 5);
  check('executioner', me.lethals >= 5);
  check('mutant', live.mutations >= 3);
  check('maxlevel', me.level >= 10);
  check('all_heroes', p.heroes.length >= 4);
  check('veteran', p.matches >= 10);
  check('champion', p.wins >= 10);
  const newHats = HATS.filter((h) => h.level > fromLevel && h.level <= p.level).map((h) => h.id);
  return { xp, total, fromLevel, fromXp, toLevel: p.level, toXp: p.xp, newAchievements: got, newHats };
}
