// Malla del terreno generada desde la grilla: una sola malla estática + una malla por baldosa frágil.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, ISLAND_BOTTOM, WALL_TOP } from '../core/constants';
import { Rng } from '../core/rng';
import { CellType, Terrain, TILE_CRUMBLING, TILE_GONE } from '../core/terrain';
import type { ThemeDef } from './themes';
import { terrainAtlas, tileCracks, toonGradient } from './textures';

class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  quad(p: number[][], n: number[], uv: number[][], c: THREE.Color[]) {
    const b = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(...p[i]);
      this.nor.push(...n);
      this.uv.push(...uv[i]);
      this.col.push(c[i].r, c[i].g, c[i].b);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

interface TileView {
  mesh: THREE.Mesh;
  crack: THREE.Mesh;
  state: number;
  fall: number;
  baseY: number;
  vr: THREE.Vector3;
}

export class TerrainView {
  group = new THREE.Group();
  private tiles: TileView[] = [];
  private crackMats: THREE.MeshBasicMaterial[] = [];
  private crumbleMat: THREE.MeshBasicMaterial;
  private neonMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  private time = 0;
  private version = -1;

  constructor(private t: Terrain, private theme: ThemeDef) {
    const def = t.def;
    const mat = new THREE.MeshToonMaterial({ map: terrainAtlas(def.id.length), vertexColors: true, gradientMap: toonGradient(), color: theme.groundTint });
    const staticB = new GeoBuilder();
    for (let i = 0; i < t.cells.length; i++) {
      const c = t.cells[i];
      if (c.type === CellType.Void || c.fragile >= 0) continue;
      this.addCell(staticB, i, true);
    }
    const ground = new THREE.Mesh(staticB.build(), mat);
    ground.receiveShadow = true;
    ground.castShadow = true;
    this.group.add(ground);

    for (let s = 0; s < 4; s++) {
      this.crackMats.push(new THREE.MeshBasicMaterial({ map: tileCracks(s), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    }
    for (let fi = 0; fi < t.fragile.length; fi++) {
      const ci = t.fragile[fi];
      const b = new GeoBuilder();
      this.addCell(b, ci, false);
      const m = new THREE.Mesh(b.build(), mat);
      m.receiveShadow = true;
      m.castShadow = true;
      const bb = t.cellBounds(ci);
      const top = t.topAt(ci, (bb.minX + bb.maxX) / 2, (bb.minZ + bb.maxZ) / 2);
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), this.crackMats[0]);
      crack.rotation.x = -Math.PI / 2;
      crack.position.set((bb.minX + bb.maxX) / 2, top + 0.02, (bb.minZ + bb.maxZ) / 2);
      crack.renderOrder = 2;
      const g = new THREE.Group();
      g.add(m);
      this.group.add(g);
      this.group.add(crack);
      this.tiles.push({ mesh: m, crack, state: 0, fall: 0, baseY: 0, vr: new THREE.Vector3() });
    }
    this.group.add(this.buildUnderside());
    this.crumbleMat = new THREE.MeshBasicMaterial({ map: tileCracks(3), color: new THREE.Color(0xff3020).multiplyScalar(3), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    const neon = theme.neon === 'none' ? null : this.buildNeonEdges();
    if (neon) this.group.add(neon);
  }

  private addCell(b: GeoBuilder, i: number, isStatic: boolean) {
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

    // Color de la cara superior
    const base = new THREE.Color((ix + iz) % 2 ? def.ground : def.ground2);
    if (c.type === CellType.Wall) base.set(0x8b7b6c);
    else if (c.level >= 1) base.lerp(new THREE.Color(0xffffff), 0.12);
    if (c.type === CellType.Ramp) base.multiplyScalar(0.92);
    if (c.fragile >= 0) base.lerp(new THREE.Color(0xffe0a0), 0.18);
    const topCols = [base, base, base, base];
    // Normal de la cara (rampas inclinadas)
    const p0 = new THREE.Vector3(corners[0][0], hs[0], corners[0][1]);
    const p1 = new THREE.Vector3(corners[1][0], hs[1], corners[1][1]);
    const p3 = new THREE.Vector3(corners[3][0], hs[3], corners[3][1]);
    const n = new THREE.Vector3().subVectors(p3, p0).cross(new THREE.Vector3().subVectors(p1, p0)).normalize();
    b.quad(
      [[corners[0][0], hs[0], corners[0][1]], [corners[3][0], hs[3], corners[3][1]], [corners[2][0], hs[2], corners[2][1]], [corners[1][0], hs[1], corners[1][1]]],
      [n.x, n.y, n.z],
      [[0.004, 0.996], [0.004, 0.004], [0.496, 0.004], [0.496, 0.996]],
      topCols,
    );

    // Caras laterales hacia vecinos más bajos (o vacío)
    const sides: { dx: number; dz: number; a: number; bI: number; n: number[] }[] = [
      { dx: 0, dz: -1, a: 1, bI: 0, n: [0, 0, -1] }, // norte: esquinas 1->0
      { dx: 1, dz: 0, a: 2, bI: 1, n: [1, 0, 0] }, // este: 2->1
      { dx: 0, dz: 1, a: 3, bI: 2, n: [0, 0, 1] }, // sur: 3->2
      { dx: -1, dz: 0, a: 0, bI: 3, n: [-1, 0, 0] }, // oeste: 0->3
    ];
    for (const s of sides) {
      const nx = ix + s.dx, nz = iz + s.dz;
      let n1 = ISLAND_BOTTOM, n2 = ISLAND_BOTTOM;
      if (isStatic && nx >= 0 && nz >= 0 && nx < t.w && nz < t.h) {
        const ni = nz * t.w + nx;
        const nc = t.cells[ni];
        if (nc.type !== CellType.Void && nc.fragile < 0) {
          const nb = t.cellBounds(ni);
          const nh = (x: number, z: number) => t.topAt(ni, Math.min(Math.max(x, nb.minX + eps), nb.maxX - eps), Math.min(Math.max(z, nb.minZ + eps), nb.maxZ - eps));
          n1 = nh(corners[s.a][0], corners[s.a][1]);
          n2 = nh(corners[s.bI][0], corners[s.bI][1]);
        }
      }
      const h1 = hs[s.a], h2 = hs[s.bI];
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

  /** Tiras de neón sobre los bordes que dan al vacío: marcan dónde se sale del mapa. */
  private buildNeonEdges(): THREE.Object3D | null {
    const t = this.t;
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < t.cells.length; i++) {
      const c = t.cells[i];
      if (c.type === CellType.Void || c.fragile >= 0) continue;
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
          tv.crack.material = s === TILE_CRUMBLING ? this.crumbleMat : this.crackMats[Math.min(3, s)];
          tv.mesh.visible = true;
          tv.crack.visible = true;
          tv.mesh.position.set(0, 0, 0);
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
        tv.mesh.position.set((Math.random() - 0.5) * k, -t.tileTimer[fi] * 0.1, (Math.random() - 0.5) * k);
      }
      if (tv.fall > 0 && tv.mesh.visible) {
        tv.fall += dt;
        tv.mesh.position.y = -9 * tv.fall * tv.fall;
        tv.mesh.rotation.x += tv.vr.x * dt;
        tv.mesh.rotation.z += tv.vr.z * dt;
        if (tv.fall > 1.6) tv.mesh.visible = false;
      }
    }
    this.version = t.version;
  }

  get dirty() { return this.version !== this.t.version; }
}
