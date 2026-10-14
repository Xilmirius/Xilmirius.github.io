// Herramienta de balance: estadísticas de partidas de bots por nivel (`npm run tool:bots`).
// `npm run tool:race`: lo mismo para las cuatro pistas de Carrera (tarea 03: llegadas, trabados, agarres).
// `npm run tool:stuck [mapa] [partidas]`: trabados de los zombis (tarea 07): zombis que salieron, reubicados, segundos-zombi sin avanzar y caídas solas.
// `npm run tool:horde [mapa] [partidas]`: partidas de Horda con tres bots por dificultad (tarea 04: victorias, vidas perdidas, duración).
import { BotBrain } from '../src/core/bots';
import { DT } from '../src/core/constants';
import { ZOMBIES, type HordeMode, type ZombieKind } from '../src/core/horde';
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


/** Una partida de Horda con bots (sin pantalla): gana el equipo si llega a la extracción, pierde si se queda sin vidas. */
function runHorde(map: string, level: 1 | 2 | 3, seed: number, bots = 3, maxSec = 900) {
  const sim = new Simulation({
    settings: { ...DEFAULT_SETTINGS, mode: 'horde', map, difficulty: level, lives: 3, timeLimit: 0 },
    roster: Array.from({ length: bots }, (_, i) => ({ pid: 'b' + i, name: 'b' + i, hero: HERO_IDS[i % 4], team: 0, bot: true })),
    seed,
  });
  const brains = sim.chars.map((_, i) => new BotBrain(2, seed * 97 + i + 1));
  let broke = 0, falls = 0, heatSeen = 0, scrapTotal = 0, stepSeen = 0, lv3At5 = -1, bullets = 0, bodyHits = 0;
  const spent = new Map<number, number>();
  for (let t = 0; t < maxSec * 60 && sim.phase !== 'end'; t++) {
    sim.chars.forEach((c, k) => { c.input = brains[k].think(sim, c, DT); });
    sim.step();
    for (const e of sim.drainEvents()) {
      if (e.k === 'broke') broke++; else if (e.k === 'ring') falls++;
      else if (e.k === 'pick') scrapTotal++;
      else if (e.k === 'shot') for (let i = 0; i + 3 < e.p.length; i += 4) { bullets++; if (e.p[i + 3] === 1 || e.p[i + 3] === 3) bodyHits++; }
    }
    for (const c of sim.chars) heatSeen = Math.max(heatSeen, c.heat);
    const step = (sim.mode as HordeMode).step;
    // Al llegar a la quinta misión: cuántos bots tienen al menos un arma en nivel 3.
    if (step >= 4 && lv3At5 < 0) lv3At5 = sim.chars.filter((c) => c.wLv.some((l) => l >= 3)).length;
    stepSeen = step;
  }
  void spent;
  const lost = sim.chars.reduce((n, c) => n + (sim.settings.lives - c.lives), 0);
  const maxLv = [0, 0, 0, 0];
  for (const c of sim.chars) c.wLv.forEach((l, i) => { maxLv[i] += l; });
  return { won: sim.result?.winner === 0, secs: sim.tick / 60, lost, broke, falls, heatSeen, scrapTotal, stepSeen, lv3At5, bots: sim.chars.length, lvSum: maxLv, bullets, bodyHits, scrapLeft: sim.chars.reduce((n, c) => n + c.scrap, 0) / sim.chars.length };
}

function hordeStats() {
  const map = process.argv[3] ?? 'refugio';
  const runs = Number(process.argv[4] ?? 20);
  let seed = Number(process.argv[5] ?? 5000);
  for (const level of [1, 2, 3] as const) {
    let wins = 0, lost = 0, secs = 0, broke = 0, falls = 0, heat = 0, scrap = 0, steps = 0, lv3 = 0, reached5 = 0, left = 0, bullets = 0, bodyHits = 0;
    const lvSum = [0, 0, 0, 0];
    for (let i = 0; i < runs; i++) {
      const r = runHorde(map, level, ++seed);
      if (r.won) wins++;
      lost += r.lost; secs += r.secs; broke += r.broke; falls += r.falls; heat = Math.max(heat, r.heatSeen);
      scrap += r.scrapTotal; steps += r.stepSeen; left += r.scrapLeft; bullets += r.bullets; bodyHits += r.bodyHits;
      if (r.lv3At5 >= 0) { reached5++; lv3 += r.lv3At5 === r.bots ? 1 : 0; }
      r.lvSum.forEach((l, k) => { lvSum[k] += l / r.bots; });
    }
    console.log(`${map} dificultad ${level}: ganan ${wins}/${runs} · vidas perdidas/partida ${(lost / runs).toFixed(1)} (por vida en cero ${(broke / runs).toFixed(1)}, por caída ${(falls / runs).toFixed(1)}) · dura ${(secs / runs).toFixed(0)}s · heat máx ${heat}`);
    console.log(`   precisión de las balas (le dan a un cuerpo / balas disparadas, sin cohetes) ${bullets ? ((bodyHits / bullets) * 100).toFixed(1) : '-'} % de ${(bullets / runs).toFixed(0)} por partida
   chatarra juntada/partida ${(scrap / runs).toFixed(0)} (sobra ${(left / runs).toFixed(0)} por héroe) · misión alcanzada ${(steps / runs).toFixed(1)} · llegan a la 5ª ${reached5}, con todos los bots en nivel 3+: ${lv3} · nivel final medio por arma (pistola/uzi/escopeta/cohete, 0 = nadie la tiene) ${lvSum.map((l) => (l / runs).toFixed(1)).join('/')}`);
  }
}

