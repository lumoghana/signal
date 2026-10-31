# Original Lumo avatar throughout Signal · 31 October 2026

The user asks to return to the original Lumo avatar used in Monochrome and keep it in 2D everywhere. This explicitly supersedes the earlier folded-L and glossy ring-Lux character directions, including Home's hollow 3D ring, floor light and small-ring contact shadow. The change applies to the independent Signal Site only. Monochrome, its source and its saved records are unchanged.

## Identity and coverage

The existing original `brand/lumo-avatar-icon-192.png` and `brand/lumo-avatar-icon-512.png` files are reused unchanged. This is the established broken lime ring with its black face and white expression, rather than a regenerated interpretation. Existing SVG and 180px icon siblings remain the favicon and Apple touch icon. The installed-app manifest now declares the original 192px and 512px PNG icons with their actual sizes and media type.

Signal's original-avatar-to-Lux rewriting has been removed. Native `mono-brand` therefore supplies the same established avatar throughout Welcome, onboarding, Menu, Chat's title and greeting, answer attribution, Money Story insights, virtual cards, personal QR identity, help and feedback. The Signal-owned Home balance hero and contextual buddy, ambassador introduction, planning/personal-money panels and funding/payment/card/collection artwork now use the original 512px icon as well. Native customer profile initials, customer identity, functional/status icons and the current Signal wordmark remain distinct and unchanged.

The source-owned loading screen, desktop identity, favicon, touch icon and manifest use the original brand assets. Offline shell generation retains those original identity files and removes eight obsolete Lux assets from the active precache set. The older images stay in the source archive as history; no current rendered character is meant to load them. The generated shell contains 22 public assets, approximately 4.64 MB, under the unchanged `lumo-signal-edition-v1` namespace. Updating the public static shell never imports or clears customer records.

## Flat presentation and Pause

The original images have circular presentation with no avatar drop shadow or box shadow. Home's simulated floor-light ellipses and buddy contact shadow are removed. The existing account hierarchy, card and action dimensions, truthful insight copy, amount formatting, privacy reserves and destination controls remain in place. Decorative attention marks can stay as flat graphic elements.

Pause now retains the native Monochrome 2D face and its separate SVG raised palm rather than substituting the 3D pause image. The native `data-pause-ring`, `data-money-slip` and hold controls stay in their original structure. The 900ms reveal, full three-second reading window, 90ms intentional hold, cancellation, editing and subsequent PIN/biometric approval remain authoritative. The illustration adds no payment authority and does not imply settlement or success.

This is an edition-owned identity and presentation change. Shared financial, authentication, privacy, persistence, QR, mandate, Savings Hack and timed Pause engines and baseline hashes are unchanged. No other edition is published or modified.

## Verification

The focused source and actual shipped-bundle checks passed **36/36**, with **34 additional Pause script checks**. The deterministic build check passed. These checks cover the original avatar references, icon and offline-shell contract, native identity attribution and the preserved Pause entry, timing and approval behavior.

The full manifest regression gate and the managed-browser **219-layout / 217-page avatar inventory** are **pending**. Final reports, screenshots, short-screen and enlarged-text observations and publication results must be added after those checks complete. The focused results alone do not establish browser fit, complete rendered coverage, accessibility certification or live provider behavior.

Candidate release identities:

- JavaScript: `lumo-runtime.d864e008eee5.js`, SHA-256 `d864e008eee5b984d8c9b45b579f4bc4694c5781e9731b838523e0625dcc43a5`.
- Stylesheet: `lumo-ui.afac6d043f39.css`, SHA-256 `afac6d043f393e19f386d0fdb9cd132c41d9f738f33c26def6f980f1c97dc565`.
- Offline shell version: `81a122b11c44d96d86dc`.

Relevant sources are the existing Signal presentation adapters and styles, `dist/index.html`, `dist/manifest.webmanifest` and `scripts/build-platform-assets.cjs`. Remove all staged `dist/__*` browser-audit files before packaging.
