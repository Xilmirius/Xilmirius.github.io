// Destructibles del mapa, construcciones y trozos de material.
import * as THREE from 'three';
import { assetModel } from '../assets/registry';
import { DESTRUCT_DEF } from '../core/entities';
import { Rng } from '../core/rng';
import type { DestructSpawn } from '../core/terrain';
import type { StructFrame } from '../core/snapshot';
import { FAMILIES, FAMILY_COLORS, type Family } from '../core/types';
import { hazardStripes, toonGradient } from './textures';

const tg = () => toonGradient();

function rockGeo(r: Rng, s: number) {
  const g = new THREE.IcosahedronGeometry(s, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let d = seen.get(k);
    if (!d) { d = [r.range(0.8, 1.15), r.range(0.7, 1.1), r.range(0.8, 1.15)]; seen.set(k, d); }
    p.setXYZ(i, p.getX(i) * d[0], p.getY(i) * d[1], p.getZ(i) * d[2]);
  }
  g.computeVertexNormals();
  return g;
}

/** Cobertura destructible: el GLB prop.<familia> si existe, si no la versión procedural. */
export function buildDestructMesh(kind: Family, seed: number): THREE.Group {
  const file = assetModel(`prop.${kind}`);
  if (file) {
    const g = new THREE.Group();
    g.add(file);
    g.rotation.y = (seed * 1.7) % (Math.PI * 2);
    return g;
  }
  return buildDestructProcedural(kind, seed);
}

export function buildDestructProcedural(kind: Family, seed: number): THREE.Group {
  const r = new Rng(seed * 13 + 7);
  const g = new THREE.Group();
  const def = DESTRUCT_DEF[kind];
  const add = (m: THREE.Mesh) => { m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  if (kind === 'stone') {
    const mat = new THREE.MeshToonMaterial({ color: 0x9a8f86, gradientMap: tg() });
    const m = add(new THREE.Mesh(rockGeo(r, 0.72), mat));
    m.position.y = 0.55;
    m.scale.y = def.h / 1.3;
    const m2 = add(new THREE.Mesh(rockGeo(r, 0.38), mat));
    m2.position.set(r.range(-0.4, 0.4), 0.25, r.range(-0.4, 0.4));
  } else if (kind === 'metal') {
    const mat = new THREE.MeshToonMaterial({ color: 0x8fa3b8, gradientMap: tg() });
    const dark = new THREE.MeshToonMaterial({ color: 0x4d5a68, gradientMap: tg() });
    const box = add(new THREE.Mesh(new THREE.BoxGeometry(1.3, def.h, 1.3), mat));
    box.position.y = def.h / 2;
    for (const [x, z, w, d] of [[0, 0.66, 1.34, 0.08], [0, -0.66, 1.34, 0.08], [0.66, 0, 0.08, 1.34], [-0.66, 0, 0.08, 1.34]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), dark);
      b.position.set(x, def.h - 0.06, z);
      g.add(b);
      const b2 = b.clone();
      b2.position.y = 0.06;
      g.add(b2);
    }
    const x = new THREE.Mesh(new THREE.BoxGeometry(0.1, def.h * 1.1, 0.02), dark);
    x.position.set(0, def.h / 2, 0.66);
    x.rotation.z = 0.8;
    g.add(x);
    g.rotation.y = r.range(-0.3, 0.3);
  } else if (kind === 'crystal') {
    const mat = new THREE.MeshToonMaterial({ color: 0x9ff0ff, emissive: 0x2fbfff, emissiveIntensity: 0.55, gradientMap: tg(), transparent: true, opacity: 0.88 });
    const n = r.int(4, 6);
    for (let i = 0; i < n; i++) {
      const h = i === 0 ? def.h : r.range(0.6, 1.3);
      const c = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.28), mat));
      c.scale.set(1, h / 0.56, 1);
      c.position.set(i === 0 ? 0 : r.range(-0.35, 0.35), h / 2, i === 0 ? 0 : r.range(-0.35, 0.35));
      c.rotation.set(r.range(-0.35, 0.35), r.range(0, 3), r.range(-0.35, 0.35));
    }
    const base = add(new THREE.Mesh(rockGeo(r, 0.45), new THREE.MeshToonMaterial({ color: 0x6d6470, gradientMap: tg() })));
    base.scale.y = 0.4;
    base.position.y = 0.1;
  } else {
    const mat = new THREE.MeshToonMaterial({ color: 0x7bea4f, gradientMap: tg(), transparent: true, opacity: 0.85, emissive: 0x2a8a10, emissiveIntensity: 0.25 });
    const b = add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 14), mat));
    b.scale.set(1.05, def.h / 1.24, 1.05);
    b.position.y = def.h / 2;
    const b2 = add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), mat));
    b2.position.set(0.45, 0.25, 0.3);
    for (let i = 0; i < 4; i++) {
      const bub = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb8ff9a, transparent: true, opacity: 0.7 }));
      bub.position.set(r.range(-0.3, 0.3), r.range(0.3, def.h - 0.2), r.range(-0.3, 0.3));
      g.add(bub);
    }
  }
  return g;
}

interface DView { g: THREE.Group; stage: number; anim: number; baseY: number }

export class DestructiblesView {
  group = new THREE.Group();
  private items: DView[] = [];

  constructor(spawns: DestructSpawn[]) {
    spawns.forEach((d, i) => {
      const g = buildDestructMesh(d.kind, i);
      g.position.set(d.x, d.y, d.z);
      this.group.add(g);
      this.items.push({ g, stage: 0, anim: 0, baseY: d.y });
    });
  }

