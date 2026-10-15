// Jugar con los dedos (táctil emulado por CDP, multitáctil de verdad): palanca, botones, apuntado, habilidades.
// Uso: npm run build && npm run test:touch [race|arena|horde|moba|all] [ancho] [alto]   (OUT=carpeta para capturas)
// El terreno es el orgánico; con SQUARE=1 es el cuadrado, para comparar. Al terminar cada juego dice cuántas veces la calidad automática bajó un escalón.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = process.env.OUT ?? 'tests/e2e/out';
mkdirSync(OUT, { recursive: true });
const PORT = 4181;
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE ?? `http://localhost:${PORT}/`;
// Con BASE se usa un servidor que ya está andando; si no, se levanta el build.
const server = process.env.BASE ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
if (server) await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('localhost')) res(); }); setTimeout(res, 5000); });
const which = process.argv[2] ?? 'all';
const W = +(process.argv[3] ?? 844), H = +(process.argv[4] ?? 390);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { if (!localStorage.getItem('rubble.prefs')) localStorage.setItem('rubble.prefs', JSON.stringify({ seenHelp: true, name: 'Yo', hero: 'canto', announcer: false })); } catch {} });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fonts.g') && !m.text().includes('ERR_CERT')) errors.push('console: ' + m.text()); });
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const NAMES = { race: 'Carrera', arena: 'Arena', horde: 'Horda', moba: 'Asedio' };

// ── dedos ──
const pts = new Map();
const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...pts].map(([id, q]) => ({ x: q.x, y: q.y, id, radiusX: 8, radiusY: 8, force: 1 })) });
const down = async (id, x, y) => { pts.set(id, { x, y }); await send(pts.size === 1 ? 'touchStart' : 'touchMove'); };
const move = async (id, x, y) => { pts.set(id, { x, y }); await send('touchMove'); };
// Levantar un dedo: touchEnd nombrando el que se va (los demás siguen apoyados).
const up = async (id) => { const q = pts.get(id); if (!q) return; pts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: q.x, y: q.y, id, radiusX: 8, radiusY: 8, force: 1 }] }); };
const slide = async (id, x, y, steps = 5) => { const a = pts.get(id); for (let i = 1; i <= steps; i++) { await move(id, a.x + ((x - a.x) * i) / steps, a.y + ((y - a.y) * i) / steps); await wait(0.016); } };
const center = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, shown: r.width > 0 && getComputedStyle(e).display !== 'none' }; }, sel);
const btn = (slot) => center(`.hud-bar [data-slot="${slot}"]`);
const tap = async (id, q, ms = 60) => { await down(id, q.x, q.y); await wait(ms / 1000); await up(id); };

const me = () => p.evaluate(() => {
  const a = window.__rubble, s = a.session.sim, c = s.chars.find((x) => x.pid === a.session.localPid);
  return { x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), f: +c.facing.toFixed(2), basic: +c.cds.basic.toFixed(2), push: +c.cds.push.toFixed(2), charging: c.charging, dashCd: +c.dashCd.toFixed(2),
    q: +c.cds.q.toFixed(1), e: +c.cds.e.toFixed(1), act: c.actives.join(','), rival: (() => { const o = s.chars.find((x) => x !== c && x.alive); return o ? +Math.atan2(o.pos.x - c.pos.x, o.pos.z - c.pos.z).toFixed(2) : 0; })(), armed: a.match.input.cast.armed, aim: !!a.match.view.aim, wp: c.weapon, ammo: c.wAmmo[c.weapon], c4: c.c4, recall: +c.recallT.toFixed(2), alive: c.alive, mx: c.input.mx, mz: c.input.mz, b: c.input.b };
});
const ok = (name, cond, extra = '') => { console.log(`${cond ? '✔' : '✘ FALLA'} ${name}${extra ? ' · ' + extra : ''}`); if (!cond) errors.push('FALLA: ' + name); };
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const shot = (n) => p.screenshot({ path: `${OUT}/touch-${n}.png` });

