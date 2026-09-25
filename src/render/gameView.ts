// Vista 3D de la partida: escena, cámara isométrica FIJA que sigue al jugador, y traducción de eventos
// de simulación a efectos. Filosofía: cada cosa que pasa se ve (formas y colores), se siente (un
// congelado cortito en los golpes fuertes) y se escucha (audio.ts). Reglas de estilo (pedido del jugador):
//  - la cámara nunca se sacude, no hace zoom ni se corre: solo sigue a tu personaje;
//  - ningún efecto es blanco ni blanquea la pantalla: todo lleva el color de quien lo causa
//    (héroe/equipo) o del material.
import * as THREE from 'three';
import { assetTexture } from '../assets/registry';
import { CollisionWorld } from '../core/collision';
import { KILL_Y, TEAM_COLORS } from '../core/constants';
import type { SimEvent } from '../core/events';
import { HEROES } from '../core/heroes';
import type { RosterInfo } from '../core/protocol';
import { stepPickup } from '../core/sim';
import { F_DASH, F_DEAD, F_TUMBLE, type CharFrame, type WorldFrame } from '../core/snapshot';
import { Terrain } from '../core/terrain';
import { FAMILIES, FAMILY_COLORS, FAMILY_CRACK, type Family } from '../core/types';
import { BeanView } from './beanView';
import { AreasView, KothView, Particles, PROJ_COLORS, ProjectilesView } from './fx';
import { AimIndicator, type AimView } from './indicator';
import { Floaters, GlowFX, LightPool } from './juice';
import { PostFX } from './post';
import { DestructiblesView, pickupMesh, StructuresView, type PickupVis } from './propsView';
import { TerrainView } from './terrainView';
import { getTheme, type ThemeDef } from './themes';

/** Cámara: offset fijo respecto del jugador. Nada la mueve salvo seguirlo. */
const CAM_OFFSET = new THREE.Vector3(0, 26, 16);
const CAM_FOV = 38;
/** Qué tan rápido la cámara alcanza al jugador (alto = pegada, sin "flotar"). */
const CAM_FOLLOW = 12;
const MAT_ICON = ['🪨', '🔩', '💎', '🟢'];
const STAGE_TXT = ['', '¡AGRIETADO!', '¡QUEBRADO!', '¡¡DESTROZADO!!'];
const STAGE_CSS = ['#ffd23f', '#ffd23f', '#ff8a3d', '#ff3b30'];
const CONFETTI = [0xff4f8b, 0xffe14a, 0x4fd1ff, 0x7dff6a, 0xb070ff, 0xff8a3d];
const DANGER_RED = 0xff3b30;
const DUST = 0xb89a78;
const GOLD = 0xffc629;

export interface ViewOptions {
  shadows: boolean;
  pixelRatio: number;
  post: boolean;
  theme?: string;
  /** Qué dan los trozos al juntarlos (según las reglas): cambia el texto flotante. */
  pickups?: 'materials' | 'ult' | 'none';
}

/** Los textos grandes de peleas ajenas solo se muestran si pasan cerca tuyo (menos ruido). */
const TEXT_NEAR = 13;

/** Pedido de "impacto" al bucle de partida: congelar la imagen un instante (hitstop). */
export type ImpactFn = (hitstop: number) => void;

/** Congelados (hitstop) en segundos: cortitos, dan peso al golpe sin desorientar. */
const HITSTOP = { lethal: 0.08, strong: 0.045, light: 0.02, slam: 0.05, boom: 0.04 };

/** Color de cada tipo de efecto. Los golpes cuerpo a cuerpo usan el color del héroe que pega. */
const FX_COLORS: Record<string, number> = {
  ram: 0xff8a3d, slam: 0xff8a3d, quake: 0xff8a3d, shard: 0x4fd1ff, lance: 0x3fb4ff, crystal: 0x4fd1ff, nova: 0x9d7bff,
  glob: 0x7bea4f, goo: 0x7bea4f, wave: 0x4fdc4a, hook: 0xffc94a, bolt: GOLD, magnet: 0xb070ff, body: GOLD,
  metal: 0x8fa3b8, stone: 0xc9a27a, build: 0xffc94a, buildstone: 0xc9a27a, goolob: 0x7bea4f,
};
/** Efectos que toman el color del atacante (su héroe) en vez de uno fijo. */
const ATTACKER_FX = new Set(['punch', 'wrench', 'push', 'pushbig']);

