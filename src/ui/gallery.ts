// Galería de assets (menú → 🧩 Assets): herramienta para ir reemplazando lo procedural de a una pieza.
// Muestra cada entrada del catálogo con su estado (procedural / archivo), la dibuja girando,
// y dice exactamente qué archivo crear y dónde. Con archivo, se puede comparar contra lo procedural.
import * as THREE from 'three';
import { audio } from '../audio/audio';
import { ASSETS, ASSET_GROUPS, type AssetDef } from '../assets/catalog';
import { assetIconUrl, hasAssetFile, setForceProcedural } from '../assets/registry';
import { TEAM_COLORS } from '../core/constants';
import { HEROES } from '../core/heroes';
import { ITEM_BY_ID } from '../core/items';
import { F_GROUNDED, type CharFrame } from '../core/snapshot';
import { FAMILIES, FAMILY_COLORS, type Family, type HeroId } from '../core/types';
import { BeanView, buildHat } from '../render/beanView';
import { buildProjectileMesh } from '../render/fx';
import { buildDestructMesh, buildStructureMesh, pickupMesh } from '../render/propsView';
import { beanSkin, terrainAtlas, toonGradient } from '../render/textures';
import { THEME_BY_ID } from '../render/themes';
import { clear, h, modal } from './dom';
import { MAT_ICON } from './tips';

type Filter = 'all' | 'procedural' | 'file';

/** ¿Este asset ya tiene archivo? (los sonidos los maneja audio.ts con su propio manifest) */
export function assetStatus(a: AssetDef): 'file' | 'procedural' {
  if (a.kind === 'sound') {
    if (a.id === 'music.match') return audio.hasMusicFile('match') ? 'file' : 'procedural';
    if (a.id === 'music.menu') return audio.hasMusicFile('menu') ? 'file' : 'procedural';
    return audio.hasSample(a.id.slice(4)) ? 'file' : 'procedural';
  }
  return hasAssetFile(a.id) ? 'file' : 'procedural';
}

/** Emoji que usa hoy el juego para un ícono (la versión "procedural" de los íconos). */
function iconEmoji(id: string): string {
  const [, kind, a, b] = id.split('.');
  if (kind === 'ability') return HEROES[a as HeroId]?.abilities[b as 'q']?.icon ?? '❔';
  if (kind === 'basic') return HEROES[a as HeroId]?.basic.kind === 'melee' ? '👊' : '🎯';
  if (kind === 'item') return ITEM_BY_ID[a]?.icon ?? '❔';
  if (kind === 'mat') return MAT_ICON[a as Family] ?? '❔';
  if (kind === 'push') return '🫸';
  if (kind === 'dash') return '💨';
  return '❔';
}

const sfxName = (a: AssetDef) => (a.id.startsWith('sfx.') ? a.id.slice(4) : null);

