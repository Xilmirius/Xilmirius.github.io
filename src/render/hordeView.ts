// Lo que se ve de la Horda además de héroes y zombis: el arma en la mano, las trazas de las balas, las cargas
// de C4, las cajas de suministros y las mini bases. Las cajas y las bases llegan en el estado del modo
// (ModeHud.horde, en cada snapshot); las trazas y el C4, por eventos (ver core/weapons.ts).
import * as THREE from 'three';
import { CRATE_INFO, CRATE_KINDS, HORDE } from '../core/horde';
import type { ModeHud } from '../core/modes';
import { WEAPON_IDS } from '../core/weapons';
import { toonGradient } from './textures';

/** Color de cada cosa que puede traer una caja (mismo orden que CRATE_KINDS). */
export const CRATE_COLORS: Record<string, number> = { uzi: 0xffd23f, shotgun: 0xff8a3c, launcher: 0xff4d5e, c4: 0xc86bff, med: 0x4fd1ff, fuel: 0x3ddc84 };
/** Color de la traza de cada arma (mismo orden que WEAPON_IDS). */
export const TRACER_COLORS = [0xffe9a8, 0xffd23f, 0xffa24f, 0xff8a3c];
export const BASE_COLOR = 0x4fd1ff;

const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });

/** El arma en la mano, apuntando hacia +Z (el frente del personaje). */
export function buildGunMesh(idx: number): THREE.Group {
  const g = new THREE.Group();
  const dark = toon(0x2c313a), steel = toon(0x7d8794);
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const tube = (r: number, len: number, m: THREE.Material, y: number, z: number) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
    o.rotation.x = Math.PI / 2;
    o.position.set(0, y, z);
    g.add(o);
    return o;
  };
  switch (WEAPON_IDS[idx]) {
    case 'uzi':
      box(0.11, 0.15, 0.42, dark, 0, 0, 0.1);
      box(0.08, 0.26, 0.09, dark, 0, -0.18, 0.12); // cargador
      box(0.08, 0.16, 0.1, steel, 0, -0.12, -0.06); // empuñadura
      tube(0.035, 0.16, steel, 0.01, 0.38);
      break;
    case 'shotgun':
      box(0.1, 0.13, 0.4, toon(0x7a4a26), 0, -0.02, -0.14); // culata
      box(0.11, 0.13, 0.3, dark, 0, 0, 0.18);
      tube(0.045, 0.62, steel, 0.03, 0.6);
      tube(0.04, 0.34, toon(0x7a4a26), -0.05, 0.5); // corredera
      break;
    case 'launcher':
      tube(0.13, 0.95, toon(0x4f6b3a), 0.06, 0.2);
      tube(0.16, 0.12, dark, 0.06, 0.68);
      tube(0.15, 0.1, dark, 0.06, -0.28);
      box(0.08, 0.2, 0.1, dark, 0, -0.12, 0.1);
      box(0.05, 0.1, 0.16, steel, 0.12, 0.14, 0.2); // mira
      break;
    default: // pistola
      box(0.09, 0.12, 0.32, dark, 0, 0, 0.1);
      box(0.08, 0.2, 0.1, steel, 0, -0.14, 0);
      tube(0.03, 0.08, steel, 0.02, 0.29);
  }
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  return g;
}

/** Cartelito con un emoji (para saber qué trae una caja desde lejos). */
function emojiSprite(icon: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.font = '72px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, 48, 54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.setScalar(0.95);
  return s;
}

function buildCrate(kind: string): { g: THREE.Group; box: THREE.Group; beam: THREE.Mesh; sign: THREE.Sprite } {
  const color = CRATE_COLORS[kind] ?? 0xffd23f;
  const g = new THREE.Group();
  const box = new THREE.Group();
  if (kind === 'fuel') {
    // Bidón de combustible.
    const can = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.36), toon(0xd94a3a));
    can.position.y = 0.4;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8), toon(0x2c313a));
    cap.position.set(0.14, 0.83, 0);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.14, 0.38), new THREE.MeshBasicMaterial({ color }));
    band.position.y = 0.4;
    box.add(can, cap, band);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.6, 0.85), toon(0x5a4a3a));
    body.position.y = 0.32;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.9), toon(0x3d3229));
    lid.position.y = 0.66;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.16, 0.88), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.15), toneMapped: false }));
    band.position.y = 0.36;
    box.add(body, lid, band);
  }
  box.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  // Columna de luz: se ve dónde cayó aunque haya zombis encima.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.42, 7, 14, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  beam.position.y = 3.5;
  const sign = emojiSprite(CRATE_INFO[kind]?.icon ?? '❓');
  sign.position.y = 1.5;
  g.add(box, beam, sign);
  return { g, box, beam, sign };
}

