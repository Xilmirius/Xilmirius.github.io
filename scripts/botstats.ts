// Herramienta de balance: estadísticas de partidas de bots por nivel (`npm run tool:bots`).
// `npm run tool:race`: lo mismo para las cuatro pistas de Carrera (tarea 03: llegadas, trabados, agarres).
// `npm run tool:stuck [mapa] [partidas]`: trabados de los zombis (tarea 07): zombis que salieron, reubicados, segundos-zombi sin avanzar y caídas solas.
// `npm run tool:horde [mapa] [partidas]`: partidas de Horda con tres bots por dificultad (tarea 04: victorias, vidas perdidas, duración).
// `npm run tool:mesh`: Arena (todos sus mapas) y Asedio (todos los suyos) con bots, más la huella de la malla de cada mapa y semilla (tarea 14).
// La bandera `--organic` (en cualquiera de los de arriba) arma el terreno con la malla orgánica, sembrada con la semilla de cada partida.
import { BotBrain } from '../src/core/bots';
import { DT } from '../src/core/constants';
import { ZOMBIES, type HordeMode, type ZombieKind } from '../src/core/horde';
import { distanceField, type RaceMode } from '../src/core/race';
import { GAMES, mapsFor } from '../src/core/games';
import { MAPS } from '../src/core/maps';
import { Simulation } from '../src/core/sim';
import { Terrain } from '../src/core/terrain';
import type { TerrainMesh } from '../src/core/terrainMesh';
import { DEFAULT_SETTINGS, HERO_IDS } from '../src/core/types';

/** `--organic`: el terreno con la malla orgánica (tarea 14). Los argumentos de posición se leen sin las banderas. */
const ORGANIC = process.argv.includes('--organic');
const ARGS = process.argv.filter((a, i) => i >= 2 && !a.startsWith('--'));

/**
 * Cuenta los héroes que caen al vacío en los tres segundos siguientes a aparecer o reaparecer (tarea 14). `falls` son los que
 * caen donde aparecieron (a menos de 1,5 m y sin haber salido volando): el punto no tenía piso, y ninguno debería. `later` son los
 * que caen después de moverse o de recibir un golpe (el juego: un bot que falla una zanja, un empujón).
 * Se llama una vez por tick, después de `sim.step()`.
 */
class SpawnWatch {
  spawns = 0;
  falls = 0;
  later = 0;
  private since = new Map<number, number>();
  private alive = new Map<number, boolean>();
  private flagged = new Set<string>();
  private at = new Map<number, { x: number; y: number; z: number }>();
  step(sim: Simulation) {
    for (const c of sim.chars) {
      if (c.alive && !this.alive.get(c.id)) { this.since.set(c.id, sim.tick); this.spawns++; this.at.set(c.id, { x: c.pos.x, y: c.pos.y, z: c.pos.z }); }
      this.alive.set(c.id, c.alive);
      const at = this.since.get(c.id);
      if (!c.alive || at === undefined || sim.tick - at > 180 || c.pos.y > -2.5) continue;
      const key = `${c.id}:${at}`;
      if (!this.flagged.has(key)) {
        this.flagged.add(key);
        const p = this.at.get(c.id)!;
        if (Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < 1.5 && c.tumble <= 0) this.falls++; else this.later++;
        if (process.env.DEBUG_FALL) {
          console.log(`   caída: héroe ${c.id} apareció en (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) con piso ${sim.terrain.groundAt(p.x, p.z)} · cayó a los ${((sim.tick - at) / 60).toFixed(2)} s en (${c.pos.x.toFixed(2)}, ${c.pos.z.toFixed(2)}) · vivo ${c.alive} invulnerable ${c.invuln.toFixed(2)} lanzado ${c.tumble.toFixed(2)}`);
        }
      }
    }
  }
}

