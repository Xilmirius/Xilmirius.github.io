-- RUBBLE — esquema de persistencia (Postgres de Supabase).
-- Solo datos que sobreviven a la partida: salas, jugadores, partidas y resultados.
-- El gameplay NUNCA pasa por acá (va por WebRTC entre navegadores).
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pegar todo → Run.
-- Es idempotente: se puede correr más de una vez.

create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 24),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null check (char_length(code) between 3 and 8),
  host_player_id uuid references public.players(id) on delete set null,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists games_code_idx on public.games (code);
create index if not exists games_status_idx on public.games (status, updated_at desc);

create table if not exists public.matches (
  id uuid primary key,
  game_id uuid references public.games(id) on delete set null,
  mode text not null,
  map text not null,
  teams text not null default 'teams',
  started_at timestamptz,
  ended_at timestamptz not null default now(),
  duration_s integer not null default 0,
  winner_team integer,
  draw boolean not null default false,
  reason text
);
create index if not exists matches_ended_idx on public.matches (ended_at desc);

create table if not exists public.game_results (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  player_name text not null,
  hero text not null,
  team integer not null,
  is_bot boolean not null default false,
  kills integer not null default 0,
  deaths integer not null default 0,
  assists integer not null default 0,
  heat_dealt integer not null default 0,
  level integer not null default 1,
  won boolean not null default false
);
create index if not exists game_results_match_idx on public.game_results (match_id);
create index if not exists game_results_name_idx on public.game_results (lower(player_name));

-- Ranking por nombre (juego entre amigos: el nombre es la identidad).
create or replace view public.leaderboard with (security_invoker = true) as
select
  min(player_name) as player_name,
  count(*) filter (where won) as wins,
  count(*) as matches,
  coalesce(sum(kills), 0) as kills,
  coalesce(sum(deaths), 0) as deaths
from public.game_results
where not is_bot
group by lower(player_name);

-- ───────────── Row Level Security ─────────────
-- Juego entre amigos sin login: la clave anon puede leer y escribir.
-- Si algún día hay cuentas (Supabase Auth), acá se restringe por auth.uid().
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.matches enable row level security;
alter table public.game_results enable row level security;

drop policy if exists "players read" on public.players;
drop policy if exists "players write" on public.players;
drop policy if exists "players update" on public.players;
create policy "players read" on public.players for select to anon, authenticated using (true);
create policy "players write" on public.players for insert to anon, authenticated with check (true);
create policy "players update" on public.players for update to anon, authenticated using (true) with check (true);

drop policy if exists "games read" on public.games;
drop policy if exists "games write" on public.games;
drop policy if exists "games update" on public.games;
create policy "games read" on public.games for select to anon, authenticated using (true);
create policy "games write" on public.games for insert to anon, authenticated with check (true);
create policy "games update" on public.games for update to anon, authenticated using (true) with check (true);

drop policy if exists "matches read" on public.matches;
drop policy if exists "matches write" on public.matches;
create policy "matches read" on public.matches for select to anon, authenticated using (true);
create policy "matches write" on public.matches for insert to anon, authenticated with check (true);

drop policy if exists "results read" on public.game_results;
drop policy if exists "results write" on public.game_results;
create policy "results read" on public.game_results for select to anon, authenticated using (true);
create policy "results write" on public.game_results for insert to anon, authenticated with check (true);

grant select on public.leaderboard to anon, authenticated;
