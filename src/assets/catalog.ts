// Catálogo de assets: TODO lo que el juego genera por código y se puede reemplazar por un archivo.
//
// Cómo se mejora de a una pieza:
//   1. Elegí una entrada (menú → 🧩 Assets muestra cada una, su estado y cómo se ve hoy).
//   2. Creá el archivo en public/assets/<file> respetando `spec`.
//   3. Agregá la ruta a public/assets/manifest.json → { "files": ["<file>", ...] }.
//   4. Listo: el juego usa el archivo. Si lo borrás, vuelve solo a la versión procedural.
// La checklist completa (docs/ASSETS_CATALOGO.md) se genera de este archivo: `npm run assets:doc`.
//
// Es datos puros (sin Three.js ni DOM) para poder testearlo y generar la doc en Node.
import { HEROES } from '../core/heroes';
import { HATS } from '../core/cosmetics';
import { ITEMS } from '../core/items';
import { ABILITY_SLOTS, FAMILIES, FAMILY_NAMES, HERO_IDS } from '../core/types';
import { STAGE_NAMES } from '../core/constants';
import { THEMES } from '../render/themes';

export type AssetKind = 'model' | 'texture' | 'icon' | 'sound';

export interface AssetDef {
  /** Id estable: el código pide el asset por este id. */
  id: string;
  kind: AssetKind;
  group: string;
  name: string;
  /** Ruta del archivo dentro de public/assets/ (sonidos: dentro de public/). */
  file: string;
  /** Qué tiene que cumplir el archivo (tamaño, pivote, orientación, presupuesto). */
  spec: string;
  /** Dónde vive la versión procedural en el código. */
  code: string;
}

const MODEL_RULES = 'GLB, 1 unidad = 1 m, origen en la base, mirando a +Z. Estilo toon/low-poly.';

const list: AssetDef[] = [];
const add = (a: AssetDef) => list.push(a);

// ───────────── personajes ─────────────
for (const id of HERO_IDS) {
  const h = HEROES[id];
  add({
    id: `hero.${id}`, kind: 'model', group: 'Personajes', name: `${h.name}: accesorios`, file: `models/heroes/${id}.glb`,
    spec: `${MODEL_RULES} Solo los accesorios (el cuerpo "bean" es común). Origen en los pies del bean (alto total 1.45). ≤ 1.500 tris.`,
    code: 'src/render/beanView.ts → buildExtras',
  });
}
for (const hat of HATS.filter((x) => x.id !== 'none')) {
  add({
    id: `hat.${hat.id}`, kind: 'model', group: 'Personajes', name: `Sombrero: ${hat.name}`, file: `models/hats/${hat.id}.glb`,
    spec: `${MODEL_RULES} Origen en la base del sombrero (apoya en la cabeza). ≤ 400 tris. Si algo gira, el nodo se llama "spin".`,
    code: 'src/render/beanView.ts → buildHat',
  });
}
for (const f of FAMILIES) {
  for (let s = 0; s < 4; s++) {
    add({
      id: `skin.${f}.${s}`, kind: 'texture', group: 'Personajes', name: `Piel ${FAMILY_NAMES[f]} · ${STAGE_NAMES[s]}`, file: `textures/skins/${f}_${s}.png`,
      spec: 'PNG 256×128 tileable en horizontal (envuelve la cápsula del bean). Pintá el color final de la piel con sus grietas; lo que brilla va en la máscara _glow.',
      code: 'src/render/textures.ts → beanSkin (map)',
    });
    add({
      id: `skin.${f}.${s}.glow`, kind: 'texture', group: 'Personajes', name: `Grietas ${FAMILY_NAMES[f]} · ${STAGE_NAMES[s]}`, file: `textures/skins/${f}_${s}_glow.png`,
      spec: 'PNG 256×128 en escala de grises, alineada con la piel: blanco = grieta que brilla con el color de grieta de la familia. Negro = nada.',
      code: 'src/render/textures.ts → beanSkin (glow)',
    });
  }
}

