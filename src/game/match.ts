// Corre una partida en pantalla, sea como host (simula) o como cliente (predice e interpola).
import * as THREE from 'three';
import { audio } from '../audio/audio';
import { getPrefs, savePrefs } from '../config';
import { toast } from '../ui/dom';
import { CollisionWorld, type Obstacle } from '../core/collision';
import { BASE_RADIUS, DT, INTERP_TICKS } from '../core/constants';
import { DESTRUCT_DEF, SLOTS } from '../core/entities';
import { HEROES } from '../core/heroes';
import { ITEM_BY_ID } from '../core/items';
import { CORE, TOWER } from '../core/moba/defs';
import { ROUTE_MODS } from '../core/mutations';
import { rulesFor, unlockLevel, usesUltCharge, type Ruleset } from '../core/rules';
import { TEAM_COLORS } from '../core/constants';
import type { AbilitySlot, HeroId } from '../core/types';
import type { AimView } from '../render/indicator';
import type { TimedEvent } from '../core/events';
import { type InputFrame } from '../core/input';
import type { MatchInit, MatchResultInfo } from '../core/protocol';
import type { Command } from '../core/sim';
import { stepMove, newMoveOut, type MoveParams, type MoveState } from '../core/movement';
import { buildMeFrame, F_DEAD, F_GROUNDED, F_TUMBLE, FrameBuffer, type CharFrame, type MeFrame, type StructFrame, type WorldFrame } from '../core/snapshot';
import type { ClientSession } from '../net/client';
import type { HostSession } from '../net/host';
import { GameView } from '../render/gameView';
import { Hud } from '../ui/hud';
import type { CastCheck, CastKey } from './castControl';
import { LocalInput } from './localInput';
import { applyMatch } from './profile';
import { Ticker } from './ticker';

const STRUCT_DIM: Record<string, [number, number]> = {
  wall: [0.55, 1.8], stonewall: [0.55, 1.8], turret: [0.4, 1.2], tower: [TOWER.hw, TOWER.h], core: [CORE.hw, CORE.h],
};
const ITEM_KEYS: Record<string, number> = { i1: 0, i2: 1, i3: 2 };
/** Margen de enfriamiento con el que ya se puede armar (el host guarda el lanzamiento un instante). */
const ARM_EARLY = 0.3;

export interface MatchHooks {
  onEscape(): void;
}

export class MatchRunner {
  view: GameView;
  hud: Hud;
  input: LocalInput;
  private ticker: Ticker;
  private raf = 0;
  private lastT = performance.now();
  private frames: FrameBuffer;
  private events: TimedEvent[] = [];
  private seq = 0;
  private localId = -1;
  private me: MeFrame | null = null;
  private fps = 60;
  private cursor = new THREE.Vector3();
  // Predicción (solo cliente)
  private pending: InputFrame[] = [];
  private pred: MoveState | null = null;
  private predParams: MoveParams | null = null;
  private offset = new THREE.Vector3();
  private cw: CollisionWorld;
  private obsKey = '';
  private mo = newMoveOut();
  private clockTick = 0; // tick del servidor estimado (cliente)
  private clockSynced = false;
  private lastSnapTick = 0;
  private latestWorld: WorldFrame | null = null;
  private disposed = false;
  private boardHeld = false;
  // Tiempo visual: hitstop (congelar un instante) y recuperación.
  private lag = 0;
  private stopT = 0;
  private readonly rules: Ruleset;
  private heroId: HeroId | null = null;
  private teamColor = TEAM_COLORS[0];
  private heartT = 0;
  private lowFpsT = 0;
  /** Centro de tu base (Asedio: la forja solo funciona ahí). */
  private baseAt: { x: number; z: number } | null = null;

