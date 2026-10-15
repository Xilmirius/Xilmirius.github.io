// Artefactos del mapa (ver core/gadgets.ts): resortes, paragolpes, rotores, géiseres, cajas de ítems, aceleradores
// y lanzabolas. Salen del mapa, así que host y clientes los arman igual; rotores, géiseres y bolas se animan a
// partir del tick (son deterministas en el tiempo) y las cajas con el estado que viaja en el frame.
import * as THREE from 'three';
import { CELL, TICK_RATE } from '../core/constants';
import { BOOST, BUMPER, GEYSER, geyserPhase, geyserTime, ROLLER, ROTOR, rotorAngle } from '../core/gadgets';
import type { Gate, Terrain } from '../core/terrain';
import { MESH_FLOOR } from '../core/terrainMesh';
import { Support } from './support';
import { hazardStripes, ringTexture, softDisc, toonGradient } from './textures';

/** Colores de cada artefacto (también los usa la vista para sus efectos). */
export const GADGET_COLORS = { pad: 0x7dff6a, bumper: 0xff4f8b, rotor: 0xffc629, geyser: 0x4fd1ff, box: 0xb070ff, barrel: 0xff5a2a, boost: 0xff8a1e, roller: 0x5a6cff };

const toon = (c: number) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() });
const glow = (c: number, k = 1.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });

interface PadVis { plate: THREE.Object3D; x: number; z: number; squash: number }
interface BumperVis { body: THREE.Object3D; ring: THREE.MeshBasicMaterial; pulse: number }
interface RotorVis { arm: THREE.Object3D; idx: number }
interface GeyserVis { idx: number; ring: THREE.MeshBasicMaterial; jet: THREE.Mesh; jetMat: THREE.MeshBasicMaterial; x: number; y: number; z: number }
interface BoxVis { g: THREE.Group; idx: number; on: boolean; pop: number; y: number }
interface GateVis { mat: THREE.MeshBasicMaterial; x: number; y: number; z: number }
interface BoostVis { bolt: THREE.MeshBasicMaterial; ring: THREE.Mesh; idx: number; pulse: number }
/** Un lanzabolas con sus bolas (más las que entran en el carril, una que se ve caer al final). */
interface RollerVis { idx: number; x: number; y: number; z: number; dx: number; dz: number; len: number; balls: THREE.Mesh[] }

/** Lo que sigue viéndose una bola después del borde, cayendo. */
const ROLLER_FALL = 3;

/** Rayo del acelerador. */
function boltTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.beginPath();
  for (const [x, y] of [[74, 8], [30, 70], [58, 70], [46, 120], [98, 52], [68, 52]]) g.lineTo(x, y);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Bola de bolera: una franja clara y tres agujeros, para que se note que rueda. */
function ballTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a47c8';
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#9fb0ff';
  g.fillRect(0, 24, 128, 16);
  g.fillStyle = '#14183c';
  for (const [x, y] of [[22, 14], [36, 20], [22, 30]]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Damero de la meta. */
function checkerTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    g.fillStyle = (i + j) % 2 ? '#1a1a22' : '#f2f2f2';
    g.fillRect(i * 16, j * 16, 16, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Cuánto asoma el piso real de la malla orgánica fuera de las celdas del plano de una puerta (docs/MALLA.md §5). */
const GATE_ALERO = 1;
/** Altura sobre el piso de la franja de una puerta. */
const GATE_LIFT = 0.03;

/** Recorta un polígono convexo contra el rectángulo [x0, x1] × [z0, z1] (Sutherland–Hodgman). */
function clipRect(poly: [number, number][], x0: number, x1: number, z0: number, z1: number): [number, number][] {
  const planes: [number, number, number][] = [[1, 0, -x0], [-1, 0, x1], [0, 1, -z0], [0, -1, z1]]; // a·x + b·z + c >= 0
  let out = poly;
  for (const [a, b, c] of planes) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const p = inp[i], q = inp[(i + 1) % inp.length];
      const dp = a * p[0] + b * p[1] + c, dq = a * q[0] + b * q[1] + c;
      if (dp >= 0) out.push(p);
      if ((dp >= 0) !== (dq >= 0)) { const k = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
    }
    if (!out.length) break;
  }
  return out;
}

/**
 * La franja de una puerta: el piso real de lado a lado en el grosor de sus celdas del plano (el piso que asoma de la malla
 * orgánica incluido), a la altura de cada celda de la malla. Con la malla cuadrada son las mismas celdas de siempre. El UV sigue
 * la grilla del plano (una vuelta de la textura por celda).
 */
function gateGeometry(t: Terrain, gate: Gate): { geo: THREE.BufferGeometry; y: number } {
  const m = t.mesh;
  let ix0 = Infinity, ix1 = -Infinity, iz0 = Infinity, iz1 = -Infinity;
  for (const ci of gate.cells) {
    const ix = ci % t.w, iz = Math.floor(ci / t.w);
    ix0 = Math.min(ix0, ix); ix1 = Math.max(ix1, ix); iz0 = Math.min(iz0, iz); iz1 = Math.max(iz1, iz);
  }
  const bx0 = t.originX + ix0 * CELL, bx1 = t.originX + (ix1 + 1) * CELL, bz0 = t.originZ + iz0 * CELL, bz1 = t.originZ + (iz1 + 1) * CELL;
  // La franja es recta en el sentido de su grosor y llega hasta donde llega el piso en el otro.
  const alongX = bx1 - bx0 >= bz1 - bz0;
  const x0 = alongX ? bx0 - GATE_ALERO : bx0, x1 = alongX ? bx1 + GATE_ALERO : bx1;
  const z0 = alongX ? bz0 : bz0 - GATE_ALERO, z1 = alongX ? bz1 : bz1 + GATE_ALERO;
  const pos: number[] = [], uv: number[] = [];
  let y = 0;
  for (let q = 0; q < m.count; q++) {
    if (m.cls[q] !== MESH_FLOOR || m.maxX[q] <= x0 || m.minX[q] >= x1 || m.maxZ[q] <= z0 || m.minZ[q] >= z1) continue;
    const poly: [number, number][] = [];
    for (let k = 0; k < 4; k++) { const v = m.quads[q * 4 + k]; poly.push([m.vx[v], m.vz[v]]); }
    const clipped = clipRect(poly, x0, x1, z0, z1);
    if (clipped.length < 3) continue;
    y = m.top[q] + GATE_LIFT;
    for (let i = 1; i + 1 < clipped.length; i++) {
      for (const [px, pz] of [clipped[0], clipped[i + 1], clipped[i]]) {
        pos.push(px, y, pz);
        uv.push((px - t.originX) / CELL, -(pz - t.originZ) / CELL);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return { geo, y: y - GATE_LIFT };
}

/** Ancho del carril pintado de las bolas. */
const LANE_W = 1.25;
/** Largo de cada tramo con el que el carril se recorta al piso. */
const LANE_STEP = 0.25;

/**
 * El carril de un lanzabolas, en las coordenadas del lanzabolas (z a lo largo del carril): una cinta de `LANE_W` de ancho que se
 * angosta donde el piso real es más angosto, para no pintar sobre el vacío.
 */
function laneGeometry(sup: Support, x: number, z: number, dx: number, dz: number, len: number): THREE.BufferGeometry {
  const n = Math.max(1, Math.ceil(len / LANE_STEP));
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const d = Math.min(len, i * (len / n));
    // El último tramo termina justo en el borde del piso: se mide un poco antes, donde todavía hay piso.
    const dm = Math.min(d, len - 0.05), cx = x + dx * dm, cz = z + dz * dm;
    // En el lanzabolas, +x del carril es (dz, -dx) en el mundo.
    const [lo, hi] = sup.span(cx, cz, dz, -dx, LANE_W, sup.ground);
    // Cada borde de la cinta se angosta hasta que su vértice cae sobre piso (el fin del piso no siempre es recto).
    const ex = x + dx * Math.min(d, len - 0.01), ez = z + dz * Math.min(d, len - 0.01);
    const edge = (w: number, sgn: number) => {
      let k = Math.min(LANE_W / 2, w - 0.02);
      while (k > 0.02 && !sup.ground(ex + sgn * dz * (k + 0.03), ez - sgn * dx * (k + 0.03))) k *= 0.85;
      return Math.max(0, k);
    };
    const a = edge(lo, -1), b = edge(hi, 1);
    pos.push(-a, 0, d, b, 0, d);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

function boxTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6a3fd0';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#d9c2ff';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 118, 118);
  g.fillStyle = '#ffe14a';
  g.font = 'bold 96px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class GadgetsView {
  group = new THREE.Group();
  private pads: PadVis[] = [];
  private bumpers = new Map<number, BumperVis>();
  private rotors: RotorVis[] = [];
  private geysers: GeyserVis[] = [];
  private boxes = new Map<number, BoxVis>();
  private boosts = new Map<number, BoostVis>();
  private rollers: RollerVis[] = [];
  private lastGad = '';
  // Carrera: franja en el piso por cada puerta y una flecha sobre la que te toca.
  private gates: GateVis[] = [];
  private nextGate = -1;
  private arrow: THREE.Mesh | null = null;

  constructor(t: Terrain) {
    const sup = new Support(t);
    for (let i = 0; i < t.cells.length; i++) {
      if (!t.cells[i].pad) continue;
      const c = t.cellCenter(i % t.w, Math.floor(i / t.w));
      const y = t.groundAt(c.x, c.z);
      this.addPad(c.x, Number.isFinite(y) ? y : t.topAt(i, c.x, c.z), c.z);
    }
    t.gadgets.forEach((g, idx) => {
      const y = Math.max(0, t.groundAt(g.x, g.z));
      if (g.kind === 'bumper') this.addBumper(idx, g.x, y, g.z);
      else if (g.kind === 'rotor') this.addRotor(idx, g.x, y, g.z);
      else if (g.kind === 'geyser') this.addGeyser(idx, g.x, y, g.z);
      else if (g.kind === 'boost') this.addBoost(idx, g.x, y, g.z);
      else if (g.kind === 'roller') this.addRoller(sup, idx, g.x, y, g.z, g.dx ?? 0, g.dz ?? 0, g.len ?? 0);
      else this.addBox(idx, g.x, y, g.z);
    });
    t.gates.forEach((gate, i) => {
      const goal = i === t.gates.length - 1;
      const mat = new THREE.MeshBasicMaterial(goal
        ? { map: checkerTexture(), transparent: true, opacity: 0.85, depthWrite: false }
        : { color: 0xffd23f, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false });
      const strip = gateGeometry(t, gate);
      const mesh = new THREE.Mesh(strip.geo, mat);
      mesh.renderOrder = 1;
      this.group.add(mesh);
      const y = strip.y;
      this.gates.push({ mat, x: gate.x, y, z: gate.z });
    });
    if (this.gates.length) {
      this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 4), glow(0xffd23f, 1.25));
      this.arrow.rotation.x = Math.PI;
      this.arrow.visible = false;
      this.group.add(this.arrow);
    }
  }

  /** Carrera: cuál es la próxima puerta del jugador local (-1 = ninguna). */
  setNextGate(i: number) { this.nextGate = i; }

  private add<T extends THREE.Object3D>(parent: THREE.Object3D, o: T, x: number, y: number, z: number, shadow = true): T {
    o.position.set(x, y, z);
    if (shadow) o.castShadow = true;
    parent.add(o);
    return o;
  }

  private addPad(x: number, y: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const r = CELL * 0.42;
    this.add(g, new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 0.12, 20), toon(0x3a4048)), 0, 0.06, 0, false);
    const plate = new THREE.Group();
    this.add(plate, new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.1, 20), toon(GADGET_COLORS.pad)), 0, 0.05, 0, false);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.34, r * 0.5, 3), glow(0xeaffd9, 1.1));
    arrow.rotation.x = -Math.PI / 2;
    arrow.scale.z = 0.25;
    this.add(plate, arrow, 0, 0.11, 0, false);
    plate.position.y = 0.16;
    g.add(plate);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.045, 6, 28), glow(GADGET_COLORS.pad, 1.25));
    rim.rotation.x = Math.PI / 2;
    this.add(g, rim, 0, 0.13, 0, false);
    this.group.add(g);
    this.pads.push({ plate, x, z, squash: 0 });
  }

  private addBumper(idx: number, x: number, y: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const body = new THREE.Group();
    this.add(body, new THREE.Mesh(new THREE.CylinderGeometry(BUMPER.r * 0.72, BUMPER.r * 0.86, 0.95, 14), toon(0x4a4f6a)), 0, 0.475, 0);
    this.add(body, new THREE.Mesh(new THREE.CylinderGeometry(BUMPER.r * 0.95, BUMPER.r * 0.8, 0.22, 14), toon(GADGET_COLORS.bumper)), 0, 1.02, 0);
    this.add(body, new THREE.Mesh(new THREE.SphereGeometry(BUMPER.r * 0.4, 12, 8), toon(0xfff0f5)), 0, 1.2, 0);
    const ringMat = glow(GADGET_COLORS.bumper, 1.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(BUMPER.r * 0.9, 0.07, 6, 24), ringMat);
    ring.rotation.x = Math.PI / 2;
    this.add(body, ring, 0, 0.5, 0, false);
    g.add(body);
    this.group.add(g);
    this.bumpers.set(idx, { body, ring: ringMat, pulse: 0 });
  }

  private addRotor(idx: number, x: number, y: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, ROTOR.h + 0.25, 12), toon(0x4a4f6a)), 0, (ROTOR.h + 0.25) / 2, 0);
    this.add(g, new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), glow(GADGET_COLORS.rotor, 1.15)), 0, ROTOR.h + 0.32, 0, false);
    const arm = new THREE.Group();
    arm.position.y = ROTOR.h * 0.62;
    const stripes = hazardStripes().clone();
    stripes.needsUpdate = true;
    stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping;
    stripes.repeat.set(6, 1);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(ROTOR.len * 2, 0.34, ROTOR.w * 2), new THREE.MeshToonMaterial({ map: stripes, gradientMap: toonGradient() }));
    bar.castShadow = true;
    arm.add(bar);
    for (const s of [-1, 1]) this.add(arm, new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), toon(GADGET_COLORS.rotor)), s * ROTOR.len, 0, 0);
    g.add(arm);
    this.group.add(g);
    this.rotors.push({ arm, idx });
  }

  private addGeyser(idx: number, x: number, y: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(GEYSER.r * 0.55, GEYSER.r * 0.7, 0.14, 14), toon(0x3a4048));
    this.add(g, vent, 0, 0.07, 0, false);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(GEYSER.r * 0.42, 14), new THREE.MeshBasicMaterial({ color: 0x0c1016 }));
    hole.rotation.x = -Math.PI / 2;
    this.add(g, hole, 0, 0.145, 0, false);
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), color: GADGET_COLORS.geyser, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(GEYSER.r * 2, GEYSER.r * 2), ringMat);
    ring.rotation.x = -Math.PI / 2;
    this.add(g, ring, 0, 0.04, 0, false);
    const jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(GADGET_COLORS.geyser).multiplyScalar(1.15), transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false });
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(GEYSER.r * 0.5, GEYSER.r * 0.75, 1, 14, 1, true), jetMat);
    jet.visible = false;
    this.add(g, jet, 0, 0.5, 0, false);
    this.group.add(g);
    this.geysers.push({ idx, ring: ringMat, jet, jetMat, x, y, z });
  }

  private addBox(idx: number, x: number, y: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, y + 0.95, z);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshToonMaterial({ map: boxTexture(), gradientMap: toonGradient() }));
    cube.castShadow = true;
    g.add(cube);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: softDisc(), color: GADGET_COLORS.box, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.9;
    g.add(halo);
    g.visible = false;
    this.group.add(g);
    this.boxes.set(idx, { g, idx, on: false, pop: 0, y: y + 0.95 });
  }

  private addBoost(idx: number, x: number, y: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const r = BOOST.r * 0.92;
    this.add(g, new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, 0.08, 20), toon(0x3a3040)), 0, 0.04, 0, false);
    const plate = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(GADGET_COLORS.boost).multiplyScalar(0.55), toneMapped: false }));
    plate.rotation.x = -Math.PI / 2;
    this.add(g, plate, 0, 0.085, 0, false);
    const boltMat = new THREE.MeshBasicMaterial({ map: boltTexture(), color: 0xffe9a0, transparent: true, depthWrite: false, toneMapped: false });
    const bolt = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.5, r * 1.5), boltMat);
    bolt.rotation.x = -Math.PI / 2;
    this.add(g, bolt, 0, 0.1, 0, false);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.05, 6, 28), glow(GADGET_COLORS.boost, 1.3));
    ring.rotation.x = Math.PI / 2;
    this.add(g, ring, 0, 0.1, 0, false);
    this.group.add(g);
    this.boosts.set(idx, { bolt: boltMat, ring, idx, pulse: 0 });
  }

  private addRoller(sup: Support, idx: number, x: number, y: number, z: number, dx: number, dz: number, len: number) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(dx, dz);
    // La boca: un arco del que salen las bolas.
    const arch = new THREE.Mesh(new THREE.TorusGeometry(ROLLER.r + 0.22, 0.2, 8, 18, Math.PI), toon(0x4a4f6a));
    arch.castShadow = true;
    g.add(arch);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(ROLLER.r + 0.22, 0.07, 6, 18, Math.PI), glow(GADGET_COLORS.roller, 1.3));
    lip.position.z = 0.18;
    g.add(lip);
    // El carril, pintado en el piso, para que se vea por dónde vienen: de 1,25 m de ancho, o menos donde el piso real es más angosto.
    const lane = new THREE.Mesh(laneGeometry(sup, x, z, dx, dz, len), new THREE.MeshBasicMaterial({ color: GADGET_COLORS.roller, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false }));
    lane.position.y = 0.025;
    lane.renderOrder = 1;
    g.add(lane);
    this.group.add(g);
    const mat = new THREE.MeshToonMaterial({ map: ballTexture(), gradientMap: toonGradient() });
    const balls: THREE.Mesh[] = [];
    const n = Math.ceil((len + ROLLER_FALL) / (ROLLER.speed * ROLLER.gap)) + 1;
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(ROLLER.r, 18, 12), mat);
      b.castShadow = true;
      b.visible = false;
      b.rotation.order = 'YXZ';
      b.rotation.y = Math.atan2(dx, dz);
      this.group.add(b);
      balls.push(b);
    }
    this.rollers.push({ idx, x, y, z, dx, dz, len, balls });
  }

  /** Alguien pisó un acelerador. */
  boost(idx: number) {
    const b = this.boosts.get(idx);
    if (b) b.pulse = 1;
  }

  /** Alguien rebotó en un resorte en (x,z): hundir la placa más cercana. */
  bounce(x: number, z: number) {
    let best: PadVis | null = null, bd = CELL * 1.2;
    for (const p of this.pads) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) best.squash = 1;
  }

  /** Un paragolpes rebotó a alguien. */
  bump(idx: number) {
    const b = this.bumpers.get(idx);
    if (b) b.pulse = 1;
  }

  /** tick: el del frame que se dibuja (interpolado). gad: estado de las cajas. */
  update(tick: number, gad: string, time: number, dt: number) {
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      const goal = i === this.gates.length - 1;
      // La que te toca late; las que ya pasaste se apagan.
      g.mat.opacity = i === this.nextGate ? (goal ? 0.75 : 0.45) + 0.25 * Math.sin(time * 6) : i < this.nextGate ? 0.1 : goal ? 0.85 : 0.28;
    }
    if (this.arrow) {
      const g = this.gates[this.nextGate];
      this.arrow.visible = !!g;
      if (g) {
        this.arrow.position.set(g.x, g.y + 3.4 + Math.sin(time * 4) * 0.35, g.z);
        this.arrow.rotation.y = time * 2;
      }
    }
    for (const p of this.pads) {
      p.squash = Math.max(0, p.squash - dt * 3.5);
      // Se hunde y salta: la placa sube de golpe y vuelve.
      p.plate.position.y = 0.16 + Math.sin(p.squash * Math.PI) * 0.4;
    }
    for (const b of this.bumpers.values()) {
      b.pulse = Math.max(0, b.pulse - dt * 4);
      const k = 1 + Math.sin(b.pulse * Math.PI) * 0.28;
      b.body.scale.set(k, 1 - (k - 1) * 0.4, k);
      b.ring.color.setHex(GADGET_COLORS.bumper).multiplyScalar(1.1 + b.pulse * 0.9 + Math.sin(time * 4) * 0.08);
    }
    for (const r of this.rotors) r.arm.rotation.y = -rotorAngle(r.idx, tick);
    for (const b of this.boosts.values()) {
      b.pulse = Math.max(0, b.pulse - dt * 3);
      b.bolt.opacity = 0.65 + 0.35 * Math.sin(time * 7 + b.idx);
      b.ring.scale.setScalar(1 + Math.sin(b.pulse * Math.PI) * 0.45);
    }
    for (const r of this.rollers) {
      // Misma cuenta que rollerBalls() en el núcleo, siguiendo cada bola un poco más allá del borde para verla caer.
      const step = ROLLER.speed * ROLLER.gap;
      let s = ROLLER.speed * ((((tick / TICK_RATE + r.idx * 0.83) % ROLLER.gap) + ROLLER.gap) % ROLLER.gap);
      for (const b of r.balls) {
        b.visible = s <= r.len + ROLLER_FALL;
        if (b.visible) {
          const over = Math.max(0, s - r.len);
          b.position.set(r.x + r.dx * s, r.y + ROLLER.r - over * over * 1.6, r.z + r.dz * s);
          b.rotation.x = s / ROLLER.r;
        }
        s += step;
      }
    }
    for (const g of this.geysers) {
      const ph = geyserPhase(g.idx, tick);
      const tt = geyserTime(g.idx, tick);
      if (ph === 'warn') {
        // Aviso: el aro late cada vez más rápido y más fuerte.
        const k = (tt - (GEYSER.period - GEYSER.warn)) / GEYSER.warn;
        g.ring.opacity = 0.45 + 0.5 * Math.abs(Math.sin(time * (8 + k * 14)));
        g.ring.color.setHex(GADGET_COLORS.geyser).multiplyScalar(1 + k * 0.6);
      } else {
        g.ring.opacity = 0.3;
        g.ring.color.setHex(GADGET_COLORS.geyser);
      }
      // El chorro dura un poco más en pantalla que en la simulación, desvaneciéndose.
      const show = 0.55;
      g.jet.visible = tt < show;
      if (g.jet.visible) {
        const k = tt / show;
        const h = 4.5 * Math.min(1, k * 4);
        g.jet.scale.set(1 - k * 0.5, h, 1 - k * 0.5);
        g.jet.position.y = h / 2;
        g.jetMat.opacity = 0.75 * (1 - k);
      }
    }
    if (gad !== this.lastGad) {
      this.lastGad = gad;
      for (const b of this.boxes.values()) {
        const on = gad.charCodeAt(b.idx) === 49;
        if (on && !b.on) b.pop = 1;
        b.on = on;
        b.g.visible = on;
      }
    }
    for (const b of this.boxes.values()) {
      if (!b.on) continue;
      b.pop = Math.max(0, b.pop - dt * 3);
      b.g.position.y = b.y + Math.sin(time * 2.2 + b.idx) * 0.12;
      b.g.rotation.y = time * 1.4 + b.idx;
      b.g.scale.setScalar(1 + Math.sin(b.pop * Math.PI) * 0.3);
    }
  }
}
