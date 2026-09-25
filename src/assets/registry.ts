// Registro de assets en tiempo de ejecución. Cada pieza visual pide su asset por id:
//   const obj = assetModel('prop.stone') ?? buildDestructMesh('stone', i);
// Si el archivo está listado en public/assets/manifest.json se usa; si no, cae a lo procedural.
// Nada se rompe si falta un archivo o el manifest (ver catalog.ts).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ASSET_BY_ID, type AssetDef } from './catalog';

const BASE = 'assets/';
const files = new Set<string>();
const models = new Map<string, THREE.Object3D>();
const textures = new Map<string, THREE.Texture>();
let loading: Promise<void> | null = null;
/** Cuando está prendido (galería), todo se ve procedural aunque haya archivo, para comparar. */
let forceProcedural = false;

/** Lee el manifest y precarga modelos y texturas. Idempotente; nunca falla. */
export function loadAssets(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const r = await fetch(BASE + 'manifest.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const m = await r.json();
      for (const f of Array.isArray(m?.files) ? m.files : []) if (typeof f === 'string') files.add(f);
    } catch { return; }
    const gltf = new GLTFLoader();
    const tl = new THREE.TextureLoader();
    const jobs: Promise<void>[] = [];
    for (const a of Object.values(ASSET_BY_ID)) {
      if (!files.has(a.file)) continue;
      if (a.kind === 'model') {
        jobs.push(gltf.loadAsync(BASE + a.file).then((g) => {
          g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          models.set(a.id, g.scene);
        }).catch((e) => { console.warn(`[assets] no se pudo cargar ${a.file}`, e); files.delete(a.file); }));
      } else if (a.kind === 'texture') {
        jobs.push(tl.loadAsync(BASE + a.file).then((t) => {
          if (!a.id.endsWith('.glow')) t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          textures.set(a.id, t);
        }).catch((e) => { console.warn(`[assets] no se pudo cargar ${a.file}`, e); files.delete(a.file); }));
      }
    }
    await Promise.all(jobs);
    if (files.size) console.info(`[assets] ${files.size} archivo(s) reemplazan piezas procedurales`);
  })();
  return loading;
}

/** Espera a que termine la precarga, con tope (una partida nunca queda trabada por un asset). */
export function assetsReady(maxMs = 4000): Promise<void> {
  return Promise.race([loadAssets(), new Promise<void>((r) => setTimeout(r, maxMs))]);
}

export function setForceProcedural(on: boolean) { forceProcedural = on; }

function def(id: string): AssetDef | undefined {
  const d = ASSET_BY_ID[id];
  if (!d && import.meta.env?.DEV) console.warn(`[assets] id sin catalogar: ${id}`);
  return d;
}

/** ¿Hay archivo para este id? */
export function hasAssetFile(id: string) {
  const d = def(id);
  return !!d && !forceProcedural && files.has(d.file);
}

/** Copia del modelo del archivo, o null (usar la versión procedural). */
export function assetModel(id: string): THREE.Object3D | null {
  if (forceProcedural) return null;
  const m = models.get(id);
  return m ? cloneSkinned(m) : null;
}

/** Textura del archivo, o null. */
export function assetTexture(id: string): THREE.Texture | null {
  return forceProcedural ? null : textures.get(id) ?? null;
}

/** URL del ícono si hay archivo, o null. */
export function assetIconUrl(id: string): string | null {
  const d = def(id);
  return d && !forceProcedural && files.has(d.file) ? BASE + d.file : null;
}

/** HTML de un ícono: la imagen si existe, si no el emoji de siempre. */
export function iconHtml(id: string, emoji: string): string {
  const url = assetIconUrl(id);
  return url ? `<img class="aicon" src="${url}" alt="">` : emoji;
}

/** Igual que iconHtml pero como nodo, para la UI armada con h(). */
export function iconNode(id: string, emoji: string): Node {
  const url = assetIconUrl(id);
  if (!url) return document.createTextNode(emoji);
  const img = document.createElement('img');
  img.className = 'aicon';
  img.src = url;
  img.alt = '';
  return img;
}
