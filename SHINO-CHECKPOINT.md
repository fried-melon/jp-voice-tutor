# B1 Shino checkpoint, 2026-11-17

Base: 7d2e3c7. This is local opt-in work, not a production deployment.

## Reproduce

```sh
npm ci
node scripts/restore-avatar.mjs
node scripts/restore-shino.mjs
node scripts/prepare-shino-harness.mjs
node tests/browser/shino-soak.mjs
```

The rebuild harness can regenerate the reference JSON from the pinned MPFB fixture:
`node tests/browser/shino-rebuild.mjs`.

App preview only: `VITE_FACE_MODE=human3d VITE_AVATAR_SHINO=true npx vite build --outDir dist-shino`.
This local command does not contain production auth settings and its output must never be deployed.
The default app behavior remains MPFB unless VITE_AVATAR_SHINO is exactly true.

## Verified locally

- 54 existing body/finger bones renamed, no substitute finger joints.
- Geometry basis conversion clones attributes before rotation, preventing shared-buffer double rotation.
- Anatomical swing correction accounts for the different authored bind poses.
- All descendant world transforms preserved during bind-frame alignment.
- Maximum bind-position drift about 1.2e-15.
- Animation clock advanced from 8465ms to 86178ms, no page exceptions.
- Mouth-open and eye-blink synthetic controls visually checked.
- App preview face crops visually checked at desktop and 390px mobile width.
- 247 unit tests pass, TypeScript check passes.

## Not verified or not finished

- No real voice-provider call or device audio test was run for this change.
- Production and the evening owner test still use the existing deployed avatar.
- The source bow accessory is hidden in the latest preview, leaving a neutral collared shirt and navy vest. The source skirt still exists outside the current upper-body crop. This is not a complete scene-specific wardrobe.
- The adapter was checked for roughly 90 seconds, not a full four-minute session.
- Full app viewport reviewed at 1280x800 and 390x844. Shino-only camera framing adjusted so the status card no longer covers the face.
- The new asset is optional; production deployment configuration, asset pins and final rollout are not changed.

See public/LICENSE.shino.md for source and license evidence. No audio/video or private account data is included.
