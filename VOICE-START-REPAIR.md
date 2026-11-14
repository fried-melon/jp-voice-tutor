# Voice-start investigation and repair, October 27, 2026

The old failed request's response is still unknown, but useful investigation found and removed a real startup-order risk. The shipped app waited for token networking before creating/resuming the microphone AudioContext. The repair prepares both audio contexts during the Start tap while deferring microphone permission/capture until authentication succeeds. It is deployed with the voice gate closed. This is not proof that the user's iPhone failure was caused by this risk, or that voice now works.

## Current deployed change
- Active Worker4b61b02c-e2c4-4849-b2a1-b7e6e185549f,100%.
- Frontend capture preparation and safe stage markers (owner_token/microphone/playback/websocket); no raw tokens/provider reasons/recording in diagnostics.
- Exact previously recovered backend preserved, no limits/auth/scope/billing change.
- Voice503not_configured; no-proof owner401sign_in_required verified.
- Local strict-activation model: old code times out; repaired code succeeds and requests no microphone before auth. Actual Chromium verifies both resumes happen in tap activation and delayed failed auth causes zero microphone requests. Not physicalSafari acceptance.

## Optional push-to-talk
User explicitly allowed investigation of one utterance at a time. Prefer manualVAD activityStart on press/activityEnd on release, with client playback interruption. Current token server constrains automaticVAD, so fallback needs a validated mode in server setup. An isolated transport contract has been tested offline but is not connected/deployed. It reduces duplex/echo/turn-boundary complexity; it does not bypass authentication, quota or initial microphone authorization. Do not sell it as the fix for an unknown401/429/502.

## Evidence limits and next smallest diagnostic
Official Google guides conflict between v1alpha and v1beta ephemeral sockets. Previous actual v1beta setup/audio worked; no automatic protocol switch or new probe performed. PCM16 formats,32ms packets and interruption flush align official guidance.

Next arranged owner step: confirm willingness for identity-only owner-check while voice remains closed, anticipating any Google confirmation. If that passes, agree one bounded2-minute nonsensitive voice test and closure, with only stage/status and heard/echo/stop result shared. A provider-only synthetic probe could separate provider availability from device problems, but it is another scoped external call requiring coordination, not automatic permission. Never ask repeated login in a loop.

## Sources
See sources.md for exact officialGoogle/MDN/WebKit URLs and conflicts. Main ones: https://ai.google.dev/gemini-api/docs/live-api/capabilities ; https://ai.google.dev/api/live ; https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices ; https://bugs.webkit.org/show_bug.cgi?id=180522 .
