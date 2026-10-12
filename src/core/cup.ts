// Copa: varias carreras seguidas en pistas distintas, sumando puntos según el puesto de cada una. Gana quien
// junta más. La lleva el host entre partida y partida (net/host.ts); acá están las cuentas, que no dependen
// de la red: qué pistas se corren, cuántos puntos da cada puesto y cómo queda la tabla.
import type { Standing } from './modes';

/** Puntos por puesto: 1.º, 2.º, 3.º... */
export const CUP_POINTS = [10, 7, 5, 4, 3, 2];

export const cupPoints = (place: number): number => CUP_POINTS[place - 1] ?? 0;

/** Las pistas de una copa: la elegida y las que le siguen en la lista, dando la vuelta. */
export function cupMaps(first: string, rounds: number, pool: string[]): string[] {
  if (!pool.length) return [];
  const at = Math.max(0, pool.indexOf(first));
  return Array.from({ length: rounds }, (_, i) => pool[(at + i) % pool.length]);
}

/** Cómo viene la copa al empezar una carrera. round: cuál se corre (0 = la primera). */
export interface CupInfo {
  round: number;
  maps: string[];
  /** Puntos de cada jugador (por pid) antes de esta carrera. */
  points: Record<string, number>;
}

export interface CupRow { pid: string; name: string; gained: number; total: number; wins: number }

/** Cómo quedó la copa después de una carrera. round: cuál se acaba de correr (0 = la primera). */
export interface CupResult {
  round: number;
  maps: string[];
  final: boolean;
  /** Tabla ordenada: primero el que va ganando. */
  table: CupRow[];
}

/** Estado de una copa en curso. */
export interface CupState {
  maps: string[];
  round: number;
  points: Record<string, number>;
  wins: Record<string, number>;
  names: Record<string, string>;
}

export const newCup = (maps: string[]): CupState => ({ maps, round: 0, points: {}, wins: {}, names: {} });

/** Anota una carrera terminada y devuelve la tabla. Avanza la copa a la carrera siguiente. */
export function scoreCup(cup: CupState, standings: Standing[], who: (id: number) => { pid: string; name: string } | undefined): CupResult {
  const gained: Record<string, number> = {};
  for (const s of standings) {
    const p = who(s.id);
    if (!p) continue;
    gained[p.pid] = cupPoints(s.place);
    cup.points[p.pid] = (cup.points[p.pid] ?? 0) + gained[p.pid];
    cup.names[p.pid] = p.name;
    if (s.place === 1) cup.wins[p.pid] = (cup.wins[p.pid] ?? 0) + 1;
  }
  const round = cup.round;
  cup.round++;
  // A igualdad de puntos, va adelante el que ganó más carreras; después, el que mejor salió en esta.
  const table = Object.keys(cup.points)
    .map((pid) => ({ pid, name: cup.names[pid] ?? '?', gained: gained[pid] ?? 0, total: cup.points[pid], wins: cup.wins[pid] ?? 0 }))
    .sort((a, b) => b.total - a.total || b.wins - a.wins || b.gained - a.gained);
  return { round, maps: cup.maps, final: cup.round >= cup.maps.length, table };
}
