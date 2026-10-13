// Decoración contextual: la lectura del mapa (qué es una hilera de muros, un puente, un claro) y que cada
// juego pueda poner sus piezas en todos los mapas.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CELL } from '../src/core/constants';
import { MAP_IDS, MAPS } from '../src/core/maps';
import { CellType, Terrain } from '../src/core/terrain';
import { AMBIENCES, ambienceOf } from '../src/render/ambience';
import { DecorView } from '../src/render/decorView';
import { GroundStyle } from '../src/render/ground';
import { getTheme } from '../src/render/themes';
import { analyze, reservedCells, takeClearings } from '../src/render/topology';

describe('lectura del mapa', () => {
  it('distingue las formas de los muros', () => {
    const t = new Terrain('puente');
    const { walls } = analyze(t);
    const shapes = new Set(walls.map((w) => w.shape));
    expect(walls.length).toBe(t.cells.filter((c) => c.type === CellType.Wall).length);
    // Las bases del Asedio están cercadas: hileras rectas con codos.
    expect(shapes.has('line')).toBe(true);
    expect(shapes.has('corner') || shapes.has('end')).toBe(true);
    for (const w of walls) {
      const n = w.wall.filter(Boolean).length;
      if (w.shape === 'solo') expect(n).toBe(0);
      if (w.shape === 'end') expect(n).toBe(1);
      if (w.shape === 'line') { expect(n).toBe(2); expect(w.wall[0]).toBe(w.wall[2]); expect(w.run).toBeGreaterThanOrEqual(3); }
    }
  });

  it('encuentra los puentes: piso con vacío a los dos lados', () => {
    const t = new Terrain('cornisas');
    const { bridges } = analyze(t);
    expect(bridges.length).toBeGreaterThan(0);
    for (const b of bridges) {
      const sides = b.axis === 'x' ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
      for (const [dx, dz] of sides) {
        const ix = b.ix + dx, iz = b.iz + dz;
        const out = ix < 0 || iz < 0 || ix >= t.w || iz >= t.h || t.cells[iz * t.w + ix].type === CellType.Void;
        expect(out).toBe(true);
      }
      expect(b.at).toBeLessThan(b.run);
    }
  });

  it('los claros son piso llano y libre, sin nada del juego encima', () => {
    for (const id of MAP_IDS) {
      const t = new Terrain(id);
      const reserved = reservedCells(t);
      for (const k of analyze(t, reserved).clearings) {
        const d = Math.round(k.r / CELL - 0.5);
        expect(d).toBeGreaterThanOrEqual(1);
        for (let oz = -d; oz <= d; oz++) for (let ox = -d; ox <= d; ox++) {
          const i = (k.iz + oz) * t.w + k.ix + ox, c = t.cells[i];
          expect(c.type === CellType.Floor && c.level === 0 && c.fragile < 0 && !reserved.has(i), `${id} claro ${k.ix},${k.iz}`).toBe(true);
        }
      }
    }
  });

  it('en los mapas espejados del Asedio los claros que se decoran salen de a pares', () => {
    for (const id of MAP_IDS.filter((m) => MAPS[m].kind === 'moba')) {
      const t = new Terrain(id);
      const picked = takeClearings(analyze(t).clearings, AMBIENCES.moba.maxClearings);
      for (const k of picked) {
        // El mapa está centrado en x = 0: el gemelo de un claro está en -x (uno sobre el eje es su propio gemelo).
        const twin = picked.some((o) => Math.abs(o.x + k.x) < 0.01 && Math.abs(o.z - k.z) < 0.01);
        expect(twin, `${id}: el claro ${k.ix},${k.iz} no tiene gemelo`).toBe(true);
      }
    }
  });
});

describe('ambientación', () => {
  it('hay una por cada clase de mapa y arma todos los mapas', () => {
    for (const id of MAP_IDS) {
      const t = new Terrain(id);
      const amb = ambienceOf(MAPS[id].kind);
      expect(amb.id).toBe(MAPS[id].kind ?? 'arena');
      const view = new DecorView(t, getTheme(MAPS[id].theme), new GroundStyle(t), amb);
      let verts = 0;
      view.group.traverse((o) => {
        const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        if (!g || (o as THREE.InstancedMesh).isInstancedMesh) return;
        const pos = g.attributes.position.array as Float32Array;
        verts += pos.length / 3;
        expect(pos.every((v) => Number.isFinite(v)), id).toBe(true);
      });
      // Todos los mapas tienen costa, así que alguna pieza siempre sale.
      expect(verts, id).toBeGreaterThan(0);
    }
  });

  it('la misma semilla da el mismo decorado (se ve igual en todas las pantallas)', () => {
    const count = () => {
      const t = new Terrain('puente');
      let n = 0;
      new DecorView(t, getTheme('atardecer'), new GroundStyle(t)).group.traverse((o) => {
        const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        if (g) n += g.attributes.position.count;
      });
      return n;
    };
    expect(count()).toBe(count());
  });
});