async function start(game, settings = {}) {
  await p.goto(BASE);
  await p.waitForSelector('.menu .logo');
  await p.locator(`.gamecard:has-text("${NAMES[game]}")`).first().tap();
  await wait(0.3);
  await p.locator('.gb-actions .btn.big').nth(1).tap();
  await p.waitForSelector('.lobby');
  await p.evaluate((st) => { const s = window.__rubble.session; s.setSettings({ ...(s.lobby.settings.cup ? { cup: 1 } : {}), ...st }); }, { ...settings, ...(process.env.SQUARE === '1' ? { organic: false } : {}) });
  await wait(0.3);
  await p.locator('text=Empezar partida').tap();
  await p.waitForFunction(() => window.__rubble?.session?.sim?.phase === 'play', null, { timeout: 90000 });
  // Cuenta las veces que la calidad automática baja un escalón (match.ts: `lowerQuality`).
  await p.evaluate(() => { const m = window.__rubble.match, o = m.lowerQuality.bind(m); window.__lowered = 0; m.lowerQuality = () => { window.__lowered++; return o(); }; });
  await wait(0.6);
}
// Deja al personaje quieto en un lugar despejado y a los demás lejos (o donde se pida).
const place = (fn) => p.evaluate(fn);

async function race() {
  console.log('\n── Carrera ──');
  await start('race', { map: 'pista', bots: 0 });
  ok('HUD en modo táctil', await p.evaluate(() => document.querySelector('.hud').classList.contains('touch')));
  ok('hay botón de saltar (salto flotante)', !!(await btn('jump')));
  const a = await me();
  // Palanca a la derecha.
  await down(1, 110, 300); await slide(1, 190, 300); await wait(0.8);
  const b = await me();
  ok('palanca → se mueve al este', b.x > a.x + 2, `x ${a.x} → ${b.x} (mx ${b.mx})`);
  ok('mira hacia donde camina', Math.abs(b.f - Math.PI / 2) < 0.2, `facing ${b.f}`);
  // Dash con otro dedo mientras camina (en el piso): en la Carrera tarda bastante más que en los demás juegos.
  await tap(2, await btn('dash'), 60); await wait(0.1);
  const d1 = await me();
  ok('dash (segundo dedo), tarda 5 s en volver', d1.dashCd > 4, `dashCd ${d1.dashCd}`);
  await wait(0.4);
  // Saltar con otro dedo mientras camina: en la Carrera es un salto bajo y flotante.
  const j = await btn('jump');
  await tap(2, j, 80); await wait(0.18);
  const c = await me();
  ok('saltar (segundo dedo, sin soltar la palanca)', c.y > a.y + 0.3 && c.x > b.x, `y ${c.y}`);
  const c2 = await me();
  ok('el salto se suelta al levantar ese dedo', (c2.b & 1) === 0, `b ${c2.b}`);
  await wait(0.6);
  // Hasta acá la palanca llegó al primer rotor de la pista, que empuja a quien pasa a su alcance y depende del momento: la prueba de frenado se hace de vuelta en la salida, lejos de él.
  await place(() => { const a = window.__rubble, s = a.session.sim, c = s.chars.find((x) => x.pid === a.session.localPid), sp = s.terrain.spawns.ffa[0]; c.pos = { x: sp.x, y: sp.y, z: sp.z }; c.vel = { x: 0, y: 0, z: 0 }; });
  await wait(0.5);
  await up(1); await wait(0.5);
  const s0 = await me(); await wait(0.3); const s1 = await me();
  ok('soltar la palanca → se frena', Math.abs(s1.x - s0.x) < 0.3 && s1.mx === 0, `x ${s0.x} → ${s1.x}`);
  // Agarrar (sin rival cerca no agarra a nadie, pero manda el bit y se puede apuntar arrastrando igual).
  const at = await btn('basic');
  await down(3, at.x, at.y); await wait(0.25);
  const g0 = await me();
  ok('agarrar (mantener)', (g0.b & 2) === 2, `b ${g0.b}`);
  // Arrastrar hacia arriba: mira al norte.
  await slide(3, at.x, at.y - 60); await wait(0.25);
  const g1 = await me();
  ok('arrastrar el agarre hacia arriba → mira al norte', Math.abs(Math.abs(g1.f) - Math.PI) < 0.2, `facing ${g1.f}`);
  await shot('race-1-agarre');
  await up(3); await wait(0.5);
  const g2 = await me();
  ok('soltar → deja de agarrar y sigue mirando ahí', (g2.b & 2) === 0 && Math.abs(Math.abs(g2.f) - Math.PI) < 0.2, `b ${g2.b} facing ${g2.f}`);
  // Empujón: mantener carga, soltar empuja; arrastrando a la izquierda.
  const pu = await btn('push');
  await down(3, pu.x, pu.y); await slide(3, pu.x - 60, pu.y); await wait(0.5);
  const p0 = await me();
  ok('empujón: carga mientras se mantiene', p0.charging && Math.abs(p0.f + Math.PI / 2) < 0.2, `facing ${p0.f}`);
  await up(3); await wait(0.15);
  const p1 = await me();
  ok('empujón: sale al soltar', !p1.charging && p1.push > 0, `cd ${p1.push}`);
  // Ítem de caja que se apunta (frasco): armar, arrastrar, soltar.
  await place(() => { const a = window.__rubble, c = a.session.sim.chars.find((x) => x.pid === a.session.localPid); c.actives = ['frasco', 'onda', null]; });
  await wait(0.3);
  const i1 = await btn('i1');
  await down(3, i1.x, i1.y); await wait(0.15);
  const it0 = await me();
  ok('ítem que se apunta: queda armado y se ve el área', it0.armed === 'i1' && it0.aim, `armed ${it0.armed}`);
  await slide(3, i1.x + 40, i1.y + 30); await wait(0.15);
  await shot('race-2-item');
  ok('aparece la ✕ de cancelar', (await center('.touch-cancel'))?.shown === true);
  await up(3); await wait(0.25);
  const it1 = await me();
  ok('soltar → lo lanza', it1.act.split(',')[0] === '' && it1.armed === null, `ítems ${it1.act}`);
  // Ítem que no se apunta (onda): sale al toque.
  await tap(3, await btn('i2'), 60); await wait(0.2);
  ok('ítem sin apuntar: sale al toque', (await me()).act.split(',')[1] === '', `ítems ${(await me()).act}`);
  // Cancelar: armar y soltar sobre la ✕.
  await place(() => { const a = window.__rubble, c = a.session.sim.chars.find((x) => x.pid === a.session.localPid); c.actives = ['frasco', null, null]; });
  await wait(0.3);
  await down(3, i1.x, i1.y); await wait(0.1);
  const cz = await center('.touch-cancel');
  await slide(3, cz.x, cz.y, 8); await wait(0.1);
  await up(3); await wait(0.25);
  const cc = await me();
  ok('soltar sobre la ✕ → no lo lanza', cc.act.split(',')[0] === 'frasco' && cc.armed === null, `ítems ${cc.act}`);
  // Pausa y tabla.
  await p.locator('.touch-top .tt-btn').nth(1).tap(); await wait(0.2);
  ok('botón de tabla', await p.evaluate(() => !document.querySelector('.board').classList.contains('hidden')));
  await shot('race-3-tabla');
  await p.locator('.touch-top .tt-btn').nth(1).tap(); await wait(0.1);
  await p.locator('.touch-top .tt-btn').nth(0).tap(); await wait(0.3);
  ok('botón de pausa abre el menú', await p.evaluate(() => !!document.querySelector('.modal-wrap')));
  await shot('race-4-pausa');
  const before = await me();
  await p.locator('.modal-buttons .btn.primary').tap(); await wait(0.4);
  const after = await me();
  ok('tocar un botón del menú no pega ni mueve', after.basic === 0 && after.x === before.x);
}

