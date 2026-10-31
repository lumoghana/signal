# A recognisable Lumo

The user's billboard reference makes the supplied lime broken-ring face the central identity. This review covered setup/access, all main destinations, money tasks, collections, savings, account/support and feedback. The selected approach keeps one exact character in the same restrained monochrome system.

## What changed

- Welcome uses a bold avatar on black, matching the billboard's visual language. Startup and browser/install icons use the same identity.
- Home, Plan, Payments, Story and Cards use a compact avatar-and-wordmark lockup in their existing header row. Home's content, Ask Lumo campus scene, amounts and privacy geometry are preserved.
- Setup uses the existing Back/step/help row. Account ready has a larger welcome mark.
- Native tasks carry a small non-interactive brand signature beside the task title. The scrolling Menu has its own lockup.
- Chat's header and introductory greeting identify Lumo; assistant answers have a small attribution. Customer bubbles and profile initials retain their own identity.
- Money Story insights carry Lumo attribution. Virtual card branding uses the character instead of unrelated decorative rings. QR branding stays entirely outside the code and quiet zone.
- Help, empty planning/savings and feedback have restrained supporting placements. Pause's attribution identifies guidance, never an approval or financial result.

No financial engine, shared controller, authentication, saved-state namespace, payment rule, collection mandate or Savings Hack consent changed. All original functional controls and status symbols remain.

## Character rules

The original `brand/lumo-avatar.webp` is unchanged. Do not redraw, regenerate, recolour, mirror, stretch or add accessories. Use a centred square viewport that clips only the portrait's excess black background. The complete broken ring and face remain visible. The static character does not acquire another animation loop.

Sizes are 24px for attributions/task chrome, 28–32px for compact identity, 44–72px for Menu/help/Chat, and 112–190px for welcoming moments. Decorative faces have empty alt and are hidden from assistive technology; the combined root identity has `role="img"` and the name Lumo. Functional chat bubbles, back, QR, security and result icons remain meaningful controls.

Install assets are rasterisations of an SVG square viewport embedding the original supplied image, whose decoded RGBA pixels match the retained WebP. No generative reconstruction was used. SVG favicon embeds the 192px rendering; Apple gets a 180px PNG and the manifest gets 192/512px PNGs.

## Verification

The final runtime gate passed all 205 tests. All 297 browser scenarios passed across 2,376 responsive layouts; a separate 404-layout sweep passed at 200% text, with zero findings or setup errors. The final QR grouping additionally passed eight manual size/text checks after the sweep. Standard Home stays one screen at 375×667 (566px view and scroll height) and 390×844 (743px view and scroll height).

The review caught and corrected narrow setup-step wrapping and an 18.66px hide/show shift in extreme-value supporting balances at 150% text. The latter now uses neutral zero-glyph layout reserves, with no hidden raw money values. The already visually hidden Home greeting now carries the explicit sr-only class.

Full review evidence is recorded beside this file. The isolated browser harness uses sample data in memory, exercises all registered pages and key state variants, and checks palette, horizontal overflow, control reachability, clipped copy and privacy geometry. Camera capture is stubbed in the harness. Standard phone Home is checked separately for its one-screen fit.

This remains an interactive sample-money prototype. Brand consistency does not establish production banking readiness, device-specific camera compatibility, biometric security or measured student engagement.
