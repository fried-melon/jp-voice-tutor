# Mocked-transport lifecycle harness (2026-11-02)

Verifies the REAL client session lifecycle without Gemini provider calls.

## Setup
1. Build the client with avatar-only env (token service disabled branch):
   `VITE_AVATAR_PREVIEW=true VITE_INITIAL_2D_FACE=true npx vite build --outDir dist-harness --emptyOutDir`
   (dev server also works but renders unstyled: the app CSP style-src 'self' blocks vite's inline dev styles)
2. Serve statically: `python3 -m http.server 8090 --directory dist-harness` (needs a public tunnel for the cloud browser; on a local machine just open localhost:8090)
3. In the page console (or via cloud_browser execute-js): run `live-mock-stubs.js` — installs a FakeWebSocket that answers the Live wire handshake (setup -> setupComplete, clientContent kickoff -> one silent inlineData turn + outputTranscription chunks + turnComplete) and a silent getUserMedia. The second block patches FakeWS.prototype.send to answer the first realtimeInput with an inputTranscription + one model turn.
4. Type `auth_tokens/harness` into the key field (allowed on non-localhost by the auth_tokens/ prefix rule) and click 연습 시작 with a REAL trusted click (untrusted el.click() fails AudioContext.resume -> startup_microphone).

## Verified 2026-11-02 (cloud browser, built client)
- Real start flow: guide intro entry added by the real onOpen path; extend button "2분 더 (최대 5분)" shown; 15s first-output watchdog cleared by the first inlineData part.
- Real onMessage: outputTranscription chunks merged into one <p> via the append flag; inputTranscription rendered as 내 말(인식); auto-scroll keeps the latest entry visible (lastVisible=true at 240px scroll box).
- Real extend click: notice "직접 선택해 최대 5분에 종료해요...", extend hidden, lessonLimit -> 300.
- Real stop click -> real finish(): session-end "마지막 연결: [manual_stop] ... · 연습을 종료했어요. 대화 내용과 로그인 정보는 진단에 저장하지 않아요.", start becomes "다시 연습 ↗" re-enabled, stop disabled, transcript cleared, socket closed.
- NOT covered: real Gemini audio/voice content, duration_complete auto-finish, owner-token gated start path (needs the gate open).
