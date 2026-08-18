-- Import der bereits gespielten Ergebnisse (Spiele 1-4, vor Nutzung der App)
-- Im Supabase SQL Editor NACH schema.sql ausführen.
--
-- Legt eine Tabelle mit "Startwerten" pro Spieler an. Die Rangliste addiert
-- diese Werte zu den ab jetzt über /spieltag erfassten Matches. So bleibt der
-- bisherige Stand erhalten, ohne einzelne alte Matches nachbilden zu müssen.

create table if not exists padel.legacy_stats (
  player_id uuid primary key references padel.players(id) on delete cascade,
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  diff int not null default 0,
  updated_at timestamptz not null default now()
);

alter table padel.legacy_stats enable row level security;

drop policy if exists "public full access" on padel.legacy_stats;
create policy "public full access" on padel.legacy_stats for all using (true) with check (true);

grant select, insert, update, delete on padel.legacy_stats to anon, authenticated;

-- Rangliste um die Startwerte erweitern -------------------------------------
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
),
computed as (
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
)
select
  c.player_id,
  c.name,
  c.active,
  c.games_played + coalesce(l.wins, 0) + coalesce(l.draws, 0) + coalesce(l.losses, 0) as games_played,
  c.points + coalesce(l.wins, 0) * 3 + coalesce(l.draws, 0) as points,
  c.wins + coalesce(l.wins, 0) as wins,
  c.draws + coalesce(l.draws, 0) as draws,
  c.losses + coalesce(l.losses, 0) as losses,
  c.goals_for as goals_for,
  c.goals_against as goals_against,
  c.diff + coalesce(l.diff, 0) as diff
from computed c
left join padel.legacy_stats l on l.player_id = c.player_id
order by points desc, diff desc, wins desc, c.name asc;

grant select on padel.standings to anon, authenticated;

-- Neuen, kurzfristigen Spieler aus der Tabelle anlegen -----------------------
insert into padel.players (name) values ('Andrea')
on conflict (name) do nothing;

-- Startwerte aus "GAME 4" Stand ----------------------------------------------
insert into padel.legacy_stats (player_id, wins, draws, losses, diff)
select p.id, v.wins, v.draws, v.losses, v.diff
from (values
  ('Nicole',     3, 0, 1, 10),
  ('Max',        2, 1, 1,  5),
  ('Nadine B.',  2, 1, 1,  2),
  ('Philippe',   2, 1, 1,  0),
  ('Nadine H.',  2, 0, 2,  1),
  ('Franziska',  1, 1, 2, -5),
  ('Kevin',      1, 0, 3, -5),
  ('Morena',     1, 0, 3, -8),
  ('Sandra',     0, 0, 0,  0),
  ('Andrea',     0, 0, 0,  0),
  ('Niels',      0, 0, 0,  0),
  ('Hugi',       0, 0, 0,  0)
) as v(name, wins, draws, losses, diff)
join padel.players p on p.name = v.name
on conflict (player_id) do update set
  wins = excluded.wins,
  draws = excluded.draws,
  losses = excluded.losses,
  diff = excluded.diff,
  updated_at = now();
