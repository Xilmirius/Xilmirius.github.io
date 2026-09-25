// Vista del Asedio (MOBA): esbirros y neutrales, torres y núcleos con su barra de vida, escudo cuando
// están protegidos, el alcance de las torres rivales cuando te acercás, la línea roja cuando una torre
// te apunta, las bases (refugio) y los escombros de lo que se destruyó.
// Todo procedural y geométrico, con el color del equipo; cada pieza se puede reemplazar por un GLB
// del catálogo (unit.<tipo>, struct.tower, struct.core) sin tocar este código.
import * as THREE from 'three';
import { assetModel } from '../assets/registry';
import { BASE_RADIUS } from '../core/constants';
import { UNIT_KINDS, type UnitKind } from '../core/entities';
import { CORE, TOWER } from '../core/moba/defs';
import { S_INVULN, U_BLESSED, U_TUMBLE, type StructFrame, type UnitFrame } from '../core/snapshot';
import type { Terrain } from '../core/terrain';
import { FAMILY_COLORS } from '../core/types';
import { GLOW_MAX } from './juice';
import { toonGradient } from './textures';

/** Color de lo neutral (campamentos, Coloso): amarillo. */
export const NEUTRAL_COLOR = 0xffc629;
const RANGE_COLOR = 0xff5a4a;
const TARGET_ME = 0xff3b30;
const TARGET_ALLY = 0xff9a3d;
const BLESS_COLOR = 0xffd23f;

const toon = (c: number) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() });
const glow = (c: number, k = 1.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(Math.min(GLOW_MAX, k)), toneMapped: false });
const PLANE = new THREE.PlaneGeometry(1, 1);

/** Barra de vida que siempre mira a la cámara y se dibuja encima de todo. */
class Bar {
  g = new THREE.Group();
  private fill: THREE.Mesh;
  private fillMat: THREE.MeshBasicMaterial;
  constructor(private w: number, h: number, color: number) {
    // Las dos transparentes: así se ordenan por renderOrder (si el relleno fuera opaco, el fondo lo taparía).
    const back = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: 0x14101d, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }));
    back.scale.set(w + 0.1, h + 0.1, 1);
    this.fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
    this.fill = new THREE.Mesh(PLANE, this.fillMat);
    this.fill.scale.set(w, h, 1);
    back.renderOrder = 30;
    this.fill.renderOrder = 31;
    this.g.add(back, this.fill);
  }
  set(v: number, color?: number) {
    const f = Math.max(0, Math.min(1, v));
    this.fill.scale.x = Math.max(0.0001, this.w * f);
    this.fill.position.x = (-this.w * (1 - f)) / 2;
    if (color !== undefined) this.fillMat.color.setHex(color);
  }
}

// ───────────── esbirros y neutrales ─────────────

/** Alto aproximado de cada unidad (para poner la barra). */
const UNIT_H: Record<UnitKind, number> = { hero: 1.5, melee: 1.05, ranged: 1.35, siege: 1.3, neutral: 0.9, coloso: 3.1 };

/** Malla de una unidad: el GLB unit.<tipo> si existe; si no, la versión procedural. */
export function buildUnitMesh(kind: UnitKind, color: number): THREE.Group {
  const file = assetModel(`unit.${kind}`);
  if (file) {
    const g = new THREE.Group();
    file.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && m.name === 'team') m.color?.setHex(color); });
    g.add(file);
    return g;
  }
  return buildUnitProcedural(kind, color);
}

