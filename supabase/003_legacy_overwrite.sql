-- Aktualisiert die Legacy-Startwerte auf den Stand der "Gesamt-Rangliste"
-- (überschreibt die zuvor mit 002_legacy_results.sql importierten Werte).
-- Im Supabase SQL Editor ausführen.

insert into padel.legacy_stats (player_id, wins, draws, losses, diff)
select p.id, v.wins, v.draws, v.losses, v.diff
from (values
  ('Niels',      10, 1, 1,  28),
  ('Nicole',     10, 1, 1,  23),
  ('Nadine H.',   7, 1, 8,   1),
  ('Philippe',    6, 1, 1,  13),
  ('Nadine B.',   5, 2, 5,  -4),
  ('Max',         5, 1, 3,   7),
  ('Hugi',        5, 0, 3,   8),
  ('Andrea',      3, 0, 5,  -6),
  ('Kevin',       3, 0, 9, -19),
  ('Morena',      3, 0, 13, -26),
  ('Franziska',   2, 1, 5, -14),
  ('Sandra',      0, 3, 0, -11)
) as v(name, wins, draws, losses, diff)
join padel.players p on p.name = v.name
on conflict (player_id) do update set
  wins = excluded.wins,
  draws = excluded.draws,
  losses = excluded.losses,
  diff = excluded.diff,
  updated_at = now();
