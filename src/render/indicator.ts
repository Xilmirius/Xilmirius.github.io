// Indicador de apuntado: mientras mantenés la tecla de una habilidad, se dibuja en el piso qué va a
// hacer y dónde (área en el cursor, línea, cono, muro...). Al soltar, sale la habilidad.
// Se dibuja por encima de todo (sin depth test) para que se lea aunque haya cobertura en el medio.
import * as THREE from 'three';
import type { AimShape } from '../core/heroes/types';

export interface AimView {
  shape: AimShape;
  range: number;
  /** Multiplicador de área (mutaciones). */
  area: number;
  /** false = en enfriamiento o ulti sin cargar: se dibuja en rojo apagado. */
  ready: boolean;
  color: number;
}

const NOT_READY = 0xff5a4a;

function mat(opacity: number) {
  return new THREE.MeshBasicMaterial({ color: 0x4fd1ff, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
}

/** Plano horizontal (XZ) a partir de una geometría 2D en XY. */
function flat(g: THREE.BufferGeometry) {
  g.rotateX(-Math.PI / 2);
  return g;
}

export class AimIndicator {
  group = new THREE.Group();
  private rangeRing: THREE.Mesh;
  private area: THREE.Group;
  private areaFill: THREE.Mesh;
  private line: THREE.Group;
  private lineBody: THREE.Mesh;
  private lineHead: THREE.Mesh;
  private cone: THREE.Mesh;
  private coneDeg = -1;
  private wall: THREE.Group;
  private wallGhost: THREE.Mesh;
  private marker: THREE.Group;
  private mats: THREE.MeshBasicMaterial[] = [];

  constructor() {
    const m = (o: number) => { const x = mat(o); this.mats.push(x); return x; };
    this.rangeRing = new THREE.Mesh(flat(new THREE.RingGeometry(0.975, 1, 72)), m(0.35));

    this.areaFill = new THREE.Mesh(flat(new THREE.CircleGeometry(1, 48)), m(0.16));
    const areaEdge = new THREE.Mesh(flat(new THREE.RingGeometry(0.94, 1, 64)), m(0.85));
    this.area = new THREE.Group();
    this.area.add(this.areaFill, areaEdge);

    // Línea: rectángulo que sale desde vos hacia adelante (+Z local) y una punta de flecha.
    // Rectángulo de 1×1 que va de z=0 a z=-1 una vez aplanado (por eso se escala con z negativo).
    const strip = () => { const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0); return flat(g); };
    this.lineBody = new THREE.Mesh(strip(), m(0.22));
    const hg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(0, 0, 0.6)]);
    this.lineHead = new THREE.Mesh(hg, m(0.75));
    const lineEdgeL = new THREE.Mesh(strip(), m(0.7));
    const lineEdgeR = new THREE.Mesh(strip(), m(0.7));
    lineEdgeL.name = 'edgeL';
    lineEdgeR.name = 'edgeR';
    this.line = new THREE.Group();
    this.line.add(this.lineBody, this.lineHead, lineEdgeL, lineEdgeR);

    this.cone = new THREE.Mesh(new THREE.BufferGeometry(), m(0.25));

    this.wall = new THREE.Group();
    const wallBase = new THREE.Mesh(flat(new THREE.PlaneGeometry(1, 0.9)), m(0.5));
    this.wallGhost = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.9), m(0.18));
    this.wallGhost.position.y = 0.9;
    this.wall.add(wallBase, this.wallGhost);

    this.marker = new THREE.Group();
    const cross1 = new THREE.Mesh(flat(new THREE.PlaneGeometry(0.9, 0.12)), m(0.85));
    const cross2 = cross1.clone();
    cross2.rotation.y = Math.PI / 2;
    const dot = new THREE.Mesh(flat(new THREE.RingGeometry(0.32, 0.42, 32)), m(0.85));
    this.marker.add(cross1, cross2, dot);

    for (const o of [this.rangeRing, this.area, this.line, this.cone, this.wall, this.marker]) {
      o.renderOrder = 20;
      o.traverse((c) => { c.renderOrder = 20; });
      this.group.add(o);
    }
    this.group.visible = false;
  }

  /**
   * from: posición del héroe (y = piso bajo sus pies). cursor: punto del mundo bajo el mouse.
   * groundAt: altura del piso en (x,z) o -Infinity si es vacío.
   */
  update(aim: AimView | null, from: THREE.Vector3 | null, cursor: THREE.Vector3 | null, groundAt: (x: number, z: number) => number, time: number) {
    if (!aim || !from || !cursor) { this.group.visible = false; return; }
    this.group.visible = true;
    for (const o of [this.rangeRing, this.area, this.line, this.cone, this.wall, this.marker]) o.visible = false;
    const color = aim.ready ? aim.color : NOT_READY;
    const pulse = 0.85 + 0.15 * Math.sin(time * 8);
    for (const m of this.mats) m.color.setHex(color);

    let dx = cursor.x - from.x, dz = cursor.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) { dx = 0; dz = 1; } else { dx /= d; dz /= d; }
    const yaw = Math.atan2(dx, dz);
    const reach = Math.min(d, aim.range);
    const tx = from.x + dx * reach, tz = from.z + dz * reach;
    const gy = groundAt(tx, tz);
    const ty = (gy > -Infinity ? gy : from.y) + 0.06;
    const y0 = from.y + 0.06;

    if (aim.range > 0 && aim.shape.k !== 'line' && aim.shape.k !== 'cone') {
      this.rangeRing.visible = true;
      this.rangeRing.position.set(from.x, y0, from.z);
      this.rangeRing.scale.setScalar(aim.range);
    }

    const s = aim.shape;
    switch (s.k) {
      case 'circle':
        this.showArea(tx, ty, tz, s.r * aim.area, pulse);
        break;
      case 'self':
        if (s.r > 0) this.showArea(from.x, y0, from.z, s.r * aim.area, pulse);
        else this.showArea(from.x, y0, from.z, 1.1, pulse);
        break;
      case 'line': {
        this.line.visible = true;
        const w = s.w * Math.max(1, Math.sqrt(aim.area));
        this.line.position.set(from.x, y0, from.z);
        this.line.rotation.y = yaw;
        this.lineBody.scale.set(w, 1, -aim.range);
        this.lineHead.position.z = aim.range;
        this.lineHead.scale.setScalar(Math.max(1, w));
        const eL = this.line.getObjectByName('edgeL')!, eR = this.line.getObjectByName('edgeR')!;
        eL.scale.set(0.07, 1, -aim.range); eL.position.x = -w / 2;
        eR.scale.set(0.07, 1, -aim.range); eR.position.x = w / 2;
        break;
      }
      case 'cone': {
        if (this.coneDeg !== s.deg) {
          const half = (s.deg * Math.PI) / 360;
          this.cone.geometry.dispose();
          this.cone.geometry = flat(new THREE.CircleGeometry(1, 28, Math.PI / 2 - half, half * 2));
          this.coneDeg = s.deg;
        }
        this.cone.visible = true;
        this.cone.position.set(from.x, y0, from.z);
        // CircleGeometry con θ centrado en +Y → tras aplanar apunta a -Z; lo giramos hacia la mirada.
        this.cone.rotation.y = yaw + Math.PI;
        this.cone.scale.setScalar(aim.range * aim.area);
        break;
      }
      case 'wall': {
        this.wall.visible = true;
        this.wall.position.set(tx, ty, tz);
        this.wall.rotation.y = yaw;
        const len = s.len * Math.min(1.34, aim.area);
        this.wall.scale.set(len, 1, 1);
        this.wallGhost.scale.y = pulse;
        this.showMarker(tx, ty, tz);
        break;
      }
      case 'point':
        this.showMarker(tx, ty, tz);
        if (s.r) this.showArea(tx, ty, tz, s.r, pulse * 0.6);
        break;
      case 'blink':
        this.showMarker(tx, ty, tz);
        this.showArea(from.x, y0, from.z, s.r * aim.area, pulse);
        break;
    }
  }

  private showArea(x: number, y: number, z: number, r: number, pulse: number) {
    this.area.visible = true;
    this.area.position.set(x, y, z);
    this.area.scale.setScalar(r);
    (this.areaFill.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.08 * pulse;
  }

  private showMarker(x: number, y: number, z: number) {
    this.marker.visible = true;
    this.marker.position.set(x, y, z);
  }
}
