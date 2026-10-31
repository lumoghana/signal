# Everyday value pass · 23 October 2026

This implements the review's four-stage direction in the two independent Lumo prototypes. Everyday and Minna share behaviour and keep separate presentation, deployments and demo storage. Checkpoint: `checkpoint/pre-everyday-value-pass-20261023` in each source checkout.

## Behaviour delivered

1. **Make the current value easier to use.** An explicit known-merchant suggestion can link a payment to one matching Budget item. “Use & remember” is a choice, saved only after a confirmed payment. Historical categorisation alone never fulfils a Budget. Reusing a Budget creates fresh cost IDs and reviews dates and full amounts, preserving old receipts and balances. A known, checked, fully covered Campus Pay or bill payment does not receive an interrupting Pause merely because it repeats a recipient; genuine funding consequences and other existing risk signals remain. Home has one changing money-story observation. Chat answers calendar-period questions from confirmed Lumo records.
2. **Make repeat tasks useful.** Chat prepares editable payment and Money Box drafts, with clarification when an entity or amount is missing. Recent payments and merchant favourites are shortcuts into the established flow. Incoming money can retain the existing Budget rather than repeatedly starting setup. None of these features authorises money from generated text or a previous receipt.
3. **Make the pilot's status honest and recoverable.** An in-app inbox records confirmed receipts, resolved pending transactions and useful Budget events. Quiet hours and a weekly review are optional, device-local preferences. Recovery follows the original reference; rechecking does not manufacture success. Existing QR/photo/code entry and the three demo merchants remain available. Provider dependencies below are not simulated as connected services.
4. **Explore repeat-use needs without auto-spending.** Shared costs split an eligible completed payment into private requests, track partial confirmed sample repayments and never count unpaid shares as money. An optional fixed or percentage saving suggestion appears after confirmed incoming money and uses the existing Money Box review and authorisation. It is not an automatic debit.

## Financial and interaction authority

- `two-account-engine.js`, payment submission, plan impact and confirmed transaction resolution remain authoritative. Money Boxes hold actual savings money, separate from operational money. Budget is a plan over operational money.
- Pending, failed and reversed records are not counted as completed spending. Account-to-Money-Box movements are excluded from spending summaries. Completed outgoing fees are included. Calendar answers use Ghana time (UTC) and explain their recorded-data limit.
- Shortcuts always create a new draft. Authentication, current balances, fees and source validity are rechecked by the existing journey. The approved Pause timing remains: money arrives at the ring, at least three seconds of reading, a 90 ms continuation hold, then separate authentication.
- New short tasks register with the same sheet system. The background remains inactive, entered values are retained and dismissing a sheet cannot submit a payment.
- No browser records are copied between editions. New optional fields are additive and do not reset the user's demo account.

## Services still required for a live pilot

| Capability | Current prototype | Required production contract |
|---|---|---|
| Funding and payments | Explicit sample outcomes and existing pending/failure states | Bank/wallet API credentials and sandbox; server-created transaction IDs; idempotent submit; signed status webhooks; pending reconciliation; fees/limits; independent ledger and audit trail. A timeout must remain pending until authoritative resolution. |
| Campus merchant coverage and interoperable QR | Three existing demo merchants; supported Lumo QR/photo/code scanner | Verified merchant directory and identifiers; acquirer/GhQR scheme access, format and acceptance rules; merchant settlement and dispute contracts. Do not silently treat arbitrary QR data as a payable merchant. |
| Notifications | Persistent in-app events while the app runs | Consented push/SMS/email provider, device tokens, server event deduplication, delivery outcomes, quiet-hours enforcement and privacy-safe payloads. Local preferences do not imply external delivery. |
| Support and account recovery | Existing prototype support and recovery flows | Staffed support ownership; authenticated case API, reference lookup, escalation and resolution logging. Protected Money Box release needs verified partner/contact-centre controls on the server. |
| Shared repayments | Clearly labelled same-device sample receipts | Verified payer/request identity; payable links and signed settlement events; partial-payment idempotency, expiry/cancellation and refund reconciliation. A request or message is never a balance credit. |
| Saving automation | Optional suggestion with approval for each transfer | Separate consent for a real recurring mandate; eligibility and affordability policy, revocation, server scheduling, retry limits and independently auditable transfers. The current suggestion grants no recurring mandate. |
| Other-account financial data | Not connected; answers use records Lumo actually has | A supported institution/aggregator and explicit scoped consent, refresh/revocation controls, source provenance, stale-data states and reconciliation. Do not infer an unseen wallet balance or a future allowance. |

These services need provider access and operating decisions outside this static prototype. No live connection, delivered external message or production readiness is claimed.

## Validation and future evaluation

The two-edition parity gate checks the same approved shared source and feature tests, while preserving each storage key. New focused tests cover confirmation-only learning, Budget renewal, calendar boundaries, draft clarification, fresh repeat drafts, event deduplication, exact shared-cost sums/credits and saving approval. Browser checks cover reachable sheets and representative phone layouts.

Evaluate a pilot with observed task completion: unassisted first Budget, time/taps to repeat a payment, percentage of confidently linked payments corrected by users, Pause comprehension and edit/continue choices, repeat weekly active use, recovery completion and notification opt-out. Do not treat more Pauses, more notifications or appearance as proof of benefit. Before a live pilot, verify provider failures and duplicate webhooks against a server ledger and run unassisted student sessions.
