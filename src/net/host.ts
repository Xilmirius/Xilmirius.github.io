// Sesión de host: el navegador que crea la sala ES el servidor del juego (host autoritativo).
// Maneja el lobby, las conexiones WebRTC con cada cliente, la simulación y el envío de snapshots.
import { getConfig } from '../config';
import { BotBrain, BOT_NAMES } from '../core/bots';
import { DT, PROTOCOL_VERSION, SNAPSHOT_EVERY } from '../core/constants';
import type { TimedEvent } from '../core/events';
import { decodeInput, emptyInput, type InputFrame } from '../core/input';
import type { ClientMsg, LobbyState, MatchInit, MatchResultInfo, RosterInfo } from '../core/protocol';
import { Simulation } from '../core/sim';
import { buildMeFrame, buildWorldFrame, encodeWorld, FrameBuffer } from '../core/snapshot';
import { validHat } from '../core/cosmetics';
import { mobaMapFor } from '../core/maps';
import { DEFAULT_SETTINGS, HERO_IDS, type HeroId, type MatchSettings, type RosterEntry } from '../core/types';
import { db } from '../db/persistence';
import { PeerLink } from './peer';
import { createDirectory, createSignaling, type Directory, type SignalingChannel, type SignalMsg } from './signaling';

export const MAX_PLAYERS = 6;

export interface SessionCallbacks {
  onLobby(l: LobbyState): void;
  onStart(init: MatchInit): void;
  onEnd(res: MatchResultInfo): void;
  onBack(): void;
  onChat(from: string, text: string): void;
  onToast(msg: string): void;
  onClosed(reason: string): void;
}