// ───────────── mapa ─────────────
const PROP_SIZE: Record<string, string> = { stone: '1.4 × 1.3', metal: '1.4 × 1.35', crystal: '1.1 × 1.8', goo: '1.3 × 1.0' };
for (const f of FAMILIES) {
  add({
    id: `prop.${f}`, kind: 'model', group: 'Mapa', name: `Cobertura de ${FAMILY_NAMES[f]}`, file: `models/props/${f}.glb`,
    spec: `${MODEL_RULES} Huella ${PROP_SIZE[f]} m (ancho × alto): la colisión usa esa medida. ≤ 800 tris. Se escala al romperse.`,
    code: 'src/render/propsView.ts → buildDestructMesh',
  });
  add({
    id: `pickup.${f}`, kind: 'model', group: 'Mapa', name: `Trozo de ${FAMILY_NAMES[f]}`, file: `models/pickups/${f}.glb`,
    spec: `${MODEL_RULES} ≈ 0.4 m, centrado (gira sobre sí mismo). Material emisivo suave. ≤ 200 tris.`,
    code: 'src/render/propsView.ts → pickupMesh',
  });
}
for (const [k, name, size] of [['wall', 'Muro de chapa (Remache)', '1.1 × 1.8 × 1.1'], ['stonewall', 'Muro de piedra (ítem Muralla)', '1.1 × 1.8 × 1.1'], ['turret', 'Torreta (Remache)', '0.8 × 1.2 × 0.8']] as const) {
  add({
    id: `struct.${k}`, kind: 'model', group: 'Mapa', name, file: `models/structures/${k}.glb`,
    spec: `${MODEL_RULES} ${size} m. ${k === 'turret' ? 'La parte que gira va en un nodo llamado "head".' : 'Se tiñe con el color del equipo en la tapa.'}`,
    code: 'src/render/propsView.ts → buildStructureMesh',
  });
}
add({
  id: 'terrain.atlas', kind: 'texture', group: 'Mapa', name: 'Atlas del terreno', file: 'textures/terrain_atlas.png',
  spec: 'PNG 1024×512. Mitad izquierda: baldosa de piso 2×2 m tileable con borde. Mitad derecha: estratos de roca verticales (paredes).',
  code: 'src/render/textures.ts → terrainAtlas',
});
for (const t of THEMES) {
  add({
    id: `sky.${t.id}`, kind: 'texture', group: 'Mapa', name: `Cielo: ${t.name}`, file: `textures/sky/${t.id}.jpg`,
    spec: 'JPG equirectangular 2048×1024 (panorama 360°). Se ve sobre todo hacia abajo (el abismo): que no tenga horizonte muy marcado.',
    code: 'src/render/gameView.ts → buildBackdrop (color plano + rocas y cristales)',
  });
}

// ───────────── proyectiles ─────────────
const PROJ: [string, string][] = [
  ['shard', 'Esquirla (Prisma, básico)'], ['lance', 'Lanza de cuarzo (Prisma Q)'], ['nova', 'Supernova (Prisma R)'],
  ['glob', 'Pegote (Gloop, básico)'], ['goolob', 'Frasco / Charco (lanzado)'], ['wave', 'Marea (Gloop R)'],
  ['hook', 'Gancho (Remache F)'], ['bolt', 'Bala de torreta'],
];
for (const [k, name] of PROJ) {
  add({
    id: `proj.${k}`, kind: 'model', group: 'Proyectiles', name, file: `models/projectiles/${k}.glb`,
    spec: `${MODEL_RULES} Centrado, apuntando a +Z (dirección de vuelo). Chico y legible desde arriba; emisivo con el color del efecto.`,
    code: 'src/render/fx.ts → buildProjectileMesh',
  });
}

// ───────────── íconos ─────────────
const ICON_SPEC = 'PNG 128×128 con fondo transparente, borde grueso, legible a 40 px.';
for (const id of HERO_IDS) {
  const h = HEROES[id];
  add({ id: `icon.basic.${id}`, kind: 'icon', group: 'Íconos', name: `${h.name}: ${h.basic.name}`, file: `icons/abilities/${id}_basic.png`, spec: ICON_SPEC, code: 'src/ui/hud.ts → buildBar (emoji)' });
  for (const s of ABILITY_SLOTS) {
    const a = h.abilities[s];
    add({ id: `icon.ability.${id}.${s}`, kind: 'icon', group: 'Íconos', name: `${h.name} ${s.toUpperCase()}: ${a.name}`, file: `icons/abilities/${id}_${s}.png`, spec: ICON_SPEC, code: `src/core/heroes/${id}.ts (icon: ${a.icon})` });
  }
}
add({ id: 'icon.push', kind: 'icon', group: 'Íconos', name: 'Empujón', file: 'icons/abilities/push.png', spec: ICON_SPEC, code: 'src/ui/hud.ts → buildBar (🫸)' });
add({ id: 'icon.dash', kind: 'icon', group: 'Íconos', name: 'Dash', file: 'icons/abilities/dash.png', spec: ICON_SPEC, code: 'src/ui/hud.ts → buildBar (💨)' });
for (const it of ITEMS) {
  add({ id: `icon.item.${it.id}`, kind: 'icon', group: 'Íconos', name: `Ítem: ${it.name}`, file: `icons/items/${it.id}.png`, spec: ICON_SPEC, code: `src/core/items.ts (icon: ${it.icon})` });
}
for (const f of FAMILIES) {
  add({ id: `icon.mat.${f}`, kind: 'icon', group: 'Íconos', name: `Material: ${FAMILY_NAMES[f]}`, file: `icons/materials/${f}.png`, spec: ICON_SPEC, code: 'src/ui/hud.ts → MAT_ICON' });
}

