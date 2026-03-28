CREATE TABLE IF NOT EXISTS highlights (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id             INTEGER NOT NULL REFERENCES games(id),
  event_id            INTEGER NOT NULL,
  season              INTEGER NOT NULL,
  brightcove_clip_id  INTEGER NOT NULL,
  r2_key              TEXT,
  period              INTEGER NOT NULL,
  time_in_period      TEXT NOT NULL,
  scorer_id           INTEGER,
  team_id             INTEGER,
  ingested_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(game_id, event_id)
);

CREATE INDEX IF NOT EXISTS highlights_game   ON highlights(game_id);
CREATE INDEX IF NOT EXISTS highlights_season ON highlights(season);