async function arena() {
  console.log('\n── Arena ──');
  await start('arena', { bots: 1, map: 'cantera' });
  // El bot, quieto a 4 m al este; yo en el centro del mapa.
  const setup = () => place(() => {
    const a = window.__rubble, s = a.session.sim, c = s.chars.find((x) => x.pid === a.session.localPid), o = s.chars.find((x) => x !== c);
    const sp = s.terrain.spawns.team[c.team][0];
    c.pos = { x: sp.x, y: sp.y, z: sp.z }; c.vel = { x: 0, y: 0, z: 0 };
    o.pos = { x: sp.x, y: sp.y, z: sp.z - 4 }; o.vel = { x: 0, y: 0, z: 0 }; o.stun = 8; o.invuln = 8;
    c.cds.q = c.cds.e = c.cds.f = 0;
  });
  await setup(); await wait(0.3);
  // Toque corto en el golpe: la ayuda apunta al rival (al norte).
  const at = await btn('basic');
  await down(3, at.x, at.y); await wait(0.2);
  const g = await me();
  ok('golpe sin arrastrar: la ayuda mira al rival', angDiff(g.f, g.rival) < 0.25, `facing ${g.f} · rival ${g.rival}`);
  await up(3); await wait(0.3);
  // Habilidad en línea (Canto Q = Embestida): arrastrar a la derecha y soltar.
  await setup(); await wait(0.2);
  const q = await btn('q');
  await down(3, q.x, q.y); await wait(0.12);
  const q0 = await me();
  ok('habilidad: armada con el dedo apoyado', q0.armed === 'q' && q0.aim);
  await slide(3, q.x + 55, q.y); await wait(0.15);
  await shot('arena-1-apuntando');
  const q1 = await me();
  ok('arrastrar apunta (mira al este)', Math.abs(q1.f - Math.PI / 2) < 0.25, `facing ${q1.f}`);
  await up(3); await wait(0.5);
  const q2 = await me();
  ok('soltar la lanza hacia ahí', q2.q > 0 && q2.x > q0.x + 2, `cd ${q2.q} · x ${q0.x} → ${q2.x}`);
  // Toque corto en una habilidad: sale hacia el rival.
  await setup(); await wait(0.3);
  const e = await btn('e');
  await tap(3, e, 70); await wait(0.4);
  const e1 = await me();
  ok('toque corto: sale hacia el rival', e1.e > 0 && angDiff(e1.f, e1.rival) < 0.3, `cd ${e1.e} · facing ${e1.f} · rival ${e1.rival}`);
  // Habilidad con área en el piso (Canto R = Avalancha, ulti): la distancia sigue al dedo.
  await place(() => { const a = window.__rubble, c = a.session.sim.chars.find((x) => x.pid === a.session.localPid); c.ult = 1; });
  await wait(0.3);
  const r = await btn('r');
  await down(3, r.x, r.y); await wait(0.1);
  await slide(3, r.x, r.y - 25); await wait(0.15);
  const near = await p.evaluate(() => { const m = window.__rubble.match, c = window.__rubble.session.sim.chars.find((x) => x.pid === window.__rubble.session.localPid); return Math.hypot(m.cursor.x - c.pos.x, m.cursor.z - c.pos.z); });
  await slide(3, r.x, r.y - 60); await wait(0.15);
  const far = await p.evaluate(() => { const m = window.__rubble.match, c = window.__rubble.session.sim.chars.find((x) => x.pid === window.__rubble.session.localPid); return Math.hypot(m.cursor.x - c.pos.x, m.cursor.z - c.pos.z); });
  await shot('arena-2-area');
  ok('área en el piso: más arrastre, más lejos', far > near + 2 && far <= 11.05, `${near.toFixed(1)} m → ${far.toFixed(1)} m`);
  const cz = await center('.touch-cancel');
  await slide(3, cz.x, cz.y, 8); await up(3); await wait(0.2);
  ok('cancelar la ulti la conserva', await p.evaluate(() => window.__rubble.session.sim.chars.find((x) => x.pid === window.__rubble.session.localPid).ult >= 1));
}

