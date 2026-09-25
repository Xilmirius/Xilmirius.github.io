// Efectos: partículas (InstancedMesh), ondas expansivas, arcos de golpe, proyectiles, zonas y telegrafías.
import * as THREE from 'three';
import type { AreaFrame, ProjFrame } from '../core/snapshot';
import { ringTexture, softDisc, toonGradient } from './textures';

const MAX_P = 900;

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; g: number; r: number; gg: number; b: number; spin: number; drag: number; grow: number }

export class Particles {
  mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();
  private hdr: number;

  /** additive: partículas que brillan (chispas, confeti de luz) con color HDR para el bloom. */
  constructor(opts: { additive?: boolean; hdr?: number; tetra?: boolean } = {}) {
    this.hdr = opts.hdr ?? 1;
    const geo = opts.tetra ? new THREE.TetrahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, toneMapped: !opts.additive,
      ...(opts.additive ? { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false } : {}),
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_P);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  }

  burst(x: number, y: number, z: number, n: number, color: number, o: { speed?: number; up?: number; size?: number; life?: number; gravity?: number; spread?: number; drag?: number; grow?: number } = {}) {
    const c = new THREE.Color(color).multiplyScalar(this.hdr);
    const sp = o.speed ?? 5, up = o.up ?? 3, size = o.size ?? 0.12, life = o.life ?? 0.7, g = o.gravity ?? 18, spread = o.spread ?? 0.2;
    for (let i = 0; i < n; i++) {
      if (this.ps.length >= MAX_P) this.ps.shift();
      const a = Math.random() * Math.PI * 2;
      const s = sp * (0.4 + Math.random() * 0.8);
      const k = 0.8 + Math.random() * 0.4;
      this.ps.push({
        x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, z: z + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * s, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), g,
        r: c.r * k, gg: c.g * k, b: c.b * k, spin: Math.random() * 10, drag: o.drag ?? 0.5, grow: o.grow ?? 0,
      });
    }
  }

  trail(x: number, y: number, z: number, color: number, size = 0.08, life = 0.35) {
    this.burst(x, y, z, 1, color, { speed: 0.4, up: 0.3, size, life, gravity: 0, spread: 0.15 });
  }

  update(dt: number) {
    let n = 0;
    const alive: P[] = [];
    for (const p of this.ps) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.g * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.spin += dt * 6;
      alive.push(p);
      const sc = p.grow > 0 ? p.size * (1 + p.grow * (1 - p.life / p.max)) * Math.min(1, p.life / (p.max * 0.3)) : p.size * Math.min(1, p.life / (p.max * 0.5));
      this.e.set(p.spin, p.spin * 0.7, 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(Math.max(0.001, sc));
      this.p.set(p.x, p.y, p.z);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.c.setRGB(p.r, p.gg, p.b);
      this.mesh.setColorAt(n, this.c);
      n++;
    }
    this.ps = alive;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.ps = []; this.mesh.count = 0; }
}

interface Wave { m: THREE.Mesh; t: number; dur: number; r: number }

/** Anillos expansivos en el piso y arcos de golpe. */
export class Waves {
  group = new THREE.Group();
  private list: Wave[] = [];
  private geo = new THREE.PlaneGeometry(2, 2);
  private tex = ringTexture();

  ring(x: number, y: number, z: number, r: number, color: number, dur = 0.4) {
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ map: this.tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.08, z);
    m.renderOrder = 3;
    this.group.add(m);
    this.list.push({ m, t: 0, dur, r });
  }

  arc(x: number, y: number, z: number, yaw: number, range: number, angleDeg: number, color: number) {
    const a = (angleDeg * Math.PI) / 180;
    const g = new THREE.RingGeometry(range * 0.35, range, 20, 1, Math.PI / 2 - a / 2, a);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = yaw + Math.PI;
    m.position.set(x, y + 0.6, z);
    this.group.add(m);
    this.list.push({ m, t: 0, dur: 0.18, r: -1 });
  }

  update(dt: number) {
    for (const w of this.list) {
      w.t += dt;
      const k = w.t / w.dur;
      const mat = w.m.material as THREE.MeshBasicMaterial;
      if (w.r > 0) {
        w.m.scale.setScalar(Math.max(0.01, w.r * (0.2 + 0.8 * Math.sqrt(k))));
        mat.opacity = 1 - k;
      } else {
        mat.opacity = 0.55 * (1 - k);
        w.m.scale.setScalar(1 + k * 0.15);
      }
    }
    const done = this.list.filter((w) => w.t >= w.dur);
    for (const w of done) { w.m.removeFromParent(); w.m.geometry !== this.geo && w.m.geometry.dispose(); (w.m.material as THREE.Material).dispose(); }
    this.list = this.list.filter((w) => w.t < w.dur);
  }

  clear() { for (const w of this.list) w.m.removeFromParent(); this.list = []; }
}

