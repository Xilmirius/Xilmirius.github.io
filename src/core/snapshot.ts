// Frames de mundo: lo que el render necesita ver. El host arma uno por tick; los clientes los
// reciben (20 Hz) y los interpolan. Host y cliente dibujan exactamente con el mismo camino.
import { MUTATION_LEVELS, XP_TABLE, MAX_LEVEL, REPAIR_TIME, PUSH_MAX_CHARGE } from './constants';
import type { Character } from './entities';
import { SLOTS } from './entities';
import { lerp, lerpAngle, round2 } from './math';
import type { ModeHud } from './modes';
import type { Simulation } from './sim';
import { FAMILIES, type AbilitySlot, type Route } from './types';

export const F_GROUNDED = 1, F_TUMBLE = 2, F_STUN = 4, F_SHIELD = 8, F_INVULN = 16, F_KBIMM = 32, F_CHARGING = 64,
  F_REPAIRING = 128, F_DEAD = 256, F_SLOWED = 512, F_ARMOR = 1024, F_REFRACT = 2048, F_HITSTUN = 4096,
  F_DISCONNECTED = 8192, F_HASTE = 16384, F_ELIMINATED = 32768, F_ULTREADY = 65536;

export interface CharFrame {
  id: number;
  x: number; y: number; z: number;
  f: number;
  vx: number; vy: number; vz: number;
  fl: number;
  heat: number;
  st: number;
  lv: number;
  ac: string;
  ap: number;
  ch: number;
  sh: number;
  k: number; d: number; a: number;
  lives: number;
  rt: number;
}

export interface ProjFrame { id: number; k: string; x: number; y: number; z: number; vx: number; vz: number; r: number; tm: number; o: number }
export interface AreaFrame { id: number; k: string; x: number; y: number; z: number; r: number; p: number; tm: number }
export interface StructFrame { id: number; k: string; x: number; y: number; z: number; rot: number; hp: number; tm: number; fam: number }

export interface WorldFrame {
  tick: number;
  phase: 'countdown' | 'play' | 'end';
  phaseT: number;
  chars: CharFrame[];
  projs: ProjFrame[];
  zones: AreaFrame[];
  teles: AreaFrame[];
  structs: StructFrame[];
  dst: string;
  tiles: string;
  mode: ModeHud;
}

export interface MeFrame {
  cd: number[]; // restantes, en el orden de SLOTS
  cdm: number[];
  mats: number[];
  xp: number;
  xpPrev: number;
  xpNext: number;
  pas: string[];
  act: (string | null)[];
  mut: Partial<Record<AbilitySlot, Route>>;
  slots: number;
  rep: number;
  // estado de movimiento para la predicción
  vy: number; gr: number; aj: number; tb: number; hs: number; sn: number; co: number; hsl: number; pb: number;
  spd: number; lock: number; ng: number; direct: number; air: number; rest: number; maj: number; jm: number;
}

const r2 = round2;

export function charFlags(c: Character): number {
  let f = 0;
  if (c.grounded) f |= F_GROUNDED;
  if (c.tumble > 0) f |= F_TUMBLE;
  if (c.stun > 0) f |= F_STUN;
  if (c.shield > 0) f |= F_SHIELD;
  if (c.invuln > 0) f |= F_INVULN;
  if (c.kbImmune > 0) f |= F_KBIMM;
  if (c.charging) f |= F_CHARGING;
  if (c.repairT > 0) f |= F_REPAIRING;
  if (!c.alive) f |= F_DEAD;
  if (c.slowT > 0) f |= F_SLOWED;
  if (c.armorT > 0) f |= F_ARMOR;
  if (c.refractT > 0) f |= F_REFRACT;
  if (c.hitstun > 0) f |= F_HITSTUN;
  if (c.disconnected) f |= F_DISCONNECTED;
  if (c.hasteT > 0) f |= F_HASTE;
  if (c.eliminated) f |= F_ELIMINATED;
  if (c.level >= 5 && c.cds.r <= 0 && c.alive) f |= F_ULTREADY;
  return f;
}

