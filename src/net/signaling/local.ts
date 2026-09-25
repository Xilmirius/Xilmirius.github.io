// Signaling local con BroadcastChannel: funciona entre pestañas del MISMO navegador.
// Sirve para probar sin configurar Supabase. Para jugar entre PCs hace falta Supabase.
import type { Directory, Presence, RoomInfo, SignalingChannel, SignalMsg } from './types';

export class LocalSignaling implements SignalingChannel {
  readonly kind = 'local' as const;
  private bc: BroadcastChannel | null = null;
  private me: Presence | null = null;
  private peers = new Map<string, { p: Presence; t: number }>();
  private timer: number | null = null;

  async join(room: string, me: Presence, onMsg: (m: SignalMsg) => void, onPresence: (list: Presence[]) => void) {
    this.me = me;
    this.bc = new BroadcastChannel('rubble-room-' + room);
    this.bc.onmessage = (ev) => {
      const d = ev.data;
      if (d.type === 'presence') {
        this.peers.set(d.p.pid, { p: d.p, t: Date.now() });
        onPresence(this.list());
      } else if (d.type === 'leave') {
        this.peers.delete(d.pid);
        onPresence(this.list());
      } else if (d.type === 'sig') {
        const m = d.m as SignalMsg;
        if (m.to === me.pid || m.to === '*') onMsg(m);
      }
    };
    const beat = () => {
      this.bc?.postMessage({ type: 'presence', p: me });
      const now = Date.now();
      let changed = false;
      for (const [k, v] of this.peers) if (now - v.t > 4000) { this.peers.delete(k); changed = true; }
      if (changed) onPresence(this.list());
    };
    beat();
    this.timer = window.setInterval(beat, 1000);
  }

  private list() { return [...this.peers.values()].map((v) => v.p).concat(this.me ? [this.me] : []); }

  send(m: SignalMsg) { this.bc?.postMessage({ type: 'sig', m }); }

  async leave() {
    if (this.timer !== null) clearInterval(this.timer);
    if (this.me) this.bc?.postMessage({ type: 'leave', pid: this.me.pid });
    this.bc?.close();
    this.bc = null;
  }
}

export class LocalDirectory implements Directory {
  private bc = new BroadcastChannel('rubble-lobby');
  private rooms = new Map<string, { r: RoomInfo; t: number }>();
  private mine: RoomInfo | null = null;
  private timer: number;
  private cb: ((r: RoomInfo[]) => void) | null = null;

  constructor() {
    this.bc.onmessage = (ev) => {
      if (ev.data.type === 'room') { this.rooms.set(ev.data.r.code, { r: ev.data.r, t: Date.now() }); this.emit(); }
      if (ev.data.type === 'gone') { this.rooms.delete(ev.data.code); this.emit(); }
    };
    this.timer = window.setInterval(() => {
      if (this.mine) this.bc.postMessage({ type: 'room', r: this.mine });
      const now = Date.now();
      for (const [k, v] of this.rooms) if (now - v.t > 5000) this.rooms.delete(k);
      this.emit();
    }, 1500);
  }

  private emit() { this.cb?.([...this.rooms.values()].map((v) => v.r)); }
  subscribe(cb: (rooms: RoomInfo[]) => void) { this.cb = cb; this.emit(); }
  announce(room: RoomInfo | null) {
    if (!room && this.mine) this.bc.postMessage({ type: 'gone', code: this.mine.code });
    this.mine = room;
    if (room) this.bc.postMessage({ type: 'room', r: room });
  }
  close() { this.announce(null); clearInterval(this.timer); this.bc.close(); }
}
