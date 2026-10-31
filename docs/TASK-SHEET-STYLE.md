# Shared Lumo task sheets

Short payment, funding, planning, records, account and help tasks run in one sheet above any of Home, Pay, Plan, Chat and You. The parent page is retained in the DOM with its scroll position, muted by a neutral scrim, and made inert by the sheet adapter. The sheet changes stage in place. It does not stack a separate modal for amount, review, Pause, PIN or result.

`dist/task-sheet.css` follows the earlier visual layers; `dist/clarity-bold.css` supplies art, lens and type rules; `dist/native-refinement.css` loads last and supplies current sizing and layout. It follows the original Lumo Sans, black and white wordmarks, ink #111111, white #FFFFFF and insight lime #CFEF59. The actual Minna reference supplied for this pass informs the white sheet and quiet gray backdrop, rather than supplying logos, typography or product logic.

| Element | Shared rule |
| --- | --- |
| Frame | App-width fixed layer measured from the app rectangle. Desktop keeps the layer within the phone frame. The phone visual viewport drives height and top. |
| Sheet | One white sheet, 24px top corners, bottom anchored. Height follows content up to the actual visual viewport cap, with a safe top gap. Long content scrolls in the body; there is no 90% minimum. |
| Backdrop | Ink at 42% opacity. The underlying page remains visible and keeps its layout; no blur, scale or transform is applied to it. |
| Chrome | Back, task title, Help and Close. All controls are at least 44 × 44px. The chrome remains visible while the content scrolls. Existing route top bars are hidden inside the sheet to avoid duplicate navigation. A grab handle supports optional header-only dragging through the same close confirmation as the Close button. |
| Content | One vertical scroll surface with 24px gutters, 18px on narrow phones. Safe-area padding, overscroll containment and input scroll margins. No fixed content height or hidden explanations. |
| Entry | 28px illustration, 42px amount, nonwrapping GH₵, 16px input/select text, compact live consequence. Primary action follows that consequence. |
| Review | No decorative scene, 40px amount, recipient and factual amount/fee/total rows. No duplicated Pause warning. |
| Pause | No competing character, 24px consequence, one calculated comparison. Optional arithmetic follows the choices. Edit and Continue have equal touch targets and comparable visual emphasis. |
| Authorisation | One meaningful lock symbol and ordinary input sizing. A PIN is never represented by a success state. |
| Result | One 56px status mark, direct outcome, amount/recipient and reference. Existing transaction state determines confirmed, pending, failed, reversed and delivery wording; no decorative illustration. |
| Motion | Existing 180ms reveal / 220ms resolve easing. The sheet moves 24px while fading in; financial values never animate as counters. Actions are immediately available. Reduced motion shows the complete state immediately. |

The adapter sets `--task-app-left`, `--task-app-width`, `--task-viewport-top` and `--task-viewport-height`, plus `.is-ready` and `.task-keyboard-open` on `.task-sheet-layer`. The shell is `.task-sheet`, its navigation is `.task-sheet-chrome`, and `.task-sheet-body` is the only overflow surface. The active task outlet retains `id="view"`; the saved parent becomes `#task-parent-view` until dismissal.

The earlier project has multiple CSS layers, including high-specificity illustration sizing with `!important`. The sheet stylesheet is intentionally scoped to `.task-sheet-layer` / `.task-sheet-body` and is followed by `clarity-bold.css` and the final `native-refinement.css` overrides. Route and density selectors explicitly reduce illustration size so older full-screen rules cannot enlarge it. Exact families and full-page exceptions are recorded by `L.taskSheet.coverage`. Onboarding, recovery, long activity and money-story reading, and the merchant console retain full-page navigation. Ordinary form drafts stay in memory only for the current demo account; sensitive fields are excluded and cleared on dismissal. Account replacement clears retained drafts. Branded decisions reuse existing confirmation and mutation functions.

The host registers selection, edit, detail, Pause, confirmation and form treatments. `chatCalculation` and `planExplanation` are detail routes; `samplePause` stays a public dedicated screen. A ResizeObserver/rAF hook publishes content/available heights and an overflow diagnostic without forcing a dialog height, rerendering fields or resetting focus/scroll.

This system does not change the financial engine, Pause triggers, transaction state or confirmation rules.

Source checks cover shared classes, dimensions, nonwrapping currency, reduced-motion handling and scroll behavior. Actual narrow-phone rendering, system keyboard behavior and enlarged text still need browser or device verification. No screenshot or recording is implied by these source checks.

The 26 October 2026 overflow review refreshed the actual-index task-sheet regression fixtures. New Budget items now select one of the seven offered categories instead of writing a free-text name; Budget deletion uses its current `budgetDelete` confirmation and returns to Plan. The retained-outlet, pending-payment, cancellation and no-money-movement assertions remain in place. The generic dismissed-decision check uses the current sign-out confirmation. All 71 task-sheet behavior checks pass separately in Everyday, Minna and Hibiscus. This test refresh changes no application logic and does not replace browser layout QA.
