# Chat, Budget and everyday value refinement

Implemented in both independent editions on 23 October 2026. Existing identity, access, demo storage, accounts, financial rules, Pause timing and approval remain intact.

## Recoverable starting points

- Everyday: published version 23, commit `a314529f2041c42330d75d1f9d6a2c335d641acb`.
- Minna: published version 5, commit `07bc69b433e4e8fb0bd955bd9129f8b9715fdbe8`.
- Local checkpoint in each checkout: `checkpoint-before-intent-budget-20261023`.

## Resulting behavior

1. Chat honours a named saved Budget source. A category mention such as “on food” asks “Is this in your Budget, or extra spending?” with one-tap choices before quoting a conclusion. Negated, competing and unavailable sources ask rather than guess. Amount-only corrections and historical rechecks retain the resolved source. A new unrelated question does not borrow it. Answers remain projections and preserve the composer draft.
2. Saved Budget scope remains recognised after its costs are covered. A shared pure description distinguishes missing costs, active costs, paid/pending coverage and ended periods. Depleted lines explain spare-money use. Pending coverage is not described as money already spent. Home, entry, Pause and Chat qualify ended Budget dates without changing commitments or trigger rules.
3. An enabled eligible saving preference appears on confirmed MoMo/GIP funding results and incoming receipts, independently of returning users skipping Budget setup. Review transfer and Not now remain optional. Pending, failed, refunded, internal, historical and handled receipts do not trigger another suggestion. Funding during a payment keeps Return to payment primary. Saving still uses separate review and authentication.
4. Home's existing story shelf names the leading recorded category and its amount. It accurately handles tied categories, money sent and unknown categories; an uncovered Budget leads with the actual gap. The scope is Lumo-recorded activity, not unobserved cash or other wallets.
5. First Budget save still returns Home. The existing shelf can offer an optional personal GH₵80 example using the actual current engine. Urgent shortfalls and ended periods take priority. The example has one comparison, one calculation disclosure, an explicit simulation boundary and a Got it action. It creates no payment draft and moves no money. Existing users do not receive a new setup wizard.

## Financial checks

Current two-account fixture: GH₵500 available operational money, GH₵100 already held in Money Boxes, GH₵350 remaining Budget, GH₵150 left after Budget. Savings must not be deducted twice.

| Proposed payment | Operational after | Budget remaining | Left after Budget | Budget shortfall |
|---|---:|---:|---:|---:|
| Extra GH₵80 | GH₵420 | GH₵350 | GH₵70 | GH₵0 |
| Extra GH₵140 | GH₵360 | GH₵350 | GH₵10 | GH₵0 |
| Extra GH₵280 | GH₵220 | GH₵350 | GH₵0 | GH₵130 |
| GH₵80 linked to Food | GH₵420 | GH₵270 | GH₵150 | GH₵0 |

Chat and payment projections agree. Confirmed ledgers remain governed by the existing payment engine. No new warning thresholds or automatic saving debits were introduced.

## Verification and limits

- Current regression contract: 37 test files per edition, plus the Minna identity/source/storage/route/peer gate. Includes payments, separate approval, pending/failure, repeated submission, protected Money Boxes, QR, Chat, savings, Budget, privacy and navigation.
- New mounted checks cover purpose clarification/corrections, completed/pending/ended costs, first-save example return and financial immutability; savings tests cover returning-user confirmed funding and negative receipt states.
- Browser checks used disposable local sample data: Everyday 360 × 640 and 390 × 844, reduced-height composer space; Minna 412 × 915 and enlarged-text fixture. Confirmed the visible source choice, linked answer, existing Home shelf and optional example. Natural scrolling remains available on small screens and longer content.
- These checks do not replace physical-device keyboard, camera/biometric or unassisted-student usability testing. All money and banking services remain simulated. Chat is a bounded prototype interpreter, not a general language model.

Screenshot: `qa/chat-budget-choice-20261023.jpg`.
