// Ambientación de cada juego: con la misma lectura del mapa (topology.ts), cada juego pone su propio juego de
// piezas. Una hilera de muros es una muralla con almenas en el Asedio, una barrera de neumáticos en la Carrera
// y una trinchera de bolsas de arena en la Horda. Sumar un juego = una entrada en AMBIENCES.
//
// Regla para que la decoración no engañe: sobre el piso que se pisa solo va pintura (calcos) y pasto chico.
// Lo que tiene volumen va arriba de los muros (nadie llega), colgado del acantilado por debajo del borde,
// o bien alto por encima de las cabezas. Así nada parece un obstáculo ni una baranda que no existe.
import * as THREE from 'three';
import { CELL, TEAM_COLORS, WALL_TOP } from '../core/constants';
import type { MapKind } from '../core/maps';
import type { Rng } from '../core/rng';
import { CellType, type Terrain } from '../core/terrain';
import { shade } from './geo';
import type { Pieces } from './pieces';
import type { EdgePoint, Support } from './support';
import { DEFAULT_LOOK, type TerrainLook } from './terrainShape';
import type { ThemeDef } from './themes';
import { SIDES, type BridgeSpot, type Clearing, type CoastSpot, type Topology, type WallSpot } from './topology';

export interface DecorCtx {
  t: Terrain;
  topo: Topology;
  p: Pieces;
  /** Dónde hay muro, piso o borde de verdad (la malla del terreno): sobre qué se apoya cada pieza. */
  sup: Support;
  r: Rng;
  theme: ThemeDef;
  look: TerrainLook;
  /** Colores vivos del tema (cristales, luces). */
  gems: number[];
  /** Verde de las matas, ya apagado para no competir con el juego. */
  leaf: THREE.Color[];
}

export interface Ambience {
  id: MapKind;
  name: string;
  look: TerrainLook;
  /** Cuántos claros se decoran como mucho (van primero los más amplios). */
  maxClearings: number;
  wall(c: DecorCtx, w: WallSpot): void;
  bridge(c: DecorCtx, b: BridgeSpot): void;
  coast(c: DecorCtx, s: CoastSpot): void;
  clearing(c: DecorCtx, k: Clearing): void;

  // ── Fondo (backdrop.ts): lo que rodea al mapa también es del juego ──
  /** Qué hay sobre una isla lejana. Coordenadas de la isla: el centro en el origen, y = top es su cara de arriba. */
  island?(p: Pieces, r: Rng, size: number, top: number): void;
  /** Cosas que flotan alrededor del mapa, entre las alturas y[0] e y[1]. Cada una se arma centrada en el origen. */
  floaters?: { count: number; y: [number, number]; build(p: Pieces, r: Rng): void };
  /** false: las islas del fondo no llevan árboles. */
  trees?: boolean;
  /** Niebla propia: a qué distancia de la cámara empieza y a cuál lo tapa todo (si no, la de siempre). */
  fog?: { near: number; far: number };
  /** Bruma baja que pasa por debajo del mapa. */
  mist?: { color: number; opacity: number; y: number };
}

const W = WALL_TOP;
const TAU = Math.PI * 2;
/** Cuánto se puede achicar un grupo de piezas para que entre sobre un muro antes de no ponerlo. */
const FIT_SCALES = [1, 0.9, 0.8, 0.7, 0.6];
/** Pasos del recorrido hacia el centro de la celda al buscar dónde apoyar una pieza. */
const FIT_STEPS = 20;

/** Posición sobre un muro, pegada al lado s: u metros a lo largo del lado, `inset` metros hacia adentro desde el borde. */
function onSide(w: { x: number; z: number }, s: number, u: number, inset: number): [number, number] {
  const [nx, nz] = SIDES[s];
  const d = CELL / 2 - inset;
  return [w.x + nx * d - nz * u, w.z + nz * d + nx * u];
}

/**
 * Arma con `draw` un grupo de piezas apoyado sobre el muro w. Primero lo prueba en seco: la base de lo que arma tiene que caer
 * entera sobre el muro real (la malla orgánica tiene el borde irregular, no el de la celda del plano). Si no cae, el grupo se corre
 * hacia el centro de la celda y, si todavía no, se achica (hasta el 60 %). Si no encuentra dónde apoyarse no se pone y devuelve false.
 * `draw` usa las coordenadas de siempre y gasta los mismos números al azar pase lo que pase con la prueba.
 */
function put(c: DecorCtx, w: WallSpot, draw: () => void): boolean {
  const saved = c.r.state;
  const pts = c.p.base(W, draw);
  c.r.state = saved;
  if (!pts.length) { draw(); return true; }
  let ax = 0, az = 0;
  for (let i = 0; i < pts.length; i += 2) { ax += pts[i]; az += pts[i + 1]; }
  ax /= pts.length / 2; az /= pts.length / 2;
  for (const s of FIT_SCALES) {
    for (let k = 0; k < FIT_STEPS; k++) {
      const f = k / FIT_STEPS, dx = (w.x - ax) * f, dz = (w.z - az) * f;
      let ok = true;
      for (let i = 0; i < pts.length && ok; i += 2) ok = c.sup.wall(ax + (pts[i] - ax) * s + dx, az + (pts[i + 1] - az) * s + dz);
      if (!ok) continue;
      c.p.framed(ax, W, az, s, dx, dz, draw);
      return true;
    }
  }
  return false;
}

/** El borde real del lado de un punto de costa, a `u` metros del medio. null si ahí no hay (la pieza no se pone). */
function edgeOf(c: DecorCtx, s: CoastSpot, u: number): EdgePoint | null {
  return c.sup.edgeAt(s.cx, s.cz, s.nx, s.nz, u, s.wall);
}

