// Contactos de un círculo (el cuerpo) con lo que bloquea (docs/MALLA.md §6). Cada contacto trae la normal (de la
// superficie hacia el cuerpo), cuánto se mete el círculo, la altura de la cara de arriba y qué es lo que toca.
// Sin importar nada del juego: lo usan `terrain.ts` (celdas y rampas) y `collision.ts` (obstáculos).

/** Qué es lo que se toca. */
export const CONTACT_CELL = 0, CONTACT_RAMP = 1, CONTACT_OBSTACLE = 2;

/** Quien junta los contactos. `cell` es la celda del plano de la que salió lo tocado (-1 si es un obstáculo). */
export interface ContactSink {
  add(nx: number, nz: number, depth: number, top: number, kind: number, cell: number, ob: unknown): void;
}

/**
 * Contacto de un círculo (x,z,r) con un rectángulo. Si el centro está afuera, la normal sale del punto más cercano del
 * rectángulo (en una esquina, en diagonal: el cuerpo la rodea). Si está adentro, se lo saca por el lado más cercano.
 */
export function rectContact(
  sink: ContactSink, x: number, z: number, r: number,
  minX: number, maxX: number, minZ: number, maxZ: number,
  top: number, kind: number, cell: number, ob: unknown,
) {
  const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
  const dz = z < minZ ? minZ - z : z > maxZ ? z - maxZ : 0;
  if (dx !== 0 || dz !== 0) {
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    const d = Math.sqrt(d2);
    // Del punto más cercano del rectángulo hacia el centro.
    sink.add((x < minX ? -dx : x > maxX ? dx : 0) / d, (z < minZ ? -dz : z > maxZ ? dz : 0) / d, r - d, top, kind, cell, ob);
    return;
  }
  const l = x - minX, rt = maxX - x, t = z - minZ, b = maxZ - z;
  const m = Math.min(l, rt, t, b);
  if (m === l) sink.add(-1, 0, r + l, top, kind, cell, ob);
  else if (m === rt) sink.add(1, 0, r + rt, top, kind, cell, ob);
  else if (m === t) sink.add(0, -1, r + t, top, kind, cell, ob);
  else sink.add(0, 1, r + b, top, kind, cell, ob);
}
