# Voice continuity checkpoint, October 28, 2026 00:03 KST

Deployment: 68678483-6a4a-45ef-9df1-7638b26fe8cd (100%). Hosted JS index-QFGLXZvj.js SHA256 333e378d5ba402549d1a03ad62170c6ec6e9bb6a8af606871b7ac9d696d9daac. Public voice mint remains503/not_configured. Owner login/strict identity validation unchanged.

## Implemented
- Finite allowlisted token-count display replaces raw nested usage JSON that overflowed a mobile screenshot.
- Realtime audio backlog greater than64KiB stops the session with network_audio_backlog, closes capture/socket/playback and clears transcript. No stale audio replay, reconnect, quota change or background exception.
- Safe prior end category/elapsed display retained.

## Actual verification
- Exactly two bounded free-tier provider connections on October27 23:53KST, about18s total. Fixed Japanese phrase synthesized in memory (1.120s), injected through browser MediaStream, captured/resampled by actual shipped worklet, sent as16kPCM and recognized by Gemini. Actual second-turn audio response and two playback starts; two completed turns. Scroll left socket open; Stop ended tracks and cleared transcript. No human microphone, stored audio or transcript artifact. This exercised raw-key server relay in a private local fixture, NOT hosted owner-constrained-token path.
- Local real-WebSocket/actual-worklet synthetic duplex first question, response, interruption and later response PASS. Sustained90 real seconds/2871PCM packets then40-second explicit test-clock advance verified2min timer cleanup. Not120s provider endurance.
- Local injected70KB socket backlog produces distinct end category and closes tracks/socket. Mobile actual pixels readable. Allowlisted usage fits mobile width.
-78unit checks and TypeScript/build pass. Hosted actual desktop pixels inspected, avatar ready and Start disabled. Hosted/local asset hashes match.

## What is not proved
Physical iPhone Safari speech input, echo/headphone differences, focus/scroll behavior, route interruptions and perceived audio quality. Prior actual user first audio is established but later disconnect cause/code remains unknown. WebKit local attempt could not launch due absent system libraries. No claim that backlog was the user's cause.

## Remaining acceptance path
Smallest owner-device test, only at an arranged time with bounded approval: same2min continuous lesson, one spoken answer without scrolling, observe real second response, then scroll once; if stopped, note safe end category+elapsed. Stop/background/mic-off also need actual-device confirmation. No fresh login push, provider call, quota reset or user retry scheduled at this checkpoint. Do not call the whole product accepted.

Sources checked:
https://ai.google.dev/api/live
https://ai.google.dev/gemini-api/docs/live-api/capabilities
https://ai.google.dev/gemini-api/docs/live-api/session-management
https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
Free-tier/no-billing state checked immediately before bounded requests:
https://aistudio.google.com/rate-limit?timeRange=last-28-days&project=gen-lang-client-0572170818
https://aistudio.google.com/billing