/** Giro sobre Y, entre -π/2 y π/2, que pone el eje x de una pieza a lo largo del borde de normal (nx, nz). */
const alongOf = (nx: number, nz: number) => {
  const a = Math.atan2(-nx, -nz);
  return a - Math.PI * Math.ceil(a / Math.PI - 0.5);
};
/** Giro sobre Y que hace mirar una tela hacia afuera del borde de normal (nx, nz). */
const faceOf = (nx: number, nz: number) => Math.atan2(nx, nz);
/** Giro sobre Y que apunta el eje x de una pieza hacia afuera del borde de normal (nx, nz). */
const outOf = (nx: number, nz: number) => faceOf(nx, nz) - Math.PI / 2;

/**
 * Cuánto piso hay a cada lado de (x, z) cruzando un puente: [hacia -lateral, hacia +lateral], con lateral = +z si el puente va de
 * este a oeste y +x si va de norte a sur. [0, 0] si ahí no hay piso donde pintar.
 */
function crossSpan(c: DecorCtx, x: number, z: number, axis: 'x' | 'z'): [number, number] {
  return c.sup.span(x, z, axis === 'x' ? 0 : 1, axis === 'x' ? 1 : 0, CELL * 1.5, c.sup.paint);
}
/** El giro sobre Y que alinea el eje x de una pieza con el lado s del plano (a lo largo del borde). */
const alongRot = (s: number) => (s % 2 ? Math.PI / 2 : 0);
const openSides = (w: WallSpot) => [0, 1, 2, 3].filter((s) => !w.wall[s]);
const isHub = (w: WallSpot) => w.shape === 'corner' || w.shape === 'tee' || w.shape === 'cross';

// ───────────── Arena: cantera de cristal ─────────────

