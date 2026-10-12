import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const log = (...a: unknown[]) => { if (process.env.SIM_LOG) appendFileSync(process.env.SIM_LOG, JSON.stringify(a) + '\n'); };
import { BotBrain } from '../src/core/bots';
import { CollisionWorld } from '../src/core/collision';
import { DT, KILL_Y, LEVEL_H, STAGE_AT, ULT_PER_HEAT } from '../src/core/constants';
import { BARREL, GEYSER, geyserPhase, PAD_V, ROTOR, rotorAngle } from '../src/core/gadgets';
import { emptyInput, BTN } from '../src/core/input';
import { GAME_IDS, GAMES, enterGame, enterMode, gameOf, mapsFor, MODE_INFO, normalizeSettings, sidesOf } from '../src/core/games';
import { CRATE_KINDS, HORDE, MISSIONS, type HordeMode } from '../src/core/horde';
import { MAPS } from '../src/core/maps';
import { DASH_IDLE, defaultMoveParams, newMoveOut, stepMove, type MoveState } from '../src/core/movement';
import { NO_MODS } from '../src/core/mutations';
import type { RaceMode } from '../src/core/race';
import { parseCommand, Simulation } from '../src/core/sim';
import { buildWorldFrame, decodeWorld, encodeWorld, buildMeFrame } from '../src/core/snapshot';
import { Terrain } from '../src/core/terrain';
import { DEFAULT_SETTINGS, HERO_IDS, type MatchSettings, type ModeId, type RosterEntry, type HeroId } from '../src/core/types';
import { C4, WEAPON_IDS, WEAPONS } from '../src/core/weapons';

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
      if (m.kind === 'race') {
        // Pista: salida para 6, puertas en orden y la meta al final. Que se pueda recorrer lo prueba la carrera de bots.
        expect(t.spawns.ffa.length).toBeGreaterThanOrEqual(6);
        expect(t.gates.length).toBeGreaterThanOrEqual(2);
        for (const s of t.spawns.ffa) expect(t.groundAt(s.x, s.z)).toBe(0);
        for (const g of t.gates) for (const ci of g.cells) expect(t.isWalkable(ci)).toBe(true);
        return;
      }
      expect(t.spawns.team[0].length).toBeGreaterThanOrEqual(3);
      expect(t.spawns.team[1].length).toBeGreaterThanOrEqual(3);
      expect(t.fragile.length).toBeGreaterThan(10);
      expect(t.destructs.length).toBeGreaterThan(5);
      for (const s of [...t.spawns.team[0], ...t.spawns.team[1]]) expect(t.groundAt(s.x, s.z)).toBe(0);
      if (m.kind === 'moba') return;
      expect(t.zonePoints.length).toBeGreaterThanOrEqual(1);
    });
  }

  for (const id of Object.keys(MAPS).filter((k) => MAPS[k].kind === 'horde')) {
    it(`${id}: Horda (sin artefactos de pista; con barriles y varias zonas de misión)`, () => {
      const t = new Terrain(id);
      // Resortes, paragolpes, rotores y géiseres son de la Arena y la Carrera: en un mapa de zombis no pintan nada.
      expect(t.gadgets.length).toBe(0);
      expect(t.cells.some((c) => c.pad)).toBe(false);
      expect(t.destructs.filter((d) => d.explosive).length).toBeGreaterThanOrEqual(4);
      // Las misiones de zona necesitan lugares distintos entre los que moverse.
      expect(t.zonePoints.length).toBeGreaterThanOrEqual(3);
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

describe('modos nuevos', () => {
  it('Carrera: los bots pasan las puertas en orden y llegan todos a la meta', () => {
    const r = runMatch({ mode: 'race', map: 'pista', timeLimit: 300 }, 4, 320);
    const m = r.sim.mode as RaceMode;
    expect(r.sim.phase).toBe('end');
    expect(r.sim.rules.id).toBe('race');
    expect(r.sim.settings.teams).toBe('ffa');
    expect(m.order.length).toBe(4);
    expect(r.sim.result?.winner).toBe(r.sim.charById.get(m.order[0])!.team);
    expect(r.sim.elapsed).toBeLessThan(120);
    log('race', { t: Math.round(r.sim.elapsed), order: m.order, res: r.sim.result });
  }, 60000);

  it('Carrera: sin habilidades; las cajas dan un ítem que se gasta al usarlo; caerse te devuelve a la última puerta', () => {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, mode: 'race', map: 'pista' }, roster: roster(2), seed: 3 });
    sim.phase = 'play';
    const [a] = sim.chars;
    const m = sim.mode as RaceMode;
    // La tecla de una habilidad no hace nada.
    a.input = { ...emptyInput(), ax: a.pos.x + 5, az: a.pos.z, b: BTN.Q };
    sim.step();
    expect(sim.drainEvents().some((e) => e.k === 'cast')).toBe(false);
    // Caja de ítem.
    const box = sim.gadgets.find((g) => g.kind === 'box')!;
    a.input = emptyInput();
    a.pos = { x: box.x, y: 0, z: box.z };
    sim.step();
    const item = a.actives.find((x) => x !== null);
    expect(item).toBeTruthy();
    expect(box.on).toBe(false);
    const slot = a.actives.indexOf(item!);
    a.input = { ...emptyInput(), ax: a.pos.x + 4, az: a.pos.z, b: [BTN.I1, BTN.I2, BTN.I3][slot] };
    sim.step();
    expect(a.actives[slot]).toBeNull();
    // Pasa la primera puerta, se cae y reaparece ahí.
    const gate = sim.terrain.gates[0];
    a.input = emptyInput();
    a.action = null;
    a.pos = { x: gate.x, y: 0, z: gate.z };
    a.vel = { x: 0, y: 0, z: 0 };
    sim.step();
    expect(m.next.get(a.id)).toBe(1);
    a.pos = { x: gate.x, y: KILL_Y - 1, z: gate.z };
    sim.step();
    expect(a.alive).toBe(false);
    for (let i = 0; i < 120 && !a.alive; i++) sim.step();
    expect(a.alive).toBe(true);
    expect(gate.cells.has(sim.terrain.cellIndexAt(a.pos.x, a.pos.z))).toBe(true);
  });

  it('Horda: cooperativa y con armas; las oleadas salen por tiempo y los bots avanzan por las misiones', () => {
    const r = runMatch({ mode: 'horde', map: 'refugio', lives: 3 }, 4, 150);
    const m = r.sim.mode as HordeMode;
    expect(r.sim.rules.id).toBe('horde');
    expect(new Set(r.sim.chars.map((c) => c.team)).size).toBe(1);
    expect(m.wave).toBeGreaterThanOrEqual(4);
    expect(m.kills).toBeGreaterThan(30);
    expect(r.sim.chars.reduce((s, c) => s + c.cs, 0)).toBeGreaterThan(20);
    // Sin poderes: nadie lanzó una habilidad.
    expect(r.ults).toBe(0);
    // Las misiones avanzan y la primera zona quedó como mini base.
    expect(m.step).toBeGreaterThanOrEqual(2);
    expect(m.bases.length).toBeGreaterThanOrEqual(1);
    // Los zombis también hacen lo suyo: alguien recibió golpes.
    expect(r.sim.chars.some((c) => c.heat > 0 || c.deaths > 0)).toBe(true);
    const hud = JSON.parse(JSON.stringify(r.sim.mode.hud(r.sim))).horde;
    expect(hud.step).toBe(m.step);
    expect(hud.bases.length).toBe(m.bases.length);
    log('horde', { t: Math.round(r.sim.elapsed), wave: m.wave, step: m.step, kills: m.kills, deaths: r.sim.chars.map((c) => c.deaths) });
  }, 60000);

  it('Horda: cumplir toda la cadena de misiones termina en la extracción (se gana)', () => {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, mode: 'horde', map: 'refugio', lives: 3 }, roster: roster(2), seed: 5 });
    sim.phase = 'play';
    const m = sim.mode as HordeMode;
    const [a, b] = sim.chars;
    const put = (c: typeof a, p: { x: number; z: number }) => {
      c.pos = { x: p.x, y: sim.groundY(p.x, p.z, 0), z: p.z };
      c.vel = { x: 0, y: 0, z: 0 };
    };
    const seen: string[] = [];
    for (let i = 0; i < 60 * 240 && sim.phase !== 'end'; i++) {
      // Acá se prueba la cadena, no el combate: sin zombis sueltos y cada misión resuelta a mano.
      for (const u of sim.units) if (u.alive && u !== m.boss) sim.killUnit(u, null, false);
      const kind = MISSIONS[m.step].kind;
      if (seen[seen.length - 1] !== kind) seen.push(kind);
      if (m.zone) { put(a, m.zone); put(b, m.zone); }
      else if (kind === 'nests') for (const n of [...m.nests]) sim.damageObstacle(n.obstacle, 99999, a);
      else if (kind === 'fetch') {
        const fuel = m.crates.find((c) => CRATE_KINDS[c.kind] === 'fuel' && c.t >= HORDE.crateLand);
        if (fuel) put(a, fuel);
      } else if (kind === 'boss' && m.boss) sim.killUnit(m.boss, a, false);
      sim.step();
      sim.drainEvents();
    }
    expect(seen).toEqual(MISSIONS.map((x) => x.kind));
    expect(sim.phase).toBe('end');
    expect(sim.result?.winner).toBe(0);
    expect(sim.mode.hud(sim).horde!.step).toBe(MISSIONS.length);
    // Las dos zonas aseguradas quedaron como mini bases.
    expect(m.bases.length).toBe(MISSIONS.filter((x) => x.kind === 'hold').length);
    expect(m.nests.length).toBe(0);
  });

  it('Horda: se pierde cuando a nadie le quedan vidas', () => {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, mode: 'horde', map: 'islote', lives: 1 }, roster: roster(2), seed: 5 });
    sim.phase = 'play';
    for (const c of sim.chars) c.pos = { x: c.pos.x, y: KILL_Y - 1, z: c.pos.z };
    sim.step();
    expect(sim.chars.every((c) => c.eliminated)).toBe(true);
    expect(sim.phase).toBe('end');
    expect(sim.result?.winner).toBe(1);
  });
});

