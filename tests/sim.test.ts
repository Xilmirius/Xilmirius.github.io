import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const log = (...a: unknown[]) => { if (process.env.SIM_LOG) appendFileSync(process.env.SIM_LOG, JSON.stringify(a) + '\n'); };
import { BotBrain } from '../src/core/bots';
import { CollisionWorld } from '../src/core/collision';
import { DT, KILL_Y, LEVEL_H, STAGE_AT } from '../src/core/constants';
import { emptyInput, BTN } from '../src/core/input';
import { MAPS } from '../src/core/maps';
import { defaultMoveParams, newMoveOut, stepMove, type MoveState } from '../src/core/movement';
import { Simulation } from '../src/core/sim';
import { buildWorldFrame, decodeWorld, encodeWorld, buildMeFrame } from '../src/core/snapshot';
import { Terrain } from '../src/core/terrain';
import { DEFAULT_SETTINGS, HERO_IDS, type MatchSettings, type RosterEntry, type HeroId } from '../src/core/types';

function mkState(x: number, y: number, z: number): MoveState {
  return { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, facing: 0, grounded: true, airJumps: 1, coyote: 0, prevB: 0, tumble: 0, hitstun: 0, stun: 0, hitSlide: 0 };
}

describe('mapas', () => {
  for (const id of Object.keys(MAPS)) {
    it(`${id} es válido`, () => {
      const m = MAPS[id];
      const w = m.rows[0].length;
      for (const r of m.rows) expect(r.length).toBe(w);
      const t = new Terrain(id);
      expect(t.spawns.team[0].length).toBeGreaterThanOrEqual(3);
      expect(t.spawns.team[1].length).toBeGreaterThanOrEqual(3);
      expect(t.zonePoints.length).toBeGreaterThanOrEqual(1);
      expect(t.fragile.length).toBeGreaterThan(10);
      expect(t.destructs.length).toBeGreaterThan(5);
      for (const s of [...t.spawns.team[0], ...t.spawns.team[1]]) expect(t.groundAt(s.x, s.z)).toBe(0);
    });
  }
});

describe('movimiento', () => {
  const t = new Terrain('cantera');
  const cw = new CollisionWorld(t);
  const mp = defaultMoveParams();
  const out = newMoveOut();

  it('se queda parado en el piso', () => {
    const s = mkState(t.spawns.team[0][0].x, 0, t.spawns.team[0][0].z);
    for (let i = 0; i < 60; i++) stepMove(s, emptyInput(), mp, cw, DT, out);
    expect(s.grounded).toBe(true);
    expect(s.pos.y).toBe(0);
  });

  it('una plataforma alta bloquea y se sube saltando', () => {
    // Celda frente al muro sur de la plataforma norte: fila 3 col 11 es plataforma (n1); fila 4 col 11 frágil n0.
    const below = t.cellCenter(11, 4);
    const s = mkState(below.x, 0, below.z);
    const inp = { ...emptyInput(), mz: -1, az: below.z - 10, ax: below.x };
    for (let i = 0; i < 60; i++) stepMove(s, inp, mp, cw, DT, out);
    expect(s.pos.y).toBe(0);
    const wallZ = t.cellBounds(3 * t.w + 11).maxZ;
    expect(s.pos.z).toBeGreaterThan(wallZ);
    const jump = { ...inp, b: BTN.JUMP };
    stepMove(s, jump, mp, cw, DT, out);
    for (let i = 0; i < 60; i++) stepMove(s, inp, mp, cw, DT, out);
    expect(s.pos.y).toBeCloseTo(LEVEL_H, 5);
  });

  it('caminar fuera del borde es ring-out', () => {
    const edge = t.cellCenter(0, 6);
    const s = mkState(edge.x, 0, edge.z);
    const inp = { ...emptyInput(), mx: -1, ax: edge.x - 10, az: edge.z };
    let fell = false;
    for (let i = 0; i < 240; i++) {
      stepMove(s, inp, mp, cw, DT, out);
      if (s.pos.y < KILL_Y) { fell = true; break; }
    }
    expect(fell).toBe(true);
  });
});

function roster(n: number, heroes?: HeroId[]): RosterEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    pid: `bot-${i}`, name: `Bot ${i}`, hero: heroes ? heroes[i % heroes.length] : HERO_IDS[i % HERO_IDS.length], team: i % 2, bot: true, botLevel: 3,
  }));
}

describe('knockback', () => {
  it('más etapa de daño = vuela más lejos', () => {
    const dists: number[] = [];
    for (const heat of [0, STAGE_AT[1], STAGE_AT[2], STAGE_AT[3]]) {
      const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, map: 'cantera' }, roster: roster(2), seed: 1 });
      sim.phase = 'play';
      const [a, b] = sim.chars;
      a.pos = { x: -20, y: 0, z: -2 }; b.pos = { x: -16, y: 0, z: -2 };
      a.facing = 0;
      b.heat = heat; b.stage = STAGE_AT.filter((s) => heat >= s).length - 1;
      const start = { ...b.pos };
      sim.hit(b, a, { heat: 0, kb: 13, dirX: 1, dirZ: 0 });
      for (let i = 0; i < 180; i++) sim.step();
      const d = b.alive ? Math.hypot(b.pos.x - start.x, b.pos.z - start.z) : 99;
      dists.push(d);
    }
    for (let i = 1; i < dists.length; i++) expect(dists[i]).toBeGreaterThan(dists[i - 1]);
    expect(dists[0]).toBeLessThan(5);
  });
});

