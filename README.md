# 작은 일본어: personal voice tutor (Cycle 1, review build)

A personal Japanese convenience-store voice practice app. Public source contains no account keys or private learning records. Not production-ready and not a completed launch.

## Run locally
Node.js 22+:
```
npm ci
node scripts/restore-avatar.mjs # only if avatar.glb is absent (small review ZIP)
npm test
npm run dev
```
Open Vite's localhost URL. Generate a Gemini API key in Google AI Studio yourself and enter it only in the app's password field. Never send a key in chat, commits, issues or reviews. No key is needed to build. `.env.local` is ignored, but this app intentionally does not read keys from build-time environment variables.

## Key handling and privacy
- Default: memory only. Closing the page or ending a session clears the input. Every new session needs a key unless storage is explicitly enabled.
- Optional "이 기기에 저장" stores the key unencrypted in this origin's localStorage. Use a private device only. "키 삭제" clears memory/storage and disconnects an active session.
- Do not share your key or private conversation. No key is embedded in source, HTML or build configuration. No application console logging or analytics.
- Microphone audio is transmitted to Google's Gemini API. Input/output text transcriptions are displayed in page memory only. No camera, raw audio/video retention, learning database or backend in Cycle 1.
- Gemini quotas, billing and data-use terms apply to your project. A paid Gemini consumer subscription does not prove API credit or free use. Review your project billing before connecting.
- Public static source is not a secure hosted production service. Standard-key browser access is for a personal experiment. A shared/multi-user production version requires an authenticated server issuing short-lived Live API tokens. No proxy or such server is included.
- Third-party CDN code executes in the page. TalkingHead and Three.js are pinned, but external supply-chain risk remains. Prefer self-hosting audited copies for a stronger boundary. Never use a valuable unrestricted production key here.

## Stack
Vanilla TypeScript + Vite + @google/genai. `gemini-3.8-live`, AUDIO modality, automatic VAD, output/input transcription. Microphone AudioWorklet sends PCM16 mono16kHz,512-sample32ms chunks. Gemini output is24kHzPCM played by TalkingHead's streaming worklet, with energy-driven jaw blendshapes. The output queue belongs solely to TalkingHead. `serverContent.interrupted` calls `streamInterrupt()` to flush it; session end calls `streamStop()`.

TalkingHead CDN revision: `46b32ee539c41eb7c6b41fcfc74ae030d1b800a7`, MIT. Three.js0.186.0, MIT. Bundled `public/avatar.glb`: upstream MPFB example, CC0. An original geometric shop mascot now replaces the visible human mesh, using the CC0 skeleton as a hidden animation driver. No Duolingo artwork or character IP is used. Actual audible lip quality remains unverified. Do not assume all upstream sample avatars are MIT; some are non-commercial only.

## Editable content
- `prompts/tutor-ja.md`: runtime prompt, one question at a time, short Korean feedback, no extra suggestions, wait after an answer.
- `content/expressions.json`: eight exact spec seeds; fixed expressionDB fields. No personal progress.
- `npm run sync-content` copies these into Vite's public directory. Dev/build do this automatically. Rebuild/redeploy after edits. No TypeScript change required.
- Cycle2 (Sheets/log persistence), curriculum and real account progress are deliberately absent.

## Deployment (not yet performed)
`.github/workflows/deploy.yml` builds main and uploads a Pages artifact. In a user-approved public GitHub repo set Pages Source to GitHub Actions. No secrets are required in repository settings. Relative Vite base works on a project subpath. Public source approval does not imply an open-source license choice: no project license is selected yet. Third-party licenses remain their own.

## Verification status
See `REVIEW.md`. Build, source/worklet tests and local visual checks pass. Mocked session tests cannot establish real microphone usability, model access, actual spoken language, sync or interruption latency. No public repo/Pages URL exists yet.

### Isolated scheduler checkpoint (2026-10-27 09:41)
Exact ts-fsrs5.4.2/FSRS6 supports currentNode22; beta6 Node24 requirement is not a stable-version blocker. Evidence adapter distinguishes original performance ratings from FSRS grades, skips technical/ASR/hint-before-attempt uncertainty, and never maps hint-success2 automatically toHard. Once-per-card/Seoul-day is a product inclusion policy, not a mathematical restriction. Read-only planner can select old due items from studied prior lessons inside one optional turn without resetting dates/debt. Exact append-only A-M schema fingerprintb03a90468e79 is tested. Offline UUID retry/exactack and synthetic testcopy snapshot roundtrip are tested only. No actual offline storage, owner review endpoint, live DB writes or production backup/restore are operational. See tests/SCHEDULER-CONTRACT.md.

### Initial face scope update (2026-10-27 10:01)
User relaxed initial face target: simple original Japanese-style character accepted as candidate. VITE_INITIAL_2D_FACE=true selects original vector shopclerk with blink and actual playback-envelope mouth opening; existing audio/hiddenrig remains. Synthetic real-worklet interruption/stop checks and390pxlayout inspected. Not Japanesephonemes/naturalvideo/physicaliPhoneproof. ExistingfictionalAIportrait available as static option; no unverifiedphotopuppet claim. See experiments/initial-face/README.md.
