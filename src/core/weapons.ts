// Armas: con las reglas que las prenden (`weapons`, hoy la Horda) el clic dispara en vez del golpe básico
// del héroe. Las balas son de impacto instantáneo: se resuelven en el host recorriendo el rayo y viajan a
// los clientes como un evento `shot` (para la traza, el fogonazo y el sonido), sin proyectiles en el snapshot.
// El lanzacohetes sí es un proyectil, y el C4 es una carga con mecha.
import { CHAR_RADIUS } from './constants';
import type { Obstacle } from './collision';
import type { Character } from './entities';
import { dirOf } from './math';
import { NO_MODS } from './mutations';
import type { Simulation } from './sim';

export type WeaponId = 'pistol' | 'uzi' | 'shotgun' | 'launcher';
/** El índice viaja por la red: las armas nuevas se agregan siempre al final. */
export const WEAPON_IDS: WeaponId[] = ['pistol', 'uzi', 'shotgun', 'launcher'];

export interface WeaponDef {
  id: WeaponId;
  name: string;
  icon: string;
  /** Segundos entre disparos (manteniendo el clic). */
  cd: number;
  /** Daño de cada bala (o de la explosión). */
  dmg: number;
  /** Empuje de cada bala, igual para todos (no escala con lo roto que esté el blanco). */
  kb: number;
  /** Tope del empuje cuando varias balas del mismo disparo dan en el mismo blanco. */
  kbMax: number;
  /** Radianes: desvío al azar de cada bala o, con varios perdigones, ancho total del abanico. */
  spread: number;
  range: number;
  pellets: number;
  /** Balas que trae una caja. 0 = munición infinita. */
  ammo: number;
  /** Cuánto de su velocidad conserva mientras dispara: hay que elegir entre correr y tirar. */
  move: number;
  /** Solo el lanzacohetes: radio de la explosión. */
  blast?: number;
  /** La bala no genera evento de golpe propio (las ráfagas inundarían el canal): alcanza con la traza. */
  quiet?: boolean;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: { id: 'pistol', name: 'Pistola', icon: '🔫', cd: 0.3, dmg: 11, kb: 2.5, kbMax: 2.5, spread: 0.015, range: 19, pellets: 1, ammo: 0, move: 0.85 },
  uzi: { id: 'uzi', name: 'Uzi', icon: '⚡', cd: 0.07, dmg: 5, kb: 1, kbMax: 1, spread: 0.1, range: 16, pellets: 1, ammo: 120, move: 0.7, quiet: true },
  shotgun: { id: 'shotgun', name: 'Escopeta', icon: '💥', cd: 0.7, dmg: 8, kb: 4.5, kbMax: 15, spread: 0.46, range: 9.5, pellets: 7, ammo: 18, move: 0.75 },
  launcher: { id: 'launcher', name: 'Lanzacohetes', icon: '🚀', cd: 1, dmg: 48, kb: 17, kbMax: 17, spread: 0, range: 26, pellets: 1, ammo: 6, move: 0.6, blast: 3.3 },
};

export const C4 = {
  /** Segundos de mecha. */
  fuse: 2.2,
  radius: 4.6,
  heat: 65,
  kb: 22,
  up: 4,
  destruct: 90,
  tile: 60,
  /** Cargas que trae una caja y tope que se puede llevar. */
  perCrate: 2,
  max: 4,
  /** Cargas con las que se empieza. */
  start: 1,
};

/** Segundos que dura el paso lento después de un disparo. */
const GUN_SLOW_TIME = 0.28;
/** Altura desde la que sale la bala (el pecho del héroe). */
const MUZZLE_Y = 0.9;
/** Paso con el que se recorre el rayo buscando algo sólido. */
const RAY_STEP = 0.3;
/** Un poco más ancho que el cuerpo: apuntar con el mouse a algo que se mueve tiene que perdonar. */
const BODY_R = CHAR_RADIUS + 0.14;
/** Las balas les hacen menos daño a las cosas que a los cuerpos (si no, una ráfaga borra la cobertura). */
const VS_OBSTACLE = 0.8;

