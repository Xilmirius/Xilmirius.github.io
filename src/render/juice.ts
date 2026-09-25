// "Casino visual": luces dinámicas, bolas de fuego, pilares de luz, haces, anillos HDR y textos flotantes.
// Todo lo que brilla usa colores HDR (>1) para que el bloom lo haga resplandecer.
import * as THREE from 'three';

const hdr = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k);
/** Las luces dinámicas son acento, no iluminación: si queman la imagen, bajar esto. */
const LIGHT_SCALE = 0.18;

/** Pool fijo de luces puntuales (cantidad fija = sin recompilar shaders). */
export class LightPool {
  group = new THREE.Group();
  private lights: { l: THREE.PointLight; t: number; dur: number; peak: number }[] = [];

  constructor(n = 4) {
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 12, 1.6);
      this.group.add(l);
      this.lights.push({ l, t: 1, dur: 1, peak: 0 });
    }
  }

  /** intensity en "puntos de efecto" (escala propia); se convierte a candelas con LIGHT_SCALE. */
  flash(x: number, y: number, z: number, color: number, intensity: number, dist = 12, dur = 0.35) {
    intensity *= LIGHT_SCALE;
    let slot = this.lights[0];
    for (const s of this.lights) if (s.t / s.dur > slot.t / slot.dur) slot = s;
    slot.l.position.set(x, y + 1, z);
    slot.l.color.setHex(color);
    slot.l.distance = dist;
    slot.t = 0;
    slot.dur = dur;
    slot.peak = intensity;
  }

  update(dt: number) {
    for (const s of this.lights) {
      s.t += dt;
      const k = Math.max(0, 1 - s.t / s.dur);
      s.l.intensity = s.peak * k * k;
    }
  }
}

interface Glow { m: THREE.Mesh; t: number; dur: number; kind: 'ball' | 'pillar' | 'beam' | 'ring' | 'star'; s0: number; s1: number }

/** Mallas aditivas efímeras: bolas de fuego, pilares de ring-out, haces de spawn, anillos. */
export class GlowFX {
  group = new THREE.Group();
  private list: Glow[] = [];
  private sphere = new THREE.SphereGeometry(1, 20, 14);
  private cyl = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
  private torus = new THREE.TorusGeometry(1, 0.08, 8, 48);
  private star = new THREE.OctahedronGeometry(1, 0);

  private mat(color: number, k: number, additive = true) {
    return new THREE.MeshBasicMaterial({ color: hdr(color, k), transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false, side: THREE.DoubleSide });
  }

  fireball(x: number, y: number, z: number, r: number, color: number) {
    const core = new THREE.Mesh(this.sphere, this.mat(0xffffff, 1.4, false));
    core.position.set(x, y, z);
    this.group.add(core);
    this.list.push({ m: core, t: 0, dur: 0.14, kind: 'ball', s0: Math.min(r * 0.15, 0.6), s1: Math.min(r * 0.35, 1.2) });
    const m = new THREE.Mesh(this.sphere, this.mat(color, 1.15, false));
    m.position.set(x, y, z);
    this.group.add(m);
    this.list.push({ m, t: 0, dur: 0.3, kind: 'ball', s0: Math.min(r * 0.25, 1), s1: Math.min(r * 0.7, 2.6) });
  }

  pillar(x: number, z: number, color: number, height = 40, radius = 2.2, dur = 1.3) {
    const m = new THREE.Mesh(this.cyl, this.mat(color, 1.8));
    m.position.set(x, -9 + height / 2, z);
    m.scale.set(radius, height, radius);
    this.group.add(m);
    this.list.push({ m, t: 0, dur, kind: 'pillar', s0: radius, s1: radius * 0.1 });
    const inner = new THREE.Mesh(this.cyl, this.mat(0xffffff, 2.2));
    inner.position.copy(m.position);
    inner.scale.set(radius * 0.35, height, radius * 0.35);
    this.group.add(inner);
    this.list.push({ m: inner, t: 0, dur: dur * 0.6, kind: 'pillar', s0: radius * 0.35, s1: 0.02 });
  }

