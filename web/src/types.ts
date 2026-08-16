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

export type Player = {
  id: number;
  first_name: string;
  last_name: string;
  position_code: string;
  current_team_id: number | null;
};

export type PlayerRating = {
  id: number;
  player_id: number;
  season: number;
  ev_offense_war: number | null;
  ev_defense_war: number | null;
  pp_war: number | null;
  pk_war: number | null;
  total_war: number | null;
  ev_toi: number | null;
  pp_toi: number | null;
  pk_toi: number | null;
  games_played: number | null;
  updated_at: string;
};

export type PlayerGoal = Highlight & {
  game_date: string;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  owner_team_id: number | null;
  shot_type: string | null;
  x_coord: number | null;
  y_coord: number | null;
  xg: number | null;
};

export type PlayerDetail = Player & {
  ratings: PlayerRating[];
  goals: PlayerGoal[];
};

export type PlayerFilters = {
  query: string;
  team: string;
  position: string;
};

export type WarPlayer = {
  player_id: number;
  first_name: string;
  last_name: string;
  position_code: string;
  ev_offense_war: number | null;
  ev_defense_war: number | null;
  pp_war: number | null;
  pk_war: number | null;
  total_war: number;
  games_played: number | null;
  ev_toi: number | null;
};

export type Team = {
  id: number;
  abbreviation: string;
  name: string;
  city: string;
  player_count: number;
  games_played: number;
  wins: number;
  losses: number;
  goals_for: number;
  goals_against: number;
};

export type TeamAggregate = {
  team_id?: number;
  games_played: number;
  wins: number;
  losses: number;
  goals_for: number;
  goals_against: number;
};

export type TeamDetail = Omit<Team, 'player_count' | 'games_played' | 'wins' | 'losses' | 'goals_for' | 'goals_against'> & {
  aggregate: TeamAggregate;
  players: Player[];
  games: Game[];
};

export type HighlightFeedItem = Highlight & {
  id: number;
  game_date: string;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
};

export type HighlightPage = {
  results: HighlightFeedItem[];
  next_cursor: string | null;
};

export type HighlightFilters = {
  season: string;
  team: string;
  player: string;
};

export type TranscriptSearchMode = 'keyword' | 'semantic' | 'hybrid';

export type TranscriptSearchResult = Highlight & {
  game_date: string;
  home_team_id: number;
  away_team_id: number;
  model: string | null;
  semantic_score?: number;
  score?: number;
};

export type TranscriptSearchResponse = {
  mode: TranscriptSearchMode;
  model?: string;
  results: TranscriptSearchResult[];
};