const ARENA: Ambience = {
  id: 'arena',
  name: 'Cantera de cristal',
  look: DEFAULT_LOOK,
  maxClearings: 2,
  wall(c, w) {
    const { p, r } = c;
    const stone = shade(c.look.wallTop, 0.06);
    if (w.shape === 'solo') {
      // Monolito con un cristal grande en la punta.
      put(c, w, () => {
        p.cyl(0.36, 0.56, 1.25, w.x, W, w.z, shade(stone, r.range(-0.03, 0.03)), 5, 'solid', r.range(0, TAU));
        p.gem(0.26, 1.0, w.x, W + 1.15, w.z, r.pick(c.gems), r.range(0, TAU));
      });
      put(c, w, () => p.gem(0.13, 0.5, w.x + 0.42, W, w.z + 0.2, r.pick(c.gems), r.range(0, TAU), 0.4));
      put(c, w, () => p.rock(0.24, w.x - 0.45, W, w.z - 0.3, shade(stone, -0.06), r.range(0, TAU)));
      return;
    }
    if (w.shape === 'block') {
      // Macizo: peñascos grandes con una veta de cristal.
      for (let i = 0; i < 3; i++) put(c, w, () => p.rock(r.range(0.4, 0.7), w.x + r.range(-0.5, 0.5), W - 0.1, w.z + r.range(-0.5, 0.5), shade(stone, r.range(-0.08, 0.04)), r.range(0, TAU), r.range(0.7, 1.1)));
      if (r.chance(0.6)) put(c, w, () => p.gem(0.22, r.range(0.9, 1.5), w.x + r.range(-0.4, 0.4), W + 0.2, w.z + r.range(-0.4, 0.4), r.pick(c.gems), r.range(0, TAU), r.range(-0.4, 0.4)));
      return;
    }
    // Hilera: un pretil de bloques toscos en los lados abiertos.
    for (const s of openSides(w)) {
      for (const u of [-0.5, 0.5]) {
        if (!r.chance(0.8)) continue;
        put(c, w, () => {
          const [x, z] = onSide(w, s, u + r.range(-0.1, 0.1), 0.26);
          p.box(r.range(0.4, 0.56), r.range(0.22, 0.36), 0.3, x, W, z, shade(stone, r.range(-0.07, 0.05)), alongRot(s) + r.range(-0.12, 0.12));
        });
      }
    }
    if (w.shape === 'end') {
      // La punta de la hilera lleva un mástil con banderín.
      const col = r.pick(c.gems);
      put(c, w, () => {
        p.cyl(0.05, 0.07, 2.3, w.x, W, w.z, 0x4a3c34, 5);
        p.pennant(0.75, 0.42, w.x, W + 2.25, w.z, col, r.range(-0.4, 0.4));
      });
      put(c, w, () => p.rock(0.22, w.x + 0.3, W, w.z - 0.25, shade(stone, -0.05), r.range(0, TAU)));
    } else if (isHub(w)) {
      put(c, w, () => p.rock(0.42, w.x, W - 0.05, w.z, shade(stone, -0.04), r.range(0, TAU), 0.9));
      put(c, w, () => p.gem(0.18, 0.9, w.x + 0.25, W + 0.2, w.z + 0.1, r.pick(c.gems), r.range(0, TAU), 0.25));
    } else {
      const roll = r.next();
      if (roll < 0.35) put(c, w, () => p.bush(r.range(0.8, 1.2), w.x + r.range(-0.2, 0.2), W - 0.05, w.z + r.range(-0.2, 0.2), shade(r.pick(c.leaf), r.range(-0.04, 0.05)), r.range(0, TAU)));
      else if (roll < 0.6) put(c, w, () => p.gem(0.14, r.range(0.5, 0.9), w.x + r.range(-0.2, 0.2), W, w.z + r.range(-0.2, 0.2), r.pick(c.gems), r.range(0, TAU), r.range(-0.3, 0.3)));
      else if (roll < 0.8) put(c, w, () => p.rock(r.range(0.2, 0.34), w.x + r.range(-0.2, 0.2), W, w.z + r.range(-0.2, 0.2), shade(stone, -0.06), r.range(0, TAU)));
    }
  },
  bridge(c, b) {
    // Losa de piedra de lado a lado y ménsulas por debajo.
    const [lo, hi] = crossSpan(c, b.x, b.z, b.axis);
    if (lo + hi < 0.6) return;
    const lat = b.axis === 'x' ? [0, 1] : [1, 0], mid = (hi - lo) / 2, wide = lo + hi - 0.3;
    c.p.plate(b.axis === 'x' ? 0.9 : wide, b.axis === 'x' ? wide : 0.9, b.x + lat[0] * mid, 0, b.z + lat[1] * mid, shade(c.t.def.ground, -0.09));
    for (const d of [-(lo + 0.05), hi + 0.05]) {
      c.p.box(0.35, 0.3, 0.45, b.x + lat[0] * d, -0.62, b.z + lat[1] * d, shade(c.look.rockTop, -0.1), b.axis === 'x' ? 0 : Math.PI / 2);
    }
  },
  coast(c, s) {
    const { p, r } = c;
    const roll = r.next();
    const u = r.range(-0.6, 0.6);
    const e = edgeOf(c, s, u);
    if (!e) return;
    const { x, z } = e;
    if (roll < 0.16) {
      // Cristales que crecen del acantilado, por debajo del borde.
      for (let i = r.int(1, 3); i > 0; i--) {
        const size = r.range(0.1, 0.18), h = r.range(0.5, 1.0);
        let jx = r.range(-0.2, 0.2);
        const dy = r.range(0.7, 1.4);
        let jz = r.range(-0.2, 0.2);
        // Ninguno se aleja del borde más de 30 cm: el desvío hacia afuera se corta en 15 cm.
        const out = jx * e.nx + jz * e.nz - 0.15;
        if (out > 0) { jx -= out * e.nx; jz -= out * e.nz; }
        p.gem(size, h, x + e.nx * 0.15 + jx, e.y - dy, z + e.nz * 0.15 + jz, r.pick(c.gems), outOf(e.nx, e.nz), -r.range(0.6, 1.1));
      }
    } else if (roll < 0.36) {
      // Enredadera que cuelga: cada una pegada al borde donde le toca.
      for (let i = r.int(2, 4); i > 0; i--) {
        const k = r.range(-0.4, 0.4), len = r.range(0.35, 0.95);
        const q = edgeOf(c, s, u + k), col = shade(r.pick(c.leaf), r.range(-0.03, 0.06)), rot = r.range(0, TAU);
        if (q) p.cone(0.07, len, q.x + q.nx * 0.07, q.y - len - 0.02, q.z + q.nz * 0.07, col, 3, rot);
      }
    }
  },
  island(p, r, size, top) {
    // Ruinas de un coliseo: columnas en ronda, algunas partidas.
    if (size < 3.2) return;
    const n = r.int(3, 5), rad = size * 0.5, a0 = r.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU * 0.72, h = r.range(1.1, 3.1);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      p.cyl(0.27, 0.34, h, x, top, z, shade(0x8f8478, r.range(-0.04, 0.04)), 6);
      if (h > 2.2) p.box(0.8, 0.22, 0.8, x, top + h, z, 0x9a8f82, a);
    }
  },
  clearing(c, k) {
    // Círculo de combate pintado en el piso.
    const rad = Math.min(k.r - 0.5, 4.4);
    if (rad < 1.8) return;
    const paint = shade(c.t.def.ground, 0.11);
    c.p.ring(rad - 0.16, rad, k.x, 0, k.z, paint, 40);
    c.p.ring(rad * 0.52 - 0.07, rad * 0.52, k.x, 0, k.z, paint, 32);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      c.p.plate(0.5, 0.12, k.x + Math.cos(a) * (rad - 0.5), 0, k.z - Math.sin(a) * (rad - 0.5), paint, a);
    }
  },
};

// ───────────── Asedio: fortaleza ─────────────

/** De qué equipo es ese lado del mapa (por el núcleo más cercano). null cerca del medio. */
function sideTeam(t: Terrain, x: number, z: number): number | null {
  let best: number | null = null, bd = Infinity, second = Infinity;
  for (const k of t.cores) {
    const d = Math.hypot(k.x - x, k.z - z);
    if (d < bd) { second = bd; bd = d; best = k.team; } else if (d < second) second = d;
  }
  return second - bd < 8 ? null : best;
}
const NEUTRAL = 0xd9c9a8;
const teamCol = (t: Terrain, x: number, z: number) => { const k = sideTeam(t, x, z); return k === null ? NEUTRAL : TEAM_COLORS[k]; };

const SIEGE_LOOK: TerrainLook = { rockTop: 0xb8a78f, rockBottom: 0x4f4338, soil: 0x6e5a48, wallTop: 0x9a917f, wallSide: 0xa39884, wallFoot: 0x655c50 };

