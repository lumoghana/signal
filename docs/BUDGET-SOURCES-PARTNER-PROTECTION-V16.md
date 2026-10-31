# Budget sources and optional partner protection · v16

## Restore point and scope

Published version 15 remains a saved restore point. Source commit:
`4ad71b75318ffaad369c1e8b3334a258629989ad`.
Local checkpoint tag: `checkpoint/pre-budget-sources-partner-protection-v16`.
Project, public audience, storage key, wordmarks, fonts, existing account split,
Home composition, illustrations, Pause rules and PIN flow are retained.
Neither Campus Pilot nor Clarity Edition is edited or republished.

## Pay from

Payment entry now shows one native dropdown with every active Budget line and
Left after budget. Four lines produce five choices. Zero-remaining lines remain
available; their uncovered excess is handled by the existing financial engine.
All choices use the operational account. Budget lines are purposes, not bank
accounts or separate wallets. Without a Budget, ordinary payments still work.

Choosing a Budget line explicitly links the principal to that cost. Successful
payments fulfil it once; pending holds, fees, refunds and reversals retain the
existing engine rules. Spending beyond the line's remainder uses remaining
spending room. Removing a selected line requires choosing a current source;
changing the source invalidates the earlier payment review.

The chosen source is saved as `budgetSource` with its exact line name and ID.
It supplies the reporting purpose ahead of merchant, note or remembered
inference. A single recognised category can be used; mixed or custom names
are preserved rather than narrowed by a guess. The small optional category
control remains available. Correcting that category does not change the Budget
link. Left after budget retains ordinary recognition and optional correction.
No extra required payment step has been introduced.

## Optional Money Box protection

Existing and new boxes start unprotected. During creation or editing, the
customer can choose Protect this Money Box and enter a different Ghana mobile
number. The invitation must be accepted before protection becomes active.
Until acceptance, the UI explicitly describes the box as unprotected.

Every protected transfer back uses Amount → Review with partner code → the
customer's own Lumo PIN → result. The partner message identifies the box,
amount and request. It grants no account access. Deposits need no partner code.

Approval is bound to box, draft, amount in minor units, partner, protection
revision and purpose. Codes expire in five minutes, incorrect attempts are
limited, and reissue invalidates the earlier request. Amount or partner changes
invalidate approval. The transfer service itself checks approval and a scoped
in-memory PIN grant, including direct transfer and deposit-reversal paths.
Approval is consumed on submission for completed, pending or failed results.
Duplicate submission of the same draft returns the existing transaction.
Pending settlement uses the submitted approval snapshot; a failed retry needs
a fresh approval. Balances change only through the existing confirmed logic.

Replacing or removing an active partner requires approval for that specific
change from the current partner or verified support. A replacement partner must
accept; the old protection remains active until then. Name, target and date
edits never directly move money or disable protection.

Can't reach your partner opens a scoped support request. Pending and declined
requests leave protection in place. Only an explicit simulated identity check
and support approval authorise the request; a withdrawal still requires PIN.

## Simulation boundary

Messages, invitation acceptance, verification, codes, support decisions, money
and accounts are local demonstrations. No SMS, call, provider lookup or live
payment is sent. Sample partner messages are deliberately visible behind a
labelled disclosure so the whole journey can be evaluated. This client-side
prototype is not production account protection. Production implementation must
put policy, code issuance and delivery, authentication, auditing and support
approval in trusted backend services.

## Verification

49 new behavioral checks pass: payment sources15, protection service16 and
protection UI18. Selected regressions also pass for Home/privacy/funding,
Plan, navigation, onboarding, payments, categorisation, Chat, Money Boxes,
two-account arithmetic, Pause and task sheets. Historical copy assertions
were migrated from the replaced optional-link label to Pay from. Financial
coverage assertions remain intact. JavaScript syntax and git diff checks pass.

The real preview browser covered a saved Budget selection and its live
projection, enabling protection on a saved box, accepting a sample invitation,
a protected withdrawal, incorrect code, support pending state, returning with
the same amount, correct code, separate PIN, confirmed ledger and preserved
external payment. A subsequent withdrawal asked for a new code. Returning Home
showed the changed operational and savings balances while Money Story excluded
the internal movement. The protected Review was shortened after browser QA:
source, destination, total and fee stay visible; projected balances expand.
At the available browser viewport, the code and Continue/Edit actions are
visible together. Extra details and short screens can naturally scroll.

[Protected withdrawal Review](qa/v16/protected-withdrawal-review.jpg).

Automated DOM tests verify behavior, focus, history and viewport response, but
are not a browser layout engine or a physical keyboard. Physical phone
keyboards and every phone/text-size combination were not verified in this pass.