async function horde() {
  console.log('\n── Horda ──');
  await start('horde', { bots: 0 });
  await place(() => { const a = window.__rubble, c = a.session.sim.chars.find((x) => x.pid === a.session.localPid); c.wLv[1] = 1; c.wAmmo[1] = 60; c.weapon = 1; c.c4 = 2; });
  const at = await btn('basic');
  const a0 = await me();
  await down(3, at.x, at.y); await slide(3, at.x - 60, at.y); await wait(0.5);
  const a1 = await me();
  ok('disparo apuntado al oeste', Math.abs(a1.f + Math.PI / 2) < 0.2 && (a1.b & 2) === 2, `facing ${a1.f}`);
  ok('se ve la mira', (await center('.touch-reticle'))?.shown === true);
  await shot('horde-1-disparo');
  // Caminar al este mientras se dispara al oeste: dos dedos.
  await down(1, 110, 300); await slide(1, 190, 300); await wait(0.6);
  const a2 = await me();
  ok('camina para un lado y dispara para el otro', a2.x > a1.x + 1 && Math.abs(a2.f + Math.PI / 2) < 0.2, `x ${a1.x} → ${a2.x} facing ${a2.f}`);
  await up(1); await up(3); await wait(0.2);
  await tap(3, await btn('q'), 60); await wait(0.25);
  const w = await me();
  ok('cambiar de arma', w.wp !== a0.wp, `arma ${a0.wp} → ${w.wp}`);
  await tap(3, await btn('r'), 60); await wait(0.25);
  ok('plantar C4', (await me()).c4 === 1, `cargas ${(await me()).c4}`);
  // Taller: el botón ⚒️ lo abre, se mejora un arma con el dedo y se cierra con la ✕.
  await place(() => { const a = window.__rubble, c = a.session.sim.chars.find((x) => x.pid === a.session.localPid); c.scrap = 40; const b = a.session.sim.baseCenter(c.team); c.pos = { x: b.x, y: a.session.sim.groundY(b.x, b.z, 0), z: b.z }; });
  await wait(0.5);
  await tap(3, await btn('forge'), 70); await wait(0.4);
  ok('botón del taller abre el taller', await p.evaluate(() => !document.querySelector('.forge').classList.contains('hidden') && !!document.querySelector('.forge .wrow')));
  await shot('horde-3-taller');
  const up1 = p.locator('.forge .wrow .btn:not(.off)').first();
  if (await up1.count()) await up1.tap();
  await wait(0.4);
  ok('mejorar un arma con el dedo', await p.evaluate(() => { const a = window.__rubble, c = a.session.sim.chars.find((x) => x.pid === a.session.localPid); return c.wLv.some((l) => l >= 2) && c.scrap < 40; }));
  await p.locator('.forge .x').tap(); await wait(0.2);
  ok('la ✕ cierra el taller', await p.evaluate(() => document.querySelector('.forge').classList.contains('hidden')));
  await shot('horde-2');
}

