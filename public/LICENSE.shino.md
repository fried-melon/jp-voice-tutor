# Sendagaya Shino avatar

This adapter uses the alpha-era Sendagaya Shino sample by VRoid Project, obtained from the OpenGameArt CC0 collection submitted by hecko. It does not use the current VRoid Hub model or the separately licensed AvatarSample A-C models.

Sources checked on 2026-11-17:
- Collection and CC0 designation: https://opengameart.org/content/vroid-studio-cc0-models
- Original VRoid FAQ distinguishing CC0 samples from separately licensed samples: https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use
- Archive: https://opengameart.org/sites/default/files/sendagaya_shino.zip
- Archive SHA-256: ff85ff42c1d041fd66dabdb36761a98557d7b55199f635769f3698a41c0a3696

The conversion renames existing bones and morph targets, exposes the morph names at mesh level, and removes the VRM extension metadata for plain glTF loading. Geometry and textures remain in the source asset. The runtime adapter changes the coordinate basis and bind frames while keeping bone positions fixed. Real finger bones are used, not substitute joints.

The small reference JSON records bind frames and bone positions derived from the TalkingHead MPFB CC0 fixture at pinned upstream revision 46b32ee539c41eb7c6b41fcfc74ae030d1b800a7, with SHA-256 63c645a2a863b9972e9a9c2ed576a1de4c390b8475508e1473e69c87a3ee299c. TalkingHead and three.js retain their existing MIT license notices.

This file documents the optional Shino asset only. It does not mean the deployed app has switched avatars.