export function openGallery() {
  let filter: Filter = 'all';
  let query = '';
  let selected: AssetDef = ASSETS[0];
  let compare = false;

  const list = h('div', { class: 'gal-list' });
  const info = h('div', { class: 'gal-info' });
  const view = h('div', { class: 'gal-view' });
  const summary = h('div', { class: 'gal-sum' });
  const preview = new Turntable(view);

  const filters = h('div', { class: 'gal-filters' },
    ...(['all', 'procedural', 'file'] as Filter[]).map((f) => h('button', {
      class: 'chip' + (f === filter ? ' on' : ''), 'data-f': f,
      onclick: (e: Event) => {
        filter = f;
        for (const b of filters.querySelectorAll('.chip')) b.classList.toggle('on', b === e.currentTarget);
        renderList();
      },
    }, f === 'all' ? 'Todos' : f === 'procedural' ? '○ Procedurales' : '● Con archivo')),
    h('input', { class: 'input', placeholder: 'Buscar…', oninput: (e: Event) => { query = (e.target as HTMLInputElement).value.toLowerCase(); renderList(); } }),
  );

  function renderList() {
    clear(list);
    const done = ASSETS.filter((a) => assetStatus(a) === 'file').length;
    summary.textContent = `${done} de ${ASSETS.length} piezas ya usan archivo · el resto es procedural (código)`;
    for (const g of ASSET_GROUPS) {
      const items = ASSETS.filter((a) => a.group === g
        && (filter === 'all' || assetStatus(a) === filter)
        && (!query || a.name.toLowerCase().includes(query) || a.id.includes(query)));
      if (!items.length) continue;
      list.append(h('h4', null, `${g} (${items.length})`));
      for (const a of items) {
        const st = assetStatus(a);
        list.append(h('button', {
          class: 'gal-row' + (a === selected ? ' on' : ''),
          onclick: () => { selected = a; compare = false; renderList(); renderInfo(); },
        }, h('i', { class: 'dot ' + st }), h('span', null, a.name), h('small', null, a.id)));
      }
    }
  }

  function renderInfo() {
    const a = selected;
    const st = assetStatus(a);
    const base = a.kind === 'sound' ? 'public/' : 'public/assets/';
    clear(info);
    info.append(...[
      h('h3', null, a.name),
      h('div', { class: 'gal-tags' }, h('span', { class: 'dot ' + st }), st === 'file' ? 'Usa archivo' : 'Procedural (código)', h('span', null, ` · ${a.kind}`)),
      h('label', null, 'Id'), h('code', null, a.id),
      h('label', null, 'Archivo a crear'), h('code', null, base + a.file),
      h('label', null, 'Especificación'), h('p', null, a.spec),
      h('label', null, 'Versión procedural'), h('code', null, a.code),
      h('p', { class: 'muted small' }, a.kind === 'sound'
        ? 'Poné el archivo y agregá el nombre a public/audio/sfx/manifest.json (sonidos) — la música no necesita manifest.'
        : `Poné el archivo y agregá "${a.file}" a public/assets/manifest.json → { "files": [...] }. Recargá.`),
      st === 'file' && a.kind !== 'sound' && a.kind !== 'icon'
        ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: compare, onchange: (e: Event) => { compare = (e.target as HTMLInputElement).checked; showPreview(); } }), 'Ver la versión procedural para comparar')
        : null,
    ].filter((x): x is HTMLElement => !!x));
    showPreview();
  }

  function showPreview() {
    const a = selected;
    preview.clearDom();
    if (a.kind === 'sound') {
      const n = sfxName(a);
      preview.set(null);
      preview.dom(h('div', { class: 'gal-sound' },
        h('div', { class: 'big' }, '🔊'),
        n ? h('button', { class: 'btn', onclick: () => { audio.unlock(); audio.play(n, 1); } }, '▶ Escuchar') : h('p', { class: 'muted' }, 'La música suena en el menú y en la partida.')));
      return;
    }
    if (a.kind === 'icon') {
      preview.set(null);
      const url = assetIconUrl(a.id);
      preview.dom(h('div', { class: 'gal-icon' },
        h('div', null, h('div', { class: 'big' }, iconEmoji(a.id)), h('small', null, 'hoy (emoji)')),
        url ? h('div', null, h('img', { src: url, alt: '' }), h('small', null, 'archivo')) : null));
      return;
    }
    setForceProcedural(compare);
    try { preview.set(buildPreview(a)); } finally { setForceProcedural(false); }
  }

  const body = h('div', { class: 'gallery' },
    h('div', { class: 'gal-side' }, summary, filters, list),
    h('div', { class: 'gal-main' }, view, info),
  );
  renderList();
  renderInfo();
  modal('🧩 Assets: de procedural a archivo', body, [{ label: 'Cerrar' }], 'wide gallery-modal');
}

