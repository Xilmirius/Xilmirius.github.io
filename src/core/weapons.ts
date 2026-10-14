// Armas: con las reglas que las prenden (`weapons`, hoy la Horda) el clic dispara en vez del golpe básico
// del héroe. Las balas son de impacto instantáneo: se resuelven en el host recorriendo el rayo y viajan a
// los clientes como un evento `shot` (para la traza, el fogonazo y el sonido), sin proyectiles en el snapshot.
// El lanzacohetes sí es un proyectil, y el C4 es una carga con mecha.
import { CHAR_RADIUS } from './constants';
import type { Obstacle } from './collision';
import type { Character } from './entities';
import { dirOf } from './math';
import { NO_MODS } from './mutations';
import { PERK, perkLv } from './perks';
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

/** Niveles de arma (tarea 05): cuántos hay y cuánta chatarra cuesta subir de cada uno al siguiente (índice = nivel actual - 1). */
export const WEAPON_MAX_LV = 5;
export const UPGRADE_COST = [15, 30, 50, 80];
/** Lo que da subir de nivel: +35 % de daño en el 2 y en el 4, 50 % más balas por caja desde el 3, y lo propio de cada arma (ver `weaponStats`). */
export const WLV = { dmg: 0.35, ammo: 1.5, uziRate: 1.3, shotgunPellets: 3, blast: 1.3, shotgunKb: 2, shotgunRange: 1.25, boomRadius: 1.5, boomDmg: 0.5, clusterRadius: 0.5, clusterDmg: 0.4, clusterDelay: 0.25, burnTime: 3, burnEvery: 0.5, burnDmg: 3 };

/** Chatarra que cuesta subir un arma de este nivel al siguiente (0 si ya está al máximo). */
export const upgradeCost = (lv: number) => (lv >= 1 && lv < WEAPON_MAX_LV ? UPGRADE_COST[lv - 1] : 0);

/** Lo que hace un arma de cierto nivel: la ficha base con los números ya resueltos y lo que solo trae el nivel. */
export interface WeaponStats extends WeaponDef {
  lv: number;
  /** Balas que atraviesan un cuerpo más (pistola nivel 3). */
  extraPierce: number;
  /** Cada bala explota en chico al dar (pistola nivel 5). */
  boom: boolean;
  /** Prende fuego a lo que toca (uzi nivel 5). */
  fire: boolean;
  /** Tres explosiones chicas alrededor después de la primera (lanzacohetes nivel 5). */
  cluster: boolean;
}

export function weaponStats(id: WeaponId, lv: number): WeaponStats {
  const w = WEAPONS[id];
  const s: WeaponStats = { ...w, lv, extraPierce: 0, boom: false, fire: false, cluster: false };
  s.dmg = w.dmg * (1 + WLV.dmg * ((lv >= 2 ? 1 : 0) + (lv >= 4 ? 1 : 0)));
  if (lv >= 3) {
    if (id === 'pistol') s.extraPierce = 1;
    else if (id === 'uzi') s.cd = w.cd / WLV.uziRate;
    else if (id === 'shotgun') s.pellets = w.pellets + WLV.shotgunPellets;
    else if (id === 'launcher') s.blast = (w.blast ?? 0) * WLV.blast;
  }
  if (lv >= 5) {
    if (id === 'pistol') s.boom = true;
    else if (id === 'uzi') s.fire = true;
    else if (id === 'shotgun') { s.kb = w.kb * WLV.shotgunKb; s.kbMax = w.kbMax * WLV.shotgunKb; s.range = w.range * WLV.shotgunRange; }
    else if (id === 'launcher') s.cluster = true;
  }
  return s;
}

/** Qué da cada nivel de cada arma (índice = nivel - 2): lo que se muestra en el taller. */
const pct = (n: number) => Math.round(n * 100);
const DMG = `+${pct(WLV.dmg)} % de daño`;
const AMMO = `+${pct(WLV.ammo - 1)} % de balas por caja`;
export const WEAPON_LEVEL_TEXT: Record<WeaponId, string[]> = {
  pistol: [DMG, 'Las balas atraviesan un zombi más', DMG, 'Cada bala explota en chico al dar'],
  uzi: [DMG, `${pct(WLV.uziRate - 1)} % más de cadencia · ${AMMO}`, DMG, `Balas incendiarias: el zombi arde ${WLV.burnTime} s`],
  shotgun: [DMG, `${WLV.shotgunPellets} perdigones más · ${AMMO}`, DMG, `Derriba: el doble de empuje y ${pct(WLV.shotgunRange - 1)} % más de alcance`],
  launcher: [DMG, `Explosión ${pct(WLV.blast - 1)} % más grande · ${AMMO}`, DMG, 'Racimo: tres explosiones chicas alrededor'],
};

