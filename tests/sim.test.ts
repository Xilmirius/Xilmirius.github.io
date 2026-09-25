import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const log = (...a: unknown[]) => { if (process.env.SIM_LOG) appendFileSync(process.env.SIM_LOG, JSON.stringify(a) + '\n'); };
import { BotBrain } from '../src/core/bots';
import { CollisionWorld } from '../src/core/collision';
import { DT, KILL_Y, LEVEL_H, STAGE_AT, ULT_PER_HEAT } from '../src/core/constants';
import { emptyInput, BTN } from '../src/core/input';
import { MAPS } from '../src/core/maps';
import { DASH_IDLE, defaultMoveParams, newMoveOut, stepMove, type MoveState } from '../src/core/movement';
import { NO_MODS } from '../src/core/mutations';
import { Simulation } from '../src/core/sim';
import { buildWorldFrame, decodeWorld, encodeWorld, buildMeFrame } from '../src/core/snapshot';
import { Terrain } from '../src/core/terrain';
import { DEFAULT_SETTINGS, HERO_IDS, type MatchSettings, type RosterEntry, type HeroId } from '../src/core/types';

function mkState(x: number, y: number, z: number): MoveState {
  return { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, facing: 0, grounded: true, airJumps: 1, coyote: 0, prevB: 0, tumble: 0, hitstun: 0, stun: 0, hitSlide: 0, ...DASH_IDLE };
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
      expect(t.fragile.length).toBeGreaterThan(10);
      expect(t.destructs.length).toBeGreaterThan(5);
      for (const s of [...t.spawns.team[0], ...t.spawns.team[1]]) expect(t.groundAt(s.x, s.z)).toBe(0);
      if (m.kind === 'moba') return;
      expect(t.zonePoints.length).toBeGreaterThanOrEqual(1);
    });
  }

  for (const id of Object.keys(MAPS).filter((k) => MAPS[k].kind === 'moba')) {
    it(`${id}: Asedio (líneas transitables, torres sobre las líneas, espejado)`, () => {
      const m = MAPS[id];
      const t = new Terrain(id);
      const lanes = t.lanes.length;
      expect(lanes).toBeGreaterThanOrEqual(1);
      for (const team of [0, 1]) {
        expect(t.cores.filter((c) => c.team === team).length).toBe(1);
        expect(t.towers.filter((c) => c.team === team).length).toBe(2 * lanes);
      }
      expect(t.camps.length).toBeGreaterThanOrEqual(2);
      expect(t.lairs.length).toBe(1);
      // Cada tramo de cada línea es piso firme (los esbirros no saltan).
      for (const lane of t.lanes) {
        for (let i = 1; i < lane.length; i++) {
          const a = lane[i - 1], b = lane[i];
          const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
          for (let k = 0; k <= n; k++) {
            const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n;
            expect(t.groundAt(x, z), `${id} (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(0);
          }
        }
      }
      // Toda torre queda sobre alguna línea (a menos de 1 celda del recorrido).
      const distToLane = (x: number, z: number) => Math.min(...t.lanes.flatMap((lane) => lane.slice(1).map((b, i) => {
        const a = lane[i];
        const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
        const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
        return Math.hypot(a.x + dx * u - x, a.z + dz * u - z);
      })));
      for (const tw of t.towers) expect(distToLane(tw.x, tw.z)).toBeLessThan(2);
      // Espejado izquierda ↔ derecha con los equipos cambiados.
      const sw: Record<string, string> = { A: 'B', B: 'A', X: 'x', x: 'X', K: 'k', k: 'K', '<': '>', '>': '<' };
      for (const r of m.rows) expect([...r].reverse().map((c) => sw[c] ?? c).join('')).toBe(r);
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

  it('dash: ráfaga corta, enfriamiento y solo si las reglas lo habilitan', () => {
    const sp = t.spawns.team[0][0];
    const off = mkState(sp.x, 0, sp.z);
    const tap = { ...emptyInput(), mx: 1, ax: sp.x + 10, az: sp.z, b: BTN.DASH };
    stepMove(off, tap, mp, cw, DT, out);
    expect(out.dashed).toBe(false);

    const on = { ...mp, dash: true };
    const s = mkState(sp.x, 0, sp.z);
    stepMove(s, tap, on, cw, DT, out);
    expect(out.dashed).toBe(true);
    const walk = { ...tap, b: 0 };
    for (let i = 0; i < 20; i++) stepMove(s, walk, on, cw, DT, out);
    expect(s.pos.x - sp.x).toBeGreaterThan(3.5);
    // Enfriamiento: un segundo toque enseguida no sale.
    stepMove(s, tap, on, cw, DT, out);
    expect(out.dashed).toBe(false);
  });

  it('dash: no cancela un lanzamiento (primero hay que usar el segundo salto)', () => {
    const sp = t.spawns.team[0][0];
    const on = { ...mp, dash: true };
    const s = mkState(sp.x, 3, sp.z);
    s.grounded = false; s.tumble = 2; s.vel = { x: 12, y: 2, z: 0 };
    stepMove(s, { ...emptyInput(), mx: -1, b: BTN.DASH }, on, cw, DT, out);
    expect(out.dashed).toBe(false);
    stepMove(s, { ...emptyInput(), mx: -1, b: BTN.JUMP }, on, cw, DT, out);
    expect(out.airJumped).toBe(true);
    stepMove(s, { ...emptyInput(), mx: -1, b: BTN.DASH }, on, cw, DT, out);
    expect(out.dashed).toBe(true);
    expect(s.airDashes).toBe(0);
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

  it('los disparos básicos a distancia suman heat pero no empujan (el cuerpo a cuerpo puede acercarse)', () => {
    for (const shooter of ['prisma', 'gloop'] as HeroId[]) {
      const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, map: 'cantera' }, roster: roster(2, [shooter, 'canto']), seed: 3 });
      sim.phase = 'play';
      const [a, b] = sim.chars;
      a.pos = { x: -20, y: 0, z: -2 }; b.pos = { x: -14, y: 0, z: -2 };
      b.heat = STAGE_AT[3]; b.stage = 3; // aun destrozado, un disparo básico no lo corre
      const start = { ...b.pos };
      a.input = { ...emptyInput(), ax: b.pos.x, az: b.pos.z, b: BTN.BASIC };
      for (let i = 0; i < 60; i++) sim.step();
      expect(b.heat, shooter).toBeGreaterThan(STAGE_AT[3]);
      expect(Math.hypot(b.pos.x - start.x, b.pos.z - start.z), shooter).toBeLessThan(0.05);
    }
  });
});

function runMatch(settings: Partial<MatchSettings>, n: number, seconds: number, heroes?: HeroId[]) {
  const s: MatchSettings = { ...DEFAULT_SETTINGS, ...settings };
  const sim = new Simulation({ settings: s, roster: roster(n, heroes), seed: 42 });
  const brains = sim.chars.map((c, i) => new BotBrain(3, 100 + i));
  let deaths = 0, crafts = 0, lvl = 0, ults = 0, dashes = 0;
  for (let i = 0; i < seconds * 60 && sim.phase !== 'end'; i++) {
    sim.chars.forEach((c, k) => { c.input = brains[k].think(sim, c, DT); });
    sim.step();
    for (const e of sim.drainEvents()) {
      if (e.k === 'ring') deaths++;
      if (e.k === 'craft') crafts++;
      if (e.k === 'lvl') lvl++;
      if (e.k === 'cast' && e.s === 'r') ults++;
      if (e.k === 'dash') dashes++;
    }
    // snapshot válido todo el tiempo
    if (i % 30 === 0) {
      const w = buildWorldFrame(sim);
      const dec = decodeWorld(JSON.parse(JSON.stringify(encodeWorld(w))));
      expect(dec.chars.length).toBe(sim.chars.length);
      buildMeFrame(sim, sim.chars[0]);
    }
  }
  return { sim, deaths, crafts, lvl, ults, dashes };
}

describe('partidas headless de bots', () => {
  it('3v3 vidas en La Cantera termina sin errores', () => {
    const r = runMatch({ mode: 'stock', rules: 'full', map: 'cantera', lives: 2, timeLimit: 480 }, 6, 500);
    expect(r.deaths).toBeGreaterThan(3);
    expect(r.lvl).toBeGreaterThan(6);
    expect(r.sim.phase).toBe('end');
    log('stock', { deaths: r.deaths, crafts: r.crafts, t: Math.round(r.sim.elapsed), res: r.sim.result });
  }, 60000);

  it('Brawler: sin niveles ni forja, la ulti se carga y se usa', () => {
    const r = runMatch({ mode: 'stock', rules: 'brawl', map: 'cantera', lives: 2, timeLimit: 480 }, 6, 500);
    expect(r.sim.phase).toBe('end');
    expect(r.lvl).toBe(0);
    expect(r.crafts).toBe(0);
    expect(r.ults).toBeGreaterThan(2);
    expect(r.dashes).toBeGreaterThan(5);
    for (const c of r.sim.chars) {
      expect(c.level).toBe(1);
      expect(c.mats.stone + c.mats.metal + c.mats.crystal + c.mats.goo).toBe(0);
    }
    log('brawl', { deaths: r.deaths, ults: r.ults, dashes: r.dashes, t: Math.round(r.sim.elapsed), res: r.sim.result });
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

describe('construcciones', () => {
  it('una torreta o un muro que aparece encima tuyo no te deja trabado', () => {
    for (const kind of ['turret', 'wall'] as const) {
      for (const [ox, oz] of [[0.6, 0], [-0.55, 0.3], [0, 0.7], [0.2, -0.65]]) {
        const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, map: 'cantera' }, roster: roster(2, ['remache', 'canto']), seed: 4 });
        sim.phase = 'play';
        const [a] = sim.chars;
        a.pos = { x: -8, y: 0, z: 2 }; a.ppos = { ...a.pos };
        for (let i = 0; i < 5; i++) sim.step();
        if (kind === 'turret') sim.buildTurret(a, a.pos.x + ox, a.pos.z + oz, 70, 8, NO_MODS);
        else sim.buildWall(a, 'wall', 'metal', a.pos.x + ox, a.pos.z + oz, 1, 0, 60, 8, 3);
        // Probar las cuatro direcciones: en alguna tiene que poder salir (y alejarse bastante).
        let best = 0;
        for (const [mx, mz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const start = { ...a.pos };
          a.input = { ...emptyInput(), mx, mz, ax: a.pos.x + mx, az: a.pos.z + mz };
          for (let i = 0; i < 40; i++) sim.step();
          best = Math.max(best, Math.hypot(a.pos.x - start.x, a.pos.z - start.z));
          a.input = emptyInput();
        }
        expect(best, `${kind} en (${ox}, ${oz})`).toBeGreaterThan(1.5);
        expect(sim.cw.blockAt(a.pos.x, a.pos.z, 0.5, a.pos.y)?.obstacle ?? null, `${kind} sigue encimado`).toBe(null);
      }
    }
  });
});

describe('fin de partida', () => {
  it('al terminar nadie se mueve ni ataca y se apagan los proyectiles', () => {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, rules: 'brawl', mode: 'stock', lives: 1 }, roster: roster(2, ['prisma', 'canto']), seed: 9 });
    sim.phase = 'play';
    const [a, b] = sim.chars;
    a.input = { ...emptyInput(), ax: b.pos.x, az: b.pos.z, b: BTN.BASIC };
    for (let i = 0; i < 30; i++) sim.step();
    expect(sim.projectiles.length).toBeGreaterThan(0);
    b.lives = 0; b.eliminated = true; // gana el equipo de a
    sim.step();
    expect(sim.phase).toBe('end');
    expect(sim.projectiles.length).toBe(0);
    expect(buildWorldFrame(sim).win).toBe(a.team);
    sim.drainEvents();
    const start = { ...a.pos };
    a.input = { ...emptyInput(), mx: 1, ax: b.pos.x, az: b.pos.z, b: BTN.BASIC | BTN.Q | BTN.PUSH | BTN.DASH };
    for (let i = 0; i < 90; i++) { sim.step(); a.input = { ...a.input, b: i % 2 ? a.input.b : 0 }; }
    const evs = sim.drainEvents().map((e) => e.k);
    expect(evs).not.toContain('shoot');
    expect(evs).not.toContain('cast');
    expect(evs).not.toContain('swing');
    expect(evs).not.toContain('dash');
    expect(Math.hypot(a.pos.x - start.x, a.pos.z - start.z)).toBeLessThan(0.01);
  });
});

describe('reglas', () => {
  it('las habilidades salen con el pulso del lanzamiento (una sola vez aunque el bit quede prendido)', () => {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, rules: 'brawl' }, roster: roster(2, ['prisma', 'canto']), seed: 5 });
    sim.phase = 'play';
    const [a] = sim.chars;
    const casts = () => sim.drainEvents().filter((e) => e.k === 'cast').length;
    a.input = { ...emptyInput(), ax: a.pos.x + 5, az: a.pos.z, b: BTN.F };
    sim.step();
    expect(casts()).toBe(1);
    for (let i = 0; i < 10; i++) sim.step();
    expect(casts()).toBe(0);
  });

  it('Brawler: todo desbloqueado en nivel 1 y la ulti necesita carga', () => {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, rules: 'brawl' }, roster: roster(2, ['canto', 'prisma']), seed: 6 });
    sim.phase = 'play';
    const [a, b] = sim.chars;
    for (const s of ['q', 'e', 'f', 'r'] as const) expect(sim.abilityUnlocked(a, s)).toBe(true);
    expect(sim.ultReady(a)).toBe(false);
    sim.hit(b, a, { heat: 1 / ULT_PER_HEAT + 5, kb: 0, dirX: 1, dirZ: 0 });
    expect(a.ult).toBeGreaterThanOrEqual(1);
    expect(sim.ultReady(a)).toBe(true);
    // En Completo, la ulti se desbloquea por nivel.
    const full = new Simulation({ settings: { ...DEFAULT_SETTINGS, rules: 'full' }, roster: roster(2), seed: 7 });
    expect(full.abilityUnlocked(full.chars[0], 'r')).toBe(false);
    expect(full.abilityUnlocked(full.chars[0], 'q')).toBe(true);
  });

  it('Brawler: los comandos de forja se ignoran', () => {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, rules: 'brawl' }, roster: roster(2), seed: 8 });
    const a = sim.chars[0];
    a.mats = { stone: 20, metal: 20, crystal: 20, goo: 20 };
    sim.queueCommand(a.pid, { c: 'craft', id: 'coraza' });
    sim.step();
    expect(a.passives.length).toBe(0);
  });
});
