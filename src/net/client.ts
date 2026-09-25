// Sesión de cliente: se conecta al host por WebRTC, manda inputs y recibe snapshots/eventos.
import { getConfig } from '../config';
import { PROTOCOL_VERSION } from '../core/constants';
import type { TimedEvent } from '../core/events';
import { encodeInput, type InputFrame } from '../core/input';
import type { HostMsg, LobbyState, MatchInit, MatchResultInfo } from '../core/protocol';
import type { Command } from '../core/sim';
import { decodeWorld, type MeFrame, type WorldFrame } from '../core/snapshot';
import type { HeroId } from '../core/types';
import { PeerLink } from './peer';
import { createSignaling, type Presence, type SignalingChannel } from './signaling';

export interface ClientCallbacks {
  onLobby(l: LobbyState): void;
  onStart(init: MatchInit): void;
  onSnapshot(w: WorldFrame, me: MeFrame | null, ack: number): void;
  onEvents(l: TimedEvent[]): void;
  onEnd(res: MatchResultInfo): void;
  onBack(): void;
  onChat(from: string, text: string): void;
  onClosed(reason: string): void;
  onStatus(text: string): void;
}

export class ClientSession {
  readonly isHost = false;
  lobby: LobbyState | null = null;
  init: MatchInit | null = null;
  rtt = 0;
  private sig: SignalingChannel | null = null;
  private link: PeerLink | null = null;
  private hostPid: string | null = null;
  private pingTimer: number | null = null;
  private closed = false;

  constructor(readonly code: string, private me: { pid: string; name: string }, private cb: ClientCallbacks) {}

  get localPid() { return this.me.pid; }
  get signalingKind() { return this.sig?.kind ?? 'none'; }

  async connect(): Promise<void> {
    this.closed = false;
    this.cb.onStatus('Buscando la sala…');
    const sig = createSignaling();
    this.sig = sig;
    let hostSeen: (p: Presence) => void = () => {};
    const hostFound = new Promise<Presence>((res) => { hostSeen = res; });
    let rejected: (why: string) => void = () => {};
    const rejection = new Promise<never>((_, rej) => { rejected = (w) => rej(new Error(w)); });
    rejection.catch(() => {}); // se consume en los race de abajo
    await sig.join(this.code, { pid: this.me.pid, role: 'client', name: this.me.name }, (m) => {
      if (m.kind === 'reject') { rejected(String(m.data ?? 'Rechazado por el host')); return; }
      if (m.kind === 'offer' && !this.link) {
        this.hostPid = m.from;
        this.makeLink(m.from);
      }
      if (this.link && m.from === this.hostPid) void this.link.handleSignal(m);
    }, (list) => {
      const h = list.find((p) => p.role === 'host');
      if (h) hostSeen(h);
    });

    const host = await withTimeout(Promise.race([hostFound, rejection]), 9000, `No existe la sala ${this.code} (o el host se fue).`);
    this.cb.onStatus(`Conectando con ${host.name}…`);
    // Pedir unirse (reintenta hasta recibir la offer).
    const sendJoin = () => sig.send({ from: this.me.pid, to: host.pid, kind: 'join', data: { name: this.me.name } });
    sendJoin();
    const retry = window.setInterval(() => { if (!this.link) sendJoin(); }, 1500);
    let check = 0;
    try {
      const opened = new Promise<void>((res, rej) => {
        check = window.setInterval(() => {
          if (this.link?.opened) res();
          else if (this.closed) rej(new Error('Cancelado'));
        }, 50);
      });
      await withTimeout(Promise.race([opened, rejection]), 20000,
        'No se pudo abrir la conexión P2P. Si están en redes muy restrictivas hace falta un servidor TURN (ver README).');
    } finally {
      clearInterval(retry);
      clearInterval(check);
    }
    this.link!.send({ t: 'hello', pid: this.me.pid, name: this.me.name, v: PROTOCOL_VERSION });
    this.cb.onStatus('Conectado');
    // Con el P2P abierto, Supabase ya no participa: soltamos el canal de signaling.
    setTimeout(() => { if (this.link?.opened) void this.sig?.leave(); }, 4000);
    this.pingTimer = window.setInterval(() => this.link?.send({ t: 'ping', ts: performance.now(), rtt: this.rtt }), 2000);
  }

  private makeLink(hostPid: string) {
    const link = new PeerLink(hostPid, this.me.pid, this.sig!, getConfig().iceServers, false);
    this.link = link;
    link.onMessage = (d) => this.onMessage(d as HostMsg);
    link.onClose = (reason) => {
      if (this.pingTimer !== null) clearInterval(this.pingTimer);
      if (!this.closed) this.cb.onClosed(reason === 'failed' ? 'Se cortó la conexión con el host.' : 'Conexión con el host perdida.');
    };
  }

  private onMessage(m: HostMsg) {
    switch (m.t) {
      case 'welcome': this.lobby = m.lobby; this.cb.onLobby(m.lobby); break;
      case 'lobby': this.lobby = m.lobby; this.cb.onLobby(m.lobby); break;
      case 'start': this.init = m.init; this.cb.onStart(m.init); break;
      case 's': this.cb.onSnapshot(decodeWorld(m.w), m.me as MeFrame | null, m.a); break;
      case 'ev': this.cb.onEvents(m.l); break;
      case 'end': this.cb.onEnd(m.res); break;
      case 'back': this.init = null; this.cb.onBack(); break;
      case 'chat': this.cb.onChat(m.from, m.text); break;
      case 'pong': this.rtt = this.rtt ? this.rtt * 0.7 + (performance.now() - m.ts) * 0.3 : performance.now() - m.ts; break;
      case 'kick': this.closed = true; this.cb.onClosed(m.reason); this.link?.close('kick'); break;
    }
  }

  sendInputs(frames: InputFrame[]) {
    this.link?.send({ t: 'in', f: frames.map(encodeInput) }, true);
  }

  pick(hero?: HeroId, team?: number, hat?: string) { this.link?.send({ t: 'pick', hero, team, hat }); }
  command(cmd: Command) { this.link?.send({ t: 'cmd', cmd }); }
  chat(text: string) { this.link?.send({ t: 'chat', text: text.slice(0, 140) }); }

  async close() {
    this.closed = true;
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.link?.close('leave');
    await this.sig?.leave();
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  let t = 0;
  return Promise.race([
    p,
    new Promise<never>((_, rej) => { t = window.setTimeout(() => rej(new Error(msg)), ms); }),
  ]).finally(() => clearTimeout(t));
}
