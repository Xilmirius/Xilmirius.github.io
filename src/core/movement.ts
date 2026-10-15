// Movimiento del personaje. Código compartido: el host lo usa para simular a todos y el cliente
// para predecir su propio personaje (misma función = misma respuesta, menos correcciones).
import {
  AIR_ACCEL, AIR_DASHES, AIR_JUMP_V, CHAR_RADIUS, COYOTE, DASH_CD, DASH_END_KEEP, DASH_SPEED, DASH_TIME, DI_ACCEL, GRAVITY,
  GROUND_ACCEL, GROUND_DECEL, HIT_SLIDE_ACCEL, JUMP_V, MANTLE_H, STEP_DOWN, STEP_UP, TUMBLE_DRAG, TUMBLE_FRICTION,
} from './constants';
import type { CollisionWorld, Obstacle } from './collision';
import { PAD_V } from './gadgets';
import { BTN, held, pressed, type InputFrame } from './input';
import { approach2, dirOf, yawOf, type V3 } from './math';

export interface MoveState {
  pos: V3;
  vel: V3;
  facing: number;
  grounded: boolean;
  airJumps: number;
  coyote: number;
  prevB: number;
  tumble: number; // > 0: lanzado (el cuerpo es un proyectil)
  hitstun: number; // no puede actuar ni corregir en el aire
  stun: number;
  hitSlide: number; // tras un empujón chico: poca tracción
  dashT: number; // > 0: en pleno dash
  dashCd: number;
  dashX: number;
  dashZ: number;
  airDashes: number;
}

/** Campos de dash en reposo (para armar estados de movimiento a mano). */
export const DASH_IDLE = { dashT: 0, dashCd: 0, dashX: 0, dashZ: 0, airDashes: AIR_DASHES };

export interface MoveParams {
  speed: number;
  lock: boolean; // una acción controla la velocidad (dash, salto de ulti...)
  airControl: number;
  restitution: number;
  maxAirJumps: number;
  jumpMul: number;
  noGravity: boolean;
  dash: boolean; // las reglas habilitan el dash (Shift)
  jump: boolean; // las reglas habilitan el salto (Espacio)
  gravityMul: number; // multiplicador de la gravedad (menos de 1 = flota más)
  dashCd: number; // segundos que tarda en volver el dash
}

export interface WallHit {
  /** Normal de la superficie (unitaria, hacia el cuerpo) y la velocidad con la que el cuerpo venía contra ella. */
  nx: number; nz: number; speed: number;
  obstacle: Obstacle | null;
  x: number; y: number; z: number;
}

export interface MoveOut {
  wallHits: WallHit[];
  landed: number; // velocidad vertical de impacto al aterrizar (0 si no aterrizó)
  jumped: boolean;
  airJumped: boolean;
  mantled: boolean;
  dashed: boolean;
  /** Pisó un resorte y salió disparado hacia arriba. */
  bounced: boolean;
}

export const newMoveOut = (): MoveOut => ({ wallHits: [], landed: 0, jumped: false, airJumped: false, mantled: false, dashed: false, bounced: false });

export const defaultMoveParams = (): MoveParams => ({
  speed: 6, lock: false, airControl: 1, restitution: 0.3, maxAirJumps: 1, jumpMul: 1, noGravity: false, dash: false,
  jump: true, gravityMul: 1, dashCd: DASH_CD,
});

const MAX_SUBSTEP = 0.3;
const TERMINAL_V = 45;

export function canAct(s: MoveState) {
  return s.stun <= 0 && s.hitstun <= 0;
}

