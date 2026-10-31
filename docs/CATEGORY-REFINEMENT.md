# Category refinement · Everyday Edition v10

## Restore point

Published v9 remains available in Sites version history. Before editing, commit
`2dfde751b59d212bc52c0bfa05b6b34b66812d94` was tagged
`checkpoint-before-category-refinement-20261021`; a complete Git bundle was saved
at `/workspace/lumo-before-category-refinement-20261021.bundle`.

## This pass

1. Explicit choices for this payment take priority, followed by personal saved
   recipient rules, then generic merchant/biller defaults. A unique description
   category that contradicts the personal rule becomes an optional exception
   choice, not a high-confidence automatic classification. Entry updates as the
   student types without replacing the amount, note or plan-link fields.
   “Use Gifts” and “Keep Food” affect only this payment. Unanswered conflicts
   remain Uncategorised, with both choices offered on the completed receipt.
2. Category sheets say that the chosen category is saved for this payment.
   “Just this payment” closes the task without changing the personal rule;
   “Future payments too” explicitly saves/updates the recipient rule and closes.
   Existing historical payments are never bulk-edited. Receipt shortcuts use
   the same future-scope wording. No category action selects a funding source,
   fulfils a planned cost, changes balances or authorises payment.
3. A unique new Chat match offers “Use [category]” directly. A confirming tap
   updates metadata within the same conversation and reveals Change category
   and Undo. Composer text, turn count, scroll and keyboard focus are preserved.
   Undo restores the exact previous category/metadata, including absent legacy
   metadata. Category revision and payment identity checks prevent an old
   proposal or Undo from overwriting a newer correction or changed transaction.
   Multiple matches still open the selection sheet. Saved v9 “Check category”
   messages keep their original review-sheet action instead of gaining a new
   immediate mutation under an old label.

## Validation

- 14 new refinement regressions and 11 category-intelligence regressions passed.
- Existing 71 task-sheet, 7 everyday Chat, 14 payment-integrity and project/storage
  isolation checks passed. Financial fixtures still verify extra GH₵80/140/280
  and linked GH₵80 using the same engine.
- Browser QA: typed a gift note against a saved Food rule, resolved Gifts as a
  one-off, inspected both scope actions, confirmed a unique Chat match in one
  tap, and used Undo without leaving Chat. Retained v9 sample data and old Chat
  history were present during this test.
- Syntax, source diff and link checks completed before packaging.

Prediction is still a local deterministic simulation, not a trained or calibrated
production classifier. Wider suggestion ranking, recent-pattern learning and
prompt prioritisation remain outside this focused first-three pass. Physical
phone keyboard behavior and production classification accuracy are not claimed.
