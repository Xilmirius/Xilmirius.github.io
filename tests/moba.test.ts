// Asedio (MOBA): reglas del modo, protección de torres, volver a la base, forja en la base, piso que
// se rearma, esbirros que se tiran al vacío y partidas headless de bots en las dos variantes de mapa.
import { describe, expect, it } from 'vitest';
import { BotBrain } from '../src/core/bots';
import { DT, RECALL_TIME, TILE_HP } from '../src/core/constants';
import { emptyInput, BTN } from '../src/core/input';
import { mobaMapFor } from '../src/core/maps';
import { TOWER } from '../src/core/moba/defs';
import type { MobaMode } from '../src/core/moba/mode';
import { Simulation } from '../src/core/sim';
import { buildWorldFrame, decodeWorld, encodeWorld } from '../src/core/snapshot';
import { TILE_GONE, TILE_INTACT } from '../src/core/terrain';
import { DEFAULT_SETTINGS, type HeroId, type RosterEntry } from '../src/core/types';

function mk(n: number, map = 'puente', heroes: HeroId[] = ['canto', 'prisma', 'gloop', 'remache', 'prisma', 'canto'], seed = 3) {
  const roster: RosterEntry[] = Array.from({ length: n }, (_, i) => ({ pid: 'p' + i, name: 'P' + i, hero: heroes[i % heroes.length], team: i % 2, bot: true }));
  const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, mode: 'moba', map, timeLimit: 900 }, roster, seed });
  return { sim, mode: sim.mode as MobaMode };
}

const play = (sim: Simulation, seconds: number, each?: () => void) => {
  for (let i = 0; i < seconds * 60; i++) { each?.(); sim.step(); }
};

describe('Asedio: armado', () => {
  it('1 línea hasta 2 por equipo, 2 líneas con 3', () => {
    expect(mobaMapFor(1)).toBe('puente');
    expect(mobaMapFor(2)).toBe('puente');
    expect(mobaMapFor(3)).toBe('cornisas');
  });

  it('siempre por equipos y con sus reglas, aunque la configuración diga otra cosa', () => {
    const roster: RosterEntry[] = [0, 1].map((i) => ({ pid: 'p' + i, name: 'P' + i, hero: 'canto', team: i, bot: true }));
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, mode: 'moba', map: 'puente', teams: 'ffa', rules: 'brawl' }, roster, seed: 1 });
    expect(sim.settings.teams).toBe('teams');
    expect(sim.rules.id).toBe('moba');
    expect(sim.rules.forgeAtBase && sim.rules.recall).toBe(true);
  });

  it('torres y núcleos en su lugar; la interior y el núcleo arrancan protegidos', () => {
    const { mode } = mk(4);
    const t0 = mode.structs.filter((s) => s.team === 0);
    expect(t0.filter((s) => s.kind === 'tower').length).toBe(2);
    expect(t0.filter((s) => s.kind === 'core').length).toBe(1);
    expect(t0.find((s) => s.kind === 'tower' && s.ai.tier === 1)!.invuln).toBe(false);
    expect(t0.find((s) => s.kind === 'tower' && s.ai.tier === 2)!.invuln).toBe(true);
    expect(t0.find((s) => s.kind === 'core')!.invuln).toBe(true);
  });
});

