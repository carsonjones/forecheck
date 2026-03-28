CREATE TABLE IF NOT EXISTS transcripts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL,
  event_id    INTEGER NOT NULL,
  transcript  TEXT NOT NULL,
  model       TEXT NOT NULL DEFAULT 'whisper-large-v3-turbo',
  ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(game_id, event_id),
  FOREIGN KEY (game_id, event_id) REFERENCES highlights(game_id, event_id)
);

CREATE INDEX IF NOT EXISTS transcripts_game ON transcripts(game_id);
