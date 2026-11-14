-- Migration 002 (ADDITIVE ONLY; no destructive rewrite): version stamps + immutable notes snapshot + review events.
-- Pre-002 sessions keep NULL versions = "version unverifiable" (honest), never back-filled by inference.
ALTER TABLE sessions ADD COLUMN notes_version TEXT;
ALTER TABLE sessions ADD COLUMN content_version TEXT;
CREATE TABLE IF NOT EXISTS session_notes_snapshot (
  session_id TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
  notes_version TEXT NOT NULL,
  content_version TEXT NOT NULL,
  summary_json TEXT NOT NULL,   -- exact end-session buildSessionNotes output; IMMUTABLE (no UPDATE path anywhere)
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_events (
  event_id TEXT PRIMARY KEY,        -- UUID; append-only dedup (INSERT OR IGNORE)
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('word','sentence','reading')),
  outcome TEXT NOT NULL CHECK (outcome IN ('pending','modeled','independent','hinted','explicit-easy')),
  scheduler_rating INTEGER,         -- NULL = practice-only, never counted by the scheduler
  at TEXT NOT NULL,                 -- exact instant; strict monotonic per card enforced in the store
  counts_for_schedule INTEGER NOT NULL DEFAULT 0  -- <=1 counting event per card per Asia-Seoul day, enforced in the store
);
-- FSRS state is NEVER persisted (derived by deterministic replay from these events), so event
-- deletion cannot leave stale due state: replay over the remaining events IS the state.
-- mastery rows anchored to a deleted session are explicitly invalidated by deleteSession (count returned).
