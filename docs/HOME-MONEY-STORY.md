# Home money story

The Home has three clear areas: money now, receiving actions, and where it went. The exact wordmark, Lumo Sans, white/ink foundation, established lime and illustration family are retained. “Hey, Kwame” stays below the logo row.

## Visible on Home

- The separately labelled available balance and dominant Left after your plan, with the existing eye privacy control.
- The caption “Your money story · last 7 days” introduces one compact observation: “Food took GH₵121.50 of GH₵241.50 paid out.” Category amount and total form one sentence rather than a headline and separate supporting line. Amounts come from the shared completed-payment summary and remain real interface text. A single category shows its amount once: “Food took all GH₵35.00 paid out.” Transfers explicitly describe money sent; tied leaders state equal amounts and an accurate category count. Empty windows say “No completed payments: GH₵0.00 paid out,” with the seven-day scope visible in the caption. The category bar and grid stay off Home; the full breakdown remains in the existing one-tap sheet.
- Add money and Request money are directly visible. Spending actions and saved-payment continuation remain in Pay.

The current illustration sits full-width above the balances, following the user’s attached illustration-led reference. It responds to the available viewport height between126px and300px. Labels and values remain real interface text. The independent recent-activity preview and duplicate hidden Money Story link are removed. The plan period and separate balance-details link stay off Home, as requested previously; their existing controls remain available elsewhere.

## One calculation source

`L.spendingSummary({days:7})` supplies the Home, detail sheet and matching Chat totals. It includes completed outgoing payments and their fees, including transfers. Transfers remain identifiable as money sent, not purchases. Incoming, pending, failed, reversed, future and invalid transactions are excluded. Goal allocations do not create payments. A linked essentials payment remains one actual payment and is included once.

This is a rolling seven-day window, not a calendar week. The empty state describes that window and does not imply the account has no older history. No personal records are imported, existing saved information and the `lumo-clarity-edition-v1` storage key are unchanged.

## Detail sheet

One tap opens `homeMoneyStory` in the established records/detail sheet. It shows all categories, 7/30/90-day options, optional recent payments, the scope definition, a pending-payment link where appropriate, scoped payment history and a matching Chat action. Period changes reuse the same surface. Long history and conversations retain their dedicated scrollable screens.

Close, backdrop and browser Back restore the same Home, focus and position. The backdrop is inactive. Nothing in this read-only story authorises or submits money. Currency symbols are grouped separately so GH₵ stays intact, while large numeric portions and long labels may wrap naturally.

## Interaction comparison (v11 pass, before the funding-focused Home update)

| Task | Before (v10) | Current |
| --- | --- | --- |
| Understand seven-day money out and top categories from Home | Expand More money tools, open Money Story, select 7 days: 3 taps | 0 taps |
| Open seven-day full category breakdown | 3 taps plus optional category disclosure | 1 tap |
| Open a longer spending history | Shelf, story, Explore my spending: 3 taps | Story, View payments: 2 taps |
| Campus Pay GH₵80 to simulated result | 5 button activations | 5, unchanged |
| Campus Pay GH₵280 through Pause to simulated result | 6 button activations | 6, unchanged |

Typing, native selectors, PIN entry, and closing a result are excluded from the payment button counts. Actual rendered scrolling has not been measured. The v11 pass removed the large independent illustration and activity block. The current reference-led Home restores the illustration above the balances; natural scrolling remains available for long content and enlarged text.

## Checks

- Thirteen actual-index DOM/behavior checks verify Home/sheet/Chat agreement; fees/transfers; pending/failed/reversed/incoming/future/old exclusions; leading categories, single-category stories and tied leaders; empty/older history; period selection/history scope; three dismissal paths; focus/scroll/shelf/privacy restoration; category-change refresh; long amount/currency and reduced-motion contracts.
- Production customer experience integration passes, including 95 customer destinations, privacy, financial fixtures, consistent Pause/Chat, linked essentials, cancellation, pending/failed and duplicate-submission states.
- Existing task-sheet (68), native refinement (31), completion (9), navigation (9), contextual identity (30), Chat coach and activity scope checks pass.
- JavaScript syntax and whitespace/diff checks pass.

The legacy integration check assumed a zero behavioural score at any hour. It now checks that no behavioural Pause is triggered and that any incidental signal is the existing late-night signal. Product scoring is unchanged.

No supported managed browser controller was available. DOM tests and synthetic viewport contracts are not real browser layout, screen-reader, enlarged-text rendering or physical keyboard tests; screenshots and pixel-fit claims are not supplied.

The latest layout and current action changes are documented in [Home funding refinement](HOME-FUNDING-REFINEMENT.md).

## Recovery

Prior published v10: commit `3859721170c9d07c3566633f497d10053269d632`; archive-backed Sites version `appgprj_6ad4c822fe3881919757091e91e2ce9f~appgver_d0bce02fcc808191a1e8cc32a813e005`. Local checkpoint: `checkpoint-clarity-before-home-money-story-20261018`. No changes were made to either original prototype.

The current polish is documented in [Home polish](HOME-POLISH.md). Earlier interaction comparisons are historical, not new measured phone results.
