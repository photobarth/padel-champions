export type Gender = "m" | "w";

export type Player = {
  id: string;
  name: string;
  active: boolean;
  gender: Gender;
  created_at: string;
};

export type GameDay = {
  id: string;
  play_date: string;
  created_at: string;
};

export type Match = {
  id: string;
  game_day_id: string;
  round: number;
  court: number;
  team1_score: number;
  team2_score: number;
  created_at: string;
};

export type MatchPlayer = {
  match_id: string;
  player_id: string;
  team: 1 | 2;
};

export type Standing = {
  player_id: string;
  name: string;
  active: boolean;
  gender: Gender;
  games_played: number;
  game_days_played: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  diff: number;
  avg_points: number;
};
