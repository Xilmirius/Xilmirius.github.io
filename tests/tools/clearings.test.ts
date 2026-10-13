// Herramienta: lista los claros que se decoran en cada mapa (VITEST_TOOLS=1 npx vitest run tests/tools/clearings.test.ts).
import { it } from 'vitest';
import { MAP_IDS, MAPS } from '../../src/core/maps';
import { Terrain } from '../../src/core/terrain';
import { ambienceOf } from '../../src/render/ambience';
import { analyze, takeClearings } from '../../src/render/topology';

it('claros por mapa', () => {
  for (const id of MAP_IDS) {
    const t = new Terrain(id);
    const topo = analyze(t);
    const amb = ambienceOf(MAPS[id].kind);
    const shapes: Record<string, number> = {};
    for (const w of topo.walls) shapes[w.shape] = (shapes[w.shape] ?? 0) + 1;
    console.log(`${id} (${t.w}×${t.h}, ${amb.name}) · muros ${JSON.stringify(shapes)} · puentes ${topo.bridges.length} · costa ${topo.coasts.length} · claros ${topo.clearings.length}`);
    for (const k of takeClearings(topo.clearings, amb.maxClearings)) console.log(`   claro celda ${k.ix},${k.iz} · centro ${k.x.toFixed(2)},${k.z.toFixed(2)} · radio ${k.r}`);
  }
});