describe('armas (Horda)', () => {
  /** Partida de Horda ya en juego, con un héroe en un lugar despejado mirando hacia +x. */
  function setup(n = 1) {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, mode: 'horde', map: 'cantera' }, roster: roster(n), seed: 9 });
    sim.phase = 'play';
    const a = sim.chars[0];
    // Al empezar, cada héroe recibe un arma cargada.
    sim.step();
    sim.drainEvents();
    expect(a.primary).toBeGreaterThan(0);
    expect(a.ammo).toBe(WEAPONS[WEAPON_IDS[a.primary]].ammo);
    // Para probar cada arma por separado: solo la pistola y sin cajas en el piso.
    a.weapon = 0;
    a.primary = -1;
    a.ammo = 0;
    (sim.mode as HordeMode).crates.length = 0;
    // Lejos de los barriles: una explosión los haría estallar también.
    a.pos = { x: -12, y: 0, z: -6 };
    a.ppos = { ...a.pos };
    const zombie = (dx: number, dz = 0, hp = 500) => {
      const u = sim.addUnit('zombie', 1, a.pos.x + dx, a.pos.z + dz, { name: 'Zombi', family: 'goo', hp, speed: 0, kbTaken: 1 });
      u.ai = null;
      return u;
    };
    const fire = (b: number = BTN.BASIC) => {
      a.input = { ...emptyInput(), ax: a.pos.x + 6, az: a.pos.z, b };
      a.prevB = 0;
      a.cds.basic = 0;
      sim.step();
      return sim.drainEvents();
    };
    return { sim, a, zombie, fire, m: sim.mode as HordeMode };
  }

  it('la pistola es de impacto instantáneo: le pega al primero de la línea y avisa con un evento', () => {
    const { a, zombie, fire } = setup();
    const near = zombie(4), far = zombie(7);
    const ev = fire();
    const shot = ev.find((e) => e.k === 'shot');
    expect(shot && shot.k === 'shot' && shot.w).toBe(0);
    expect(shot && shot.k === 'shot' && shot.p[3]).toBe(1); // dio en un cuerpo
    expect(near.hp).toBeCloseTo(500 - WEAPONS.pistol.dmg * HORDE.heroVsUnit, 1);
    expect(far.hp).toBe(500);
    expect(a.weapon).toBe(0);
    // No hay golpe básico del héroe ni habilidades.
    expect(ev.some((e) => e.k === 'swing' || e.k === 'cast')).toBe(false);
  });

  it('un muro tapa el tiro y recibe el daño', () => {
    const { sim, zombie, fire, a } = setup();
    const z = zombie(6);
    const wall = sim.addFixedStructure(1, 'nest', 'goo', a.pos.x + 3, a.pos.z, 0.75, 1.5, 100);
    sim.step();
    const shot = fire().find((e) => e.k === 'shot');
    expect(shot && shot.k === 'shot' && shot.p[3]).toBe(2);
    expect(z.hp).toBe(500);
    expect(wall.hp).toBeLessThan(100);
  });

  it('la uzi gasta balas y, al quedarse sin ninguna, vuelve la pistola', () => {
    const { sim, a, zombie, fire, m } = setup();
    zombie(4, 0, 5000);
    // Agarra una caja de uzi.
    m.crates.length = 0;
    m.crates.push({ id: 99, kind: CRATE_KINDS.indexOf('uzi'), x: a.pos.x, y: 0, z: a.pos.z, t: HORDE.crateLand });
    a.input = emptyInput();
    sim.step();
    expect(sim.drainEvents().some((e) => e.k === 'loot')).toBe(true);
    expect(WEAPON_IDS[a.weapon]).toBe('uzi');
    expect(a.ammo).toBe(WEAPONS.uzi.ammo);
    // Las balas de la ráfaga no generan evento de golpe (la traza alcanza).
    const ev = fire();
    expect(ev.some((e) => e.k === 'shot')).toBe(true);
    expect(ev.some((e) => e.k === 'hit')).toBe(false);
    expect(a.ammo).toBe(WEAPONS.uzi.ammo - 1);
    // Disparar frena el paso.
    expect(sim.charSpeed(a)).toBeLessThan(a.stats.speed);
    // Q cambia a la pistola y vuelve.
    fire(BTN.Q);
    expect(a.weapon).toBe(0);
    fire(BTN.Q);
    expect(WEAPON_IDS[a.weapon]).toBe('uzi');
    a.ammo = 1;
    fire();
    expect(a.weapon).toBe(0);
    expect(a.primary).toBe(-1);
    expect(buildMeFrame(sim, a).pri).toBe(-1);
  });

  it('la escopeta de cerca junta los perdigones en un solo golpe y lanza al zombi', () => {
    const { sim, a, zombie, fire } = setup();
    a.primary = a.weapon = WEAPON_IDS.indexOf('shotgun');
    a.ammo = 5;
    const z = zombie(1.6);
    const ev = fire();
    const shot = ev.find((e) => e.k === 'shot');
    expect(shot && shot.k === 'shot' && shot.p.length).toBe(WEAPONS.shotgun.pellets * 4);
    expect(ev.filter((e) => e.k === 'hit').length).toBe(1);
    expect(z.hp).toBeLessThan(500 - WEAPONS.shotgun.dmg * 4);
    expect(z.tumble).toBeGreaterThan(0);
    expect(z.vel.x).toBeGreaterThan(5);
    expect(decodeWorld(JSON.parse(JSON.stringify(encodeWorld(buildWorldFrame(sim))))).chars[0].wp).toBe(a.weapon);
  });

  it('el lanzacohetes explota en área', () => {
    const { sim, a, zombie, fire } = setup();
    a.primary = a.weapon = WEAPON_IDS.indexOf('launcher');
    a.ammo = 3;
    const z1 = zombie(6), z2 = zombie(7, 1.5);
    fire();
    expect(sim.projectiles.some((p) => p.kind === 'rocket')).toBe(true);
    a.input = emptyInput();
    for (let i = 0; i < 40; i++) sim.step();
    expect(z1.hp).toBeLessThan(500);
    expect(z2.hp).toBeLessThan(500);
    expect(a.heat).toBe(0);
  });

  it('C4: avisa, explota al terminar la mecha y no lastima al equipo', () => {
    const { sim, a, zombie, fire } = setup(2);
    const mate = sim.chars[1];
    mate.pos = { x: a.pos.x + 1.5, y: 0, z: a.pos.z + 1 };
    const z = zombie(2, -1);
    expect(a.c4).toBe(C4.start);
    const ev = fire(BTN.R);
    expect(ev.some((e) => e.k === 'c4')).toBe(true);
    expect(a.c4).toBe(C4.start - 1);
    expect(sim.telegraphs.some((t) => t.kind === 'c4')).toBe(true);
    expect(z.hp).toBe(500);
    a.input = emptyInput();
    for (let i = 0; i < Math.round(C4.fuse * 60) + 3; i++) sim.step();
    expect(z.hp).toBeLessThan(500);
    expect(a.heat).toBe(0);
    expect(mate.heat).toBe(0);
    // Sin cargas, la tecla avisa que no se puede.
    a.c4 = 0;
    expect(fire(BTN.R).some((e) => e.k === 'deny')).toBe(true);
  });

  it('misión de zona: aguantar adentro la completa y deja una mini base con torreta', () => {
    const { sim, a, m } = setup();
    const z = m.zone!;
    expect(MISSIONS[m.step].kind).toBe('hold');
    a.pos = { x: z.x, y: z.y, z: z.z };
    a.input = emptyInput();
    const need = MISSIONS[0].need;
    let done = false;
    for (let i = 0; i < (need + 2) * 60 && !done; i++) {
      // Sin zombis en la zona, para medir el tiempo justo.
      for (const u of sim.units) if (u.alive) sim.killUnit(u, null, false);
      a.pos = { x: z.x, y: sim.groundY(z.x, z.z, 0), z: z.z };
      a.vel = { x: 0, y: 0, z: 0 };
      sim.step();
      done = sim.drainEvents().some((e) => e.k === 'alert' && e.w === 'horde_done');
    }
    expect(done).toBe(true);
    expect(m.step).toBe(1);
    expect(m.bases.length).toBe(1);
    expect(sim.structures.some((s) => s.kind === 'turret')).toBe(true);
    // La siguiente es la de los nidos: están en pie y destruirlos la completa.
    expect(MISSIONS[1].kind).toBe('nests');
    expect(m.nests.length).toBeGreaterThan(0);
    for (const n of [...m.nests]) sim.damageObstacle(n.obstacle, 99999, a);
    sim.step();
    expect(m.nests.length).toBe(0);
    expect(m.step).toBe(2);
  });
});

