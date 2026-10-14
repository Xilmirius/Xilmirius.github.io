// Mejoras de la Horda: al cumplir cada misión, cada héroe elige una de tres. Se acumulan durante la partida,
// así que cada uno termina con un personaje distinto (el que tira rápido, el de las explosiones, el que aguanta).
// Acá viven la lista y los números; quién las ofrece y qué hace cada una al elegirla está en core/horde.ts,
// y lo que cambian de las armas, en core/weapons.ts.
import type { Character } from './entities';

export type PerkId = 'dmg' | 'rate' | 'ammo' | 'legs' | 'pierce' | 'crit' | 'cold' | 'skin' | 'demo' | 'turret' | 'life' | 'twin' | 'chain';
/** El índice viaja por la red: las mejoras nuevas se agregan siempre al final. */
export const PERK_IDS: PerkId[] = ['dmg', 'rate', 'ammo', 'legs', 'pierce', 'crit', 'cold', 'skin', 'demo', 'turret', 'life', 'twin', 'chain'];

export const PERK = {
  /** Cuántas se ofrecen y cuántos segundos hay para elegir (después se elige sola la primera). */
  options: 3,
  time: 20,
  /** Los bots eligen al rato de recibir la oferta. */
  botTime: 1.2,
  /** Por nivel: daño de las armas, cadencia y balas que trae una caja. */
  dmg: 0.25,
  rate: 0.2,
  ammo: 0.5,
  legsSpeed: 1.08,
  /** Por nivel: probabilidad de crítico. Un crítico multiplica el daño y empuja más. */
  crit: 0.15,
  critMul: 2.5,
  critKb: 1.5,
  /** Vida que se cura por cada zombi bajado, por nivel. */
  cold: 2.5,
  /** Por nivel: cuánto del daño y del empuje se recibe. */
  skinHeat: 0.8,
  skinKb: 0.8,
  /** Demoledor: cargas que da al elegirla, cuántas más se pueden llevar y cuánto crece la explosión, por nivel. */
  c4: 2,
  c4Radius: 0.2,
  turretHp: 300,
  turretTime: 90,
  /** Reacción en cadena: el zombi bajado explota al instante siguiente (así la cadena se ve avanzar). */
  chainDelay: 0.12,
  chainRadius: 2,
  chainRadiusPerLevel: 0.4,
  chainHeat: 22,
  chainKb: 7,
};

export interface PerkDef {
  id: PerkId;
  name: string;
  icon: string;
  desc: string;
  /** Veces que se puede elegir. */
  max: number;
  /** Peso en el sorteo de la oferta. */
  weight: number;
}

const pct = (n: number) => Math.round(n * 100);

export const PERKS: Record<PerkId, PerkDef> = {
  dmg: { id: 'dmg', name: 'Pólvora brava', icon: '🔥', desc: `+${pct(PERK.dmg)}% de daño con todas las armas`, max: 3, weight: 10 },
  rate: { id: 'rate', name: 'Gatillo fácil', icon: '⚡', desc: `Disparás ${pct(PERK.rate)}% más rápido`, max: 3, weight: 10 },
  ammo: { id: 'ammo', name: 'Bandolera', icon: '🎒', desc: `Las cajas traen ${pct(PERK.ammo)}% más balas. Te recarga las armas ahora`, max: 2, weight: 8 },
  legs: { id: 'legs', name: 'Piernas livianas', icon: '👟', desc: `Disparar ya no te frena y corrés ${pct(PERK.legsSpeed - 1)}% más`, max: 1, weight: 8 },
  pierce: { id: 'pierce', name: 'Balas perforantes', icon: '🎯', desc: 'Cada bala atraviesa un zombi más', max: 2, weight: 8 },
  crit: { id: 'crit', name: 'Ojo de halcón', icon: '🦅', desc: `${pct(PERK.crit)}% de golpes críticos: daño ×${PERK.critMul}`, max: 3, weight: 9 },
  cold: { id: 'cold', name: 'Sangre fría', icon: '❄️', desc: `Cada zombi que bajás te cura ${PERK.cold} de vida`, max: 2, weight: 7 },
  skin: { id: 'skin', name: 'Piel curtida', icon: '🛡️', desc: `Recibís ${pct(1 - PERK.skinHeat)}% menos de daño y te empujan menos`, max: 2, weight: 7 },
  demo: { id: 'demo', name: 'Demoledor', icon: '🧨', desc: `+${PERK.c4} cargas de C4 ahora, llevás ${PERK.c4} más y explotan más grande`, max: 2, weight: 7 },
  turret: { id: 'turret', name: 'Torreta de bolsillo', icon: '🗼', desc: `Planta una torreta donde estás parado (${PERK.turretTime} s)`, max: 99, weight: 6 },
  life: { id: 'life', name: 'Segundo aliento', icon: '❤️', desc: '+1 vida. Si hay un compañero eliminado, vuelve al juego', max: 2, weight: 5 },
  twin: { id: 'twin', name: 'Pistolas gemelas', icon: '🔫', desc: 'La pistola dispara de a dos balas', max: 1, weight: 6 },
  chain: { id: 'chain', name: 'Reacción en cadena', icon: '💣', desc: 'Los zombis que bajás explotan y lastiman a los de al lado', max: 2, weight: 7 },
};

/** Cuántas veces eligió esta mejora (0 = no la tiene). */
export function perkLv(ch: Character, id: PerkId): number {
  return ch.perks[PERK_IDS.indexOf(id)] ?? 0;
}
