// Temas visuales del mapa: cambian cielo, niebla, luces, neón y decoración del abismo.
// Son solo estética (no tocan reglas), así que se pueden agregar libremente.
export interface ThemeDef {
  id: string;
  name: string;
  icon: string;
  sky: number | null; // null = el del mapa
  fog: number | null;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sunColor: number;
  sun: number;
  groundTint: number; // multiplica el color del terreno
  neon: 'none' | 'cycle' | number; // bordes del vacío
  neonGlow: number;
  crystals: boolean; // cristales brillantes en el abismo
  stars: boolean;
  motes: number; // color de las chispitas que suben del abismo
  /** Qué hay debajo y alrededor de la isla (ver backdrop.ts). */
  scene: 'nebula' | 'day' | 'sunset' | 'night';
  /** Paletas de la decoración sembrada sobre el terreno (ver decorView.ts). */
  grass: number[];
  flowers: number[];
}

export const THEMES: ThemeDef[] = [
  {
    id: 'neon', name: 'Neón', icon: '🌈', sky: 0x1a1230, fog: 0x2a1f4a, hemiSky: 0xfff1e0, hemiGround: 0x4a3860, hemi: 1.35,
    sunColor: 0xffffff, sun: 2.2, groundTint: 0xffffff, neon: 'cycle', neonGlow: 2.2, crystals: true, stars: true, motes: 0xff4f8b,
    scene: 'nebula', grass: [0x4fb89a, 0x5fc7b0, 0x6fd0a0], flowers: [0xff7aa8, 0xffe07a, 0x8fe0ff],
  },
  {
    id: 'clasico', name: 'Cantera', icon: '⛰️', sky: null, fog: null, hemiSky: 0xfff1e0, hemiGround: 0x5a4a50, hemi: 1.5,
    sunColor: 0xfff4e0, sun: 2.4, groundTint: 0xffffff, neon: 0xffc94a, neonGlow: 0.9, crystals: false, stars: false, motes: 0xffe6c0,
    scene: 'day', grass: [0x7fae4f, 0x94bd5a, 0xa9c468], flowers: [0xfff4e0, 0xffd96a, 0xffa0a0],
  },
  {
    id: 'atardecer', name: 'Atardecer', icon: '🌅', sky: 0x5a2a4a, fog: 0xb0586a, hemiSky: 0xffe0cc, hemiGround: 0x5a2a4a, hemi: 1.25,
    sunColor: 0xffc49a, sun: 2.1, groundTint: 0xfff2ea, neon: 0xff6a3d, neonGlow: 1.8, crystals: false, stars: false, motes: 0xffb070,
    scene: 'sunset', grass: [0xc9953d, 0xd6a84a, 0xa87a3a], flowers: [0xffe0a0, 0xffa07a, 0xfff0d0],
  },
  {
    id: 'noche', name: 'Noche', icon: '🌙', sky: 0x070b1e, fog: 0x0e1a3a, hemiSky: 0x8fb4ff, hemiGround: 0x101428, hemi: 0.9,
    sunColor: 0x9ec0ff, sun: 1.6, groundTint: 0xa8b4d8, neon: 0x4fd1ff, neonGlow: 2.6, crystals: true, stars: true, motes: 0x7dffea,
    scene: 'night', grass: [0x4f8f7a, 0x5a9f96, 0x4a78a0], flowers: [0xb8d0ff, 0xd8c0ff, 0x9ff0e0],
  },
];

export const THEME_BY_ID: Record<string, ThemeDef> = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const getTheme = (id: string | undefined) => THEME_BY_ID[id ?? ''] ?? THEMES[0];