export class GameView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  readonly terrain: Terrain;
  private cw: CollisionWorld;
  private terrainView: TerrainView;
  private destructs: DestructiblesView;
  private structs = new StructuresView();
  private particles = new Particles();
  private sparks = new Particles({ glow: true, hdr: 1.3, tetra: true });
  private glow = new GlowFX();
  private lights = new LightPool(4);
  private projs: ProjectilesView;
  private zones = new AreasView();
  private teles = new AreasView();
  private koth = new KothView();
  private aimInd = new AimIndicator();
  private beans = new Map<number, BeanView>();
  private pickups = new Map<number, PickupVis>();
  private focus = new THREE.Vector3();
  private time = 0;
  private labels: HTMLDivElement;
  private speedLines: HTMLDivElement;
  private floaters: Floaters;
  private post: PostFX | null = null;
  private raycaster = new THREE.Raycaster();
  private lastTiles = '';
  private lastDst = '';
  private dustT = 0;
  private danger = 0;
  private sun: THREE.DirectionalLight;
  private skyStuff: THREE.Object3D[] = [];
  private theme: ThemeDef;
  private pickupKind: 'materials' | 'ult' | 'none';
  localId = -1;
  myTeam = 0;
  /** Lo que se está apuntando (tecla mantenida), lo setea el bucle de partida cada frame. */
  aim: AimView | null = null;
  onImpact: ImpactFn = () => {};
  onLocalPickup: (sx: number, sy: number, mat: number) => void = () => {};

  constructor(private container: HTMLElement, mapId: string, private roster: RosterInfo[], localPid: string, opts: ViewOptions) {
    this.terrain = new Terrain(mapId);
    this.cw = new CollisionWorld(this.terrain);
    const def = this.terrain.def;
    const theme = getTheme(opts.theme);
    this.theme = theme;
    this.pickupKind = opts.pickups ?? 'materials';

    this.renderer = new THREE.WebGLRenderer({ antialias: !opts.post, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.pixelRatio));
    this.renderer.shadowMap.enabled = opts.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.labels = document.createElement('div');
    this.labels.className = 'labels';
    container.appendChild(this.labels);
    this.floaters = new Floaters(this.labels);
    this.speedLines = document.createElement('div');
    this.speedLines.className = 'speedlines';
    container.appendChild(this.speedLines);

    this.camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.5, 250);
    const sky = assetTexture(`sky.${theme.id}`);
    if (sky) { sky.mapping = THREE.EquirectangularReflectionMapping; this.scene.background = sky; }
    else this.scene.background = new THREE.Color(theme.sky ?? def.sky);
    this.scene.fog = new THREE.Fog(theme.fog ?? def.fog, 44, 100);

    const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemi);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(theme.sunColor, theme.sun);
    this.sun.position.set(14, 30, 12);
    this.sun.castShadow = opts.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    const ext = Math.max(this.terrain.w, this.terrain.h) * 1.15 + 4;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.terrainView = new TerrainView(this.terrain, theme);
    this.destructs = new DestructiblesView(this.terrain.destructs);
    this.projs = new ProjectilesView(this.sparks);
    this.scene.add(
      this.terrainView.group, this.destructs.group, this.structs.group, this.particles.mesh, this.sparks.mesh,
      this.glow.group, this.lights.group, this.projs.group, this.zones.group, this.teles.group, this.koth.group, this.aimInd.group,
    );
    if (!sky) this.scene.add(this.buildBackdrop(theme.fog ?? def.fog));

    for (const r of roster) {
      const isLocal = r.pid === localPid;
      if (isLocal) { this.localId = r.id; this.myTeam = r.team; }
      const b = new BeanView(r.hero, r.team, TEAM_COLORS[r.team % TEAM_COLORS.length], r.name, isLocal, r.hat);
      this.beans.set(r.id, b);
      this.scene.add(b.root, ...b.groundObjects());
      this.labels.appendChild(b.label);
    }
    const me = roster.find((r) => r.pid === localPid);
    const spawn = me ? this.terrain.spawns.team[me.team]?.[0] : null;
    if (spawn) this.focus.set(spawn.x, 0, spawn.z);

    if (opts.post) {
      try { this.post = new PostFX(this.renderer, this.scene, this.camera); } catch (e) { console.warn('[post] deshabilitado', e); this.post = null; }
    }
    this.resize();
  }

  private buildBackdrop(fog: number): THREE.Object3D {
    const g = new THREE.Group();
    // Rocas flotando en el abismo
    const mat = new THREE.MeshToonMaterial({ color: 0x5a4a60 });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const d = 38 + Math.random() * 30;
      const s = 1 + Math.random() * 3.5;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
      m.position.set(Math.cos(a) * d, -6 - Math.random() * 18, Math.sin(a) * d * 0.8);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.scale.y = 0.6 + Math.random() * 0.8;
      g.add(m);
    }
    // Cristales gigantes de color en el abismo
    const colors = this.theme.id === 'noche' ? [0x4fd1ff, 0x7dffea, 0x9ec0ff] : [0x4fd1ff, 0xff4f8b, 0xb070ff, 0x7dff6a, 0xffe14a];
    for (let i = 0; i < (this.theme.crystals ? 14 : 0); i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 30;
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.8 + Math.random() * 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[i % colors.length]).multiplyScalar(1.15), toneMapped: false }));
      c.scale.y = 2 + Math.random() * 2;
      c.position.set(Math.cos(a) * d, -10 - Math.random() * 16, Math.sin(a) * d * 0.8);
      c.rotation.z = (Math.random() - 0.5) * 0.8;
      c.userData.spin = (Math.random() - 0.5) * 0.6;
      c.userData.bob = Math.random() * 6;
      this.skyStuff.push(c);
      g.add(c);
    }
    // Estrellas (tenues y levemente azuladas)
    const pts = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 60;
      pts[i * 3] = Math.cos(a) * d;
      pts[i * 3 + 1] = -30 - Math.random() * 40;
      pts[i * 3 + 2] = Math.sin(a) * d;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xa9c4ff, size: 0.5, toneMapped: false, fog: false }));
    if (this.theme.stars) g.add(stars);
    // Brillo en el fondo del abismo
    const glow = new THREE.Mesh(new THREE.CircleGeometry(80, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(fog).multiplyScalar(1.3), transparent: true, opacity: 0.6 }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -40;
    g.add(glow);
    return g;
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  teamColor = (t: number) => TEAM_COLORS[t % TEAM_COLORS.length];

  charPos(id: number): THREE.Vector3 | null {
    const b = this.beans.get(id);
    return b && b.root.visible ? b.root.position : null;
  }

  charFamily(id: number): Family | null {
    return this.beans.get(id)?.family ?? null;
  }

  /** Color de firma del héroe de un personaje (para sus golpes). */
  private heroColor(id: number) {
    const r = this.roster.find((x) => x.id === id);
    return r ? HEROES[r.hero].color : GOLD;
  }

  /** Color de un efecto: el del héroe que pega (cuerpo a cuerpo) o el del tipo de efecto. */
  private fxColor(kind: string, attacker: number) {
    if (ATTACKER_FX.has(kind)) return kind.startsWith('push') ? this.teamColor(this.teamOf(attacker)) : this.heroColor(attacker);
    return FX_COLORS[kind] ?? PROJ_COLORS[kind] ?? (attacker >= 0 ? this.heroColor(attacker) : GOLD);
  }

  /** Coordenadas de pantalla de un punto del mundo. */
  toScreen(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const el = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
  }

  /** Punto del mundo bajo el cursor: raymarch contra el heightfield del terreno. */
  aimPoint(ndcX: number, ndcY: number, refY: number): THREE.Vector3 {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    const step = 0.25;
    for (let t = 5; t < 140; t += step) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < -4) break;
      const g = this.terrain.groundAt(x, z);
      if (g > -Infinity && y <= g) return new THREE.Vector3(x, g, z);
    }
    const k = (refY - o.y) / (d.y || -1);
    return new THREE.Vector3(o.x + d.x * k, refY, o.z + d.z * k);
  }

  flash(color: number, amount: number) { this.post?.flash(color, amount); }
  get hasPost() { return !!this.post; }
  /** Calidad automática: si la PC no da, se apaga el postproceso. */
  disablePost() {
    this.post?.dispose();
    this.post = null;
  }

  /** dt = tiempo "del mundo" (0 durante hitstop); realDt = tiempo real (cámara, postproceso). */
  render(frame: WorldFrame, dt: number, local: CharFrame | null, cursor: THREE.Vector3 | null, realDt = dt) {
    this.time += dt;
    if (frame.tiles !== this.lastTiles) { this.terrain.applyTileString(frame.tiles); this.lastTiles = frame.tiles; }
    if (frame.dst !== this.lastDst) { this.destructs.apply(frame.dst); this.lastDst = frame.dst; }
    this.terrainView.update(dt);
    this.destructs.update(dt);

    for (const c of frame.chars) {
      const b = this.beans.get(c.id);
      if (!b) continue;
      const cf = c.id === this.localId && local ? local : c;
      const dead = (cf.fl & F_DEAD) !== 0;
      const gy = dead ? -999 : this.groundBelow(cf.x, cf.y, cf.z);
      b.update(cf, dt, gy, this.time);
      if (dead) continue;
      if (cf.st >= 3 && Math.random() < dt * 10) {
        this.sparks.burst(cf.x, cf.y + 0.8, cf.z, 1, FAMILY_CRACK[b.family], { speed: 1.5, up: 2.5, size: 0.06, life: 0.5 });
      }
      const sp = Math.hypot(cf.vx, cf.vz);
      const tc = this.teamColor(this.teamOf(c.id));
      if ((cf.fl & F_TUMBLE) && sp > 7) {
        // Estela del cuerpo lanzado con el color del equipo: se ve la trayectoria del vuelo.
        this.sparks.trail(cf.x, cf.y + 0.7, cf.z, tc, 0.1 + Math.min(0.12, sp * 0.004), 0.45);
        if (sp > 16) this.particles.trail(cf.x, cf.y + 0.7, cf.z, tc, 0.14, 0.3);
      }
      if (cf.fl & F_DASH) this.sparks.trail(cf.x, cf.y + 0.5, cf.z, tc, 0.12, 0.3);
    }
    for (const s of this.skyStuff) {
      s.rotation.y += dt * s.userData.spin;
      s.position.y += Math.sin(this.time * 0.6 + s.userData.bob) * dt * 0.4;
    }
    this.structs.update(frame.structs, this.teamColor, this.time, dt);
    this.projs.update(frame.projs, (id) => this.charPos(id), this.time);
    this.zones.update(frame.zones, 'zone', this.myTeam, this.time, this.sparks);
    this.teles.update(frame.teles, 'tele', this.myTeam, this.time, this.sparks);
    this.koth.update(frame.mode.zone, this.teamColor, this.time);
    this.updatePickups(dt);
    this.particles.update(dt);
    this.sparks.update(dt);
    this.glow.update(dt);
    this.lights.update(dt);

    // Chispitas ambientales flotando desde el abismo (color del tema)
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = 0.06;
      const b = this.terrain.bounds();
      const x = b.minX + Math.random() * (b.maxX - b.minX), z = b.minZ + Math.random() * (b.maxZ - b.minZ);
      const col = this.theme.id === 'neon' ? CONFETTI[Math.floor(Math.random() * CONFETTI.length)] : this.theme.motes;
      if (Math.random() < 0.5) this.particles.burst(x, -2 - Math.random() * 6, z, 1, col, { speed: 0.2, up: 0.6, size: 0.05, life: 3, gravity: -0.1 });
      else this.sparks.burst(x, -3 - Math.random() * 4, z, 1, col, { speed: 0.1, up: 0.8, size: 0.04, life: 3, gravity: -0.3 });
    }

    // ── Cámara fija: mismo ángulo y distancia siempre; solo sigue a tu personaje ──
    const alive = local && !(local.fl & F_DEAD);
    const target = new THREE.Vector3();
    if (alive) target.set(local!.x, Math.max(0, local!.y * 0.5), local!.z);
    else target.copy(this.focus).setY(0);
    this.focus.lerp(target, 1 - Math.exp(-realDt * CAM_FOLLOW));
    this.camera.position.copy(this.focus).add(CAM_OFFSET);
    this.camera.lookAt(this.focus);
    this.sun.position.set(this.focus.x + 14, 30, this.focus.z + 12);
    this.sun.target.position.copy(this.focus);

    // Indicador de apuntado
    const from = alive ? new THREE.Vector3(local!.x, this.groundOr(local!.x, local!.z, local!.y), local!.z) : null;
    this.aimInd.update(alive ? this.aim : null, from, cursor, (x, z) => this.terrain.groundAt(x, z), this.time);

    // Peligro: bordes rojos latiendo cuando estás muy roto; líneas de velocidad cuando volás.
    const wantDanger = alive ? (local!.st >= 3 ? 0.45 : local!.st === 2 ? 0.12 : 0) : 0;
    this.danger += (wantDanger - this.danger) * Math.min(1, realDt * 4);
    const speed = alive && (local!.fl & F_TUMBLE) ? Math.hypot(local!.vx, local!.vz) : 0;
    this.speedLines.style.opacity = String(Math.min(0.7, Math.max(0, (speed - 9) / 16)));

    if (this.post) {
      this.post.danger = this.danger;
      this.post.render(realDt, this.time);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.updateLabels();
    const el = this.renderer.domElement;
    this.floaters.update(realDt, this.camera, el.clientWidth, el.clientHeight);
  }

  private groundBelow(x: number, y: number, z: number) {
    const g = this.cw.groundAt(x, z, y + 0.3);
    return g === -Infinity ? -999 : g;
  }

  private groundOr(x: number, z: number, y: number) {
    const g = this.cw.groundAt(x, z, y + 0.3);
    return g === -Infinity ? y : g;
  }

  private updateLabels() {
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    const v = new THREE.Vector3();
    for (const b of this.beans.values()) {
      if (!b.root.visible) continue;
      v.copy(b.root.position);
      v.y += 2.1;
      v.project(this.camera);
      if (v.z > 1) { b.label.style.display = 'none'; continue; }
      b.label.style.display = '';
      b.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  private updatePickups(dt: number) {
    for (const [id, p] of this.pickups) {
      p.t += dt;
      if (p.collectBy >= 0) {
        const to = this.charPos(p.collectBy);
        p.collectT += dt;
        if (to) p.pos.lerp(new THREE.Vector3(to.x, to.y + 0.8, to.z), Math.min(1, dt * 14));
        if (p.collectT > 0.18 || !to) {
          this.glow.sparkle(p.pos.x, p.pos.y, p.pos.z, FAMILY_COLORS[FAMILIES[p.mat]], 0.35);
          p.mesh.removeFromParent();
          this.pickups.delete(id);
          continue;
        }
      } else {
        const st = { pos: p.pos, vel: p.vel, grounded: p.grounded };
        stepPickup(st, this.cw);
        p.grounded = st.grounded;
        for (const b of this.beans.values()) {
          if (!b.root.visible || p.t < 0.35) continue;
          const bp = b.root.position;
          const d = Math.hypot(bp.x - p.pos.x, bp.z - p.pos.z);
          if (d < 2.2) { p.pos.x += ((bp.x - p.pos.x) / d) * 11 * dt; p.pos.z += ((bp.z - p.pos.z) / d) * 11 * dt; }
        }
        if (p.grounded && Math.random() < dt * 1.5) this.sparks.burst(p.pos.x, p.pos.y + 0.2, p.pos.z, 1, FAMILY_COLORS[FAMILIES[p.mat]], { speed: 0.3, up: 1.5, size: 0.05, life: 0.5, gravity: 0 });
        if (p.pos.y < KILL_Y || p.t > 40) { p.mesh.removeFromParent(); this.pickups.delete(id); continue; }
      }
      p.mesh.position.set(p.pos.x, p.pos.y + (p.grounded ? Math.sin(this.time * 3 + id) * 0.08 + 0.1 : 0), p.pos.z);
      p.mesh.rotation.y += dt * 2.5;
      p.mesh.rotation.x += dt * 1.3;
    }
  }

  private teamOf(id: number) { return this.roster.find((r) => r.id === id)?.team ?? 0; }

  /** Distancia de un punto a tu personaje (para no teñir tu pantalla por cosas lejanas). */
  private nearMe(x: number, z: number) {
    const p = this.charPos(this.localId);
    return p ? Math.hypot(p.x - x, p.z - z) : Infinity;
  }

  /** ¿Vale la pena mostrar un texto grande acá? Sí si te involucra o pasa cerca (o si sos espectador). */
  private worthText(x: number, z: number, ...ids: number[]) {
    const me = this.localId;
    if (me < 0 || !this.charPos(me)) return true;
    return ids.includes(me) || this.nearMe(x, z) < TEXT_NEAR;
  }

  private confetti(x: number, y: number, z: number, n: number, speed = 7, up = 10) {
    for (let i = 0; i < n; i++) this.sparks.burst(x, y, z, 1, CONFETTI[i % CONFETTI.length], { speed, up, size: 0.09, life: 1.4, gravity: 9, drag: 1.2 });
  }

  handleEvent(e: SimEvent) {
    const P = this.particles, S = this.sparks, G = this.glow, L = this.lights, F = this.floaters;
    const me = this.localId;
    switch (e.k) {
      case 'hit': {
        const col = this.fxColor(e.f, e.a);
        const p = e.p;
        const fam = this.charFamily(e.id);
        // Trozos del material de la víctima + chispas del color del que pega.
        P.burst(e.x, e.y, e.z, Math.min(18, 3 + Math.floor(p * 0.6)), fam ? FAMILY_COLORS[fam] : col, { speed: 3 + p * 0.25, up: 3.5, size: 0.1 + Math.min(0.1, p * 0.005) });
        S.burst(e.x, e.y, e.z, Math.min(14, 4 + Math.floor(p * 0.5)), col, { speed: 5 + p * 0.35, up: 3, size: 0.05 + Math.min(0.05, p * 0.003), life: 0.4, gravity: 6 });
        G.sparkle(e.x, e.y, e.z, col, 0.35 + Math.min(0.6, p * 0.022));
        if (p >= 10) {
          G.ring(e.x, e.y - 0.6, e.z, 1.4 + p * 0.07, col, 0.3);
          L.flash(e.x, e.y, e.z, col, 25 + p * 2, 10, 0.25);
        }
        this.beans.get(e.id)?.hitFlash(p);
        // Números de heat: el color es la etapa en la que quedó la víctima.
        if (e.h > 0 && this.worthText(e.x, e.z, e.a, e.id)) {
          const mine = e.a === me && me >= 0, hurt = e.id === me;
          const size = Math.min(40, 16 + e.h * 1.0 + (mine ? 5 : 0));
          F.add(e.x, e.y + 0.9, e.z, `${hurt ? '-' : '+'}${e.h}`, hurt ? 'dmg hurt' : mine ? 'dmg mine' : 'dmg', { size, color: hurt ? undefined : STAGE_CSS[e.st] });
        }
        if (e.id === me) this.post?.flash(DANGER_RED, 0.06 + Math.min(0.14, p * 0.006));
        if (e.l) {
          // Golpe letal: texto, anillo rojo y un congelado cortito. Sin zoom ni sacudón de cámara.
          if (this.worthText(e.x, e.z, e.a, e.id)) F.add(e.x, e.y + 1.8, e.z, '¡¡LETAL!!', 'big letal', { size: 48, life: 1.2, rise: 2.2 });
          G.ring(e.x, e.y - 0.6, e.z, 5, DANGER_RED, 0.5);
          G.ring(e.x, e.y - 0.6, e.z, 3, col, 0.4);
          S.burst(e.x, e.y, e.z, 18, DANGER_RED, { speed: 12, up: 4, size: 0.07, life: 0.5, gravity: 0, drag: 2 });
          L.flash(e.x, e.y, e.z, DANGER_RED, 60, 14, 0.4);
          if (e.id === me || e.a === me) this.post?.flash(e.id === me ? DANGER_RED : this.teamColor(this.myTeam), 0.22);
          if (this.worthText(e.x, e.z, e.a, e.id)) this.onImpact(HITSTOP.lethal);
        } else if (p >= 14 && this.worthText(e.x, e.z, e.a, e.id)) this.onImpact(HITSTOP.strong);
        else if (e.a === me || e.id === me) this.onImpact(HITSTOP.light);
        break;
      }
      case 'boom': {
        const col = FX_COLORS[e.c] ?? PROJ_COLORS[e.c] ?? GOLD;
        const gy = this.groundBelow(e.x, e.y, e.z);
        const y0 = gy > -100 ? gy : e.y;
        if (e.r >= 1.5) {
          const huge = e.c === 'quake' || e.c === 'nova' || e.c === 'magnet' || e.r >= 3.5;
          G.fireball(e.x, e.y, e.z, e.r, col);
          G.ring(e.x, y0, e.z, e.r * 1.1, col, 0.45);
          if (huge) G.ring(e.x, y0, e.z, e.r * 1.6, col, 0.7, 1.1);
          L.flash(e.x, e.y, e.z, col, huge ? 70 : 40, e.r * 4, 0.45);
          S.burst(e.x, e.y, e.z, Math.min(24, Math.floor(e.r * 5)), col, { speed: e.r * 3.2, up: 6, size: 0.07, life: 0.55, gravity: 8 });
          P.burst(e.x, e.y, e.z, Math.min(12, Math.floor(e.r * 3)), DUST, { speed: e.r * 0.9, up: 2.5, size: 0.18, life: 1, gravity: -1.5, drag: 2.5, grow: 1.2 });
          if (huge) {
            if (this.nearMe(e.x, e.z) < e.r + 6) this.post?.flash(col, 0.12);
            P.burst(e.x, e.y, e.z, 26, 0xc9a27a, { speed: e.r * 1.5, up: 8, size: 0.22, life: 1.1, gravity: 22 });
            if (this.worthText(e.x, e.z)) F.add(e.x, e.y + 2, e.z, e.c === 'quake' ? '¡TERREMOTO!' : e.c === 'nova' ? '¡SUPERNOVA!' : e.c === 'magnet' ? '¡IMÁN!' : '¡BOOM!', 'big boom', { size: 36, life: 1.1 });
            if (this.worthText(e.x, e.z)) this.onImpact(HITSTOP.boom);
          }
        } else {
          S.burst(e.x, e.y, e.z, 8, col, { speed: 3, up: 2, size: 0.05, life: 0.3, gravity: 4 });
          G.sparkle(e.x, e.y, e.z, col, 0.3);
        }
        break;
      }
      case 'swing': {
        const b = this.beans.get(e.id);
        const f = b?.lastFrame;
        if (!b || !f) break;
        const col = this.fxColor(e.c, e.id);
        const y = f.y + 0.78;
        if (e.c === 'punch') {
          // Gancho de boxeador: el puño hace el arco y deja una estela de su color.
          b.armMove('hook');
          const s = b.lastHand;
          G.swoosh(f.x, y, f.z, f.f, 1.25, s * 90 * DEG, -s * 15 * DEG, col, 0.28, 0.2);
        } else if (e.c === 'wrench') {
          b.armMove('wide');
          G.swoosh(f.x, y, f.z, f.f, 1.35, 105 * DEG, -85 * DEG, col, 0.24, 0.2);
        } else if (e.c === 'push' || e.c === 'pushbig') {
          // Empujón: las dos palmas y una onda en arco del color del equipo.
          b.armMove('shove');
          const big = e.c === 'pushbig';
          const half = (e.a / 2) * DEG;
          G.swoosh(f.x, y - 0.3, f.z, f.f, e.r * 0.85, half, -half, col, big ? 0.6 : 0.38, big ? 0.26 : 0.2);
          if (big) {
            G.swoosh(f.x, y - 0.3, f.z, f.f, e.r * 0.55, half * 0.8, -half * 0.8, col, 0.3, 0.2);
            const tx = f.x + Math.sin(f.f) * e.r * 0.8, tz = f.z + Math.cos(f.f) * e.r * 0.8;
            S.burst(tx, f.y + 0.7, tz, 14, col, { speed: 6, up: 2, size: 0.07, life: 0.35, gravity: 0 });
            L.flash(tx, f.y, tz, col, 30, 8, 0.2);
          }
        } else if (e.c === 'slam') {
          b.armMove('slam');
          const tx = f.x + Math.sin(f.f) * e.r * 0.8, tz = f.z + Math.cos(f.f) * e.r * 0.8;
          const half = (e.a / 2) * DEG;
          G.swoosh(f.x, f.y + 0.15, f.z, f.f, e.r, half, -half, col, e.r * 0.55, 0.28);
          P.burst(tx, f.y + 0.2, tz, 22, 0xc9a27a, { speed: 4, up: 6, size: 0.18 });
          G.ring(tx, f.y, tz, 3, col, 0.35);
        } else {
          b.armMove('hook');
        }
        break;
      }
      case 'shoot': {
        // Tiros: estocada con una mano (las torretas no mueven al dueño).
        if (e.c !== 'bolt') this.beans.get(e.id)?.armMove('throw');
        break;
      }
      case 'dash': {
        const f = this.beans.get(e.id)?.lastFrame;
        if (f) {
          const tc = this.teamColor(this.teamOf(e.id));
          G.ring(f.x, f.y, f.z, 1.3, tc, 0.25);
          S.burst(f.x, f.y + 0.4, f.z, 8, tc, { speed: 2.5, up: 0.5, size: 0.06, life: 0.3, gravity: 0 });
          P.burst(f.x, f.y + 0.05, f.z, 5, DUST, { speed: 2, up: 1, size: 0.1, life: 0.35, gravity: 2 });
        }
        break;
      }
      case 'dstage': {
        const pos = this.destructs.position(e.i);
        const kind = this.terrain.destructs[e.i]?.kind;
        if (!pos || !kind) break;
        const col = FAMILY_COLORS[kind];
        if (e.s > 0) {
          const big = e.s >= 3;
          P.burst(pos.x, pos.y + 0.7, pos.z, big ? 30 : 10, col, { speed: big ? 7 : 3.5, up: big ? 8 : 4, size: big ? 0.22 : 0.13, life: 1 });
          S.burst(pos.x, pos.y + 0.7, pos.z, big ? 14 : 5, col, { speed: big ? 6 : 3, up: 4, size: 0.06, life: 0.45 });
          if (big) {
            G.ring(pos.x, pos.y, pos.z, 2.6, col, 0.4);
            G.fireball(pos.x, pos.y + 0.7, pos.z, 1.4, col);
            L.flash(pos.x, pos.y, pos.z, col, 40, 9, 0.3);
            if (e.by === me && me >= 0) F.add(pos.x, pos.y + 1.6, pos.z, '¡DEMOLIDO!', 'big good', { size: 22, life: 0.8 });
          }
        } else {
          // Reaparece
          S.burst(pos.x, pos.y + 0.3, pos.z, 12, col, { speed: 2, up: 3, size: 0.06 });
          G.sparkle(pos.x, pos.y + 0.8, pos.z, col, 0.6);
        }
        break;
      }
      case 'tile': {
        const ci = this.terrain.fragile[e.i];
        if (ci === undefined) break;
        const b = this.terrain.cellBounds(ci);
        const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
        const y = this.terrain.cells[ci].level * 1.5;
        P.burst(x, y + 0.1, z, e.s >= 3 ? 26 : 8, 0xc9a27a, { speed: 3, up: 3, size: 0.15, spread: 1.6, life: 0.8 });
        if (e.s >= 4) { S.burst(x, y, z, 16, 0xff5030, { speed: 3, up: 5, size: 0.07, spread: 1.6 }); L.flash(x, y, z, 0xff5030, 25, 8, 0.4); }
        break;
      }
      case 'stage': {
        const pos = this.charPos(e.id);
        const fam = this.charFamily(e.id);
        if (pos && fam && e.s > 0) {
          const col = FAMILY_CRACK[fam];
          S.burst(pos.x, pos.y + 0.8, pos.z, 12 + e.s * 8, col, { speed: 4 + e.s, up: 4, size: 0.08 });
          P.burst(pos.x, pos.y + 0.8, pos.z, 6 + e.s * 4, FAMILY_COLORS[fam], { speed: 4, up: 4, size: 0.13 });
          G.ring(pos.x, pos.y + 0.1, pos.z, 1.5 + e.s * 0.5, col, 0.35);
          if (this.worthText(pos.x, pos.z, e.id)) F.add(pos.x, pos.y + 2.4, pos.z, STAGE_TXT[e.s], 'stage s' + e.s, { size: 18 + e.s * 5, life: 1.1, rise: 1 });
          if (e.id === me) this.post?.flash(DANGER_RED, 0.06 * e.s);
        }
        break;
      }
      case 'ring': {
        const tc = this.teamColor(e.tm);
        G.pillar(e.x, e.z, tc, e.last ? 60 : 42, e.last ? 3.2 : 2.2, e.last ? 1.8 : 1.3);
        G.ring(e.x, 0, e.z, 7, tc, 0.8);
        G.ring(e.x, 0, e.z, 4, tc, 0.5, 1.35);
        L.flash(e.x, 0, e.z, tc, 120, 30, 0.8);
        this.confetti(e.x, 0.5, e.z, e.last ? 80 : 50, 9, 16);
        S.burst(e.x, -2, e.z, 36, tc, { speed: 8, up: 18, size: 0.12, life: 1.2, gravity: 10 });
        F.add(e.x, 1.5, e.z, e.last ? '¡ELIMINADO!' : '¡RING-OUT!', 'big ring', { size: e.last ? 52 : 44, life: 1.5, rise: 3 });
        if (e.id === me) this.post?.flash(DANGER_RED, 0.25);
        else if (this.nearMe(e.x, e.z) < 16) this.post?.flash(tc, 0.12);
        break;
      }
      case 'jump': {
        const f = this.beans.get(e.id)?.lastFrame;
        if (f) {
          if (e.air) {
            const tc = this.teamColor(this.teamOf(e.id));
            G.ring(f.x, f.y - 0.3, f.z, 1.2, tc, 0.3);
            S.burst(f.x, f.y, f.z, 8, tc, { speed: 2.5, up: -1, size: 0.05, life: 0.3, gravity: 0 });
          } else P.burst(f.x, f.y + 0.05, f.z, 6, DUST, { speed: 2, up: 1, size: 0.1, life: 0.4, gravity: 2 });
        }
        break;
      }
      case 'land': {
        const f = this.beans.get(e.id)?.lastFrame;
        if (f) {
          P.burst(f.x, f.y + 0.05, f.z, Math.min(22, 4 + Math.floor(e.p / 2)), DUST, { speed: 2 + e.p * 0.12, up: 1.5, size: 0.12, life: 0.5, gravity: 3 });
          if (e.p > 14) G.ring(f.x, f.y, f.z, 2.2, DUST, 0.35, 1);
        }
        break;
      }
      case 'slam': {
        const fam = this.charFamily(e.id);
        const col = FX_COLORS.slam;
        S.burst(e.x, e.y, e.z, 14, col, { speed: 7, up: 4, size: 0.06, life: 0.35 });
        if (fam) P.burst(e.x, e.y, e.z, 14, FAMILY_COLORS[fam], { speed: 4, up: 4, size: 0.14 });
        G.sparkle(e.x, e.y, e.z, col, 1);
        G.ring(e.x, e.y - 0.6, e.z, 2.4, col, 0.3);
        L.flash(e.x, e.y, e.z, col, 40, 10, 0.3);
        this.beans.get(e.id)?.hitFlash(e.p);
        if (this.worthText(e.x, e.z, e.id)) F.add(e.x, e.y + 1.2, e.z, `¡PAF! +${e.h}`, 'big slam', { size: 28, life: 1 });
        if (this.worthText(e.x, e.z, e.id)) this.onImpact(HITSTOP.slam);
        break;
      }
      case 'body': {
        S.burst(e.x, e.y, e.z, 14, GOLD, { speed: 8, up: 3, size: 0.06, life: 0.4 });
        G.ring(e.x, e.y - 0.7, e.z, 2.8, GOLD, 0.35);
        G.sparkle(e.x, e.y, e.z, GOLD, 1.1);
        L.flash(e.x, e.y, e.z, GOLD, 50, 12, 0.35);
        if (e.a >= 0 && this.worthText(e.x, e.z, e.a, e.id)) F.add(e.x, e.y + 1.6, e.z, '¡CARAMBOLA!', 'big billar', { size: 34, life: 1.2 });
        if (this.worthText(e.x, e.z, e.a, e.id)) this.onImpact(HITSTOP.strong);
        break;
      }
      case 'lvl': {
        const pos = this.charPos(e.id);
        if (pos) {
          this.confetti(pos.x, pos.y + 1, pos.z, 30, 3, 8);
          G.beam(pos.x, pos.y, pos.z, 0xffe14a);
          G.ring(pos.x, pos.y, pos.z, 2.4, 0xffe14a, 0.6);
          if (e.id !== me) F.add(pos.x, pos.y + 2.6, pos.z, `NIVEL ${e.l}`, 'big lvl', { size: 20, life: 1.2 });
        }
        break;
      }
      case 'pspawn': {
        for (const a of e.l) {
          const [id, mat, x, y, z, vx, vy, vz] = a;
          const mesh = pickupMesh(mat);
          mesh.position.set(x, y, z);
          this.scene.add(mesh);
          this.pickups.set(id, { id, mat, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(vx, vy, vz), grounded: false, mesh, t: 0, collectBy: -1, collectT: 0 });
        }
        break;
      }
      case 'pick': {
        const p = this.pickups.get(e.i);
        if (p) p.collectBy = e.id;
        if (e.id === me) {
          const pos = p ? p.pos : this.charPos(e.id);
          if (pos) {
            F.add(pos.x, pos.y + 0.8, pos.z, this.pickupKind === 'ult' ? '+⚡' : `+1 ${MAT_ICON[e.m]}`, 'mat', { size: 18, life: 0.7, rise: 1.2 });
            const s = this.toScreen(pos.x, pos.y + 0.5, pos.z);
            this.onLocalPickup(s.x, s.y, e.m);
          }
        }
        break;
      }
      case 'pdel': {
        const p = this.pickups.get(e.i);
        if (p) { p.mesh.removeFromParent(); this.pickups.delete(e.i); }
        break;
      }
      case 'craft': case 'repair': case 'shield': {
        const pos = this.charPos(e.id);
        if (pos) {
          const col = e.k === 'repair' ? 0x7dffa0 : e.k === 'shield' ? 0x4fd1ff : 0xffe14a;
          S.burst(pos.x, pos.y + 0.8, pos.z, 22, col, { speed: 2, up: 5, size: 0.07, life: 0.9, gravity: 1 });
          G.ring(pos.x, pos.y, pos.z, 1.6, col, 0.45);
          if (e.k === 'craft') G.beam(pos.x, pos.y, pos.z, col);
          if (e.k === 'repair' && e.id === me) F.add(pos.x, pos.y + 2, pos.z, 'REPARADO', 'big good', { size: 24 });
        }
        break;
      }
      case 'burst': {
        const pos = this.charPos(e.id);
        if (pos) {
          const col = FAMILY_CRACK.crystal;
          G.fireball(pos.x, pos.y + 0.8, pos.z, 3.6, col);
          S.burst(pos.x, pos.y + 0.8, pos.z, 24, 0x4fd1ff, { speed: 10, up: 5, size: 0.07, life: 0.6 });
          L.flash(pos.x, pos.y, pos.z, col, 60, 14, 0.4);
          if (this.worthText(pos.x, pos.z, e.id)) F.add(pos.x, pos.y + 2.2, pos.z, '¡ESTALLIDO!', 'big boom', { size: 32 });
        }
        break;
      }
      case 'spawn': {
        const f = this.beans.get(e.id);
        if (f) {
          const pos = f.root.position;
          const tc = this.teamColor(this.teamOf(e.id));
          G.beam(pos.x, 0, pos.z, tc);
          G.ring(pos.x, 0, pos.z, 2, tc, 0.6);
        }
        break;
      }
      case 'blink': {
        for (const [x, z] of [[e.x, e.z], [e.x2, e.z2]]) {
          S.burst(x, 1, z, 22, 0x4fd1ff, { speed: 3.5, up: 2, size: 0.07 });
          G.sparkle(x, 1, z, 0x9d7bff, 0.9);
        }
        L.flash(e.x2, 1, e.z2, 0x4fd1ff, 30, 8, 0.25);
        break;
      }
      case 'bounce': {
        const f = this.beans.get(e.id)?.lastFrame;
        if (f) { S.burst(f.x, f.y + 0.6, f.z, 12, 0x9cf57a, { speed: 3.5, up: 2, size: 0.07 }); G.ring(f.x, f.y + 0.3, f.z, 1.3, 0x9cf57a, 0.25); }
        break;
      }
      case 'save': {
        const pos = this.charPos(e.id);
        if (pos) {
          if (this.worthText(pos.x, pos.z, e.id)) F.add(pos.x, pos.y + 2.2, pos.z, '¡SALVADA!', 'big save', { size: 36, life: 1.4 });
          G.ring(pos.x, pos.y, pos.z, 3, 0x4fd1ff, 0.6);
          this.confetti(pos.x, pos.y + 1, pos.z, 26, 4, 7);
        }
        break;
      }
    }
  }

  /** Posición para el audio posicional. */
  eventPos(e: SimEvent): { x: number; z: number } | null {
    if ('x' in e && typeof (e as any).x === 'number' && 'z' in e) return { x: (e as any).x, z: (e as any).z };
    if ('id' in e) {
      const p = this.charPos((e as any).id);
      if (p) return { x: p.x, z: p.z };
    }
    if (e.k === 'dstage') {
      const p = this.destructs.position(e.i);
      if (p) return { x: p.x, z: p.z };
    }
    return null;
  }

  listener() { return this.focus; }

  dispose() {
    for (const b of this.beans.values()) b.dispose();
    this.beans.clear();
    for (const p of this.pickups.values()) p.mesh.removeFromParent();
    this.pickups.clear();
    this.floaters.clear();
    this.post?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels.remove();
    this.speedLines.remove();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

const DEG = Math.PI / 180;