export function buildWorldFrame(sim: Simulation): WorldFrame {
  const fam = (f: string) => FAMILIES.indexOf(f as any);
  return {
    tick: sim.tick,
    phase: sim.phase,
    phaseT: sim.phaseT,
    chars: sim.chars.map((c) => ({
      id: c.id, x: c.pos.x, y: c.pos.y, z: c.pos.z, f: c.facing, vx: c.vel.x, vy: c.vel.y, vz: c.vel.z,
      fl: charFlags(c), heat: c.heat, st: c.stage, lv: c.level,
      ac: c.action ? c.action.kind : '', ap: c.action ? Math.min(1, c.action.t / c.action.dur) : 0,
      ch: c.charging ? c.pushCharge / PUSH_MAX_CHARGE : c.repairT > 0 ? c.repairT / REPAIR_TIME : 0,
      sh: c.shield, k: c.kills, d: c.deaths, a: c.assists, lives: c.lives, rt: c.alive ? 0 : Math.max(0, c.respawnT),
    })),
    projs: sim.projectiles.map((p) => ({ id: p.id, k: p.kind, x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: p.vel.x, vz: p.vel.z, r: p.radius, tm: p.team, o: p.owner })),
    zones: sim.zones.map((z) => ({ id: z.id, k: z.kind, x: z.x, y: z.y, z: z.z, r: z.r, p: z.t / z.dur, tm: z.team })),
    teles: sim.telegraphs.map((t) => ({ id: t.id, k: t.kind, x: t.x, y: t.y, z: t.z, r: t.r, p: t.t / t.dur, tm: t.team })),
    structs: sim.structures.map((s) => ({ id: s.id, k: s.kind, x: s.x, y: s.y, z: s.z, rot: s.rot, hp: s.hp / s.maxHp, tm: s.team, fam: fam(s.family) })),
    dst: sim.destructibles.map((d) => d.stage).join(''),
    tiles: sim.terrain.tileString(),
    mode: sim.mode.hud(sim),
  };
}

export function buildMeFrame(sim: Simulation, c: Character): MeFrame {
  const a = c.action;
  return {
    cd: SLOTS.map((s) => r2(c.cds[s])),
    cdm: SLOTS.map((s) => r2(c.cdMax[s])),
    mats: FAMILIES.map((f) => c.mats[f]),
    xp: Math.floor(c.xp),
    xpPrev: XP_TABLE[c.level - 1] ?? 0,
    xpNext: c.level >= MAX_LEVEL ? XP_TABLE[MAX_LEVEL - 1] : XP_TABLE[c.level],
    pas: [...c.passives],
    act: [...c.actives],
    mut: { ...c.mutations },
    slots: MUTATION_LEVELS.filter((l) => c.level >= l).length,
    rep: c.repairT / REPAIR_TIME,
    vy: r2(c.vel.y), gr: c.grounded ? 1 : 0, aj: c.airJumps, tb: r2(c.tumble), hs: r2(c.hitstun), sn: r2(c.stun), co: r2(c.coyote),
    hsl: r2(c.hitSlide), pb: c.prevB,
    spd: r2(sim.charSpeed(c)), lock: a && a.lock ? 1 : 0, ng: a && a.noGravity ? 1 : 0, direct: a && a.direct ? 1 : 0,
    air: c.stats.airControl, rest: c.stats.restitution, maj: c.stats.maxAirJumps, jm: c.stats.jumpMul,
  };
}

// ───────────── codificación compacta para la red ─────────────

export function encodeWorld(w: WorldFrame): any[] {
  return [
    w.tick,
    w.phase === 'countdown' ? 0 : w.phase === 'play' ? 1 : 2,
    r2(w.phaseT),
    w.chars.map((c) => [c.id, r2(c.x), r2(c.y), r2(c.z), r2(c.f), r2(c.vx), r2(c.vy), r2(c.vz), c.fl, Math.round(c.heat), c.st, c.lv, c.ac, r2(c.ap), r2(c.ch), Math.round(c.sh), c.k, c.d, c.a, c.lives, r2(c.rt)]),
    w.projs.map((p) => [p.id, p.k, r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vz), r2(p.r), p.tm, p.o]),
    w.zones.map((z) => [z.id, z.k, r2(z.x), r2(z.y), r2(z.z), r2(z.r), r2(z.p), z.tm]),
    w.teles.map((z) => [z.id, z.k, r2(z.x), r2(z.y), r2(z.z), r2(z.r), r2(z.p), z.tm]),
    w.structs.map((s) => [s.id, s.k, r2(s.x), r2(s.y), r2(s.z), r2(s.rot), r2(s.hp), s.tm, s.fam]),
    w.dst,
    w.tiles,
    w.mode,
  ];
}