/** La siguiente arma que se puede sacar (la tiene y, si gasta balas, le quedan) yendo en el sentido `dir`; -1 si no hay otra. */
export function nextWeapon(levels: number[], ammo: number[], cur: number, dir: 1 | -1 = 1): number {
  const n = WEAPON_IDS.length;
  for (let i = 1; i < n; i++) {
    const j = (cur + dir * i + n * 2) % n;
    if ((levels[j] ?? 0) > 0 && (j === 0 || (ammo[j] ?? 0) > 0)) return j;
  }
  return -1;
}

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
/** Radianes entre las dos balas de la pistola doble. */
const TWIN_FAN = 0.07;

/** Balas que le da una caja de esta arma (más con Bandolera y desde el nivel 3). */
export function crateAmmo(ch: Character, id: WeaponId) {
  const idx = WEAPON_IDS.indexOf(id);
  return Math.round(WEAPONS[id].ammo * (1 + PERK.ammo * perkLv(ch, 'ammo')) * ((ch.wLv[idx] ?? 0) >= 3 ? WLV.ammo : 1));
}

/** Cargas de C4 que puede llevar (más con Demoledor). */
export function c4Max(ch: Character) {
  return C4.max + PERK.c4 * perkLv(ch, 'demo');
}

/** Qué encontró una bala: 0 = nada (llegó al alcance), 1 = un cuerpo, 2 = algo sólido. */
export interface RayHit { x: number; y: number; z: number; kind: 0 | 1 | 2; target: Character | null; ob: Obstacle | null }
/** En el evento `shot`, un cuerpo al que la bala le dio de crítico viaja con este valor en vez de 1. */
export const SHOT_CRIT = 3;

/**
 * Recorre un rayo horizontal desde el pecho de `ch`. Si hay un rival sobre la línea, la bala sube o baja
 * hasta su pecho (no hace falta apuntar en altura), y frena antes si en el camino hay algo sólido.
 * `skip`: cuerpos que la bala ya atravesó (balas perforantes).
 */
