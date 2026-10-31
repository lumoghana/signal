# Lumo experience refinement · 24 October 2026

This pass implements the recommendations from the latest usability review in both Everyday and Minna Editions. Each edition retains its identity assets, typeface, audience, URL and independent demo storage. Campus Pilot and Clarity Edition are outside this update.

Restore point: `checkpoint-before-experience-refinement-20261024`. The previous hosted Everyday v29 and Minna v11 remain recoverable.

## What changed

- **Budget editing:** returning students can change existing items in Chat, review them, return to the form and edit those same draft items. Changes remain proposals until explicit Save. Original item IDs, custom legacy names and confirmed coverage are retained. Pending payments and newer saved Budget changes block unsafe commits.
- **Chat interpretation:** familiar aliases such as lunch and Food now use the same Budget-versus-extra-spending clarification. Setup uncertainty stays in guidance and offers estimation help. Relative changes produce a reviewable total. A statement such as “I have GH₵600 until Friday” supplies planning context; it never credits the account, creates a cost or treats expected income as received money.
- **Budget overview:** the period is visible beside the total, with a date action when absent. The redundant remaining figure is omitted when it equals the full Budget. Guided first-Budget creation has consistent emphasis. The seven standard categories remain the limit for new Budgets.
- **Payment result:** confirmed outgoing payments show a concise Budget effect from a snapshot captured after the existing ledger success logic. Linked payments describe the cost still to cover; extra spending shows money left after Budget. Older receipts label the snapshot as information at confirmation, rather than a current balance. Pending, failed, reversed and internal Money Box movements cannot display a confirmed spending effect.
- **Contextual help:** the Pause, balance explanations and protected Money Box tasks offer “Help me understand this.” The explanation carries the current facts into Chat and returns to the original task and parent screen. Entered values are preserved, changed projections require review again, and submitted payments return to their result. Partner codes, contact details and PINs are not copied into Chat. Chat cannot approve or unlock funds.
- **Budget-period review:** an ended Budget has a visible review action. Current saved category totals are compared with completed spending recorded in Lumo for an explicit dated range. Unknown-purpose spending and pending payments are shown separately. Keep or Adjust prepares the existing next-period flow, with entered dates, a review and separate confirmation before replacement.

## Financial and date boundaries

Total Budget includes the original amounts planned, including any amount already covered. Payment consequences continue to use only the remaining commitments. Money Boxes are held in a separate savings account and are not deducted from operational spending room again.

Period review uses a saved cycle start or a first-save record when one exists. For older Budgets without a reliable start, the student supplies comparison dates; those dates apply only to the review. It compares **current saved Budget totals**, not an invented historical version of the plan. Recorded spending includes fees and excludes incoming funds, internal Money Box transfers, failed and reversed payments. Refunded payments are excluded entirely. Unknown-purpose spending is included in recorded money out but is not assigned to a category. Spending outside Lumo may be missing.

Recorded transaction classification is preserved when a Budget item's category later changes. A manual transaction-category correction remains authoritative. Preparing a next period does not move money, add unspent amounts twice or replace a current draft without the existing safeguards.

## Scope and remaining limits

The Pause retains the existing 900 ms reveal, at least three seconds of visible reading time and 90 ms confirmation press before separate authentication. Time in contextual Chat does not satisfy the remaining Pause reading time. This pass does not change payment-trigger rules or authorisation requirements.

This remains a simulation with bounded local Chat logic. There is no live AI service, banking connection, SMS delivery, live partner approval or production biometric verification. Test outcomes do not establish student comprehension, production security or market readiness.

The next unassisted student test is prepared in `docs/qa/experience-refinement/STUDENT-VERIFICATION.md`; no real students have completed it as part of this pass. Automated and browser evidence is recorded in `docs/qa/experience-refinement/VALIDATION.md`.
