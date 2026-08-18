-- Padel Champions – Datenbankschema
-- Im Supabase SQL Editor des Projekts "free-fit stats" ausführen.
-- Danach unter Project Settings -> Data API -> "Exposed schemas" das Schema "padel" hinzufügen,
-- damit die App per REST/JS-Client darauf zugreifen kann.

create schema if not exists padel;

-- Spieler --------------------------------------------------------------
create table if not exists padel.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Spieltage --------------------------------------------------------------
create table if not exists padel.game_days (
  id uuid primary key default gen_random_uuid(),
  play_date date not null unique,
  created_at timestamptz not null default now()
);

-- Anwesenheit an einem Spieltag ------------------------------------------
create table if not exists padel.attendance (
  game_day_id uuid not null references padel.game_days(id) on delete cascade,
  player_id uuid not null references padel.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_day_id, player_id)
);

-- Ein Match = ein Ergebnis auf einem Platz in einer Runde -----------------
create table if not exists padel.matches (
  id uuid primary key default gen_random_uuid(),
  game_day_id uuid not null references padel.game_days(id) on delete cascade,
  round int not null default 1,
  court int not null default 1,
  team1_score int not null check (team1_score >= 0),
  team2_score int not null check (team2_score >= 0),
  created_at timestamptz not null default now()
);

-- Zuordnung Spieler <-> Team innerhalb eines Matches -----------------------
create table if not exists padel.match_players (
  match_id uuid not null references padel.matches(id) on delete cascade,
  player_id uuid not null references padel.players(id) on delete cascade,
  team smallint not null check (team in (1, 2)),
  primary key (match_id, player_id)
);

create index if not exists match_players_player_idx on padel.match_players(player_id);
create index if not exists matches_game_day_idx on padel.matches(game_day_id);
create index if not exists attendance_game_day_idx on padel.attendance(game_day_id);

-- Rangliste als View -------------------------------------------------------
create or replace view padel.standings
with (security_invoker = true) as
with per_match as (
  select
    mp.player_id,
    m.id as match_id,
    case when mp.team = 1 then m.team1_score else m.team2_score end as own_score,
    case when mp.team = 1 then m.team2_score else m.team1_score end as opp_score
  from padel.match_players mp
  join padel.matches m on m.id = mp.match_id
)
select
  p.id as player_id,
  p.name,
  p.active,
  count(pm.match_id)::int as games_played,
  coalesce(sum(case
    when pm.own_score > pm.opp_score then 3
    when pm.own_score = pm.opp_score then 1
    else 0
  end), 0)::int as points,
  coalesce(sum(case when pm.own_score > pm.opp_score then 1 else 0 end), 0)::int as wins,
  coalesce(sum(case when pm.own_score = pm.opp_score then 1 else 0 end), 0)::int as draws,
  coalesce(sum(case when pm.own_score < pm.opp_score then 1 else 0 end), 0)::int as losses,
  coalesce(sum(pm.own_score), 0)::int as goals_for,
  coalesce(sum(pm.opp_score), 0)::int as goals_against,
  coalesce(sum(pm.own_score - pm.opp_score), 0)::int as diff
from padel.players p
left join per_match pm on pm.player_id = p.id
group by p.id, p.name, p.active
order by points desc, diff desc, wins desc, p.name asc;

-- Row Level Security --------------------------------------------------------
-- Offener Zugriff ohne Login (interne Gruppe von Freunden), aber RLS explizit
-- aktiv mit permissiven Policies, damit nichts versehentlich offen bleibt,
-- falls später doch Restriktionen gewünscht sind.
alter table padel.players enable row level security;
alter table padel.game_days enable row level security;
alter table padel.attendance enable row level security;
alter table padel.matches enable row level security;
alter table padel.match_players enable row level security;

drop policy if exists "public full access" on padel.players;
create policy "public full access" on padel.players for all using (true) with check (true);

drop policy if exists "public full access" on padel.game_days;
create policy "public full access" on padel.game_days for all using (true) with check (true);

drop policy if exists "public full access" on padel.attendance;
create policy "public full access" on padel.attendance for all using (true) with check (true);

drop policy if exists "public full access" on padel.matches;
create policy "public full access" on padel.matches for all using (true) with check (true);

drop policy if exists "public full access" on padel.match_players;
create policy "public full access" on padel.match_players for all using (true) with check (true);

-- Zugriffsrechte für den anon-Client (Supabase JS SDK ohne Login) -----------
grant usage on schema padel to anon, authenticated;
grant select, insert, update, delete on all tables in schema padel to anon, authenticated;
grant select on padel.standings to anon, authenticated;
alter default privileges in schema padel grant select, insert, update, delete on tables to anon, authenticated;

-- Stammspieler vorbefüllen ---------------------------------------------------
insert into padel.players (name) values
  ('Nicole'),
  ('Niels'),
  ('Nadine H.'),
  ('Nadine B.'),
  ('Kevin'),
  ('Philippe'),
  ('Morena'),
  ('Sandra'),
  ('Franziska'),
  ('Hugi'),
  ('Max')
on conflict (name) do nothing;
