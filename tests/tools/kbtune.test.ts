import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { STAGE_AT } from '../../src/core/constants';
import { Simulation } from '../../src/core/sim';
import { DEFAULT_SETTINGS } from '../../src/core/types';

it('tabla de knockback (informativa)', () => {
  const rows: string[] = [];
  for (const kb of [5, 8, 13, 16, 22]) {
    const line: string[] = [];
    for (const heat of [0, STAGE_AT[1], STAGE_AT[2], STAGE_AT[3]]) {
      const sim = new Simulation({ settings: { ...DEFAULT_SETTINGS }, roster: [
        { pid: 'a', name: 'a', hero: 'canto', team: 0, bot: true }, { pid: 'b', name: 'b', hero: 'gloop', team: 1, bot: true }], seed: 1 });
      sim.phase = 'play';
      const [a, b] = sim.chars;
      a.pos = { x: -20, y: 0, z: -2 };
      b.pos = { x: -16, y: 0, z: -2 };
      (sim as any).setHeat(b, heat);
      sim.hit(b, a, { heat: 0, kb, dirX: 1, dirZ: 0 });
      let t = 0;
      for (; t < 300; t++) { sim.step(); if (b.tumble <= 0 && b.grounded && t > 5) break; }
      line.push(`${(b.pos.x + 16).toFixed(1).padStart(5)}m ${(t / 60).toFixed(2)}s`);
    }
    rows.push(`kb ${String(kb).padStart(2)}: ${line.join(' | ')}`);
  }
  writeFileSync(process.env.KB_OUT ?? 'kb.txt', rows.join('\n'));
});
