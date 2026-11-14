# Owner session cookie — security contract (pre-deploy review)

## Purpose
Reduce repeated Google sign-in taps (user request: "귀찮게 매번 하는거 줄이기").
After one verified GIS login, the worker mints an HttpOnly signed cookie that
re-authenticates later visits without a fresh Google tap.

## Credential format
`version.sub.iat.expAbs.expIdle.sig` — HMAC-SHA256 over the fields, key in
Worker secret `SESSION_KEY` (32 random bytes, generated locally at deploy,
never in git/chat). Cookie attributes:
`HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=<absolute cap>`.
Payload carries no learner data — identity and expiry only.

## Accepted endpoints (exhaustive)
- `POST /api/live-token` (mint ephemeral Live token)
- `POST /api/owner-check` (identity diagnostic)
- `POST /api/session-logout` (clear this browser's cookie; no auth required, effect is self-only)
- `POST /api/session-revoke-all` (owner-authenticated global invalidation via the revocation floor)

Cookie auth is NOT accepted for: Sheets/TEST/GrantDO routes, `/api/review-events`,
or any future learner-history endpoint. Those stay Bearer-ID-token-only unless
separately re-reviewed. Worker test `worker-session-auth.test.mjs` proves the
cookie is rejected/ignored off-scope.

## Honest limits (what this does NOT do)
- **Replay:** a stolen cookie replays until expiry or global revocation. There is
  no per-session server-side revocation (stateless design; a revocation store
  would require new storage infra, which is out of scope).
- **Logout** clears the browser cookie only; it does not invalidate copies.
- **Global revocation (self-serve)** = "모든 기기에서 로그아웃" →
  `POST /api/session-revoke-all` (owner-authenticated) stores a not-before
  floor in the EXISTING LIMITS Durable Object (`session_meta` table, untouched
  by the `/reserve` rate-counter path and daily rollover). Every cookie with
  `iat <= floor` is rejected (`reason:'revoked'`); floor unreadable → 503
  fail-closed. `OWNER_SESSION_VERSION` bump remains as a second layer;
  `SESSION_KEY` rotation invalidates everything and rotates the HMAC key.
- **"No data access" scope note:** today the cookie only mints ephemeral Live
  tokens and answers owner-check. It never serves learner history/notes; notes
  stay local-only. If a future private-notes endpoint is proposed for cookie
  auth, that is a new review.

## Expiry model
- Absolute cap `expAbs`: 14 days from first mint. Hard cap — rolling renewal
  can never extend past it (tested).
- Inactivity window `expIdle`: 48 hours, renewed on use (at most once per
  window per cookie value; renewal hard-capped by `expAbs`).
- Rationale: the user practices daily ("매일 수업"), so 48h idle means a daily
  user almost never re-taps while a >2-day lapse costs one tap. 14d absolute
  bounds stolen-credential exposure to two weeks. Both values are
  `SESSION_DEFAULTS` in `shared/session-cookie.mjs`, changeable at deploy.

## Mitigations stack
- TLS-only (`Secure`), same-site only (`SameSite=Strict`) — cross-site requests
  never carry the cookie; additional exact-`Origin` check on every `/api` POST
  (403 `origin_denied`), POST-only methods, restricted preflight.
- `HttpOnly` — unreadable from JS, so XSS cannot exfiltrate the value; the
  client holds only a sentinel string (`cookie:owner-session`), which the
  worker's Bearer regex rejects, so the sentinel can never become an
  `Authorization` header.
- CSRF: state-changing acceptors are POST + JSON + Origin-checked + Strict
  cookie. Logout CSRF can force a logout only — no data or issuance effect.
- Owner binding: sub is captured from the verified GIS token at mint; verify
  re-checks `sub === OWNER_GOOGLE_SUB` (env). A cookie minted for anyone else
  fails closed.
- Quota unchanged: LIMITS (5/day, 60s spacing) is keyed by sub and applies to
  cookie-minted issuance exactly as to Bearer issuance.
- Gate unchanged: with `API_PRIVACY_CONFIRMED` unset the token route 503s for
  cookie and Bearer alike; no cookie can open the voice gate.

## Device-sharing assumption (assumption, not evidence)
A persistent cookie means anyone using this browser profile on this device can
start sessions until logout/expiry. This matches consumer session norms and the
user's fewer-taps preference, but the user's own-phone/shared-device situation
is NOT verified. Mitigations available: sign-out button (clears cookie),
48h idle expiry, global version bump on request.

## Deploy plan (only after review acceptance)
1. `wrangler secret put SESSION_KEY` (locally generated) and
   `wrangler secret put OWNER_SESSION_VERSION` = `1`.
2. Deploy worker with GrantDO excised (standard UI-deploy flow).
3. Verify: login sets cookie; reload silently resumes (owner-check 200 via
   cookie); sign-out clears (subsequent owner-check 401); gate still 503 when
   closed; Bearer login path unchanged.
4. Delete local token/secret files after deploy (standing rule).