function runMatch(settings: Partial<MatchSettings>, n: number, seconds: number, heroes?: HeroId[]) {
  const s: MatchSettings = { ...DEFAULT_SETTINGS, ...settings };
  const sim = new Simulation({ settings: s, roster: roster(n, heroes), seed: 42 });
  const brains = sim.chars.map((c, i) => new BotBrain(3, 100 + i));
  let deaths = 0, crafts = 0, lvl = 0;
  for (let i = 0; i < seconds * 60 && sim.phase !== 'end'; i++) {
    sim.chars.forEach((c, k) => { c.input = brains[k].think(sim, c, DT); });
    sim.step();
    for (const e of sim.drainEvents()) {
      if (e.k === 'ring') deaths++;
      if (e.k === 'craft') crafts++;
      if (e.k === 'lvl') lvl++;
    }
    // snapshot válido todo el tiempo
    if (i % 30 === 0) {
      const w = buildWorldFrame(sim);
      const dec = decodeWorld(JSON.parse(JSON.stringify(encodeWorld(w))));
      expect(dec.chars.length).toBe(sim.chars.length);
      buildMeFrame(sim, sim.chars[0]);
    }
  }
  return { sim, deaths, crafts, lvl };
}

describe('partidas headless de bots', () => {
  it('3v3 vidas en La Cantera termina sin errores', () => {
    const r = runMatch({ mode: 'stock', map: 'cantera', lives: 2, timeLimit: 480 }, 6, 500);
    expect(r.deaths).toBeGreaterThan(3);
    expect(r.lvl).toBeGreaterThan(6);
    expect(r.sim.phase).toBe('end');
    log('stock', { deaths: r.deaths, crafts: r.crafts, t: Math.round(r.sim.elapsed), res: r.sim.result });
  }, 60000);

  it('1v1 ring-outs en El Islote', () => {
    const r = runMatch({ mode: 'kills', map: 'islote', killTarget: 5, timeLimit: 300 }, 2, 320, ['canto', 'prisma']);
    expect(r.sim.phase).toBe('end');
    log('kills', { deaths: r.deaths, crafts: r.crafts, t: Math.round(r.sim.elapsed), res: r.sim.result });
  }, 60000);

  it('2v2 control de zona', () => {
    const r = runMatch({ mode: 'koth', map: 'cantera', kothTarget: 60, timeLimit: 300 }, 4, 320, ['gloop', 'remache']);
    expect(r.sim.phase).toBe('end');
    log('koth', { deaths: r.deaths, crafts: r.crafts, t: Math.round(r.sim.elapsed), res: r.sim.result });
  }, 60000);

  it('todos contra todos con los 4 héroes', () => {
    const r = runMatch({ mode: 'stock', map: 'cantera', teams: 'ffa', lives: 2, timeLimit: 400 }, 4, 420);
    expect(r.sim.phase).toBe('end');
    log('ffa', { deaths: r.deaths, crafts: r.crafts, t: Math.round(r.sim.elapsed), res: r.sim.result });
  }, 60000);
});

describe('feedback', () => {
  it('marca golpes letales y no marca los que no sacan', () => {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, map: 'cantera' }, roster: roster(2), seed: 3 });
    sim.phase = 'play';
    const [a, b] = sim.chars;
    a.pos = { x: -20, y: 0, z: -2 }; b.pos = { x: -16, y: 0, z: -2 };
    sim.hit(b, a, { heat: 0, kb: 8, dirX: 1, dirZ: 0 });
    const soft = sim.drainEvents().find((e) => e.k === 'hit') as any;
    expect(soft.l).toBe(0);
    expect(soft.a).toBe(a.id);
    // Destrozado, contra el borde: letal
    b.pos = { x: 18, y: 0, z: -2 }; b.vel = { x: 0, y: 0, z: 0 }; b.tumble = 0; b.grounded = true;
    b.heat = 200; b.stage = 3;
    sim.hit(b, a, { heat: 5, kb: 22, dirX: 1, dirZ: 0 });
    const hard = sim.drainEvents().find((e) => e.k === 'hit') as any;
    expect(hard.l).toBe(1);
    expect(hard.h).toBeGreaterThan(0);
    expect(a.lethals).toBe(1);
  });
});

describe('eventos con tick', () => {
  it('los mensajes conservan su texto al agregarles el tick (regresión)', () => {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, mode: 'kills', timeLimit: 31 }, roster: roster(2), seed: 9 });
    sim.phase = 'play';
    const msgs: any[] = [];
    for (let i = 0; i < 90; i++) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.k === 'msg') msgs.push({ ...e, t: sim.tick });
    }
    expect(msgs.length).toBeGreaterThan(0);
    expect(typeof msgs[0].tx).toBe('string');
    expect(msgs[0].tx).toContain('30');
    expect(typeof msgs[0].t).toBe('number');
  });
});
