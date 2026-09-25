import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { BotBrain } from '../../src/core/bots';
import { DT } from '../../src/core/constants';
import { Simulation } from '../../src/core/sim';
import { DEFAULT_SETTINGS, HERO_IDS } from '../../src/core/types';

it('estadísticas de bots (informativo)', () => {
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
  writeFileSync(process.env.KB_OUT ?? 'bots.txt', out.join('\n'));
});
