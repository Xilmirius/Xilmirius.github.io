// Vista 3D de la partida: escena, cámara isométrica que sigue al jugador (Shift la corre hacia el cursor),
// y traducción de eventos de simulación a efectos. Filosofía "casino visual": cada cosa que pasa
// se ve (partículas, luces, números), se siente (cámara, hitstop, destellos) y se escucha (audio.ts).
import * as THREE from 'three';
import { CollisionWorld } from '../core/collision';
import { KILL_Y, TEAM_COLORS } from '../core/constants';
import type { SimEvent } from '../core/events';
import type { RosterInfo } from '../core/protocol';
import { stepPickup } from '../core/sim';
import { F_DEAD, F_TUMBLE, type CharFrame, type WorldFrame } from '../core/snapshot';
import { Terrain } from '../core/terrain';
import { FAMILIES, FAMILY_COLORS, FAMILY_CRACK, type Family } from '../core/types';
import { BeanView } from './beanView';
import { AreasView, KothView, Particles, ProjectilesView, Waves } from './fx';
import { Floaters, GlowFX, LightPool } from './juice';
import { PostFX } from './post';
import { DestructiblesView, pickupMesh, StructuresView, type PickupVis } from './propsView';
import { TerrainView } from './terrainView';
import { getTheme, type ThemeDef } from './themes';

const CAM_OFFSET = new THREE.Vector3(0, 26, 16);
const BASE_FOV = 38;
const MAT_ICON = ['🪨', '🔩', '💎', '🟢'];
const STAGE_TXT = ['', '¡AGRIETADO!', '¡QUEBRADO!', '¡¡DESTROZADO!!'];
const STAGE_CSS = ['#ffffff', '#ffd23f', '#ff8a3d', '#ff3b30'];
const CONFETTI = [0xff4f8b, 0xffe14a, 0x4fd1ff, 0x7dff6a, 0xb070ff, 0xff8a3d];

export interface ViewOptions {
  shadows: boolean;
  pixelRatio: number;
  post: boolean;
  theme?: string;
}

/** Pedido de "impacto" al bucle de partida: congelar la imagen y/o cámara lenta. */
export type ImpactFn = (hitstop: number, slowScale?: number, slowDur?: number) => void;

