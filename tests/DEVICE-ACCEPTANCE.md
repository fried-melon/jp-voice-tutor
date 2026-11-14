# Real-device acceptance checklist

Status: not run. Hosting/login checks, synthetic audio and fake-mic tests do not
satisfy this checklist. Run only after the owner approves the scoped API voice
privacy terms and the backend has real constrained-token verification.

## Preflight
- Confirm exact owner account, HTTPS address, deployed version and model.
- Confirm project is still unbilled Free Tier and current model quota.
- Confirm API key is server-only; no raw key input, browser storage or URL.
- Confirm server rejects wrong owner, wrong origin and expired ID token.
- Confirm one-use token rejects second connection and wrong model/instructions.
- Confirm per-owner issuance limit persists through deployment/restart.
- Review privacy notice before the first microphone capture. Do not record raw
  audio, network traces or screen contents containing tokens by default.

## Devices
Physical owner iPhone Safari is required, plus desktop Chrome as a baseline.
Check wired/Bluetooth earphones and phone speakers independently. Desktop
synthetic output is not iPhone audio routing proof.

## One bounded chosen 2-minute or 3-minute session per device/route
Use only the owner-approved nonsensitive Japanese test scenario. The page keeps
one question at a time; Korean clarification should be short. Do not ask for
names, addresses, health details or other personal facts.

Record version/device/browser/audio route and pass/fail observations only:
- Google login works without pasted credentials; no extra Workspace scopes.
- Start obtains valid constrained token before asking for the microphone.
- First audible Japanese question arrives; text matches what is heard.
- Avatar is visible while listening and speaking; no frozen or hidden face.
- Pronunciation and Japanese mouth shapes judged from actual audio/video.
- Reply in Japanese; tutor waits for completion and gives fitting response.
- Ask one brief Korean clarification; tutor explains then returns to Japanese.
- Interrupt audible output mid-sentence. Human observer times from physical
  speech onset to cessation of old playback. Required <=1 second. A server
  event timestamp or synthetic interruption cannot substitute.
- Speakers: no self-echo, repeated turns or false interruption from tutor voice.
- Background/lock screen ends capture and socket; returning does not send
  audio until a fresh explicit start.
- Network change Wi-Fi/LTE: truthful state, no duplicate lesson/socket or audio
  burst, safe stop or explicit reconnect.
- At chosen2 or3 minutes ends capture/playback unless owner selected an extension;
  any extension ends no later than5 minutes. No extra lesson silently begins.
- Finish/sign-out removes ID proof/token and transcript from app memory/UI.

## Release gate
A fail on capture privacy, token constraints, echo, timing, speech intelligibility,
face quality, iPhone routing or interruption blocks usable-tutor acceptance.
The user accepted simpler original Japanese-style character candidates for the initial version on2026-10-27. The original2D clerk is an initial amplitude-mouth visual, not cinematic3D or natural human video. It still needs real-device visual/audio acceptance.
Do not call a microphone permission dialog or a rendered face a completed test.
