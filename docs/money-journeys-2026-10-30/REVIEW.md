# Monochrome money journeys · 30 October 2026

Updated the existing Monochrome source and retained project `appgprj_6ae305933e788191a5e4894a43890e17`, public audience, storage namespace, exact avatar, monochrome/acid-lime presentation and three primary destinations. The existing URL is https://lumo-monochrome.oness15.chatgpt.site. This is an edition-only request. No Everyday/Hibiscus checkout or shared baseline module was changed.

## Delivered behavior

- **IOUs:** record money owed in either direction; optional due dates and Plan link; reviewed creation/corrections; partial repayments; pending and overdue states; native Lumo, MoMo and bank repayment; requests; existing incoming receipt linking; payments recorded elsewhere; correction history; closure with an explicitly unpaid remainder; reopening; settled/closed history. Records describe existing personal borrowing/lending and do not originate credit.
- **All Your Money:** one total for Lumo accounts and funded cards plus explicitly manual bank, MoMo and cash balances. The native aggregate already includes cards, so they are not added twice. Money Boxes are savings subdivisions, counted once. Recorded sources have checked dates, update labels, distinct-source confirmation, editing/removal and history. Group pots, expected allowance, pending incoming money and unpaid receivables stay outside the total. Pending outgoing holds are included in total held but identified separately from available funds.
- **Allowance recovery:** a three-step review sets a check-in date, protects every saved unpaid cost by default, accepts explicit cost reductions and optionally pauses active Savings Hacks. Due IOUs are included conservatively, with existing Plan links preventing duplicate commitments. The result shows the current shortfall or money outside commitments, an explicitly limited daily guide, and routes to funding, collecting IOUs, other holdings, Plan and Money Boxes. Revised plans supersede prior active versions. Completion links a new confirmed incoming receipt without a second credit; savings resume only through the existing reviewed controls.
- **Home Transfer:** opens the full Payments root, including Send money, Campus Pay and Bills & top-ups. The existing compact Home composition is preserved.
- Menu exposes the three new journeys. Existing balance breakdown, Payments, collections and Plan provide additional entries. Ask Lumo recognises the agreed plain-language questions and offers the corresponding journey without performing a financial action.

## Financial and persistence review

Native checked-recipient entry, full fees, timed Pause, separate PIN/biometric demonstration, available-balance guards and pending-reference behavior remain authoritative. The new IOU binding covers the exact record, recipient, amount, fee and payment source. Principal alone settles debt. Pending repayments reserve debt capacity; failure releases it, and reversal restores the unpaid amount. One receipt cannot settle two IOUs. A stale record cannot authorise a new debit without review. Manual repayment records never alter account or other-source balances.

All new records use the existing core-owned state and transaction boundary. Authenticated repayment and linked settlement history commit together or roll back together. Recovery cost changes and optional savings pauses also commit together. Existing non-IOU payment wrappers delegate directly to their previous controllers, preserving their own failure recovery. No second persistence reader, provider queue or automatic retry was introduced.

The recovery check-in does not move the expected allowance date, change the Budget period, add expected money, withdraw from a Money Box, forgive a real obligation or automatically resume savings. Fees and accommodation remain in the existing Plan/Bills/Money Box journeys.

## Verification

- `node scripts/check-edition-parity.cjs --regression --sequential`: **508 tests passed, 0 failed**, plus the source, identity, namespace and existing financial contract checks. The optional peer checkout comparison was unavailable; the pinned shared baseline passed unchanged.
- `tests/money-life.test.cjs`: **16 focused tests passed**, included in the full gate. Coverage includes partial/manual/native repayments, pending/failure/refund, stale review, receipt reuse, request cancellation/credit, exact MoMo/bank fees, native Pause and PIN, failed-save rollback, holdings conservation/freshness, recovery reductions and revisions, optional savings pause, mounted forms, Menu routing and full Payments navigation.
- Source-owned isolated browser audit: **75 layouts, 0 findings**, covering 25 screens at 375×667, 390×844, and 320×568 with 200% text. No palette violations, horizontal overflow, clipped text, unreachable controls or collapsed scroll regions. See `layout-review.json`; the reproducible fixture is `tests/manual-layout/money-life-stage.cjs`.
- Direct browser journeys: Home Transfer → full Payments; IOU creation → GH₵30 native authenticated payment against GH₵80 → GH₵50 remaining; manual GH₵120 wallet balance → correct total without changing Lumo funds; recovery setup → protected costs → review → saved plan → All Your Money. Saved records survived reopening/reload.
- `git diff --check` and the deterministic release build integrity check pass. Temporary `dist/__*` QA files are removed before packaging.

`money-overview.jpg` shows the source-owned browser verification with sample money. Samples are local demonstrations; no real money, bank lookup, wallet charge, loan, remote request delivery or member decision was tested or introduced.
