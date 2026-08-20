-- Geschlecht pro Spieler, Durchschnittspunkte und Spieltage-Zähler
-- Im Supabase SQL Editor ausführen.

-- Geschlecht -----------------------------------------------------------------
alter table padel.players add column if not exists gender text check (gender in ('m', 'w'));

update padel.players set gender = 'm' where name in ('Niels', 'Philippe', 'Hugi', 'Kevin', 'Max');
update padel.players set gender = 'w' where gender is null;

alter table padel.players alter column gender set not null;

-- Spieltage vor Nutzung der App (Startwert je Spieler, analog legacy_stats) --
alter table padel.legacy_stats add column if not exists days int not null default 0;

-- Rangliste-View: Durchschnittspunkte + Spieltage ergänzen -------------------
create or replace view padel.standings
with (security_invoker = true) as
with per_match as (
  select
    mp.player_id,
    m.id as match_id,
    m.game_day_id,
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
    p.gender,
    count(pm.match_id)::int as games_played,
    count(distinct pm.game_day_id)::int as game_days_played,
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
  group by p.id, p.name, p.active, p.gender
)
select
  c.player_id,
  c.name,
  c.active,
  c.gender,
  (c.games_played + coalesce(l.wins, 0) + coalesce(l.draws, 0) + coalesce(l.losses, 0)) as games_played,
  (c.game_days_played + coalesce(l.days, 0)) as game_days_played,
  (c.points + coalesce(l.wins, 0) * 3 + coalesce(l.draws, 0)) as points,
  (c.wins + coalesce(l.wins, 0)) as wins,
  (c.draws + coalesce(l.draws, 0)) as draws,
  (c.losses + coalesce(l.losses, 0)) as losses,
  c.goals_for as goals_for,
  c.goals_against as goals_against,
  (c.diff + coalesce(l.diff, 0)) as diff,
  case
    when (c.games_played + coalesce(l.wins, 0) + coalesce(l.draws, 0) + coalesce(l.losses, 0)) > 0
    then round(
      (c.points + coalesce(l.wins, 0) * 3 + coalesce(l.draws, 0))::numeric
      / (c.games_played + coalesce(l.wins, 0) + coalesce(l.draws, 0) + coalesce(l.losses, 0)),
      2
    )
    else 0
  end as avg_points
from computed c
left join padel.legacy_stats l on l.player_id = c.player_id
order by points desc, diff desc, wins desc, c.name asc;

grant select on padel.standings to anon, authenticated;