export function decodeWorld(a: any[]): WorldFrame {
  return {
    tick: a[0],
    phase: a[1] === 0 ? 'countdown' : a[1] === 1 ? 'play' : 'end',
    phaseT: a[2],
    chars: a[3].map((c: any[]) => ({
      id: c[0], x: c[1], y: c[2], z: c[3], f: c[4], vx: c[5], vy: c[6], vz: c[7], fl: c[8], heat: c[9], st: c[10], lv: c[11],
      ac: c[12], ap: c[13], ch: c[14], sh: c[15], k: c[16], d: c[17], a: c[18], lives: c[19], rt: c[20],
    })),
    projs: a[4].map((p: any[]) => ({ id: p[0], k: p[1], x: p[2], y: p[3], z: p[4], vx: p[5], vz: p[6], r: p[7], tm: p[8], o: p[9] })),
    zones: a[5].map((z: any[]) => ({ id: z[0], k: z[1], x: z[2], y: z[3], z: z[4], r: z[5], p: z[6], tm: z[7] })),
    teles: a[6].map((z: any[]) => ({ id: z[0], k: z[1], x: z[2], y: z[3], z: z[4], r: z[5], p: z[6], tm: z[7] })),
    structs: a[7].map((s: any[]) => ({ id: s[0], k: s[1], x: s[2], y: s[3], z: s[4], rot: s[5], hp: s[6], tm: s[7], fam: s[8] })),
    dst: a[8],
    tiles: a[9],
    mode: a[10],
  };
}

// ───────────── interpolación ─────────────

export function interpolateFrames(a: WorldFrame, b: WorldFrame, t: number): WorldFrame {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ca = new Map(a.chars.map((c) => [c.id, c]));
  const pa = new Map(a.projs.map((p) => [p.id, p]));
  return {
    ...b,
    tick: lerp(a.tick, b.tick, t),
    chars: b.chars.map((cb) => {
      const c0 = ca.get(cb.id);
      if (!c0 || (c0.fl & F_DEAD) !== (cb.fl & F_DEAD) || Math.hypot(cb.x - c0.x, cb.z - c0.z) > 8) return cb;
      return { ...cb, x: lerp(c0.x, cb.x, t), y: lerp(c0.y, cb.y, t), z: lerp(c0.z, cb.z, t), f: lerpAngle(c0.f, cb.f, t), ap: lerp(c0.ap, cb.ap, t), ch: lerp(c0.ch, cb.ch, t) };
    }),
    projs: b.projs.map((pb) => {
      const p0 = pa.get(pb.id);
      if (!p0) return pb;
      return { ...pb, x: lerp(p0.x, pb.x, t), y: lerp(p0.y, pb.y, t), z: lerp(p0.z, pb.z, t) };
    }),
  };
}

/** Buffer de frames ordenados por tick, con muestreo interpolado. */
export class FrameBuffer {
  frames: WorldFrame[] = [];
  max = 120;

  push(f: WorldFrame) {
    const last = this.frames[this.frames.length - 1];
    if (last && f.tick <= last.tick) {
      if (f.tick === last.tick) this.frames[this.frames.length - 1] = f;
      return; // desordenado: descartar
    }
    this.frames.push(f);
    if (this.frames.length > this.max) this.frames.shift();
  }

  latest(): WorldFrame | null {
    return this.frames[this.frames.length - 1] ?? null;
  }

  sample(tick: number): WorldFrame | null {
    const fs = this.frames;
    if (!fs.length) return null;
    if (tick <= fs[0].tick) return fs[0];
    for (let i = fs.length - 1; i >= 0; i--) {
      if (fs[i].tick <= tick) {
        const a = fs[i], b = fs[i + 1];
        if (!b) return a;
        return interpolateFrames(a, b, (tick - a.tick) / (b.tick - a.tick));
      }
    }
    return fs[fs.length - 1];
  }

  clear() { this.frames = []; }
}
