// Caja de piezas para la decoración contextual: formas simples de colores planos que se juntan en pocas mallas.
// Cuatro baldes, uno por material: sólidos, tela (se ve de los dos lados), calcos (pintura pegada al piso) y luces.
// Nada de esto colisiona ni viaja por la red.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { painted } from './geo';
import { toonGradient } from './textures';

export type Bucket = 'solid' | 'cloth' | 'decal' | 'glow';
type Col = number | THREE.Color;

/** Los calcos van apenas levantados del piso (además del polygonOffset) para no titilar. */
const DECAL_Y = 0.015;

export class Pieces {
  private parts: Record<Bucket, THREE.BufferGeometry[]> = { solid: [], cloth: [], decal: [], glow: [] };

  /** Suma una geometría ya armada en el origen: la gira sobre Y, la lleva a su lugar y la pinta. */
  add(bucket: Bucket, g: THREE.BufferGeometry, x: number, y: number, z: number, color: Col, rotY = 0) {
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    const ni = painted(g, color);
    ni.computeVertexNormals();
    if (!ni.attributes.uv) ni.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ni.attributes.position.count * 2), 2));
    this.parts[bucket].push(ni);
  }

  /** Caja apoyada en y. w a lo largo de x, d a lo largo de z (antes de girar). */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: Col, rotY = 0, bucket: Bucket = 'solid', tilt = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (tilt) g.rotateZ(tilt);
    g.translate(0, h / 2, 0);
    this.add(bucket, g, x, y, z, color, rotY);
  }

  /** Cilindro (o tronco de cono) parado en y. */
  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: Col, seg = 7, bucket: Bucket = 'solid', rotY = 0) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    g.translate(0, h / 2, 0);
    this.add(bucket, g, x, y, z, color, rotY);
  }

  /** Cilindro acostado a lo largo de x (antes de girar), centrado en y. */
  bar(r: number, len: number, x: number, y: number, z: number, color: Col, rotY = 0, seg = 6, bucket: Bucket = 'solid') {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.rotateZ(Math.PI / 2);
    this.add(bucket, g, x, y, z, color, rotY);
  }

  cone(r: number, h: number, x: number, y: number, z: number, color: Col, seg = 4, rotY = 0, bucket: Bucket = 'solid') {
    const g = new THREE.ConeGeometry(r, h, seg);
    g.translate(0, h / 2, 0);
    this.add(bucket, g, x, y, z, color, rotY);
  }

  /** Piedra facetada. s: tamaño; squash: cuánto se aplasta. */
  rock(s: number, x: number, y: number, z: number, color: Col, rotY = 0, squash = 0.8) {
    const g = new THREE.DodecahedronGeometry(s, 0);
    g.scale(1, squash, 1);
    this.add('solid', g, x, y + s * squash * 0.7, z, color, rotY);
  }

  /** Cristal: un octaedro estirado, clavado en y. lean: cuánto se inclina. */
  gem(s: number, h: number, x: number, y: number, z: number, color: Col, rotY = 0, lean = 0, bucket: Bucket = 'glow') {
    const g = new THREE.OctahedronGeometry(s, 0);
    g.scale(1, h / (2 * s), 1);
    g.translate(0, h * 0.42, 0);
    if (lean) g.rotateZ(lean);
    this.add(bucket, g, x, y, z, color, rotY);
  }

  /** Mata redondeada. */
  bush(s: number, x: number, y: number, z: number, color: Col, rotY = 0) {
    for (const [ox, oy, oz, rad] of [[0, 0.26, 0, 0.4], [0.3, 0.2, 0.12, 0.3], [-0.24, 0.18, -0.16, 0.27]]) {
      const g = new THREE.IcosahedronGeometry(rad * s, 0);
      g.translate(ox * s, oy * s, oz * s);
      this.add('solid', g, x, y, z, color, rotY);
    }
  }

  /** Neumático acostado (pila si n > 1). */
  tyres(n: number, x: number, y: number, z: number, color: Col = 0x26262c) {
    for (let i = 0; i < n; i++) {
      const g = new THREE.TorusGeometry(0.24, 0.11, 5, 9);
      g.rotateX(Math.PI / 2);
      this.add('solid', g, x, y + 0.11 + i * 0.21, z, color, i * 0.6);
    }
  }

  /** Rollo de alambre de púa a lo largo de x (antes de girar). */
  wire(len: number, x: number, y: number, z: number, rotY = 0, color: Col = 0x8a8f96) {
    const loops = Math.max(2, Math.round(len / 0.22));
    for (let i = 0; i < loops; i++) {
      const g = new THREE.TorusGeometry(0.17, 0.014, 3, 8);
      g.rotateY(Math.PI / 2 + (i % 2 ? 0.25 : -0.25));
      g.translate(-len / 2 + (len * (i + 0.5)) / loops, 0.17, 0);
      this.add('solid', g, x, y, z, color, rotY);
    }
  }

  // ───────────── tela ─────────────

  /** Bandera rectangular que sale de un mástil en (x, y, z) hacia +x (antes de girar); y es su borde de arriba. */
  flag(w: number, h: number, x: number, y: number, z: number, color: Col, rotY = 0) {
    const g = new THREE.PlaneGeometry(w, h, 3, 1);
    const p = g.attributes.position;
    // Una onda leve para que no sea una tabla.
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w + 0.5) * Math.PI * 1.5) * w * 0.09);
    g.translate(w / 2, -h / 2, 0);
    this.add('cloth', g, x, y, z, color, rotY);
  }

  /** Banderín triangular. */
  pennant(w: number, h: number, x: number, y: number, z: number, color: Col, rotY = 0) {
    this.add('cloth', tri([[0, 0, 0], [0, -h, 0], [w, -h / 2, 0]]), x, y, z, color, rotY);
  }

  /** Estandarte colgado: cae desde (x, y, z) mirando hacia la dirección rotY. Termina en punta. */
  banner(w: number, h: number, x: number, y: number, z: number, color: Col, rotY = 0, stripe?: Col) {
    const g = mergeGeometries([tri([[-w / 2, 0, 0], [w / 2, 0, 0], [w / 2, -h * 0.8, 0]]), tri([[-w / 2, 0, 0], [w / 2, -h * 0.8, 0], [-w / 2, -h * 0.8, 0]]), tri([[-w / 2, -h * 0.8, 0], [w / 2, -h * 0.8, 0], [0, -h, 0]])]);
    this.add('cloth', g, x, y, z, color, rotY);
    if (stripe !== undefined) {
      const s = mergeGeometries([tri([[-w * 0.16, -h * 0.12, 0.012], [w * 0.16, -h * 0.12, 0.012], [w * 0.16, -h * 0.7, 0.012]]), tri([[-w * 0.16, -h * 0.12, 0.012], [w * 0.16, -h * 0.7, 0.012], [-w * 0.16, -h * 0.7, 0.012]])]);
      this.add('cloth', s, x, y, z, stripe, rotY);
    }
  }

  /** Guirnalda de banderines entre dos puntos, con panza. */
  bunting(a: [number, number, number], b: [number, number, number], colors: Col[], sag = 0.45, cord: Col = 0x3a3340) {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(3, Math.round(len / 0.55));
    const rot = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    const at = (u: number): [number, number, number] => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u];
    for (let i = 0; i < n; i++) {
      const p = at((i + 0.5) / n), q0 = at(i / n), q1 = at((i + 1) / n);
      this.add('cloth', tri([[-0.15, 0, 0], [0.15, 0, 0], [0, -0.3, 0]]), p[0], p[1], p[2], colors[i % colors.length], rot);
      // La cuerda: un tramo fino entre banderín y banderín.
      const seg = Math.hypot(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]);
      const g = new THREE.BoxGeometry(seg, 0.025, 0.025);
      g.rotateZ(Math.atan2(q1[1] - q0[1], Math.hypot(q1[0] - q0[0], q1[2] - q0[2])));
      this.add('solid', g, (q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2, (q0[2] + q1[2]) / 2, cord, rot);
    }
  }

  // ───────────── calcos (pintura sobre el piso) ─────────────

  /** Rectángulo pintado en el piso, centrado en (x, z). */
  plate(w: number, d: number, x: number, y: number, z: number, color: Col, rotY = 0) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    this.add('decal', g, x, y + DECAL_Y, z, color, rotY);
  }

  /** Anillo (o disco, con rIn = 0) pintado en el piso. */
  ring(rIn: number, rOut: number, x: number, y: number, z: number, color: Col, seg = 28) {
    const g = rIn > 0 ? new THREE.RingGeometry(rIn, rOut, seg) : new THREE.CircleGeometry(rOut, seg);
    g.rotateX(-Math.PI / 2);
    this.add('decal', g, x, y + DECAL_Y, z, color);
  }

  // ───────────── armado ─────────────

  build(): { group: THREE.Group; glow: THREE.MeshBasicMaterial } {
    const group = new THREE.Group();
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const mats: Record<Bucket, THREE.Material> = {
      solid: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }),
      cloth: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide }),
      decal: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      glow,
    };
    for (const k of Object.keys(this.parts) as Bucket[]) {
      if (!this.parts[k].length) continue;
      const m = new THREE.Mesh(mergeGeometries(this.parts[k]), mats[k]);
      m.castShadow = k === 'solid';
      m.receiveShadow = k !== 'glow';
      group.add(m);
    }
    return { group, glow };
  }

  get count() { return this.parts.solid.length + this.parts.cloth.length + this.parts.decal.length + this.parts.glow.length; }
}

/** Triángulo suelto (sin índices), con los atributos que piden las demás piezas para poder fusionarse. */
function tri(p: number[][]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  return g;
}