function turret(c: DecorCtx, x: number, z: number, rad: number, hgt: number, roof: number) {
  const { p, r } = c;
  const stone = shade(c.look.wallSide, 0.04);
  p.cyl(rad, rad * 1.06, hgt, x, W, z, stone, 8);
  p.cyl(rad * 1.16, rad * 1.16, 0.14, x, W + hgt, z, shade(stone, 0.05), 8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    p.box(0.26, 0.22, 0.16, x + Math.cos(a) * rad * 1.02, W + hgt + 0.14, z - Math.sin(a) * rad * 1.02, shade(stone, 0.02), a + Math.PI / 2);
  }
  p.cone(rad * 0.98, rad * 1.5, x, W + hgt + 0.2, z, shade(roof, -0.05), 8);
  p.cyl(0.03, 0.03, 0.75, x, W + hgt + 0.2 + rad * 1.45, z, 0x4a3c34, 4);
  p.flag(0.5, 0.3, x, W + hgt + 0.9 + rad * 1.45, z, roof, r.range(-0.5, 0.5));
}

const SIEGE: Ambience = {
  id: 'moba',
  name: 'Fortaleza',
  look: SIEGE_LOOK,
  maxClearings: 4,
  wall(c, w) {
    const { p, r, t } = c;
    const stone = shade(c.look.wallSide, 0.05);
    const col = teamCol(t, w.x, w.z);
    if (w.shape === 'solo') { put(c, w, () => turret(c, w.x, w.z, 0.72, 1.3, col)); return; }
    if (w.shape === 'end') put(c, w, () => turret(c, w.x, w.z, 0.66, 0.85, col));
    else if (w.shape === 'block') {
      // Torreón: cuerpo cuadrado con techo a cuatro aguas y una ventana encendida.
      put(c, w, () => {
        p.box(1.7, 1.0, 1.7, w.x, W, w.z, stone);
        p.cone(1.42, 1.0, w.x, W + 1.0, w.z, shade(col, -0.08), 4, Math.PI / 4);
        p.box(0.24, 0.34, 0.04, w.x, W + 0.4, w.z + 0.86, 0xffc46a, 0, 'glow');
      });
      return;
    } else if (isHub(w)) {
      // Bastión en el codo, con un brasero.
      put(c, w, () => {
        p.box(1.5, 0.5, 1.5, w.x, W, w.z, stone);
        for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p.box(0.34, 0.3, 0.34, w.x + ox * 0.58, W + 0.5, w.z + oz * 0.58, shade(stone, 0.03));
        p.cyl(0.2, 0.13, 0.22, w.x, W + 0.5, w.z, 0x3a3230, 6);
        p.gem(0.13, 0.42, w.x, W + 0.68, w.z, 0xff9a3c, r.range(0, TAU));
      });
      return;
    }
    // Almenas en los lados abiertos de la muralla.
    for (const s of openSides(w)) {
      for (const u of [-0.5, 0.5]) {
        put(c, w, () => {
          const [x, z] = onSide(w, s, u, 0.2);
          p.box(0.5, 0.42, 0.3, x, W, z, shade(stone, r.range(-0.03, 0.03)), alongRot(s));
        });
      }
    }
  },
  bridge(c, b) {
    const { p, r } = c;
    // Tablones atravesados y, por debajo, puntales de madera. Cada tablón llega de borde a borde del piso que hay donde está.
    const lat = b.axis === 'x' ? [0, 1] : [1, 0];
    for (const k of [-0.66, 0, 0.66]) {
      const [x, z] = b.axis === 'x' ? [b.x + k, b.z] : [b.x, b.z + k];
      const [lo, hi] = crossSpan(c, x, z, b.axis);
      const col = shade(0x8a6542, r.range(-0.05, 0.05));
      if (lo + hi < 0.6) continue;
      const mid = (hi - lo) / 2, wide = lo + hi - 0.24;
      p.plate(b.axis === 'x' ? 0.5 : wide, b.axis === 'x' ? wide : 0.5, x + lat[0] * mid, 0, z + lat[1] * mid, col);
    }
    const [lo, hi] = crossSpan(c, b.x, b.z, b.axis);
    if (lo + hi < 0.6) return;
    for (const d of [-(lo + 0.06), hi + 0.06]) {
      const x = b.x + lat[0] * d, z = b.z + lat[1] * d;
      p.box(CELL, 0.2, 0.16, x, -0.5, z, 0x6b4a30, b.axis === 'x' ? 0 : Math.PI / 2);
      p.box(0.14, 1.5, 0.14, x, -2.0, z, 0x5a3e28);
    }
  },
  coast(c, s) {
    const { p, r, t } = c;
    const roll = r.next();
    if (roll < 0.1) {
      // Estandarte del equipo colgado del borde.
      const e = edgeOf(c, s, 0);
      if (!e) return;
      p.box(0.9, 0.07, 0.07, e.x + e.nx * 0.1, e.y - 0.16, e.z + e.nz * 0.1, 0x5a3e28, alongOf(e.nx, e.nz));
      p.banner(0.72, 1.25, e.x + e.nx * 0.2, e.y - 0.2, e.z + e.nz * 0.2, shade(teamCol(t, e.x, e.z), -0.04), faceOf(e.nx, e.nz), NEUTRAL);
    } else if (roll < 0.3) {
      // Hiedra: cada mata pegada al borde donde le toca.
      for (let i = r.int(3, 5); i > 0; i--) {
        const k = r.range(-0.8, 0.8), d = r.range(0.1, 0.9);
        const q = edgeOf(c, s, k), size = r.range(0.09, 0.16), col = shade(r.pick(c.leaf), r.range(-0.04, 0.06)), rot = r.range(0, TAU);
        if (q) p.rock(size, q.x + q.nx * 0.12, q.y - d - 0.1, q.z + q.nz * 0.12, col, rot, 0.6);
      }
    }
  },
  island(p, r, size, top) {
    // Atalayas lejanas: una torre con techo en las islas grandes, un estandarte en las chicas.
    const roof = r.pick([0x8a3b34, 0x3b5a8a, 0x7a6a3a]);
    if (size < 3.4) {
      p.cyl(0.07, 0.09, 2.6, 0, top, 0, 0x4a3c34, 5);
      p.banner(0.9, 1.5, 0.1, top + 2.5, 0.06, roof, r.range(0, TAU), NEUTRAL);
      return;
    }
    const h = r.range(2.4, 4.2), rad = r.range(0.8, 1.1);
    p.cyl(rad, rad * 1.12, h, 0, top, 0, 0x8d8474, 8);
    p.cyl(rad * 1.18, rad * 1.18, 0.2, 0, top + h, 0, 0x9a917f, 8);
    p.cone(rad * 1.1, rad * 1.7, 0, top + h + 0.2, 0, roof, 8);
    p.box(0.22, 0.34, 0.05, 0, top + h * 0.6, rad * 1.04, 0xffc46a, 0, 'glow');
    if (r.chance(0.6)) p.box(r.range(1.4, 2.4), 0.9, 0.5, rad + 0.9, top, 0, 0x8d8474, r.range(0, TAU));
  },
  clearing(c, k) {
    // Plaza empedrada con un borde más claro.
    const rad = Math.min(k.r - 0.6, 3.4);
    if (rad < 2) return;
    const light = shade(c.t.def.ground, 0.07), dark = shade(c.t.def.ground, -0.07);
    c.p.ring(0, rad, k.x, 0, k.z, shade(c.t.def.ground, -0.025), 36);
    c.p.ring(rad - 0.13, rad, k.x, 0.004, k.z, light, 36);
    c.p.ring(rad * 0.58 - 0.05, rad * 0.58, k.x, 0.004, k.z, dark, 28);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      c.p.plate(rad * 0.3, 0.06, k.x + Math.cos(a) * rad * 0.78, 0.004, k.z - Math.sin(a) * rad * 0.78, dark, a);
    }
  },
};