/** Objeto 3D para previsualizar un asset (lo mismo que usa el juego: archivo si hay, si no procedural). */
function buildPreview(a: AssetDef): THREE.Object3D | null {
  const [kind, x, y] = a.id.split('.');
  const tg = toonGradient();
  switch (kind) {
    case 'hero': {
      const bean = new BeanView(x as HeroId, 0, TEAM_COLORS[0], '', false);
      const f: CharFrame = { id: 1, x: 0, y: 0, z: 0, f: 0, vx: 0, vy: 0, vz: 0, fl: F_GROUNDED, heat: 0, st: 0, lv: 1, ac: '', ap: 0, ch: 0, sh: 0, k: 0, d: 0, a: 0, lives: 0, rt: 0 };
      bean.update(f, 0, -999, 0);
      bean.label.remove();
      return bean.root;
    }
    case 'hat': { const o = buildHat(x); if (o) o.scale.setScalar(2.5); return o; }
    case 'prop': return buildDestructMesh(x as Family, 0);
    case 'pickup': { const o = pickupMesh(FAMILIES.indexOf(x as Family)); o.scale.setScalar(3); o.position.y = 0.6; return o; }
    case 'struct': return buildStructureMesh(x, 0, TEAM_COLORS[0]).g;
    case 'proj': { const o = buildProjectileMesh(x, x === 'wave' ? 1.2 : 0.4); const g = new THREE.Group(); g.add(o); g.position.y = 0.8; g.scale.setScalar(x === 'wave' ? 1 : 2); return g; }
    case 'skin': {
      const fam = x as Family, stage = Number(y);
      const skin = beanSkin(fam, stage, FAMILY_COLORS[fam]);
      const glow = a.id.endsWith('.glow');
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 6, 18), glow
        ? new THREE.MeshBasicMaterial({ map: skin.glow })
        : new THREE.MeshToonMaterial({ map: skin.map, gradientMap: tg, emissive: 0xffffff, emissiveMap: skin.glow, emissiveIntensity: 0.3 }));
      m.scale.setScalar(1.6);
      m.position.y = 1.1;
      return m;
    }
    case 'terrain': {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: terrainAtlas(), side: THREE.DoubleSide }));
      m.position.y = 0.9;
      return m;
    }
    case 'sky': {
      const t = THEME_BY_ID[x];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ color: t?.sky ?? 0x1a1230, side: THREE.DoubleSide }));
      m.position.y = 0.9;
      return m;
    }
  }
  return null;
}

/** Visor 3D chiquito que gira el objeto. Se apaga solo cuando se cierra el modal. */
class Turntable {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  private holder = new THREE.Group();
  private overlay: HTMLDivElement;
  private raf = 0;
  private t = 0;

  constructor(private el: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(this.renderer.domElement);
    this.overlay = h('div', { class: 'gal-overlay' });
    el.appendChild(this.overlay);
    this.scene.add(new THREE.HemisphereLight(0xfff1e0, 0x4a3860, 1.8));
    const d = new THREE.DirectionalLight(0xffffff, 2.2);
    d.position.set(3, 5, 4);
    this.scene.add(d, this.holder);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
    disc.rotation.x = -Math.PI / 2;
    this.scene.add(disc);
    this.camera.position.set(0, 2, 5);
    this.camera.lookAt(0, 0.8, 0);
    const loop = () => {
      if (!this.el.isConnected) { this.dispose(); return; }
      this.raf = requestAnimationFrame(loop);
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }

  set(o: THREE.Object3D | null) {
    this.holder.clear();
    if (o) this.holder.add(o);
    this.renderer.domElement.style.display = o ? '' : 'none';
  }

  dom(node: Node) { this.overlay.append(node); }
  clearDom() { clear(this.overlay); }

  private render() {
    const w = this.el.clientWidth, h2 = this.el.clientHeight;
    if (!w || !h2) return;
    if (this.renderer.domElement.width !== Math.floor(w * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h2, false);
      this.camera.aspect = w / h2;
      this.camera.updateProjectionMatrix();
    }
    this.t += 1 / 60;
    this.holder.rotation.y = this.t * 0.8;
    this.renderer.render(this.scene, this.camera);
  }

  private dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
