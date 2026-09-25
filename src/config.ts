// Configuración: variables de entorno de Vite (build) con override opcional guardado en el navegador
// (Ajustes → Avanzado), así el mismo build sirve aunque cambies de proyecto de Supabase.
const LS = 'rubble.config';

export interface AppConfig {
  supabaseUrl: string;
  supabaseKey: string;
  iceServers: RTCIceServer[];
}

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

function readLocal(): Partial<AppConfig> {
  try {
    return JSON.parse(localStorage.getItem(LS) ?? '{}');
  } catch {
    return {};
  }
}

function parseIce(s: string | undefined): RTCIceServer[] | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) && v.length ? v : null;
  } catch {
    return null;
  }
}

export function getConfig(): AppConfig {
  const env = import.meta.env;
  const local = readLocal();
  return {
    supabaseUrl: (local.supabaseUrl || env.VITE_SUPABASE_URL || '').trim(),
    supabaseKey: (local.supabaseKey || env.VITE_SUPABASE_ANON_KEY || '').trim(),
    iceServers: local.iceServers?.length ? local.iceServers : parseIce(env.VITE_ICE_SERVERS) ?? DEFAULT_ICE,
  };
}

export function saveConfig(c: Partial<AppConfig>) {
  const cur = readLocal();
  try {
    localStorage.setItem(LS, JSON.stringify({ ...cur, ...c }));
  } catch { /* modo privado */ }
}

export function clearConfig() {
  try { localStorage.removeItem(LS); } catch { /* */ }
}

export const hasSupabase = () => {
  const c = getConfig();
  return !!(c.supabaseUrl && c.supabaseKey);
};

// ───────────── preferencias del jugador ─────────────

const PREFS = 'rubble.prefs';

export interface Prefs {
  name: string;
  pid: string;
  hero: string;
  volMaster: number;
  volMusic: number;
  volSfx: number;
  shadows: boolean;
  hiDpi: boolean;
  showFps: boolean;
  seenHelp: boolean;
  post: boolean;
  announcer: boolean;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try { return crypto.randomUUID(); } catch { /* contexto no seguro */ }
  }
  const b = new Uint8Array(16);
  (crypto as Crypto).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let prefsCache: Prefs | null = null;

/** Id del jugador: uno por pestaña (sobrevive a recargas), así podés probar con varias pestañas. */
function tabPid(): string {
  try {
    let id = sessionStorage.getItem('rubble.tabpid');
    if (!id) { id = uuid(); sessionStorage.setItem('rubble.tabpid', id); }
    return id;
  } catch {
    return uuid();
  }
}

export function getPrefs(): Prefs {
  if (prefsCache) return prefsCache;
  let p: Partial<Prefs> = {};
  try { p = JSON.parse(localStorage.getItem(PREFS) ?? '{}'); } catch { /* */ }
  prefsCache = {
    name: p.name || 'Jugador' + Math.floor(Math.random() * 900 + 100),
    pid: tabPid(),
    hero: p.hero || 'canto',
    volMaster: p.volMaster ?? 0.8,
    volMusic: p.volMusic ?? 0.45,
    volSfx: p.volSfx ?? 0.9,
    shadows: p.shadows ?? true,
    hiDpi: p.hiDpi ?? false,
    showFps: p.showFps ?? false,
    seenHelp: p.seenHelp ?? false,
    post: p.post ?? true,
    announcer: p.announcer ?? true,
  };
  return prefsCache;
}

export function savePrefs(p: Partial<Prefs>) {
  const cur = getPrefs();
  Object.assign(cur, p);
  try {
    const { pid: _pid, ...rest } = cur;
    localStorage.setItem(PREFS, JSON.stringify(rest));
  } catch { /* */ }
}

/** "Duplicar pestaña" copia sessionStorage: si otra pestaña ya usa nuestro id, generamos otro. */
export function ensureUniqueTabId() {
  if (typeof BroadcastChannel === 'undefined') return;
  const bc = new BroadcastChannel('rubble-tabs');
  const mine = () => getPrefs().pid;
  bc.onmessage = (ev) => {
    const d = ev.data;
    if (d?.q === mine()) bc.postMessage({ dup: d.q, nonce: d.nonce });
    else if (d?.dup === mine() && d.nonce === nonce) {
      const id = uuid();
      try { sessionStorage.setItem('rubble.tabpid', id); } catch { /* */ }
      getPrefs().pid = id;
    }
  };
  const nonce = Math.random().toString(36).slice(2);
  bc.postMessage({ q: mine(), nonce });
}
