export type Game = {
  id: number;
  season: number;
  game_type: number;
  game_date: string;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  ingested_at: string;
};

export type GameEvent = {
  id: number;
  game_id: number;
  event_id: number;
  period: number;
  time_in_period: string;
  seconds_elapsed: number;
  situation_code: string;
  type_code: number;
  type_desc: string;
  owner_team_id: number | null;
  x_coord: number | null;
  y_coord: number | null;
  zone_code: string | null;
  shot_type: string | null;
  shooting_player_id: number | null;
  goalie_id: number | null;
  blocking_player_id: number | null;
  scoring_player_id: number | null;
  assist1_player_id: number | null;
  assist2_player_id: number | null;
  xg: number | null;
};

export type Highlight = {
  event_id: number;
  game_id: number;
  period: number;
  time_in_period: string;
  brightcove_clip_id: number;
  r2_key: string | null;
  season: number;
  scorer_id: number | null;
  team_id: number | null;
  first_name: string | null;
  last_name: string | null;
  transcript: string | null;
  transcript_model: string | null;
  stream_url: string | null;
};

export type GameDetail = Game & {
  events: GameEvent[];
  highlights: Highlight[];
};

export type GameFilters = {
  season: string;
  date: string;
};