export function stepMove(s: MoveState, inp: InputFrame, p: MoveParams, cw: CollisionWorld, dt: number, out: MoveOut) {
  out.wallHits.length = 0;
  out.landed = 0;
  out.jumped = out.airJumped = out.mantled = out.dashed = out.bounced = false;

  s.dashCd = Math.max(0, s.dashCd - dt);
  s.hitstun = Math.max(0, s.hitstun - dt);
  s.stun = Math.max(0, s.stun - dt);
  s.coyote = Math.max(0, s.coyote - dt);
  s.hitSlide = Math.max(0, s.hitSlide - dt);

  const act = canAct(s);
  const free = act && !p.lock;

  // Mira siempre al cursor (D-0011).
  if (free) {
    const dx = inp.ax - s.pos.x, dz = inp.az - s.pos.z;
    if (dx * dx + dz * dz > 0.0025) s.facing = yawOf(dx, dz);
  }

  // Dirección deseada
  let wx = inp.mx, wz = inp.mz;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }
  if (!act) { wx = 0; wz = 0; }

  let spd = p.speed;
  if (held(inp.b, BTN.PUSH)) spd *= 0.55;
  if (held(inp.b, BTN.REPAIR)) spd *= 0.35;
  if (wx !== 0 || wz !== 0) {
    // Más lento de costado o de espaldas a donde mira.
    const f = dirOf(s.facing);
    const l = Math.hypot(wx, wz);
    const dot = (wx * f.x + wz * f.z) / l;
    spd *= dot >= 0 ? 0.86 + 0.14 * dot : 0.86 + 0.12 * dot;
  }

  // Dash (Shift): ráfaga corta hacia donde caminás, o hacia donde mirás si estás quieto.
  // No cancela un lanzamiento: para recuperarte primero usás el segundo salto y después el dash.
  if (p.dash && free && s.tumble <= 0 && s.dashT <= 0 && s.dashCd <= 0 && pressed(inp.b, s.prevB, BTN.DASH) && (s.grounded || s.airDashes > 0)) {
    let dx = wx, dz = wz;
    if (dx === 0 && dz === 0) { const f = dirOf(s.facing); dx = f.x; dz = f.z; }
    const l = Math.hypot(dx, dz) || 1;
    s.dashX = dx / l;
    s.dashZ = dz / l;
    s.dashT = DASH_TIME;
    s.dashCd = p.dashCd;
    s.hitSlide = 0;
    if (!s.grounded) s.airDashes--;
    out.dashed = true;
  }
  const dashing = s.dashT > 0 && !p.lock && s.tumble <= 0;
  if (s.dashT > 0) {
    s.dashT = Math.max(0, s.dashT - dt);
    if (!dashing || !act) s.dashT = 0;
  }

  if (p.lock) {
    // La acción maneja la velocidad horizontal.
  } else if (dashing) {
    s.vel.x = s.dashX * DASH_SPEED;
    s.vel.z = s.dashZ * DASH_SPEED;
    s.vel.y = 0;
    if (s.dashT <= 0) { s.vel.x *= DASH_END_KEEP; s.vel.z *= DASH_END_KEEP; }
  } else if (s.tumble > 0) {
    if (s.grounded) {
      approach2(s.vel, 0, 0, TUMBLE_FRICTION * dt);
    } else {
      const k = Math.exp(-TUMBLE_DRAG * dt);
      s.vel.x *= k;
      s.vel.z *= k;
    }
    if (act) {
      s.vel.x += wx * DI_ACCEL * p.airControl * dt;
      s.vel.z += wz * DI_ACCEL * p.airControl * dt;
    }
    s.tumble -= dt;
    const hs = Math.hypot(s.vel.x, s.vel.z);
    if ((s.grounded && hs < 3.5 && s.hitstun <= 0) || s.tumble <= 0) s.tumble = 0;
  } else if (s.grounded) {
    const accel = s.hitSlide > 0 ? HIT_SLIDE_ACCEL : wx !== 0 || wz !== 0 ? GROUND_ACCEL : GROUND_DECEL;
    approach2(s.vel, wx * spd, wz * spd, accel * dt);
  } else {
    const accel = (s.hitSlide > 0 ? HIT_SLIDE_ACCEL : AIR_ACCEL) * p.airControl;
    approach2(s.vel, wx * spd, wz * spd, accel * dt);
  }

  // Salto y salto aéreo (recuperación estilo Smash: saltar cancela el tumble).
  if (p.jump && free && pressed(inp.b, s.prevB, BTN.JUMP)) {
    if (s.grounded || s.coyote > 0) {
      s.vel.y = JUMP_V * p.jumpMul;
      s.grounded = false;
      s.coyote = 0;
      out.jumped = true;
    } else if (s.airJumps > 0) {
      s.vel.y = AIR_JUMP_V * p.jumpMul;
      s.airJumps--;
      out.airJumped = true;
      if (s.tumble > 0) {
        s.tumble = 0;
        s.vel.x *= 0.45;
        s.vel.z *= 0.45;
      }
    }
  }
  s.prevB = inp.b;

  if (!s.grounded && !p.noGravity && !dashing) s.vel.y = Math.max(-TERMINAL_V, s.vel.y - GRAVITY * p.gravityMul * dt);

  // Si quedó encimado con un obstáculo (un muro o una torreta que apareció encima), sacarlo primero:
  // si no, cada paso seguiría chocando y el personaje quedaría trabado.
  depenetrate(s, cw);

  // Horizontal: se avanza el paso entero y se sacan los contactos por su normal (mover y deslizar, MALLA.md §6), con
  // subpasos para que los cuerpos rápidos no atraviesen cosas. La velocidad se lee en cada subpaso: un contacto la cambia.
  if (s.vel.x !== 0 || s.vel.z !== 0) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(s.vel.x), Math.abs(s.vel.z)) * dt / MAX_SUBSTEP));
    for (let i = 0; i < n; i++) {
      const px = s.pos.x, pz = s.pos.z;
      s.pos.x += (s.vel.x * dt) / n;
      s.pos.z += (s.vel.z * dt) / n;
      slide(s, p, cw, out, wx, wz, px, pz);
    }
  }

  // Vertical
  const prevY = s.pos.y;
  if (s.grounded) {
    const g = cw.groundAt(s.pos.x, s.pos.z, prevY + STEP_UP);
    if (g > -Infinity && prevY - g <= STEP_DOWN && s.vel.y <= 0) {
      s.pos.y = g;
      s.vel.y = 0;
    } else {
      s.grounded = false;
      s.coyote = s.tumble > 0 ? 0 : COYOTE;
    }
  }
  if (!s.grounded) {
    s.pos.y += s.vel.y * dt;
    if (s.vel.y <= 0) {
      const g = cw.groundAt(s.pos.x, s.pos.z, prevY + STEP_UP);
      if (g > -Infinity && s.pos.y <= g) {
        out.landed = -s.vel.y;
        s.pos.y = g;
        s.vel.y = 0;
        s.grounded = true;
        s.airJumps = p.maxAirJumps;
        s.airDashes = AIR_DASHES;
        s.coyote = 0;
      }
    }
  }

  // Resorte: es terreno, así que el host y la predicción del cliente rebotan en el mismo tick.
  if (s.grounded && cw.terrain.isPad(s.pos.x, s.pos.z) && Math.abs(s.pos.y - cw.terrain.groundAt(s.pos.x, s.pos.z)) < 0.05) {
    s.vel.y = PAD_V;
    s.grounded = false;
    s.coyote = 0;
    s.dashT = 0;
    s.airJumps = p.maxAirJumps;
    s.airDashes = AIR_DASHES;
    out.bounced = true;
  }
}

