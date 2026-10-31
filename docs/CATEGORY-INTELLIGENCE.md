# Optional payment purpose capture · Everyday Edition v9

## Restore point

Existing published v8 is retained by Sites. Before edits, source commit
`ef5807f62a936191070fdea1b1b0907ce204b703` was tagged
`checkpoint-before-categories-20261021`; a full Git bundle was also created at
`/workspace/lumo-before-categories-20261021.bundle`.

## Working experience

- Amount entry has an optional compact category action. The existing optional note and explicit planned-cost selector remain independent.
- Known bundled merchants and billers classify automatically. Explicit customer choices take priority. A customer-authorised recipient rule also classifies automatically.
- Unambiguous description keywords and consistent customer-confirmed history provide suggestions, never unverified facts. Amount and time alone do not classify.
- Successful outgoing payments offer two one-tap choices, Something else and Not now. The expanded prompt is limited to one payment per page session; all receipts retain a manual category action. Pending and failed payments do not receive a success prompt.
- Category selection uses the existing accessible sheet controller. Confirmed choices can be remembered per stable recipient identity, changed or forgotten. Rules are personal and remain in the existing Everyday demo storage.
- The money-story detail includes an expandable sorting shelf. Batches contain at most three completed payments, with skip and close controls. Unknown payments remain included in totals and are labelled Uncategorised.
- Chat recognises supported purpose corrections such as “That GH₵40 to Abena was lunch”. One matching payment leads to a confirming category sheet. Multiple matches require selection; no match asks for the amount and recipient. No Chat message silently changes metadata.
- Entry projections say “If this is extra spending” when no planned cost is linked. Category capture never chooses a funding pot, changes a plan link, releases a goal allocation, submits a payment or updates the ledger.

## Data and limits

New outgoing payments retain category provenance, suggestion/confirmed/high/unknown confidence states, and a recipient identity key. Existing saved records are not migrated or overwritten. Existing category edits use the same confirmed metadata mutation.

This remains a local simulation, not an AI service or live merchant-enrichment integration. Confidence labels describe deterministic prototype evidence, not calibrated production probabilities. No high-accuracy claim is made. Merchant coverage is the existing bundled campus directory and billers; historical recipient names alone do not establish identity. Description recognition is a bounded keyword model, not unrestricted language understanding. No cross-customer labels, external contacts, receipts/OCR or live bank metadata are imported.

For production: validate available bank/rail fields, build a Ghanaian labelled evaluation set and measure audited precision together with classification coverage. Protect separate purpose, source-of-funds and planned-expense records. Prompt completion or lack of corrections does not prove correctness.

## Validation

11 new shipped-index DOM tests cover optional completion, receipt tagging, stable-identity rule persistence/removal, weak-signal abstention, draft retention, skip and sorting, pending/failure, category/plan separation, Chat confirmation/ambiguity and the four financial fixtures. Existing sheet, Pause dwell/hold, money story, payment balance, Chat, plan, calculation, adjustment, link and project-isolation checks were also run.

Financial fixture: GH₵600 available, GH₵350 essentials, GH₵100 goals, GH₵150 remaining. Extra GH₵80 → 520/70; GH₵140 → 460/10; GH₵280 → 320 with GH₵30 essentials short and GH₵100 goals uncovered. Linked GH₵80 → 520 available, 270 essentials remaining, 100 goals, 150 room. Categorisation alone leaves each result unchanged.

Browser QA: completed a sample payment with no note or category; inspected optional result choices, uncategorised total and expandable shelf; checked Chat matching and the confirmation sheet. Existing reduced-motion and phone-viewport DOM checks run, but physical-phone keyboard behaviour and real-world classification accuracy are not validated by this prototype.