describe('Asedio: reglas', () => {
  it('cae la exterior → la interior queda expuesta; cae la línea → el núcleo queda expuesto', () => {
    const { sim, mode } = mk(2);
    sim.phase = 'play';
    const mine = (tier: number) => mode.structs.find((s) => s.team === 0 && s.ai.tier === tier)!;
    const [attacker] = sim.chars.filter((c) => c.team === 1);
    sim.damageObstacle(mine(2).obstacle, 5000, attacker);
    expect(mine(2).hp).toBe(TOWER.hp[2]); // protegida: no le entra nada
    sim.damageObstacle(mine(1).obstacle, 5000, attacker);
    sim.step();
    expect(mine(2).invuln).toBe(false);
    expect(mine(0).invuln).toBe(true);
    sim.damageObstacle(mine(2).obstacle, 5000, attacker);
    sim.step();
    expect(mine(0).invuln).toBe(false);
    expect(mode.destroyed[1]).toBe(2);
    // Cada héroe del equipo que destruye se lleva materiales de todas las familias.
    expect(attacker.mats.stone).toBeGreaterThan(0);
  });

  it('destruir el núcleo gana la partida', () => {
    const { sim, mode } = mk(2);
    sim.phase = 'play';
    const [a] = sim.chars.filter((c) => c.team === 1);
    for (const s of mode.structs.filter((x) => x.team === 0)) { s.invuln = false; sim.damageObstacle(s.obstacle, 99999, a); }
    sim.step();
    expect(sim.phase).toBe('end');
    expect(sim.result?.winner).toBe(1);
  });

  it('B: volver a la base quieto; moverse lo corta', () => {
    const { sim } = mk(2);
    sim.phase = 'play';
    const [a] = sim.chars;
    const home = sim.baseCenter(a.team);
    a.pos = { x: 0, y: 0, z: 0 }; a.ppos = { ...a.pos };
    const evs: number[] = [];
    const step = () => { sim.step(); for (const e of sim.drainEvents()) if (e.k === 'recall') evs.push(e.s); };
    a.input = { ...emptyInput(), b: BTN.RECALL };
    step();
    a.input = { ...emptyInput() };
    for (let i = 0; i < 60; i++) step();
    a.input = { ...emptyInput(), mx: 1 };
    step();
    expect(evs).toEqual([1, 0]);
    a.input = { ...emptyInput(), b: BTN.RECALL };
    step();
    a.input = { ...emptyInput() };
    for (let i = 0; i < RECALL_TIME * 60 + 5; i++) step();
    expect(evs).toEqual([1, 0, 1, 2]);
    expect(Math.hypot(a.pos.x - home.x, a.pos.z - home.z)).toBeLessThan(6);
    expect(sim.atBase(a)).toBe(true);
  });

  it('la forja solo funciona en la base; la base te enfría', () => {
    const { sim } = mk(2);
    sim.phase = 'play';
    const [a] = sim.chars;
    a.mats = { stone: 20, metal: 20, crystal: 20, goo: 20 };
    a.pos = { x: 0, y: 0, z: 0 };
    sim.queueCommand(a.pid, { c: 'craft', id: 'coraza' });
    sim.step();
    expect(a.passives).toEqual([]);
    expect(sim.drainEvents().some((e) => e.k === 'deny')).toBe(true);
    const home = sim.baseCenter(a.team);
    a.pos = { x: home.x, y: 0, z: home.z };
    a.heat = 120;
    sim.queueCommand(a.pid, { c: 'craft', id: 'coraza' });
    play(sim, 1);
    expect(a.passives).toEqual(['coraza']);
    expect(a.heat).toBeLessThan(80);
  });

  it('el piso frágil que se cae vuelve a estar', () => {
    const { sim } = mk(2);
    sim.phase = 'play';
    const t = sim.terrain;
    sim.damageTile(0, TILE_HP + 1);
    play(sim, 2);
    expect(t.tileState[0]).toBe(TILE_GONE);
    play(sim, sim.rules.tileRegen);
    expect(t.tileState[0]).toBe(TILE_INTACT);
  });

  it('los esbirros tienen vida, vuelan con knockback y si caen al vacío mueren (crédito para quien los tiró)', () => {
    const { sim } = mk(2);
    sim.phase = 'play';
    const [a] = sim.chars;
    const u = sim.addUnit('melee', 1, a.pos.x + 1, a.pos.z, { name: 'G', family: 'stone', hp: 60, speed: 4, kbTaken: 1 });
    sim.hit(u, a, { heat: 10, kb: 0, dirX: 1, dirZ: 0 });
    expect(u.hp).toBeLessThan(60);
    expect(u.alive).toBe(true);
    // Lo tiramos lejos, fuera del mapa.
    u.pos = { x: 0, y: 0, z: 20 }; u.ppos = { ...u.pos };
    sim.hit(u, a, { heat: 1, kb: 60, dirX: 0, dirZ: 1 });
    let died: { by: number; fall: number } | null = null;
    for (let i = 0; i < 180 && !died; i++) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.k === 'udie' && e.id === u.id) died = { by: e.by, fall: e.fall };
    }
    expect(died).toEqual({ by: a.id, fall: 1 });
    expect(sim.units.includes(u)).toBe(false);
  });

  it('el empujón cargado le saca más vida a un esbirro que uno sin cargar', () => {
    const dmg = (hold: number) => {
      const { sim } = mk(2);
      sim.phase = 'play';
      const [a] = sim.chars;
      a.pos = { x: -20, y: 0, z: 0 }; a.ppos = { ...a.pos }; a.facing = Math.PI / 2;
      const u = sim.addUnit('melee', 1, a.pos.x + 1.2, a.pos.z, { name: 'G', family: 'stone', hp: 500, speed: 0, kbTaken: 0 });
      a.input = { ...emptyInput(), ax: u.pos.x, az: u.pos.z, b: BTN.PUSH };
      for (let i = 0; i < hold; i++) sim.step();
      a.input = { ...emptyInput(), ax: u.pos.x, az: u.pos.z };
      sim.step();
      return 500 - u.hp;
    };
    const quick = dmg(1), full = dmg(60);
    expect(quick).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(quick * 2);
  });

  it('las torres priorizan esbirros y castigan al héroe que le pega a un aliado bajo la torre', () => {
    const { sim, mode } = mk(2);
    sim.phase = 'play';
    const tower = mode.structs.find((s) => s.team === 0 && s.ai.tier === 1)!;
    const [ally] = sim.chars.filter((c) => c.team === 0);
    const [enemy] = sim.chars.filter((c) => c.team === 1);
    ally.pos = { x: tower.x + 3, y: 0, z: tower.z }; ally.ppos = { ...ally.pos };
    enemy.pos = { x: tower.x + 5, y: 0, z: tower.z }; enemy.ppos = { ...enemy.pos };
    const minion = sim.addUnit('melee', 1, tower.x + 4, tower.z + 1, { name: 'G', family: 'stone', hp: 500, speed: 0, kbTaken: 0 });
    enemy.input = { ...emptyInput(), ax: 999, az: tower.z };
    sim.step();
    expect(tower.target).toBe(minion.id);
    sim.hit(ally, enemy, { heat: 5, kb: 0, dirX: -1, dirZ: 0 });
    sim.step();
    expect(tower.target).toBe(enemy.id);
  });
});

