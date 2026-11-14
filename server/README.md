# Token service prototype, not production
No real credentials/configuration are included. No Google call is part of tests.

- `token-service.mjs` is dependency-injected and covered by3mock tests.
- `dev-server.mjs` binds127.0.0.1:4318 only. Required server-only environment: GEMINI_API_KEY, GOOGLE_CLIENT_ID, OWNER_GOOGLE_SUB, APP_ORIGIN (exact HTTPS origin, no path), API_PRIVACY_CONFIRMED=yes. Never use VITE_ variables for secrets or commit an environment file.
- OWNER_GOOGLE_SUB must be established from verified owner sign-in, never copied from a browser request without signature verification. No email-name inference.
- POST `/api/live-token` with Google identity JWT in Authorization Bearer and JSON `{lessonId}`. Only configured owner can request a token. Browser inputs cannot select model, prompt, expiry or uses.
- Configure a same-origin HTTPS reverse proxy and real Google sign-in UI before integration. No CORS OPTIONS flow is implemented. Dev server is not a hosting recommendation.
- Current limits5issuances/UTCday,60s spacing and concurrent-request lock are process-memory prototype controls. They reset on restart, do not cover multiple instances, and are not a payment/total-spend cap. Production needs durable atomic limit storage, service/API quotas, secure secret storage, observability that redacts headers/tokens and provider response tests.
- Token expires6min, usable for one session begun within1min. App ends at3min or explicit5min. Provider enforcement of constraint/lifetime must be integration-tested before claiming server hard limits.
- No real OAuth verification, token mint or constrained WebSocket call has been tested. Host/OAuth/project setup needs explicit planned steps after independent code review and privacy/billing check. Do not request/paste real API keys in chat.

Official API and identity sources are in REMEDIATION.md. No vendor avatar keys or pay-per-minute sessions exist.