/** Distancia máxima que se "empuja" un cuerpo para sacarlo de un obstáculo (más que eso no es encimarse). */
const DEPEN_MAX = 1.6;

/**
 * Saca un cuerpo de adentro de un obstáculo (no del terreno) hacia la cara libre más cercana, prefiriendo
 * caer en piso firme. Si no hay salida al costado, lo sube arriba del obstáculo. Determinista: host y
 * predicción del cliente hacen exactamente lo mismo.
 */
export function depenetrate(s: MoveState, cw: CollisionWorld) {
  const b = cw.blockAt(s.pos.x, s.pos.z, CHAR_RADIUS, s.pos.y);
  if (!b || !b.obstacle) return;
  const e = CHAR_RADIUS + 0.02;
  const opts = [
    { x: b.minX - e, z: s.pos.z }, { x: b.maxX + e, z: s.pos.z },
    { x: s.pos.x, z: b.minZ - e }, { x: s.pos.x, z: b.maxZ + e },
  ].map((o) => ({ ...o, d: Math.hypot(o.x - s.pos.x, o.z - s.pos.z) })).sort((a, c) => a.d - c.d);
  for (const solid of [true, false]) {
    for (const o of opts) {
      if (o.d > DEPEN_MAX) continue;
      if (solid && cw.groundAt(o.x, o.z, s.pos.y + STEP_UP) === -Infinity) continue;
      if (cw.blockAt(o.x, o.z, CHAR_RADIUS, s.pos.y)) continue;
      s.pos.x = o.x;
      s.pos.z = o.z;
      return;
    }
    if (solid) {
      // Sin salida con piso al costado: subirlo arriba del obstáculo antes que tirarlo al vacío.
      const g = cw.groundAt(s.pos.x, s.pos.z, b.top + 0.05);
      if (g >= b.top - 0.05) {
        s.pos.y = g;
        s.vel.y = 0;
        s.grounded = true;
        return;
      }
    }
  }
}

