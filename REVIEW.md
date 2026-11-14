# Current application spec and code review brief
Date:2026-10-26. Review build, not launched.

## Scope and launch gates
Personal-only beginner Japanese avatar voice practice. Public source is allowed, keys and learning records are not public. Cycle1 is an isolated technical proof, not the final curriculum/product. No Sheets backend, persistent transcripts, progress syncing, raw media retention, accounts or purchases. Do not conflate UI text with a verified speech behavior.

Launch requires all of: deployment access solved; actual deployed page verified; independent review findings triaged; user's own-device audio test passes; privacy/key model accepted for personal use. No automatic recurring lessons resume just because code builds.

## Current implementation contract
- TypeScript/Vite vanilla UI, desktop and mobile; GitHub Actions Pages workflow prepared but not run.
- @google/genai2.31.0; official model documentation checked:gemini-3.8-live. AUDIO only; input/output transcriptions; auto VAD; START_OF_ACTIVITY_INTERRUPTS. No unsupported thinking/proactiveAudio options.
- Initial convenience-store question; brief Korean confirmation; stop and await next input. Prompt/data runtime fetch from separate files.
- getUserMedia → AudioWorklet sample-rate conversion → little-endian PCM16mono16kHz,32ms. Echo cancellation/noise suppression. One real-time input stream, no camera.
- TalkingHead owns output queue and lip animation; output24kHzPCM, energy-based jawOpen approximation. Its streamInterrupt flushes playback/animation on interrupted message. Turn completion signals streamNotifyEnd. Reconnection is explicit via start button,14-minute notice/15-minute close.
- API key memory-only default. Optional localStorage is opt-in and has always-visible deletion. Ending session clears unsaved input. Delete also ends active connection. No application logging, analytics, key build variable or key file. .env.local ignored.
- Local input/output transcripts are ephemeral DOM text. No automated correctness scoring or pronunciation claims.

## Changes from earlier design
- The previous multi-turn generic prompt is narrowed to the successful one-question/short-feedback pattern. A new question requires the learner to ask for next.
- MPFB avatar bundled locally because CDN sample GLB returned404; CC0 asset selected deliberately. TalkingHead code/Three.js CDN versions pinned.
- No assumption that API access is free because consumer Gemini subscription is paid. User project quota/billing must be checked.
- Apps Script shared-header401 design is not included or endorsed. Future Cycle2 must verify actual Apps Script event/header and status-code support or select another authenticated backend before any private records are connected.
- Friendly stylized avatar target remains unmet; current CC0 human sample is a visual test fixture.

## Evidence available
1. `npm run build`:passes tsc and Vite production build.
2. `npm test`:four tests pass:exact8-expression schema; prompt constraints; worklet32ms packets at44.1/48kHz; interruption hook/no app logging.
3. Local Chrome:desktop1100x950 and mobile390x1100:actual3D renders, key input visible, no horizontal overflow. Key default=no localStorage; opt-in save works; delete clears.
4. Fake-device microphone + mocked Gemini WebSocket:SDK sends setup with model, first-turn request,32msPCM audio; simulated response text renders; simulated interrupted event runs stop path. Not a live Google call.

## Not established
- Google API key validity/quota/price for this project; real Live model access.
- Real iPhone/Safari mic, speaker routing, permissions, reconnection and mobile background behavior.
- First spoken question within30s; real Korean feedback; no extra model suggestions.
- Audible quality, lip sync, actual <=1s interruption end-to-end.
- Deployed Pages subpath loading/workflow completion.
- Final curriculum, persistence or release quality.

## Review focus
Please inspect source for mic/session cleanup races, stale callbacks after stop/restart, byte-order/resampling quality, TalkingHead timing/reuse, interruption queue flush, Safari AudioContext requirements, key lifecycle/leaks (including dependency logs/network errors), CDN supply chain, dependency lockfile/workflow permissions, XSS in transcript rendering, truthful UX/errors and scope gaps. Propose actionable defects with file/line references, severity, reproduction and tests. Do not include an API key in your review or paste private conversation into public issues.