describe('juegos de la plataforma', () => {
  it('cada modo pertenece a un juego y cada juego tiene mapas, reglas y una vitrina válidos', () => {
    for (const id of GAME_IDS) {
      const g = GAMES[id];
      expect(g.modes.length).toBeGreaterThan(0);
      for (const m of g.modes) expect(MODE_INFO[m].game).toBe(id);
      const maps = mapsFor(g);
      expect(maps.length).toBeGreaterThan(0);
      expect(maps).toContain(g.demo.map);
      expect(g.rulesets.length).toBeGreaterThan(0);
    }
    for (const m of Object.keys(MODE_INFO) as ModeId[]) expect(GAMES[MODE_INFO[m].game].modes).toContain(m);
  });

  it('los ajustes siempre quedan como el juego los exige', () => {
    const base = { ...DEFAULT_SETTINGS };
    // Entrar a la Carrera: sus reglas, todos contra todos y una pista.
    const race = enterGame(base, 'race');
    expect([race.mode, race.rules, race.teams, MAPS[race.map].kind]).toEqual(['race', 'race', 'ffa', 'race']);
    // De ahí a la Horda: armas, cooperativo (un solo equipo) y su propio mapa.
    const horde = enterMode(race, 'horde');
    expect([horde.rules, horde.teams, MAPS[horde.map].kind]).toEqual(['horde', 'teams', 'horde']);
    expect(sidesOf(horde)).toBe('coop');
    // Volver a la Arena: reglas elegibles otra vez y el formato que quiera el host.
    const arena = enterGame(horde, 'arena');
    expect(arena.mode).toBe('stock');
    expect(GAMES.arena.rulesets).toContain(arena.rules);
    expect(sidesOf({ ...arena, teams: 'ffa' })).toBe('ffa');
    // Cambiar de modo dentro del mismo juego no pisa lo que eligió el host.
    expect(enterMode({ ...arena, timeLimit: 1200, rules: 'full' }, 'koth')).toMatchObject({ mode: 'koth', timeLimit: 1200, rules: 'full' });
    // Un mapa o unas reglas que no son del juego se corrigen; lo válido no se toca.
    expect(normalizeSettings({ ...base, mode: 'moba', map: 'cantera', rules: 'brawl' })).toMatchObject({ rules: 'moba', teams: 'teams' });
    expect(MAPS[normalizeSettings({ ...base, mode: 'moba', map: 'cantera' }).map].kind).toBe('moba');
    expect(normalizeSettings({ ...base, map: 'islote', rules: 'full' })).toMatchObject({ map: 'islote', rules: 'full' });
    expect(gameOf('desconocido').id).toBe('arena');
  });
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

describe('artefactos del mapa', () => {
  const mk = () => {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, map: 'flipper' }, roster: roster(2), seed: 4 });
    sim.phase = 'play';
    return sim;
  };
  const gadget = (sim: Simulation, kind: string) => sim.gadgets.find((g) => g.kind === kind)!;

  it('resorte: es terreno, rebota igual en el movimiento compartido (host y predicción)', () => {
    const t = new Terrain('flipper');
    const cw = new CollisionWorld(t);
    const pad = t.cells.findIndex((c) => c.pad);
    const c = t.cellCenter(pad % t.w, Math.floor(pad / t.w));
    const s = mkState(c.x, 0, c.z);
    const out = newMoveOut();
    stepMove(s, emptyInput(), defaultMoveParams(), cw, DT, out);
    expect(out.bounced).toBe(true);
    expect(s.vel.y).toBe(PAD_V);
    expect(s.grounded).toBe(false);
    // En la simulación sube varios metros y avisa con un evento.
    const sim = mk();
    const a = sim.chars[0];
    a.pos = { x: c.x, y: 0, z: c.z };
    let top = 0, pads = 0;
    for (let i = 0; i < 60; i++) {
      sim.step();
      top = Math.max(top, a.pos.y);
      pads += sim.drainEvents().filter((e) => e.k === 'gad' && e.w === 'pad').length;
    }
    expect(top).toBeGreaterThan(3.5);
    expect(pads).toBeGreaterThanOrEqual(1);
  });

  it('paragolpes: rebota a quien lo toca, sin importar la etapa', () => {
    const sim = mk();
    const g = gadget(sim, 'bumper');
    const [a] = sim.chars;
    a.pos = { x: g.x + 0.7, y: 0, z: g.z };
    sim.step();
    expect(a.vel.x).toBeGreaterThan(6);
    expect(a.heat).toBeGreaterThan(0);
    expect(sim.drainEvents().some((e) => e.k === 'gad' && e.w === 'bumper' && e.i === g.idx)).toBe(true);
  });

  it('rotor: la barra barre a quien está en su camino y se esquiva saltando', () => {
    for (const jump of [false, true]) {
      const sim = mk();
      const g = gadget(sim, 'rotor');
      const [a] = sim.chars;
      const ang = rotorAngle(g.idx, sim.tick + 1);
      a.pos = { x: g.x + Math.cos(ang) * 2, y: jump ? ROTOR.h + 0.6 : 0, z: g.z + Math.sin(ang) * 2 };
      a.grounded = !jump;
      sim.step();
      expect(a.tumble > 0, jump ? 'saltando' : 'en el piso').toBe(!jump);
    }
  });

  it('géiser: avisa, dispara y manda al aire a quien está encima', () => {
    const sim = mk();
    const g = gadget(sim, 'geyser');
    const [a] = sim.chars;
    a.pos = { x: g.x, y: 0, z: g.z };
    // Mientras avisa no pasa nada.
    while (geyserPhase(g.idx, sim.tick + 1) !== 'warn') sim.tick++;
    sim.step();
    expect(a.vel.y).toBe(0);
    while (geyserPhase(g.idx, sim.tick + 1) !== 'burst') sim.tick++;
    a.pos = { x: g.x, y: 0, z: g.z };
    sim.step();
    expect(a.vel.y).toBeGreaterThanOrEqual(GEYSER.up);
    expect(a.tumble).toBe(0);
    expect(sim.drainEvents().filter((e) => e.k === 'gad' && e.w === 'geyser' && e.i === g.idx).length).toBe(1);
  });

  it('barril: explota al romperse y le pega a todos los de cerca, también a quien lo rompió', () => {
    const sim = mk();
    const d = sim.destructibles.find((x) => x.explosive)!;
    const [a, b] = sim.chars;
    a.pos = { x: d.x - 1.6, y: 0, z: d.z };
    b.pos = { x: d.x + 1.6, y: 0, z: d.z };
    expect(d.maxHp).toBe(BARREL.hp);
    sim.damageObstacle(d.obstacle, 999, a);
    expect(d.stage).toBe(3);
    expect(a.heat).toBeGreaterThan(10);
    expect(b.heat).toBeGreaterThan(10);
    expect(b.vel.x).toBeGreaterThan(3);
    expect(sim.pickups.length).toBe(0);
    expect(sim.drainEvents().some((e) => e.k === 'boom' && e.c === 'barrel')).toBe(true);
  });

  it('los artefactos viajan en el frame y sobreviven a la codificación de red', () => {
    const sim = mk();
    const w = decodeWorld(JSON.parse(JSON.stringify(encodeWorld(buildWorldFrame(sim)))));
    expect(w.gad.length).toBe(sim.gadgets.length);
    expect(w.gad.length).toBeGreaterThan(5);
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

  it('comandos de la red: lo malformado se descarta antes de llegar a la simulación', () => {
    expect(parseCommand({ c: 'craft', id: 'coraza' })).toEqual({ c: 'craft', id: 'coraza' });
    expect(parseCommand({ c: 'sell', id: 'coraza', extra: 1 })).toEqual({ c: 'sell', id: 'coraza' });
    expect(parseCommand({ c: 'mutate', slot: 'q', route: 'tank' })).toEqual({ c: 'mutate', slot: 'q', route: 'tank' });
    const bad: unknown[] = [
      null, undefined, 7, 'craft', [], {}, { c: 'nope' },
      { c: 'craft' }, { c: 'craft', id: 5 }, { c: 'craft', id: 'no-existe' }, { c: 'craft', id: 'constructor' }, { c: 'sell', id: '__proto__' },
      { c: 'mutate', slot: 'zz', route: 'tank' }, { c: 'mutate', slot: 'q', route: 'toString' }, { c: 'mutate', slot: 'q' }, { c: 'mutate', slot: 'q', route: 3 },
    ];
    for (const b of bad) expect(parseCommand(b), JSON.stringify(b)).toBeNull();

    // Completo (forja prendida): lo que pasa el filtro no rompe el tick ni deja estado inválido.
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, rules: 'full' }, roster: roster(2), seed: 9 });
    sim.phase = 'play';
    const a = sim.chars[0];
    a.level = 5;
    a.mats = { stone: 99, metal: 99, crystal: 99, goo: 99 };
    for (const b of bad) {
      const cmd = parseCommand(b);
      if (cmd) sim.queueCommand(a.pid, cmd);
    }
    expect(() => sim.step()).not.toThrow();
    expect(a.mutations).toEqual({});
    expect(a.passives.length).toBe(0);
  });
});
