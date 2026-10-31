# v5 baseline: screens and interactions

This records the deployed Clarity Edition **before v6 refinement**, pinned to commit `5b2fde1c1fb97b634e7a9052828e7378bc448c16`. It is a baseline, not a claim about the final v6 interface.

The source was copied with `git show` into an isolated temporary tree. The existing actual-index DOM harness loaded that copy's real script order, rendered its views, and activated its actual controls. No production source was changed for this inventory. The exhaustive route inventory, state notes and interaction traces are in [SCREEN-INVENTORY.json](SCREEN-INVENTORY.json).

## Fixture and measurement

The signed-in fixture has GH₵600 available, GH₵200 Food and GH₵150 Transport remaining, GH₵100 allocated to Laptop, and GH₵150 left after the plan. It has no transactions, conversations, expected allowance or plan period. Home balance privacy starts hidden. The clock is fixed at 18 October 2026, 12:00 UTC. All records are isolated sample data.

An **activation** means one real button or disclosure-summary activation. Counts exclude input focus, typing, keyboard dismissal and native select/date-picker internals. Field entries are recorded separately. These are exact semantic control counts for the paths below, not physical-phone tap counts. The helper does not implement the browser's native `<details>` toggle: the actual summary is activated, then its `open` attribute is set explicitly for the calculation assertion.

No supported browser was available. Scroll distance, above-the-fold fit, physical keyboard obstruction, larger-text layout and animation appearance remain **unmeasured**. CSS dimensions below describe source rules, not observed device layout.

## Measured journeys

| Task and exact start | Actual control sequence | Activations to stated end | End and separately entered values |
|---|---|---:|---|
| Reveal balances; hidden Home | Show balances | 1 | Home; available and plan-derived figures visible. No money changes. |
| Full breakdown; hidden Home | Balance details | 1 | Balances task. No money changes. |
| Campus Pay GH₵80; hidden Home | Campus Pay → Akua’s Kitchen → Review payment → Continue → Pay | 5 | Confirmed simulated result: GH₵520 available / GH₵70 after plan. Amount and sample PIN entered separately. Done adds one activation to return Home. |
| Campus Pay GH₵140; hidden Home | Campus Pay → Akua’s Kitchen → Review payment → Continue → Pay | 5 | Confirmed simulated result: GH₵460 available / GH₵10 after plan. Amount and sample PIN entered separately. Done adds one to return Home. |
| Campus Pay GH₵280; hidden Home | Campus Pay → Akua’s Kitchen → Review payment → Continue → Continue to PIN → Pay | 6 | Confirmed simulated result: GH₵320 available / GH₵130 plan shortfall. Amount and sample PIN entered separately. Done adds one to return Home. |
| Campus Pay GH₵80 linked to Food; hidden Home | Campus Pay → Akua’s Kitchen → Review payment → Continue → Pay | 5 | Confirmed simulated result: GH₵520 available / GH₵270 remaining essentials / GH₵150 after plan. Amount, Food selection and sample PIN entered separately. The payment fulfils the existing allocation once. Done adds one to return Home. |
| Edit GH₵280 to GH₵80; already at unsent Pause | Edit amount → Review payment → Continue → Pay | 4 | Confirmed GH₵80 result: GH₵520 available / GH₵70 after plan. Changed amount and sample PIN entered separately. Reaching the starting Pause from Home takes four activations; Done after result adds one. |
| Ask and expand calculation; hidden Home | Chats → Send question → See calculation | 3 | Answer calculation expanded: GH₵30 essentials / GH₵100 goals / GH₵130 total shortfall. Question entered: “Can I spend GH₵280?” |
| Edit plan from Chat and return; hidden Home | Chats → Send question → Review essentials → Food → Save essential → Close | 6 | Original conversation restored. Food changed to GH₵180; available remains GH₵600 and room becomes GH₵170. Question and amount entered separately. Editor reached at activation four; change saved at five. Calculation disclosure was not opened on this path. |
| Add plan date; hidden Home | Add a date → Save plan period | 2 | Home restored with date 25 October 2026. Native mode selection and date entry are separate; physical picker taps are unknown. |
| Short removal confirmation; hidden Home | My plan → Essentials → Food → Remove from my plan → Remove cost | 5 | Essentials list restored; Food removed; account remains GH₵600, no transaction. From the existing Food editor, opening and accepting confirmation takes two activations. Close adds one to restore My plan. |

