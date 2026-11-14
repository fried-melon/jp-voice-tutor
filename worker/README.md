# Owner token Worker
Local prototype, not a functioning production token service. Cloudflare Free account and a harmless HelloWorld shell now exist; this source has NOT replaced that shell. No live API key, Google OAuth client, owner subject, or privacy approval is configured.

Bundling requires jose and a text loader for Markdown. The separate scratch Wrangler 4.153.0 dry-run accepted wrangler.jsonc and its SQLite Durable Object binding/migration. That is a build check only, not a remote deployment, free-tier CPU measurement, or a successful Google call. Never treat a CLI upload estimate as remote acceptance.

Google RS256 JWKS are verified by jose/WebCrypto with exact issuer, audience, owner subject and expiry. SQLite DurableObject atomically reserves five attempts/day and a60second cooldown before minting; failed attempts count. Namespace identity comes from verified subject, never request body. Missing configuration or unknown privacy approval fails503.

Required configuration: APP_ORIGIN (exact HTTPS origin), GOOGLE_CLIENT_ID, OWNER_GOOGLE_SUB, API_PRIVACY_CONFIRMED=yes, encrypted GEMINI_API_KEY; SQLite DurableObject binding LIMITS to IssuanceLimit. Do not supply personal voice or real keys until project, data-use, quota and model checks pass. Rate count is not a spending cap. Remote token-lifetime and provider constraints still need validation. Production sign-in/nonce/session flow is incomplete.

Observability/invocation logs must stay disabled. Never log Authorization, token responses or provider bodies. Wrangler config disables observability and source-map upload. Deployment credentials belong outside this repository. Only request the scopes needed for this Worker, not default account-wide extras.

Cloudflare Free CPU10ms cold/warm must be measured on the actual platform. Local emulator wall time does not prove compliance. The35MBGLB exceeds the25MiBasset limit, so this route is backend-only until a separate frontend/asset/CORS plan is tested. No paid upgrade, billing activation, card, or domain purchase is authorized.
