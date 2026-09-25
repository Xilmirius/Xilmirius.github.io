// Persistencia en Postgres (Supabase): SOLO datos que sobreviven a la partida (salas, partidas, resultados).
// El gameplay nunca pasa por acá. Si las tablas no existen o no hay Supabase, todo falla en silencio.
import type { MatchInit, MatchResultInfo } from '../core/protocol';
import { getSupabase } from '../net/supabaseClient';

let warned = false;
function warn(e: unknown) {
  if (!warned) {
    warned = true;
    console.warn('[db] persistencia deshabilitada o con error (¿corriste supabase/migrations/0001_init.sql?)', e);
  }
}

async function run<T>(fn: (sb: NonNullable<ReturnType<typeof getSupabase>>) => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await fn(sb);
    if (error) { warn(error); return null; }
    return data;
  } catch (e) {
    warn(e);
    return null;
  }
}

export const db = {
  enabled: () => !!getSupabase(),

  async upsertPlayers(list: { id: string; name: string }[]) {
    const rows = list.filter((p) => /^[0-9a-f-]{36}$/i.test(p.id)).map((p) => ({ id: p.id, name: p.name.slice(0, 24), last_seen: new Date().toISOString() }));
    if (!rows.length) return;
    await run((sb) => sb.from('players').upsert(rows).select('id'));
  },

  async createGame(code: string, hostPid: string, hostName: string): Promise<string | null> {
    await this.upsertPlayers([{ id: hostPid, name: hostName }]);
    const r = await run<{ id: string }[]>((sb) => sb.from('games').insert({ code, host_player_id: hostPid, status: 'lobby' }).select('id'));
    return r?.[0]?.id ?? null;
  },

  async setGameStatus(id: string | null, status: 'lobby' | 'playing' | 'finished' | 'closed') {
    if (!id) return;
    await run((sb) => sb.from('games').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select('id'));
  },

  async saveMatch(gameId: string | null, init: MatchInit, res: MatchResultInfo) {
    if (!getSupabase()) return;
    await this.upsertPlayers(res.players.filter((p) => !p.bot).map((p) => ({ id: p.pid, name: p.name })));
    const ended = new Date();
    const started = new Date(ended.getTime() - res.duration * 1000);
    const ok = await run((sb) => sb.from('matches').insert({
      id: init.matchId, game_id: gameId, mode: init.settings.mode, map: init.settings.map, teams: init.settings.teams,
      started_at: started.toISOString(), ended_at: ended.toISOString(), duration_s: Math.round(res.duration),
      winner_team: res.draw ? null : res.winner, draw: res.draw, reason: res.reason,
    }).select('id'));
    if (!ok) return;
    await run((sb) => sb.from('game_results').insert(res.players.map((p) => ({
      match_id: init.matchId,
      player_id: p.bot || !/^[0-9a-f-]{36}$/i.test(p.pid) ? null : p.pid,
      player_name: p.name, hero: p.hero, team: p.team, is_bot: p.bot,
      kills: p.kills, deaths: p.deaths, assists: p.assists, heat_dealt: Math.round(p.heatDealt), level: p.level,
      won: !res.draw && p.team === res.winner,
    }))).select('id'));
  },

  async leaderboard(): Promise<{ player_name: string; wins: number; matches: number; kills: number; deaths: number }[]> {
    return (await run((sb) => sb.from('leaderboard').select('player_name,wins,matches,kills,deaths').order('wins', { ascending: false }).limit(20))) ?? [];
  },

  async recent(): Promise<{ mode: string; map: string; ended_at: string; winner_team: number | null; draw: boolean; duration_s: number }[]> {
    return (await run((sb) => sb.from('matches').select('mode,map,ended_at,winner_team,draw,duration_s').order('ended_at', { ascending: false }).limit(10))) ?? [];
  },
};
