-- Legacy-Spieltage (aus den ersten 4 historischen Spieltagen vor Nutzung
-- der App) sowie Korrektur der S/U/N-Werte für Sandra und Max, basierend auf
-- der Differenz zwischen den vom User gemeldeten Gesamt-Spieltagen und den
-- bereits live über die App erfassten Spieltagen.

update padel.legacy_stats l
set days = v.days
from (values
  ('Niels', 3),
  ('Nicole', 3),
  ('Nadine H.', 4),
  ('Nadine B.', 3),
  ('Philippe', 2),
  ('Kevin', 3),
  ('Morena', 4),
  ('Sandra', 1),
  ('Andrea', 2),
  ('Franziska', 2),
  ('Max', 2),
  ('Hugi', 2)
) as v(name, days)
join padel.players p on p.name = v.name
where l.player_id = p.id;

update padel.legacy_stats l
set wins = 1, draws = 0, losses = 3
from padel.players p
where l.player_id = p.id and p.name = 'Sandra';

update padel.legacy_stats l
set wins = 5, draws = 1, losses = 2
from padel.players p
where l.player_id = p.id and p.name = 'Max';
