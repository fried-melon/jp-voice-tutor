# Cycle1 evidence-to-FSRS contract v1 (no-write implementation)
2026-10-27

## Separation
- Performance events are original evidence. Legacy draft1/2/3/4 values are NOT automatically FSRS grades.
- FSRS adapter is `cycle1-fsrs6-evidence-v1`, exact `ts-fsrs@5.4.2` (FSRS6), Node>=20 verified on22.23.3. Beta6 requiresNode24 and is not used.
- UI pacing and model scheduling are separate. Up to one due cue may replace a conversation turn within2-5min, no mandatory catchup. Due dates stay truthful; skipped days do not become failures or accumulating daily quotas.
- No actual DB writes, local persistence or final learner grading is enabled by this module. No optimizer fitted to7seedcards.

## Evidence adapter
| Evidence | Model effect |
| --- | --- |
| ASR uncertain, technical issue, incomplete | pending, no model call |
| modeled immediate repetition, hint before attempt, extra practice | practice-only, no model call |
| no established independent attempt | skip |
| established unaided attempt failed, later hint success or not | Again1 for that failed attempt |
| unaided correct but later hint flag/contradictory evidence | skip as ambiguous |
| independently correct, user explicitly reports hard | Hard2 |
| independently correct, user explicitly reports easy | Easy4 |
| independently correct otherwise | Good3 |

This fixes the draft hint-success2 versus FSRS-Hard mismatch without changing original records. Independent correctness must come from an accepted review flow, not a pronunciation claim or unvalidated model assertion. Intended initial UI can use only failure/correct plus optional explicit effort/easy. Uncertain ASR always has a pending route.

## Parameters and timing
- Built-in stable-version default weights; target retention0.9 is explicit initial product parameter, not optimized promise.
- Deterministic fuzz=false for replay/testing. Changes require new contract version and replay, not history mutation.
- `enable_short_term=true`; empty learning/relearning step lists. This avoids mandatory minute-scale loops within a short daily session but does not prohibit genuine same-day assessments mathematically.
- Every accepted normal independent attempt can be represented, including same-day. This contract implements one accepted schedule-counting event per card/Asia-Seoul-day, outside FSRS. Later same-day correction/extra is practiceN with empty scheduler_rating. The pure mathematical replay utility supports same-day transitions for testing; application integration uses replayQualifiedCard. This is curriculum workload policy, not an algorithm limitation.
- UUID append-only dedup; strict monotonic review times, explicit error on time travel. Stable sorts never silently alter source order.
- Reviewer timestamps retain exact instants. User-facing daily selection usesAsia/Seoul when a day boundary is needed; mathematical elapsed time is not rounded by UI day.

## Before enabling persistence
Validate against actual content/card schema, private owner-backed test copy, offline unsent UUID queue, idempotent append-only endpoint, backup/restore, and unchanged legacy headers. These are implementation gates, not reasons to stop independent code/test work. No original events are replaced with computed FSRS state. Suspended kanji QA stays suspended.

## Sources (read2026-10-27)
https://docs.ankiweb.net/studying.html
https://docs.ankiweb.net/deck-options.html
https://github.com/open-spaced-repetition/fsrs4anki/blob/main/docs/tutorial.md
https://raw.githubusercontent.com/open-spaced-repetition/ts-fsrs/v5.4.2/package.json
https://raw.githubusercontent.com/open-spaced-repetition/ts-fsrs/v5.4.2/README.md
https://open-spaced-repetition.github.io/ts-fsrs/guide/model/
Current website includes newer-model API material; pinned stable package/source owns implementation semantics.

## Append-only DB schema alignment
Preserve rating_1to4 as performance. Append scheduler_rating immediately after counts_for_schedule, enum Again/Hard/Good/Easy. Noneligible counts_for_schedule=N means scheduler_rating empty, never a skip enum. qualifyScheduleRows emits only this derived projection plus review ID/reason, not a replacement DB row. Full actual DB header/fingerprint still awaits owner confirmation.

## Speaking-core guard and transport harness
Automatic due selection waits until at least one actual speaking exchange, unless the user explicitly selects review. It remains one optional cue in the existing review/reading turn and never extends the chosen session. No automatic due selection is installed in hosted app yet.

A pure owner-endpoint transport harness exists, disabled by default, with origin/signature-owner callback/body cap/schema/enum checks, formula-like rejection, atomic UUID append callback and exact committed-row acknowledgement. It has no registered HTTP route, no live identity/DB backend and no browser persistence. Synthetic arrays/JSON tests do not satisfy real owner-backed testcopy+append-prefix+restore requirements.

## Owner-backed TEST copy evidence and remaining projection gates
DBowner reported actual private testcopy with5synthetic rows, all6tabs A1:Z300 compared, restorepoint and restored NEWcopy matching header-only review hashc6288a6cf8f2/headerb03a90468e79. This is copy-to-new-file value recovery, not in-place recovery, scheduledbackup or fullaccountloss. Validation/protection/formulas/gridmetadata not inspected. Actual API append input mode RAWvsUSER_ENTERED not confirmed. Direct API can bypass UI validation. None of this proves atomicUUIDdedup.

Current test boundary explicitly validates rule/self/model/pending, normal/extra/correction, rating1-4/empty andY/N, numeric-string normalization only at knownnumericcolumns. Hard/Easy require explicitselfsource. ActualSQLite atomicUUIDledger tested locally, NOTCloudflare orSheet endpoint. Synthetic projector is fixed-target+TESTprefix+source/note guarded, RAW-required callback, header/readback reconciliation on timeout, conflicting/duplicate existing UUID stop. Needs serialized per-owner durable worker and persisted uncertain projection status before any real retry. Ledger acceptance is separate from Sheet projection. No route/backend enabled.

2026-10-27 09:52 bounded native projection gate completed: DBowner executed exact r2fixture appendCells explicittyped userEnteredValues in fresh privatecopy, reconciled5UUID exactlyonce without secondappend after simulatedlostack, read-only conflictcandidate rejected, copied preappendrestorepoint to NEWfile and compared6tabsvaluehash. Builder independently read r2A1:M300 and confirmed5canonicalmatches/header; restoredcopy headeronly. D/I sent numberValue but reader returns strings, not storedtypeproof. Gridmetadata/fidelity uninspected, no remoteatomicity/concurrency/realnetworkfault/learnerwrite proof. Next real integration blocker: existingWorker has no authorized server-sideSheets credential/route; browserGoogleIDtoken verifies identity only. Do not widenOAuth/share serviceaccount or export nativeOAuth tokens implicitly. Facequality/physicaliPhone/audio acceptance remain separate blocked outcomes. No more identicalfixture churn.
