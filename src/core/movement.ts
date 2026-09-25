// Movimiento del personaje. Código compartido: el host lo usa para simular a todos y el cliente
// para predecir su propio personaje (misma función = misma respuesta, menos correcciones).
import {
  AIR_ACCEL, AIR_JUMP_V, CHAR_RADIUS, COYOTE, DI_ACCEL, GRAVITY, GROUND_ACCEL, GROUND_DECEL,
  HIT_SLIDE_ACCEL, JUMP_V, MANTLE_H, STEP_DOWN, STEP_UP, TUMBLE_DRAG, TUMBLE_FRICTION,
} from './constants';
import type { CollisionWorld, Obstacle } from './collision';
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
}

export interface MoveParams {
  speed: number;
  lock: boolean; // una acción controla la velocidad (dash, salto de ulti...)
  airControl: number;
  restitution: number;
  maxAirJumps: number;
  jumpMul: number;
  noGravity: boolean;
}

export interface WallHit {
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
}

export const newMoveOut = (): MoveOut => ({ wallHits: [], landed: 0, jumped: false, airJumped: false, mantled: false });

export const defaultMoveParams = (): MoveParams => ({
  speed: 6, lock: false, airControl: 1, restitution: 0.3, maxAirJumps: 1, jumpMul: 1, noGravity: false,
});

const MAX_SUBSTEP = 0.3;
const TERMINAL_V = 45;

export function canAct(s: MoveState) {
  return s.stun <= 0 && s.hitstun <= 0;
}

export function stepMove(s: MoveState, inp: InputFrame, p: MoveParams, cw: CollisionWorld, dt: number, out: MoveOut) {
  out.wallHits.length = 0;
  out.landed = 0;
  out.jumped = out.airJumped = out.mantled = false;

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

  if (p.lock) {
    // La acción maneja la velocidad horizontal.
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
  if (free && pressed(inp.b, s.prevB, BTN.JUMP)) {
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

  if (!s.grounded && !p.noGravity) s.vel.y = Math.max(-TERMINAL_V, s.vel.y - GRAVITY * dt);

  // Horizontal, con subpasos para que los cuerpos rápidos no atraviesen cosas.
  const dx = s.vel.x * dt, dz = s.vel.z * dt;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / MAX_SUBSTEP));
  let blockX = false, blockZ = false;
  for (let i = 0; i < n; i++) {
    if (!blockX && dx !== 0) blockX = moveAxis(s, true, dx / n, p, cw, out, wx, wz);
    if (!blockZ && dz !== 0) blockZ = moveAxis(s, false, dz / n, p, cw, out, wx, wz);
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
        s.coyote = 0;
      }
    }
  }
}

function moveAxis(s: MoveState, isX: boolean, d: number, p: MoveParams, cw: CollisionWorld, out: MoveOut, wx: number, wz: number): boolean {
  const nx = isX ? s.pos.x + d : s.pos.x;
  const nz = isX ? s.pos.z : s.pos.z + d;
  const b = cw.blockAt(nx, nz, CHAR_RADIUS, s.pos.y);
  if (!b) {
    s.pos.x = nx;
    s.pos.z = nz;
    return false;
  }
  // Trepar un borde (recuperación): en el aire, empujando contra una cornisa baja.
  const rise = b.top - s.pos.y;
  if (!s.grounded && canAct(s) && !p.lock && rise > 0 && rise <= MANTLE_H && s.vel.y < 5) {
    const into = (isX ? wx : wz) * Math.sign(d);
    if (into > 0.3) {
      const mx = isX ? nx + Math.sign(d) * 0.6 : nx;
      const mz = isX ? nz : nz + Math.sign(d) * 0.6;
      const g = cw.groundAt(mx, mz, b.top + 0.05);
      if (g > -Infinity && g >= b.top - 0.1 && !cw.blockAt(mx, mz, CHAR_RADIUS, g)) {
        s.pos.x = mx;
        s.pos.z = mz;
        s.pos.y = g;
        s.vel.y = 0;
        s.grounded = true;
        s.airJumps = p.maxAirJumps;
        s.tumble = 0;
        out.mantled = true;
        return false;
      }
    }
  }
  const v = isX ? s.vel.x : s.vel.z;
  out.wallHits.push({
    nx: isX ? -Math.sign(d) : 0,
    nz: isX ? 0 : -Math.sign(d),
    speed: Math.abs(v),
    obstacle: b.obstacle,
    x: s.pos.x, y: s.pos.y, z: s.pos.z,
  });
  const nv = s.tumble > 0 ? -v * p.restitution : 0;
  if (isX) s.vel.x = nv; else s.vel.z = nv;
  return true;
}