function brawlStats() {
  const out: string[] = [];
  for (const level of [1, 2, 3] as const) {
    const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS, mode: 'kills', killTarget: 999, timeLimit: 240, organic: ORGANIC }, roster:
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
    settings: { ...DEFAULT_SETTINGS, mode: 'race', map, teams: 'ffa', cup: 1, timeLimit: 300, organic: ORGANIC },
    roster: Array.from({ length: 6 }, (_, i) => ({ pid: 'b' + i, name: 'b' + i, hero: HERO_IDS[i % 4], team: i, bot: true })),
    seed,
  });
  const brains = sim.chars.map((_, i) => new BotBrain(level, seed * 97 + i + 1));
  let grabs = 0, missed = 0;
  const mode = sim.mode as RaceMode;
  const watch = new SpawnWatch();
  // Puerta sin contar: alguien pisa piso más cerca de la puerta siguiente que cualquier celda de la que le toca, y su avance no sube.
  const t = sim.terrain, n = t.gates.length;
  const field = t.gates.map((g) => distanceField(t, g.cells));
  const gateMin = t.gates.map((g, i) => (i + 1 < n ? Math.min(...[...g.cells].map((c) => field[i + 1][c])) : Infinity));
  const ahead = new Map<number, number>();
  for (let tick = 0; tick < 300 * 60 && sim.phase !== 'end'; tick++) {
    sim.chars.forEach((c, k) => { c.input = brains[k].think(sim, c, DT); });
    sim.step();
    watch.step(sim);
    for (const e of sim.drainEvents()) if (e.k === 'grab' && e.s === 1) grabs++;
    for (const c of sim.chars) {
      const i = mode.next.get(c.id) ?? 0;
      if (!c.alive || i + 1 >= n || mode.finished(c.id)) { ahead.set(c.id, 0); continue; }
      const ci = t.cellIndexAt(c.pos.x, c.pos.z);
      const d = ci >= 0 ? field[i + 1][ci] : Infinity;
      if (c.grounded && d + 1 < gateMin[i]) { const k = (ahead.get(c.id) ?? 0) + 1; ahead.set(c.id, k); if (k === 30) missed++; } else ahead.set(c.id, 0);
    }
  }
  const order = mode.order;
  return {
    finished: order.length,
    first: order.length ? mode.times.get(order[0])! : -1,
    last: order.length ? mode.times.get(order[order.length - 1])! : -1,
    grabs, missed, spawnFalls: watch.falls, spawnLater: watch.later, spawns: watch.spawns,
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
      let finishedAll = 0, stuck = 0, grabs = 0, missed = 0, falls = 0, later = 0, spawns = 0;
      const firsts: number[] = [], lasts: number[] = [];
      for (let race = 0; race < perLevel; race++) {
        seed++;
        const r = runRace(map, level, seed);
        if (r.finished === 6) finishedAll++;
        stuck += 6 - r.finished;
        grabs += r.grabs; missed += r.missed; falls += r.spawnFalls; later += r.spawnLater; spawns += r.spawns;
        if (r.finished > 0) { firsts.push(r.first); lasts.push(r.last); }
      }
      out.push(
        `${map} L${level}: llegaron-todos=${finishedAll}/${perLevel} trabados=${stuck} agarres/carrera=${(grabs / perLevel).toFixed(1)} ` +
        `1º=${avg(firsts)}s último=${avg(lasts)}s puertas-sin-contar=${missed} caídas-en-el-lugar=${falls}/${spawns} (+${later} después de moverse)`,
      );
    }
  }
  console.log(out.join('\n'));
}