/**
 * Una partida de Horda con tres bots midiendo a los zombis. "Sin avanzar": vivo, sin atacar (ni estar al alcance de un héroe),
 * sin aturdimiento ni vuelo, y que no se movió ni 0,6 m en los últimos 1,5 s.
 */
function runStuck(map: string, level: 1 | 2 | 3, seed: number, maxSec = 600) {
  const sim = new Simulation({
    settings: { ...DEFAULT_SETTINGS, mode: 'horde', map, difficulty: level, lives: 3, timeLimit: 0 },
    roster: Array.from({ length: 3 }, (_, i) => ({ pid: 'b' + i, name: 'b' + i, hero: HERO_IDS[i % 4], team: 0, bot: true })),
    seed,
  });
  const brains = sim.chars.map((_, i) => new BotBrain(2, seed * 97 + i + 1));
  const seen = new Set<number>();
  const anchor = new Map<number, { x: number; z: number; t: number }>();
  let zombieTicks = 0, idleTicks = 0, fell = 0;
  for (let t = 0; t < maxSec * 60 && sim.phase !== 'end'; t++) {
    sim.chars.forEach((c, k) => { c.input = brains[k].think(sim, c, DT); });
    sim.step();
    for (const e of sim.drainEvents()) if (e.k === 'udie' && e.fall) fell++;
    for (const u of sim.units) {
      if (!u.alive) continue;
      seen.add(u.id);
      zombieTicks++;
      const ai = u.ai as { kind: ZombieKind; windup: number } | null;
      const def = ai ? ZOMBIES[ai.kind] : null;
      let near = Infinity;
      for (const h of sim.chars) if (h.alive) near = Math.min(near, Math.hypot(h.pos.x - u.pos.x, h.pos.z - u.pos.z));
      const busy = !def || ai!.windup > 0 || u.stun > 0 || u.hitstun > 0 || u.tumble > 0 || !u.grounded || near - 1 <= def.range + 1;
      const a = anchor.get(u.id);
      if (busy || !a || Math.hypot(u.pos.x - a.x, u.pos.z - a.z) >= 0.6) { anchor.set(u.id, { x: u.pos.x, z: u.pos.z, t }); continue; }
      if (t - a.t >= 90) idleTicks++;
    }
  }
  return { spawned: seen.size, relocated: (sim.mode as HordeMode).relocated, idleSecs: idleTicks / 60, zombieSecs: zombieTicks / 60, fell, secs: sim.tick / 60 };
}

function stuckStats() {
  const map = process.argv[3] ?? 'refugio';
  const runs = Number(process.argv[4] ?? 20);
  let seed = 7000, spawned = 0, relocated = 0, idle = 0, total = 0, fell = 0, secs = 0;
  for (let i = 0; i < runs; i++) {
    const r = runStuck(map, 2, ++seed);
    spawned += r.spawned; relocated += r.relocated; idle += r.idleSecs; total += r.zombieSecs; fell += r.fell; secs += r.secs;
  }
  console.log(`${map}: ${runs} partidas (${(secs / runs).toFixed(0)} s cada una) · zombis salidos ${spawned} · reubicados por trabados ${relocated} (${((relocated / spawned) * 100).toFixed(2)} %) · segundos-zombi sin avanzar ${idle.toFixed(0)} de ${total.toFixed(0)} (${((idle / total) * 100).toFixed(2)} %) · caídos solos al vacío ${fell} (${((fell / spawned) * 100).toFixed(2)} %)`);
}

if (process.argv[2] === 'race') raceStats();
else if (process.argv[2] === 'stuck') stuckStats();
else if (process.argv[2] === 'horde') hordeStats();
else brawlStats();