  constructor(
    container: HTMLElement,
    private session: HostSession | ClientSession,
    init: MatchInit,
    private hooks: MatchHooks,
  ) {
    const prefs = getPrefs();
    const me = init.roster.find((r) => r.pid === session.localPid);
    this.localId = me ? me.id : -1;
    this.rules = rulesFor(init.settings);
    this.heroId = me ? me.hero : null;
    this.teamColor = TEAM_COLORS[(me?.team ?? 0) % TEAM_COLORS.length];
    this.view = new GameView(container, init.settings.map, init.roster, session.localPid, { shadows: prefs.shadows, pixelRatio: prefs.hiDpi ? 2 : 1, post: prefs.post, theme: init.settings.theme, pickups: this.rules.pickups });
    this.cw = new CollisionWorld(this.view.terrain);
    this.hud = new Hud(container, init.roster, this.localId, this.rules, (c) => this.command(c), this.view.terrain);
    const spawns = this.view.terrain.spawns.team[me?.team ?? 0] ?? [];
    if (spawns.length) this.baseAt = { x: spawns.reduce((a, p) => a + p.x, 0) / spawns.length, z: spawns.reduce((a, p) => a + p.z, 0) / spawns.length };
    this.view.onImpact = (stop) => this.impact(stop);
    this.view.onLocalPickup = (sx, sy, mat) => this.hud.flyMat(sx, sy, mat);
    this.hud.onFlash = (c, a) => this.view.flash(c, a);
    audio.tension = 0;
    audio.announcer = prefs.announcer;
    this.input = new LocalInput(this.view.renderer.domElement, (k) => this.castCheck(k), (_k, why) => this.castDeny(why));
    this.input.cast.quick = prefs.quickCast;
    this.input.onKey = (code) => this.onKey(code);
    this.frames = session.isHost ? (session as HostSession).frames : new FrameBuffer();
    this.ticker = new Ticker(() => this.step());
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keyup', this.onKeyUp);
    audio.setMusic('match');
    audio.intensity = 0.3;
  }

