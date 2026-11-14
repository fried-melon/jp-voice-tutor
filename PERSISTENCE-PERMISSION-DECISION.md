# Cycle 1 persistence: the smallest owner decision

Status 2026-10-28: no persistence enabled anywhere. This memo isolates the
owner decision; it is not a completed learning service. Practice without
persistence works today and remains the default until a decision.

## Authority state (exact)

- No approval exists for the app's new OAuth scope (drive.file consent).
- No approval exists for learner retention in the actual ReviewDB.
- Past TEST-copy appends (2026-10-27, 5 synthetic rows by the DB owner through
  the owner's already-connected Workspace tools) are a different authority from
  an app OAuth grant and do not imply either approval above.
- Even after a yes, first write to the TEST copy via the new grant is its own
  verification step before any real learner write.

## The single question for the owner

"May the app save review records (what was practiced, when, how it went - no
audio, no transcripts, no real name) to your private Google Sheet?"

## Option A - one incremental Google grant (smallest real scope)

- One-time consent: incremental scope `drive.file` plus Google Picker
  selection of the existing ReviewDB file.
- Precise scope semantics (corrected): drive.file covers files the app created
  or the user selects/opens through the app. OAuth does not cryptographically
  restrict access to exactly one file; the app must enforce the fixed selected
  file ID at its own boundary (validateSelectedTestFile does this today:
  owner/file/scope mismatch is rejected).
- Verified caveat (checked 2026-10-28 against
  https://developers.google.com/identity/protocols/oauth2): an external-user
  consent screen in "Testing" status issues refresh tokens that expire in 7
  days when any non-identity scope (drive.file included) is requested. So
  option A means either a short re-consent roughly every 7 days, or publishing
  the consent screen, which can show unverified-app warnings for sensitive
  scopes. This tradeoff must be part of the owner's choice.
- Free (Sheets API has no charge). Revocable anytime in Google account
  permissions; the app then falls back to local queueing.

## Option B - local-only history (zero grants)

- Review rows stay in the browser on the owner's own device (storage module
  built, deliberately unmounted).
- Requires explicit owner acceptance of: per-device/per-browser history with
  no sync; loss on site-data reset or device loss; visibility to anyone using
  that browser profile on that device; manual export only.

## Explicitly not proposed

- Service account, domain-wide delegation, whole-Drive or `spreadsheets`
  scope: all wider than the need.
- Any silent enablement.

## Implemented vs unwired vs untested (exact state)

Implemented and unit-tested offline (real node:sqlite engine behind the
DO-shaped store interface; Cloudflare DO runtime itself unexercised):
- Review row schema/validation/canonicalization (review-schema)
- Evidence-to-FSRS contract adapter, pinned ts-fsrs@5.4.2 (fsrs-adapter)
- Same-day Asia/Seoul policy and qualified replay (qualifyScheduleRows,
  replayQualifiedCard)
- Preview planner (review-queue), card derivation from actual content with QA
  suspension gates (review-cards; approval set encodes existing recall-gate
  evidence only - curriculum owner holds content QA authority)
- Atomic UUID ledger (review-test-ledger), readback-first TEST projector
  (testcopy-projector), serialized durable coordinator
  (review-projection-coordinator), endpoint transport contract
  (review-endpoint-contract), live-mode composition (review-live-append)
- Offline queue (offline-reviews) and its unmounted localStorage mount
  (offline-review-storage)
- No-effect OAuth primitives: state bind/consume, AES-GCM grant encryption,
  fixed-file/scope validation, disconnected state (sheets-oauth-security)
- Durable grant repository: single-use pending states consumed atomically,
  encrypted-grant save/load/revoke with ciphertext wipe
  (sheets-grant-repository)
- Disabled callback/refresh orchestration with injected transport: one-time
  code exchange -> encrypted grant, refresh with rotation, invalid_grant ->
  disconnect (sheets-oauth-flow). No HTTP caller is implemented; that is the
  remaining network piece
- App event-to-grade record builder: accepted evidence event -> validated
  13-column record incl. same-day policy input (review-record-builder)

Unwired (no code path reaches them in the deployed worker):
- No HTTP route for review writes; no DO namespace binding or migration
- No HTTP route for OAuth callback or disconnect; orchestration exists but
  has no caller with real network access (token exchange/refresh HTTP clients)
- localStorage mount not referenced by the client app

Untested / unverified:
- Real Google OAuth consent + callback + token refresh round trip (module
  logic tested with injected transports; Google's real responses unverified)
- Sheets API append under the new grant (RAW input mode confirmed only for the
  DB owner's direct tool calls, not for the app's grant path)
- Cloudflare DO runtime behavior of the store adapter
- Production crash/restore recovery end-to-end
- Client-side production of accepted evidence events (record builder exists;
  the hosted app emits no accepted events to feed it)
- Physical iPhone anything
