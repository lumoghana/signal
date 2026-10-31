> Historical campus v25 record. Superseded for Clarity Edition by docs/SYSTEM-REFERENCE.md and docs/CLARITY-VALIDATION.md.

# Lumo system 24 · verification

Checked on 18 October 2026. These checks use the actual project source, financial functions, generated markup, font binaries and rasterized illustration components. They do not measure a complete app in a phone browser.

## Completed

| Area | Evidence |
| --- | --- |
| Recovery | Latest deployed v23 opened before editing. Existing saved Site version and pushed source `6fd5ed888c536900888fffef78ee5712e8de7a72` retained; named Git checkpoint and local bundle created. |
| Complete journeys | `tests/experience.cjs` renders 106 existing routes; `tests/production-experience.cjs` renders 91 ordinary customer destinations and exercises signup, funding, planning, navigation, review, PIN, results and privacy. |
| Connected design journey | Customer harness exercises Home → Campus Pay → amount → Review → appropriate Pause or PIN → confirmed simulated result for GH₵80.00, GH₵140.00 and GH₵280.00, with matching Chat answers and exactly one debit. |
| Decisions and edits | Projection is read-only. Invalid, edited, resumed and simulated page-restored input follow one validity rule. Editing GH₵280.00 to GH₵140.00 recomputes the result before fresh review. Cancel leaves money untouched. |
| Financial fixtures | Nineteen shared calculation checks verify the GH₵600.00 / GH₵350.00 / GH₵100.00 fixture, all requested discretionary purchases, prior gaps, linked costs, fees, pending holds, rounding and purity. Linked Food spending reduces the obligation once. Expected allowance never becomes available money. |
| Existing product rules | Twenty-six original Pause specification checks and 26 saved-plan checks pass. No behavioral score, threshold, trigger or PIN rule was changed. |
| Payment integrity | Fourteen integrity groups cover idempotency, pending settlement, holds, linked coverage, outside coverage, refunds, migration and correction. Customer integration separately verifies pending and failed outcomes retain the correct reserve/release and result labels. |
| Chat | Existing and new Chat groups pass: intent, amount follow-up/corrections, shared consequence, closed calculation, context-preserving actions, full history, focus and newest-reply announcements. |
| Privacy | Exactly the two Home summaries start masked, reveal together without financial state changes or focus movement, and re-hide on background, page return, lock and reload. Other saved-plan details stay visible. A large account value is also checked for hidden-markup leakage. |
| Typography | Five binary/CSS tests verify a compressed local licensed font, native cedi/minus outlines, real 400/500/600/700 weight coverage, actual equal-width tabular digits and separation from the wordmark. Runtime loading is declared by a local face and preload. Actual browser font rendering remains unverified. |
| Contrast | Fifteen real token pairs pass calculated contrast: normal text at least 4.5:1; meaningful field edges and focus at least 3:1. Supporting text on paper is 6.24:1; shortfall text on its tint is 6.28:1; control border on white is 3.73:1. This is a token-pair audit, not a browser/compositor screenshot audit. |
| Illustration | Semantic/result-state tests and native SVG silhouette raster checks pass. Ninety-nine containment checks cover 33 scenes at 320×200, 400×200 and 460×168 component viewports. No neighboring atlas fragments; neutral Pause keeps the same complete student while excluding the trade-off thought objects. |
| Motion | Six safety groups pass: immutable money text/state; actual confirmed/delivered gating; pending/failed states; privacy/Chat/projection focus; replaceable live edge; reduced motion, background cancellation and isolated replay. |
| General source checks | Every deployed JavaScript file passes syntax checks; index assets resolve; new stylesheet braces balance; Git diff has no whitespace errors. Brand icon and existing raster asset bytes remain unchanged. |
| Existing secondary flows | Plan-period, first-plan benefit, activity scope and ambassador entry suites pass. First-plan example is still optional and isolated from account data. |

All 15 JavaScript test suites and the font suite pass. The illustration component raster suite is included in that total.

## Layout corrections made from source review

The audit caught and fixed an inherited 12 px span rule shrinking Home's main whole-number digits. The new type rules reset whole digits to their intended parent role. Balance details has a 44 px target even before the first plan. Large Chat calculation values and projection figures can wrap instead of forcing a horizontal overflow. Main decisions have equal 54 px targets. Supporting controls retain a visible focus outline. Long recipient names and grouped account amounts are present, escaped and finite in the customer-rendering harness.

These are source and markup checks. They establish the implementation intent; they do not establish measured 320 px or enlarged-text fit in a browser.

## Capture and device limitations

The supported browser-control capability was unavailable in this managed environment. Under the project's established workflow, no alternate preview server or browser installation was used. Consequently, **no genuine Home/Pause/Chat phone screenshots, journey recording, software-keyboard check or browser geometry pass were captured**. Illustration rasters are component evidence and are not labelled as app screenshots.

The remaining review is concrete:

| Manual case | Acceptance criterion | Status |
| --- | --- | --- |
| 320×568 and 360×640 | Core consequence and Edit / Continue choices are reachable together at ordinary text size; no clipping or horizontal page scroll. | Not run |
| 390×844 and 430×932 | Comfortable reading rhythm; illustration stays subordinate; result is visibly related to Home and Chat. | Not run |
| Text increased to 200% | Natural vertical scroll; complete amounts/names; no lost actions or overlapping fields. | Not run |
| iOS / Android keyboard | Amount and Chat composer remain reachable; answer reads in the main page; input focus survives submission. | Not run |
| VoiceOver / TalkBack and hardware keyboard | Meaningful labels, heading/focus order, closed calculation, polite answers and privacy reveal are usable. | Not run |
| Reduced motion setting | No movement needed to understand any figure, state or action on a real device. | Not run |
| Logo-covered comparison | Students recognize Home, Pause, Chat and result as one family from lettering, drawing, hierarchy and motion. | Not run |

The deployed simulation remains suitable for continuing prototype review. These missing device checks should be completed before claiming the layout has passed a phone UAT or treating this prototype as production payment software.


## Journey refinement · 25

The latest checkpoint is deployed v24 / source `a62fd26532ef4624622a9d3c9d8a29d91c7e5705`. Entry now uses one compact conditional impact line; Review shows recipient, amount, fee and total; the separate Pause adds the named consequence, full facts and alternatives. The numeric engine and interruption rules are unchanged.

Updated customer integration checks assert that Review is directly after the live preview and before the optional note; that the plan selector stays present; that Review contains no repeated consequence or projected balance; and that the GH₵280.00 Pause retains the named GH₵30.00 essentials impact, laptop allocation and equal choices. Comfortable, low-cushion, linked-cost, editing, cancel, pending, failed, privacy, long-name and large-balance checks remain in place. Fixed requests and packaged bills were independently probed and retain correct entry projections and action order.

Source review confirms the final illustration-size rules win existing CSS overrides, the currency prefix cannot shrink or wrap, the amount input may shrink, and the plan selector uses 16 px text. The small insight ring is shared by Home, entry, financial Chat and Pause; the result ring remains a transaction-status indicator. Green highlights an insight, the Pause canvas or confirmed result rather than every stage. No clipped panel, fixed action or forced screen height was introduced. These are source/VM checks, not a measured phone fit result. The device/capture limits above still apply.