// ───────────── Carrera: circuito ─────────────

const RACE_LOOK: TerrainLook = { rockTop: 0xbfb09a, rockBottom: 0x54483e, soil: 0x6f5b46, wallTop: 0x8e8a86, wallSide: 0xb0aca6, wallFoot: 0x6a6660, edge: { colors: [0xe8483c, 0xf2ece0], stripe: 1.0, width: 0.3 } };
const PARTY = [0xff5a5f, 0xffd23f, 0x3ddc84, 0x4fb8ff, 0xf2ece0];

const flows = new WeakMap<Terrain, Int32Array>();
/** Cuántas celdas faltan hasta la meta desde cada celda, caminando por la pista (-1 si no se llega). */
function flowField(t: Terrain): Int32Array {
  let f = flows.get(t);
  if (f) return f;
  f = new Int32Array(t.w * t.h).fill(-1);
  const goal = t.gates[t.gates.length - 1];
  const queue: number[] = goal ? [...goal.cells] : [];
  for (const ci of queue) f[ci] = 0;
  for (let q = 0; q < queue.length; q++) {
    const ci = queue[q], ix = ci % t.w, iz = Math.floor(ci / t.w);
    for (const [dx, dz] of SIDES) {
      const nx = ix + dx, nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= t.w || nz >= t.h) continue;
      const ni = nz * t.w + nx, c = t.cells[ni];
      if (f[ni] >= 0 || c.type === CellType.Void || c.type === CellType.Wall) continue;
      f[ni] = f[ci] + 1;
      queue.push(ni);
    }
  }
  flows.set(t, f);
  return f;
}

/** Hacia dónde sigue la pista en una celda: hacia donde más baja la distancia a la meta en los alrededores. */
function trackDir(t: Terrain, ix: number, iz: number): [number, number] {
  const f = flowField(t), here = f[iz * t.w + ix];
  let sx = 0, sz = 0;
  if (here >= 0) {
    for (let oz = -3; oz <= 3; oz++) for (let ox = -3; ox <= 3; ox++) {
      const nx = ix + ox, nz = iz + oz;
      if (nx < 0 || nz < 0 || nx >= t.w || nz >= t.h || (!ox && !oz)) continue;
      const d = f[nz * t.w + nx];
      if (d < 0) continue;
      const k = (here - d) / Math.hypot(ox, oz);
      sx += ox * k;
      sz += oz * k;
    }
  }
  const len = Math.hypot(sx, sz);
  return len > 1e-6 ? [sx / len, sz / len] : [1, 0];
}

