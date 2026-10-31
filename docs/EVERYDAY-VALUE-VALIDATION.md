# Everyday value validation · 23 October 2026

## Checkpoint and scope

The pre-change versions remain recoverable through published version history and the source commit ancestry:

| Edition | Pre-change published version | Pre-change source commit |
|---|---|---|
| Everyday | 21 | `e859ad982b70532088aaad6278b9c2d6c444bd69` |
| Minna | 3 | `069015b4f1613f51870aac256c7b6bade6d5353f` |

Both checkouts also have `checkpoint/pre-everyday-value-pass-20261023`. The feature pass preserves project IDs, public access and independent storage keys. Campus Pilot and Clarity Edition were not edited or published.

## Automated evidence

- **429 named behaviour checks in 31 test files passed in each edition.** The two-edition gate additionally passes nine source, storage, route, financial and authorisation contracts.
- All 50 shared product scripts match after normalising only the existing edition storage-key literal. Minna presentation continues to load separately. All 140 destinations remain registered.
- New tests cover optional Budget learning only after confirmation, fresh-cycle historical coverage, UTC calendar boundaries/comparisons, ambiguous Chat commands, stale proposals, draft retention, recent recipients, pending recovery, source changes, deduplicated updates, shared-cost cents and partial receipts, saving approval and milestones.
- Integration fixes include a pending payment arriving during a repeat-draft choice, withdrawing then reversing savings without inventing a milestone, and opening saving preferences for different Money Boxes without restoring the previous Box. The opening render now waits for all product layers.

The current product has **two actual accounts**. The canonical engine fixture is GH₵500 operational plus GH₵100 in savings, GH₵350 remaining Budget and GH₵150 after Budget:

| Payment | Operational available after confirmed success | Remaining Budget | Left after Budget | Budget gap | Savings |
|---|---:|---:|---:|---:|---:|
| GH₵80 extra | GH₵420 | GH₵350 | GH₵70 | GH₵0 | GH₵100 |
| GH₵140 extra | GH₵360 | GH₵350 | GH₵10 | GH₵0 | GH₵100 |
| GH₵280 extra | GH₵220 | GH₵350 | GH₵0 | GH₵130 | GH₵100 |
| GH₵80 linked to Budget | GH₵420 | GH₵270 | GH₵150 | GH₵0 | GH₵100 |

These preserve the deployed operational/savings model. The earlier GH₵600 single-account fixture with a virtual GH₵100 goal allocation is not reintroduced. Chat, preview, Pause and confirmed result agree; a forecast, Pause, scan or request never moves money. Pending holds, failure, duplicate authorisation and partner-protected withdrawals remain tested.

## Browser evidence

Real browser interaction used the managed local preview with phone-size iframes. Both identities were inspected at 360 × 640 and 390 × 844, with additional 412 × 915 and narrow/enlarged-text Chat checks. Evidence is in `docs/qa/everyday-value-pass/`.

- Everyday: Home → full-screen Chat → “Pay Akua GH₵25 from Food” → editable sheet → review → separate PIN → confirmed sample result. GH₵720 becomes GH₵695, the remaining Budget falls by GH₵25, and GH₵400 after Budget stays unchanged. Chat and Home then both report GH₵60 spent today. A GH₵25 split into owner GH₵8.34 and two friends GH₵8.33 creates GH₵16.66 unpaid, with no credit to the balance.
- Minna: Campus Pay → Favourites → save Akua → resume entered GH₵450 → projected GH₵50 Budget shortfall → edit amount. At GH₵80, “Use & remember” selects the existing Food Budget, with a GH₵400 after-Budget projection. Review and separate PIN produce GH₵640 operational money. Calendar Chat reports GH₵160 confirmed spending this week. The independent Everyday record remains separate.
- Minna's entry action was measured at bottom 635 px in the 640 px viewport after compacting the optional source-learning prompt. GH₵ remains together. Core Pause edit/continue actions are visible together at 390 × 844; optional calculation and longer content can scroll.
- Everyday Chat at 150% text and Minna Chat at 320 × 640 with 150% text retain their input fields within the viewport. The conversation scrolls independently. Closed Chat tools retain full touch targets rather than shrinking into a clipped row.

## Effort and limits

Recognised source linking is one optional tap on the first payment and can be prefilled after an explicitly remembered, confirmed payment. Recents and Chat skip retyping recipient details but always retain editable details, review and approval. Shared-cost and new-period forms scroll when their content requires it; a standard shortfall can require scrolling on a 360 × 640 screen. No font reduction or global scroll lock was used to force a fit.

These are engineering and browser checks, not an unassisted student usability study. Physical iOS/Android keyboard, biometric hardware, camera-provider interaction and assistive-technology testing remain device QA; the automated harness covers reduced motion, viewport/focus and draft behaviour. No live funds, external notifications, portable shared-payment links or external financial data are connected. Provider requirements are recorded in `EVERYDAY-VALUE-PASS.md`.