async function moba() {
  console.log('\n── Asedio ──');
  await start('moba', { bots: 1 });
  await wait(0.5);
  await shot('moba-1');
  const f = await btn('forge');
  await tap(3, f, 70); await wait(0.3);
  ok('botón de forja abre la forja', await p.evaluate(() => !document.querySelector('.forge').classList.contains('hidden')));
  await shot('moba-2-forja');
  await p.locator('.forge .x').tap(); await wait(0.2);
  ok('la ✕ la cierra', await p.evaluate(() => document.querySelector('.forge').classList.contains('hidden')));
  // Alejarse de la base y volver con el botón.
  await down(1, 110, 300); await slide(1, 190, 300); await wait(1.2); await up(1); await wait(0.3);
  await tap(3, await btn('recall'), 80); await wait(0.5);
  ok('volver a la base: empieza a canalizar', (await me()).recall > 0, `recallT ${(await me()).recall}`);
  await shot('moba-3-recall');
}

const run = { race, arena, horde, moba };
for (const g of which === 'all' ? Object.keys(run) : which.split(',')) {
  try { await run[g](); const q = await p.evaluate(() => ({ n: window.__lowered, t: window.__rubble.match.view.terrain.mesh.mode, fps: window.__rubble.match.fps })); console.log(`  terreno ${q.t} · ${q.fps.toFixed(0)} fps · la calidad automática bajó ${q.n} veces`); } catch (e) { errors.push(`[${g}] ${e.message}`); console.log('✘ se cortó:', e.message.split('\n')[0]); for (const id of [...pts.keys()]) await up(id).catch(() => {}); }
}
console.log(errors.length ? '\nERRORES:\n' + [...new Set(errors)].slice(0, 20).join('\n') : '\nsin errores');
await browser.close();
server?.kill();
process.exit(errors.length ? 1 : 0);
