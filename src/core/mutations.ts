// Mutaciones de habilidad (GDD §9): el nivel habilita el espacio, los materiales lo pagan.
// Las rutas se diseñan por familia/rol, no por héroe: cualquier héroe nuevo las hereda gratis.
import type { Family, Route } from './types';

export interface Mods {
  area: number;
  heat: number;
  kb: number;
  stun: number;
  cd: number;
  dur: number;
  support: boolean;
}

export const NO_MODS: Mods = { area: 1, heat: 1, kb: 1, stun: 1, cd: 1, dur: 1, support: false };

export const ROUTE_MODS: Record<Route, Mods> = {
  tank: { area: 1.35, heat: 0.8, kb: 1.3, stun: 1.5, cd: 1, dur: 1.35, support: false },
  carry: { area: 0.85, heat: 1.45, kb: 0.95, stun: 1, cd: 0.75, dur: 1, support: false },
  support: { area: 1.1, heat: 0.85, kb: 0.9, stun: 1, cd: 0.9, dur: 1.15, support: true },
};

export const ROUTE_DESC: Record<Route, string> = {
  tank: '+35% área y duración, +30% empuje, +50% aturdimiento, −20% heat.',
  carry: '+45% heat, −25% enfriamiento, −15% área.',
  support: 'Al usarla, escuda a los aliados cercanos (18). Algo más débil contra enemigos.',
};

/** Sabor por familia, para que la misma ruta "se sienta" distinta según el material. */
export const ROUTE_FLAVOR: Record<Family, Record<Route, string>> = {
  stone: { tank: 'Alud', carry: 'Filo de pedernal', support: 'Muralla viva' },
  metal: { tank: 'Blindaje', carry: 'Sobrecarga', support: 'Andamio' },
  crystal: { tank: 'Geoda', carry: 'Facetado', support: 'Prisma compartido' },
  goo: { tank: 'Masa', carry: 'Ácido', support: 'Simbiosis' },
};

export const MUTATION_COST = 8; // de tu propia familia
export const SUPPORT_SHIELD = 18;
export const SUPPORT_RADIUS = 7;
