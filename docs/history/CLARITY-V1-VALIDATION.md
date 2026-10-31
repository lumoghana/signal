> Historical Clarity v1 merge validation. Current pass: docs/EXPRESSIVE-SHEET-VALIDATION.md.

# Lumo · Clarity Edition validation

Checked on 18 October 2026 against the independent project `appgprj_6ad4c822fe3881919757091e91e2ce9f`. This is a browser-local simulation, with no live verification, banking or payment services.

## Independent project and recovery

The functional checkpoint is campus v25, source `2c877ba0d90f8acf6341f0152e9a8246b08b3cc4`. The identity checkpoint is illustration-first v11, source `455165754b26b94b7c468d4fcbc6cf67d37c38e7`. Both remain recoverable in their original repositories. Source was copied to a new checkout with Git and hosting identity excluded; the new manifest contains only the new project ID. Both original checkouts remained clean at those commits during final checks.

Only `lumo-clarity-edition-v1` is read and written. Seeded legacy state was not imported, read or modified through opening, saving, exploring the bundled sample, resuming Clarity state or reset. No personal records were copied. A separate origin adds browser storage isolation. Existing bundled sample account data, PIN and ambassador entry are preserved; validation fixtures are isolated tests, not a replacement for that sample.

## Financial fixture

Starting state: GH₵600.00 available; GH₵350.00 remaining essentials; GH₵100.00 laptop allocation; GH₵150.00 left after the plan. Extra purchases below use zero-fee Campus Pay. Payment previews leave all actual records unchanged until the existing confirmation logic succeeds.

| Scenario | Available after confirmed success | Remaining essentials | Uncovered essentials | Uncovered goal allocation | Left after plan |
| --- | ---: | ---: | ---: | ---: | ---: |
| Extra GH₵80.00 | GH₵520.00 | GH₵350.00 | GH₵0.00 | GH₵0.00 | GH₵70.00 |
| Extra GH₵140.00 | GH₵460.00 | GH₵350.00 | GH₵0.00 | GH₵0.00 | GH₵10.00 |
| Extra GH₵280.00 | GH₵320.00 | GH₵350.00 | GH₵30.00 | GH₵100.00 | GH₵0.00, with GH₵130.00 total shortfall |
| GH₵80.00 linked to existing Food | GH₵520.00 | GH₵270.00 | GH₵0.00 | GH₵0.00 | GH₵150.00 |

Home, entry, Pause and Chat use the existing shared engine and formatter. Essentials impact appears first, with goal impact underneath. Goal allocations remain commitments, not a second debit. Expected allowance is never received money. Existing scores, thresholds, Pause triggers and authorisation requirements were retained.

## Completed checks

All **18 JavaScript suites and 2 Python font suites pass**. Machine-readable results are in `clarity-check-results.json`.

- Ordinary customer integration covers91 destinations; the complete simulation harness covers106 routes. Sign-up, funding, transfers, Campus Pay, bills, requests, plans, goals, Chat, activity, receipts, help, profile and recovery remain connected.
- Home → Campus Pay → amount → Review → appropriate Pause or PIN → simulated result passes for80/140/280. Entry has one compact consequence; Review contains recipient/amount/fee/total; Pause has one hypothetical comparison and closed full calculation. Editing, cancellation, defer, plan linking and changed-review authorisation are preserved.
- Matching Chat conclusions, bounded amount corrections, suggested actions, full history, expandable calculation, newest-answer announcements and composer-focus/viewport hooks pass. Initial Ask your money and visible starters are checked; active conversation collapses introductory content.
- Payment integrity covers single debit, repeat submission, fees, pending holds and settlement, failure, refunds, reversals and linked-expense coverage. Confirmed status and success artwork require actual confirmed transaction state. Pending and failed states never celebrate completion.
- Both Home summaries default hidden and re-hide on background, return, lock and reload. Allocations, transaction facts and other details remain visible. Hidden markup does not leak the large account value.
- Black/White logos and all four fonts match recovered originals exactly. Native GH₵, Unicode minus and equal-width tnum exist in every weight. WOFF2/TTF native raster parity passes at13/15/16/24/48px; original images retain their exact source hashes and1536×1024 canvases.
- One original illustration master per screen, relevant food/laptop matching, neutral task fallbacks and actual-result art gating pass. Existing unused fallback-atlas containment also remains intact; that raster test is not a phone screenshot.
- Fifteen final text/control token pairs meet the checked contrast requirements. Ink/white18.88:1, ink/lime14.52:1, muted/white7.46:1, controlborder/white3.69:1. Black-navigation inactive text/ink is9.52:1 by separate final-token calculation.
- Reduced-motion logic and immutable financial text/state pass. All deployed JavaScript passes syntax checks; index assets resolve locally; CSS braces balance. Source review fixed inherited navigation specificity and compact-density rules that otherwise grew decision artwork.

## Limits

The supported browser QA capability is unavailable. No preview server or alternate browser was used. **Home, entry, Pause and Chat phone screenshots and a journey recording could not be produced.** Real320/390/430px browser layouts, on-screen keyboard positioning, enlarged text and browser font network loading remain unverified. Source checks, font-advance measurements and VM behaviour checks do not replace those visual checks.

The earlier illustration family has no dedicated drawing for every service; neutral original student/notebook scenes are used and documented in `ILLUSTRATION-MERGE.md`. No new financial policy or supported date forecast was added. All services remain simulated. Newly created Site access is kept owner-private by the established workflow; access was not broadened.
