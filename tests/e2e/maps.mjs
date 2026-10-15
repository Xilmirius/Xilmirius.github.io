// Capturas de los mapas para revisar el terreno y la ambientación: cada mapa visto desde arriba (entero) y a la
// altura de la cámara del juego en la salida, en un borde que da al vacío, al pie de un muro, en una rampa y sobre piso
// frágil (y, con FALL=1, con esa losa ya caída: el hueco que deja).
// Uso: npm run build && node tests/e2e/maps.mjs [mapa,mapa|all] [tema]   (OUT=carpeta, BASE=servidor ya levantado)
// El terreno es la malla cuadrada. Con ORGANIC=1 es la orgánica, y con SEED=n la de esa semilla (si no, una al azar: se imprime).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = process.env.OUT ?? 'tests/e2e/out';
mkdirSync(OUT, { recursive: true });
const PORT = 4183;
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE ?? `http://localhost:${PORT}/`;
const server = process.env.BASE ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
if (server) await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('localhost')) res(); }); setTimeout(res, 5000); });

/** Mapa → tarjeta del menú por la que se entra. */
const GAME_OF = { cantera: 'Arena', islote: 'Arena', flipper: 'Arena', refugio: 'Horda', pista: 'Carrera', serpentin: 'Carrera', bolera: 'Carrera', derrumbe: 'Carrera', puente: 'Asedio', cornisas: 'Asedio' };
const arg = process.argv[2] ?? 'all';
const maps = arg === 'all' ? Object.keys(GAME_OF) : arg.split(',');
const theme = process.argv[3];
const tag = process.env.TAG ? process.env.TAG + '-' : '';
const ORGANIC = process.env.ORGANIC === '1';
const SEED = process.env.SEED ? Number(process.env.SEED) : null;
const FALL = process.env.FALL === '1';

const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

