// Ítems: 3 pasivos + 3 activos, fabricados fusionando materiales del mapa (GDD §10).
import type { AimShape } from './heroes/types';
import type { Family, Materials } from './types';

export type ItemKind = 'passive' | 'active';
/** Para qué sirve (la forja agrupa y filtra por esto). */
export type ItemTag = 'defensa' | 'ataque' | 'movilidad' | 'control';
export const ITEM_TAGS: { id: ItemTag; name: string; icon: string; color: number }[] = [
  { id: 'defensa', name: 'Defensa', icon: '🛡️', color: 0x4fd1ff },
  { id: 'ataque', name: 'Ataque', icon: '⚔️', color: 0xff5a4a },
  { id: 'movilidad', name: 'Movilidad', icon: '👟', color: 0x7dff6a },
  { id: 'control', name: 'Control', icon: '🧲', color: 0xb070ff },
];

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  tag: ItemTag;
  desc: string;
  cost: Partial<Materials>;
  cd?: number; // activos
  icon: string;
  range?: number; // activos: alcance
  shape?: AimShape; // activos: área que se muestra al apuntar
}

export const ITEMS: ItemDef[] = [
  // Pasivos
  { id: 'coraza', tag: 'defensa', name: 'Coraza', kind: 'passive', icon: '🛡️', desc: 'Recibís 15% menos heat.', cost: { stone: 6, metal: 2 } },
  { id: 'lastre', tag: 'defensa', name: 'Lastre', kind: 'passive', icon: '⚓', desc: 'Volás 15% menos al recibir golpes.', cost: { metal: 6, stone: 2 } },
  { id: 'suela', tag: 'movilidad', name: 'Suela de goma', kind: 'passive', icon: '👟', desc: '+12% velocidad de movimiento.', cost: { goo: 5, crystal: 2 } },
  { id: 'foco', tag: 'ataque', name: 'Foco', kind: 'passive', icon: '🔷', desc: 'Habilidades con 15% menos de enfriamiento.', cost: { crystal: 6, goo: 2 } },
  { id: 'filo', tag: 'ataque', name: 'Filo', kind: 'passive', icon: '🗡️', desc: 'Tus golpes suman 15% más heat.', cost: { crystal: 4, metal: 4 } },
  { id: 'savia', tag: 'defensa', name: 'Savia', kind: 'passive', icon: '💧', desc: 'Si no te pegan por 4 s, te reparás 2.5 heat/s.', cost: { goo: 5, stone: 3 } },
  { id: 'resorte', tag: 'movilidad', name: 'Resorte', kind: 'passive', icon: '🌀', desc: '+1 salto en el aire y saltás 10% más alto.', cost: { goo: 4, metal: 4 } },
  // Activos
  { id: 'parpadeo', tag: 'movilidad', name: 'Parpadeo', kind: 'active', icon: '✨', cd: 14, range: 6, shape: { k: 'point' }, desc: 'Te teletransportás hasta 6 m hacia el cursor.', cost: { crystal: 6, goo: 3 } },
  { id: 'ancla', tag: 'defensa', name: 'Ancla', kind: 'active', icon: '🪨', cd: 25, range: 0, shape: { k: 'self', r: 0 }, desc: '2.5 s inamovible: sin knockback y 30% menos heat.', cost: { metal: 7, stone: 3 } },
  { id: 'onda', tag: 'control', name: 'Onda', kind: 'active', icon: '💥', cd: 16, range: 0, shape: { k: 'self', r: 3.5 }, desc: 'Onda expansiva que empuja a todos a tu alrededor.', cost: { stone: 5, goo: 4 } },
  { id: 'muralla', tag: 'control', name: 'Muralla', kind: 'active', icon: '🧱', cd: 18, range: 8, shape: { k: 'wall', len: 3.45 }, desc: 'Levanta un muro de piedra en el cursor por 8 s.', cost: { stone: 6, metal: 2 } },
  { id: 'garfio', tag: 'movilidad', name: 'Garfio', kind: 'active', icon: '🪝', cd: 12, range: 10, shape: { k: 'point' }, desc: 'Te tirás hacia el cursor (hasta 10 m). Salva ring-outs.', cost: { metal: 5, crystal: 3 } },
  { id: 'frasco', tag: 'control', name: 'Frasco pegajoso', kind: 'active', icon: '🧪', cd: 14, range: 9, shape: { k: 'circle', r: 2.5 }, desc: 'Charco de goo que frena enemigos por 3 s.', cost: { goo: 5, crystal: 2 } },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export function canAfford(mats: Materials, cost: Partial<Materials>) {
  return (Object.keys(cost) as Family[]).every((k) => mats[k] >= (cost[k] ?? 0));
}

export function pay(mats: Materials, cost: Partial<Materials>) {
  for (const k of Object.keys(cost) as Family[]) mats[k] -= cost[k] ?? 0;
}

export function refund(mats: Materials, cost: Partial<Materials>, frac = 0.5) {
  for (const k of Object.keys(cost) as Family[]) mats[k] += Math.floor((cost[k] ?? 0) * frac);
}
