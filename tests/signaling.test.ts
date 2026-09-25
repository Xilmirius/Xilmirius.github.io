// Reproduce el error "cannot add 'presence' callbacks for realtime:rubble-lobby after 'subscribe()'":
// supabase-js devuelve el MISMO canal si se pide dos veces el mismo nombre. El cliente falso de abajo
// imita ese comportamiento (y el throw) para comprobar que el directorio de salas no se rompe.
import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeChannel {
  subscribed = false;
  removed = false;
  tracked: unknown = null;
  private syncCbs: (() => void)[] = [];
  constructor(public topic: string, private all: Map<string, unknown>) {}
  on(type: string, _f: unknown, cb: () => void) {
    if (this.subscribed) throw new Error(`cannot add '${type}' callbacks for ${this.topic} after 'subscribe()'.`);
    if (type === 'presence') this.syncCbs.push(cb);
    return this;
  }
  subscribe(cb: (s: string) => void) {
    this.subscribed = true;
    queueMicrotask(() => cb('SUBSCRIBED'));
    return this;
  }
  async track(v: unknown) { this.tracked = v; this.all.set(this.topic, v); for (const c of this.syncCbs) c(); return 'ok'; }
  async untrack() { this.tracked = null; this.all.delete(this.topic); for (const c of this.syncCbs) c(); return 'ok'; }
  presenceState() { return this.tracked ? { me: [this.tracked] } : {}; }
  teardown() { this.removed = true; }
}

class FakeClient {
  channels: FakeChannel[] = [];
  presence = new Map<string, unknown>();
  realtime = { _remove: (c: FakeChannel) => { this.channels = this.channels.filter((x) => x !== c); } };
  channel(name: string) {
    const topic = 'realtime:' + name;
    const found = this.channels.find((c) => c.topic === topic);
    if (found) return found; // igual que supabase-js
    const c = new FakeChannel(topic, this.presence);
    this.channels.push(c);
    return c;
  }
  getChannels() { return this.channels; }
  async removeChannel(c: FakeChannel) { c.teardown(); this.channels = this.channels.filter((x) => x !== c); return 'ok'; }
}

let fake = new FakeClient();
vi.mock('../src/net/supabaseClient', () => ({ getSupabase: () => fake }));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('directorio de salas (Supabase)', () => {
  beforeEach(() => { fake = new FakeClient(); vi.resetModules(); });

  it('el menú y el host comparten el canal del lobby sin romperse', async () => {
    const { SupabaseDirectory } = await import('../src/net/signaling/supabase');
    const menu = new SupabaseDirectory();
    let seen: unknown[] = [];
    menu.subscribe((r) => { seen = r; });
    await flush();
    // Crear sala: el host abre su propio directorio mientras el del menú sigue vivo.
    const host = new SupabaseDirectory();
    expect(() => host.announce({ code: 'ABCDE', host: 'Yo', players: 1, max: 6, mode: 'stock', map: 'cantera', inMatch: false })).not.toThrow();
    await flush();
    await flush();
    expect(fake.channels.filter((c) => c.topic === 'realtime:rubble-lobby').length).toBe(1);
    expect(seen.length).toBe(1);
    // El host cierra: la sala desaparece pero el menú sigue escuchando el mismo canal.
    host.close();
    await flush();
    expect(seen.length).toBe(0);
    expect(fake.channels.length).toBe(1);
    menu.close();
    await flush();
    expect(fake.channels.length).toBe(0);
  });

  it('se puede volver a abrir después de cerrar todo', async () => {
    const { SupabaseDirectory } = await import('../src/net/signaling/supabase');
    const a = new SupabaseDirectory();
    await flush();
    a.close();
    await flush();
    const b = new SupabaseDirectory();
    b.announce({ code: 'QWERT', host: 'Yo', players: 1, max: 6, mode: 'stock', map: 'cantera', inMatch: false });
    await flush();
    await flush();
    expect(fake.channels.length).toBe(1);
    expect(fake.channels[0].tracked).toBeTruthy();
    b.close();
  });

  it('freshChannel descarta un canal viejo con el mismo nombre', async () => {
    const { freshChannel } = await import('../src/net/signaling/supabase');
    const old = fake.channel('rubble-room-X');
    old.subscribe(() => {});
    const ch = await freshChannel(fake as any, 'rubble-room-X', {} as any);
    expect(ch).not.toBe(old);
    expect(() => ch.on('presence', { event: 'sync' }, () => {})).not.toThrow();
  });
});