const RACE: Ambience = {
  id: 'race',
  name: 'Circuito',
  look: RACE_LOOK,
  maxClearings: 10,
  wall(c, w) {
    const { p, r } = c;
    if (w.shape === 'solo' || w.shape === 'end') {
      // Mástil con bandera a cuadros y un par de neumáticos al pie.
      put(c, w, () => {
        p.cyl(0.05, 0.07, 2.6, w.x, W, w.z, 0xd8d4cc, 5);
        const rot = r.range(-0.3, 0.3);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
          const g = new THREE.PlaneGeometry(0.2, 0.2);
          g.translate(0.1 + i * 0.2, -0.1 - j * 0.2, 0);
          p.add('cloth', g, w.x, W + 2.55, w.z, (i + j) % 2 ? 0x1c1c22 : 0xf2ece0, rot);
        }
      });
      put(c, w, () => p.tyres(2, w.x + 0.45, W, w.z + 0.3));
      put(c, w, () => p.tyres(1, w.x - 0.4, W, w.z - 0.35));
      return;
    }
    if (w.shape === 'block') {
      // Tribuna: gradas, público de colores y un toldo.
      put(c, w, () => {
        for (let i = 0; i < 3; i++) p.box(1.8, 0.28 * (i + 1), 0.56, w.x, W, w.z - 0.56 + i * 0.56, shade(0xb8b4ae, -i * 0.03));
        for (let i = 0; i < 7; i++) p.box(0.16, 0.2, 0.16, w.x + r.range(-0.75, 0.75), W + 0.28 * (1 + (i % 3)), w.z - 0.56 + (i % 3) * 0.56, r.pick(PARTY));
        p.box(1.9, 0.06, 1.2, w.x, W + 1.5, w.z + 0.3, r.pick(PARTY));
        for (const ox of [-0.85, 0.85]) p.cyl(0.035, 0.035, 1.5, w.x + ox, W, w.z + 0.8, 0xd8d4cc, 4);
      });
      return;
    }
    // Hilera: barrera a rayas en los lados abiertos y neumáticos apilados en el medio.
    for (const s of openSides(w)) {
      for (const [i, u] of [-0.5, 0.5].entries()) {
        put(c, w, () => {
          const [x, z] = onSide(w, s, u, 0.2);
          p.box(0.92, 0.34, 0.2, x, W, z, (w.ix + w.iz + i) % 2 ? 0xe8483c : 0xf2ece0, alongRot(s));
        });
      }
    }
    if (isHub(w) || r.chance(0.5)) put(c, w, () => p.tyres(r.int(2, 3), w.x + r.range(-0.15, 0.15), W, w.z + r.range(-0.15, 0.15)));
  },
  bridge(c, b) {
    const { p } = c;
    // Galones pintados en el piso y, cada tanto, una guirnalda de lado a lado sostenida desde el acantilado.
    const dir = trackDir(c.t, b.ix, b.iz);
    const rot = Math.atan2(-dir[1], dir[0]);
    for (const sgn of [-1, 1]) p.plate(0.62, 0.14, b.x - dir[1] * sgn * 0.2, 0, b.z + dir[0] * sgn * 0.2, 0xf2ece0, rot + sgn * 0.75);
    if (b.at % 4 === 1) {
      const [lo, hi] = crossSpan(c, b.x, b.z, b.axis);
      if (lo + hi < 0.6) return;
      const lat = b.axis === 'x' ? [0, 1] : [1, 0], ends: [number, number, number][] = [];
      for (const d of [-(lo + 0.16), hi + 0.16]) {
        const x = b.x + lat[0] * d, z = b.z + lat[1] * d;
        p.cyl(0.05, 0.06, 4.6, x, -1.2, z, 0xd8d4cc, 5);
        ends.push([x, 3.3, z]);
      }
      p.bunting(ends[0], ends[1], PARTY);
    }
  },
  coast(c, s) {
    const { p, r } = c;
    if (s.y > 0 || !r.chance(0.14)) return;
    // Cartel de sponsor colgado del acantilado.
    const col = r.pick(PARTY);
    const e = edgeOf(c, s, 0);
    if (!e || e.y > 0) return;
    // El cartel es recto: si el borde se curva a sus costados se acorta hasta que le siga bien de cerca.
    let k = 1;
    while (k > 0.4) {
      const ends = [-0.75 * k, 0.75 * k].map((u) => edgeOf(c, s, u));
      if (ends.every((q) => q && Math.abs((q.x - e.x) * e.nx + (q.z - e.z) * e.nz) <= 0.1)) break;
      k -= 0.15;
    }
    const rot = alongOf(e.nx, e.nz);
    p.box(1.5 * k, 0.55, 0.06, e.x + e.nx * 0.24, e.y - 0.95, e.z + e.nz * 0.24, col, rot);
    p.box(1.1 * k, 0.14, 0.07, e.x + e.nx * 0.25, e.y - 0.75, e.z + e.nz * 0.25, 0xf2ece0, rot);
  },
  island(p, r, size, top) {
    // Cartelera sobre dos postes, mirando para cualquier lado.
    if (size < 2.8) return;
    const rot = r.range(0, TAU), w = Math.min(size * 0.9, 3.6), col = r.pick(PARTY);
    const dx = Math.cos(rot) * w * 0.42, dz = -Math.sin(rot) * w * 0.42;
    for (const sgn of [-1, 1]) p.cyl(0.07, 0.09, 2.6, dx * sgn, top, dz * sgn, 0xd8d4cc, 5);
    p.box(w, 1.3, 0.1, 0, top + 1.5, 0, col, rot);
    p.box(w * 0.7, 0.26, 0.13, 0, top + 2.2, 0, 0xf2ece0, rot);
    p.tyres(r.int(1, 3), size * 0.4, top, size * 0.2);
  },
  floaters: {
    count: 6,
    y: [-9, 1],
    // Globos aerostáticos.
    build(p, r) {
      const col = r.pick(PARTY), col2 = r.pick(PARTY.filter((c) => c !== col));
      const g = new THREE.IcosahedronGeometry(2.3, 1);
      g.scale(1, 1.18, 1);
      p.add('solid', g, 0, 0, 0, col);
      p.cyl(2.34, 2.34, 0.7, 0, -0.35, 0, col2, 12);
      p.cyl(1.5, 0.45, 1.6, 0, -4.1, 0, col, 8);
      for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p.box(0.03, 0.9, 0.03, ox * 0.3, -5.0, oz * 0.3, 0x3a3340);
      p.box(0.75, 0.6, 0.75, 0, -5.6, 0, 0x8a6542);
    },
  },
  clearing(c, k) {
    // Flechas pintadas que marcan para dónde sigue la pista.
    const dir = trackDir(c.t, k.ix, k.iz);
    const rot = Math.atan2(-dir[1], dir[0]);
    for (const off of [-0.9, 0, 0.9]) {
      const x = k.x + dir[0] * off, z = k.z + dir[1] * off;
      for (const sgn of [-1, 1]) c.p.plate(0.7, 0.16, x - dir[1] * sgn * 0.23, 0, z + dir[0] * sgn * 0.23, 0xf2ece0, rot + sgn * 0.75);
    }
  },
};

