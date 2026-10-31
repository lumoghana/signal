# Spending outlook, Budget from history and Pause choices

Implemented in Everyday and Minna Editions on 23 October 2026. The editions retain their separate appearance, storage keys and publishing targets.

## Restorable starting points

| Edition | Published version before this change | Source commit |
| --- | --- | --- |
| Everyday | 25 | `7393a7e96066deddac8e8f520573ca5eb97a2619` |
| Minna | 7 | `909d76cbe81f23bf457eba6bb2122ba3194d1689` |

Both checkouts have the local tag `checkpoint-before-outlook-history-recovery-20261023`. Existing published versions remain recovery points.

## Spending outlook

The existing after-Budget figure opens a compact detail sheet and includes a daily guide in its existing caption. No extra Home card or navigation destination was added. Hiding balances also hides the daily figure and accessible numeric text. The caption remains 14px at normal text size.

The shared engine first covers remaining Budget commitments and pending reservations. Only the remaining room is divided by the remaining days. A dated Budget includes today and its last date. A period explicitly linked to expected allowance excludes the expected income day. Missing, expired or changed dates require review; expected money never increases available money. Money Boxes remain separate savings.

Daily amounts are rounded down to pesewas, with any remainder shown in the calculation. GH₵490 available minus GH₵350 remaining Budget leaves GH₵140; seven inclusive days give GH₵20 per day for extras. A linked GH₵80 payment reduces available money and the remaining Budget together, keeping that room unchanged. Extra spending reduces the room.

This is a daily reference based on saved costs, not a complete cash-flow forecast or a guarantee. It does not distribute the Food Budget into a second allowance. Unknown costs may be missing.

Chat answers direct daily questions with the daily amount first. It shows the actual Budget end date, and identifies dates beyond that period as unsupported. An expired expected allowance date is not described as future income. Daily answers become historical after Ghana midnight and can be checked again.

The ordinary wording issue was also corrected: “What’s left for food?” and “How much food money do I have?” now use the named Food Budget; “Set food to GH₵300” prepares an editable proposal. Historical spending and amount-affordability questions keep their existing interpretation and authorisation rules.

## Budget suggestions from recorded history

An optional entry in Plan and first Budget setup uses the previous four complete Monday–Sunday weeks. Current partial weeks are excluded. All four weeks remain in the denominator, including days with no recorded spending. Eligibility requires an account date or confirmed external record reaching the beginning of that window; this establishes date coverage, not proof that every expense was recorded.

Only clearly categorised, completed external outgoing payments are used. Fees count once. Incoming, pending, failed, reversed, internal, unknown-purpose and refunded records are excluded. The conservative refund policy excludes an entire refunded payment, including a partially refunded payment, and explains that choice in the calculation.

GH₵720 Food spending across the four-week window produces GH₵180 for one week. The student can edit, exclude or add items. The dates and source transactions are expandable. The visible text identifies Lumo-only coverage and asks the student to fit the amounts to their own week. Previous spending is not a recommendation.

Missing current Budget costs, such as Rent, are named. Add Rent inserts a blank editable weekly amount with the existing saved total as reference; there is no invented monthly-to-weekly conversion.

Using the suggestion creates an unsaved, recoverable first Budget or fresh-period draft covering the next seven days. Existing Budget commitments, savings and account balances stay unchanged until the existing Save or Start-this-Budget confirmation. Existing unfinished drafts and pending linked payments are protected. Changed history or dates invalidate an older quote until explicitly refreshed.

## Pause choices

A conditional shortfall Pause shows the computed lower payment and funding alternative together after the existing reveal. The existing consequence headline explains continuing with the original amount. All three projections are available in the existing calculation disclosure. Fixed or otherwise uneditable payments never receive an invalid lower-amount action.

Example with GH₵500 available, GH₵350 remaining Budget and GH₵100 separate savings:

| Choice | Projected result |
| --- | --- |
| Extra GH₵280 payment | GH₵220 available; GH₵130 Budget uncovered |
| Change payment to GH₵150 | GH₵350 available; Budget covered; no room outside it |
| Add GH₵130 first, then reconsider GH₵280 | Once funding is confirmed, projected available GH₵350; Budget covered; no room outside it |

Fees and any pre-existing Budget gap use the shared engine. The funding need is checked again if the Budget or available money changes. A new blank funding form can receive the suggested amount; an existing entered amount is preserved.

Funding preserves the original recipient, amount and Budget source. After confirmed sample funding, Return to payment opens a fresh review. Pending and failed funding do not become received money. No choice silently authorises the original payment.

The approved motion and security remain: effects reveal on ring arrival at 900ms, a minimum three-second reading period follows, continuation uses the 90ms press, and authentication is separate. Reduced motion retains the facts and approved reading period. The new choices have verified light/dark contrast, including Minna's black Pause.

## Validation

- All 43 approved regression files passed in each edition, with zero failures. The nine edition-contract checks passed, including independent storage, retained routes, source parity, four confirmed financial journeys, pending/failure/repeat handling, QR, simulated biometrics and protected savings.
- Focused checks within each run: 22 spending-outlook, 17 history-Budget, 22 Pause-recovery and 22 Chat-planning checks.
- Browser QA used disposable local fixtures. Checked 360×640 and 390×844, plus 412×915 and a reduced 390×480 viewport with 150% text. Enlarged forms scroll naturally. A changed Food amount of GH₵190.25 survived the reduced-height journey into the unsaved Budget draft.
- The outlook's main figure and Done action fit at 360×640. The two-item history suggestion fits comfortably at 390×844. History with more items, extended calculations, larger text and short-height Pause content can require natural scrolling. No text was shrunk or scrolling disabled to force a fit.
- Browser funding test: GH₵280 Pause → Add GH₵130 → Mobile money amount prefilled → explicit sample funding confirmation → GH₵630 actual available → original GH₵280 review, still unsubmitted and requiring authentication.
- Browser Budget test: four-week Food180/Transport60 suggestion → change Food160 → unsaved draft → existing review → Save. Budget220, Everyday money1000 and Money Boxes100 remained consistent; saving the Budget moved no money.
- Screenshots are in `qa/outlook-history-recovery/`. The audit toolbar surrounding them belongs only to the local QA harness, which is removed before publication.

## Limits

This remains a simulation with no live payments, live account data or external notifications. The reduced-height check approximates keyboard space; physical phone keyboards, camera/biometric behaviour and student comprehension need real-device and student testing. History suggestions describe only recorded Lumo transactions. The outlook does not forecast unknown costs or rely on unreceived allowance.
