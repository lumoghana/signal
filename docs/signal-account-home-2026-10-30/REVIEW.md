# Signal account Home and Lux

The team reported that Lux looked unsettling and Home felt like ecommerce. This revision keeps Signal's lime, black type, wordmark and folded-L character while putting the account first. Scope is Home layout and Lux's expression throughout Signal. This is not a change to any financial controller or another edition.

## Preserve

Available minus actual planned costs remains Left after plan. Money Boxes remain separate. The existing money IDs, private-value reserve, eye control, factual conversation, Add money/Pay/Collect handlers, budget/date actions, three-item navigation, task retention and simulation disclosures remain authoritative. No expected income is counted as available. No new financial values, statuses, routes or promises are introduced. Monochrome is untouched.

## Layout decisions

1. The large lime character banner becomes a full-width typographic balance overview. The available/planned breakdown and budget/date actions stay adjacent. Lime marks the balance label instead of filling the account surface.
2. The action tiles become compact labelled circles. Money Boxes and Money Story become full-width factual rows. The existing contextual insight stays on Home, with a single smaller Lux and plain text instead of a speech bubble.

References inspected are iOS examples. [Revolut](https://mobbin.com/screens/dad40228-042e-4bff-abf4-6c8cee4d9bcb) shows a balance followed by compact money actions and account information rows. [Monzo](https://mobbin.com/screens/6c2bac17-2f8f-468d-bc8f-c77b4cf7ea5b) shows a compact account balance/action area above factual rows. Their hierarchy informs this revision; their colours, typography, navigation, data and wording do not. N26's onboarding cards and Kit's large card illustration were inspected and not used.

Lux's expression is an original brand adjustment based on the team's feedback, rather than a borrowed product mascot. The same folded lime L now has balanced brows, visible eye highlights and a small closed smile. The ordinary pose has its arm down; Pause retains the five-finger forward palm. No character enters the account's primary number area.

## Source and assets

- `dist/signal-account-home.css` is last in the canonical stylesheet entry and is scoped to Home under both `#view` and `#task-parent-view`.
- `signal-edition.js` removes only the decorative hero Lux and changes presentation asset paths. Its native handlers and financial reads are unchanged. The account/planning/payment presentation adapters use the warm sibling asset.
- `dist/assets/signal/lux-welcome-warm.webp`: 563 by 640, transparent.
- `dist/assets/signal/lux-pause-warm.webp`: 627 by 640, transparent.
- `dist/assets/signal/lux-icon-warm.webp`: 640 by 640, transparent square padding for the manifest, loading screen and icons.
- Original Lux images remain unchanged. The public asset cache includes the revised images. The build remains deterministic, with 112 scripts and 88 stylesheets.

Assets were created with the built-in image generation tool, using the previous cutouts as references. Production optimisation only trimmed alpha margins, resized to a 640-pixel maximum edge, encoded WebP and padded the square icon. The character was not drawn or creatively edited with code.

### Generation briefs

Welcome: edit the same acid-lime folded lowercase-L Lux, preserving his identity. Use a compact upright body, balanced brows, warm eyes with tiny highlights, a modest closed smile and a relaxed lowered arm. Soft matte surface, restrained dimensional shading, front view, complete subject, transparent background. Avoid the former hollow eyes, single stern brow, looming pose, gloss, teeth, clothing, props and text. Read clearly at thumbnail size.

Pause: use the new Welcome expression/body as the identity reference and the original Pause image only as the gesture reference. Preserve the warm face and upright folded L. Raise one hand beside the face with the palm forward and five rounded fingers including the thumb. Keep the face and palm separate, with transparent margin and no text, props or background.

## Browser evidence

`before.png` and `after.png` are exact crops from cloud-browser screenshots of the actual shipped app inside the same 390 by 844 iframe, using identical isolated sample account facts. The crops include narrow surrounding margins so comparison callouts do not cover content. `home.png` is the same final capture cropped to the phone. No generated image or recreated interface substitutes for the actual app screenshots.

Baseline source is commit `10e4875a5da06b2e06437b765749fc4f36999063`. The local fixture stages this exact prior bundle and styles alongside the current build. Local storage is replaced with memory-only sample state, and the fixture never loads customer records. The fixture and every `dist/__*` file are removed before publication.

The self-contained `comparison.html` embeds both actual screenshots and the measured callout rectangles. A full-page board screenshot failed in the cloud browser's screenshot protocol, so the HTML comparison is provided instead. Actual Home screenshot capture succeeded.

Observed browser results:

- 390 by 844 ordinary sample: document width 390; view client/scroll height 752/752.
- 375 by 667 ordinary sample after compact spacing correction: document width 375; view client/scroll height 587/587.
- GH₵3,000 after plan with GH₵5,000 available and GH₵2,000 planned: one readable primary amount, no horizontal overflow; 375 by 667 view fits.
- Shown/hidden primary value at that state: identical bounds 343 by 67.671875 at x16/y121.1875. Hidden money markup contains none of the sample raw values.
- 320-pixel phone with 200% text and a wide balance: document/app width 320, no horizontally out-of-bounds visible elements; content scrolls vertically, view client/scroll 606/1485.
- A ten-digit sample balance stays within the phone, with the available amount wrapping visibly rather than clipping.
- No-plan/no-box state retains Create your budget and Create a Money Box.
- Home Pay opens the native Payments root; Add money opens the native retained task and Close returns to the revised Home. The warm art is visible on the Payments root.

## Automated verification

The required edition regression gate, focused updated-art assertions, deterministic asset check and final publication provenance are recorded below after completion. Exact asset assertions are updated only where Signal intentionally changes from the old Pause cutout to the warm sibling. All native timing, review, cancellation and separate-authentication assertions remain intact.

The final required command `taskset -c 0-2 node scripts/check-edition-parity.cjs --regression` passed all 533 tests, with zero failures, cancellations or skips (337.72 seconds). The first run exposed only old exact Signal Pause asset expectations; those four conditional expected paths were updated, without changing any behavioral assertion, and the complete required command was rerun successfully.

Final cleaned-tree checks also passed: 31 of 31 focused Signal/assets/title tests (12.45 seconds), all eight local edition contracts, `build-release --check`, and `git diff --check`. No `dist/__*` QA file remains. The optional external-peer checkout comparison was unavailable; local pinned shared-source hashes and outcome checks passed.

Final production bundles:

- JS `/lumo-runtime.00075a769349.js`, SHA-256 `00075a7693491d587b8071f0a9d01de765aab19f46f1d58cd3008dc75ef0abd3`.
- CSS `/lumo-ui.99239ae58c6c.css`, SHA-256 `99239ae58c6c02e7d5f8f4b393017cb5ed1888c66c37afd133800183fcd5d4cc`.
- 29 public cache assets, 5,125,132 bytes; cache version `994beb373a498d2ad469`.
- Native public Signal identity preserved: `appgprj_6ae4c14e9d0081918bcf070bbf2a73a8`, `https://lumo-signal.oness15.chatgpt.site`.