function buildUnitProcedural(kind: UnitKind, color: number): THREE.Group {
  const g = new THREE.Group();
  const team = toon(color);
  const eyes = glow(color, 1.25);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  switch (kind) {
    case 'melee': {
      // Guijarro: golemcito de piedra con casco del color del equipo y puños.
      const stone = toon(FAMILY_COLORS.stone);
      add(new THREE.DodecahedronGeometry(0.42, 0), stone, 0, 0.5, 0, 1, 0.95, 0.9);
      add(new THREE.CylinderGeometry(0.3, 0.36, 0.16, 6), team, 0, 0.88, 0);
      add(new THREE.BoxGeometry(0.1, 0.06, 0.04), eyes, -0.12, 0.66, 0.36);
      add(new THREE.BoxGeometry(0.1, 0.06, 0.04), eyes, 0.12, 0.66, 0.36);
      add(new THREE.DodecahedronGeometry(0.16, 0), stone, -0.42, 0.42, 0.12).name = 'fist';
      add(new THREE.DodecahedronGeometry(0.16, 0), stone, 0.42, 0.42, 0.12).name = 'fist';
      break;
    }
    case 'ranged': {
      // Chispa: cristal que flota sobre una base, con un anillo del color del equipo.
      add(new THREE.CylinderGeometry(0.22, 0.3, 0.2, 6), toon(0x5a4a60), 0, 0.1, 0);
      const c = add(new THREE.OctahedronGeometry(0.3, 0), toon(FAMILY_COLORS.crystal), 0, 0.85, 0, 1, 1.7, 1);
      c.name = 'float';
      const ring = add(new THREE.TorusGeometry(0.34, 0.05, 6, 20), team, 0, 0.85, 0);
      ring.rotation.x = Math.PI / 2;
      ring.name = 'float';
      add(new THREE.SphereGeometry(0.08, 8, 6), eyes, 0, 0.9, 0.22).name = 'float';
      break;
    }
    case 'siege': {
      // Ariete: carro de chatarra con cañón y franja del equipo.
      const metal = toon(FAMILY_COLORS.metal);
      add(new THREE.BoxGeometry(0.85, 0.5, 1.05), metal, 0, 0.55, 0);
      add(new THREE.BoxGeometry(0.88, 0.14, 1.08), team, 0, 0.72, 0);
      const barrel = add(new THREE.CylinderGeometry(0.13, 0.16, 0.8, 8), toon(0x3a4048), 0, 0.95, 0.35);
      barrel.rotation.x = Math.PI / 2.6;
      const wheel = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10);
      for (const [x, z] of [[-0.48, 0.32], [0.48, 0.32], [-0.48, -0.32], [0.48, -0.32]]) {
        const w = add(wheel, toon(0x2a2e34), x, 0.2, z);
        w.rotation.z = Math.PI / 2;
      }
      break;
    }
    case 'neutral': {
      // Babosa de goo: gota con ojos. Neutral = amarillo en la barra.
      const goo = new THREE.MeshToonMaterial({ color: FAMILY_COLORS.goo, gradientMap: toonGradient(), transparent: true, opacity: 0.9 });
      add(new THREE.SphereGeometry(0.5, 14, 10), goo, 0, 0.36, 0, 1, 0.72, 1.1).name = 'wobble';
      add(new THREE.SphereGeometry(0.09, 8, 6), toon(0x1a2a12), -0.16, 0.55, 0.4);
      add(new THREE.SphereGeometry(0.09, 8, 6), toon(0x1a2a12), 0.16, 0.55, 0.4);
      add(new THREE.SphereGeometry(0.04, 6, 4), glow(0xffe14a), -0.16, 0.58, 0.47);
      add(new THREE.SphereGeometry(0.04, 6, 4), glow(0xffe14a), 0.16, 0.58, 0.47);
      break;
    }
    case 'coloso': {
      // El Coloso: gólem enorme de piedra con cristales en los hombros y ojos de lava.
      const stone = toon(0x7a6d66);
      const crystal = toon(0xb070ff);
      add(new THREE.DodecahedronGeometry(1, 0), stone, 0, 1.45, 0, 1.1, 1.05, 0.9);
      add(new THREE.DodecahedronGeometry(0.55, 0), stone, 0, 2.55, 0.1);
      add(new THREE.BoxGeometry(0.22, 0.1, 0.06), glow(0xff8a3d, 1.3), -0.2, 2.62, 0.55);
      add(new THREE.BoxGeometry(0.22, 0.1, 0.06), glow(0xff8a3d, 1.3), 0.2, 2.62, 0.55);
      for (const s of [-1, 1]) {
        add(new THREE.DodecahedronGeometry(0.42, 0), stone, s * 1.25, 1.9, 0);
        add(new THREE.DodecahedronGeometry(0.5, 0), stone, s * 1.35, 0.9, 0.35).name = 'fist';
        const c = add(new THREE.OctahedronGeometry(0.28, 0), crystal, s * 1.3, 2.5, -0.1, 1, 2, 1);
        c.rotation.z = -s * 0.4;
      }
      add(new THREE.DodecahedronGeometry(0.45, 0), stone, -0.5, 0.35, 0);
      add(new THREE.DodecahedronGeometry(0.45, 0), stone, 0.5, 0.35, 0);
      break;
    }
    default:
      add(new THREE.SphereGeometry(0.4, 10, 8), team, 0, 0.5, 0);
  }
  return g;
}