/** Qué encontró una bala: 0 = nada (llegó al alcance), 1 = un cuerpo, 2 = algo sólido. */
export interface RayHit { x: number; y: number; z: number; kind: 0 | 1 | 2; target: Character | null; ob: Obstacle | null }

/**
 * Recorre un rayo horizontal desde el pecho de `ch`. Si hay un rival sobre la línea, la bala sube o baja
 * hasta su pecho (no hace falta apuntar en altura), y frena antes si en el camino hay algo sólido.
 */
export function castRay(sim: Simulation, ch: Character, dx: number, dz: number, range: number): RayHit {
  const ox = ch.pos.x, oz = ch.pos.z, oy = ch.pos.y + MUZZLE_Y;
  let best: Character | null = null, bt = range;
  for (const t of sim.bodies) {
    if (!t.alive || t.team === ch.team || t.invuln > 0) continue;
    const rx = t.pos.x - ox, rz = t.pos.z - oz;
    const along = rx * dx + rz * dz;
    if (along < 0 || along > bt + BODY_R) continue;
    const perp = Math.abs(rx * dz - rz * dx);
    if (perp > BODY_R || Math.abs(t.pos.y - ch.pos.y) > 2.4) continue;
    const at = Math.max(0, along - Math.sqrt(BODY_R * BODY_R - perp * perp));
    if (at < bt) { bt = at; best = t; }
  }
  const ty = best ? best.pos.y + 0.8 : oy;
  const n = Math.ceil(bt / RAY_STEP);
  for (let i = 1; i <= n; i++) {
    const d = Math.min(bt, i * RAY_STEP);
    const x = ox + dx * d, z = oz + dz * d, y = bt > 0 ? oy + (ty - oy) * (d / bt) : oy;
    const s = sim.cw.solidAt(x, y, z, 0.08);
    if (!s) continue;
    // Las construcciones del propio equipo (la torreta de una mini base) no tapan el tiro.
    const st = s.obstacle ? sim.structureOf(s.obstacle) : null;
    if (st && st.team === ch.team) continue;
    return { x, y, z, kind: 2, target: null, ob: s.obstacle };
  }
  return { x: ox + dx * bt, y: ty, z: oz + dz * bt, kind: best ? 1 : 0, target: best, ob: null };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Hacia dónde apunta: al cursor o, si está encima, hacia donde mira. */
function aimDir(ch: Character) {
  const dx = ch.input.ax - ch.pos.x, dz = ch.input.az - ch.pos.z;
  const d = Math.hypot(dx, dz);
  return d < 0.05 ? dirOf(ch.facing) : { x: dx / d, z: dz / d };
}

/** Un disparo del arma que tiene en la mano. Lo llama la simulación con el clic mantenido y el arma lista. */
export function fireWeapon(sim: Simulation, ch: Character) {
  const w = WEAPONS[WEAPON_IDS[ch.weapon] ?? 'pistol'];
  const aim = aimDir(ch);
  ch.cds.basic = w.cd;
  ch.cdMax.basic = w.cd;
  ch.gunT = Math.max(GUN_SLOW_TIME, w.cd + 0.08);
  ch.gunMove = w.move;

  if (w.blast) {
    sim.fireProjectile(ch, {
      kind: 'rocket', speed: 26, range: w.range, radius: 0.3, heat: 0, kb: 0, dirX: aim.x, dirZ: aim.z, originY: ch.pos.y + MUZZLE_Y,
      // El golpe lo da la explosión, no el cohete.
      onHit: () => {},
      explode: { radius: w.blast, heat: w.dmg, kb: w.kb, up: 2.5, destruct: 60, tile: 45, fx: 'rocket' },
    }, NO_MODS);
  } else {
    const base = Math.atan2(aim.x, aim.z);
    const pts: number[] = [];
    const per = new Map<Character, number>();
    for (let i = 0; i < w.pellets; i++) {
      // Varios perdigones se reparten en abanico (con un poco de azar); una bala sola se desvía al azar.
      const off = w.pellets > 1 ? (i / (w.pellets - 1) - 0.5) * w.spread + sim.rng.range(-0.03, 0.03) : sim.rng.range(-w.spread, w.spread);
      const a = base + off;
      const dx = Math.sin(a), dz = Math.cos(a);
      const h = castRay(sim, ch, dx, dz, w.range);
      pts.push(r1(h.x), r1(h.y), r1(h.z), h.kind);
      if (h.target) per.set(h.target, (per.get(h.target) ?? 0) + 1);
      else if (h.ob) sim.damageObstacle(h.ob, w.dmg * VS_OBSTACLE, ch);
    }
    // Los perdigones que dan en el mismo cuerpo son un solo golpe (así la escopeta de cerca lo lanza).
    for (const [t, n] of per) {
      sim.hit(t, ch, { heat: w.dmg * n, kb: Math.min(w.kbMax, w.kb * n), dirX: aim.x, dirZ: aim.z, fx: 'bullet', flat: true, quiet: w.quiet });
    }
    sim.emit({ k: 'shot', id: ch.id, w: ch.weapon, p: pts });
  }

  if (w.ammo > 0 && --ch.ammo <= 0) {
    // Sin balas: se cae el arma y queda la pistola.
    ch.ammo = 0;
    ch.primary = -1;
    ch.weapon = 0;
    sim.emit({ k: 'wpn', id: ch.id, w: 0, e: 1 });
  }
}

/** Cambia entre la pistola y el arma principal (si tiene una). */
export function swapWeapon(sim: Simulation, ch: Character) {
  if (ch.primary < 0) { sim.emit({ k: 'deny', id: ch.id, w: 'weapon' }); return; }
  ch.weapon = ch.weapon === 0 ? ch.primary : 0;
  ch.cds.basic = Math.max(ch.cds.basic, 0.22);
  sim.emit({ k: 'wpn', id: ch.id, w: ch.weapon, e: 0 });
}

/** Le da un arma principal: si ya tenía esa, suma munición (hasta el doble de una caja); si tenía otra, la reemplaza. */
export function giveWeapon(sim: Simulation, ch: Character, id: WeaponId) {
  const idx = WEAPON_IDS.indexOf(id);
  const def = WEAPONS[id];
  ch.ammo = ch.primary === idx ? Math.min(def.ammo * 2, ch.ammo + def.ammo) : def.ammo;
  ch.primary = idx;
  ch.weapon = idx;
  sim.emit({ k: 'wpn', id: ch.id, w: idx, e: 0 });
}

/** Deja una carga a sus pies: avisa el área y explota al terminar la mecha. No lastima a su equipo. */
export function plantC4(sim: Simulation, ch: Character) {
  const x = ch.pos.x, z = ch.pos.z;
  const y = sim.cw.groundAt(x, z, ch.pos.y + 0.5);
  if (ch.c4 <= 0 || y === -Infinity) { sim.emit({ k: 'deny', id: ch.id, w: 'c4' }); return; }
  ch.c4--;
  const team = ch.team;
  sim.telegraph('c4', team, x, y, z, C4.radius, C4.fuse);
  sim.emit({ k: 'c4', id: ch.id, x: r1(x), y: r1(y), z: r1(z), f: C4.fuse });
  sim.schedule(C4.fuse, () => {
    sim.blast(ch, team, x, y + 0.5, z, { radius: C4.radius, heat: C4.heat, kb: C4.kb, up: C4.up, destruct: C4.destruct, tile: C4.tile, fx: 'c4' }, NO_MODS);
  });
}
