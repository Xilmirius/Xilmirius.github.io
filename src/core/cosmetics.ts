// Cosméticos: sombreros sobre el bean base (GDD §8/§12: monetización/progreso por cosméticos, nunca poder).
// Se desbloquean subiendo el nivel de cuenta (perfil local).
export interface HatDef { id: string; name: string; icon: string; level: number }

export const HATS: HatDef[] = [
  { id: 'none', name: 'Sin sombrero', icon: '🚫', level: 0 },
  { id: 'party', name: 'Gorro de fiesta', icon: '🥳', level: 2 },
  { id: 'horns', name: 'Cuernos', icon: '😈', level: 3 },
  { id: 'tophat', name: 'Galera', icon: '🎩', level: 4 },
  { id: 'halo', name: 'Aureola', icon: '😇', level: 5 },
  { id: 'propeller', name: 'Hélice', icon: '🚁', level: 7 },
  { id: 'viking', name: 'Casco vikingo', icon: '🪖', level: 9 },
  { id: 'crown', name: 'Corona', icon: '👑', level: 12 },
];

export const HAT_BY_ID: Record<string, HatDef> = Object.fromEntries(HATS.map((h) => [h.id, h]));
export const validHat = (id: unknown): string => (typeof id === 'string' && HAT_BY_ID[id] ? id : 'none');