  beam(x: number, y: number, z: number, color: number) {
    const m = new THREE.Mesh(this.cyl, this.mat(color, 2.5));
    m.position.set(x, y + 10, z);
    m.scale.set(0.9, 20, 0.9);
    this.group.add(m);
    this.list.push({ m, t: 0, dur: 0.8, kind: 'beam', s0: 0.9, s1: 0.05 });
  }

  ring(x: number, y: number, z: number, r: number, color: number, dur = 0.5, k = 3) {
    const m = new THREE.Mesh(this.torus, this.mat(color, k));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.15, z);
    this.group.add(m);
    this.list.push({ m, t: 0, dur, kind: 'ring', s0: r * 0.15, s1: r });
  }

  sparkle(x: number, y: number, z: number, color: number, size = 0.5) {
    const m = new THREE.Mesh(this.star, this.mat(color, 4));
    m.position.set(x, y, z);
    this.group.add(m);
    this.list.push({ m, t: 0, dur: 0.25, kind: 'star', s0: size, s1: size * 0.1 });
  }

  update(dt: number) {
    for (const g of this.list) {
      g.t += dt;
      const k = Math.min(1, g.t / g.dur);
      const mat = g.m.material as THREE.MeshBasicMaterial;
      if (g.kind === 'ball') {
        g.m.scale.setScalar(g.s0 + (g.s1 - g.s0) * (1 - (1 - k) * (1 - k)));
        mat.opacity = 0.6 * (1 - k) * (1 - k);
      } else if (g.kind === 'pillar' || g.kind === 'beam') {
        const r = g.s0 + (g.s1 - g.s0) * k * k;
        g.m.scale.x = g.m.scale.z = r;
        mat.opacity = 1 - k * k;
      } else if (g.kind === 'ring') {
        g.m.scale.setScalar(g.s0 + (g.s1 - g.s0) * Math.sqrt(k));
        mat.opacity = 1 - k;
      } else {
        g.m.scale.setScalar(g.s0 + (g.s1 - g.s0) * k);
        g.m.rotation.y += dt * 12;
        mat.opacity = 1 - k;
      }
    }
    const done = this.list.filter((g) => g.t >= g.dur);
    for (const g of done) { g.m.removeFromParent(); (g.m.material as THREE.Material).dispose(); }
    if (done.length) this.list = this.list.filter((g) => g.t < g.dur);
  }

  clear() { for (const g of this.list) g.m.removeFromParent(); this.list = []; }
}

// ───────────── textos flotantes (números de daño, "¡RING-OUT!", "+1 🪨"...) ─────────────

interface Floater { el: HTMLDivElement; x: number; y: number; z: number; t: number; life: number; rise: number; drift: number }

export class Floaters {
  private list: Floater[] = [];
  private v = new THREE.Vector3();

  constructor(private layer: HTMLElement) {}

  /** cls: dmg | dmg-me | dmg-hurt | big | stage | good | bad | mat | xp */
  add(x: number, y: number, z: number, text: string, cls: string, o: { size?: number; life?: number; rise?: number; color?: string } = {}) {
    if (this.list.length > 60) { const old = this.list.shift()!; old.el.remove(); }
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.textContent = text;
    if (o.size) el.style.fontSize = `${o.size}px`;
    if (o.color) el.style.color = o.color;
    this.layer.appendChild(el);
    this.list.push({ el, x, y, z, t: 0, life: o.life ?? 0.9, rise: o.rise ?? 1.6, drift: (Math.random() - 0.5) * 0.8 });
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number) {
    for (const f of this.list) {
      f.t += dt;
      const k = f.t / f.life;
      this.v.set(f.x + f.drift * k, f.y + f.rise * (1 - (1 - k) * (1 - k)), f.z);
      this.v.project(camera);
      const sx = ((this.v.x + 1) / 2) * w, sy = ((1 - this.v.y) / 2) * h;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.7 : k < 0.25 ? 1.3 - ((k - 0.12) / 0.13) * 0.3 : 1;
      f.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${pop})`;
      f.el.style.opacity = String(k > 0.7 ? Math.max(0, 1 - (k - 0.7) / 0.3) : 1);
    }
    const done = this.list.filter((f) => f.t >= f.life);
    for (const f of done) f.el.remove();
    if (done.length) this.list = this.list.filter((f) => f.t < f.life);
  }

  clear() { for (const f of this.list) f.el.remove(); this.list = []; }
}