interface Remote {
  pid: string;
  name: string;
  link: PeerLink;
  queue: InputFrame[];
  lastSeq: number;
  last: InputFrame;
  ack: number;
  ping: number;
  welcomed: boolean;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

function uuid4() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class HostSession {
  readonly isHost = true;
  code: string;
  lobby: LobbyState;
  sim: Simulation | null = null;
  init: MatchInit | null = null;
  frames = new FrameBuffer();
  localEvents: TimedEvent[] = [];
  lastResult: MatchResultInfo | null = null;
  private remotes = new Map<string, Remote>();
  private sig: SignalingChannel | null = null;
  private dir: Directory | null = null;
  private brains = new Map<number, BotBrain>();
  private localInput: InputFrame = emptyInput();
  private endT = 0;
  private resultSent = false;
  private gameId: string | null = null;
  private announceT = 0;
  private closed = false;

  constructor(private me: { pid: string; name: string; hero: HeroId; hat: string }, readonly offline: boolean, private cb: SessionCallbacks) {
    this.code = offline ? 'LOCAL' : makeCode();
    this.lobby = {
      code: this.code,
      players: [{ pid: me.pid, name: me.name, hero: me.hero, team: 0, bot: false, connected: true, ping: 0, host: true, hat: validHat(me.hat) }],
      settings: { ...DEFAULT_SETTINGS, bots: offline ? 3 : 0 },
      inMatch: false,
    };
  }

  get localPid() { return this.me.pid; }

  async open() {
    if (this.offline) { this.emitLobby(); return; }
    this.sig = createSignaling();
    await this.sig.join(this.code, { pid: this.me.pid, role: 'host', name: this.me.name }, (m) => this.onSignal(m), () => {});
    this.dir = createDirectory();
    this.announce();
    this.emitLobby();
    void db.createGame(this.code, this.me.pid, this.me.name).then((id) => { this.gameId = id; });
  }

  get signalingKind() { return this.sig?.kind ?? 'offline'; }

  private announce() {
    if (!this.dir) return;
    const s = this.lobby.settings;
    this.dir.announce({
      code: this.code, host: this.me.name, players: this.lobby.players.length, max: MAX_PLAYERS,
      mode: s.mode, map: s.map, inMatch: this.lobby.inMatch,
    });
  }

  // ───────────── signaling / conexiones ─────────────

  private onSignal(m: SignalMsg) {
    if (this.closed) return;
    if (m.kind === 'join') {
      const known = this.lobby.players.find((p) => p.pid === m.from);
      const humans = this.lobby.players.filter((p) => !p.bot).length;
      if (!known && humans >= MAX_PLAYERS && !this.lobby.inMatch) {
        this.sig?.send({ from: this.me.pid, to: m.from, kind: 'reject', data: 'La sala está llena' });
        return;
      }
      const old = this.remotes.get(m.from);
      if (old && !old.link.closed) {
        if (old.link.opened) return; // ya conectado
        old.link.onClose = () => {};
        old.link.close('replaced');
      }
      const link = new PeerLink(m.from, this.me.pid, this.sig!, getConfig().iceServers, true);
      const r: Remote = { pid: m.from, name: String(m.data?.name ?? 'Jugador').slice(0, 18), link, queue: [], lastSeq: 0, last: emptyInput(), ack: 0, ping: 0, welcomed: false };
      this.remotes.set(m.from, r);
      link.onMessage = (d, fast) => this.onRemoteMessage(r, d, fast);
      link.onClose = (reason) => this.onRemoteClose(r, reason);
      void link.start();
    } else {
      const r = this.remotes.get(m.from);
      if (r) void r.link.handleSignal(m);
    }
  }

  private onRemoteMessage(r: Remote, msg: ClientMsg, _fast: boolean) {
    switch (msg.t) {
      case 'hello': {
        if (msg.v !== PROTOCOL_VERSION) {
          r.link.send({ t: 'kick', reason: 'Versión distinta del juego: recargá la página (Ctrl+F5).' });
          setTimeout(() => r.link.close('version'), 300);
          return;
        }
        r.name = String(msg.name || r.name).slice(0, 18);
        r.welcomed = true;
        let p = this.lobby.players.find((x) => x.pid === r.pid);
        if (!p) {
          const t0 = this.lobby.players.filter((x) => x.team === 0).length;
          const t1 = this.lobby.players.filter((x) => x.team === 1).length;
          p = { pid: r.pid, name: r.name, hero: HERO_IDS[this.lobby.players.length % HERO_IDS.length], team: t0 <= t1 ? 0 : 1, bot: false, connected: true, ping: 0, host: false, hat: 'none' };
          this.lobby.players.push(p);
          this.cb.onToast(`${r.name} entró a la sala`);
        } else {
          p.connected = true;
          p.name = r.name;
        }
        r.link.send({ t: 'welcome', you: r.pid, lobby: this.lobby, v: PROTOCOL_VERSION });
        if (this.lobby.inMatch && this.init && this.sim) {
          const ch = this.sim.charByPid.get(r.pid);
          if (ch) {
            ch.disconnected = false;
            this.brains.delete(ch.id);
            r.lastSeq = 0;
            r.queue = [];
            this.cb.onToast(`${r.name} volvió a la partida`);
          }
          r.link.send({ t: 'start', init: { ...this.init, tick: this.sim.tick } });
        }
        this.emitLobby();
        break;
      }
      case 'in': {
        for (const a of msg.f) {
          const f = decodeInput(a);
          if (f.seq > r.lastSeq) {
            r.queue.push(f);
            r.lastSeq = f.seq;
          }
        }
        break;
      }
      case 'pick': {
        const p = this.lobby.players.find((x) => x.pid === r.pid);
        if (!p || this.lobby.inMatch) return;
        if (msg.hero && HERO_IDS.includes(msg.hero)) p.hero = msg.hero;
        if (msg.team !== undefined && (msg.team === 0 || msg.team === 1)) p.team = msg.team;
        if (msg.hat !== undefined) p.hat = validHat(msg.hat);
        this.emitLobby();
        break;
      }
      case 'cmd':
        this.sim?.queueCommand(r.pid, msg.cmd);
        break;
      case 'chat': {
        const text = String(msg.text).slice(0, 140);
        this.broadcast({ t: 'chat', from: r.name, text });
        this.cb.onChat(r.name, text);
        break;
      }
      case 'ping':
        r.link.send({ t: 'pong', ts: msg.ts });
        if (typeof msg.rtt === 'number') r.ping = Math.round(msg.rtt);
        break;
    }
  }

  private onRemoteClose(r: Remote, reason: string) {
    if (this.remotes.get(r.pid) !== r) return;
    this.remotes.delete(r.pid);
    const p = this.lobby.players.find((x) => x.pid === r.pid);
    if (!p) return;
    if (this.lobby.inMatch && this.sim) {
      p.connected = false;
      const ch = this.sim.charByPid.get(r.pid);
      if (ch) {
        ch.disconnected = true;
        this.brains.set(ch.id, new BotBrain(2, ch.id * 17));
      }
      this.cb.onToast(`${p.name} se desconectó (un bot lo reemplaza)`);
    } else {
      this.lobby.players = this.lobby.players.filter((x) => x.pid !== r.pid);
      this.cb.onToast(`${p.name} salió de la sala`);
    }
    console.info('[host] cliente cerrado', r.pid, reason);
    this.emitLobby();
  }

  private broadcast(msg: unknown) {
    const s = JSON.stringify(msg);
    for (const r of this.remotes.values()) if (r.welcomed) r.link.sendRaw(s, false);
  }

  private emitLobby() {
    if (!this.lobby.inMatch) {
      const humans = this.lobby.players.filter((p) => p.connected).length;
      this.lobby.settings.bots = Math.max(0, Math.min(MAX_PLAYERS - humans, this.lobby.settings.bots));
    }
    for (const p of this.lobby.players) {
      const r = this.remotes.get(p.pid);
      if (r) p.ping = r.ping;
    }
    this.broadcast({ t: 'lobby', lobby: this.lobby });
    this.cb.onLobby(this.lobby);
    this.announce();
  }

  // ───────────── acciones del lobby (jugador local = host) ─────────────

  pick(hero?: HeroId, team?: number, hat?: string) {
    const p = this.lobby.players.find((x) => x.pid === this.me.pid)!;
    if (hero) { p.hero = hero; this.me.hero = hero; }
    if (hat !== undefined) p.hat = validHat(hat);
    if (team === 0 || team === 1) p.team = team;
    this.emitLobby();
  }

  setSettings(s: Partial<MatchSettings>) {
    Object.assign(this.lobby.settings, s);
    const humans = this.lobby.players.filter((p) => !p.bot).length;
    this.lobby.settings.bots = Math.max(0, Math.min(MAX_PLAYERS - humans, this.lobby.settings.bots));
    this.emitLobby();
  }

  chat(text: string) {
    const t = text.slice(0, 140);
    this.broadcast({ t: 'chat', from: this.me.name, text: t });
    this.cb.onChat(this.me.name, t);
  }

  command(cmd: Parameters<Simulation['queueCommand']>[1]) {
    this.sim?.queueCommand(this.me.pid, cmd);
  }

  /** Valida y arma el roster. Devuelve un mensaje de error o null. */
  canStart(): string | null {
    const s = this.lobby.settings;
    const humans = this.lobby.players.filter((p) => p.connected);
    const total = humans.length + s.bots;
    if (total < 2) return 'Hacen falta al menos 2 personajes: sumá bots o esperá a tus amigos.';
    if (total > MAX_PLAYERS) return `Máximo ${MAX_PLAYERS} personajes por partida.`;
    if (s.teams === 'teams' || s.mode === 'moba') {
      const t = [0, 0];
      for (const p of humans) t[p.team]++;
      let b = s.bots;
      while (b-- > 0) t[t[0] <= t[1] ? 0 : 1]++;
      if (t[0] === 0 || t[1] === 0) return 'Un equipo quedó vacío: cambiá de equipo o sumá bots.';
      if (t[0] > 3 || t[1] > 3) return 'Máximo 3 por equipo.';
    }
    return null;
  }

  startMatch(): string | null {
    const err = this.canStart();
    if (err) return err;
    const s = { ...this.lobby.settings };
    if (s.mode === 'moba') { s.teams = 'teams'; s.rules = 'moba'; }
    const humans = this.lobby.players.filter((p) => p.connected);
    const roster: RosterEntry[] = humans.map((p) => ({ pid: p.pid, name: p.name, hero: p.hero, team: p.team, bot: false, hat: p.hat }));
    const t = [0, 0];
    for (const p of humans) t[p.team]++;
    const used = new Set(roster.map((r) => r.hero));
    for (let i = 0; i < s.bots; i++) {
      const team = t[0] <= t[1] ? 0 : 1;
      t[team]++;
      const free = HERO_IDS.filter((h) => !used.has(h));
      const hero = (free.length ? free : HERO_IDS)[Math.floor(Math.random() * (free.length || HERO_IDS.length))];
      used.add(hero);
      roster.push({ pid: `bot-${i}`, name: BOT_NAMES[i % BOT_NAMES.length], hero, team, bot: true, botLevel: s.botLevel, hat: ['none', 'party', 'horns', 'tophat'][i % 4] });
    }
    // Asedio: el mapa sale del tamaño de los equipos (1 línea hasta 2v2, 2 líneas en 3v3).
    if (s.mode === 'moba') s.map = mobaMapFor(Math.max(t[0], t[1]));
    const seed = Math.floor(Math.random() * 1e9);
    this.sim = new Simulation({ settings: s, roster, seed });
    this.brains.clear();
    for (const ch of this.sim.chars) if (ch.bot) this.brains.set(ch.id, new BotBrain(s.botLevel, seed + ch.id));
    const rosterInfo: RosterInfo[] = this.sim.chars.map((c) => ({ id: c.id, pid: c.pid, name: c.name, team: c.team, hero: c.hero, bot: c.bot, hat: c.hat }));
    this.init = { settings: s, roster: rosterInfo, seed, tick: 0, matchId: uuid4() };
    this.lobby.inMatch = true;
    this.frames.clear();
    this.localEvents = [];
    this.resultSent = false;
    this.endT = 0;
    for (const r of this.remotes.values()) { r.queue = []; r.lastSeq = 0; r.ack = 0; }
    this.broadcast({ t: 'start', init: this.init });
    this.emitLobby();
    this.cb.onStart(this.init);
    void db.setGameStatus(this.gameId, 'playing');
    return null;
  }

  setLocalInput(f: InputFrame) { this.localInput = f; }

  /** Un tick de simulación (60 Hz). */
  tick() {
    const sim = this.sim;
    if (!sim) return;
    for (const ch of sim.chars) {
      if (ch.pid === this.me.pid) {
        ch.input = this.localInput;
        continue;
      }
      const brain = this.brains.get(ch.id);
      if (brain) { ch.input = brain.think(sim, ch, DT); continue; }
      const r = this.remotes.get(ch.pid);
      if (!r) { ch.input = { ...ch.input, b: 0, mx: 0, mz: 0 }; continue; }
      if (r.queue.length) {
        while (r.queue.length > 4) {
          const drop = r.queue.shift()!;
          r.queue[0].b |= drop.b;
        }
        const f = r.queue.shift()!;
        r.last = f;
        r.ack = f.seq;
      }
      ch.input = r.last;
    }
    sim.step();
    const evs = sim.drainEvents();
    if (evs.length) {
      const timed = evs.map((e) => ({ ...e, t: sim.tick }) as TimedEvent);
      this.localEvents.push(...timed);
      this.broadcast({ t: 'ev', l: timed });
    }
    const frame = buildWorldFrame(sim);
    this.frames.push(frame);

    if (sim.tick % SNAPSHOT_EVERY === 0 && this.remotes.size) {
      const w = JSON.stringify(encodeWorld(frame));
      for (const r of this.remotes.values()) {
        if (!r.welcomed) continue;
        const ch = sim.charByPid.get(r.pid);
        const me = ch ? JSON.stringify(buildMeFrame(sim, ch)) : 'null';
        r.link.sendRaw(`{"t":"s","a":${r.ack},"me":${me},"w":${w}}`, true);
      }
    }

    if (sim.phase === 'end' && !this.resultSent) {
      this.endT += DT;
      if (this.endT > 3) this.finish();
    }

    this.announceT += DT;
    if (this.announceT > 10) { this.announceT = 0; this.announce(); }
  }

  private finish() {
    const sim = this.sim!;
    this.resultSent = true;
    const r = sim.result ?? { winner: -1, draw: true, reason: '' };
    const res: MatchResultInfo = {
      winner: r.winner, draw: r.draw, reason: r.reason, duration: sim.elapsed, teams: sim.settings.teams,
      players: sim.chars.map((c) => ({
        id: c.id, pid: c.pid, name: c.name, hero: c.hero, team: c.team, bot: c.bot,
        kills: c.kills, deaths: c.deaths, assists: c.assists, heatDealt: c.heatDealt, level: c.level, cs: c.cs,
        destroyed: c.destroyed, pickups: c.pickups, billiards: c.billiards, bestLaunch: Math.round(c.bestLaunch), lethals: c.lethals, saves: c.saves, hat: c.hat,
      })),
    };
    this.lastResult = res;
    this.broadcast({ t: 'end', res });
    this.cb.onEnd(res);
    if (this.init && !this.offline) void db.saveMatch(this.gameId, this.init, res);
  }

  backToLobby() {
    this.sim = null;
    this.init = null;
    this.lobby.inMatch = false;
    this.lobby.players = this.lobby.players.filter((p) => p.connected);
    this.broadcast({ t: 'back' });
    this.emitLobby();
    this.cb.onBack();
    void db.setGameStatus(this.gameId, 'lobby');
  }

  /** Refresca pings en el lobby (los clientes miden su RTT y lo reportan). */
  refreshLobby() {
    if (!this.lobby.inMatch) this.emitLobby();
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.broadcast({ t: 'kick', reason: 'El host cerró la sala.' });
    await new Promise((r) => setTimeout(r, 150));
    for (const r of this.remotes.values()) { r.link.onClose = () => {}; r.link.close('host-closed'); }
    this.remotes.clear();
    this.dir?.announce(null);
    this.dir?.close();
    await this.sig?.leave();
    void db.setGameStatus(this.gameId, 'closed');
  }
}
