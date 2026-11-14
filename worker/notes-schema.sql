-- Notes/progress private persistence (D1, greenfield). Text only; no audio.
-- Retention scope: full conversation text + notes/progress, per explicit user approval 2026-11-02 21:48 KST.
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  duration_s INTEGER NOT NULL, -- <1s EMPTY sessions produce no notes (store-level rule; a real transcript is never discarded)
  lesson_id TEXT NOT NULL,
  voice_mode TEXT,
  end_state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transcript_entries (
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('clerk','learner','guide')),
  text TEXT NOT NULL,
  ts TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);
CREATE TABLE IF NOT EXISTS card_evidence (
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  heard_asr_phrases TEXT NOT NULL DEFAULT '[]', -- JSON array; recognized-phrase evidence ONLY, not comprehension proof
  mo_ichido_count INTEGER NOT NULL DEFAULT 0,   -- per-role transcript occurrence count, never "repair performance"
  completed INTEGER NOT NULL DEFAULT 0,          -- completion != mastery
  PRIMARY KEY (session_id, card_id)
);
CREATE TABLE IF NOT EXISTS mastery (
  card_id TEXT PRIMARY KEY,
  first_independent_recall_session_id TEXT NOT NULL REFERENCES sessions(session_id), -- later unprompted recall only
  confirmed_at TEXT NOT NULL
);