describe('Asedio: partidas headless de bots', () => {
  for (const [n, map] of [[4, 'puente'], [6, 'cornisas']] as const) {
    it(`${n / 2}v${n / 2} en ${map}: oleadas, torres, economía y red sin errores`, () => {
      const { sim, mode } = mk(n, map);
      const brains = sim.chars.map((c, i) => new BotBrain(2, 40 + i));
      const seen = new Set<string>();
      let snapUnits = 0;
      for (let i = 0; i < 60 * 150; i++) {
        sim.chars.forEach((c, k) => { c.input = brains[k].think(sim, c, DT); });
        sim.step();
        for (const e of sim.drainEvents()) seen.add(e.k === 'alert' ? `alert:${e.w}` : e.k);
        if (i % 120 === 0) {
          const w = decodeWorld(JSON.parse(JSON.stringify(encodeWorld(buildWorldFrame(sim)))));
          expect(w.units.length).toBe(sim.units.length);
          expect(w.mode.moba).toBeTruthy();
          snapUnits = Math.max(snapUnits, w.units.length);
        }
      }
      for (const k of ['alert:wave', 'udie', 'uatk', 'tshot', 'gold', 'lvl', 'alert:coloso_up']) expect(seen.has(k), k).toBe(true);
      expect(snapUnits).toBeGreaterThan(8);
      expect(mode.waveN).toBeGreaterThanOrEqual(6);
      expect(sim.chars.every((c) => c.level >= 3)).toBe(true);
      expect(sim.chars.reduce((a, c) => a + c.cs, 0)).toBeGreaterThan(10);
    }, 60000);
  }
});
