// Signaling sobre Supabase Realtime (broadcast + presence). No usa tablas: funciona apenas
// creás el proyecto. Postgres se usa aparte, solo para historial (ver src/db/persistence.ts).
//
// Ojo con supabase-js: `client.channel(nombre)` DEVUELVE EL CANAL EXISTENTE si ya hay uno con ese
// nombre. Si ese canal ya está suscripto, agregarle listeners tira
// "cannot add 'presence' callbacks for realtime:X after 'subscribe()'". Por eso:
//  - el directorio de salas usa UN solo canal compartido por pestaña (LobbyHub, con contador de usos),
//  - y antes de crear un canal se limpia cualquier resto viejo con el mismo nombre (freshChannel).
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../supabaseClient';
import type { Directory, Presence, RoomInfo, SignalingChannel, SignalMsg } from './types';

type ChannelOpts = Parameters<SupabaseClient['channel']>[1];

/** Crea un canal nuevo de verdad: si quedó uno viejo con el mismo nombre, lo saca antes. */
export async function freshChannel(sb: SupabaseClient, name: string, opts: ChannelOpts): Promise<RealtimeChannel> {
  const topic = 'realtime:' + name;
  for (const old of sb.getChannels().filter((c) => c.topic === topic)) {
    try { await sb.removeChannel(old); } catch { /* */ }
    // Si el unsubscribe no llegó a confirmarse, el canal sigue registrado: lo sacamos a mano.
    if (sb.getChannels().includes(old)) {
      try { old.teardown(); } catch { /* */ }
      try { (sb.realtime as unknown as { _remove(c: RealtimeChannel): void })._remove(old); } catch { /* */ }
    }
  }
  return sb.channel(name, opts);
}

export class SupabaseSignaling implements SignalingChannel {
  readonly kind = 'supabase' as const;
  private ch: RealtimeChannel | null = null;

  async join(room: string, me: Presence, onMsg: (m: SignalMsg) => void, onPresence: (list: Presence[]) => void) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase no está configurado');
    const ch = await freshChannel(sb, 'rubble-room-' + room, { config: { broadcast: { self: false, ack: false }, presence: { key: me.pid } } });
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

const LOBBY = 'rubble-lobby';

/**
 * Canal de presence global con las salas abiertas. Uno solo por pestaña: el menú (que lista salas)
 * y el host (que anuncia la suya) lo comparten. Se cierra cuando lo suelta el último que lo usa.
 */
class LobbyHub {
  private ch: RealtimeChannel | null = null;
  private ready: Promise<void> | null = null;
  private users = 0;
  private listeners = new Set<(r: RoomInfo[]) => void>();
  private rooms: RoomInfo[] = [];
  private mine: RoomInfo | null = null;
  private gen = 0;
  private readonly key = 'dir-' + Math.random().toString(36).slice(2);

  acquire() {
    this.users++;
    void this.ensure();
  }

  release() {
    this.users = Math.max(0, this.users - 1);
    if (this.users > 0) return;
    const ch = this.ch;
    const sb = getSupabase();
    this.gen++;
    this.ch = null;
    this.ready = null;
    this.mine = null;
    this.rooms = [];
    if (ch && sb) void sb.removeChannel(ch);
  }

  listen(cb: (r: RoomInfo[]) => void) {
    this.listeners.add(cb);
    cb(this.rooms);
  }

  unlisten(cb: (r: RoomInfo[]) => void) { this.listeners.delete(cb); }

  announce(room: RoomInfo | null) {
    this.mine = room;
    void this.ensure().then(async () => {
      const ch = this.ch;
      if (!ch) return;
      try {
        if (this.mine) await ch.track({ room: this.mine });
        else await ch.untrack();
      } catch { /* */ }
    });
  }

  private ensure(): Promise<void> {
    if (this.ready) return this.ready;
    const sb = getSupabase();
    if (!sb) return Promise.resolve();
    const gen = this.gen;
    this.ready = (async () => {
      const ch = await freshChannel(sb, LOBBY, { config: { presence: { key: this.key } } });
      if (gen !== this.gen) { void sb.removeChannel(ch); return; } // lo soltaron mientras se creaba
      this.ch = ch;
      ch.on('presence', { event: 'sync' }, () => {
        const st = ch.presenceState<{ room?: RoomInfo }>();
        const rooms: RoomInfo[] = [];
        for (const k of Object.keys(st)) for (const p of st[k]) if (p.room) rooms.push(p.room);
        this.rooms = rooms;
        for (const cb of this.listeners) cb(rooms);
      });
      await new Promise<void>((resolve) => {
        const to = setTimeout(resolve, 8000);
        ch.subscribe((status) => { if (status === 'SUBSCRIBED') { clearTimeout(to); resolve(); } });
      });
    })().catch((e) => { console.warn('[supabase] directorio de salas', e); });
    return this.ready;
  }
}

let hub: LobbyHub | null = null;
const lobbyHub = () => (hub ??= new LobbyHub());

/** Lista de salas abiertas usando presence en el canal global. Se limpia sola si el host cierra. */
export class SupabaseDirectory implements Directory {
  private cb: ((r: RoomInfo[]) => void) | null = null;
  private announced = false;
  private closed = false;

  constructor() { lobbyHub().acquire(); }

  subscribe(cb: (rooms: RoomInfo[]) => void) {
    if (this.cb) lobbyHub().unlisten(this.cb);
    this.cb = cb;
    lobbyHub().listen(cb);
  }

  announce(room: RoomInfo | null) {
    if (this.closed) return;
    this.announced = !!room;
    lobbyHub().announce(room);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.announced) lobbyHub().announce(null);
    if (this.cb) lobbyHub().unlisten(this.cb);
    this.cb = null;
    lobbyHub().release();
  }
}
