# Navigation audit and fixes

Scope: the complete new Lumo prototype, with particular attention to group collection setup. The visual system and financial model are preserved.

## Findings resolved

| Finding | Result |
| --- | --- |
| Main navigation disappeared on detail, setup, Chat and money-life pages. | Home, Activity, Pay, Boxes, Plan, Groups and Menu remain directly reachable throughout signed-in pages. |
| Generic Back buttons depended on the entire visit history. | Headers label the actual parent destination; wizard Previous moves one logical step. |
| Group creation replaced sheets without Previous or retained answers. | Four-page Purpose → Target → Agreement → Review setup, editable review, Save & exit and a resumable draft. |
| IOU setup had the same sheet/navigation problem. | Full-page direction → person → amount → date/note flow, Previous, saved draft and correct incoming/outgoing parent. |
| Native Back and Forward diverged from the separate app stack. | One indexed page-history controller restores destination and scroll for both directions. |
| Completed tasks could reopen old execution/setup pages. | Completion removes obsolete steps from native Forward history and opens the created object or safe section. |
| Review edits repeated unrelated questions. | Focused edits return straight to Review; cancellation restores the previous values. |
| Entered names, amounts and dates disappeared when leaving a page. | Draft capture before navigation, saved setup cards and Continue/Start again choices. |
| Funding interrupted a payment and returned Home. | Funding returns to its original payment review. |
| Cancelling PIN entry lost contribution/payout details. | PIN cancellation restores the previous form and its values. Native Back closes the current modal before leaving its page. |
| Every toggle or update jumped the page to the top. | Same-page refresh preserves scroll and focus; returning to a list restores its position. |

## Navigation rules

- Home is a direct main destination, never a repeated Back sequence.
- Group detail and setup return to Groups; Money Box detail returns to Boxes; receipts and payment entry have explicit payment/activity parents.
- Previous changes the current setup question. Save & exit preserves unfinished work. Completion clears execution history.
- Modals are a temporary native-history checkpoint. Back closes them first; cancelling authentication restores the form rather than discarding it.
- Navigation never changes held money or counts expected funds as available.

## Validation

Pure route and indexed-history tests cover parent destinations, native Back/Forward, scroll restoration, review edit loops, interrupted setup, completed payment guards, valid IOU filters, modal checkpoints and safe completion ancestry. The existing financial invariant suite remains in place.

Browser verification includes group creation, retained answers through Back/Forward, leaving to Home, resuming, changing the approval rule, editing review details, completing into a zero-funded group, returning to Groups, and restoring an entered contribution after cancelling PIN with native Back.

All 61 automated tests passed: 26 financial invariants, 16 route relationships and 19 indexed-history scenarios. Browser checks also covered IOU save/exit/resume/completion, payment review/edit/cancel/resume, modal reload recovery, and group setup at 390×844, 360×740 and 320×667. At all three sizes, group setup had no horizontal or page overflow and its main actions remained visible.
