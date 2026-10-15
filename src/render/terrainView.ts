// El terreno dibujado desde la malla (cuadrada u orgánica). El piso firme, las plataformas y los muros salen de las formas
// de terrainShape.ts: suelo continuo, costa redondeada y acantilados de roca. Las rampas y las losas frágiles son piezas
// con junta: una cuña por rampa (más su descanso, que dibuja terrainShape) y una malla por losa frágil (terrainPieces.ts),
// así se leen como piezas aparte.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, ISLAND_BOTTOM, LEVEL_H, WALL_TOP } from '../core/constants';
import { Rng } from '../core/rng';
import { CellType, Terrain, TILE_CRUMBLING, TILE_GONE } from '../core/terrain';
import { GroundStyle } from './ground';
import { AO_STEP, BEVEL_DROP, BEVEL_IN, GeoBuilder, buildSlab, slabCells } from './terrainPieces';
import { DEFAULT_LOOK, TerrainShaper, type TerrainLook } from './terrainShape';
import type { ThemeDef } from './themes';
import { groundTexture, terrainAtlas, tileCracks, toonGradient } from './textures';

interface TileView {
  mesh: THREE.Mesh;
  crack: THREE.Mesh;
  state: number;
  fall: number;
  /** El punto de la losa sobre el que se mueve y gira: el centro de su caja, a la altura de su cara de arriba. */
  base: THREE.Vector3;
  vr: THREE.Vector3;
}

