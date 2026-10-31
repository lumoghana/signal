# Money Box Savings hacks

Shared behavior for Everyday, Minna and Hibiscus; reviewed 26 October 2026.

## Optional setup and management

Each Money Box can have one hack. Creating a box defaults to manual saving; the customer can skip automation, add it later from the box, edit it, pause/resume it, or cancel it. Creating or changing an instruction moves no money.

| Option | Trigger and amount | Initial suggestion |
| --- | --- | --- |
| Save manually | Existing reviewed, authorised box transfers | Default; automation off |
| Roundups | Difference to the next GH₵1, GH₵5 or GH₵10 after an eligible payment; exact multiples save zero | GH₵1 |
| Save as you spend | Percentage of each eligible confirmed external payment | 5% |
| Save when money arrives | Percentage of each eligible confirmed incoming credit | 10% |
| Fixed schedule | Set amount daily, weekly or monthly, from a future start date | GH₵10 weekly |

Automatic options initially suggest a GH₵100 monthly cap per box and a GH₵50 Everyday Money buffer; customers can change both. Only one active box can receive roundups at a time.

An unchecked consent box explains the proposed sample instruction and limits. Enabling, changing or resuming automatic saving requires explicit consent tied to the exact configuration and revision. Unchanged box metadata edits preserve the existing instruction.

Cancellation stops future saving and revokes consent. It leaves saved funds and all previous ledger/activity records intact, records one cancellation event, and cannot be undone with Resume. Adding a hack again requires a new instruction revision and consent.

## Sample boundary and schedules

This is local sample automation: no bank mandate, live debit, server scheduler or real background service exists. Due checks run while the preview is open, including on page visibility/return and periodic checks. This does not promise execution while the browser is closed.

Fixed schedules are anchored at 9 am Ghana time. Monthly dates clamp to that month's last day. Returning after missed dates makes one current attempt and advances to the next future date; skipped periods never accumulate catch-up debt.

## Money and approval safeguards

- The existing two-account ledger alone moves money from Everyday Money into the selected box; automatic saving is a separate internal transfer.
- A signed-in, open, unlocked sample account and active box are required. The consent fingerprint must still match the stored configuration.
- Checks preserve unpaid Budget costs, pending holds, and the selected minimum Everyday Money balance. Insufficient room skips the whole attempt; it does not borrow or queue debt.
- Remaining monthly allowance and box target can reduce a saving. Reaching the target or archiving a box stops the instruction; resuming requires consent.
- Ordinary payment review/PIN and manual box transfer authorisation remain required. Existing partner approval plus owner PIN still protects box withdrawals.
- Saving failure cannot fail or repeat the source payment, replace its payment/funding draft or receipt reference, or count the internal saving as spending.

## Confirmed events and activity

Spending rules run after successful external payment posting or pending-to-success settlement, including virtual-card purchases. Income rules use confirmed external incoming credits. Internal transfers, card funding/creation, migrations, refunds/reversals and shared-expense repayments are excluded.

Transactions already present when an instruction is added, changed or resumed, including existing pending transactions, are excluded. Repeated callbacks for a new eligible event are handled once per instruction revision, with a deterministic internal-transfer reference.

Activity records distinguish saved, skipped and cancelled events. Saved records link the source transaction and confirmed internal transfer; a skip records its reason and moves no money. If a response fails after a ledger posting, reconciliation reports that actual saved transfer. Refunds do not silently withdraw earlier savings.

The legacy optional receipt prompt is hidden for a box with active automatic saving; its preferences/history are retained and future eligible receipts can show it again after automation stops. Due refreshes update read-only amounts/activity without replacing edits or typed PINs; changed balances still invalidate an earlier payment quote.

## Research basis

- [CFPB: Consumer Savings App Strategies and Savings Outcomes (2022)](https://www.consumerfinance.gov/data-research/research-reports/consumer-savings-app-strategies-and-savings-outcomes/) and [full report](https://files.consumerfinance.gov/f/documents/cfpb_qapital-savings-app-outcomes_report_2022.pdf): observational Qapital data associate regular/payday saving rules with greater savings accumulation than spending-contingent rules. This is an association, not evidence of causation or a forecast for Lumo students.
- [Monzo: Understanding roundups](https://monzo.com/help/budgeting-overdrafts-savings/understanding-roundups): reference for small payment differences and a single roundup destination.
- [Qapital: Payday Rule](https://help.qapital.com/en/articles/10245401-payday-rule) and [Set & Forget Rule](https://help.qapital.com/en/articles/10245402-set-forget-rule): references for income percentages and predictable recurring amounts.
- [Kuda: Use Spend+Save](https://help.kuda.com/en/articles/8954847-use-spend-save): reference for optional percentage saving after spending. It does not imply students should spend more to save.

## Validation

Focused suites cover consent/authentication, cents, caps, targets, Budget/buffer/holds, idempotency, schedules, cancellation, and ledger failures. Mounted journeys cover optional creation/editing, protected boxes, real merchant review/PIN, bank/MoMo references, direct card checkout/settlement/refunds, legacy prompts and safe due refreshes.

Run `node tests/savings-hacks-engine.test.cjs`, `node tests/savings-hacks-ui.test.cjs`, and `node tests/savings-hacks-integration.test.cjs`, plus existing saving-rule/card suites and each edition's parity/contract gate. Browser geometry and actual live financial infrastructure require separate validation.

New customers find Savings Hacks inside each Money Box; an existing manual saving prompt remains accessible only when its box has no active automatic hack.

Final browser geometry review: 34 fixtures across 8 phone/text/landscape/tablet/desktop settings per edition (272 layouts each) reported no overflow, clipped controls, bottom occlusion, or Hibiscus Plan Money Boxes heading/summary overlap. Source hashes and counts are retained in Everyday `tests/manual-layout/SAVINGS-HACKS-AUDIT.json`.