Every recorded control sequence completed without a harness error. The inventory rendered all **108 registered screen views** with zero probe errors. Each route has a purpose, journey family, presentation mode, source-reviewed state variants and default probe controls. Source-reviewed variants are explicitly distinct from exercised states: this inventory does not claim that every error, pending or recovery branch was executed.

## Source-based density and repetition findings

| Surface | What the v5 source reserves or repeats | Implication for refinement |
|---|---|---|
| Home | Greeting and intro, available balance, main plan figure and allocations, plan-period invitation, privacy hint, breakdown link, illustration, payment and funding actions, money-story row and recent activity. Home art uses `clamp(184px,26dvh,216px)`; the short-viewport rule is 164px. | Many stacked elements precede activity. Preserve the derived-amount hierarchy while reducing surrounding framing. This is a source-height observation, not measured initial-view overflow. |
| Amount entry | Merchant/destination, 48px art (24px in keyboard state), 56px amount, plan select, hint, compact consequence, 54px Review action, optional note disclosure and Leave action. Review already precedes the optional note. | Keep the compact consequence and direct action order. Do not reintroduce a second full warning. Physical-keyboard behavior still needs browser QA. |
| Payment review | The payment is the large headline, appears again in the Amount row and again as Total. With a zero fee, all three values match. Recipient, method, destination and fee are also shown. | Use a single clear amount hierarchy with useful recipient and fee detail. The full consequence warning is already absent here. |
| Pause | Chrome title, pre-decision label, 60px art, direct consequence, considered payment, comparison, support note, goal gap, collapsed calculation, choice framing, equal Edit/Continue buttons, plan-link action, defer/cancel and unsent footnote. | The supporting framing is dense around an already clear consequence and real alternatives. Keep the consequential facts and choices together; remove repetition before shrinking text. |
| Initial Chat | Art uses `clamp(184px,26dvh,216px)`, followed by invitation, supporting copy, spending-view disclosure, intro bubble, four 48px starter rows, 56px composer and simulation boundary. | Illustration and starter choices consume substantial source-defined height. Prioritise a shorter invitation and usable composer. Initial-view fit is unknown. |
| Active Chat | Intro art is hidden after the first question. Answers use the outer conversation scroll, concise conclusion/support, expandable arithmetic and relevant actions. Spending-view and starter disclosures remain with the composer. | Preserve the working conversation expansion. Repeated contextual controls can be quieter or conditional without changing calculations. |
| Plan period | Header/subtitle, calendar art, mode select, conditional date field, explanation and Save/Cancel. | A short date task carries introductory framing. Native picker interaction cost is excluded from measured activations. |
| Short confirmation | Sheet chrome plus page heading/subtitle, illustration, confirmation paragraph and two 54px actions. | A short choice repeats task framing. Reducing this chrome can shorten the surface while retaining explicit approval. |
| Onboarding | Each stage has progress/header, stage art, title/explanation and applicable fields, consent and actions. | Preserve distinct validation, pending and attention states. No baseline evidence justifies bypassing required setup checks. |

The initial launch screen is bootstrap loading before synchronous script rendering. Provider pending, failed and confirmed results are separate product states. The global render-error fallback offers Try again / Go Home, while locked and closed-account guards redirect to their existing protected entry or records flow. Reduced-motion rules preserve the figures and actions; their rendered appearance was not assessed here.
