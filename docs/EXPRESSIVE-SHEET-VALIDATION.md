# Expressive scenes and Campus Pay task sheet

Checked 18 October 2026. This update belongs only to **Lumo · Clarity Edition**, project `appgprj_6ad4c822fe3881919757091e91e2ce9f`. Both source prototypes remain separate. Clarity's observed public access settings are preserved. No live banking, verification or payments were added.

## Recovery

Opened the latest deployed Clarity source before editing: `47703e908f63f140e5b55796699da302e1b2b53e`, Clarity version 1. Recovery tag: `checkpoint-clarity-before-task-sheet-20261018`. An independent Git bundle was also created before edits. The original identity assets and eight earlier illustration masters remain unchanged.

## What changed

- Three new transparent original Lumo scenes: relaxed campus Home, attentive comparison gesture, and a small confirmed-payment celebration. They retain the original curly-haired cast and simplified orange/navy textile panels. Home anatomy was corrected with the image tool before integration. Exact prompts and asset paths are recorded in `EXPRESSIVE-PASS.md`.
- One Campus Pay task sheet holds merchant selection, amount, factual Review, conditional Pause, planned-cost linking, PIN, actual result and cancellation. The existing financial engine and actions remain authoritative.
- Home or Pay content and navigation stay mounted while the task steps change. Scroll and focus return on dismissal; a changed draft or transaction triggers a parent refresh on exit. Active input IDs are isolated from retained Pay IDs, then restored.
- The shared sheet has a named modal heading, explicit Back/Close/Help, inert background, focus handling, keyboard-aware viewport geometry, natural scrolling, compact illustrations and reduced motion. Browser Back/Forward follow task state. Asynchronous history cleanup queues a new navigation safely.
- Closing an unsubmitted draft offers keep/discard. Deferring and cancelling use existing actions. Closing after a submitted result preserves its reference. Back cannot reopen authorisation for an already submitted payment. New tasks do not inherit an older payment's submitted state.

Funding, transfers, bills, onboarding, planning, Chat, activity, help and profile remain their existing full-screen journeys in this focused pass. No additional product scope was introduced. The only persistence path is still `lumo-clarity-edition-v1`.

## Completed validation

**22 suites pass: 20 JavaScript suites and 2 Python font suites.** The new task-sheet suite loads the actual shipped index script list and contains **29 behavior checks**. It uses a DOM harness rather than a real browser. Results: `expressive-sheet-check-results.json`.

| Check | Result |
| --- | --- |
| Home 600 / essentials 350 / goals 100 | 150 left after the plan; Home summaries remain private by default |
| Extra 80 | Projected/confirmed520 available,70 after the plan; no financial Pause |
| Extra 140 | Projected/confirmed460 available,10 after the plan; no new warning threshold |
| Extra 280 |320 available,30 essentials uncovered,100 goal allocation uncovered,130 total plan shortfall; appropriate Pause |
| Linked 80 essentials payment |520 available,270 remaining essentials,150 after the plan; no double count |
| Preview/Review/Pause/Chat | Same existing engine; preview does not move money; Review contains payment facts; Pause owns one comparison and the choice |
| Success/pending/failure | Exactly one transaction; confirmed debit only through existing success logic; pending reserves and failed releases remain correct |
| Retained page | Exact Home and navigation child identity, main route, scroll, inert state and focus checked throughout task steps |
| Edit/link/leave | Amount/note/merchant retained, fresh review after changes, keep/discard/defer/cancel tested |
| PIN and guards | Invalid PIN does not submit; changed plan requires fresh review; independent audit checked 5 wrong PINs exiting safely to sign-in |
| Repeat tasks | Prior completed/pending result closed with X cannot mark a new draft submitted; sheet and browser Back tested |
| Browser history | Back/Forward inside steps, first-step close, completed result dismissal, and delayed native-history cleanup followed by immediate new task/tab tested |
| Keyboard and focus | Simulated visualViewport resize preserves actual mounted input and value; Tab/Escape/inert and focus restoration checked |
| Privacy | Background/pagehide masks both summaries; eye control synchronises on dismissal |
| Art | Three RGBA files, intended scope, one scene, no financial text embedded, actual confirmed/delivered result gating; neutral unconfirmed states |
| Regression | Original financial, authorisation, plan, Chat, onboarding, activity, ambassador and identity suites pass; 91 ordinary destinations and 106 full simulation routes remain covered |
| Source | All deployed JavaScript syntax, asset paths, CSS brace balance and whitespace checks pass |

An independent source audit found and fixed a repeat-task submitted-flag defect. It separately checked delayed-history transitions and PIN-lock exit. The core shell guard preserves navigation DOM; the retained empty error outlet retains its original hidden layout after ID isolation.

## Verification limits

Supported browser control is unavailable. No alternate browser or preview server was used. Actual Safari/Chrome rendering, phone keyboard placement, larger-text layouts, drag behavior and screenshots/recording remain unverified. The task has explicit Back/Close and does not depend on a drag gesture. Source and DOM behavior checks do not establish physical-device fit.

The new artwork consists of flat transparent PNG masters, not rigged characters. Shared reveal/hold/resolve motion remains brief and does not animate hands or financial amounts independently. Original wordmark and font files remain intact. All payments and identity services remain simulations.
