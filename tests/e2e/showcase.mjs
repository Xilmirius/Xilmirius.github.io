// Screenshots de cada héroe usando sus habilidades (herramienta de desarrollo visual).
// Uso: npm run build && node tests/e2e/showcase.mjs   (OUT=carpeta, HEROES=canto,prisma, RULES=brawl|full, THEME=neon)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = process.env.OUT ?? 'tests/e2e/out';
mkdirSync(OUT, { recursive: true });
const PORT = 4181;
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('localhost')) res(); }); setTimeout(res, 5000); });
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const hero of (process.env.HEROES ?? 'canto,prisma,gloop,remache').split(',')) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((h) => { localStorage.setItem('rubble.prefs', JSON.stringify({ shadows: true, seenHelp: true, name: 'Yo', hero: h })); }, hero);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${hero}] ${e.message}`));
  await p.goto(`http://localhost:${PORT}/`);
  console.log('  goto');
  await p.click('text=Práctica vs bots');
  await p.waitForSelector('.lobby');
  await p.click(`.herocard:has-text("${hero[0].toUpperCase() + hero.slice(1)}")`);
  if (process.env.THEME) await p.evaluate((t) => window.__rubble.session.setSettings({ theme: t }), process.env.THEME);
  const rules = process.env.RULES ?? 'brawl';
  await p.evaluate((r) => window.__rubble.session.setSettings({ rules: r }), rules);
  await p.click('text=Empezar partida');
  console.log('  start');
  await p.waitForFunction(() => window.__rubble?.session?.sim?.phase === 'play', null, { timeout: 30000 });
  console.log('  play');
  // Nivel máximo, materiales y enemigos cerca con distintas etapas de daño
  await p.evaluate(() => {
    const sim = window.__rubble.session.sim;
    const me = sim.charByPid.get(window.__rubble.session.localPid);
    me.xp = 5000; sim.addXp(me, 1);
    me.ult = 1;
    me.mats = { stone: 40, metal: 40, crystal: 40, goo: 40 };
    me.pos = { x: -4, y: 0, z: -2 };
    const foes = sim.chars.filter((c) => c.team !== me.team);
    foes.forEach((c, i) => { c.pos = { x: 1 + i * 2.5, y: 0, z: -2 + i }; c.heat = [60, 120, 170][i] ?? 20; c.stage = [1, 2, 3][i] ?? 0; c.bot = false; });
    // congelar la IA de los bots rivales para la foto
    for (const c of foes) window.__rubble.session.brains?.delete?.(c.id);
    sim.chars.filter((c) => c.team === me.team && c !== me).forEach((c) => { c.pos = { x: -8, y: 0, z: 4 }; });
  });
  const cv = await p.$('.game-canvas');
  const b = await cv.boundingBox();
  await p.mouse.move(b.x + b.width * 0.62, b.y + b.height * 0.47);
  await wait(400);
  await p.screenshot({ path: `${OUT}/hero-${hero}-0.png` });
  // Apuntar: la tecla arma la habilidad y muestra el área; el clic izquierdo la lanza.
  // Teclas por defecto: habilidades Q 2 3, ulti E.
  await p.keyboard.press('KeyE');
  await wait(250);
  await p.screenshot({ path: `${OUT}/hero-${hero}-aimR.png` });
  await p.mouse.click(b.x + b.width * 0.62, b.y + b.height * 0.47);
  await wait(700);
  await p.screenshot({ path: `${OUT}/hero-${hero}-KeyR-cast.png` });
  await p.evaluate(() => { const s = window.__rubble.session; const me = s.sim.charByPid.get(s.localPid); me.ult = 1; me.cds.r = 0; });
  await wait(300);
  // Tooltip de una habilidad
  const slot = await p.$('.hud-bar .slot.ult');
  if (slot) { await slot.hover(); await wait(400); await p.screenshot({ path: `${OUT}/hero-${hero}-tooltip.png` }); }
  await p.mouse.move(b.x + b.width * 0.62, b.y + b.height * 0.47);
  for (const [i, key] of ['KeyQ', 'Digit2', 'KeyE'].entries()) {
    await p.keyboard.press(key);
    await wait(120);
    await p.mouse.click(b.x + b.width * 0.62, b.y + b.height * 0.47);
    await wait(i === 2 ? 700 : 250);
    await p.screenshot({ path: `${OUT}/hero-${hero}-${key}.png` });
    await wait(500);
  }
  // Empujón cargado
  await p.mouse.down({ button: 'right' });
  await wait(700);
  await p.screenshot({ path: `${OUT}/hero-${hero}-charge.png` });
  await p.mouse.up({ button: 'right' });
  await wait(300);
  await p.screenshot({ path: `${OUT}/hero-${hero}-push.png` });
  // Golpes básicos: puños en arco
  for (let i = 0; i < 3; i++) {
    await p.mouse.down();
    await wait(90);
    if (i === 1) await p.screenshot({ path: `${OUT}/hero-${hero}-punch.png` });
    await p.mouse.up();
    await wait(200);
  }
  if (rules === 'full') {
    await p.keyboard.press('KeyC');
    await p.click('.forge .tab:has-text("Mutaciones")');
    await wait(300);
    await p.screenshot({ path: `${OUT}/hero-${hero}-mut.png` });
  }
  await ctx.close();
  console.log('✓', hero);
}
await browser.close();
server.kill();
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
process.exit(0);