for (const map of maps) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('rubble.prefs', JSON.stringify({ shadows: true, post: false, announcer: false, seenHelp: true, name: 'Yo', volMaster: 0 })); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${map}] ${e.message}`));
  try {
    await p.goto(BASE);
    await p.waitForSelector('.menu .logo');
    await p.locator(`.gamecard:has-text("${GAME_OF[map]}")`).first().click();
    await wait(0.3);
    await p.locator('.gb-actions .btn.big').nth(1).click();
    await p.waitForSelector('.lobby');
    await p.evaluate(([m, th, o]) => { const s = window.__rubble.session; s.setSettings({ ...(s.lobby.settings.cup ? { cup: 1 } : {}), map: m, bots: m === 'cornisas' ? 5 : 1, ...(th ? { theme: th } : {}), organic: o }); }, [map, theme, ORGANIC]);
    await wait(0.3);
    // La semilla de la partida sale de Math.random al empezar: con SEED se fija solo para ese momento.
    if (SEED !== null) await p.evaluate((sd) => { window.__rnd = Math.random; Math.random = () => (sd + 0.5) / 1e9; }, SEED);
    await p.locator('text=Empezar partida').click();
    await p.waitForFunction(() => window.__rubble?.session?.sim?.phase === 'play', null, { timeout: 90000 });
    if (SEED !== null) await p.evaluate(() => { Math.random = window.__rnd; });
    const mesh = await p.evaluate(() => { const m = window.__rubble.match.view.terrain.mesh; return { mode: m.mode, seed: m.seed, hash: m.hash, count: m.count }; });
    console.log(map, JSON.stringify(mesh));
    await wait(0.8);
    const got = await p.evaluate(() => window.__rubble.session.sim.settings.map);
    if (got !== map) { errors.push(`[${map}] la partida arrancó en ${got}`); }
    // Cámara libre: se pisa justo antes de dibujar. Mira un punto desde el mismo ángulo que la cámara del juego.
    await p.evaluate(() => {
      const v = window.__rubble.match.view, r = v.renderer, orig = r.render.bind(r);
      r.render = (scene, cam) => {
        const o = window.__cam;
        if (o) { cam.position.set(o.x, o.d * 26, o.z + o.d * 16); cam.lookAt(o.x, 0, o.z); cam.updateMatrixWorld(); }
        // De lejos la niebla taparía el mapa entero.
        if (scene.fog) { scene.fog.near = o && o.d > 1 ? 400 : 44; scene.fog.far = o && o.d > 1 ? 900 : 100; }
        orig(scene, cam);
      };
      document.querySelector('.hud')?.style.setProperty('opacity', '0');
    });
    const spots = await p.evaluate(() => {
      const t = window.__rubble.session.sim.terrain, b = t.bounds();
      const cells = t.cells.map((c, i) => ({ c, i, ix: i % t.w, iz: Math.floor(i / t.w) }));
      const at = (ix, iz) => (ix < 0 || iz < 0 || ix >= t.w || iz >= t.h ? null : t.cells[iz * t.w + ix]);
      const isVoid = (c) => !c || c.type === 0;
      const ctr = (q) => t.cellCenter(q.ix, q.iz);
      const mid = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
      const near = (list) => list.map((q) => ({ q, d: Math.hypot(ctr(q).x - mid.x, ctr(q).z - mid.z) })).sort((a, b2) => a.d - b2.d);
      const solid = cells.filter((q) => !isVoid(q.c));
      // Una esquina de costa (vacío en dos lados contiguos) y un muro con piso al lado.
      const coast = near(solid.filter((q) => (isVoid(at(q.ix + 1, q.iz)) || isVoid(at(q.ix - 1, q.iz))) && (isVoid(at(q.ix, q.iz + 1)) || isVoid(at(q.ix, q.iz - 1)))));
      const walls = near(solid.filter((q) => q.c.type === 2 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => { const n = at(q.ix + dx, q.iz + dz); return n && n.type === 1; })));
      const pick = (l, k) => (l.length ? ctr(l[Math.min(l.length - 1, Math.floor(l.length * k))].q) : null);
      // Una rampa y una losa frágil, las más cercanas al centro del mapa.
      const ramps = near(cells.filter((q) => q.c.type === 3));
      const frags = near(cells.filter((q) => q.c.fragile >= 0));
      const rampSpot = ramps.length ? ctr(ramps[0].q) : null, fragSpot = frags.length ? ctr(frags[0].q) : null;
      return { mid, span: Math.max(b.maxX - b.minX, (b.maxZ - b.minZ) * 1.6), coast: pick(coast, 0.5), coast2: pick(coast, 0.05), wall: pick(walls, 0.1), ramp: rampSpot, frag: fragSpot, fragIndex: frags.length ? frags[0].q.c.fragile : -1 };
    });
    const shot = async (name, cam) => {
      await p.evaluate((c) => { window.__cam = c; }, cam);
      await wait(0.35);
      await p.screenshot({ path: `${OUT}/map-${tag}${map}-${name}.png` });
    };
    await shot('1-entero', { x: spots.mid.x, z: spots.mid.z, d: Math.max(1.2, spots.span / 34) });
    await shot('2-juego', null);
    if (spots.coast) await shot('3-costa', { x: spots.coast.x, z: spots.coast.z, d: 0.62 });
    if (spots.coast2) await shot('4-costa-centro', { x: spots.coast2.x, z: spots.coast2.z, d: 0.62 });
    if (spots.wall) await shot('5-muro', { x: spots.wall.x, z: spots.wall.z, d: 0.62 });
    if (spots.ramp) await shot('6-rampa', { x: spots.ramp.x, z: spots.ramp.z, d: 0.5 });
    if (spots.frag) await shot('7-fragil', { x: spots.frag.x, z: spots.frag.z, d: 0.5 });
    if (FALL && spots.frag) {
      // La losa cae (solo en la vista): pasada la caída queda el hueco.
      await p.evaluate((fi) => { window.__rubble.match.view.terrain.setTileState(fi, 4); }, spots.fragIndex);
      await wait(0.25);
      await shot('8-losa-cayendo', { x: spots.frag.x, z: spots.frag.z, d: 0.5 });
      await wait(2);
      await shot('9-losa-caida', { x: spots.frag.x, z: spots.frag.z, d: 0.5 });
    }
    console.log('ok', map);
  } catch (e) {
    errors.push(`[${map}] ${e.message.split('\n')[0]}`);
    console.log('✘', map, e.message.split('\n')[0]);
  }
  await ctx.close();
}
console.log(errors.length ? '\nERRORES:\n' + errors.join('\n') : '\nsin errores');
await browser.close();
server?.kill();
process.exit(errors.length ? 1 : 0);