  apply(states: string) {
    for (let i = 0; i < this.items.length && i < states.length; i++) {
      const s = states.charCodeAt(i) - 48;
      const it = this.items[i];
      if (s === it.stage) continue;
      const wasDead = it.stage >= 3;
      it.stage = s;
      it.g.visible = s < 3;
      if (s < 3) {
        const k = [1, 0.85, 0.68][s];
        it.g.scale.set(k, k * (s === 0 ? 1 : 0.9), k);
        it.g.rotation.z = s === 0 ? 0 : (i % 2 ? 1 : -1) * 0.08 * s;
        if (wasDead) it.anim = 0.001;
      }
    }
  }

  update(dt: number) {
    for (const it of this.items) {
      if (it.anim > 0) {
        it.anim += dt * 3;
        const k = Math.min(1, it.anim);
        const e = 1 + Math.sin(k * Math.PI) * 0.15;
        it.g.scale.setScalar(k * e);
        if (it.anim >= 1) { it.anim = 0; it.g.scale.setScalar(1); }
      }
    }
  }

  position(i: number) { return this.items[i]?.g.position; }
}

export class StructuresView {
  group = new THREE.Group();
  private map = new Map<number, { g: THREE.Group; head?: THREE.Object3D; mat: THREE.MeshToonMaterial; born: number }>();
  private hazard = new THREE.MeshToonMaterial({ map: hazardStripes(), gradientMap: tg() });

  update(list: StructFrame[], teamColor: (t: number) => number, time: number, dt: number) {
    const seen = new Set<number>();
    for (const s of list) {
      seen.add(s.id);
      let v = this.map.get(s.id);
      if (!v) {
        v = buildStructureMesh(s.k, s.rot, teamColor(s.tm), this.hazard);
        v.born = time;
        this.group.add(v.g);
        this.map.set(s.id, v);
      }
      v.g.position.set(s.x, s.y, s.z);
      const grow = Math.min(1, (time - v.born) * 5);
      v.g.scale.set(1, grow, 1);
      v.mat.color.setScalar(0.5 + 0.5 * s.hp);
      if (v.head) {
        v.head.rotation.y += dt * 2;
      }
    }
    for (const [id, v] of this.map) {
      if (!seen.has(id)) {
        v.g.removeFromParent();
        this.map.delete(id);
      }
    }
  }

  clear() {
    for (const v of this.map.values()) v.g.removeFromParent();
    this.map.clear();
  }
}

/** Construcción (muro/torreta): el GLB struct.<tipo> si existe, si no la versión procedural. */
export function buildStructureMesh(kind: string, rot: number, color: number, hazard?: THREE.Material): { g: THREE.Group; head?: THREE.Object3D; mat: THREE.MeshToonMaterial; born: number } {
  const file = assetModel(`struct.${kind}`);
  if (file) {
    const g = new THREE.Group();
    g.add(file);
    g.rotation.y = kind === 'turret' ? 0 : rot;
    // El color de equipo se aplica a los materiales llamados "team" (convención para los GLB).
    file.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && m.name === 'team') m.color?.setHex(color); });
    return { g, head: file.getObjectByName('head') ?? undefined, mat: new THREE.MeshToonMaterial(), born: 0 };
  }
  const g = new THREE.Group();
  if (kind === 'turret') {
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: tg() });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.7, 10), new THREE.MeshToonMaterial({ color: 0x6b7784, gradientMap: tg() }));
    base.position.y = 0.35;
    const head = new THREE.Group();
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), mat);
    mat.color.set(0xffc94a);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), new THREE.MeshToonMaterial({ color: 0x333a40, gradientMap: tg() }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.35;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color }));
    light.position.y = 0.22;
    head.add(hb, barrel, light);
    head.position.y = 0.9;
    for (const m of [base, hb]) { m.castShadow = true; }
    g.add(base, head);
    return { g, head, mat, born: 0 };
  }
  const stone = kind === 'stonewall';
  const mat = stone ? new THREE.MeshToonMaterial({ color: 0xb0a090, gradientMap: tg() }) : (hazard ?? new THREE.MeshToonMaterial({ map: hazardStripes(), gradientMap: tg() })).clone() as THREE.MeshToonMaterial;
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 1.1), mat);
  m.position.y = 0.9;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.12, 1.16), new THREE.MeshBasicMaterial({ color }));
  cap.position.y = 1.8;
  g.add(cap);
  g.rotation.y = rot;
  return { g, mat, born: 0 };
}

// ───────────── trozos de material (simulados localmente, cosméticos) ─────────────

export interface PickupVis { id: number; mat: number; pos: THREE.Vector3; vel: THREE.Vector3; grounded: boolean; mesh: THREE.Object3D; t: number; collectBy: number; collectT: number }

export function pickupMesh(mat: number): THREE.Object3D {
  const fam = FAMILIES[mat] as Family;
  const file = assetModel(`pickup.${fam}`);
  if (file) return file;
  const color = FAMILY_COLORS[fam];
  let geo: THREE.BufferGeometry;
  if (fam === 'stone') geo = new THREE.DodecahedronGeometry(0.2);
  else if (fam === 'metal') geo = new THREE.TorusGeometry(0.14, 0.07, 6, 6);
  else if (fam === 'crystal') geo = new THREE.OctahedronGeometry(0.2);
  else geo = new THREE.SphereGeometry(0.18, 10, 8);
  const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({
    color, gradientMap: tg(), emissive: color, emissiveIntensity: fam === 'crystal' ? 0.6 : 0.25,
  }));
  m.castShadow = true;
  return m;
}
