-- forecheck D1 schema

-- ---------------------------------------------------------------------------
-- Games
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS games (
  id          INTEGER PRIMARY KEY,  -- NHL game ID e.g. 2025020001
  season      INTEGER NOT NULL,     -- e.g. 20242025
  game_type   INTEGER NOT NULL,     -- 2=regular, 3=playoffs
  game_date   TEXT NOT NULL,        -- "YYYY-MM-DD"
  home_team_id INTEGER NOT NULL,
  away_team_id INTEGER NOT NULL,
  home_score  INTEGER,
  away_score  INTEGER,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS games_season ON games(season, game_type);
CREATE INDEX IF NOT EXISTS games_date   ON games(game_date);

-- ---------------------------------------------------------------------------
-- Events  (play-by-play — shots, goals, blocks)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id         INTEGER NOT NULL REFERENCES games(id),
  event_id        INTEGER NOT NULL,   -- NHL eventId within the game
  period          INTEGER NOT NULL,
  time_in_period  TEXT NOT NULL,      -- "MM:SS"
  seconds_elapsed INTEGER NOT NULL,   -- derived: period offset + time
  situation_code  TEXT NOT NULL,      -- e.g. "1551", "1451"
  type_code       INTEGER NOT NULL,   -- 505=goal, 506=shot-on-goal, 507=missed, 508=blocked
  type_desc       TEXT NOT NULL,
  owner_team_id   INTEGER,
  x_coord         REAL,
  y_coord         REAL,
  zone_code       TEXT,               -- "O", "D", "N"
  shot_type       TEXT,
  shooting_player_id INTEGER,
  goalie_id          INTEGER,
  blocking_player_id INTEGER,
  scoring_player_id  INTEGER,
  assist1_player_id  INTEGER,
  assist2_player_id  INTEGER,
  -- computed at ingest time
  xg              REAL,               -- expected goals (null until xG model runs)
  UNIQUE(game_id, event_id)
);

CREATE INDEX IF NOT EXISTS events_game      ON events(game_id);
CREATE INDEX IF NOT EXISTS events_player    ON events(shooting_player_id);
CREATE INDEX IF NOT EXISTS events_type      ON events(type_code);

-- ---------------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shifts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL REFERENCES games(id),
  player_id   INTEGER NOT NULL,
  team_id     INTEGER NOT NULL,
  period      INTEGER NOT NULL,
  start_secs  INTEGER NOT NULL,  -- seconds into period
  end_secs    INTEGER NOT NULL,
  shift_number INTEGER NOT NULL,
  UNIQUE(game_id, player_id, period, shift_number)
);

CREATE INDEX IF NOT EXISTS shifts_game   ON shifts(game_id);
CREATE INDEX IF NOT EXISTS shifts_player ON shifts(player_id);
-- fast on-ice lookup: find all shifts overlapping a given second
CREATE INDEX IF NOT EXISTS shifts_window ON shifts(game_id, period, start_secs, end_secs);

-- ---------------------------------------------------------------------------
-- Players  (lightweight identity table, populated during ingest)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY,  -- NHL player ID
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  position_code TEXT NOT NULL,        -- "C","L","R","D","G"
  current_team_id INTEGER
);

-- ---------------------------------------------------------------------------
-- Player ratings  (computed, updated after each game or batch run)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_ratings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id       INTEGER NOT NULL REFERENCES players(id),
  season          INTEGER NOT NULL,
  -- WAR components (null until model has enough data)
  ev_offense_war  REAL,
  ev_defense_war  REAL,
  pp_war          REAL,
  pk_war          REAL,
  total_war       REAL,
  -- sample sizes
  ev_toi          REAL,  -- seconds
  pp_toi          REAL,
  pk_toi          REAL,
  games_played    INTEGER,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, season)
);

CREATE INDEX IF NOT EXISTS ratings_season ON player_ratings(season, total_war);
