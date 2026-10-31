# Clarity Edition native refinement — implementation and evidence

The working update is published to the existing Clarity Edition project at https://lumo-clarity-edition.oness15.chatgpt.site/. Access remains public. This report evaluates clarity, task completion and interaction contracts; it does not claim superiority to Minna or Monzo, or imply that visual appearance proves usability.

## Recovery and scope

Before implementation, the deployed v5 source was reopened at `5b2fde1c1fb97b634e7a9052828e7378bc448c16`, tagged `checkpoint-clarity-before-native-refinement-20261018`, and bundled for local recovery. Its saved Sites version remains `appgprj_6ad4c822fe3881919757091e91e2ce9f~appgver_f1dfaa14ab7c8191bdd60d7f95f8cc4f`. Restore that version with its matching deployment artifact to return to the pre-change implementation.

The audit inventories all 108 previous views, grouped into journeys with source-reviewed empty, error, pending, success, recovery and loading variants. The baseline probes rendered every registered view without a harness error. See [the inventory](SCREEN-INVENTORY.json) and [pinned baseline](BASELINE-INTERACTIONS.md). Three supporting views are added: `samplePause`, `planExplanation` and `chatCalculation`; no existing destination is removed.

Exact original Black/White wordmark assets, actual Regular/Medium/Semibold/Bold Lumo Sans files, existing illustration files, financial engine, trigger thresholds and local storage key remain unchanged. Existing profile, payment, plan and conversation data resume under `lumo-clarity-edition-v1`. The two reference projects retain separate repositories, saved versions, URLs and storage.

## Implemented changes

- Home: one compact greeting row; separate available balance; dominant left-after-plan amount; one allocation explanation; small contextual illustration beside the overview; Send and Campus Pay before compact activity. The eye still masks exactly the two requested amounts by default and on backgrounding. Breakdown, plan explanation and date controls open sheets.
- Sheets: selection, edit, detail, Pause, confirmation and form treatments share one retained-parent host. Natural content height replaces the 90% fixed sheet. Viewport caps, body scrolling, safe areas and mobile full-width geometry remain. Resize measurement is diagnostic, never a forced height or a rerender. Inert background, body scroll lock, focus trap/restore, browser Back, keyboard geometry, draft retention, Close and optional header swipe share the established safeguards.
- Payments: one live entry consequence; factual recipient/amount/fee/total Review; direct Pause consequence and one projected comparison. Redundant pre-decision framing and repeated covered-plan explanation are removed. Optional arithmetic follows the core choices. Editing, planned-cost linking, continuing to a separate PIN, deferring and cancellation remain connected.
- Chat: Ask your money, compact art and natural starter questions; active conversation takes over. The thread scrolls independently. Optional tools are bounded and scrollable; an outer-workspace fallback and sticky composer retain access in unusually short or enlarged layouts. Viewport updates preserve the actual input node, value, focus and history position. Calculations open the saved answer snapshot in a detail sheet; current funds are not silently substituted into an old answer. Quick edits return to the conversation.
- Feedback: one factual status symbol, direct outcome, amount/recipient, reference and an obvious next action. Confirmed, pending, failed, reversed and delivery outcomes remain distinct. Pending checks never invent a result; repeated submission remains idempotent.
- Onboarding: an optional, clearly labelled sample Pause is available before sign-up. It uses the production projection engine with isolated bundled facts. It creates no account, payment, plan or Pause event. Existing verification, consent, security and resumable optional planning remain intact.

The complete rules live outside the product flow in [the system reference](SYSTEM-REFERENCE.md), [native layout reference](NATIVE-REFINEMENT-SYSTEM.md) and [sheet contract](TASK-SHEET-STYLE.md).

## Financial checks

Fixture: GH₵600 available, GH₵350 remaining essentials, GH₵100 goal allocation, GH₵150 left after plan. The engine is exercised through actual entry, Review, conditional Pause, PIN and result controls, with isolated sample records.

| Scenario | Confirmed result | Outcome |
| --- | --- | --- |
| GH₵80 extra | GH₵520 available; GH₵350 essentials; GH₵100 goals; GH₵70 room | Pass |
| GH₵140 extra | GH₵460 available; GH₵350 essentials; GH₵100 goals; GH₵10 room | Pass; no new interrupt threshold |
| GH₵280 extra | GH₵320 available; GH₵30 essentials shortfall; GH₵100 goal allocation uncovered; GH₵130 total gap | Pass; qualifying Pause before PIN |
| GH₵80 linked to an existing essential | GH₵520 available; GH₵270 remaining essentials; GH₵100 goals; GH₵150 room | Pass; fulfilment counted once |

