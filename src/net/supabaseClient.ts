// Cliente de Supabase compartido (se crea solo si hay URL y key configuradas).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '../config';

let client: SupabaseClient | null = null;
let clientKey = '';

export function getSupabase(): SupabaseClient | null {
  const c = getConfig();
  if (!c.supabaseUrl || !c.supabaseKey) return null;
  const k = c.supabaseUrl + '|' + c.supabaseKey;
  if (!client || k !== clientKey) {
    client = createClient(c.supabaseUrl, c.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 40 } },
    });
    clientKey = k;
  }
  return client;
}