// ───────────── proyectiles ─────────────

const PROJ_COLORS: Record<string, number> = {
  shard: 0x9ff0ff, lance: 0xd8fbff, glob: 0x7bea4f, wave: 0x6fdc4a, hook: 0xc9d3dd, bolt: 0xffd23f, nova: 0xaef4ff, goolob: 0x7bea4f,
};

export class ProjectilesView {
  group = new THREE.Group();
  private map = new Map<number, THREE.Object3D>();
  private chains = new Map<number, THREE.Line>();

  constructor(private particles: Particles) {}

  private build(p: ProjFrame): THREE.Object3D {
    const c = PROJ_COLORS[p.k] ?? 0xffffff;
    const glow = (k = 2.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
    const tg = toonGradient();
    switch (p.k) {
      case 'shard': {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), glow(2.4));
        m.scale.set(0.6, 0.6, 1.6);
        return m;
      }
      case 'lance': {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), glow(3));
        m.scale.set(0.6, 0.6, 4);
        return m;
      }
      case 'glob': case 'goolob': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), new THREE.MeshToonMaterial({ color: c, gradientMap: tg, transparent: true, opacity: 0.85 }));
        return m;
      }
      case 'wave': {
        const g = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true, -Math.PI / 2, Math.PI);
        const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ color: c, gradientMap: tg, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
        m.scale.set(p.r, 1.6, p.r * 0.5);
        const grp = new THREE.Group();
        m.position.y = 0;
        grp.add(m);
        return grp;
      }
      case 'hook': {
        const m = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 10, Math.PI * 1.4), new THREE.MeshToonMaterial({ color: c, gradientMap: tg }));
        return m;
      }
      case 'nova': {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), glow(2.5));
        m.scale.set(1, 1.6, 1);
        return m;
      }
      default: {
        return new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.12, p.r), 8, 6), glow(2.5));
      }
    }
  }

  update(list: ProjFrame[], ownerPos: (id: number) => THREE.Vector3 | null, time: number) {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let o = this.map.get(p.id);
      if (!o) {
        o = this.build(p);
        this.group.add(o);
        this.map.set(p.id, o);
      }
      o.position.set(p.x, p.y, p.z);
      if (p.vx || p.vz) o.rotation.y = Math.atan2(p.vx, p.vz);
      if (p.k === 'nova' || p.k === 'goolob') o.rotation.y = time * 8;
      if (p.k === 'wave') o.position.y = p.y - 0.6;
      if (p.k === 'shard' || p.k === 'lance' || p.k === 'nova') this.particles.trail(p.x, p.y, p.z, PROJ_COLORS[p.k], p.k === 'nova' ? 0.2 : 0.07, 0.25);
      if (p.k === 'glob' || p.k === 'wave') { if (Math.random() < 0.5) this.particles.trail(p.x, p.y - 0.2, p.z, 0x7bea4f, 0.1, 0.4); }
      if (p.k === 'hook') {
        // Cadena desde el dueño
        let line = this.chains.get(p.id);
        const from = ownerPos(p.o);
        if (from) {
          if (!line) {
            line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x3a3a3a }));
            this.group.add(line);
            this.chains.set(p.id, line);
          }
          const a = line.geometry.attributes.position as THREE.BufferAttribute;
          a.setXYZ(0, from.x, from.y + 0.8, from.z);
          a.setXYZ(1, p.x, p.y, p.z);
          a.needsUpdate = true;
        }
      }
    }
    for (const [id, o] of this.map) {
      if (!seen.has(id)) {
        o.removeFromParent();
        this.map.delete(id);
        const l = this.chains.get(id);
        if (l) { l.removeFromParent(); this.chains.delete(id); }
      }
    }
  }

  clear() {
    for (const o of this.map.values()) o.removeFromParent();
    for (const l of this.chains.values()) l.removeFromParent();
    this.map.clear();
    this.chains.clear();
  }
}

// ───────────── zonas y telegrafías ─────────────

