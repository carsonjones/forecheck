CREATE TABLE IF NOT EXISTS games (
  id          INTEGER PRIMARY KEY,
  season      INTEGER NOT NULL,
  game_type   INTEGER NOT NULL,
  game_date   TEXT NOT NULL,
  home_team_id INTEGER NOT NULL,
  away_team_id INTEGER NOT NULL,
  home_score  INTEGER,
  away_score  INTEGER,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS games_season ON games(season, game_type);
CREATE INDEX IF NOT EXISTS games_date   ON games(game_date);

CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id         INTEGER NOT NULL REFERENCES games(id),
  event_id        INTEGER NOT NULL,
  period          INTEGER NOT NULL,
  time_in_period  TEXT NOT NULL,
  seconds_elapsed INTEGER NOT NULL,
  situation_code  TEXT NOT NULL,
  type_code       INTEGER NOT NULL,
  type_desc       TEXT NOT NULL,
  owner_team_id   INTEGER,
  x_coord         REAL,
  y_coord         REAL,
  zone_code       TEXT,
  shot_type       TEXT,
  shooting_player_id INTEGER,
  goalie_id          INTEGER,
  blocking_player_id INTEGER,
  scoring_player_id  INTEGER,
  assist1_player_id  INTEGER,
  assist2_player_id  INTEGER,
  xg              REAL,
  UNIQUE(game_id, event_id)
);

CREATE INDEX IF NOT EXISTS events_game   ON events(game_id);
CREATE INDEX IF NOT EXISTS events_player ON events(shooting_player_id);
CREATE INDEX IF NOT EXISTS events_type   ON events(type_code);

CREATE TABLE IF NOT EXISTS shifts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL REFERENCES games(id),
  player_id   INTEGER NOT NULL,
  team_id     INTEGER NOT NULL,
  period      INTEGER NOT NULL,
  start_secs  INTEGER NOT NULL,
  end_secs    INTEGER NOT NULL,
  shift_number INTEGER NOT NULL,
  UNIQUE(game_id, player_id, period, shift_number)
);

CREATE INDEX IF NOT EXISTS shifts_game   ON shifts(game_id);
CREATE INDEX IF NOT EXISTS shifts_player ON shifts(player_id);
CREATE INDEX IF NOT EXISTS shifts_window ON shifts(game_id, period, start_secs, end_secs);

CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  position_code TEXT NOT NULL,
  current_team_id INTEGER
);

CREATE TABLE IF NOT EXISTS player_ratings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id       INTEGER NOT NULL REFERENCES players(id),
  season          INTEGER NOT NULL,
  ev_offense_war  REAL,
  ev_defense_war  REAL,
  pp_war          REAL,
  pk_war          REAL,
  total_war       REAL,
  ev_toi          REAL,
  pp_toi          REAL,
  pk_toi          REAL,
  games_played    INTEGER,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, season)
);

CREATE INDEX IF NOT EXISTS ratings_season ON player_ratings(season, total_war);