  start() {
    this.ticker.start();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private onResize = () => this.view.resize();

  private onKey(code: string) {
    if (code === 'KeyC' && this.rules.crafting) this.hud.toggleForge();
    else if (code === 'Tab') { this.boardHeld = true; this.hud.showBoard(true); }
    else if (code === 'Escape') {
      if (this.input.cast.cancel()) return;
      if (this.hud.forgeOpen) this.hud.toggleForge(false);
      else this.hooks.onEscape();
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Tab' && this.boardHeld) { this.boardHeld = false; this.hud.showBoard(false); }
  };

  private command(c: Command) {
    this.session.command(c);
    audio.play('ui', 0.6);
  }

  // ───────────── tick fijo (60 Hz) ─────────────

  private localChar(): CharFrame | null {
    const w = this.latestWorld ?? this.frames.latest();
    return w?.chars.find((c) => c.id === this.localId) ?? null;
  }

  private buildInput(): InputFrame {
    const s = this.input.sample();
    // Terminó la partida: nadie se mueve ni ataca (se festeja).
    if ((this.latestWorld ?? this.frames.latest())?.phase === 'end') { s.mx = 0; s.mz = 0; s.b = 0; this.input.cast.cancel(); }
    const pos = this.pred ? this.pred.pos : this.localChar();
    const refY = pos ? pos.y : 0;
    this.cursor.copy(this.view.aimPoint(this.input.mouse.ndcX, this.input.mouse.ndcY, refY));
    return { seq: ++this.seq, mx: s.mx, mz: s.mz, ax: this.cursor.x, az: this.cursor.z, b: s.b };
  }

  private step() {
    if (this.disposed) return;
    if (this.session.isHost) {
      const host = this.session as HostSession;
      host.setLocalInput(this.buildInput());
      host.tick();
      if (host.sim && this.localId >= 0) {
        const ch = host.sim.charById.get(this.localId);
        if (ch) this.me = buildMeFrame(host.sim, ch);
      }
      const evs = host.localEvents;
      if (evs.length) { this.events.push(...evs); host.localEvents = []; }
      if (this.events.length > 3000) this.events.splice(0, this.events.length - 1500); // pestaña oculta: sin render
      return;
    }
    // Cliente
    this.clockTick += 1;
    if (this.localId < 0) return;
    const f = this.buildInput();
    this.pending.push(f);
    if (this.pending.length > 120) this.pending.shift();
    (this.session as ClientSession).sendInputs(this.pending.slice(-4));
    if (this.pred && this.predParams) {
      stepMove(this.pred, f, this.predParams, this.cw, DT, this.mo);
      if (this.mo.jumped) audio.play('jump', 0.8);
      if (this.mo.airJumped) audio.play('airjump', 0.8);
      if (this.mo.dashed) audio.play('whoosh', 0.8, 0, 1.4);
    }
  }

  // ───────────── red (cliente) ─────────────

  onSnapshot(w: WorldFrame, me: MeFrame | null, ack: number) {
    if (w.tick <= this.lastSnapTick) return;
    this.lastSnapTick = w.tick;
    this.frames.push(w);
    this.latestWorld = w;
    // Reloj: estimamos el tick del servidor "ahora".
    if (!this.clockSynced || Math.abs(this.clockTick - w.tick) > 30) { this.clockTick = w.tick; this.clockSynced = true; }
    else this.clockTick += (w.tick - this.clockTick) * 0.1;
    if (me) this.me = me;
    this.updateObstacles(w);
    this.reconcile(w, me, ack);
  }

  onEvents(l: TimedEvent[]) {
    this.events.push(...l);
    if (this.events.length > 3000) this.events.splice(0, this.events.length - 1500);
  }

  private updateObstacles(w: WorldFrame) {
    const key = w.dst + '|' + w.structs.map((s) => s.id).join(',');
    if (key === this.obsKey) return;
    this.obsKey = key;
    const t = this.view.terrain;
    if (w.tiles) t.applyTileString(w.tiles);
    const obs: Obstacle[] = [];
    t.destructs.forEach((d, i) => {
      if ((w.dst.charCodeAt(i) - 48) >= 3) return;
      const def = DESTRUCT_DEF[d.kind];
      const hs = def.size / 2;
      obs.push({ id: i, minX: d.x - hs, maxX: d.x + hs, minZ: d.z - hs, maxZ: d.z + hs, base: d.y, top: d.y + def.h, kind: 'd' });
    });
    for (const s of w.structs as StructFrame[]) {
      const [hw, hh] = STRUCT_DIM[s.k] ?? [0.5, 1.5];
      obs.push({ id: 100000 + s.id, minX: s.x - hw, maxX: s.x + hw, minZ: s.z - hw, maxZ: s.z + hw, base: s.y, top: s.y + hh, kind: 's' });
    }
    this.cw.obstacles = obs;
  }

  private reconcile(w: WorldFrame, me: MeFrame | null, ack: number) {
    const c = w.chars.find((x) => x.id === this.localId);
    if (!c || !me) { this.pred = null; return; }
    this.pending = this.pending.filter((f) => f.seq > ack);
    const s: MoveState = {
      pos: { x: c.x, y: c.y, z: c.z }, vel: { x: c.vx, y: me.vy, z: c.vz }, facing: c.f,
      grounded: !!me.gr, airJumps: me.aj, coyote: me.co, prevB: me.pb, tumble: me.tb, hitstun: me.hs, stun: me.sn, hitSlide: me.hsl,
      dashT: me.dt, dashCd: me.dcd, dashX: me.dx, dashZ: me.dz, airDashes: me.ad,
    };
    const p: MoveParams = { speed: me.spd, lock: !!me.lock, airControl: me.air, restitution: me.rest, maxAirJumps: me.maj, jumpMul: me.jm, noGravity: !!me.ng, dash: !!me.dsh };
    this.predParams = p;
    if ((c.fl & F_DEAD) || me.direct) {
      this.pred = s;
      this.offset.set(0, 0, 0);
      return;
    }
    for (const f of this.pending) stepMove(s, f, p, this.cw, DT, this.mo);
    if (this.pred) {
      const ex = this.pred.pos.x - s.pos.x, ey = this.pred.pos.y - s.pos.y, ez = this.pred.pos.z - s.pos.z;
      if (Math.hypot(ex, ey, ez) > 4) this.offset.set(0, 0, 0);
      else this.offset.add(new THREE.Vector3(ex, ey, ez));
    }
    this.pred = s;
  }

  /** Congela el dibujo del mundo un instante (hitstop). Es solo visual: la simulación sigue. */
  impact(hitstop: number) {
    this.stopT = Math.max(this.stopT, Math.min(0.1, hitstop));
  }

  /** ¿Se puede lanzar/armar esta habilidad o ítem ahora? 'aim' (se apunta), 'now' (sale al toque) o el motivo. */
  private castCheck(k: CastKey): CastCheck {
    const me = this.me, local = this.localChar();
    if (!this.heroId || !me || !local) return 'Todavía no';
    if (local.fl & F_DEAD) return 'Estás fuera de juego';
    const n = ITEM_KEYS[k];
    if (n === undefined) {
      const slot = k as AbilitySlot;
      const a = HEROES[this.heroId].abilities[slot];
      if (local.lv < unlockLevel(this.rules, a)) return `${a.name}: se desbloquea en nivel ${unlockLevel(this.rules, a)}`;
      if (usesUltCharge(this.rules, slot)) {
        if (me.ult < 1) return `${a.name}: la ulti se carga pegando (${Math.floor(me.ult * 100)}%)`;
      } else {
        const cd = me.cd[SLOTS.indexOf(slot)];
        if (cd > ARM_EARLY) return `${a.name}: lista en ${Math.ceil(cd)} s`;
      }
      return a.shape.k === 'self' ? 'now' : 'aim';
    }
    if (!this.rules.crafting) return 'Estas reglas no tienen ítems';
    const id = me.act[n];
    const it = id ? ITEM_BY_ID[id] : null;
    if (!it) return `Espacio ${n + 1} vacío: forjá un ítem activo (C)`;
    const cd = me.cd[SLOTS.indexOf(k as 'i1' | 'i2' | 'i3')];
    if (cd > ARM_EARLY) return `${it.name}: listo en ${Math.ceil(cd)} s`;
    return !it.shape || it.shape.k === 'self' ? 'now' : 'aim';
  }

  private castDeny(why: string) {
    this.hud.localDeny(why);
    audio.play('deny', 0.6);
  }

  /** Qué dibujar mientras hay una habilidad o ítem armado (área, línea, cono...). */
  private computeAim(local: CharFrame | null): AimView | null {
    const me = this.me;
    this.input.cast.revalidate();
    const k = this.input.armed();
    if (!k || !local || !me || !this.heroId || (local.fl & F_DEAD)) return null;
    const n = ITEM_KEYS[k];
    if (n === undefined) {
      const slot = k as AbilitySlot;
      const a = HEROES[this.heroId].abilities[slot];
      const ready = usesUltCharge(this.rules, slot) ? me.ult >= 1 : me.cd[SLOTS.indexOf(slot)] <= 0;
      const mut = me.mut[slot];
      return { shape: a.shape, range: a.range, area: mut ? ROUTE_MODS[mut].area : 1, ready, color: this.teamColor };
    }
    const it = me.act[n] ? ITEM_BY_ID[me.act[n]!] : null;
    if (!it?.shape) return null;
    return { shape: it.shape, range: it.range ?? 0, area: 1, ready: me.cd[SLOTS.indexOf(k as 'i1' | 'i2' | 'i3')] <= 0, color: this.teamColor };
  }

  // ───────────── render (rAF) ─────────────

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.fps = this.fps * 0.95 + (1 / Math.max(0.001, dt)) * 0.05;
    // Calidad automática: si el postproceso ahoga la PC, se apaga (se puede reactivar en Ajustes).
    if (this.view.hasPost) {
      this.lowFpsT = this.fps < 28 ? this.lowFpsT + dt : Math.max(0, this.lowFpsT - dt);
      if (this.lowFpsT > 4) {
        this.view.disablePost();
        savePrefs({ post: false });
        toast('Bajamos los brillos para que vaya fluido (se reactivan en Ajustes)', 'info', 5000);
      }
    }

    // Velocidad del "tiempo visual": 0 en hitstop, >1 un instante mientras recupera el atraso.
    let rate = 1;
    if (this.stopT > 0) { rate = 0; this.stopT -= dt; }
    else if (this.lag > 0) rate = 1.5;
    this.lag = Math.min(40, Math.max(0, this.lag + dt * 60 * (1 - rate)));
    const worldDt = dt * Math.min(1, rate);

    let renderTick: number;
    if (this.session.isHost) {
      const host = this.session as HostSession;
      renderTick = (host.sim?.tick ?? 0) - 1 + this.ticker.alpha - this.lag;
    } else {
      renderTick = this.clockTick + this.ticker.alpha - INTERP_TICKS - this.lag;
    }
    const w = this.frames.sample(renderTick);
    if (!w) return;

    // Eventos que ya "pasaron" en el tiempo que estamos dibujando.
    if (this.events.length) {
      const due = this.events.filter((e) => e.t <= renderTick + 1);
      if (due.length) {
        this.events = this.events.filter((e) => e.t > renderTick + 1);
        const listener = this.view.listener();
        for (const e of due) {
          if ((e.k === 'jump' || e.k === 'dash') && e.id === this.localId && !this.session.isHost) {
            this.view.handleEvent(e);
            continue; // el sonido ya lo hizo la predicción
          }
          this.view.handleEvent(e);
          this.hud.onEvent(e);
          audio.onEvent(e, this.view.eventPos(e), listener, this.localId, (id) => id < 0 ? this.view.terrain.destructs[-1 - id]?.kind ?? null : this.view.charFamily(id));
        }
      }
    }

    // Personaje local: predicho (cliente) o el del frame (host).
    let local: CharFrame | null = null;
    const latest = this.latestWorld ?? this.frames.latest();
    const lc = latest?.chars.find((c) => c.id === this.localId) ?? null;
    if (lc) {
      if (!this.session.isHost && this.pred && !(lc.fl & F_DEAD)) {
        this.offset.multiplyScalar(Math.exp(-dt * 10));
        local = {
          ...lc,
          x: this.pred.pos.x + this.offset.x, y: this.pred.pos.y + this.offset.y, z: this.pred.pos.z + this.offset.z,
          f: this.pred.facing, vx: this.pred.vel.x, vy: this.pred.vel.y, vz: this.pred.vel.z,
          fl: (lc.fl & ~F_GROUNDED) | (this.pred.grounded ? F_GROUNDED : 0),
        };
      } else {
        local = w.chars.find((c) => c.id === this.localId) ?? lc;
      }
    }

    // Espectador: seguir al primero vivo.
    let camChar = local;
    if (!camChar) camChar = w.chars.find((c) => !(c.fl & F_DEAD)) ?? null;

    audio.intensity = w.phase === 'play' ? 1 : 0.3;
    // Viento mientras volás y latido cuando estás destrozado.
    const lf = local && !(local.fl & F_DEAD) ? local : null;
    audio.setWind(lf && (lf.fl & F_TUMBLE) ? Math.min(1, Math.hypot(lf.vx, lf.vz) / 25) : 0);
    if (lf && lf.st >= 3) {
      this.heartT -= dt;
      if (this.heartT <= 0) { audio.play('heart', 0.9); this.heartT = 0.75; }
    } else this.heartT = 0;
    if (this.rules.forgeAtBase && this.baseAt) this.hud.atBase = !!local && Math.hypot(local.x - this.baseAt.x, local.z - this.baseAt.z) <= BASE_RADIUS;
    this.view.aim = this.computeAim(local);
    this.hud.setArmed(this.input.armed());
    this.view.renderer.domElement.classList.toggle('aiming', !!this.view.aim);
    this.view.render(w, worldDt, camChar, this.cursor, dt);
    const ping = this.session.isHost ? 0 : (this.session as ClientSession).rtt;
    this.hud.update(w, local, this.me, dt, { ping, fps: this.fps, showFps: getPrefs().showFps, kind: this.session.isHost ? 'host' : 'client' });
  }

  showResults(res: MatchResultInfo, onBack: () => void, onLeave: () => void) {
    this.hud.toggleForge(false);
    const meRes = res.players.find((p) => p.id === this.localId);
    const reward = applyMatch(res, meRes, this.hud.live);
    this.hud.showResults(res, this.session.isHost, onBack, onLeave, reward);
    audio.setWind(0);
    if (meRes) {
      const won = !res.draw && res.winner === meRes.team;
      audio.play(won ? 'win' : 'lose', 1);
      if (won) { audio.play('crowd', 1); audio.say('¡Victoria!', true); } else audio.say(res.draw ? 'Empate' : 'Derrota', true);
    }
  }

  setInputEnabled(on: boolean) { this.input.enabled = on; }

  dispose() {
    this.disposed = true;
    audio.setWind(0);
    audio.tension = 0;
    cancelAnimationFrame(this.raf);
    this.ticker.stop();
    this.input.dispose();
    this.hud.dispose();
    this.view.dispose();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
