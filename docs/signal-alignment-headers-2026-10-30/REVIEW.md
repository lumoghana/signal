# Signal alignment and page chrome

The user identified misalignment at GH₵3,000, quote overlap with the smaller Lux, and redundant page-name headings.

## Changes

The wide neutral privacy reserve can wrap while the real amount fits one line. Centring the actual data-private-value grid item within that reserve aligns its visible row with Lux, while retaining the existing privacy geometry and neutral sizing. No amounts, calculations, handlers or private markup are rewritten.

The buddy now has a 96px character column,12px gap,92px unrotated artwork and a 6px bubble tail. This leaves 8px clear between the artwork and tail. Outer padding and contained decoration keep Lux inside the rounded card. Compact mode has 80/76px column/artwork,10px gap and6px clearance. The native whole-card Chat button is unchanged, with a visible parent focus outline.

signal-page-chrome.css hides page-name chrome visually, retaining accessible headings, task labels and native Back/Close/help/QR/profile controls. Generic repeated page names lose their unused spacing and decorative title stamps. Meaningful hero questions, onboarding, Pause consequences, financial figures, section labels, named records and result/error instructions remain. The final QR template explicitly reserves44px controls, including the legacy narrow-screen cascade.

Only edition presentation CSS and the style entry change. The JS bundle remains82ab86f1f228; Monochrome and all financial/authentication/Pause/group/persistence controllers are unchanged.

## Verification

The full exact manifest gate passed 533/533 tests with zero failures/cancellations/skips in 278.72 seconds, using three CPUs. Eight edition/source contracts and deterministic build checks passed. The final narrow QR template qualifier receives the focused Signal/platform/title checks and a final build check after the source-owned QA fixture is removed.

Final bundle verification completed against `lumo-runtime.82ab86f1f228.js` and `lumo-ui.bff96b76f374.css`: the focused Signal, platform-assets and title suites passed **31/31 tests**, with zero failures, cancellations or skips. All eight local edition contracts passed again; the optional peer-checkout comparison was skipped because no peer checkout was available, while the pinned local baseline was checked. `node scripts/build-release.cjs --check` passed for all 112 scripts and 87 stylesheets, and no `dist/__*` QA fixtures remained. These are automated and source checks, not fresh rendered visual verification.

Read-only DOM review checked the listed generic-heading families: collapsed containers contain only heading/art or retained support text, with no button, link, field or form lost. All native controls and ARIA remain in the DOM.

Fresh browser QA could not be completed: both the attempted preview opening and a subsequent browser state request timed out at the browser service after 300 seconds. The preview daemon remained healthy. No alternate browser driver was used, and no new screenshot is presented as verified. The supplied user screenshot and source inspection establish the wrapped-reserve and painted-bound overlap causes; post-change visual geometry remains a verification limit.
