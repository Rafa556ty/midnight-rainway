# Game rules

- Multi-part wheels are re-pivoted on one hub per corner by `poseWheelCorners` (cars in `SHARED_HUB_KEYS`), which also straightens the SVJ's pre-steered fronts; parts spinning on their own centres wobble.
- Owner-supplied playable GLBs are optimised offline (meshopt, 1024 px WebP, no palette/instancing so material names survive) before upload as CDN pointers.
- Revuelto is the owner-supplied 2024 model with its own textured cabin; its steering wheel is cut from the cabin mesh by the measured `REVUELTO_RIM` cylinder and its active wing is the separate paint piece split by `isolateRevuelto2024Wing`, lifted by pure `stepRevueltoWing` while accelerating.
- Cockpit glass is made clear at load by `glass.ts` (dielectric, faint tint, low opacity, duplicate inner shells removed); metallic/opaque glass mirrors the sky and hides the road.
- Revuelto's driver cluster and centre screen are canvas-textured planes from `revuelto-dash.ts`, redrawn ~20 fps from speed/gas; the GLB's own dash stays untouched.