export class TerrainView {
  group = new THREE.Group();
  private tiles: TileView[] = [];
  private crackMats: THREE.MeshBasicMaterial[] = [];
  private crumbleMat: THREE.MeshBasicMaterial;
  private neonMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide });
  private time = 0;
  private version = -1;

  constructor(private t: Terrain, private theme: ThemeDef, private style = new GroundStyle(t), look: TerrainLook = DEFAULT_LOOK) {
    const def = t.def;
    const mat = new THREE.MeshToonMaterial({ map: terrainAtlas(def.id.length), vertexColors: true, gradientMap: toonGradient(), color: theme.groundTint });
    const shape = new TerrainShaper(t, style, look).build();
    const ground = new THREE.Mesh(shape.top, new THREE.MeshToonMaterial({ map: groundTexture(def.id.length), vertexColors: true, gradientMap: toonGradient(), color: theme.groundTint }));
    ground.receiveShadow = true;
    ground.castShadow = true;
    this.group.add(ground);
    const rock = new THREE.Mesh(shape.rock, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), color: theme.groundTint }));
    rock.receiveShadow = true;
    rock.castShadow = true;
    this.group.add(rock);
    // Rampas: cuñas de losa apoyadas sobre el piso.
    const rampB = new GeoBuilder();
    for (const p of t.mesh.ramps) this.addWedge(rampB, p.src);
    if (rampB.idx.length) {
      const ramps = new THREE.Mesh(rampB.build(), mat);
      ramps.receiveShadow = true;
      ramps.castShadow = true;
      this.group.add(ramps);
    }

    for (let s = 0; s < 4; s++) {
      this.crackMats.push(new THREE.MeshBasicMaterial({ map: tileCracks(s), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    }
    const slabs = slabCells(t);
    for (let fi = 0; fi < t.fragile.length; fi++) {
      const b = new GeoBuilder();
      const decal = buildSlab(t, style, fi, slabs[fi], this.loose(), b);
      // La geometría de la losa queda alrededor de su centro y el Mesh se pone ahí: así gira sobre sí misma al caer, y no
      // alrededor del origen del mundo.
      const bb = t.slabBounds(fi);
      const base = new THREE.Vector3((bb.minX + bb.maxX) / 2, t.mesh.top[slabs[fi][0]], (bb.minZ + bb.maxZ) / 2);
      const geo = b.build();
      geo.translate(-base.x, -base.y, -base.z);
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(base);
      m.receiveShadow = true;
      m.castShadow = true;
      const crack = new THREE.Mesh(decal, this.crackMats[this.loose() ? 1 : 0]);
      crack.renderOrder = 2;
      this.group.add(m);
      this.group.add(crack);
      this.tiles.push({ mesh: m, crack, state: 0, fall: 0, base, vr: new THREE.Vector3() });
    }
    this.group.add(this.buildUnderside());
    this.crumbleMat = new THREE.MeshBasicMaterial({ map: tileCracks(3), color: new THREE.Color(0xff3020).multiplyScalar(3), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    if (shape.paint) {
      const paint = new THREE.Mesh(shape.paint, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), color: theme.groundTint, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      paint.receiveShadow = true;
      this.group.add(paint);
    }
    if (theme.neon !== 'none') {
      if (shape.neon) this.group.add(new THREE.Mesh(shape.neon, this.neonMat));
      const ramps = this.buildRampNeon();
      if (ramps) this.group.add(ramps);
    }
  }

  /** Piso flojo: en las pistas de Carrera el piso frágil ya se ve agrietado, porque se cae con solo pisarlo. */
  private loose() { return this.t.def.kind === 'race'; }

  /** La cuña de una rampa (la celda del plano `i`): una losa con bisel apoyada sobre el piso. */
  private addWedge(b: GeoBuilder, i: number) {
    const t = this.t;
    const c = t.cells[i];
    const bb = t.cellBounds(i);
    const def = t.def;
    const ix = i % t.w, iz = Math.floor(i / t.w);
    const eps = 0.0005;
    const h = (x: number, z: number) => t.topAt(i, Math.min(Math.max(x, bb.minX + eps), bb.maxX - eps), Math.min(Math.max(z, bb.minZ + eps), bb.maxZ - eps));
    const corners = [
      [bb.minX, bb.minZ], [bb.maxX, bb.minZ], [bb.maxX, bb.maxZ], [bb.minX, bb.maxZ],
    ];
    const hs = corners.map(([x, z]) => h(x, z));

    // Color de la cara superior: damero suave + variación por losa
    const base = new THREE.Color((ix + iz) % 2 ? def.ground : def.ground2);
    if (c.level >= 1) base.lerp(new THREE.Color(0xffffff), 0.12);
    base.multiplyScalar(0.92);
    base.offsetHSL(0, 0, this.style.jitter(ix, iz) * 0.022);
    // Las cuñas llevan manchas de vegetación y senderos, como el piso firme.
    const grass = base.clone().offsetHSL(0.075, 0.07, -0.07);
    const dirt = base.clone().offsetHSL(-0.015, -0.1, -0.12);
    // Sombra de contacto: las esquinas pegadas a algo más alto se oscurecen.
    const cornerOff = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const ao = cornerOff.map(([ox, oz], k) => {
      const edge = Math.max(this.cellHeight(ix + ox, iz), this.cellHeight(ix, iz + oz));
      if (edge - hs[k] > AO_STEP) return 0.7;
      return this.cellHeight(ix + ox, iz + oz) - hs[k] > AO_STEP ? 0.85 : 1;
    });
    const tint = (x: number, z: number, k: number) => {
      const col = base.clone();
      col.lerp(grass, this.style.patch(x, z) * 0.75).lerp(dirt, this.style.path(x, z) * 0.8);
      return col.multiplyScalar(ao[k]);
    };
    const uvOf = (x: number, z: number) => [0.004 + ((x - bb.minX) / CELL) * 0.492, 0.996 - ((z - bb.minZ) / CELL) * 0.992];
    // Losa con bisel: la cara de arriba se mete un poco y el borde baja hacia la junta.
    const inner = corners.map(([x, z], k) => {
      const px = x - cornerOff[k][0] * BEVEL_IN, pz = z - cornerOff[k][1] * BEVEL_IN;
      return [px, h(px, pz), pz];
    });
    const outer = corners.map(([x, z], k) => [x, hs[k] - BEVEL_DROP, z]);
    const inCol = inner.map((p, k) => tint(p[0], p[2], k));
    const outCol = inCol.map((col) => col.clone().multiplyScalar(0.78));
    const inUv = inner.map((p) => uvOf(p[0], p[2]));
    const outUv = outer.map((p) => uvOf(p[0], p[2]));
    // Normal de la cara (rampas inclinadas)
    const p0 = new THREE.Vector3(corners[0][0], hs[0], corners[0][1]);
    const p1 = new THREE.Vector3(corners[1][0], hs[1], corners[1][1]);
    const p3 = new THREE.Vector3(corners[3][0], hs[3], corners[3][1]);
    const n = new THREE.Vector3().subVectors(p3, p0).cross(new THREE.Vector3().subVectors(p1, p0)).normalize();
    b.quad(
      [inner[0], inner[3], inner[2], inner[1]],
      [n.x, n.y, n.z],
      [inUv[0], inUv[3], inUv[2], inUv[1]],
      [inCol[0], inCol[3], inCol[2], inCol[1]],
    );

    // Caras laterales hacia vecinos más bajos (o vacío)
    const sides: { dx: number; dz: number; a: number; bI: number; n: number[] }[] = [
      { dx: 0, dz: -1, a: 1, bI: 0, n: [0, 0, -1] }, // norte: esquinas 1->0
      { dx: 1, dz: 0, a: 2, bI: 1, n: [1, 0, 0] }, // este: 2->1
      { dx: 0, dz: 1, a: 3, bI: 2, n: [0, 0, 1] }, // sur: 3->2
      { dx: -1, dz: 0, a: 0, bI: 3, n: [-1, 0, 0] }, // oeste: 0->3
    ];
    for (const s of sides) {
      const bn = new THREE.Vector3(s.n[0], s.n[1], s.n[2]).multiplyScalar(BEVEL_DROP).addScaledVector(n, BEVEL_IN).normalize();
      b.quad(
        [inner[s.a], outer[s.a], outer[s.bI], inner[s.bI]],
        [bn.x, bn.y, bn.z],
        [inUv[s.a], outUv[s.a], outUv[s.bI], inUv[s.bI]],
        [inCol[s.a], outCol[s.a], outCol[s.bI], inCol[s.bI]],
      );
    }
    for (const s of sides) {
      const nx = ix + s.dx, nz = iz + s.dz;
      // Una rampa apoya sobre el piso, que ya trae su acantilado.
      let n1 = -BEVEL_DROP, n2 = n1;
      if (nx >= 0 && nz >= 0 && nx < t.w && nz < t.h) {
        const ni = nz * t.w + nx;
        const nc = t.cells[ni];
        if (nc.type !== CellType.Void && nc.fragile < 0) {
          const nb = t.cellBounds(ni);
          const nh = (x: number, z: number) => t.topAt(ni, Math.min(Math.max(x, nb.minX + eps), nb.maxX - eps), Math.min(Math.max(z, nb.minZ + eps), nb.maxZ - eps));
          n1 = nh(corners[s.a][0], corners[s.a][1]) - BEVEL_DROP;
          n2 = nh(corners[s.bI][0], corners[s.bI][1]) - BEVEL_DROP;
        }
      }
      const h1 = hs[s.a] - BEVEL_DROP, h2 = hs[s.bI] - BEVEL_DROP;
      if (h1 - n1 < 0.001 && h2 - n2 < 0.001) continue;
      const b1 = Math.min(n1, h1), b2 = Math.min(n2, h2);
      const [ax, az] = corners[s.a];
      const [bx, bz] = corners[s.bI];
      const v = (y: number) => Math.min(1, Math.max(0, (y - ISLAND_BOTTOM) / (WALL_TOP - ISLAND_BOTTOM + 1)));
      const cTop = new THREE.Color(0xc9b39a), cBot = new THREE.Color(0x5a4a3e);
      const col = (y: number) => cBot.clone().lerp(cTop, v(y));
      b.quad(
        [[ax, h1, az], [ax, b1, az], [bx, b2, bz], [bx, h2, bz]],
        s.n,
        [[0.504, v(h1)], [0.504, v(b1)], [0.996, v(b2)], [0.996, v(h2)]],
        [col(h1), col(b1), col(b2), col(h2)],
      );
    }
  }

  /** Altura aproximada de una celda (para la sombra de contacto). -Infinity si es vacío o está fuera del mapa. */
  private cellHeight(ix: number, iz: number) {
    const t = this.t;
    if (ix < 0 || iz < 0 || ix >= t.w || iz >= t.h) return -Infinity;
    const c = t.cells[iz * t.w + ix];
    if (c.type === CellType.Void) return -Infinity;
    if (c.type === CellType.Wall) return WALL_TOP;
    return (c.level + (c.type === CellType.Ramp ? 0.5 : 0)) * LEVEL_H;
  }

  private buildUnderside(): THREE.Object3D {
    const t = this.t;
    const r = new Rng(t.w * 31 + t.h);
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < t.cells.length; i++) {
      if (t.cells[i].type === CellType.Void) continue;
      const c = t.cellCenter(i % t.w, Math.floor(i / t.w));
      if (!r.chance(0.55)) continue;
      const hgt = r.range(2, 7);
      const g = new THREE.ConeGeometry(r.range(0.7, 1.25), hgt, 5);
      g.rotateX(Math.PI);
      g.rotateY(r.range(0, 6));
      g.translate(c.x + r.range(-0.4, 0.4), ISLAND_BOTTOM - hgt / 2 + 0.2, c.z + r.range(-0.4, 0.4));
      const ni = g.toNonIndexed();
      ni.computeVertexNormals();
      geos.push(ni);
    }
    if (!geos.length) return new THREE.Group();
    const merged = mergeGeometries(geos);
    const m = new THREE.Mesh(merged, new THREE.MeshToonMaterial({ color: 0x4a3c34, gradientMap: toonGradient() }));
    return m;
  }

  /** Tiras de neón sobre el borde de las rampas que dan al vacío (las del resto del mapa salen con las formas). */
  private buildRampNeon(): THREE.Object3D | null {
    const t = this.t;
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < t.cells.length; i++) {
      const c = t.cells[i];
      if (c.type !== CellType.Ramp || c.fragile >= 0) continue;
      const ix = i % t.w, iz = Math.floor(i / t.w);
      const b = t.cellBounds(i);
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = ix + dx, nz = iz + dz;
        const out = nx < 0 || nz < 0 || nx >= t.w || nz >= t.h || t.cells[nz * t.w + nx].type === CellType.Void;
        if (!out) continue;
        const ex = cx + dx * (CELL / 2 - 0.05), ez = cz + dz * (CELL / 2 - 0.05);
        const top = t.topAt(i, ex - dx * 0.1, ez - dz * 0.1);
        const g = new THREE.BoxGeometry(dx ? 0.1 : CELL, 0.1, dz ? 0.1 : CELL);
        g.translate(ex, top + 0.04, ez);
        geos.push(g);
      }
    }
    if (!geos.length) return null;
    return new THREE.Mesh(mergeGeometries(geos), this.neonMat);
  }

  update(dt: number) {
    const t = this.t;
    this.time += dt;
    // Neón que cambia de color lento (cian ↔ magenta) y late.
    const th = this.theme;
    if (th.neon === 'cycle') {
      const hue = 0.52 + Math.sin(this.time * 0.35) * 0.18;
      this.neonMat.color.setHSL(hue, 1, 0.55).multiplyScalar(th.neonGlow + Math.sin(this.time * 3) * 0.4);
    } else if (typeof th.neon === 'number') {
      this.neonMat.color.setHex(th.neon).multiplyScalar(th.neonGlow * (0.85 + Math.sin(this.time * 2.5) * 0.15));
    }
    this.crumbleMat.opacity = 0.55 + 0.45 * Math.sin(this.time * 30);
    for (let fi = 0; fi < this.tiles.length; fi++) {
      const tv = this.tiles[fi];
      const s = t.tileState[fi];
      if (s !== tv.state) {
        tv.state = s;
        if (s < TILE_GONE) {
          tv.crack.material = s === TILE_CRUMBLING ? this.crumbleMat : this.crackMats[Math.min(3, s + (this.loose() ? 1 : 0))];
          tv.mesh.visible = true;
          tv.crack.visible = true;
          tv.mesh.position.copy(tv.base);
          tv.mesh.rotation.set(0, 0, 0);
          tv.fall = 0;
        } else {
          tv.crack.visible = false;
          tv.fall = 0.001;
          tv.vr.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
        }
      }
      if (s === TILE_CRUMBLING) {
        const k = 0.06;
        tv.mesh.position.set(tv.base.x + (Math.random() - 0.5) * k, tv.base.y - t.tileTimer[fi] * 0.1, tv.base.z + (Math.random() - 0.5) * k);
      }
      if (tv.fall > 0 && tv.mesh.visible) {
        tv.fall += dt;
        tv.mesh.position.y = tv.base.y - 9 * tv.fall * tv.fall;
        tv.mesh.rotation.x += tv.vr.x * dt;
        tv.mesh.rotation.z += tv.vr.z * dt;
        if (tv.fall > 1.6) tv.mesh.visible = false;
      }
    }
    this.version = t.version;
  }

  get dirty() { return this.version !== this.t.version; }
}
