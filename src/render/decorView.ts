// Decoración del terreno. Dos partes:
//   - sembrado: pasto, piedritas y flores en el piso, y rocas asomando en los acantilados;
//   - contextual: según la forma del mapa (topology.ts), el juego pone sus piezas (ambience.ts): almenas en una
//     hilera de muros, tablones en un puente, un círculo pintado en un claro, estandartes colgando del borde.
// Solo visual: no colisiona, no viaja por la red y sale de una semilla fija por mapa. En el piso va todo chico
// y apagado, o pintado, para no confundirse con los trozos ni con las coberturas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL } from '../core/constants';
import { Rng } from '../core/rng';
import { CellType, type Cell, type Terrain } from '../core/terrain';
import { ambienceOf, type Ambience } from './ambience';
import { faceted, painted, shade } from './geo';
import type { GroundStyle } from './ground';
import { Pieces } from './pieces';
import type { ThemeDef } from './themes';
import { analyze, reservedCells, takeClearings } from './topology';
import { toonGradient } from './textures';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const TAU = Math.PI * 2;

/** Junta instancias de una misma pieza (posición, giro, escala y color) en un solo InstancedMesh. */
class Scatter {
  private mats: THREE.Matrix4[] = [];
  private cols: THREE.Color[] = [];

  add(x: number, y: number, z: number, rotY: number, scale: number | [number, number, number], color: THREE.Color, tilt = 0) {
    const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, rotY, 0, 'YXZ'));
    this.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s[0], s[1], s[2])));
    this.cols.push(color);
  }

  build(geo: THREE.BufferGeometry, mat: THREE.Material, castShadow = false): THREE.InstancedMesh | null {
    if (!this.mats.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, this.mats.length);
    for (let i = 0; i < this.mats.length; i++) {
      m.setMatrixAt(i, this.mats[i]);
      m.setColorAt(i, this.cols[i]);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    m.castShadow = castShadow;
    m.receiveShadow = true;
    return m;
  }
}

function tuftGeo(): THREE.BufferGeometry {
  const r = new Rng(7);
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const hgt = r.range(0.26, 0.48);
    const g = new THREE.ConeGeometry(0.055, hgt, 3, 1, true);
    g.translate(0, hgt / 2, 0);
    g.rotateX(r.range(-0.5, 0.5));
    g.rotateZ(r.range(-0.5, 0.5));
    g.translate(r.range(-0.14, 0.14), 0, r.range(-0.14, 0.14));
    blades.push(g);
  }
  return mergeGeometries(blades);
}

function flowerGeo(): THREE.BufferGeometry {
  const stem = new THREE.ConeGeometry(0.014, 0.2, 3, 1, true);
  stem.translate(0, 0.1, 0);
  const head = new THREE.OctahedronGeometry(0.06, 0);
  head.scale(1, 0.55, 1);
  head.translate(0, 0.21, 0);
  return mergeGeometries([painted(stem, 0x4f8a3a), painted(head, 0xffffff)]);
}

export class DecorView {
  group = new THREE.Group();
  private glow: THREE.MeshBasicMaterial;