Chat, entry and Pause agree before authorisation; actual funds change only through the existing confirmed result. Goal allocations remain planning commitments, not a second account debit. Expected allowance remains unreceived money. Missing time/cost facts produce a limitation and useful next action rather than an invented date forecast.

## Interaction checks and comparison

26/26 suites and 48/48 JavaScript syntax checks pass. The actual-index task suite has 68 checks; the new refinement suite has 31. Financial integrity, engine/plan consistency, complete customer journeys, onboarding, recovery, privacy, fonts, original logos, navigation contrast, illustration assets and source isolation are also checked. Full outputs are in [machine results](native-refinement-check-results.json).

The existing browser-independent harness exercised actual app controls at synthetic 360×640, 390×844 and 412×915 viewport inputs. Checks cover changed viewport height/offset, retained input nodes and values, observer grow/shrink/disconnect, focus restoration, Tab trapping, inert parent, history/backdrop/Escape/drag dismissal, keep/discard, incorrect PIN, changed-plan review, reduced motion, pending/failed outcomes, duplicate submissions and saved-answer arithmetic. These are behavior and geometry contracts, not browser paint or physical keyboard tests.

Counts below are actual semantic button/summary activations. They exclude field focus, typing, PIN entry, native picker/select internals and keyboard dismissal. Starts and ends match the pinned baseline. They must not be presented as measured physical-phone taps.

| Task | Before | After | Required rendered scrolling before → after |
| --- | ---: | ---: | --- |
| Home: reveal the two private amounts | 1 | 1 | Unmeasured → unmeasured |
| Home: open balance breakdown | 1 | 1 | Unmeasured → unmeasured |
| Home → Campus Pay GH₵80 → confirmed result | 5 | 5 | Unmeasured → unmeasured |
| Home → Campus Pay GH₵140 → confirmed result | 5 | 5 | Unmeasured → unmeasured |
| Home → Campus Pay GH₵280 → Pause → confirmed result | 6 | 6 | Unmeasured → unmeasured |
| Home → linked Campus Pay GH₵80 → confirmed result | 5 | 5 | Unmeasured → unmeasured |
| Existing GH₵280 Pause → edit to GH₵80 → result | 4 | 4 | Unmeasured → unmeasured |
| Home → Chat question → calculation | 3 | 3 | Unmeasured → unmeasured; disclosure becomes a detail sheet |
| Home → Chat → edit essential → save → same conversation | 6 | 6 | Unmeasured → unmeasured |
| Home → set plan date → saved Home | 2 | 2 | Unmeasured → unmeasured |
| Home → My plan → remove Food with confirmation | 5 | 5 | Unmeasured → unmeasured |

Done after a payment result adds one activation in both versions. The new Home plan explanation opens in one activation and closes with Done in another. The early sample Pause opens in one and returns in another. There is no claim of reduced activation counts: this refinement reduces framing/repetition and improves surface behavior without adding mandatory steps to the measured payment paths.

## Layout targets and remaining verification

Source layout targets are 360×640, 390×844 and 412×915, plus narrow layouts, long names/amounts, enlarged text and keyboard-open forms. Main task text is not reduced to force a fit. Decorative art is reduced or omitted, optional arithmetic is secondary, and natural overflow remains available. The mobile app uses the viewport directly with safe areas; a desktop frame is restricted to desktop widths.

Justified scrolling includes history, conversation, long merchant/settings lists, legal material, expanded calculations, longer forms, unusually long names or amounts and enlarged text. On an exceptionally small keyboard viewport, Chat's workspace can also scroll so the composer remains accessible. The ordinary thread remains its own scroller.

**Rendered one-screen fit is not established.** The managed environment has no supported control-browser capability. The Sites workflow explicitly disallows starting a preview server, installing a browser or substituting another browser-control path in that situation. No fresh Home, entry, Pause, Chat or confirmation screenshots, recording, measured scroll distances, physical keyboard tests or actual enlarged-text device renders could be produced. Synthetic contracts and source sizing are not substitutes for that remaining device pass.

The attached Minna reference was recovered and inspected; its focused white sheet, dim background and restrained feedback informed this pass. No reference image is presented as a screenshot of this implementation. All live payments, bank/provider checks and verification remain simulations.