/** Cuántas veces se vuelve a mirar los contactos en un subpaso (una esquina de dos paredes necesita dos). */
const SLIDE_PASSES = 3;
/** Cuánto sobra al sacar al cuerpo de una pared, para que no quede justo sobre el borde. */
const SKIN = 0.001;
/** Una penetración que quedó después de todas las vueltas y es más chica que esto se tolera. */
const FIT_TOL = 0.02;
/** Una velocidad contra la pared menor que esto no es un golpe. */
const HIT_MIN = 1e-3;

/**
 * Mover y deslizar (docs/MALLA.md §6). El cuerpo ya avanzó su paso: se miran los contactos del círculo, se saca al cuerpo
 * por la normal del más profundo, se le quita a la velocidad lo que iba contra esa normal (un cuerpo lanzado rebota con su
 * restitución) y se repite hasta `SLIDE_PASSES` veces. Cada contacto contra el que venía el cuerpo es un golpe. Si después de todo
 * sigue metido (un hueco más angosto que el cuerpo), no avanza: vuelve a `(px, pz)`, donde estaba antes del subpaso.
 */
function slide(s: MoveState, p: MoveParams, cw: CollisionWorld, out: MoveOut, wx: number, wz: number, px: number, pz: number) {
  for (let pass = 0; ; pass++) {
    const list = cw.contacts(s.pos.x, s.pos.z, CHAR_RADIUS, s.pos.y);
    if (list.length === 0) return;
    let c = list[0];
    for (let i = 1; i < list.length; i++) if (list[i].depth > c.depth) c = list[i];
    if (pass === SLIDE_PASSES) {
      if (c.depth > FIT_TOL) { s.pos.x = px; s.pos.z = pz; }
      return;
    }
    // Trepar un borde (recuperación): en el aire, empujando contra una cornisa baja.
    const rise = c.top - s.pos.y;
    if (!s.grounded && canAct(s) && !p.lock && rise > 0 && rise <= MANTLE_H && s.vel.y < 5 && -(wx * c.nx + wz * c.nz) > 0.3) {
      const mx = s.pos.x - c.nx * 0.6, mz = s.pos.z - c.nz * 0.6;
      const g = cw.groundAt(mx, mz, c.top + 0.05);
      if (g > -Infinity && g >= c.top - 0.1 && !cw.blockAt(mx, mz, CHAR_RADIUS, g)) {
        s.pos.x = mx;
        s.pos.z = mz;
        s.pos.y = g;
        s.vel.y = 0;
        s.grounded = true;
        s.airJumps = p.maxAirJumps;
        s.airDashes = AIR_DASHES;
        s.tumble = 0;
        out.mantled = true;
        return;
      }
    }
    s.pos.x += c.nx * (c.depth + SKIN);
    s.pos.z += c.nz * (c.depth + SKIN);
    const vn = s.vel.x * c.nx + s.vel.z * c.nz;
    if (vn < -HIT_MIN) {
      out.wallHits.push({ nx: c.nx, nz: c.nz, speed: -vn, obstacle: c.obstacle, x: s.pos.x, y: s.pos.y, z: s.pos.z });
      const k = (s.tumble > 0 ? 1 + p.restitution : 1) * -vn;
      s.vel.x += c.nx * k;
      s.vel.z += c.nz * k;
    }
  }
}
