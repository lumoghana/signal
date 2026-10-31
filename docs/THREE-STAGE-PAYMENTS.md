# Lumo understands; helping takes one tap

Version 11, 21 October 2026. Restorable starting point: published Everyday v10,
commit `5c69616584246dadcec74e258ff2fb14b31ea7b2`, also tagged
`checkpoint-before-three-stage-payments-20261021`.

## Product contract

Recognised merchants, billers and explicitly remembered recipient categories use
the existing local prediction hierarchy. Uncertain purposes remain suggestions.
Lumo never invents a category from a payment amount, time of day or a person's
name. It can ask a small optional question with immediately actionable answers.

- A note/history suggestion has a direct **Use Food** action.
- Unknown payments show up to three choices, including Other. The choices use
  customer-confirmed recipient history and saved cost names, not fabricated certainty.
- A known category has a quiet label and Change.
- Every full-menu category tap saves just that payment and returns to the draft
  or conversation. There is no second compulsory scope confirmation.
- Future payments too remains a separate explicit action. Past records are not
  bulk changed. One-off exceptions do not replace a remembered rule.
- Not now is respected on the result. The student can add a category later.
- Category answers never select a funding pot, fulfil an essential, change money
  or authorise a transaction. Existing Chat confirmation and guarded Undo remain.

## Three stages

Outgoing Lumo, MoMo, bank, Campus Pay, received-request and bill payments use:

| Stage | Responsibility |
| --- | --- |
| 1. Details | Recipient/account and amount or package, optional plan link, compact live projection |
| 2. Review **or Pause** | Recipient, destination, amount, fee and total; the existing Pause rules select the consequential choice instead of adding another review screen |
| 3. Authorise | PIN submission, followed automatically by the actual simulated result |

Recipient lookup and bill-account checks run within Details. The search by name,
handle or phone remains available. Package selection updates its projected amount.
Entered amount, note and explicit plan link survive returning to edit.

All returns to decision use one selector, including funding returns, corrected
plan links, fixed requests, retries, smaller-amount shortcuts and stale quotes.
An unaffordable payment stays blocked in Review. The Pause still provides its
money-to-ring reveal, three full reading seconds and 90 ms confirmation press.
It never substitutes for PIN authorisation.

MoMo funding remains wallet/amount → review → result. Creating a request remains
details → review → saved request. Incoming bank funding supplies receiving details
for a transfer outside Lumo and awaits confirmation.

**Three stages is not a three-tap or guaranteed-settlement promise.** Choosing a
payment type, merchant, recipient, typing details, optional edits and recovery can
require more taps. A provider may return pending or failure. Neither is shown as
success. No real provider is connected in this simulation.

## Interaction comparison

Measured controller activations exclude text entry, optional category answers,
plan linking and time spent reading. A selected Campus Pay merchant is the start.

| Path | v10 | v11 |
| --- | --- | --- |
| Covered payment | Details → Review → PIN → automatic result; 3 submission actions | Same 3 actions |
| Meaningful trade-off | Details → Review → Pause → PIN → automatic result; 4 submission actions | Details → Pause → PIN → automatic result; 3 submission actions |
| New MoMo/bank recipient | Separate account-check submission before amount review | Account check and amount review in one submission |
| Bill purchase | Account/package submission, then separate amount submission | Account, package/amount and check in one submission |
| Full category answer | Category tap, then scope confirmation | Category tap saves and returns |

The layout retains the type, wordmarks, campus artwork, saved state and independent
Everyday storage. Optional plan detail uses an expandable shelf; its closed label
states Extra spending or the linked cost. Amount-entry decoration is removed to
give fields and actions space. Pause's two main choices share one row and equal
touch targets. Natural scrolling remains enabled.

## Validation

New mounted-DOM coverage: 18 transaction-journey checks and 13 one-tap category
checks. Existing category intelligence (11), correction scope/Chat Undo (14), task
sheets (71), isolation (5), native refinement (32), Pause hero (24), payment balance
(8), plan adjustment (13) and navigation (9) pass.

The GH₵600 / GH₵350 essentials / GH₵100 goals fixture produces:

| Payment | Available after | Remaining essentials | Goals | After-plan room / shortfall |
| --- | --- | --- | --- | --- |
| Extra GH₵80 | GH₵520 | GH₵350 | GH₵100 | GH₵70 room |
| Extra GH₵140 | GH₵460 | GH₵350 | GH₵100 | GH₵10 room |
| Extra GH₵280 | GH₵320 | GH₵350 | GH₵100 | GH₵30 essentials and GH₵100 goals uncovered |
| Linked GH₵80 | GH₵520 | GH₵270 | GH₵100 | GH₵150 room |

The same tests compare Chat, preview and committed figures, fees, all six bill
types, invalid lookup retention, linked costs, changed quotes, insufficient money,
pending/failure and repeat authorisation. Existing timing tests preserve reduced
motion, dwell, hold, cancellation and focus behaviour. Existing phone viewport and
keyboard-resize controller tests are retained; these are not physical device tests.

Browser QA exercised the combined MoMo form and direct shortfall Pause with
recipient/fee/total; a separate Lumo transfer retained its amount when choosing a
recipient, accepted Food in one tap, and completed via Review and PIN exactly once.
Its visible available balance changed only on the confirmed simulated result.

Limitations: classification remains deterministic browser-local prototype logic,
not a calibrated production model. No accuracy or market-usability claim is made.
Physical phone keyboards, real provider settlement and live security remain outside
this prototype's verification. Browser QA used the available desktop app surface;
no new claim of measured phone fit or reduced scrolling is made.
