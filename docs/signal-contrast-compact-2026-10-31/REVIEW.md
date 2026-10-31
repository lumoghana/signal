# Signal record contrast and compact layouts · 31 October 2026

The recorded-balance review displayed a white amount and pale label on a pale card. The user asked to correct the contrast and choose a layout without scrolling when the content comfortably fits.

## Readable record cards

The shared money-life component began with a dark background, white amount and an explicit pale label. Signal's recorded-balance working cards changed the background to `#eeede7` without changing those foregrounds. White on that surface is about 1.17:1; the old `#d2d2d2` label is about 1.29:1.

The existing Signal planning stylesheet now pairs those light surfaces with ink amounts (`#0d1510`, about 15.8:1) and muted labels (`#62685f`, about 4.89:1). Currency and cents inherit the amount's foreground. The same repair covers recorded-source removal and the light IOU review/detail/payment cards whose labels inherited the old pale colour. All Your Money and recovery keep their dark financial anchors. This does not make expected IOU income available to spend or change a manually recorded balance into Lumo funds.

## Compact pages

Money-life forms now use an 8px grid gap and zero field margins, instead of stacking grid gaps with separate margins. Inputs and primary form buttons retain a 48px minimum height and 11px vertical padding. Working forms use 12px vertical page padding; other money-life working pages use16px. Review panels use tighter money-card padding, facts, notes, action gaps and boundary spacing. The task body's redundant legacy navigation block contributes no extra space, and an empty error outlet has no margin; the native page header and accessible error behavior remain intact.

Closed All Your Money disclosures use less padding while retaining their existing 44px summary targets. Its dark anchor has a 112px minimum height. Profile uses a 44px monogram, 16px card padding, tighter factual rows and a 10px flow gap. Payment review keeps Continue across the full width, then places Edit and Cancel on one row where they fit. Its title, factual receipt rows and consequence margins are also tighter. Controls retain at least44px targets and wrap or stack on narrower or enlarged layouts.

The goal is a complete readable screen when there is enough space. Content is not removed to meet a height target. Long records, longer names, larger text and reduced keyboard space retain natural vertical scrolling. Home and the recently added global navigation are unchanged.

## Populated-state audit coverage

The earlier 217-route sweep reached the recorded-balance route without preparing its source draft, so the view displayed its unavailable-record branch. That was route coverage rather than coverage of the populated review shown by the user.

`tests/manual-layout/signal-money-life-fixtures.js` now prepares 21 standard money-life routes through the native engines and UI. It creates actual IOUs, a manual repayment, a recorded MTN balance of GH₵300, a confirmed incoming receipt and recovery drafts as required by each screen. Home, Pay, Menu, payment review, Pause and authorisation keep their existing independent fixtures. The canonical registry and all unrelated variants remain unchanged.

The wrapper records actual render history and populated-state facts. It reports an error for an unexpected route, an unavailable record or a missing expected money card. The staging helper loads it after the existing fixtures and removes its temporary output during cleanup.

## Verification

The native fixture check passed **21/21 populated routes**, with zero errors or unavailable-record fallbacks. The overflow-only registry stayed at 399 scenarios before and after installing the wrapper, and Home passed through unchanged. The additional canonical staging scenarios are preserved separately.

The final regression gate passed **572/572 tests**, with no failures or skipped test cases. The edition contract passed its pinned shared baseline and financial-journey checks. A separate peer-checkout comparison was unavailable; no other edition was edited.

The managed browser reviewed **219 prepared layouts across all217 registered views**, including the21 newly populated money-life routes. There were zero setup, contrast, font, geometry or navigation findings. See [populated route audit](populated-audit.json) and [regression log](regression.log).

The final size checks confirmed no scrolling for the recorded-balance form at390 × 844, the recorded-balance review at390 × 844 and375 × 667, payment review at390 × 844 and Profile at390 × 844 with its optional guidance closed. The small-phone MTN review has a532px view and532px scroll height; the regular-phone examples each have709px view and scroll height. A longer wallet name with GH₵999,999.99 also fits the regular phone. At320 × 568 with200% text and at390 × 480 keyboard height, long content scrolls naturally with no clipping or unreachable controls. All eight [size checks](size-checks.json) had zero geometry findings. See the actual [375px review](review-375.png) and [uncropped browser capture](review-browser.jpg).

Final deterministic build verification passed after fixture cleanup.

The release uses `lumo-ui.718efe9f0c56.css`; JavaScript remains byte-identical at `lumo-runtime.fdb965750ba3.js`. Financial, authentication, persistence, navigation, QR and Pause rules, Home and Monochrome remain unchanged. Browser checks are diagnostic, not a WCAG certification or evidence of live provider behavior.

Run `node scripts/build-release.cjs --check` and `node scripts/check-edition-parity.cjs --regression`. Stage the Signal browser audit with `node tests/manual-layout/signal-experience-stage.cjs`; change fixture and viewport controls sequentially. Clean with the same helper plus `--clean`, and remove all staged `dist/__*` assets before publication.
