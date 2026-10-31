# Lumo Clarity Edition — focus and recovery refinement

Working URL: https://lumo-clarity-edition.oness15.chatgpt.site/

## Preserved version and scope

This pass starts from published Clarity v6, commit `a991acfd47c5ee85eb2cc34fcb40cd3e9b868ded`. Before editing, it was tagged `checkpoint-clarity-before-completion-pass-20261018` and bundled. The archive-backed Sites version `appgprj_6ad4c822fe3881919757091e91e2ce9f~appgver_16c7fcd415d881918323eb2d22ef40ca` remains the durable restore point.

[Current inventory](CURRENT-SCREEN-INVENTORY.json) identifies all 111 registered screens with their purpose and journey/treatment family. The previous detailed [state inventory](SCREEN-INVENTORY.json) and [baseline interaction traces](BASELINE-INTERACTIONS.md) remain available. Bootstrap loading, empty records, recoverable validation, pending, failed and successful transactions retain their existing behavior. The added draft tests exercise dismissal/reopening and provider-failure recovery explicitly.

Exact wordmark and font bytes, patterned illustration files, monochrome foundation, selective intelligence accent, five navigation destinations, financial engine, Pause triggers, transaction states and `lumo-clarity-edition-v1` saved information are preserved. Both original reference Sites remain separate.

## Changes

The colleague's feedback is applied as three Home groups rather than an arbitrary limit of three controls:

1. **Your money:** available balance, prominent left-after-plan figure, one allocation explanation, compact contextual illustration, breakdown and date controls. Existing privacy still masks exactly the two requested summaries. Important plan gaps remain visible.
2. **Money actions:** Send money and Campus Pay stay immediate. Add money, Request money and Money Story share one clearly labelled expandable shelf. Empty accounts retain the visible first-funding action. A saved payment remains a visible contextual continuation.
3. **Recent activity:** one compact latest record and the existing route to full history. Navigation remains visible and uses the established active accent.

The shelf is a native HTML disclosure with keyboard support and a visible plus/minus indicator. Its open state is retained in the Home navigation context. Opening a task leaves the parent mounted. If a completed task changes the account and Home must rerender, the shelf remains open and focus returns to an equivalent control when available.

**Draft recovery defect fixed:** v6 captured a typed top-up but `startMomoFunding()` replaced it with a new blank draft on reopening. The baseline reproduction saved GH₵125, closed and reopened, then observed a different draft ID and empty amount. Unsubmitted form/review drafts now resume. Pending requests reuse the same reference; confirmed funding starts fresh; a failed funding attempt retains its entered details for a new explicit review. No draft restoration adds money or submits a request. Unsubmitted money requests likewise resume until actually created. Closing captures permitted ordinary fields through the existing input handler, including a checkbox whose last change event has not fired. PINs and verification secrets remain excluded.

**Review density:** the large amount is labelled once; recipient, payment method/destination, fee and total remain visible. One repeated Amount row is removed. Consequences remain on entry and, when triggered, Pause; Review still requires separate authorisation.

**Keyboard actions:** real form submit buttons use sticky positioning only in the keyboard-open task state, with matching field scroll margins and body scroll padding. No fake keyboard, system bar or disabled scrolling is introduced. This is implemented but requires actual browser/keyboard verification.

**Results:** confirmed payment uses an ink status symbol. Pending, failed, reversed and delivery states use neutral outlined marks with explicit wording, avoiding a reassuring lime success background on an unconfirmed result. The existing transaction state continues to control the result.

Existing content-sized sheet treatments, focused Pause comparison, optional arithmetic, independent Chat thread, saved-answer calculation sheets, concise conclusions, keyboard viewport handling and the early labelled sample Pause are retained from v6.

## Validation

**27/27 suites pass; 49/49 JavaScript syntax checks pass.** This includes 68 retained-parent task checks, 31 native-refinement checks and nine new focus/draft recovery checks. [Full machine evidence](completion-pass-check-results.json).

The new checks cover three Home groups; disclosure state; unsent funding after Close/backdrop/Back; unsubmitted request recovery; new draft after request creation; shelf/focus restoration after a real simulated credit; failed funding retry details; pending-reference reuse; deduplicated Review and separate PIN; keyboard/status CSS contracts. Existing suites cover privacy, navigation contrast, originals/asset integrity, onboarding and recovery, financial engine, linked pending costs, errors, changed-plan review, reduced motion, repeated submissions and actual transaction results.

| Fixture scenario | Verified result |
| --- | --- |
| Starting facts | GH₵600 available; GH₵350 remaining essentials; GH₵100 goal allocation; GH₵150 after plan |
| Extra GH₵80 | GH₵520 available; GH₵70 after plan |
| Extra GH₵140 | GH₵460 available; GH₵10 after plan; existing Pause thresholds unchanged |
| Extra GH₵280 | GH₵320 available; essentials GH₵30 short; goal allocation GH₵100 uncovered; total plan gap GH₵130 |
| GH₵80 linked to an essential | GH₵520 available; essentials GH₵270; goals GH₵100; GH₵150 after plan |

Entry, Pause and Chat use the shared engine. Previewing, dismissing or restoring a draft never authorises a payment. Goal allocations remain commitments rather than an additional account debit. Expected allowance remains unreceived money; no date forecast is invented.

## Interaction comparison

Counts are actual semantic button/disclosure activations, excluding input focus, typing, keyboard dismissal and native picker/select internals. They are not measured physical-phone taps.

| Task and end point | v6 before | Updated | Required rendered scrolling before → after |
| --- | ---: | ---: | --- |
| Home → Campus Pay GH₵80 or GH₵140 → result | 5 | 5 | Unmeasured → unmeasured |
| Home → Campus Pay GH₵280 with Pause → result | 6 | 6 | Unmeasured → unmeasured |
| Home → linked Campus Pay GH₵80 → result | 5 | 5 | Unmeasured → unmeasured |
| Existing Pause → edit GH₵280 to GH₵80 → result | 4 | 4 | Unmeasured → unmeasured |
| Home → Chat question → calculation | 3 | 3 | Unmeasured → unmeasured |
| Home → set plan date → saved Home | 2 | 2 | Unmeasured → unmeasured |
| Funded Home → Add money chooser | 1 | 2 | Unmeasured → unmeasured |
| Funded Home → Request form | 1 | 2 | Unmeasured → unmeasured |
| Funded Home → Money Story | 1 | 2 | Unmeasured → unmeasured |

Done after a payment result adds one activation in both versions. An empty account's first-funding action remains direct. The one extra activation for secondary tools is the explicit cost of reducing Home's initial visual competition. No empirical usability advantage or superiority over Minna/Monzo is claimed.

## Remaining limitations

The implementation targets 360×640, 390×844 and 412×915, narrow layouts and enlarged text. Existing synthetic viewport tests verify geometry inputs, unchanged input nodes/values and focus/scroll contracts. They do not establish rendered fit.

A supported control-browser capability is unavailable. The Sites managed-environment workflow requires skipping browser QA rather than installing or substituting another browser path. Consequently, no fresh screenshots of Home, entry, Pause, Chat or confirmation, real keyboard checks, enlarged-text renders, measured scrolling or verified one-screen fit can be supplied. No mockup is presented as a screenshot.

Natural scrolling remains available for history, conversations, expanded shelves/calculations, long names and amounts, enlarged text, substantial forms and unusually short keyboard viewports. All payments, banking/provider actions and verification remain simulated.
