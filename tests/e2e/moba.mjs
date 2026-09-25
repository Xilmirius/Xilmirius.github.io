// E2E del Asedio (MOBA): práctica vs bots en 2v2 (1 línea) y 3v3 (2 líneas).
// Prueba el lanzamiento (tecla arma, clic izq lanza, clic der cancela), volver a la base (B), la forja
// bloqueada lejos de la base, el minimapa y que no haya errores. Uso: npm run build && node tests/e2e/moba.mjs
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = process.env.OUT ?? 'tests/e2e/out';
mkdirSync(OUT, { recursive: true });
const PORT = 4181;
const BASE = `http://localhost:${PORT}/`;
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('localhost')) res(); }); setTimeout(res, 5000); });

const errors = [];
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => { try { localStorage.setItem('rubble.prefs', JSON.stringify({ shadows: false, post: false, announcer: false, seenHelp: true, name: 'Tester' })); } catch {} });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (s) => console.log('▶', s);
function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}\n${e.stack ?? ''}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT') && !m.text().includes('fonts.g')) errors.push(`[${tag}] console: ${m.text()}`); });
}

async function match(bots, tag) {
  const p = await ctx.newPage();
  watch(p, tag);
  await p.goto(BASE);
  await p.waitForSelector('.menu .logo');
  await p.click('text=Práctica vs bots');
  await p.waitForSelector('.lobby');
  await p.selectOption('select:has(option[value="moba"])', 'moba');
  await wait(300);
  await p.selectOption('select:has(option[value="5"])', String(bots));
  await wait(300);
  await p.screenshot({ path: `${OUT}/moba-${tag}-lobby.png` });
  await p.click('.herocard:has-text("Canto")');
  await p.click('text=Empezar partida');
  await p.waitForSelector('.hud');
  await wait(4500);
  await p.screenshot({ path: `${OUT}/moba-${tag}-base.png` });
  step(`${tag}: en la base`);
  const cv = await p.$('.game-canvas');
  const box = await cv.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // Caminar hacia la línea: derecho en 1 línea; en 2 líneas, al pasillo y después hacia arriba.
  await p.mouse.move(cx + 300, cy);
  await p.keyboard.down('KeyD');
  await wait(tag === '3v3' ? 1300 : 4500);
  await p.keyboard.up('KeyD');
  if (tag === '3v3') {
    await p.mouse.move(cx, cy - 250);
    await p.keyboard.down('KeyW');
    await wait(2200);
    await p.keyboard.up('KeyW');
    await p.mouse.move(cx + 300, cy);
  }
  await p.screenshot({ path: `${OUT}/moba-${tag}-lane.png` });
  // Tecla arma → se ve el área; clic derecho cancela.
  await p.keyboard.press('KeyQ');
  await wait(250);
  const armed = await p.$eval('.slot.armed', () => true).catch(() => false);
  if (!armed) errors.push(`[${tag}] Q no quedó armada`);
  await p.screenshot({ path: `${OUT}/moba-${tag}-aim.png` });
  await p.mouse.click(cx + 200, cy, { button: 'right' });
  const gone = () => p.waitForSelector('.slot.armed', { state: 'detached', timeout: 3000 }).then(() => true, () => false);
  if (!(await gone())) errors.push(`[${tag}] el clic derecho no canceló`);
  // Tecla + clic izquierdo lanza.
  await p.keyboard.press('KeyQ');
  await wait(250);
  await p.mouse.click(cx + 200, cy);
  if (!(await gone())) errors.push(`[${tag}] el clic izquierdo no lanzó`);
  step(`${tag}: lanzamiento con clic ok`);
  // Forja lejos de la base: bloqueada, pero se puede mirar (cuadrícula por tipos con filtros).
  await p.keyboard.press('KeyC');
  await wait(400);
  const locked = await p.$('.forge-lock');
  if (!locked) errors.push(`[${tag}] la forja no avisa que es solo en la base`);
  const cards = await p.$$eval('.forge .icard', (els) => els.length);
  if (cards < 10) errors.push(`[${tag}] la forja no muestra la cuadrícula de ítems (${cards})`);
  await p.click('.forge .ifilters .chip:has-text("Movilidad")');
  await wait(300);
  const mob = await p.$$eval('.forge .icard', (els) => els.length);
  if (mob >= cards || mob === 0) errors.push(`[${tag}] el filtro de la forja no filtra (${mob}/${cards})`);
  await p.hover('.forge .icard');
  await wait(400);
  if (!(await p.$('.tooltip.on'))) errors.push(`[${tag}] los ítems de la forja no muestran tooltip`);
  await p.screenshot({ path: `${OUT}/moba-${tag}-forge.png` });
  await p.keyboard.press('Escape');
  // Pelear un rato en la línea
  await p.mouse.move(cx + 250, cy);
  await p.mouse.down();
  await wait(6000);
  await p.mouse.up();
  await p.screenshot({ path: `${OUT}/moba-${tag}-fight.png` });
  // Volver a la base (B, quieto)
  await p.keyboard.press('KeyB');
  await wait(1500);
  await p.screenshot({ path: `${OUT}/moba-${tag}-recall.png` });
  await wait(3500);
  await p.screenshot({ path: `${OUT}/moba-${tag}-back.png` });
  await p.keyboard.down('Tab');
  await wait(300);
  await p.screenshot({ path: `${OUT}/moba-${tag}-board.png` });
  await p.keyboard.up('Tab');
  // Clic derecho nunca abre el menú del navegador (ni sobre el HUD).
  const blocked = await p.evaluate(() => {
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    (document.querySelector('.hud-bar .slot') ?? document.body).dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  if (!blocked) errors.push(`[${tag}] el clic derecho abre el menú del navegador`);
  if (!(await p.$('.hud .fs-mini'))) errors.push(`[${tag}] falta el botón de pantalla completa`);
  if (tag === '2v2') {
    // Forzar el final (gana Azul): nadie se mueve ni dispara, unos festejan y otros lloran.
    await p.evaluate(() => { const sim = window.__rubble.session.sim; sim.mode.winner = 0; });
    await wait(1200);
    const frozen = await p.evaluate(() => {
      const sim = window.__rubble.session.sim;
      return { phase: sim.phase, projs: sim.projectiles.length };
    });
    if (frozen.phase !== 'end' || frozen.projs !== 0) errors.push(`[${tag}] fin de partida: ${JSON.stringify(frozen)}`);
    await p.screenshot({ path: `${OUT}/moba-${tag}-end.png` });
    await wait(2600);
    await p.screenshot({ path: `${OUT}/moba-${tag}-results.png` });
  }
  step(`${tag}: ok`);
  await p.close();
}

try {
  await match(3, '2v2');
  await match(5, '3v3');
} catch (e) {
  errors.push(`excepción: ${e.message}`);
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) { console.log('ERRORES:\n' + errors.join('\n')); process.exit(1); }
console.log('✔ Asedio OK');
