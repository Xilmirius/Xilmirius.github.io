// Fondo del mapa: lo que se ve debajo y alrededor de la isla. La cámara mira desde arriba, así que el
// "fondo" es sobre todo el abismo: capas de nubes que pasan, islas flotantes a lo lejos y, según el tema,
// una grilla de neón o el reflejo del sol o de la luna. Todo va más oscuro y apagado que la arena para
// que nunca compita con el juego. Solo visual.
// El tema pone el cielo, las nubes y la luz; el juego (ambience.ts) pone qué hay sobre las islas y qué flota
// alrededor: atalayas en el Asedio, globos y carteleras en la Carrera, ruinas y bruma en la Horda.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';
import type { Terrain } from '../core/terrain';
import { ambienceOf, type Ambience } from './ambience';
import { faceted, painted, shade } from './geo';
import { Pieces } from './pieces';
import type { ThemeDef } from './themes';
import { cloudTexture, gridTexture, softDisc, toonGradient } from './textures';

interface Look {
  /** Colores del domo: fondo del abismo, horizonte y cenit. */
  abyss: number;
  haze: number;
  zenith: number;
  /** Capas de nubes: color, opacidad, altura, tamaño de la repetición (m) y velocidad (m/s). */
  clouds: { color: number; opacity: number; y: number; tile: number; speed: number }[];
  islandRock: number;
  islandTop: number;
  /** Cuánto se apagan las islas y rocas del fondo (1 = sin tocar): la arena siempre tiene que ser lo más vivo. */
  dim: number;
  /** Colores de las copas de los árboles de las islas (vacío = sin árboles). */
  trees: number[];
  /** Colores de los cristales luminosos (vacío = sin cristales). */
  crystals: number[];
  /** Grilla de neón en el fondo. */
  grid?: number;
  /** Reflejo del sol o de la luna sobre las nubes. */
  glow?: { color: number; x: number; z: number; size: number; opacity: number };
  stars: boolean;
}

const mix = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();

function lookFor(theme: ThemeDef, sky: number, fog: number, ground: number): Look {
  switch (theme.scene) {
    case 'day':
      return {
        abyss: mix(sky, 0x000000, 0.3), haze: fog, zenith: mix(sky, 0xffffff, 0.1),
        clouds: [
          { color: mix(fog, 0xffffff, 0.5), opacity: 0.55, y: -27, tile: 110, speed: 0.7 },
          { color: mix(fog, 0xffffff, 0.28), opacity: 0.42, y: -17, tile: 150, speed: 1.1 },
        ],
        islandRock: 0x6f5d52, islandTop: mix(ground, 0x7fae4f, 0.55), dim: 0.68, trees: [0x5f9a48, 0x77ad52, 0x4f8a50], crystals: [], stars: false,
      };
    case 'sunset':
      return {
        abyss: 0x351630, haze: fog, zenith: sky,
        clouds: [
          { color: 0xff9a6a, opacity: 0.5, y: -27, tile: 110, speed: 0.7 },
          { color: 0xd95f80, opacity: 0.38, y: -17, tile: 150, speed: 1.1 },
        ],
        islandRock: 0x5c3344, islandTop: 0xc98a5a, dim: 0.6, trees: [0xff8a3d, 0xd9502a, 0xffc94a], crystals: [],
        glow: { color: 0xffc070, x: 30, z: -44, size: 80, opacity: 0.5 }, stars: false,
      };
    case 'night':
      return {
        abyss: 0x04060f, haze: fog, zenith: sky,
        clouds: [
          { color: 0x3f62b8, opacity: 0.26, y: -30, tile: 120, speed: 0.5 },
          { color: 0x6f8fe0, opacity: 0.14, y: -20, tile: 170, speed: -0.4 },
        ],
        islandRock: 0x1c2540, islandTop: 0x2f4468, dim: 1, trees: [0x2f6a6a, 0x3a7a86], crystals: [0x4fd1ff, 0x7dffea, 0x9ec0ff],
        glow: { color: 0x6f96e8, x: -28, z: -42, size: 52, opacity: 0.26 }, stars: true,
      };
    default:
      return {
        abyss: 0x0d0820, haze: fog, zenith: sky,
        clouds: [
          { color: 0xff4f8b, opacity: 0.22, y: -30, tile: 100, speed: 0.9 },
          { color: 0x4fd1ff, opacity: 0.17, y: -21, tile: 140, speed: -0.6 },
        ],
        islandRock: 0x3a2c58, islandTop: 0x6a58a0, dim: 0.9, trees: [], crystals: [0x4fd1ff, 0xff4f8b, 0xb070ff, 0x7dff6a, 0xffe14a],
        grid: 0x9d7bff, stars: true,
      };
  }
}

