# Daily companion refinement · 23 October 2026

## Scope and recovery

This update adds the approved daily-use refinements to Everyday and Minna Editions. Presentation, wordmarks, typefaces, independent storage, saved information, account rules and payment authorisation remain in place. No live banking, messaging or merchant integration was added.

Restorable starting points:

| Edition | Previously published version | Source commit |
| --- | --- | --- |
| Everyday | 24 | `4ca21c2a6a0fe5a5c6c1959a1da8b3509a4025e7` |
| Minna | 6 | `4a5ddf700387b11762a4a413885bb69a57e0ff4d` |

Both checkouts also have the local tag `checkpoint-before-daily-companion-20261023`.

## What changed

- **Named Budget answers:** “What is left in my Food budget?” answers the saved item, with money outside the whole Budget stated separately. Confirmed coverage, pending reservations and uncovered Budget commitments are distinct. Loaded payment coverage is reconciled before the first answer.
- **Specific editable changes:** “Change my Food budget to GH₵300” prepares a compact edit with a live, explicitly hypothetical effect. Name, date and existing coverage remain expandable. Only Save changes the Budget; returning to Chat preserves the conversation and composer draft. Changed, expired, locked and pending-payment cases retain guards.
- **Expected-date follow-through:** a missing or expired allowance date offers a date sheet. A short date answer such as “Next Friday” produces the full calendar date for confirmation. Saving changes only the expected date, never received money or its amount. Lumo still cannot promise how long money will last without adequate information.
- **Optional Budget estimate:** Help me estimate accepts the student's own daily or weekly amount and duration. For example GH₵25 × 7 days fills GH₵175 into the unsaved draft. The student can edit it and must still Save the Budget item. Cancel and Back preserve the original draft.
- **One-tap daily-story correction:** one uncategorised completed payment can offer up to two grounded category choices, Something else and Not now. Tapping a category saves that transaction's category directly. It does not change balances, fulfil a Budget item, or learn an automatic recipient rule. Pending, failed, reversed, refunded and internal records are excluded.
- **Useful saved-date insights:** an unpaid saved cost due today, tomorrow or overdue can occupy the existing Home insight shelf, with a direct edit action. Shortfall and expired-Budget messaging retain priority. Missing dates do not produce invented forecasts.
- **Weekly catch-up:** an opted-in weekly review missed while the app was closed becomes available on the next visit. It uses the seven complete days before the scheduled review day, has explicit dates, and is deduplicated. It is an in-app prototype feature, not background push delivery.

## Financial acceptance fixture

The current two-account model is authoritative. GH₵100 already transferred to Money Boxes is separate savings, rather than another planning allocation deducted from Everyday money.

Starting state: GH₵500 available in Everyday money, GH₵350 remaining Budget, GH₵100 in Money Boxes and GH₵150 left after Budget. Combined accounts total GH₵600.

| Payment | Everyday available after success | Remaining Budget | Left after Budget | Uncovered Budget |
| --- | ---: | ---: | ---: | ---: |
| Extra GH₵80 | GH₵420 | GH₵350 | GH₵70 | GH₵0 |
| Extra GH₵140 | GH₵360 | GH₵350 | GH₵10 | GH₵0 |
| Extra GH₵280 | GH₵220 | GH₵350 | GH₵0 | GH₵130 |
| GH₵80 linked to Food | GH₵420 | GH₵270 | GH₵150 | GH₵0 |

Money Boxes remain GH₵100 in every example. Payment preview and Chat agree. Projections and entering authentication move no money. Pending reserves funds; failure does not debit; repeated success cannot debit twice.

## Validation evidence

- The nine edition-contract checks pass: correct projects, separate demo storage, approved shared scripts and load order, retained destinations, four confirmed financial journeys, pending/failure/repeat handling, QR and simulated biometrics, protected Money Box withdrawal, and peer parity.
- The approved 40 regression files are run for each edition during final packaging. The new focused suites contain 20 Chat-planning, 9 Budget-estimate and 10 daily-story-category checks. Daily insights include 32 checks. Final results are reported with the published update.
- Browser QA used disposable local sample data. Everyday was checked at 360 × 640 and 390 × 844; Minna at 360 × 640 and 412 × 915, with Chat also checked at 150% text in a reduced 390 × 480 viewport.
- At normal 360 × 640, the compact Chat edit exposes the amount, projected effect and Save; the estimate exposes its result and Use this amount. Optional detail and the explanatory footer can scroll. Enlarged text is allowed to scroll naturally.
- Due-cost action opened the matching Data item. Daily-story category correction updated the story without changing the balance. Chat's edit returned to the same conversation with a fresh answer after explicit Save.
- Screenshots: `qa/companion-budget-edit-20261023.jpg` and `qa/companion-estimate-minna-20261023.jpg`. The surrounding audit toolbar belongs only to the local QA page, which is removed before publication.

## Limits and next validation

The reduced-height check is a keyboard-space approximation, not evidence from a physical phone keyboard. Camera, native biometrics, live payments, real merchant acceptance, student comprehension and habitual use require device and pilot validation. No new production analytics or outreach was introduced.

Follow [the student pilot validation plan](STUDENT-PILOT-VALIDATION.md) for neutral unaided tasks, Pause comprehension, errors, campus relevance and observations. Pause retains the approved ring-arrival, three-second reading period and 90 ms continuation hold, followed by separate authentication. The pilot plan is a proposal for testing, not a completed student study.