export class AreasView {
  group = new THREE.Group();
  private map = new Map<number, { g: THREE.Group; fill?: THREE.Mesh; ring: THREE.Mesh }>();
  private disc = softDisc();
  private ringTex = ringTexture();

  update(list: AreaFrame[], kind: 'zone' | 'tele', myTeam: number, time: number, particles: Particles) {
    const seen = new Set<number>();
    for (const a of list) {
      const id = (kind === 'zone' ? 1 : 2) * 1e7 + a.id;
      seen.add(id);
      let v = this.map.get(id);
      const enemy = a.tm !== myTeam;
      if (!v) {
        const g = new THREE.Group();
        let color = 0xffffff;
        if (kind === 'tele') color = enemy ? 0xff3b30 : 0x6fd3ff;
        else if (a.k === 'puddle') color = 0x6fdc4a;
        else if (a.k === 'magnet') color = 0xb070ff;
        const hdrCol = new THREE.Color(color).multiplyScalar(kind === 'tele' ? 2.4 : 1.6);
        const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.ringTex, color: hdrCol, transparent: true, depthWrite: false, opacity: 0.9, toneMapped: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 2;
        g.add(ring);
        let fill: THREE.Mesh | undefined;
        if (kind === 'tele' || a.k === 'puddle') {
          fill = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === 'tele' ? 0.25 : 0.45, depthWrite: false }));
          fill.rotation.x = -Math.PI / 2;
          fill.position.y = 0.01;
          fill.renderOrder = 1;
          g.add(fill);
        }
        this.group.add(g);
        v = { g, fill, ring };
        this.map.set(id, v);
      }
      v.g.position.set(a.x, a.y + 0.07, a.z);
      v.ring.scale.setScalar(a.r);
      if (kind === 'tele') {
        v.fill!.scale.setScalar(Math.max(0.01, a.r * a.p));
        (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.4 * Math.sin(time * 20);
      } else if (a.k === 'puddle') {
        v.fill!.scale.setScalar(a.r * Math.min(1, a.p * 8));
        (v.fill!.material as THREE.MeshBasicMaterial).opacity = 0.45 * Math.min(1, (1 - a.p) * 5);
        if (Math.random() < 0.3) particles.burst(a.x + (Math.random() - 0.5) * a.r * 1.4, a.y + 0.1, a.z + (Math.random() - 0.5) * a.r * 1.4, 1, 0x9cf57a, { speed: 0.2, up: 2, size: 0.1, life: 0.5, gravity: 4 });
      } else if (a.k === 'magnet') {
        v.ring.rotation.z = time * 4;
        v.ring.scale.setScalar(a.r * (1 - ((time * 1.5) % 1) * 0.6));
        if (Math.random() < 0.6) {
          const ang = Math.random() * Math.PI * 2;
          particles.burst(a.x + Math.cos(ang) * a.r, a.y + 0.5, a.z + Math.sin(ang) * a.r, 1, 0xc8a0ff, { speed: 0, up: 0.5, size: 0.1, life: 0.5, gravity: 0 });
        }
      }
    }
    for (const [id, v] of this.map) {
      if (Math.floor(id / 1e7) !== (kind === 'zone' ? 1 : 2)) continue;
      if (!seen.has(id)) { v.g.removeFromParent(); this.map.delete(id); }
    }
    void this.disc;
  }

  clear() { for (const v of this.map.values()) v.g.removeFromParent(); this.map.clear(); }
}

/** Zona del modo "Control de zona": anillo + columna de luz con el color del dueño. */
export class KothView {
  group = new THREE.Group();
  private ring: THREE.Mesh;
  private beam: THREE.Mesh;
  constructor() {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 6, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.beam.position.y = 3;
    this.group.add(this.ring, this.beam);
    this.group.visible = false;
  }
  update(z: { x: number; y: number; z: number; r: number; owner: number; contested: boolean } | undefined, color: (t: number) => number, time: number) {
    if (!z) { this.group.visible = false; return; }
    this.group.visible = true;
    this.group.position.set(z.x, z.y + 0.06, z.z);
    this.ring.scale.setScalar(z.r);
    this.beam.scale.set(z.r, 1, z.r);
    const c = z.contested ? (Math.floor(time * 6) % 2 ? 0xff4040 : 0xffffff) : z.owner >= 0 ? color(z.owner) : 0xffffff;
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(c).multiplyScalar(2.2);
    (this.beam.material as THREE.MeshBasicMaterial).color.setHex(c);
  }
}