const PLANE = 520;
const GRID_CELL = 7;

export class Backdrop {
  group = new THREE.Group();
  private dome: THREE.Mesh;
  private layers: { tex: THREE.Texture; speed: number; tile: number }[] = [];
  private gridTex: THREE.Texture | null = null;
  /** Islas que suben y bajan despacio, y cristales sueltos que giran. */
  private floating: { o: THREE.Object3D; y: number; phase: number; amp: number; spin: number }[] = [];
  private glowMat = new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: true });

  constructor(t: Terrain, theme: ThemeDef, private amb: Ambience = ambienceOf(t.def.kind)) {
    const def = t.def;
    const look = lookFor(theme, theme.sky ?? def.sky, theme.fog ?? def.fog, def.ground);
    const r = new Rng(t.w * 53 + t.h * 11 + theme.id.length);

    this.dome = this.buildDome(look);
    this.group.add(this.dome);

    for (const c of look.clouds) {
      const tex = cloudTexture().clone();
      tex.needsUpdate = true;
      tex.repeat.set(PLANE / c.tile, PLANE / c.tile);
      tex.offset.set(r.next(), r.next());
      const m = this.plane(PLANE, c.y, new THREE.MeshBasicMaterial({ map: tex, color: c.color, transparent: true, opacity: c.opacity, depthWrite: false }));
      m.renderOrder = -5;
      this.group.add(m);
      this.layers.push({ tex, speed: c.speed, tile: c.tile });
    }

    if (look.grid !== undefined) {
      const tex = gridTexture().clone();
      tex.needsUpdate = true;
      tex.repeat.set(PLANE / GRID_CELL, PLANE / GRID_CELL);
      this.gridTex = tex;
      const m = this.plane(PLANE, -36, new THREE.MeshBasicMaterial({ map: tex, color: look.grid, transparent: true, opacity: 0.85, depthWrite: false }));
      m.renderOrder = -6;
      this.group.add(m);
    }

    if (look.glow) {
      const g = look.glow;
      const m = this.plane(g.size, look.clouds[0].y + 0.6, new THREE.MeshBasicMaterial({
        map: softDisc(), color: g.color, transparent: true, opacity: g.opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      m.position.x = g.x;
      m.position.z = g.z;
      m.renderOrder = -4;
      this.group.add(m);
    }

    if (amb.mist) {
      const tex = cloudTexture().clone();
      tex.needsUpdate = true;
      tex.repeat.set(PLANE / 70, PLANE / 70);
      const m = this.plane(PLANE, amb.mist.y, new THREE.MeshBasicMaterial({ map: tex, color: amb.mist.color, transparent: true, opacity: amb.mist.opacity, depthWrite: false }));
      m.renderOrder = -3;
      this.group.add(m);
      this.layers.push({ tex, speed: 1.6, tile: 70 });
    }

    this.buildIslands(t, look, r);
    this.buildDebris(t, look, r);
    this.buildFloaters(t, look, r);
    if (look.stars) this.group.add(this.buildStars(r));
  }

  private plane(size: number, y: number, mat: THREE.Material) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    return m;
  }

  /** Esfera vista desde adentro con degradé vertical: el fondo de todo. */
  private buildDome(look: Look): THREE.Mesh {
    const R = 190;
    const g = new THREE.SphereGeometry(R, 24, 14);
    const abyss = new THREE.Color(look.abyss), haze = new THREE.Color(look.haze), zenith = new THREE.Color(look.zenith);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const k = pos.getY(i) / R;
      if (k < 0) c.copy(haze).lerp(abyss, Math.pow(-k, 1.4));
      else c.copy(haze).lerp(zenith, Math.sqrt(k));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -10;
    m.frustumCulled = false;
    return m;
  }

  /** Islas flotantes alrededor del mapa, siempre más abajo que la arena (no parecen lugares a los que se llega). */
  private buildIslands(t: Terrain, look: Look, r: Rng) {
    const b = t.bounds();
    const halfW = (b.maxX - b.minX) / 2, halfD = (b.maxZ - b.minZ) / 2;
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), color: new THREE.Color().setScalar(look.dim) });
    const count = 12 + Math.round((halfW + halfD) / 12);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r.range(-0.2, 0.2);
      const size = r.range(2.2, 6.5);
      const out = r.range(8, 44);
      const island = this.buildIsland(look, r, size, mat);
      const y = -r.range(5, 19) - size * 0.4;
      island.position.set(Math.cos(a) * (halfW + out), y, Math.sin(a) * (halfD + out));
      island.rotation.y = r.range(0, 6.28);
      this.group.add(island);
      this.floating.push({ o: island, y, phase: r.range(0, 6.28), amp: r.range(0.25, 0.6), spin: r.range(-0.02, 0.02) });
    }
  }

  /** Lo que flota alrededor del mapa según el juego (los globos de la Carrera). */
  private buildFloaters(t: Terrain, look: Look, r: Rng) {
    const fl = this.amb.floaters;
    if (!fl) return;
    const b = t.bounds();
    const halfW = (b.maxX - b.minX) / 2, halfD = (b.maxZ - b.minZ) / 2;
    for (let i = 0; i < fl.count; i++) {
      const p = new Pieces();
      fl.build(p, r);
      const o = this.dimmed(p, look);
      const a = (i / fl.count) * Math.PI * 2 + r.range(-0.4, 0.4);
      const out = r.range(12, 38), y = r.range(fl.y[0], fl.y[1]);
      o.position.set(Math.cos(a) * (halfW + out), y, Math.sin(a) * (halfD + out));
      this.group.add(o);
      this.floating.push({ o, y, phase: r.range(0, 6.28), amp: r.range(0.6, 1.3), spin: r.range(-0.05, 0.05) });
    }
  }

  /** Arma las piezas de la ambientación y las apaga como al resto del fondo (las luces quedan encendidas). */
  private dimmed(p: Pieces, look: Look): THREE.Object3D {
    const { group } = p.build();
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = false;
      m.receiveShadow = false;
      const mat = m.material as THREE.MeshToonMaterial;
      if (mat.isMeshToonMaterial) mat.color.setScalar(look.dim);
    });
    return group;
  }

  private buildIsland(look: Look, r: Rng, size: number, mat: THREE.Material): THREE.Object3D {
    const g = new THREE.Group();
    const parts: THREE.BufferGeometry[] = [];
    const depth = size * r.range(1.3, 2);
    const rock = new THREE.ConeGeometry(size, depth, 7, 2);
    rock.rotateX(Math.PI);
    rock.translate(0, -depth / 2, 0);
    parts.push(painted(faceted(rock), shade(look.islandRock, r.range(-0.03, 0.03))));
    const cap = new THREE.CylinderGeometry(size * 1.05, size * 0.97, size * 0.16, 7);
    cap.translate(0, size * 0.03, 0);
    parts.push(painted(faceted(cap), shade(look.islandTop, r.range(-0.03, 0.04))));
    const top = size * 0.11;
    const spot = () => {
      const a = r.range(0, 6.28), d = r.range(0, size * 0.62);
      return [Math.cos(a) * d, Math.sin(a) * d];
    };
    for (let k = look.trees.length && this.amb.trees !== false ? r.int(1, 1 + Math.round(size / 2)) : 0; k > 0; k--) {
      const [x, z] = spot();
      const s = r.range(0.8, 1.5);
      const trunk = new THREE.CylinderGeometry(0.12 * s, 0.17 * s, 0.7 * s, 5);
      trunk.translate(x, top + 0.35 * s, z);
      parts.push(painted(faceted(trunk), 0x5a4030));
      const crown = new THREE.ConeGeometry(0.75 * s, 1.9 * s, 6);
      crown.translate(x, top + 0.7 * s + 0.95 * s, z);
      parts.push(painted(faceted(crown), shade(r.pick(look.trees), r.range(-0.04, 0.04))));
    }
    for (let k = r.int(0, 2); k > 0; k--) {
      const [x, z] = spot();
      const s = r.range(0.3, 0.7);
      const stone = new THREE.DodecahedronGeometry(s, 0);
      stone.translate(x, top + s * 0.5, z);
      parts.push(painted(stone, shade(look.islandRock, 0.08)));
    }
    const body = new THREE.Mesh(mergeGeometries(parts), mat);
    g.add(body);
    if (this.amb.island) {
      const p = new Pieces();
      this.amb.island(p, r, size, top);
      if (p.count) g.add(this.dimmed(p, look));
    }
    if (look.crystals.length) {
      const gems: THREE.BufferGeometry[] = [];
      for (let k = r.int(1, 3); k > 0; k--) {
        const [x, z] = spot();
        const s = r.range(0.35, 0.8);
        const gem = new THREE.OctahedronGeometry(s, 0);
        gem.scale(1, 2.4, 1);
        gem.rotateZ(r.range(-0.4, 0.4));
        gem.translate(x, top + s * 1.6, z);
        gems.push(painted(gem, new THREE.Color(r.pick(look.crystals)).multiplyScalar(1.15)));
      }
      g.add(new THREE.Mesh(mergeGeometries(gems), this.glowMat));
    }
    return g;
  }

  /** Rocas sueltas y cristales gigantes a la deriva en el abismo. */
  private buildDebris(t: Terrain, look: Look, r: Rng) {
    const b = t.bounds();
    const reach = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
    const rocks: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 18; i++) {
      const a = r.range(0, 6.28), d = reach + r.range(6, 46), s = r.range(0.7, 2.6);
      const g = new THREE.DodecahedronGeometry(s, 0);
      g.scale(1, r.range(0.6, 1.2), 1);
      g.rotateX(r.range(0, 3));
      g.rotateZ(r.range(0, 3));
      g.translate(Math.cos(a) * d, -r.range(7, 26), Math.sin(a) * d * 0.85);
      rocks.push(painted(g, shade(look.islandRock, r.range(-0.04, 0.04))));
    }
    this.group.add(new THREE.Mesh(mergeGeometries(rocks), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), color: new THREE.Color().setScalar(look.dim) })));
    for (let i = 0; i < (look.crystals.length ? 12 : 0); i++) {
      const a = r.range(0, 6.28), d = reach + r.range(4, 40), s = r.range(0.8, 2.2);
      const g = new THREE.OctahedronGeometry(s, 0);
      g.scale(1, r.range(2, 3.6), 1);
      const m = new THREE.Mesh(painted(g, new THREE.Color(look.crystals[i % look.crystals.length]).multiplyScalar(1.15)), this.glowMat);
      const y = -r.range(10, 24);
      m.position.set(Math.cos(a) * d, y, Math.sin(a) * d * 0.85);
      m.rotation.z = r.range(-0.4, 0.4);
      this.group.add(m);
      this.floating.push({ o: m, y, phase: r.range(0, 6.28), amp: r.range(0.4, 0.9), spin: r.range(-0.3, 0.3) });
    }
  }

  private buildStars(r: Rng): THREE.Object3D {
    const pts = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      const a = r.range(0, 6.28), d = r.range(60, 150);
      pts[i * 3] = Math.cos(a) * d;
      pts[i * 3 + 1] = -r.range(38, 80);
      pts[i * 3 + 2] = Math.sin(a) * d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xa9c4ff, size: 0.5, toneMapped: false, fog: false }));
  }

  /** `focus` = hacia dónde mira la cámara: el domo la sigue para que nunca se le vea el borde. */
  update(dt: number, time: number, focus: THREE.Vector3) {
    this.dome.position.set(focus.x, 0, focus.z);
    for (const l of this.layers) {
      l.tex.offset.x += (dt * l.speed) / l.tile;
      l.tex.offset.y += (dt * l.speed * 0.35) / l.tile;
    }
    if (this.gridTex) this.gridTex.offset.y -= (dt * 1.6) / GRID_CELL;
    for (const f of this.floating) {
      f.o.position.y = f.y + Math.sin(time * 0.35 + f.phase) * f.amp;
      f.o.rotation.y += dt * f.spin;
    }
  }
}
