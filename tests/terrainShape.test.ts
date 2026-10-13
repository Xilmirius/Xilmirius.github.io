// Formas del terreno por vecindario: lo que se dibuja no le puede mentir a la colisión.
import { describe, expect, it } from 'vitest';
import { CELL } from '../src/core/constants';
import { MAP_IDS } from '../src/core/maps';
import { CellType, Terrain } from '../src/core/terrain';
import { GroundStyle } from '../src/render/ground';
import { Cls, R_IN, TerrainShaper } from '../src/render/terrainShape';

const shaperOf = (map: string) => {
  const t = new Terrain(map);
  return { t, sh: new TerrainShaper(t, new GroundStyle(t)) };
};

describe('formas del terreno', () => {
  it('arma todos los mapas sin vértices rotos', () => {
    for (const id of MAP_IDS) {
      const { sh } = shaperOf(id);
      const g = sh.build();
      for (const geo of [g.top, g.rock]) {
        const pos = geo.attributes.position.array as Float32Array;
        expect(pos.length, id).toBeGreaterThan(0);
        expect(pos.every((v) => Number.isFinite(v)), id).toBe(true);
      }
    }
  });

  it('el piso dibujado nunca se pasa del piso real (salvo el relleno mínimo de una esquina entrante)', () => {
    // Lo más que puede sobresalir el relleno de un rincón respecto del borde real.
    const slack = R_IN * (1 - Math.SQRT1_2) + 1e-3;
    for (const id of MAP_IDS) {
      const { t, sh } = shaperOf(id);
      const pos = sh.build().top.attributes.position.array as Float32Array;
      const solid = (x: number, z: number) => {
        const ix = Math.floor((x - t.originX) / CELL), iz = Math.floor((z - t.originZ) / CELL);
        return sh.cls(ix, iz) >= Cls.Ramp;
      };
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i], z = pos[i + 2];
        // Un vértice vale si hay piso firme ahí mismo o a un pelo de distancia.
        const ok = [[0, 0], [slack, 0], [-slack, 0], [0, slack], [0, -slack], [slack, slack], [-slack, slack], [slack, -slack], [-slack, -slack]].some(([dx, dz]) => solid(x + dx, z + dz));
        expect(ok, `${id}: piso dibujado sobre el vacío en (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(true);
      }
    }
  });

  it('no redondea nada al lado de una losa frágil ni de una rampa', () => {
    for (const id of MAP_IDS) {
      const { t, sh } = shaperOf(id);
      for (const h of sh.layers()) {
        for (let iz = 0; iz < t.h; iz++) for (let ix = 0; ix < t.w; ix++) {
          for (let k = 0; k < 4; k++) {
            if (!sh.inLayer(h, ix, iz) || !sh.rounded(h, ix, iz, k)) continue;
            const vx = ix + (k === 1 || k === 2 ? 1 : 0), vz = iz + (k >= 2 ? 1 : 0);
            for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
              const c = sh.cls(vx + dx, vz + dz);
              expect(c === Cls.Fragile || c === Cls.Ramp, `${id} celda ${ix},${iz} esquina ${k}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('una esquina saliente se redondea y una entrante lleva relleno', () => {
    const { t, sh } = shaperOf('islote');
    let convex = 0, concave = 0;
    for (let iz = 0; iz < t.h; iz++) for (let ix = 0; ix < t.w; ix++) for (let k = 0; k < 4; k++) if (sh.inLayer(0, ix, iz) && sh.rounded(0, ix, iz, k)) convex++;
    for (let vz = 0; vz <= t.h; vz++) for (let vx = 0; vx <= t.w; vx++) if (sh.fillet(0, vx, vz)) concave++;
    expect(convex).toBeGreaterThan(4);
    expect(concave).toBeGreaterThan(4);
  });

  it('los muros y las plataformas son capas aparte, apoyadas sobre el piso', () => {
    const { t, sh } = shaperOf('cantera');
    const layers = sh.layers();
    expect(layers[0]).toBe(0);
    expect(layers.length).toBeGreaterThanOrEqual(3);
    const wall = t.cells.findIndex((c) => c.type === CellType.Wall);
    const ix = wall % t.w, iz = Math.floor(wall / t.w);
    for (const h of layers) expect(sh.inLayer(h, ix, iz)).toBe(true);
  });
});
