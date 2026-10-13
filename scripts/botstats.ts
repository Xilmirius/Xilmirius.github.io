// Herramienta de balance: estadísticas de partidas de bots por nivel (`npm run tool:bots`).
// `npm run tool:race`: lo mismo para las cuatro pistas de Carrera (tarea 03: llegadas, trabados, agarres).
import { BotBrain } from '../src/core/bots';
import { DT } from '../src/core/constants';
import type { RaceMode } from '../src/core/race';
import { Simulation } from '../src/core/sim';
import { DEFAULT_SETTINGS, HERO_IDS } from '../src/core/types';

function brawlStats() {
  const out: string[] = [];
  for (const level of [1, 2, 3] as const) {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, mode: 'kills', killTarget: 999, timeLimit: 240 }, roster:
      Array.from({ length: 6 }, (_, i) => ({ pid: 'b' + i, name: 'b' + i, hero: HERO_IDS[i % 4], team: i % 2, bot: true })), seed: 7 });
    const brains = sim.chars.map((_, i) => new BotBrain(level, i + 1));
    let credited = 0, self = 0, casts = 0, slams = 0, bodies = 0, tiles = 0, items = 0;
    const causes: Record<string, number> = {};
    for (let i = 0; i < 240 * 60 && sim.phase !== 'end'; i++) {
      sim.chars.forEach((c, k) => { c.input = brains[k].think(sim, c, DT); });
      sim.step();
      for (const e of sim.drainEvents()) {
        if (e.k === 'feed') { if (e.a >= 0) credited++; else self++; }
        if (e.k === 'cast') { casts++; causes[e.s] = (causes[e.s] ?? 0) + 1; }
        if (e.k === 'slam') slams++;
        if (e.k === 'body') bodies++;
        if (e.k === 'tile' && e.s === 4) tiles++;
        if (e.k === 'craft') items++;
      }
    }
    const lv = sim.chars.map((c) => c.level + "(" + Math.round(c.heatDealt) + "h," + Math.round(c.xp) + "xp)").join(",");
    out.push(`L${level}: credited=${credited} self=${self} casts=${casts} ${JSON.stringify(causes)} slams=${slams} body=${bodies} tilesGone=${tiles} crafts=${items} levels=${lv} mats=${JSON.stringify(sim.chars[0].mats)}`);
  }
  console.log(out.join('\n'));
}

/** Una carrera de 6 bots contra reloj (sin pantalla), hasta que termina o se acaba el tiempo. */
function runRace(map: string, level: 1 | 2 | 3, seed: number) {
  const sim = new Simulation({
    settings: { ...DEFAULT_SETTINGS, mode: 'race', map, teams: 'ffa', cup: 1, timeLimit: 300 },
    roster: Array.from({ length: 6 }, (_, i) => ({ pid: 'b' + i, name: 'b' + i, hero: HERO_IDS[i % 4], team: i, bot: true })),
    seed,
  });
  const brains = sim.chars.map((_, i) => new BotBrain(level, seed * 97 + i + 1));
  let grabs = 0;
  for (let t = 0; t < 300 * 60 && sim.phase !== 'end'; t++) {
    sim.chars.forEach((c, k) => { c.input = brains[k].think(sim, c, DT); });
    sim.step();
    for (const e of sim.drainEvents()) if (e.k === 'grab' && e.s === 1) grabs++;
  }
  const mode = sim.mode as RaceMode;
  const order = mode.order;
  return {
    finished: order.length,
    first: order.length ? mode.times.get(order[0])! : -1,
    last: order.length ? mode.times.get(order[order.length - 1])! : -1,
    grabs,
  };
}

function raceStats() {
  const maps = ['pista', 'serpentin', 'bolera', 'derrumbe'];
  const perLevel = 10; // 10 por dificultad × 3 = 30 por pista, como pide la tarea
  const out: string[] = [];
  const avg = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-');
  let seed = 1000;
  for (const map of maps) {
    for (const level of [1, 2, 3] as const) {
      let finishedAll = 0, stuck = 0, grabs = 0;
      const firsts: number[] = [], lasts: number[] = [];
      for (let race = 0; race < perLevel; race++) {
        seed++;
        const r = runRace(map, level, seed);
        if (r.finished === 6) finishedAll++;
        stuck += 6 - r.finished;
        grabs += r.grabs;
        if (r.finished > 0) { firsts.push(r.first); lasts.push(r.last); }
      }
      out.push(
        `${map} L${level}: llegaron-todos=${finishedAll}/${perLevel} trabados=${stuck} agarres/carrera=${(grabs / perLevel).toFixed(1)} ` +
        `1º=${avg(firsts)}s último=${avg(lasts)}s`,
      );
    }
  }
  console.log(out.join('\n'));
}

if (process.argv[2] === 'race') raceStats();
else brawlStats();
