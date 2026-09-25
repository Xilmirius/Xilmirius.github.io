// "Casino visual" contenido: luces de acento, bolas de energía, pilares de ring-out, anillos y arcos de golpe.
// Reglas de estilo (pedido del jugador): NADA blanco y nada que sature la pantalla. Cada efecto lleva el
// color de quien lo causa (equipo/héroe) o del material, con mezcla normal (no aditiva) para que diez
// efectos superpuestos no se vuelvan un manchón blanco. El brillo HDR tiene tope (GLOW_MAX).
import * as THREE from 'three';

/** Tope de brillo HDR de los efectos: el bloom solo los realza un poco. */
export const GLOW_MAX = 1.35;
const hdr = (c: number, k: number) => new THREE.Color(c).multiplyScalar(Math.min(GLOW_MAX, k));
/** Las luces dinámicas son acento, no iluminación: si queman la imagen, bajar esto. */
const LIGHT_SCALE = 0.08;
const LIGHT_MAX = 8;

/** Pool fijo de luces puntuales (cantidad fija = sin recompilar shaders). */
export class LightPool {
  group = new THREE.Group();
  private lights: { l: THREE.PointLight; t: number; dur: number; peak: number }[] = [];

  constructor(n = 4) {
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffd23f, 0, 12, 1.6);
      this.group.add(l);
      this.lights.push({ l, t: 1, dur: 1, peak: 0 });
    }
  }

  /** intensity en "puntos de efecto" (escala propia); se convierte con LIGHT_SCALE y tiene tope. */
  flash(x: number, y: number, z: number, color: number, intensity: number, dist = 12, dur = 0.35) {
    intensity = Math.min(LIGHT_MAX, intensity * LIGHT_SCALE);
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

type GlowKind = 'ball' | 'pillar' | 'beam' | 'ring' | 'star' | 'arc';
interface Glow { m: THREE.Mesh; t: number; dur: number; kind: GlowKind; s0: number; s1: number; op: number }

/** Mallas efímeras de color: bolas de energía, pilares de ring-out, haces, anillos y arcos. */
export class GlowFX {
  group = new THREE.Group();
  private list: Glow[] = [];
  private sphere = new THREE.IcosahedronGeometry(1, 2);
  private cyl = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
  private torus = new THREE.TorusGeometry(1, 0.08, 8, 48);
  private star = new THREE.OctahedronGeometry(1, 0);

  private mat(color: number, k: number, opacity = 1) {
    return new THREE.MeshBasicMaterial({ color: hdr(color, k), transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  }

  private push(m: THREE.Mesh, kind: GlowKind, dur: number, s0: number, s1: number, op: number) {
    this.group.add(m);
    this.list.push({ m, t: 0, dur, kind, s0, s1, op });
  }

  /** Bola de energía que se expande y se desvanece (explosiones). */
  fireball(x: number, y: number, z: number, r: number, color: number) {
    const m = new THREE.Mesh(this.sphere, this.mat(color, 1.15, 0.5));
    m.position.set(x, y, z);
    this.push(m, 'ball', 0.3, Math.min(r * 0.25, 1), Math.min(r * 0.7, 2.6), 0.5);
  }

  /** Columna de ring-out: dos cilindros concéntricos del color del equipo (nunca blanco). */
  pillar(x: number, z: number, color: number, height = 40, radius = 2.2, dur = 1.3) {
    const m = new THREE.Mesh(this.cyl, this.mat(color, 1.1, 0.45));
    m.position.set(x, -9 + height / 2, z);
    m.scale.set(radius, height, radius);
    this.push(m, 'pillar', dur, radius, radius * 0.1, 0.45);
    const inner = new THREE.Mesh(this.cyl, this.mat(color, 1.35, 0.7));
    inner.position.copy(m.position);
    inner.scale.set(radius * 0.35, height, radius * 0.35);
    this.push(inner, 'pillar', dur * 0.6, radius * 0.35, 0.02, 0.7);
  }

  beam(x: number, y: number, z: number, color: number) {
    const m = new THREE.Mesh(this.cyl, this.mat(color, 1.25, 0.55));
    m.position.set(x, y + 10, z);
    m.scale.set(0.9, 20, 0.9);
    this.push(m, 'beam', 0.8, 0.9, 0.05, 0.55);
  }

  ring(x: number, y: number, z: number, r: number, color: number, dur = 0.5, k = 1.25) {
    const m = new THREE.Mesh(this.torus, this.mat(color, k, 0.85));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.15, z);
    this.push(m, 'ring', dur, r * 0.15, r, 0.85);
  }

  /** Estrellita geométrica que gira y se achica (impactos chicos, juntar cosas). */
  sparkle(x: number, y: number, z: number, color: number, size = 0.5) {
    const m = new THREE.Mesh(this.star, this.mat(color, 1.3, 0.95));
    m.position.set(x, y, z);
    this.push(m, 'star', 0.25, size, size * 0.1, 0.95);
  }

  /**
   * Estela del puño: una cinta curva que sigue el arco del golpe (no un cono).
   * yaw = hacia dónde mira el personaje; from/to = ángulos relativos (0 = al frente, + = a la derecha).
   */
  swoosh(x: number, y: number, z: number, yaw: number, radius: number, from: number, to: number, color: number, width = 0.16, dur = 0.16) {
    // RingGeometry: θ = π/2 es "al frente" una vez girada; θ crece hacia el lado +X del modelo.
    const a0 = Math.min(from, to), len = Math.abs(to - from);
    const g = new THREE.RingGeometry(Math.max(0.05, radius - width), radius, 18, 1, Math.PI / 2 + a0, len);
    const m = new THREE.Mesh(g, this.mat(color, 1.3, 0.95));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = yaw + Math.PI;
    m.position.set(x, y, z);
    this.push(m, 'arc', dur, 1, 1.1, 0.95);
  }

  update(dt: number) {
    for (const g of this.list) {
      g.t += dt;
      const k = Math.min(1, g.t / g.dur);
      const mat = g.m.material as THREE.MeshBasicMaterial;
      if (g.kind === 'ball') {
        g.m.scale.setScalar(g.s0 + (g.s1 - g.s0) * (1 - (1 - k) * (1 - k)));
        mat.opacity = g.op * (1 - k) * (1 - k);
      } else if (g.kind === 'pillar' || g.kind === 'beam') {
        const r = g.s0 + (g.s1 - g.s0) * k * k;
        g.m.scale.x = g.m.scale.z = r;
        mat.opacity = g.op * (1 - k * k);
      } else if (g.kind === 'ring') {
        g.m.scale.setScalar(g.s0 + (g.s1 - g.s0) * Math.sqrt(k));
        mat.opacity = g.op * (1 - k);
      } else if (g.kind === 'arc') {
        g.m.scale.setScalar(g.s0 + (g.s1 - g.s0) * k);
        mat.opacity = g.op * (1 - k);
      } else {
        g.m.scale.setScalar(g.s0 + (g.s1 - g.s0) * k);
        g.m.rotation.y += dt * 12;
        mat.opacity = g.op * (1 - k);
      }
    }
    const done = this.list.filter((g) => g.t >= g.dur);
    for (const g of done) {
      g.m.removeFromParent();
      (g.m.material as THREE.Material).dispose();
      if (g.kind === 'arc') g.m.geometry.dispose();
    }
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