// ───────────── sonido ─────────────
// Los sonidos usan el mecanismo de src/audio/audio.ts: public/audio/sfx/<nombre>.mp3 + public/audio/sfx/manifest.json.
export const SFX: [string, string][] = [
  ['hit', 'Golpe'], ['hitbig', 'Golpe fuerte'], ['swing', 'Swing de puño'], ['push', 'Empujón'], ['charge', 'Carga del empujón'],
  ['shard', 'Disparo de cristal'], ['lance', 'Lanza'], ['glob', 'Pegote de goo'], ['wave', 'Ola'], ['hook', 'Gancho'], ['bolt', 'Torreta'],
  ['boom', 'Explosión'], ['quake', 'Terremoto'], ['lethal', 'Golpe letal'], ['crack', 'Grieta'], ['stage', 'Cambio de etapa del cuerpo'],
  ['crystal', 'Cristal rompiéndose'], ['metal', 'Metal'], ['goo', 'Goo'], ['stone', 'Piedra'],
  ['jump', 'Salto'], ['airjump', 'Segundo salto'], ['land', 'Aterrizaje'], ['slam', 'Estampado contra pared'], ['bounce', 'Rebote'], ['whoosh', 'Whoosh / dash'],
  ['ringout', 'Ring-out'], ['crowd', 'Público'], ['pickup', 'Juntar trozo'], ['coin', 'Moneda'], ['combo', 'Combo'],
  ['levelup', 'Subir de nivel'], ['craft', 'Fabricar'], ['repair', 'Reparar'], ['shield', 'Escudo'], ['ultready', 'Ulti lista'], ['ready', 'Habilidad lista'], ['jackpot', 'Premio'],
  ['count', 'Cuenta regresiva'], ['go', '¡A pelear!'], ['tick', 'Últimos segundos'], ['announce', 'Anuncio'], ['heart', 'Latido'],
  ['ui', 'Clic de interfaz'], ['hover', 'Hover'], ['deny', 'No se puede'], ['win', 'Victoria'], ['lose', 'Derrota'], ['blink', 'Parpadeo'], ['spawn', 'Aparecer'], ['tile', 'Baldosa rompiéndose'],
];
for (const [n, name] of SFX) {
  add({
    id: `sfx.${n}`, kind: 'sound', group: 'Sonido', name, file: `audio/sfx/${n}.mp3`,
    spec: 'MP3/OGG mono, corto, normalizado a −3 dB. Registrarlo en public/audio/sfx/manifest.json (["hit", ...]).',
    code: `src/audio/audio.ts → play('${n}') sintetizado`,
  });
}
add({ id: 'music.match', kind: 'sound', group: 'Sonido', name: 'Música de partida', file: 'audio/music.mp3', spec: 'MP3 en loop sin corte, 120–130 BPM.', code: 'src/audio/audio.ts → música generativa' });
add({ id: 'music.menu', kind: 'sound', group: 'Sonido', name: 'Música de menú', file: 'audio/menu.mp3', spec: 'MP3 en loop, versión tranquila del tema.', code: 'src/audio/audio.ts → música generativa' });

export const ASSETS: readonly AssetDef[] = list;
export const ASSET_BY_ID: Record<string, AssetDef> = Object.fromEntries(list.map((a) => [a.id, a]));
export const ASSET_GROUPS = [...new Set(list.map((a) => a.group))];