  constructor(private t: Terrain, theme: ThemeDef, style: GroundStyle, amb: Ambience = ambienceOf(t.def.kind)) {
    const r = new Rng(t.w * 131 + t.h * 17 + t.def.id.length * 7);
    const reserved = reservedCells(t);
    const grass = new Scatter(), pebbles = new Scatter(), flowers = new Scatter(), boulders = new Scatter();
    const stone = new THREE.Color(t.def.ground).offsetHSL(0, -0.12, -0.2);
    const cliff = new THREE.Color(amb.look.rockTop).offsetHSL(0, 0, -0.14);
    const leaf = theme.grass.map((c) => new THREE.Color(c).offsetHSL(0.02, -0.16, -0.15));
    const gems = typeof theme.neon === 'number' ? [theme.neon, 0xffffff] : [0x4fd1ff, 0xff4f8b, 0xb070ff];

    // Piezas del juego según la forma del mapa. Usa su propia semilla: cambiar una regla no mueve el pasto.
    const pieces = new Pieces();
    const ctx = { t, topo: analyze(t, reserved), p: pieces, r: new Rng(t.w * 977 + t.h * 53 + t.def.id.length * 11), theme, look: amb.look, gems, leaf };
    for (const w of ctx.topo.walls) amb.wall(ctx, w);
    for (const b of ctx.topo.bridges) amb.bridge(ctx, b);
    for (const s of ctx.topo.coasts) amb.coast(ctx, s);
    for (const k of takeClearings(ctx.topo.clearings, amb.maxClearings)) amb.clearing(ctx, k);
    const built = pieces.build();
    this.glow = built.glow;
    this.group.add(built.group);

    for (let i = 0; i < t.cells.length; i++) {
      const c = t.cells[i];
      if (c.type === CellType.Void || c.fragile >= 0) continue;
      const ix = i % t.w, iz = Math.floor(i / t.w);
      const ctr = t.cellCenter(ix, iz);
      const spot = (spread: number): [number, number] => [ctr.x + r.range(-spread, spread), ctr.z + r.range(-spread, spread)];

      // Rocas asomando del acantilado en los bordes que dan al vacío.
      for (const [dx, dz] of DIRS) {
        if (this.cell(ix + dx, iz + dz) || !r.chance(0.28)) continue;
        const s = r.range(0.45, 0.95), along = r.range(-0.7, 0.7);
        boulders.add(ctr.x + dx * (CELL / 2 + 0.1) + dz * along, r.range(-2.5, -0.7), ctr.z + dz * (CELL / 2 + 0.1) + dx * along, r.range(0, TAU), [s, s * r.range(0.6, 1), s], shade(cliff, r.range(-0.07, 0.05)));
      }

      // Lo de arriba de los muros lo pone la ambientación del juego.
      if (c.type === CellType.Wall) continue;

      if (reserved.has(i)) continue;
      const ramp = c.type === CellType.Ramp;
      const veg = style.patch(ctr.x, ctr.z), road = style.path(ctr.x, ctr.z);
      // Pasto: tupido en las manchas de vegetación y al pie de los muros; nada sobre los senderos.
      let tufts = 0;
      if (!ramp && road < 0.5) {
        tufts = veg > 0.5 ? r.int(2, 5) : r.chance(0.12) ? 1 : 0;
        if (DIRS.some(([dx, dz]) => this.higher(c, this.cell(ix + dx, iz + dz)))) tufts += r.int(1, 2);
      }
      for (let k = 0; k < tufts; k++) {
        const [x, z] = spot(0.82);
        grass.add(x, t.topAt(i, x, z), z, r.range(0, TAU), r.range(0.8, 1.3), shade(r.pick(theme.grass), r.range(-0.05, 0.05)));
      }
      if (r.chance(0.28 + road * 0.3)) {
        for (let k = r.int(1, 2); k > 0; k--) {
          const [x, z] = spot(0.82);
          const s = r.range(0.05, 0.11);
          pebbles.add(x, t.topAt(i, x, z) + s * 0.3, z, r.range(0, TAU), [s, s * 0.6, s], shade(stone, r.range(-0.06, 0.08)));
        }
      }
      if (!ramp && veg > 0.6 && r.chance(0.22)) {
        for (let k = r.int(1, 2); k > 0; k--) {
          const [x, z] = spot(0.8);
          flowers.add(x, t.topAt(i, x, z), z, r.range(0, TAU), r.range(0.8, 1.2), new THREE.Color(r.pick(theme.flowers)));
        }
      }
    }

    const toon = new THREE.MeshToonMaterial({ gradientMap: toonGradient() });
    const toonVC = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true });
    const rock = faceted(new THREE.DodecahedronGeometry(1, 0));
    for (const m of [
      grass.build(tuftGeo(), toon), pebbles.build(rock, toon), flowers.build(flowerGeo(), toonVC), boulders.build(rock, toon, true),
    ]) if (m) this.group.add(m);
  }

  /** La celda en (ix, iz), o null si es vacío o está fuera del mapa. */
  private cell(ix: number, iz: number): Cell | null {
    const t = this.t;
    if (ix < 0 || iz < 0 || ix >= t.w || iz >= t.h) return null;
    const c = t.cells[iz * t.w + ix];
    return c.type === CellType.Void ? null : c;
  }

  private higher(c: Cell, n: Cell | null) {
    return !!n && (n.type === CellType.Wall || (n.type === CellType.Floor && n.level > c.level));
  }

  update(time: number) {
    this.glow.color.setScalar(1 + Math.sin(time * 1.7) * 0.12);
  }
}