interface UnitVis { root: THREE.Group; body: THREE.Group; bar: Bar; kind: UnitKind; team: number; atk: number; hurt: number; bless: THREE.Mesh | null; bob: number }

export class UnitsView {
  group = new THREE.Group();
  private map = new Map<number, UnitVis>();
  private blessGeo = new THREE.RingGeometry(0.55, 0.7, 24);
  private blessMat = new THREE.MeshBasicMaterial({ color: BLESS_COLOR, transparent: true, opacity: 0.7, side: THREE.DoubleSide });

  /** win: equipo ganador al terminar (-1 empate, -2 se juega): los esbirros ganadores saltan, los otros se desinflan. */
  update(list: UnitFrame[], camera: THREE.Camera, teamColor: (t: number) => number, time: number, dt: number, win = -2) {
    const seen = new Set<number>();
    for (const u of list) {
      seen.add(u.id);
      let v = this.map.get(u.id);
      const kind = UNIT_KINDS[u.k] ?? 'melee';
      const neutral = u.tm >= 2;
      if (!v) {
        const color = neutral ? NEUTRAL_COLOR : teamColor(u.tm);
        const root = new THREE.Group();
        const body = buildUnitMesh(kind, color);
        const w = kind === 'coloso' ? 2.4 : kind === 'siege' ? 1.1 : 0.85;
        const bar = new Bar(w, kind === 'coloso' ? 0.16 : 0.1, color);
        root.add(body);
        this.group.add(root, bar.g);
        v = { root, body, bar, kind, team: u.tm, atk: 0, hurt: 0, bless: null, bob: Math.random() * 6 };
        this.map.set(u.id, v);
      }
      v.root.position.set(u.x, u.y, u.z);
      v.root.rotation.y = u.f;
      // Animación: paso (rebote), flotar, golpe hacia adelante, tambaleo al recibir y giro si vuela.
      const moving = Math.hypot(u.vx, u.vz) > 0.6;
      v.atk = Math.max(0, v.atk - dt);
      v.hurt = Math.max(0, v.hurt - dt);
      const lunge = v.atk > 0 ? Math.sin((1 - v.atk / 0.25) * Math.PI) * 0.35 : 0;
      v.body.position.set(0, moving && kind !== 'ranged' ? Math.abs(Math.sin(time * 11 + v.bob)) * 0.07 : 0, lunge);
      const sq = 1 + v.hurt * 0.8;
      v.body.scale.set(sq, 2 - sq, sq);
      if (u.fl & U_TUMBLE) v.body.rotation.x += dt * 12; else v.body.rotation.x *= Math.max(0, 1 - dt * 10);
      for (const c of v.body.children) {
        if (c.name === 'float') c.position.y = 0.85 + Math.sin(time * 3 + v.bob) * 0.08;
        if (c.name === 'wobble') c.scale.set(1 + Math.sin(time * 6 + v.bob) * 0.05, 0.72 - Math.sin(time * 6 + v.bob) * 0.04, 1.1);
      }
      if (kind === 'ranged') v.body.children.filter((c) => c.name === 'float').forEach((c) => { c.rotation.y = time * 2; });
      if (win !== -2 && u.tm < 2) {
        if (u.tm === win) v.body.position.y = Math.abs(Math.sin(time * 6 + v.bob)) * 0.35;
        else { v.body.scale.set(1.08, 0.82, 1.08); v.body.rotation.x = 0.3; }
      }
      // Bendición del Coloso: aro dorado a los pies.
      if (u.fl & U_BLESSED) {
        if (!v.bless) {
          v.bless = new THREE.Mesh(this.blessGeo, this.blessMat);
          v.bless.rotation.x = -Math.PI / 2;
          v.bless.position.y = 0.05;
          v.root.add(v.bless);
        }
      }
      v.bar.g.position.set(u.x, u.y + UNIT_H[kind] + 0.3, u.z);
      v.bar.g.quaternion.copy(camera.quaternion);
      v.bar.set(u.hp);
    }
    for (const [id, v] of this.map) {
      if (seen.has(id)) continue;
      v.root.removeFromParent();
      v.bar.g.removeFromParent();
      this.map.delete(id);
    }
  }

