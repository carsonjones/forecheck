CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts5(
  transcript,
  content='transcripts',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS transcripts_fts_insert
AFTER INSERT ON transcripts BEGIN
  INSERT INTO transcripts_fts(rowid, transcript)
  VALUES (new.id, new.transcript);
END;

CREATE TRIGGER IF NOT EXISTS transcripts_fts_delete
AFTER DELETE ON transcripts BEGIN
  INSERT INTO transcripts_fts(transcripts_fts, rowid, transcript)
  VALUES ('delete', old.id, old.transcript);
END;

CREATE TRIGGER IF NOT EXISTS transcripts_fts_update
AFTER UPDATE OF transcript ON transcripts BEGIN
  INSERT INTO transcripts_fts(transcripts_fts, rowid, transcript)
  VALUES ('delete', old.id, old.transcript);
  INSERT INTO transcripts_fts(rowid, transcript)
  VALUES (new.id, new.transcript);
END;

INSERT INTO transcripts_fts(rowid, transcript)
SELECT id, transcript FROM transcripts;
