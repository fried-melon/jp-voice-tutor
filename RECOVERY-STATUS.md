# Offline reconstruction checkpoint 0.3.0-recovery.2

This is a versioned reconstruction, not the original commit 3b9c46e and not a new deployed release. The unchanged deployed-artifact recovery and October 26 review baseline are preserved separately.

The exact owner-mode build now reproduces the deployed frontend HTML, JS and CSS byte-for-byte. JS SHA256: eab57de88a2285876839ee2af1abe6736d58bccf6acaf8c5af99fffaf80f7e23. CSS SHA256: 8c40ada8dfaf4081a37a1ea755fa80fd674ac2bb4eb5e224e0708a2888053bf2. This settles shipped frontend artifact equivalence for those build flags. It does not establish working voice, device acceptance, or the original failed Start response.

64 unit checks pass. Reconstructed backend and recovered deployed backend match six fail-closed/no-proof/origin/method/preflight response cases with all external network forbidden. No positive hosted owner sign-in or provider operation was performed.

Original git history and lockfile are missing. The package lock here is newly generated. Some original browser/worker fixtures remain incomplete. Backend byte equivalence has not been established. Original documentation can be stale and is retained as historical material only. The app was not redeployed. Voice gate remains closed.

Recovered from the old review baseline and individually reviewed later source writes. Historical shell programs were not replayed. No credentials, learner recordings, raw conversation logs or account values are included. No additional login, scopes, billing, quota changes or learner writes occurred.

Next external blocker remains separately arranged owner diagnostic evidence, not another automatic login retry. Stop treating offline test counts as physical voice acceptance.