/** Una partida de Horda con bots (sin pantalla): gana el equipo si llega a la extracción, pierde si se queda sin vidas. */
function runHorde(map: string, level: 1 | 2 | 3, seed: number, bots = 3, maxSec = 900) {
  const sim = new Simulation({
    settings: { ...DEFAULT_SETTINGS, mode: 'horde', map, difficulty: level, lives: 3, timeLimit: 0, organic: ORGANIC },
    roster: Array.from({ length: bots }, (_, i) => ({ pid: 'b' + i, name: 'b' + i, hero: HERO_IDS[i % 4], team: 0, bot: true })),
    seed,
  });
  const brains = sim.chars.map((_, i) => new BotBrain(2, seed * 97 + i + 1));
  let broke = 0, falls = 0, heatSeen = 0, scrapTotal = 0, stepSeen = 0, lv3At5 = -1, bullets = 0, bodyHits = 0;
  const spent = new Map<number, number>();
  const watch = new SpawnWatch();
  let stepMs = 0;
  for (let t = 0; t < maxSec * 60 && sim.phase !== 'end'; t++) {
    sim.chars.forEach((c, k) => { c.input = brains[k].think(sim, c, DT); });
    const t0 = performance.now();
    sim.step();
    stepMs += performance.now() - t0;
    watch.step(sim);
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
  return { won: sim.result?.winner === 0, secs: sim.tick / 60, lost, broke, falls, heatSeen, scrapTotal, stepSeen, lv3At5, bots: sim.chars.length, lvSum: maxLv, bullets, bodyHits, scrapLeft: sim.chars.reduce((n, c) => n + c.scrap, 0) / sim.chars.length, stepMs, spawnFalls: watch.falls, spawnLater: watch.later, spawns: watch.spawns };
}

function hordeStats() {
  const map = ARGS[1] ?? 'refugio';
  const runs = Number(ARGS[2] ?? 20);
  let seed = Number(ARGS[3] ?? 5000);
  for (const level of [1, 2, 3] as const) {
    let stepMs = 0, spawnFalls = 0, spawnLater = 0, spawns = 0;
    let wins = 0, lost = 0, secs = 0, broke = 0, falls = 0, heat = 0, scrap = 0, steps = 0, lv3 = 0, reached5 = 0, left = 0, bullets = 0, bodyHits = 0;
    const lvSum = [0, 0, 0, 0];
    for (let i = 0; i < runs; i++) {
      const r = runHorde(map, level, ++seed);
      if (r.won) wins++;
      stepMs += r.stepMs; spawnFalls += r.spawnFalls; spawnLater += r.spawnLater; spawns += r.spawns;
      lost += r.lost; secs += r.secs; broke += r.broke; falls += r.falls; heat = Math.max(heat, r.heatSeen);
      scrap += r.scrapTotal; steps += r.stepSeen; left += r.scrapLeft; bullets += r.bullets; bodyHits += r.bodyHits;
      if (r.lv3At5 >= 0) { reached5++; lv3 += r.lv3At5 === r.bots ? 1 : 0; }
      r.lvSum.forEach((l, k) => { lvSum[k] += l / r.bots; });
    }
    console.log(`${map} dificultad ${level}: ganan ${wins}/${runs} · vidas perdidas/partida ${(lost / runs).toFixed(1)} (por vida en cero ${(broke / runs).toFixed(1)}, por caída ${(falls / runs).toFixed(1)}) · dura ${(secs / runs).toFixed(0)}s · heat máx ${heat}`);
    console.log(`   precisión de las balas (le dan a un cuerpo / balas disparadas, sin cohetes) ${bullets ? ((bodyHits / bullets) * 100).toFixed(1) : '-'} % de ${(bullets / runs).toFixed(0)} por partida
   terreno ${ORGANIC ? 'orgánico' : 'cuadrado'}: ${(stepMs / secs).toFixed(3)} ms por segundo simulado · héroes que caen al vacío en los 3 s siguientes a aparecer: ${spawnFalls} en el lugar (+${spawnLater} después de moverse o salir volando) de ${spawns} apariciones
   chatarra juntada/partida ${(scrap / runs).toFixed(0)} (sobra ${(left / runs).toFixed(0)} por héroe) · misión alcanzada ${(steps / runs).toFixed(1)} · llegan a la 5ª ${reached5}, con todos los bots en nivel 3+: ${lv3} · nivel final medio por arma (pistola/uzi/escopeta/cohete, 0 = nadie la tiene) ${lvSum.map((l) => (l / runs).toFixed(1)).join('/')}`);
  }
}

/**
 * Una partida de Horda con tres bots midiendo a los zombis. "Sin avanzar": vivo, sin atacar (ni estar al alcance de un héroe),
 * sin aturdimiento ni vuelo, y que no se movió ni 0,6 m en los últimos 1,5 s.
 */
function runStuck(map: string, level: 1 | 2 | 3, seed: number, maxSec = 600) {
  const sim = new Simulation({
    settings: { ...DEFAULT_SETTINGS, mode: 'horde', map, difficulty: level, lives: 3, timeLimit: 0, organic: ORGANIC },
    roster: Array.from({ length: 3 }, (_, i) => ({ pid: 'b' + i, name: 'b' + i, hero: HERO_IDS[i % 4], team: 0, bot: true })),
    seed,
  });
  const brains = sim.chars.map((_, i) => new BotBrain(2, seed * 97 + i + 1));
  const seen = new Set<number>();
  const anchor = new Map<number, { x: number; z: number; t: number }>();
  const watch = new SpawnWatch();
  let zombieTicks = 0, idleTicks = 0, fell = 0;
  for (let t = 0; t < maxSec * 60 && sim.phase !== 'end'; t++) {
    sim.chars.forEach((c, k) => { c.input = brains[k].think(sim, c, DT); });
    sim.step();
    watch.step(sim);
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
  return { spawned: seen.size, relocated: (sim.mode as HordeMode).relocated, idleSecs: idleTicks / 60, zombieSecs: zombieTicks / 60, fell, secs: sim.tick / 60, spawnFalls: watch.falls, spawnLater: watch.later, spawns: watch.spawns };
}

function stuckStats() {
  const map = ARGS[1] ?? 'refugio';
  const runs = Number(ARGS[2] ?? 20);
  let seed = Number(ARGS[3] ?? 7000), spawned = 0, heroFalls = 0, heroLater = 0, heroSpawns = 0, relocated = 0, idle = 0, total = 0, fell = 0, secs = 0;
  for (let i = 0; i < runs; i++) {
    const r = runStuck(map, 2, ++seed);
    heroFalls += r.spawnFalls; heroLater += r.spawnLater; heroSpawns += r.spawns; spawned += r.spawned; relocated += r.relocated; idle += r.idleSecs; total += r.zombieSecs; fell += r.fell; secs += r.secs;
  }
  console.log(`${map}: ${runs} partidas (${(secs / runs).toFixed(0)} s cada una) · zombis salidos ${spawned} · reubicados por trabados ${relocated} (${((relocated / spawned) * 100).toFixed(2)} %) · segundos-zombi sin avanzar ${idle.toFixed(0)} de ${total.toFixed(0)} (${((idle / total) * 100).toFixed(2)} %) · caídos solos al vacío ${fell} (${((fell / spawned) * 100).toFixed(2)} %) · terreno ${ORGANIC ? 'orgánico' : 'cuadrado'} · héroes caídos al aparecer ${heroFalls} en el lugar (+${heroLater} después de moverse) de ${heroSpawns}`);
}

/** Cuántas celdas de la malla no tienen su gemela exacta al otro lado del eje x = 0 (clase, nivel, resorte y losa), o cruzan el eje. */
function mirrorProblems(m: TerrainMesh): number {
  const key = (x: number, z: number) => (Math.round(x * 64) + 100000) * 1000003 + Math.round(z * 64) + 100000;
  const right = new Map<number, number>();
  for (let q = 0; q < m.count; q++) if (m.cx[q] > 0) right.set(key(m.cx[q], m.cz[q]), q);
  let bad = 0;
  for (let q = 0; q < m.count; q++) {
    if (m.minX[q] < 0 && m.maxX[q] > 0) { bad++; continue; }
    if (m.cx[q] >= 0) continue;
    const o = right.get(key(-m.cx[q], m.cz[q]));
    if (o === undefined || m.cls[o] !== m.cls[q] || m.level[o] !== m.level[q] || m.pad[o] !== m.pad[q] || (m.slab[o] < 0) !== (m.slab[q] < 0)) bad++;
  }
  return bad;
}

/** Una partida de Arena o de Asedio con bots, hasta que termina o se acaba el tiempo. */
function runVersus(game: 'arena' | 'siege', map: string, seed: number) {
  const size = map === 'cornisas' ? 3 : 2;
  const roster = Array.from({ length: size * 2 }, (_, i) => ({ pid: 'b' + i, name: 'b' + i, hero: HERO_IDS[i % 4], team: i % 2, bot: true }));
  const sim = new Simulation({
    settings: game === 'arena'
      ? { ...DEFAULT_SETTINGS, mode: 'kills', map, killTarget: 12, timeLimit: 180, organic: ORGANIC }
      : { ...DEFAULT_SETTINGS, mode: 'moba', map, timeLimit: 900, organic: ORGANIC },
    roster, seed,
  });
  const brains = sim.chars.map((_, i) => new BotBrain(2, seed * 97 + i + 1));
  const watch = new SpawnWatch();
  const towers = sim.structures.filter((st) => st.kind === 'tower');
  const near = [Infinity, Infinity];
  let stepMs = 0;
  const limit = (game === 'arena' ? 200 : 1000) * 60;
  for (let t = 0; t < limit && sim.phase !== 'end'; t++) {
    sim.chars.forEach((c, k) => { c.input = brains[k].think(sim, c, DT); });
    const t0 = performance.now();
    sim.step();
    stepMs += performance.now() - t0;
    watch.step(sim);
    sim.drainEvents();
    if (game === 'siege' && t % 30 === 0) {
      for (const u of sim.units) {
        if (!u.alive || (u.ai as { lane?: number } | null)?.lane === undefined || (u.ai as { lane: number }).lane < 0) continue;
        for (const tw of towers) if (tw.team !== u.team && u.team <= 1) near[u.team] = Math.min(near[u.team], Math.hypot(u.pos.x - tw.x, u.pos.z - tw.z));
      }
    }
  }
  return { ended: sim.phase === 'end', secs: sim.tick / 60, spawnFalls: watch.falls, spawnLater: watch.later, spawns: watch.spawns, stepMs, near, fellBack: sim.terrain.meshFellBack };
}

/** Tarea 14: Arena y Asedio con bots, simetría de la malla de sus mapas y la huella de la malla de cada mapa y semilla. */
function meshStats() {
  const seeds = [1, 2, 3, 4, 5];
  console.log(`terreno ${ORGANIC ? 'orgánico' : 'cuadrado'}`);
  for (const game of ['arena', 'siege'] as const) {
    for (const map of mapsFor(GAMES[game])) {
      let ended = 0, falls = 0, later = 0, spawns = 0, stepMs = 0, secs = 0, fellBack = 0, asym = 0;
      const near = [Infinity, Infinity];
      for (const sd of seeds) {
        const r = runVersus(game, map, 300 + sd);
        if (r.ended) ended++;
        falls += r.spawnFalls; later += r.spawnLater; spawns += r.spawns; stepMs += r.stepMs; secs += r.secs; if (r.fellBack) fellBack++;
        near[0] = Math.min(near[0], r.near[0]); near[1] = Math.min(near[1], r.near[1]);
        asym += mirrorProblems(new Terrain(map, { organic: ORGANIC, seed: 300 + sd }).mesh);
      }
      console.log(
        `${game} ${map}: terminan ${ended}/${seeds.length} (${(secs / seeds.length).toFixed(0)} s) · caídas al aparecer ${falls} en el lugar (+${later} después de moverse) de ${spawns} · celdas sin gemela ${asym} · malla cuadrada por falla ${fellBack}`
        + (game === 'siege' ? ` · esbirro más cerca de una torre rival: equipo 0 ${near[0].toFixed(1)} m, equipo 1 ${near[1].toFixed(1)} m` : '') + ` · ${(stepMs / secs).toFixed(2)} ms/s`,
      );
    }
  }
  // La huella (`TerrainMesh.hash`) de cada mapa con cinco semillas: se corre en dos procesos y tiene que dar lo mismo.
  const out: string[] = [];
  for (const id of Object.keys(MAPS)) out.push(`${id}: ${seeds.map((sd) => new Terrain(id, { organic: ORGANIC, seed: sd }).mesh.hash.toString(16)).join(' ')}`);
  console.log('huellas:\n' + out.join('\n'));
}

if (ARGS[0] === 'race') raceStats();
else if (ARGS[0] === 'stuck') stuckStats();
else if (ARGS[0] === 'horde') hordeStats();
else if (ARGS[0] === 'mesh') meshStats();
else brawlStats();
