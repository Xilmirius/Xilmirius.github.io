// Signaling sobre Supabase Realtime (broadcast + presence). No usa tablas: funciona apenas
// creás el proyecto. Postgres se usa aparte, solo para historial (ver src/db/persistence.ts).
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '../supabaseClient';
import type { Directory, Presence, RoomInfo, SignalingChannel, SignalMsg } from './types';

export class SupabaseSignaling implements SignalingChannel {
  readonly kind = 'supabase' as const;
  private ch: RealtimeChannel | null = null;

  async join(room: string, me: Presence, onMsg: (m: SignalMsg) => void, onPresence: (list: Presence[]) => void) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase no está configurado');
    const ch = sb.channel('rubble-room-' + room, { config: { broadcast: { self: false, ack: false }, presence: { key: me.pid } } });
    this.ch = ch;
    ch.on('broadcast', { event: 'sig' }, ({ payload }) => {
      const m = payload as SignalMsg;
      if (m && (m.to === me.pid || m.to === '*')) onMsg(m);
    });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState<Presence>();
      const list: Presence[] = [];
      for (const k of Object.keys(st)) for (const p of st[k]) list.push({ pid: p.pid, role: p.role, name: p.name });
      onPresence(list);
    });
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('Timeout conectando a Supabase Realtime')), 12000);
      ch.subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(to);
          await ch.track({ pid: me.pid, role: me.role, name: me.name });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(to);
          console.warn('[supabase] canal', status, err);
          reject(new Error('No se pudo conectar a Supabase Realtime: revisá la URL y la anon key (Ajustes → Avanzado) y que Realtime permita canales públicos.'));
        }
      });
    });
  }

  send(m: SignalMsg) {
    void this.ch?.send({ type: 'broadcast', event: 'sig', payload: m });
  }

  async leave() {
    const sb = getSupabase();
    if (this.ch && sb) {
      try { await this.ch.untrack(); } catch { /* */ }
      await sb.removeChannel(this.ch);
    }
    this.ch = null;
  }
}

/** Lista de salas abiertas usando presence en un canal global. Se limpia sola si el host cierra. */
export class SupabaseDirectory implements Directory {
  private ch: RealtimeChannel | null = null;
  private ready: Promise<void> | null = null;
  private mine: RoomInfo | null = null;
  private cb: ((r: RoomInfo[]) => void) | null = null;

  private ensure() {
    if (this.ready) return this.ready;
    const sb = getSupabase();
    if (!sb) return Promise.resolve();
    const ch = sb.channel('rubble-lobby', { config: { presence: { key: 'dir-' + Math.random().toString(36).slice(2) } } });
    this.ch = ch;
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState<{ room?: RoomInfo }>();
      const rooms: RoomInfo[] = [];
      for (const k of Object.keys(st)) for (const p of st[k]) if (p.room) rooms.push(p.room);
      this.cb?.(rooms);
    });
    this.ready = new Promise<void>((resolve) => {
      ch.subscribe((status) => { if (status === 'SUBSCRIBED') resolve(); });
      setTimeout(resolve, 8000);
    });
    return this.ready;
  }

  subscribe(cb: (rooms: RoomInfo[]) => void) {
    this.cb = cb;
    void this.ensure();
  }

  announce(room: RoomInfo | null) {
    this.mine = room;
    void this.ensure().then(async () => {
      if (!this.ch) return;
      try {
        if (this.mine) await this.ch.track({ room: this.mine });
        else await this.ch.untrack();
      } catch { /* */ }
    });
  }

  close() {
    const sb = getSupabase();
    if (this.ch && sb) void sb.removeChannel(this.ch);
    this.ch = null;
    this.ready = null;
  }
}
