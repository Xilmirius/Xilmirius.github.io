// Artefactos del mapa: cosas con las que se interactúa además de los minerales. Son parte del mapa (se
// escriben en el ASCII), el host resuelve sus efectos y los clientes los dibujan a partir del mapa y del
// tick: rotores y géiseres son deterministas en el tiempo, así que casi nada de esto viaja por la red.
//
//  - Resorte ('J'): es terreno. Pisarlo te lanza hacia arriba; vive en movement.ts para que el cliente lo
//    prediga igual que el host.
//  - Paragolpes ('p'): poste que rebota a quien lo toca.
//  - Rotor ('r'): barra baja que gira y barre; se salta por arriba.
//  - Géiser ('y'): avisa y después dispara un chorro que te manda al aire.
//  - Barril explosivo ('e'): cobertura que explota al romperse (es un destructible, ver terrain.ts).
//  - Caja de ítem ('?'): da un ítem activo de un solo uso (solo con reglas que tengan `itemBoxes`).
import { TICK_RATE } from './constants';

export type GadgetKind = 'bumper' | 'rotor' | 'geyser' | 'box';
export interface GadgetSpawn { kind: GadgetKind; x: number; y: number; z: number }

/** Velocidad vertical que da un resorte (≈ 4,3 m de alto y algo más de un segundo en el aire). */
export const PAD_V = 16;

export const BUMPER = { r: 0.7, kb: 11, heat: 2, up: 1.5, cd: 0.3 };
/** len: largo de cada brazo · w: medio ancho de la barra · h: hasta qué altura pega (más arriba, pasás saltando). */
export const ROTOR = { len: 3.1, w: 0.3, h: 0.85, speed: 1.7, kb: 13, heat: 4, up: 2, cd: 0.45 };
/** Ciclo: quieto → aviso (warn) → chorro (burst).
 * up: velocidad vertical que da el chorro (igual para todos, pesen lo que pesen) · push: empujón hacia afuera. */
export const GEYSER = { r: 1.2, period: 4.5, warn: 1.1, burst: 0.3, push: 3, up: 14, heat: 5 };
export const BOX = { r: 0.95, respawn: 9 };
export const BARREL = { hp: 36, radius: 3.6, heat: 16, kb: 17, up: 3, destruct: 45, tile: 55, respawn: 25 };
/** Ítems que puede dar una caja. */
export const BOX_ITEMS = ['onda', 'parpadeo', 'garfio', 'frasco', 'muralla', 'ancla'];

/** Ángulo de un rotor en un tick (los pares giran para un lado y los impares para el otro). */
export function rotorAngle(index: number, tick: number): number {
  const dir = index % 2 ? -1 : 1;
  return index * 0.9 + (dir * ROTOR.speed * tick) / TICK_RATE;
}

/** Sentido de giro de un rotor (+1 / -1). */
export const rotorDir = (index: number) => (index % 2 ? -1 : 1);

/** Segundos dentro del ciclo de un géiser (0 = recién disparó; cada uno arranca desfasado). */
export function geyserTime(index: number, tick: number): number {
  return (tick / TICK_RATE + index * 1.37) % GEYSER.period;
}

/** En qué parte del ciclo está: 'idle', 'warn' (avisando) o 'burst' (chorro). */
export function geyserPhase(index: number, tick: number): 'idle' | 'warn' | 'burst' {
  const t = geyserTime(index, tick);
  if (t < GEYSER.burst) return 'burst';
  return t >= GEYSER.period - GEYSER.warn ? 'warn' : 'idle';
}