export function castRay(sim: Simulation, ch: Character, dx: number, dz: number, range: number, skip?: Character[]): RayHit {
  const ox = ch.pos.x, oz = ch.pos.z, oy = ch.pos.y + MUZZLE_Y;
  let best: Character | null = null, bt = range;
  for (const t of sim.bodies) {
    if (!t.alive || t.team === ch.team || t.invuln > 0 || skip?.includes(t)) continue;
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
  const idx = ch.weapon;
  const w = weaponStats(WEAPON_IDS[idx] ?? 'pistol', ch.wLv[idx] ?? 1);
  const aim = aimDir(ch);
  // Mejoras (core/perks.ts): cadencia, daño, paso al disparar, balas que atraviesan, críticos y pistola doble.
  const cd = w.cd / (1 + PERK.rate * perkLv(ch, 'rate'));
  const dmg = w.dmg * (1 + PERK.dmg * perkLv(ch, 'dmg'));
  ch.cds.basic = cd;
  ch.cdMax.basic = cd;
  ch.gunT = Math.max(GUN_SLOW_TIME, cd + 0.08);
  ch.gunMove = perkLv(ch, 'legs') ? 1 : w.move;

  if (w.blast) {
    sim.fireProjectile(ch, {
      kind: 'rocket', speed: 26, range: w.range, radius: 0.3, heat: 0, kb: 0, dirX: aim.x, dirZ: aim.z, originY: ch.pos.y + MUZZLE_Y,
      // El golpe lo da la explosión, no el cohete.
      onHit: () => {},
      explode: {
        radius: w.blast, heat: dmg, kb: w.kb, up: 2.5, destruct: 60, tile: 45, fx: 'rocket',
        // Racimo: tres explosiones chicas alrededor un instante después.
        then: w.cluster ? (x, y, z) => {
          sim.schedule(WLV.clusterDelay, () => {
            for (let i = 0; i < 3; i++) {
              const a = (i / 3) * Math.PI * 2 + sim.rng.range(0, 1);
              sim.blast(ch, ch.team, x + Math.cos(a) * 2, y, z + Math.sin(a) * 2, { radius: w.blast! * WLV.clusterRadius * 1.6, heat: dmg * WLV.clusterDmg, kb: w.kb * 0.5, up: 1.5, destruct: 20, tile: 15, fx: 'rocket' }, NO_MODS);
            }
          });
        } : undefined,
      },
    }, NO_MODS);
    sim.emit({ k: 'shot', id: ch.id, w: idx, lv: w.lv, p: [] });
  } else {
    const twin = w.id === 'pistol' && perkLv(ch, 'twin') > 0;
    const pellets = w.pellets + (twin ? 1 : 0);
    const fan = twin ? TWIN_FAN : w.spread;
    const through = perkLv(ch, 'pierce') + w.extraPierce;
    const critP = PERK.crit * perkLv(ch, 'crit');
    const base = Math.atan2(aim.x, aim.z);
    const pts: number[] = [];
    // Por cada cuerpo tocado: cuántas balas le dieron y dónde quedó anotado en `pts` (para marcar el crítico).
    const per = new Map<Character, { n: number; at: number[] }>();
    for (let i = 0; i < pellets; i++) {
      // Varios perdigones se reparten en abanico (con un poco de azar); una bala sola se desvía al azar.
      const off = pellets > 1 ? (i / (pellets - 1) - 0.5) * fan + sim.rng.range(-0.03, 0.03) : sim.rng.range(-w.spread, w.spread);
      const a = base + off;
      const dx = Math.sin(a), dz = Math.cos(a);
      // La bala sigue de largo mientras le queden cuerpos por atravesar.
      const skip: Character[] = [];
      for (;;) {
        const h = castRay(sim, ch, dx, dz, w.range, skip);
        pts.push(r1(h.x), r1(h.y), r1(h.z), h.kind);
        if (!h.target) {
          if (h.ob) sim.damageObstacle(h.ob, dmg * VS_OBSTACLE, ch);
          break;
        }
        const e = per.get(h.target) ?? { n: 0, at: [] };
        e.n++;
        e.at.push(pts.length - 1);
        per.set(h.target, e);
        if (skip.length >= through) break;
        skip.push(h.target);
      }
    }
    // Los perdigones que dan en el mismo cuerpo son un solo golpe (así la escopeta de cerca lo lanza).
    for (const [t, e] of per) {
      const crit = critP > 0 && sim.rng.chance(critP);
      if (crit) for (const at of e.at) pts[at] = SHOT_CRIT;
      // Un crítico siempre muestra su número, aunque el arma sea de las que no avisan cada bala.
      sim.hit(t, ch, {
        heat: dmg * e.n * (crit ? PERK.critMul : 1), kb: Math.min(w.kbMax, w.kb * e.n) * (crit ? PERK.critKb : 1),
        dirX: aim.x, dirZ: aim.z, fx: 'bullet', flat: true, quiet: w.quiet && !crit,
      });
    }
    sim.emit({ k: 'shot', id: ch.id, w: idx, lv: w.lv, p: pts });
    // Pistola nivel 5: cada bala que da en un cuerpo explota en chico. Uzi nivel 5: lo prende fuego.
    if (w.boom) for (const t of per.keys()) sim.blast(ch, ch.team, t.pos.x, t.pos.y + 0.7, t.pos.z, { radius: WLV.boomRadius, heat: dmg * WLV.boomDmg, kb: 2, fx: 'bullet' }, NO_MODS);
    if (w.fire) for (const t of per.keys()) if (t.alive && t.unit !== 'hero') sim.ignite(t, ch);
  }

  if (w.ammo > 0 && --ch.wAmmo[idx] <= 0) {
    // Sin balas: el arma queda vacía (no se pierde ni su nivel) y se pasa a la pistola.
    ch.wAmmo[idx] = 0;
    ch.weapon = 0;
    sim.emit({ k: 'wpn', id: ch.id, w: 0, e: 1 });
  }
}

/** ¿Se puede sacar esta arma? La tiene y, si gasta balas, le quedan. */
export const usable = (ch: Character, idx: number) => (ch.wLv[idx] ?? 0) > 0 && (idx === 0 || ch.wAmmo[idx] > 0);

/** Saca el arma `idx` (comando de la rueda y las teclas 1 a 4, y bots). */
export function selectWeapon(sim: Simulation, ch: Character, idx: number) {
  if (!Number.isInteger(idx) || idx < 0 || idx >= WEAPON_IDS.length || idx === ch.weapon) return;
  if (!usable(ch, idx)) { sim.emit({ k: 'deny', id: ch.id, w: 'weapon' }); return; }
  ch.weapon = idx;
  ch.cds.basic = Math.max(ch.cds.basic, 0.22);
  sim.emit({ k: 'wpn', id: ch.id, w: idx, e: 0 });
}

/** Pasa a la siguiente arma que se pueda usar (tecla Q). */
export function swapWeapon(sim: Simulation, ch: Character) {
  const j = nextWeapon(ch.wLv, ch.wAmmo, ch.weapon, 1);
  if (j >= 0) selectWeapon(sim, ch, j);
  else sim.emit({ k: 'deny', id: ch.id, w: 'weapon' });
}

/**
 * Le da un arma (caja): si no la tenía la suma en nivel 1 y la saca; si ya la tenía, suma balas
 * (hasta el triple de una caja) y, si estaba vacía, la saca.
 */
export function giveWeapon(sim: Simulation, ch: Character, id: WeaponId) {
  const idx = WEAPON_IDS.indexOf(id);
  const n = crateAmmo(ch, id);
  const had = ch.wLv[idx] > 0, wasEmpty = ch.wAmmo[idx] <= 0;
  if (!had) ch.wLv[idx] = 1;
  ch.wAmmo[idx] = Math.min(n * 3, ch.wAmmo[idx] + n);
  if (!had || wasEmpty) { ch.weapon = idx; sim.emit({ k: 'wpn', id: ch.id, w: idx, e: 0 }); }
}

/** Recarga una caja entera a todas las armas que lleva (Bandolera). */
export function refillWeapons(ch: Character) {
  for (let i = 1; i < WEAPON_IDS.length; i++) if (ch.wLv[i] > 0) ch.wAmmo[i] = Math.max(ch.wAmmo[i], crateAmmo(ch, WEAPON_IDS[i]));
}

/** Compra el siguiente nivel de un arma con chatarra. Lo valida todo: no cambia nada si algo no cierra. */
export function upgradeWeapon(sim: Simulation, ch: Character, idx: number): boolean {
  if (!sim.rules.weapons || !ch.alive || !Number.isInteger(idx) || idx < 0 || idx >= WEAPON_IDS.length) return false;
  const lv = ch.wLv[idx] ?? 0;
  if (lv < 1) return sim.deny(ch, 'No tenés esa arma');
  if (lv >= WEAPON_MAX_LV) return sim.deny(ch, 'Ya está al máximo');
  if (!sim.mode.workshop?.(sim, ch)) return sim.deny(ch, 'Mejorá las armas en un taller: una mini base o el campamento de salida');
  const cost = upgradeCost(lv);
  if (ch.scrap < cost) return sim.deny(ch, `Faltan ${cost - ch.scrap} de chatarra`);
  ch.scrap -= cost;
  ch.wLv[idx] = lv + 1;
  sim.emit({ k: 'wup', id: ch.id, w: idx, lv: lv + 1 });
  return true;
}

/** Deja una carga a sus pies: avisa el área y explota al terminar la mecha. No lastima a su equipo. */
export function plantC4(sim: Simulation, ch: Character) {
  const x = ch.pos.x, z = ch.pos.z;
  const y = sim.cw.groundAt(x, z, ch.pos.y + 0.5);
  if (ch.c4 <= 0 || y === -Infinity) { sim.emit({ k: 'deny', id: ch.id, w: 'c4' }); return; }
  ch.c4--;
  const team = ch.team;
  const radius = C4.radius * (1 + PERK.c4Radius * perkLv(ch, 'demo'));
  sim.telegraph('c4', team, x, y, z, radius, C4.fuse);
  sim.emit({ k: 'c4', id: ch.id, x: r1(x), y: r1(y), z: r1(z), f: C4.fuse });
  sim.schedule(C4.fuse, () => {
    sim.blast(ch, team, x, y + 0.5, z, { radius, heat: C4.heat, kb: C4.kb, up: C4.up, destruct: C4.destruct, tile: C4.tile, fx: 'c4' }, NO_MODS);
  });
}
