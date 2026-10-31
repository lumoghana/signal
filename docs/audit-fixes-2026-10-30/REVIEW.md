# Monochrome money-journey audit corrections

Existing Site: https://lumo-monochrome.oness15.chatgpt.site

Opened source: `9dbf84f4b8d2d7f4042bf587089e3e3d50074cd6` (published version 10). Scope is the same Monochrome Site and its edition-owned money-life modules. Preserve its current public audience, source identity, browser namespace, Home composition, avatar, colours, native payment controllers and all other editions.

## User's P0 clarification

Money owed **to** the student is expected income. A due date, promise or pending transfer does not make it available, fund a cost or reduce a gap. The runtime already excluded those receivables from available money and costs. This release makes that distinction explicit in the IOU overview/detail, All Your Money, Chat and recovery copy, and adds a cross-surface regression proving it.

No automatic cost reservation has been added for an IOU in Home or native Plan. Money the student **owes** remains a separate obligation, using the existing recovery treatment and Plan-link deduplication. The original audit's outgoing-debt example must not be conflated with incoming expected repayments. Confirmed native receipts credit only actual principal once; repayments recorded elsewhere do not credit Lumo.

## Corrections

1. **Expected IOU boundary:** an incoming IOU due tomorrow leaves current balance, total held, costs, native Pause, daily guide and saving room unchanged. Expected repayments are labelled separately. Receipt confirmation, not the due date or a manual record, determines what enters the native balance.
2. **Recovery progress and completion:** reviewing a partial receipt keeps the plan active with the current gap. Completion requires current recorded commitments to be covered and confirmed external receipt evidence. The view rechecks legacy/completed plans after spending or receipt changes. It uses factual coverage wording, never a general promise of breathing room. Partial receipts are retained without a second credit and cannot be reused in another plan. Confirmed incoming IOU receipts can count as real received money without unlinking or recrediting them.
3. **Named IOU answers:** person and direction are preserved; unknown/ambiguous names get clarification instead of someone else's or an all-person amount. The action opens that person's record list, and changed IOUs mark earlier answers. General and clarification IOU actions, All Your Money and recovery answers also open their registered journeys. Native affordability questions keep their existing route.
4. **Retained-record exports:** open and closed authenticated accounts export debts, repayment/history data, current/removed manual sources, source history and recovery records. Credentials, unfinished drafts and operation keys remain excluded. The native PIN/access controller remains authoritative.

## Verification

- Focused engine and mounted journeys: `node --test tests/money-life.test.cjs tests/money-life-audit-fixes.test.cjs` passed 27 tests before the final full gate.
- Full required regression gate: `node scripts/check-edition-parity.cjs --regression --sequential` passed **519 tests, 0 failed, 0 skipped** on the final build. The pinned shared baseline, source order and edition isolation also pass. The 27 focused money-life tests are included in this gate.
- Browser layout review: **90 layouts, 0 findings** across 30 cases at 375×667, 390×844 and 320×568 with 200% text. Includes expected/scoped IOUs, partial/covered/reopened recovery and existing native payment screens. A reproduced receipt-label squeeze at enlarged text was repaired with wrapping fact columns; all 90 cases passed again. See `layout-review.json` and `expected-iou.jpg`.
- `git diff --check` and `node scripts/build-release.cjs --check` pass. All temporary `dist/__*` fixtures, including the clean screenshot view, were removed before packaging.

No real bank/provider calls, payments, remote messages or invitations are introduced. This remains a same-device prototype with sample money.