// ───────────── Horda: refugio ─────────────

const HORDE_LOOK: TerrainLook = { rockTop: 0x9a968c, rockBottom: 0x3e3c3a, soil: 0x5a5448, wallTop: 0x7c7f78, wallSide: 0x8c8f88, wallFoot: 0x50524e, edge: { colors: [0xe0b53a, 0x2a2a2e], stripe: 0.7, width: 0.22 } };
const SAND = 0xb09a6e, RUST = 0x8a4f34, OLIVE = 0x5f6b4a, LAMP = 0xfff0b8;

const HORDE: Ambience = {
  id: 'horde',
  name: 'Refugio',
  look: HORDE_LOOK,
  maxClearings: 3,
  wall(c, w) {
    const { p, r } = c;
    if (w.shape === 'solo' || w.shape === 'end') {
      // Torre de reflector.
      put(c, w, () => {
        p.box(0.6, 0.22, 0.6, w.x, W, w.z, 0x55585a);
        p.box(0.1, 2.3, 0.1, w.x, W + 0.2, w.z, 0x6a6e70);
        for (const y of [0.9, 1.6]) p.box(0.44, 0.05, 0.05, w.x, W + y, w.z, 0x6a6e70, y > 1 ? Math.PI / 4 : -Math.PI / 4);
        const rot = r.range(0, TAU);
        p.box(0.5, 0.3, 0.34, w.x, W + 2.45, w.z, 0x3c3f42, rot);
        p.box(0.4, 0.22, 0.04, w.x + Math.sin(rot) * 0.18, W + 2.49, w.z + Math.cos(rot) * 0.18, LAMP, rot, 'glow');
      });
      if (w.shape === 'end') for (const u of [-0.45, 0.2]) put(c, w, () => p.box(0.5, 0.2, 0.3, w.x + u, W, w.z + 0.55, shade(SAND, r.range(-0.05, 0.04)), r.range(-0.2, 0.2)));
      return;
    }
    if (w.shape === 'block') {
      // Contenedor reforzado con techo de chapa, una ventana encendida y antena.
      put(c, w, () => {
        const body = r.chance(0.5) ? OLIVE : RUST;
        p.box(1.75, 1.05, 1.75, w.x, W, w.z, shade(body, r.range(-0.04, 0.04)));
        p.box(1.9, 0.08, 1.9, w.x, W + 1.05, w.z, 0x4a4d50, 0, 'solid', 0.05);
        p.box(0.3, 0.2, 0.04, w.x + 0.3, W + 0.55, w.z + 0.89, 0xffd27a, 0, 'glow');
        if (r.chance(0.5)) p.cyl(0.015, 0.015, 1.3, w.x - 0.6, W + 1.1, w.z - 0.6, 0x8a8f96, 3);
      });
      return;
    }
    // Trinchera: bolsas de arena en los lados abiertos y alambre de púa por el medio.
    for (const s of openSides(w)) {
      for (const u of [-0.56, 0, 0.56]) {
        put(c, w, () => {
          const [x, z] = onSide(w, s, u, 0.24);
          p.box(0.52, 0.2, 0.3, x, W, z, shade(SAND, r.range(-0.06, 0.04)), alongRot(s) + r.range(-0.08, 0.08));
        });
      }
      for (const u of [-0.28, 0.28]) {
        put(c, w, () => {
          const [x, z] = onSide(w, s, u, 0.24);
          p.box(0.5, 0.18, 0.28, x, W + 0.2, z, shade(SAND, r.range(-0.08, 0.02)), alongRot(s) + r.range(-0.08, 0.08));
        });
      }
    }
    if (isHub(w)) {
      // Puesto de guardia: techo de chapa sobre cuatro patas.
      put(c, w, () => {
        for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p.box(0.07, 1.2, 0.07, w.x + ox * 0.5, W, w.z + oz * 0.5, 0x5a4a3a);
        p.box(1.4, 0.06, 1.4, w.x, W + 1.2, w.z, RUST, r.range(-0.2, 0.2), 'solid', 0.1);
      });
    } else if (w.shape === 'line') put(c, w, () => p.wire(1.7, w.x, W, w.z, w.rot));
  },
  bridge(c, b) {
    const { p } = c;
    // Rejilla de metal y caños por debajo. La rejilla y sus rayas llegan de borde a borde del piso que hay.
    const [lo, hi] = crossSpan(c, b.x, b.z, b.axis);
    if (lo + hi < 0.6) return;
    const lat = b.axis === 'x' ? [0, 1] : [1, 0], mid = (hi - lo) / 2, wide = lo + hi - 0.3;
    const cx = b.x + lat[0] * mid, cz = b.z + lat[1] * mid;
    p.plate(b.axis === 'x' ? CELL - 0.3 : wide, b.axis === 'x' ? wide : CELL - 0.3, cx, 0, cz, 0x4a4e52);
    for (const k of [-0.5, 0, 0.5]) p.plate(b.axis === 'x' ? 0.06 : wide, b.axis === 'x' ? wide : 0.06, cx + (b.axis === 'x' ? k : 0), 0.004, cz + (b.axis === 'x' ? 0 : k), 0x6a6f74);
    for (const sgn of [-1, 1]) {
      const d = sgn > 0 ? hi + 0.1 : -(lo + 0.1);
      p.bar(0.1, CELL, b.x + lat[0] * d, -0.55, b.z + lat[1] * d, sgn > 0 ? RUST : 0x5a5e62, b.axis === 'x' ? 0 : Math.PI / 2);
    }
  },
  coast(c, s) {
    const { p, r } = c;
    const roll = r.next();
    if (roll < 0.1) {
      // Caño que asoma del acantilado.
      const e = edgeOf(c, s, r.range(-0.5, 0.5));
      const y = r.range(0.8, 1.5), col = r.chance(0.5) ? RUST : 0x5a5e62;
      if (!e) return;
      p.bar(0.13, 0.7, e.x + e.nx * 0.25, e.y - y, e.z + e.nz * 0.25, col, alongOf(e.nx, e.nz) + Math.PI / 2);
    } else if (roll < 0.19) {
      // Cadenas colgando: cada una pegada al borde donde le toca.
      for (let i = r.int(1, 3); i > 0; i--) {
        const u = r.range(-0.7, 0.7), len = r.range(0.6, 1.5);
        const q = edgeOf(c, s, u);
        if (q) p.box(0.04, len, 0.04, q.x + q.nx * 0.09, q.y - len - 0.03, q.z + q.nz * 0.09, 0x74787c);
      }
    } else if (roll < 0.25 && s.y === 0) {
      // Cartel de peligro atornillado a la roca.
      const e = edgeOf(c, s, 0);
      if (!e || e.y !== 0) return;
      const rot = alongOf(e.nx, e.nz);
      p.box(0.5, 0.5, 0.04, e.x + e.nx * 0.2, e.y - 1.0, e.z + e.nz * 0.2, 0xe0b53a, rot);
      p.box(0.07, 0.26, 0.05, e.x + e.nx * 0.21, e.y - 0.82, e.z + e.nz * 0.21, 0x2a2a2e, rot);
    }
  },
  trees: false,
  fog: { near: 31, far: 86 },
  mist: { color: 0x9db0d6, opacity: 0.85, y: -5.5 },
  island(p, r, size, top) {
    // Lo que quedó de la ciudad: un edificio a medio caer con alguna ventana prendida, o una antena con su luz roja.
    if (size < 2.8) {
      // Árbol seco.
      p.cyl(0.07, 0.14, 1.6, 0, top, 0, 0x3a3230, 5);
      for (const a of [0.6, 2.4, 4.3]) p.box(0.9, 0.06, 0.06, Math.cos(a) * 0.35, top + 1.2 + a * 0.1, -Math.sin(a) * 0.35, 0x3a3230, a, 'solid', 0.5);
      return;
    }
    if (r.chance(0.35)) {
      const h = r.range(5, 8);
      p.box(0.12, h, 0.12, 0, top, 0, 0x5a5e62);
      for (let y = 1; y < h; y += 1.2) p.box(0.7 - (y / h) * 0.4, 0.05, 0.05, 0, top + y, 0, 0x5a5e62, y);
      p.box(0.2, 0.2, 0.2, 0, top + h, 0, 0xff4a3a, 0, 'glow');
      return;
    }
    const w = r.range(1.6, 2.6), d = r.range(1.6, 2.4), h = r.range(2.6, 5.5), rot = r.range(0, TAU);
    p.box(w, h, d, 0, top, 0, shade(0x4a4d55, r.range(-0.04, 0.04)), rot);
    p.box(w * 0.75, 0.16, d * 1.05, w * 0.1, top + h, 0, 0x3a3c42, rot, 'solid', 0.22);
    const floors = Math.floor((h - 0.6) / 0.95);
    for (let f = 0; f < floors; f++) for (const u of [-0.3, 0.3]) {
      if (!r.chance(0.28)) continue;
      const lx = u * w, lz = d / 2 + 0.02;
      p.box(0.3, 0.38, 0.04, lx * Math.cos(rot) + lz * Math.sin(rot), top + 0.6 + f * 0.95, -lx * Math.sin(rot) + lz * Math.cos(rot), 0xffd27a, rot, 'glow');
    }
  },
  clearing(c, k) {
    // Playa de estacionamiento despintada: rayas blancas gastadas (nada de aros, que acá marcan las misiones).
    const half = Math.min(k.r - 0.7, 3);
    if (half < 1.6) return;
    const paint = shade(c.t.def.ground, 0.2);
    const rot = c.r.chance(0.5) ? 0 : Math.PI / 2;
    const bays = Math.floor((half * 2) / 1.3);
    for (let i = 0; i <= bays; i++) {
      if (c.r.chance(0.18)) continue;
      const u = -half + (half * 2 * i) / bays;
      const [x, z] = rot ? [k.x, k.z + u] : [k.x + u, k.z];
      c.p.plate(rot ? half * 1.1 : 0.09, rot ? 0.09 : half * 1.1, x, 0, z, paint);
    }
  },
};

export const AMBIENCES: Record<MapKind, Ambience> = { arena: ARENA, moba: SIEGE, race: RACE, horde: HORDE };
export const ambienceOf = (kind: MapKind | undefined): Ambience => AMBIENCES[kind ?? 'arena'];