function buildBase(): { g: THREE.Group; flag: THREE.Mesh; ring: THREE.Mesh } {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.6, 8), toon(0xb8c0cc));
  pole.position.y = 1.3;
  pole.castShadow = true;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ color: BASE_COLOR, side: THREE.DoubleSide, toneMapped: false }));
  flag.position.set(0.47, 2.25, 0);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(BASE_COLOR).multiplyScalar(1.3), toneMapped: false }));
  lamp.position.y = 2.68;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(HORDE.baseR - 0.12, HORDE.baseR, 56),
    new THREE.MeshBasicMaterial({ color: BASE_COLOR, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(HORDE.baseR, 40), new THREE.MeshBasicMaterial({ color: BASE_COLOR, transparent: true, opacity: 0.06, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.05;
  g.add(pole, flag, lamp, ring, fill);
  return { g, flag, ring };
}

interface CrateVis { g: THREE.Group; box: THREE.Group; beam: THREE.Mesh; sign: THREE.Sprite; t: number; seed: number }
interface Tracer { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; life: number }
interface Charge { g: THREE.Group; lamp: THREE.Mesh; t: number; dur: number }

const TRACERS = 56;

export class HordeView {
  group = new THREE.Group();
  private crates = new Map<number, CrateVis>();
  private bases: { g: THREE.Group; flag: THREE.Mesh; ring: THREE.Mesh }[] = [];
  private tracers: Tracer[] = [];
  private next = 0;
  private charges: Charge[] = [];
  private tmp = new THREE.Vector3();

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.tracers.push({ mesh, mat, t: 0, life: 0 });
    }
  }

  /** Traza de una bala: una línea brillante que se apaga en un instante. */
  tracer(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, width = 0.045, life = 0.09) {
    const t = this.tracers[this.next];
    this.next = (this.next + 1) % TRACERS;
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    if (len < 0.2) return;
    t.mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    t.mesh.lookAt(this.tmp.set(x1, y1, z1));
    t.mesh.scale.set(width, width, len);
    t.mat.color.setHex(color).multiplyScalar(1.25);
    t.mat.opacity = 0.95;
    t.mesh.visible = true;
    t.t = 0;
    t.life = life;
  }

  /** Carga de C4 en el piso: la luz parpadea cada vez más rápido hasta que explota. */
  plant(x: number, y: number, z: number, fuse: number) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.3), toon(0x6b7a3a));
    body.position.y = 0.1;
    body.castShadow = true;
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.08), toon(0x2c313a));
    strap.position.y = 0.2;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false }));
    lamp.position.set(0.1, 0.24, 0);
    g.add(body, strap, lamp);
    g.position.set(x, y, z);
    g.rotation.y = Math.random() * Math.PI;
    this.group.add(g);
    this.charges.push({ g, lamp, t: 0, dur: fuse });
  }

  update(h: ModeHud['horde'] | undefined, time: number, dt: number) {
    for (const t of this.tracers) {
      if (!t.mesh.visible) continue;
      t.t += dt;
      if (t.t >= t.life) { t.mesh.visible = false; continue; }
      t.mat.opacity = 0.95 * (1 - t.t / t.life);
    }
    if (this.charges.length) {
      for (const c of this.charges) {
        c.t += dt;
        // Parpadea de 3 a 14 veces por segundo.
        const rate = 3 + 11 * Math.min(1, c.t / c.dur);
        c.lamp.visible = Math.floor(c.t * rate * 2) % 2 === 0;
        c.lamp.scale.setScalar(1 + (c.t / c.dur) * 0.8);
        if (c.t >= c.dur) c.g.removeFromParent();
      }
      this.charges = this.charges.filter((c) => c.t < c.dur);
    }

    const seen = new Set<number>();
    for (const [id, x, y, z, kind] of h?.crates ?? []) {
      seen.add(id);
      let v = this.crates.get(id);
      if (!v) {
        v = { ...buildCrate(CRATE_KINDS[kind] ?? 'uzi'), t: 0, seed: Math.random() * 6 };
        this.group.add(v.g);
        this.crates.set(id, v);
      }
      v.t += dt;
      // Cae del cielo y rebota un poquito al llegar.
      const u = Math.min(1, v.t / HORDE.crateLand);
      const fall = (1 - u * u) * 13;
      const settle = u >= 1 ? Math.max(0, 0.18 - (v.t - HORDE.crateLand) * 0.6) * Math.abs(Math.sin((v.t - HORDE.crateLand) * 18)) : 0;
      v.g.position.set(x, y, z);
      v.box.position.y = fall + settle;
      v.box.rotation.y = v.seed + (u < 1 ? (1 - u) * 5 : 0);
      v.sign.position.y = 1.5 + fall + Math.sin(time * 3 + v.seed) * 0.08;
      (v.beam.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.08 * Math.sin(time * 4 + v.seed);
    }
    for (const [id, v] of this.crates) {
      if (seen.has(id)) continue;
      v.g.removeFromParent();
      this.crates.delete(id);
    }

    const bases = h?.bases ?? [];
    while (this.bases.length > bases.length) this.bases.pop()!.g.removeFromParent();
    bases.forEach(([x, y, z], i) => {
      let b = this.bases[i];
      if (!b) {
        b = buildBase();
        this.group.add(b.g);
        this.bases.push(b);
      }
      b.g.position.set(x, y, z);
      b.flag.rotation.y = Math.sin(time * 2.2 + i) * 0.35;
      (b.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.15 * Math.sin(time * 2 + i);
    });
  }

  clear() {
    for (const v of this.crates.values()) v.g.removeFromParent();
    this.crates.clear();
    for (const b of this.bases) b.g.removeFromParent();
    this.bases = [];
    for (const c of this.charges) c.g.removeFromParent();
    this.charges = [];
  }
}
