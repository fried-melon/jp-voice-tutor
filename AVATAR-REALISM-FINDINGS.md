# Realistic-face findings, 2026-11-03 (task-agent work log)

## Why the 2D flag is default (project history, NOT performance)
- README.md L27, L44-45 + experiments/initial-face/README.md: on 2026-10-27 Oliver relaxed the initial-face target to "simple original Japanese-style character or fictional AI portrait acceptable". VITE_INITIAL_2D_FACE=true = original vector shopclerk, blink + analyser-driven mouth. Chosen for IP safety (no copied character/person artwork), no new vendor/license, honest motion (no photo-puppet claims). Explicitly marked: not Japanese-phoneme lip-sync, not physical-iPhone proof.
- The bundled public/avatar.glb is the upstream TalkingHead MPFB demo character (CC0): young asian female + ponytail01 + female_casualsuit01 + mindfront-style brows/lashes. In-app it is the hidden animation driver; the 2D vector face is what users see.
- Also available: an earlier approved ORIGINAL fictional AI portrait (static only, no live animation claim).

## MPFB candidate build (build_avatar_v2.py, fully headless ~8s)
- Reproduces the production asset family: parity in the same-renderer comparison, working viseme_aa/blink deformation, correct alpha modes after fix.
- DEFECT (parent pixel review): eyes render white/blank (iris not visible) vs production's visible brown irises. Likely eye material/texture assignment or eye-mesh orientation in the headless load path. NOT fixed; bounded further effort per parent (existing asset may be the better baseline).
- Lighting washout: harness default TalkingHead lighting overexposes skin; preview needs corrected lighting/exposure.

## Route per parent 00:07
- Do NOT deploy candidate; do NOT claim photoreal done.
- Prepare REVERSIBLE 3D preview using the EXISTING production avatar.glb: build with VITE_INITIAL_2D_FACE=false, correct lighting/exposure + eye framing, capture desktop + 390px mobile pixels, performance note (27-36MB GLB + WebGL on phone), fallback proof (flag flip restores 2D instantly).
- Surface tradeoff honestly: realistic but generic TalkingHead demo face (CC0, not original IP) vs current original IP-safe vector clerk.

## Washout root cause found and fixed locally, 2026-11-07
- Defect (visible in current production config human3d + avatar-hosting-preview.glb): skin renders flat/over-bright, facial modeling lost. Documented 2026-11-03 as "lighting washout"; root cause now identified.
- NOT the app's light values: live A/B showed ambient 1.1->0.25 and direct 16->3 changed the render ~0 (face mean RGB 217 vs 218).
- NOT envMapIntensity: scaling all materials to 0.35 (showAvatar onpreprocess hook) also changed nothing visible; RoomEnvironment PMREM output is hot enough that 0.35x still dominates.
- CAUSE: TalkingHead sets scene.environment = PMREM(RoomEnvironment). That HDR image-based light dominates every MeshStandardMaterial and flattens the face.
- FIX (local, one line, src/avatar.ts human3d branch): this.head.scene.environment=null after showAvatar. Result: scene lights shape the face again; visible cheek/jaw modeling, natural skin tone, hair depth. Lights/exposure untouched (1.1/16, ACES exposure 1). No asset, vendor, or flag change; 2D fallback path untouched.
- Verification: before/after pixels desktop+390px mobile (SwiftShader caveat: not device proof), tests 226/226, guarded npm run build passes. NOT deployed.
- Remaining limits: not verified on a real phone/GPU; eyes still the MPFB demo character's; generic CC0 face tradeoff from 2026-11-03 stands; local GSI/CORS console errors are local-origin artifacts only.

## Lighting rebalance, 2026-11-07 (second local iteration)
- Parent pixel review of the env-removal fix: washout improved but face too dark with strong asymmetric shadow (single bluish key, ambient 1.1 / direct 16 0x8888aa, values tuned while the IBL dominated).
- With scene.environment=null the light values finally matter. Lab A/B (same page session, live mutation): L1 = ambient 2.2, direct 7, warm key 0xffe8d6 won: balanced warm skin, soft modeling, no overbrightening. Brighter fill (2.6/5) flattened further; harder key kept the shadow.
- Eye-material catchlight test (roughness 0.7->0.15 on Human.high-poly): no verifiable visible improvement at app render sizes, DROPPED. Eye artificiality is asset-level (MPFB demo eyes/brows); not fixable for free without an asset change, which stays unapproved.
- Framing: no defect found worth a change; camera untouched.
- Final diff vs 11-03 10:38 source: avatar.ts only (env-removal + light values + comments). Tests 226/226, guarded build passes. NOT deployed. SwiftShader pixels, not device proof.