  attack(id: number) { const v = this.map.get(id); if (v) v.atk = 0.25; }
  hurt(id: number) { const v = this.map.get(id); if (v) v.hurt = 0.14; }
  pos(id: number): THREE.Vector3 | null { return this.map.get(id)?.root.position ?? null; }
  kind(id: number): UnitKind | null { return this.map.get(id)?.kind ?? null; }
  teamOf(id: number): number { return this.map.get(id)?.team ?? -1; }

  clear() {
    for (const v of this.map.values()) { v.root.removeFromParent(); v.bar.g.removeFromParent(); }
    this.map.clear();
  }
}

// ───────────── torres y núcleos ─────────────

/** Torre o núcleo: el GLB struct.tower / struct.core si existe (material "team" se tiñe, nodo "spin" gira). */
export function buildFixedMesh(kind: 'tower' | 'core', color: number): { g: THREE.Group; spin: THREE.Object3D | null } {
  const file = assetModel(`struct.${kind}`);
  if (file) {
    const g = new THREE.Group();
    file.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && m.name === 'team') m.color?.setHex(color); });
    g.add(file);
    return { g, spin: file.getObjectByName('spin') ?? null };
  }
  const g = new THREE.Group();
  const stone = toon(0x8c8494);
  const dark = toon(0x4c4458);
  const team = toon(color);
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, parent: THREE.Object3D = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const spin = new THREE.Group();
  if (kind === 'tower') {
    mesh(new THREE.CylinderGeometry(1.05, 1.2, 0.55, 6), dark, 0.27);
    mesh(new THREE.CylinderGeometry(0.62, 0.82, 2.9, 6), stone, 1.95);
    mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.16, 6), team, 0.62);
    mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.16, 6), team, 2.3);
    mesh(new THREE.CylinderGeometry(0.9, 0.62, 0.45, 6), dark, 3.55);
    const crystal = mesh(new THREE.OctahedronGeometry(0.5, 0), glow(color, 1.2), 0, spin);
    crystal.scale.set(1, 1.5, 1);
    const ring = mesh(new THREE.TorusGeometry(0.72, 0.06, 6, 28), team, 0, spin);
    ring.rotation.x = Math.PI / 2;
    spin.position.y = TOWER.h + 0.45;
    g.add(spin);
  } else {
    mesh(new THREE.CylinderGeometry(1.75, 1.95, 0.5, 8), dark, 0.25);
    mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.4, 8), stone, 0.7);
    mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.12, 8), team, 0.95);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const c = mesh(new THREE.OctahedronGeometry(0.3, 0), team, 1.45);
      c.position.set(Math.cos(a) * 0.95, 1.45, Math.sin(a) * 0.95);
      c.scale.set(1, 2.2, 1);
      c.rotation.z = Math.cos(a) * 0.35;
      c.rotation.x = -Math.sin(a) * 0.35;
    }
    const heart = mesh(new THREE.OctahedronGeometry(0.62, 0), glow(color, 1.25), 0, spin);
    heart.scale.set(1, 1.7, 1);
    const r1 = mesh(new THREE.TorusGeometry(0.95, 0.07, 6, 32), team, 0, spin);
    r1.rotation.x = Math.PI / 2.4;
    spin.position.y = CORE.h - 0.9;
    g.add(spin);
  }
  return { g, spin };
}

