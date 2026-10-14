// Helpers matemáticos mínimos sobre objetos planos (serializables, sin clases).
export interface V2 { x: number; z: number }
export interface V3 { x: number; y: number; z: number }

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const len2 = (x: number, z: number) => Math.hypot(x, z);
/** ¿El círculo (x,z,r) se encima con la caja? (estricto: rozar no cuenta) */
export function circleOverlapsBox(x: number, z: number, r: number, minX: number, maxX: number, minZ: number, maxZ: number) {
  const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
  const dz = z < minZ ? minZ - z : z > maxZ ? z - maxZ : 0;
  return dx * dx + dz * dz < r * r;
}
export const dist2 = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

/** Dirección unitaria desde un ángulo de yaw (0 = +Z, igual que rotation.y de Three.js). */
export const dirOf = (yaw: number): V2 => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
export const yawOf = (x: number, z: number) => Math.atan2(x, z);

export function norm2(x: number, z: number): V2 {
  const l = Math.hypot(x, z);
  return l > 1e-6 ? { x: x / l, z: z / l } : { x: 0, z: 0 };
}

/** Acerca (vx,vz) a (tx,tz) como máximo `maxDelta`. */
export function approach2(v: V3, tx: number, tz: number, maxDelta: number) {
  const dx = tx - v.x, dz = tz - v.z;
  const d = Math.hypot(dx, dz);
  if (d <= maxDelta || d < 1e-6) { v.x = tx; v.z = tz; return; }
  v.x += (dx / d) * maxDelta;
  v.z += (dz / d) * maxDelta;
}

export function angleDiff(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function lerpAngle(a: number, b: number, t: number) {
  return a + angleDiff(a, b) * t;
}

export const round2 = (v: number) => Math.round(v * 100) / 100;
export const round1 = (v: number) => Math.round(v * 10) / 10;
