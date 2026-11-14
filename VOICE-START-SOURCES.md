# Sources checked October 27, 2026
- Google official Live capabilities: https://ai.google.dev/gemini-api/docs/live-api/capabilities . PCM16/16kHz input,24kHz output; automatic VAD; manual activityStart/activityEnd and no audioStreamEnd under manual mode. Primary.
- Google official websocket reference: https://ai.google.dev/api/live . Interrupted means clear playback; realtime input stream; activity signals allowed only with automaticVAD disabled. Primary.
- Google official best practices: https://ai.google.dev/gemini-api/docs/live-api/best-practices .20-40ms chunks; discard queue immediately on interruption. Primary.
- Google official ephemeral: https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens . Direct browser temporary auth; page says v1beta. Primary but conflicts next source.
- Google raw WebSocket guide: https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket.md.txt . Says constrained ephemeral v1alpha. Conflicting same-vendor documentation; shipped v1beta had prior actual success, no fresh probe.
- MDN WebAudio best practices: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices . Create/resume within user gesture. Developer documentation.
- WebKit180522: https://bugs.webkit.org/show_bug.cgi?id=180522 . Maintainer and developer evidence for gesture-restricted capture analysis; historical evidence, not current iPhone proof. Primary bug discussion/community.
- Google official example repository: https://github.com/google-gemini/gemini-live-api-examples/blob/main/gemini-live-ephemeral-tokens-websocket/frontend/geminilive.js . Current example v1alpha; source implementation, not acceptance test.
- MDN AudioContext state: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/state . Running/suspended/interrupted lifecycle. Developer documentation.
