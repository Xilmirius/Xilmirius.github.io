// E2E: levanta el build, abre Chromium y prueba menú, práctica vs bots y multijugador P2P (2 pestañas).
// Uso: npm run build && npm run test:e2e   (OUT=carpeta para screenshots)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = process.env.OUT ?? 'tests/e2e/out';
mkdirSync(OUT, { recursive: true });
const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('localhost')) res(); }); setTimeout(res, 5000); });

const errors = [];
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
// Sin sombras para que el render por software del sandbox no ahogue la simulación.
await ctx.addInitScript(() => { try { localStorage.setItem('rubble.prefs', JSON.stringify({ shadows: false, post: false, announcer: false, seenHelp: true, name: 'Tester' })); } catch {} });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}\n${e.stack ?? ''}`));
  page.on('console', (m) => {
    // Google Fonts puede fallar en entornos con proxy: no es un error del juego.
    if (m.type() === 'error' && !m.text().includes('ERR_CERT') && !m.text().includes('fonts.g')) errors.push(`[${tag}] console: ${m.text()}`);
  });
}
const step = (s) => console.log('▶', s);
async function closeHelp(page) {
  try {
    await page.waitForSelector('.modal-wrap', { timeout: 8000 });
    await page.click('.modal-buttons .btn');
  } catch { /* ya estaba cerrado */ }
}

try {
  // ── Práctica vs bots ──
  const p = await ctx.newPage();
  watch(p, 'solo');
  await p.goto(BASE);
  await p.waitForSelector('.menu .logo');
  await closeHelp(p);
  await wait(500);
  await p.screenshot({ path: `${OUT}/01-menu.png` });
  step('menú ok');
  await p.click('text=Práctica vs bots');
  await p.waitForSelector('.lobby');
  await wait(800);
  await p.screenshot({ path: `${OUT}/02-lobby.png` });
  step('lobby ok');
  await p.click('.herocard:has-text("Prisma")');
  await wait(300);
  await p.click('text=Empezar partida');
  await p.waitForSelector('.hud');
  await wait(1500);
  await p.screenshot({ path: `${OUT}/03-countdown.png` });
  await wait(2500);
  // Jugar un poco: moverse, disparar, empujar, saltar
  const cv = await p.$('.game-canvas');
  const box = await cv.boundingBox();
  await p.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await p.keyboard.down('KeyD');
  await p.mouse.down();
  await wait(900);
  await p.mouse.up();
  await p.keyboard.up('KeyD');
  await p.keyboard.press('Space');
  await p.keyboard.press('KeyQ');
  await wait(1200);
  await p.screenshot({ path: `${OUT}/04-match.png` });
  await p.keyboard.press('KeyC');
  await wait(400);
  await p.screenshot({ path: `${OUT}/05-forge.png` });
  await p.keyboard.press('KeyC');
  await p.keyboard.down('Tab');
  await wait(300);
  await p.screenshot({ path: `${OUT}/06-board.png` });
  await p.keyboard.up('Tab');
  // Dejar que los bots peleen un rato
  await wait(12000);
  await p.screenshot({ path: `${OUT}/07-later.png` });
  const hudTxt = await p.$eval('.hud-top', (e) => e.textContent);
  step('hud: ' + hudTxt);
  await p.close();

  // ── Multijugador: host + cliente en 2 pestañas (signaling local + WebRTC real) ──
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  watch(a, 'host');
  watch(b, 'client');
  await a.goto(BASE);
  await b.goto(BASE);
  await a.waitForSelector('.menu .logo');
  await b.waitForSelector('.menu .logo');
  await closeHelp(a);
  await closeHelp(b);
  await a.fill('.menu .input:not(.code)', 'Host');
  await b.fill('.menu .input:not(.code)', 'Amigo');
  await a.click('text=Crear sala');
  await a.waitForSelector('.codebox b');
  const code = (await a.$eval('.codebox b', (e) => e.textContent)).trim();
  step('sala creada: ' + code);
  // La sala tiene que aparecer en "Salas abiertas" del otro
  await b.waitForSelector(`.room:has-text("${code}")`, { timeout: 8000 });
  step('la sala aparece en la lista de salas abiertas');
  await b.click(`.room:has-text("${code}")`);
  await b.waitForSelector('.lobby', { timeout: 25000 });
  await wait(800);
  const hostSees = await a.$$eval('.pl', (els) => els.map((e) => e.textContent));
  step('host ve: ' + JSON.stringify(hostSees));
  await b.click('.herocard:has-text("Gloop")');
  await wait(500);
  await a.screenshot({ path: `${OUT}/10-mp-lobby-host.png` });
  await b.screenshot({ path: `${OUT}/11-mp-lobby-client.png` });
  // Cliente al otro equipo (si está en el mismo) y empezar
  const bTeam = await b.$$('button:has-text("Cambiarme acá")');
  if (!hostSees.some((t) => t.includes('Amigo')) ) throw new Error('El host no ve al cliente');
  await a.click('text=Empezar partida');
  await b.waitForSelector('.hud', { timeout: 10000 });
  const pidB = await b.evaluate(() => sessionStorage.getItem('rubble.tabpid'));
  // Esperar a que termine la cuenta regresiva en el host
  await a.waitForFunction(() => window.__rubble?.session?.sim?.phase === 'play', null, { timeout: 30000 });
  const before = await a.evaluate((pid) => { const c = window.__rubble.session.sim.charByPid.get(pid); return { x: c.pos.x, z: c.pos.z }; }, pidB);
  // El cliente se mueve
  await b.keyboard.down('KeyW');
  await wait(1500);
  await b.keyboard.up('KeyW');
  await wait(500);
  const after = await a.evaluate((pid) => { const c = window.__rubble.session.sim.charByPid.get(pid); return { x: c.pos.x, z: c.pos.z }; }, pidB);
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  step(`el input del cliente movió su personaje en el host: ${moved.toFixed(2)} m`);
  if (moved < 1) throw new Error('El input del cliente no llega al host');
  await b.mouse.move(700, 300);
  await b.mouse.down();
  await wait(600);
  await b.mouse.up();
  await wait(1500);
  await a.screenshot({ path: `${OUT}/12-mp-host.png` });
  await b.screenshot({ path: `${OUT}/13-mp-client.png` });
  const clientNet = await b.$eval('.hud-net', (e) => e.textContent);
  step('cliente red: ' + clientNet);
  const clientHasChars = await b.$$eval('.nametag', (els) => els.filter((e) => e.style.display !== 'none').length);
  step('cliente ve personajes: ' + clientHasChars);
  if (clientHasChars < 2) throw new Error('El cliente no está recibiendo snapshots');
  void bTeam;

  // Forzar el final: al cliente le queda 1 vida y se cae del mapa.
  await a.evaluate((pid) => { const c = window.__rubble.session.sim.charByPid.get(pid); c.lives = 1; c.pos.y = -20; }, pidB);
  await a.waitForSelector('.results', { timeout: 20000 });
  await b.waitForSelector('.results', { timeout: 20000 });
  const resHost = await a.$eval('.res-title', (e) => e.textContent);
  const resClient = await b.$eval('.res-title', (e) => e.textContent);
  step(`resultados host="${resHost}" cliente="${resClient}"`);
  await a.screenshot({ path: `${OUT}/14-results-host.png` });
  await b.screenshot({ path: `${OUT}/15-results-client.png` });
  await a.click('text=Volver al lobby');
  await a.waitForSelector('.lobby', { timeout: 10000 });
  await b.waitForSelector('.lobby', { timeout: 10000 });
  step('ambos volvieron al lobby');
  // Chat en el lobby
  await b.fill('.chat-input', 'gg');
  await b.press('.chat-input', 'Enter');
  await a.waitForSelector('.chat-log:has-text("gg")', { timeout: 5000 });
  step('chat ok');
} catch (e) {
  errors.push('FALLO: ' + (e?.stack ?? e));
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) {
  console.log('\n✗ Errores:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\n✓ E2E OK — screenshots en ' + OUT);
process.exit(0);