const FX_COLORS: Record<string, number> = {
  punch: 0xffe0b0, wrench: 0xffd23f, push: 0xffffff, pushbig: 0xfff0a0, ram: 0xff8a3d, slam: 0xc9a27a, quake: 0xff8a3d,
  shard: 0x9ff0ff, lance: 0xd8fbff, crystal: 0x9ff0ff, nova: 0xaef4ff, glob: 0x7bea4f, goo: 0x7bea4f, wave: 0x9cf57a,
  hook: 0xc9d3dd, bolt: 0xffd23f, magnet: 0xb070ff, body: 0xfff0a0, metal: 0xc9d3dd, stone: 0xb0a090, build: 0xffc94a, buildstone: 0xb0a090,
};

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
  private sparks = new Particles({ additive: true, hdr: 1.7, tetra: true });
  private waves = new Waves();
  private glow = new GlowFX();
  private lights = new LightPool(4);
  private projs: ProjectilesView;
  private zones = new AreasView();
  private teles = new AreasView();
  private koth = new KothView();
  private beans = new Map<number, BeanView>();
  private pickups = new Map<number, PickupVis>();
  private focus = new THREE.Vector3();
  private shake = 0;
  private kick = new THREE.Vector3();
  private fovPunch = 0;
  private punch: { x: number; z: number; t: number; dur: number } | null = null;
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
  localId = -1;
  myTeam = 0;
  onImpact: ImpactFn = () => {};
  onLocalPickup: (sx: number, sy: number, mat: number) => void = () => {};

  constructor(private container: HTMLElement, mapId: string, private roster: RosterInfo[], localPid: string, opts: ViewOptions) {
    this.terrain = new Terrain(mapId);
    this.cw = new CollisionWorld(this.terrain);
    const def = this.terrain.def;
    const theme = getTheme(opts.theme);
    this.theme = theme;

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

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.5, 250);
    this.scene.background = new THREE.Color(theme.sky ?? def.sky);
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
      this.terrainView.group, this.destructs.group, this.structs.group, this.particles.mesh, this.sparks.mesh, this.waves.group,
      this.glow.group, this.lights.group, this.projs.group, this.zones.group, this.teles.group, this.koth.group,
    );
    this.scene.add(this.buildBackdrop(theme.fog ?? def.fog));

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
    // Cristales gigantes brillando en el abismo (con el bloom parecen luces de show)
    const colors = this.theme.id === 'noche' ? [0x4fd1ff, 0x7dffea, 0x9ec0ff] : [0x4fd1ff, 0xff4f8b, 0xb070ff, 0x7dff6a, 0xffe14a];
    for (let i = 0; i < (this.theme.crystals ? 14 : 0); i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 30;
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.8 + Math.random() * 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[i % colors.length]).multiplyScalar(2), toneMapped: false }));
      c.scale.y = 2 + Math.random() * 2;
      c.position.set(Math.cos(a) * d, -10 - Math.random() * 16, Math.sin(a) * d * 0.8);
      c.rotation.z = (Math.random() - 0.5) * 0.8;
      c.userData.spin = (Math.random() - 0.5) * 0.6;
      c.userData.bob = Math.random() * 6;
      this.skyStuff.push(c);
      g.add(c);
    }
    // Estrellas
    const pts = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 60;
      pts[i * 3] = Math.cos(a) * d;
      pts[i * 3 + 1] = -30 - Math.random() * 40;
      pts[i * 3 + 2] = Math.sin(a) * d;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.6), size: 0.5, toneMapped: false, fog: false }));
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

  addShake(a: number) { this.shake = Math.min(1.4, this.shake + a); }
  flash(color: number, amount: number) { this.post?.flash(color, amount); }
  get hasPost() { return !!this.post; }
  /** Calidad automática: si la PC no da, se apaga el postproceso. */
  disablePost() {
    this.post?.dispose();
    this.post = null;
  }
  private addKick(dx: number, dz: number, a: number) { this.kick.x += dx * a; this.kick.z += dz * a; }

  /** dt = tiempo "del mundo" (0 durante hitstop); realDt = tiempo real (cámara, postproceso). */
  render(frame: WorldFrame, dt: number, local: CharFrame | null, cursor: THREE.Vector3 | null, shift: boolean, realDt = dt) {
    this.time += dt;
    if (frame.tiles !== this.lastTiles) { this.terrain.applyTileString(frame.tiles); this.lastTiles = frame.tiles; }
    if (frame.dst !== this.lastDst) { this.destructs.apply(frame.dst); this.lastDst = frame.dst; }
    this.terrainView.update(dt);
    this.destructs.update(dt);

    for (const c of frame.chars) {
      const b = this.beans.get(c.id);
      if (!b) continue;
      const cf = c.id === this.localId && local ? local : c;
      const gy = (cf.fl & F_DEAD) ? -999 : this.groundBelow(cf.x, cf.y, cf.z);
      b.update(cf, dt, gy, this.time);
      if (cf.st >= 3 && !(cf.fl & F_DEAD) && Math.random() < dt * 10) {
        this.sparks.burst(cf.x, cf.y + 0.8, cf.z, 1, FAMILY_CRACK[b.family], { speed: 1.5, up: 2.5, size: 0.06, life: 0.5 });
      }
      const sp = Math.hypot(cf.vx, cf.vz);
      if ((cf.fl & F_TUMBLE) && sp > 7 && !(cf.fl & F_DEAD)) {
        // Estela del cuerpo lanzado con el color del equipo: se ve la trayectoria del vuelo.
        const col = this.teamColor(this.roster.find((r) => r.id === c.id)?.team ?? 0);
        this.sparks.trail(cf.x, cf.y + 0.7, cf.z, col, 0.1 + Math.min(0.12, sp * 0.004), 0.45);
        if (sp > 16) this.particles.trail(cf.x, cf.y + 0.7, cf.z, 0xffffff, 0.14, 0.3);
      }
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
    this.waves.update(dt);
    this.glow.update(dt);
    this.lights.update(dt);

    // Polvo y chispas ambientales flotando desde el abismo
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = 0.06;
      const b = this.terrain.bounds();
      const x = b.minX + Math.random() * (b.maxX - b.minX), z = b.minZ + Math.random() * (b.maxZ - b.minZ);
      if (Math.random() < 0.5) this.particles.burst(x, -2 - Math.random() * 6, z, 1, 0xffe6c0, { speed: 0.2, up: 0.6, size: 0.05, life: 3, gravity: -0.1 });
      else this.sparks.burst(x, -3 - Math.random() * 4, z, 1, this.theme.id === 'neon' ? CONFETTI[Math.floor(Math.random() * CONFETTI.length)] : this.theme.motes, { speed: 0.1, up: 0.8, size: 0.04, life: 3, gravity: -0.3 });
    }

    // ── Cámara ──
    const target = new THREE.Vector3();
    const alive = local && !(local.fl & F_DEAD);
    if (alive) target.set(local!.x, Math.max(0, local!.y * 0.5), local!.z);
    else target.copy(this.focus).setY(0);
    if (shift && cursor && alive) {
      const off = new THREE.Vector3(cursor.x - local!.x, 0, cursor.z - local!.z);
      const l = off.length();
      if (l > 10) off.multiplyScalar(10 / l);
      target.add(off.multiplyScalar(0.8));
    }
    if (this.punch) {
      this.punch.t += realDt;
      const k = Math.sin(Math.min(1, this.punch.t / this.punch.dur) * Math.PI);
      target.lerp(new THREE.Vector3(this.punch.x, 0, this.punch.z), 0.55 * k);
      if (this.punch.t >= this.punch.dur) this.punch = null;
    }
    this.focus.lerp(target, 1 - Math.exp(-realDt * 7));
    this.camera.position.copy(this.focus).add(CAM_OFFSET);
    this.kick.multiplyScalar(Math.exp(-realDt * 9));
    this.camera.position.add(this.kick);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - realDt * 2.5);
      const s = this.shake * this.shake * 0.9;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.focus.clone().add(new THREE.Vector3(this.kick.x * 0.5, 0, this.kick.z * 0.5)));
    this.fovPunch *= Math.exp(-realDt * 6);
    const fov = BASE_FOV - this.fovPunch + (local && (local.fl & 64) ? -local.ch * 2.5 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.sun.position.set(this.focus.x + 14, 30, this.focus.z + 12);
    this.sun.target.position.copy(this.focus);

    // Peligro: bordes rojos latiendo cuando estás muy roto; líneas de velocidad cuando volás.
    const wantDanger = alive ? (local!.st >= 3 ? 0.6 : local!.st === 2 ? 0.18 : 0) : 0;
    this.danger += (wantDanger - this.danger) * Math.min(1, realDt * 4);
    const speed = alive && (local!.fl & F_TUMBLE) ? Math.hypot(local!.vx, local!.vz) : 0;
    this.speedLines.style.opacity = String(Math.min(0.85, Math.max(0, (speed - 9) / 16)));

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

  private confetti(x: number, y: number, z: number, n: number, speed = 7, up = 10) {
    for (let i = 0; i < n; i++) this.sparks.burst(x, y, z, 1, CONFETTI[i % CONFETTI.length], { speed, up, size: 0.09, life: 1.4, gravity: 9, drag: 1.2 });
  }

  handleEvent(e: SimEvent) {
    const P = this.particles, S = this.sparks, G = this.glow, L = this.lights, F = this.floaters;
    const me = this.localId;
    switch (e.k) {
      case 'hit': {
        const col = FX_COLORS[e.f] ?? 0xffffff;
        const p = e.p;
        const fam = this.charFamily(e.id);
        P.burst(e.x, e.y, e.z, Math.min(18, 3 + Math.floor(p * 0.6)), fam ? FAMILY_COLORS[fam] : col, { speed: 3 + p * 0.25, up: 3.5, size: 0.1 + Math.min(0.1, p * 0.005) });
        S.burst(e.x, e.y, e.z, Math.min(14, 4 + Math.floor(p * 0.5)), col, { speed: 5 + p * 0.35, up: 3, size: 0.05 + Math.min(0.05, p * 0.003), life: 0.4, gravity: 6 });
        G.sparkle(e.x, e.y, e.z, col, 0.35 + Math.min(0.7, p * 0.025));
        if (p >= 10) {
          G.ring(e.x, e.y - 0.6, e.z, 1.4 + p * 0.07, 0xffffff, 0.3, 2.5);
          L.flash(e.x, e.y, e.z, col, 25 + p * 2, 10, 0.25);
        }
        this.beans.get(e.id)?.hitFlash(p);
        // Números de daño (heat sumado): el color es la etapa en la que quedó.
        if (e.h > 0) {
          const mine = e.a === me && me >= 0, hurt = e.id === me;
          const size = Math.min(46, 16 + e.h * 1.1 + (mine ? 6 : 0));
          F.add(e.x, e.y + 0.9, e.z, `${hurt ? '-' : '+'}${e.h}`, hurt ? 'dmg hurt' : mine ? 'dmg mine' : 'dmg', { size, color: hurt ? undefined : STAGE_CSS[e.st] });
        }
        if (e.id === me) {
          this.addShake(0.25 + Math.min(0.7, p * 0.025));
          this.addKick(e.dx, e.dz, 0.25 + p * 0.03);
          this.post?.flash(0xff2020, 0.12 + Math.min(0.3, p * 0.01));
          this.post?.aberration(0.004 + p * 0.0004);
        } else if (e.a === me) {
          this.addShake(0.08 + Math.min(0.3, p * 0.012));
          this.post?.aberration(0.002 + p * 0.0002);
        } else if (p > 15) this.addShake(0.15);
        if (e.l) {
          // ¡GOLPE LETAL! Zoom, congelado, cámara lenta, destello blanco: el momento Smash.
          F.add(e.x, e.y + 1.8, e.z, '¡¡LETAL!!', 'big letal', { size: 54, life: 1.3, rise: 2.5 });
          G.fireball(e.x, e.y, e.z, 2.2, 0xffffff);
          G.ring(e.x, e.y - 0.6, e.z, 6, col, 0.5, 4);
          L.flash(e.x, e.y, e.z, 0xffffff, 120, 18, 0.45);
          S.burst(e.x, e.y, e.z, 20, 0xffffff, { speed: 14, up: 4, size: 0.07, life: 0.5, gravity: 0, drag: 2 });
          this.post?.flash(0xffffff, 0.45);
          this.post?.aberration(0.025);
          this.post?.zoomBlur(0.6);
          this.fovPunch = 7;
          this.punch = { x: e.x, z: e.z, t: 0, dur: 0.9 };
          this.addShake(0.6);
          this.onImpact(0.2, 0.3, 0.55);
        } else if (p >= 14) {
          this.fovPunch = Math.max(this.fovPunch, 2 + p * 0.08);
          this.onImpact(Math.min(0.1, 0.03 + p * 0.002));
        } else if (e.a === me || e.id === me) {
          this.onImpact(0.025);
        }
        break;
      }
      case 'boom': {
        const col = FX_COLORS[e.c] ?? 0xffffff;
        const gy = this.groundBelow(e.x, e.y, e.z);
        const y0 = gy > -100 ? gy : e.y;
        if (e.r >= 1.5) {
          const huge = e.c === 'quake' || e.c === 'nova' || e.c === 'magnet' || e.r >= 3.5;
          G.fireball(e.x, e.y, e.z, e.r, col);
          G.ring(e.x, y0, e.z, e.r * 1.1, col, 0.45, 3);
          if (huge) G.ring(e.x, y0, e.z, e.r * 1.8, 0xffffff, 0.7, 2);
          L.flash(e.x, e.y, e.z, col, huge ? 90 : 45, e.r * 4, 0.45);
          S.burst(e.x, e.y, e.z, Math.min(26, Math.floor(e.r * 6)), col, { speed: e.r * 3.2, up: 6, size: 0.07, life: 0.55, gravity: 8 });
          P.burst(e.x, e.y, e.z, Math.min(12, Math.floor(e.r * 3)), 0xd8cfe0, { speed: e.r * 0.9, up: 2.5, size: 0.18, life: 1, gravity: -1.5, drag: 2.5, grow: 1.2 });
          if (huge) {
            this.addShake(0.6);
            this.post?.flash(col, 0.35);
            this.post?.aberration(0.012);
            this.fovPunch = Math.max(this.fovPunch, 4);
            P.burst(e.x, e.y, e.z, 30, 0xc9a27a, { speed: e.r * 1.5, up: 8, size: 0.22, life: 1.1, gravity: 22 });
            F.add(e.x, e.y + 2, e.z, e.c === 'quake' ? '¡TERREMOTO!' : e.c === 'nova' ? '¡SUPERNOVA!' : e.c === 'magnet' ? '¡IMÁN!' : '¡BOOM!', 'big boom', { size: 40, life: 1.1 });
            this.onImpact(0.06);
          } else this.addShake(0.2);
        } else {
          S.burst(e.x, e.y, e.z, 8, col, { speed: 3, up: 2, size: 0.05, life: 0.3, gravity: 4 });
          G.sparkle(e.x, e.y, e.z, col, 0.3);
        }
        break;
      }
      case 'swing': {
        const b = this.beans.get(e.id);
        const f = b?.lastFrame;
        if (b && f) {
          const big = e.c === 'pushbig';
          const col = big ? 0xfff0a0 : e.c === 'slam' ? 0xffb070 : 0xffffff;
          this.waves.arc(f.x, f.y, f.z, f.f, e.r, e.a, col);
          const tx = f.x + Math.sin(f.f) * e.r * 0.8, tz = f.z + Math.cos(f.f) * e.r * 0.8;
          if (big) {
            G.ring(tx, f.y + 0.2, tz, 2.2, 0xfff0a0, 0.3, 3);
            S.burst(tx, f.y + 0.7, tz, 18, 0xfff0a0, { speed: 6, up: 2, size: 0.07, life: 0.35, gravity: 0 });
            L.flash(tx, f.y, tz, 0xfff0a0, 30, 8, 0.2);
            if (e.id === me) { this.addKick(Math.sin(f.f), Math.cos(f.f), -0.4); this.fovPunch = Math.max(this.fovPunch, 3); }
          }
          if (e.c === 'slam') {
            P.burst(tx, f.y + 0.2, tz, 22, 0xc9a27a, { speed: 4, up: 6, size: 0.18 });
            G.ring(tx, f.y, tz, 3, 0xffb070, 0.35);
            if (e.id === me) this.addShake(0.3);
          }
        }
        break;
      }
      case 'dstage': {
        const pos = this.destructs.position(e.i);
        const kind = this.terrain.destructs[e.i]?.kind;
        if (pos && kind && e.s > 0) {
          const big = e.s >= 3;
          const col = FAMILY_COLORS[kind];
          P.burst(pos.x, pos.y + 0.7, pos.z, big ? 30 : 10, col, { speed: big ? 7 : 3.5, up: big ? 8 : 4, size: big ? 0.22 : 0.13, life: 1 });
          S.burst(pos.x, pos.y + 0.7, pos.z, big ? 14 : 5, col, { speed: big ? 6 : 3, up: 4, size: 0.06, life: 0.45 });
          if (big) {
            G.ring(pos.x, pos.y, pos.z, 2.6, col, 0.4, 3);
            G.fireball(pos.x, pos.y + 0.7, pos.z, 1.4, col);
            L.flash(pos.x, pos.y, pos.z, col, 40, 9, 0.3);
            if (e.by === me && me >= 0) { F.add(pos.x, pos.y + 1.6, pos.z, '¡DEMOLIDO!', 'big good', { size: 26, life: 0.9 }); this.addShake(0.15); }
          }
        } else if (pos && e.s === 0) {
          S.burst(pos.x, pos.y + 0.3, pos.z, 14, 0xffffff, { speed: 2, up: 3, size: 0.06 });
          G.sparkle(pos.x, pos.y + 0.8, pos.z, 0xffffff, 0.6);
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
          G.ring(pos.x, pos.y + 0.1, pos.z, 1.5 + e.s * 0.5, col, 0.35, 3);
          F.add(pos.x, pos.y + 2.4, pos.z, STAGE_TXT[e.s], 'stage s' + e.s, { size: 18 + e.s * 5, life: 1.1, rise: 1 });
          if (e.id === me) this.post?.flash(0xff3020, 0.15 * e.s);
        }
        break;
      }
      case 'ring': {
        const tc = this.teamColor(e.tm);
        const y = -2;
        G.pillar(e.x, e.z, tc, e.last ? 60 : 42, e.last ? 3.2 : 2.2, e.last ? 1.8 : 1.3);
        G.ring(e.x, 0, e.z, 7, tc, 0.8, 3);
        G.ring(e.x, 0, e.z, 4, 0xffffff, 0.5, 4);
        L.flash(e.x, 0, e.z, tc, 150, 30, 0.8);
        this.confetti(e.x, 0.5, e.z, e.last ? 90 : 55, 9, 16);
        S.burst(e.x, y, e.z, 40, 0xffffff, { speed: 8, up: 18, size: 0.12, life: 1.2, gravity: 10 });
        F.add(e.x, 1.5, e.z, e.last ? '¡ELIMINADO!' : '¡RING-OUT!', 'big ring', { size: e.last ? 56 : 46, life: 1.5, rise: 3 });
        this.addShake(e.last ? 1 : 0.6);
        this.post?.flash(tc, e.last ? 0.6 : 0.35);
        this.post?.aberration(0.01);
        if (e.id === me) this.post?.flash(0xffffff, 0.5);
        break;
      }
      case 'jump': {
        const f = this.beans.get(e.id)?.lastFrame;
        if (f) {
          if (e.air) { G.ring(f.x, f.y - 0.3, f.z, 1.2, 0xffffff, 0.3, 2); S.burst(f.x, f.y, f.z, 8, 0xffffff, { speed: 2.5, up: -1, size: 0.05, life: 0.3, gravity: 0 }); }
          else P.burst(f.x, f.y + 0.05, f.z, 6, 0xe8d8c0, { speed: 2, up: 1, size: 0.1, life: 0.4, gravity: 2 });
        }
        break;
      }
      case 'land': {
        const f = this.beans.get(e.id)?.lastFrame;
        if (f) {
          P.burst(f.x, f.y + 0.05, f.z, Math.min(22, 4 + Math.floor(e.p / 2)), 0xe8d8c0, { speed: 2 + e.p * 0.12, up: 1.5, size: 0.12, life: 0.5, gravity: 3 });
          if (e.p > 14) {
            G.ring(f.x, f.y, f.z, 2.2, 0xe8d8c0, 0.35, 1.5);
            if (e.id === me) { this.addShake(0.3); this.fovPunch = Math.max(this.fovPunch, 2); }
          }
        }
        break;
      }
      case 'slam': {
        const fam = this.charFamily(e.id);
        S.burst(e.x, e.y, e.z, 14, 0xffffff, { speed: 7, up: 4, size: 0.06, life: 0.35 });
        if (fam) P.burst(e.x, e.y, e.z, 14, FAMILY_COLORS[fam], { speed: 4, up: 4, size: 0.14 });
        G.sparkle(e.x, e.y, e.z, 0xffffff, 1.1);
        G.ring(e.x, e.y - 0.6, e.z, 2.4, 0xffffff, 0.3, 3);
        L.flash(e.x, e.y, e.z, 0xffffff, 50, 10, 0.3);
        this.beans.get(e.id)?.hitFlash(e.p);
        F.add(e.x, e.y + 1.2, e.z, `¡PAF! +${e.h}`, 'big slam', { size: 30, life: 1 });
        this.addShake(e.id === me ? 0.7 : 0.3);
        this.onImpact(0.07);
        break;
      }
      case 'body': {
        S.burst(e.x, e.y, e.z, 14, 0xfff0a0, { speed: 8, up: 3, size: 0.06, life: 0.4 });
        G.ring(e.x, e.y - 0.7, e.z, 2.8, 0xfff0a0, 0.35, 3);
        G.sparkle(e.x, e.y, e.z, 0xfff0a0, 1.2);
        L.flash(e.x, e.y, e.z, 0xfff0a0, 60, 12, 0.35);
        if (e.a >= 0) F.add(e.x, e.y + 1.6, e.z, '¡CARAMBOLA!', 'big billar', { size: 36, life: 1.2 });
        this.addShake(0.35);
        this.onImpact(0.08);
        break;
      }
      case 'lvl': {
        const pos = this.charPos(e.id);
        if (pos) {
          this.confetti(pos.x, pos.y + 1, pos.z, 30, 3, 8);
          G.beam(pos.x, pos.y, pos.z, 0xffe14a);
          G.ring(pos.x, pos.y, pos.z, 2.4, 0xffe14a, 0.6, 3);
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
            F.add(pos.x, pos.y + 0.8, pos.z, `+1 ${MAT_ICON[e.m]}`, 'mat', { size: 18, life: 0.7, rise: 1.2 });
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
          const col = e.k === 'repair' ? 0x7dffa0 : e.k === 'shield' ? 0x9ff7ff : 0xffe14a;
          S.burst(pos.x, pos.y + 0.8, pos.z, 22, col, { speed: 2, up: 5, size: 0.07, life: 0.9, gravity: 1 });
          G.ring(pos.x, pos.y, pos.z, 1.6, col, 0.45, 3);
          if (e.k === 'craft') G.beam(pos.x, pos.y, pos.z, col);
          if (e.k === 'repair' && e.id === me) F.add(pos.x, pos.y + 2, pos.z, 'REPARADO', 'big good', { size: 24 });
        }
        break;
      }
      case 'burst': {
        const pos = this.charPos(e.id);
        if (pos) {
          G.fireball(pos.x, pos.y + 0.8, pos.z, 3.6, 0xcff8ff);
          S.burst(pos.x, pos.y + 0.8, pos.z, 24, 0xcff8ff, { speed: 10, up: 5, size: 0.07, life: 0.6 });
          L.flash(pos.x, pos.y, pos.z, 0x9ff0ff, 80, 14, 0.4);
          F.add(pos.x, pos.y + 2.2, pos.z, '¡ESTALLIDO!', 'big boom', { size: 34 });
          this.addShake(0.45);
        }
        break;
      }
      case 'spawn': {
        const f = this.beans.get(e.id);
        if (f) {
          const pos = f.root.position;
          const tc = this.teamColor(this.teamOf(e.id));
          G.beam(pos.x, 0, pos.z, tc);
          G.ring(pos.x, 0, pos.z, 2, tc, 0.6, 3);
        }
        break;
      }
      case 'blink': {
        for (const [x, z] of [[e.x, e.z], [e.x2, e.z2]]) {
          S.burst(x, 1, z, 22, 0xcff8ff, { speed: 3.5, up: 2, size: 0.07 });
          G.sparkle(x, 1, z, 0xcff8ff, 0.9);
        }
        L.flash(e.x2, 1, e.z2, 0x9ff0ff, 30, 8, 0.25);
        break;
      }
      case 'bounce': {
        const f = this.beans.get(e.id)?.lastFrame;
        if (f) { S.burst(f.x, f.y + 0.6, f.z, 12, 0x9cf57a, { speed: 3.5, up: 2, size: 0.07 }); G.ring(f.x, f.y + 0.3, f.z, 1.3, 0x9cf57a, 0.25, 3); }
        break;
      }
      case 'save': {
        const pos = this.charPos(e.id);
        if (pos) {
          F.add(pos.x, pos.y + 2.2, pos.z, '¡SALVADA!', 'big save', { size: 38, life: 1.4 });
          G.ring(pos.x, pos.y, pos.z, 3, 0x4fd1ff, 0.6, 3);
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