interface FixedVis {
  g: THREE.Group; spin: THREE.Object3D | null; bar: Bar; shield: THREE.Mesh; range: THREE.Mesh | null; beam: THREE.Mesh;
  kind: 'tower' | 'core'; team: number; h: number; hurt: number; lastHp: number;
}

export interface MobaViewCtx {
  camera: THREE.Camera;
  teamColor: (t: number) => number;
  time: number;
  dt: number;
  /** Tu personaje (para alcances y "te está apuntando"), o null si sos espectador/estás muerto. */
  me: { id: number; team: number; x: number; z: number } | null;
  /** Posición de un cuerpo (héroe o unidad) por id. */
  bodyPos: (id: number) => THREE.Vector3 | null;
  /** ¿Ese id es un héroe aliado tuyo? (la línea de la torre se muestra para vos y tus aliados). */
  allyHero: (id: number) => boolean;
}

export class FixedView {
  group = new THREE.Group();
  private map = new Map<number, FixedVis>();
  private shieldGeo = new THREE.IcosahedronGeometry(1, 1);
  private beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6, 1, true);
  private rubble: THREE.Object3D[] = [];

  constructor(terrain: Terrain, teamColor: (t: number) => number) {
    // Bases (refugio): anillo del color del equipo alrededor de los puntos de aparición.
    for (const team of [0, 1]) {
      const pts = terrain.spawns.team[team] ?? [];
      if (!pts.length || !terrain.cores.length) continue;
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
      const ring = new THREE.Mesh(new THREE.RingGeometry(BASE_RADIUS - 0.2, BASE_RADIUS, 64), new THREE.MeshBasicMaterial({ color: teamColor(team), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cx, 0.04, cz);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(BASE_RADIUS, 48), new THREE.MeshBasicMaterial({ color: teamColor(team), transparent: true, opacity: 0.08, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(cx, 0.03, cz);
      this.group.add(ring, disc);
    }
  }

  update(list: StructFrame[], c: MobaViewCtx) {
    const seen = new Set<number>();
    for (const s of list) {
      if (s.k !== 'tower' && s.k !== 'core') continue;
      seen.add(s.id);
      let v = this.map.get(s.id);
      const color = c.teamColor(s.tm);
      if (!v) {
        const kind = s.k;
        const { g, spin } = buildFixedMesh(kind, color);
        g.position.set(s.x, s.y, s.z);
        const h = kind === 'tower' ? TOWER.h + 1 : CORE.h + 0.8;
        const bar = new Bar(kind === 'tower' ? 2.2 : 3, 0.2, color);
        const shield = new THREE.Mesh(this.shieldGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, wireframe: true, depthWrite: false }));
        const r = kind === 'tower' ? 1.7 : 2.6;
        shield.scale.set(r, h * 0.62, r);
        shield.position.set(s.x, s.y + h * 0.45, s.z);
        const beam = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: TARGET_ME, transparent: true, opacity: 0.85, depthWrite: false }));
        beam.visible = false;
        this.group.add(g, bar.g, shield, beam);
        v = { g, spin, bar, shield, range: null, beam, kind, team: s.tm, h, hurt: 0, lastHp: s.hp };
        this.map.set(s.id, v);
      }
      if (v.spin) { v.spin.rotation.y = c.time * (v.kind === 'core' ? 0.6 : 1.1); v.spin.position.y = (v.kind === 'tower' ? TOWER.h + 0.45 : CORE.h - 0.9) + Math.sin(c.time * 2) * 0.1; }
      // Tambaleo al recibir daño.
      if (s.hp < v.lastHp - 0.001) v.hurt = 0.18;
      v.lastHp = s.hp;
      v.hurt = Math.max(0, v.hurt - c.dt);
      const wob = v.hurt > 0 ? Math.sin(v.hurt * 60) * 0.03 : 0;
      v.g.rotation.z = wob;
      v.bar.g.position.set(s.x, s.y + v.h + 0.5, s.z);
      v.bar.g.quaternion.copy(c.camera.quaternion);
      v.bar.set(s.hp);
      v.shield.visible = (s.fl & S_INVULN) !== 0;
      v.shield.rotation.y = c.time * 0.3;
      // Alcance de las torres rivales cuando te acercás (rojo; más intenso si te apunta).
      const me = c.me;
      const range = v.kind === 'tower' ? TOWER.range : CORE.range;
      const hw = v.kind === 'tower' ? TOWER.hw : CORE.hw;
      const near = me && me.team !== s.tm && Math.hypot(me.x - s.x, me.z - s.z) < range + hw + 6;
      if (near && !v.range) {
        v.range = new THREE.Mesh(new THREE.RingGeometry(range + hw - 0.12, range + hw, 72), new THREE.MeshBasicMaterial({ color: RANGE_COLOR, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
        v.range.rotation.x = -Math.PI / 2;
        v.range.position.set(s.x, s.y + 0.06, s.z);
        this.group.add(v.range);
      }
      if (v.range) {
        v.range.visible = !!near;
        (v.range.material as THREE.MeshBasicMaterial).opacity = s.tg === me?.id ? 0.55 + 0.3 * Math.sin(c.time * 10) : 0.35;
      }
      // Línea de "te está apuntando": para vos (rojo) y tus aliados (naranja).
      const tp = s.tg >= 0 && me && (s.tg === me.id || c.allyHero(s.tg)) ? c.bodyPos(s.tg) : null;
      v.beam.visible = !!tp;
      if (tp) {
        const from = new THREE.Vector3(s.x, s.y + v.h - 0.4, s.z);
        const to = new THREE.Vector3(tp.x, tp.y + 0.9, tp.z);
        const mid = from.clone().add(to).multiplyScalar(0.5);
        v.beam.position.copy(mid);
        v.beam.scale.set(1, from.distanceTo(to), 1);
        v.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
        (v.beam.material as THREE.MeshBasicMaterial).color.setHex(s.tg === me!.id ? TARGET_ME : TARGET_ALLY);
      }
    }
    for (const [id, v] of this.map) {
      if (seen.has(id)) continue;
      for (const o of [v.g, v.bar.g, v.shield, v.beam, v.range]) o?.removeFromParent();
      this.map.delete(id);
    }
  }

  /** Escombros donde había una torre o núcleo (quedan para siempre). */
  addRubble(x: number, y: number, z: number, big: boolean) {
    const g = new THREE.Group();
    const mat = toon(0x6a6070);
    for (let i = 0; i < (big ? 9 : 6); i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.4, 0), mat);
      const a = Math.random() * Math.PI * 2, d = Math.random() * (big ? 1.6 : 1);
      m.position.set(Math.cos(a) * d, 0.2, Math.sin(a) * d);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.castShadow = true;
      g.add(m);
    }
    g.position.set(x, y, z);
    this.group.add(g);
    this.rubble.push(g);
  }

  topOf(id: number): THREE.Vector3 | null {
    const v = this.map.get(id);
    return v ? new THREE.Vector3(v.g.position.x, v.g.position.y + v.h - 0.4, v.g.position.z) : null;
  }
}
