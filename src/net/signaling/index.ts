import { hasSupabase } from '../../config';
import { LocalDirectory, LocalSignaling } from './local';
import { SupabaseDirectory, SupabaseSignaling } from './supabase';
import type { Directory, SignalingChannel } from './types';

export function createSignaling(): SignalingChannel {
  return hasSupabase() ? new SupabaseSignaling() : new LocalSignaling();
}

export function createDirectory(): Directory {
  return hasSupabase() ? new SupabaseDirectory() : new LocalDirectory();
}

export * from './types';
