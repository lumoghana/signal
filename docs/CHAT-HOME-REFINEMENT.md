# Home, Chat and interaction cleanup · 23 October 2026

## Changes

- Swapped the Home controls: Chats and its swipe hint are in the top-right header; the shared Hide/Show control is beside the greeting. Privacy still masks available money, money after Budget and savings together.
- Operational account sits beneath Everyday money. Both account roles remain visible, including Savings account beneath Money Boxes. Long greetings wrap. A long main monetary figure takes the illustration's space rather than stacking a large illustration below it or clipping the number.
- Chat uses 14px message/supporting text, 16px financial conclusions and tighter turn spacing at normal scale. Actions keep 44px targets, and the composer remains 16px. Enlarged text remains supported. Opened suggestions and spending tools scroll within a bounded area instead of pushing the composer out of view, including in the Minna presentation.
- Rebuilt gesture ownership: left from Home opens Chat; right from Chat returns Home. Deliberate horizontal drags can start on financial cards and conversation actions. Vertical scrolling stays native. Direction locking, modern touch streams, pointer cancellation, multiple contacts, screen edges and generated post-swipe clicks are handled. Inputs, privacy controls, navigation, headers and sheets keep their own interactions. Visible tap controls remain available.
- Fixed stale form restoration between different shared payments and repayment references; mode/friend changes refresh the displayed shares. Fresh Budget drafts have distinct form contexts, so a discarded draft cannot reappear in the next one. Explicit saving/notification preference Cancel discards the edit; Save completes it, while Back/X can retain an unfinished draft.
- Historical money-story actions now ask Chat about the exact dates displayed. Long update and story-payment names wrap without pushing financial amounts off screen.

## Validation

- **455 named behaviour checks in 32 current test files pass in each edition.** Nine edition contracts also pass, including source parity, independent storage, financial scenarios, pending/failure, duplicate submissions, QR, biometric demo and protected Money Box withdrawals.
- Seventeen dedicated gesture regressions cover modern pointer cancellation with the continuing touch stream, dual-event deduplication, vertical ownership, card and conversation swipes, cancellation, clicks, forms/sheets, selected text, account locks and reduced motion. Account calculations, Pause timing and authorisation were not changed.
- Render/link audits cover all 140 views and their registered actions/assets. No current regression was removed. Privacy placement assertions were updated to the user's requested position.
- Browser QA inspected both identities at phone widths, including 360 × 640, 390 × 844 and narrow layouts, with a 390 × 480 reduced viewport and 150% text. Chat conclusions measured 16px in both editions; the composer measured 16px normally and enlarged with the user's text scale. Open tools remained bounded and the composer remained visible. Long-name/large-figure Home fixtures at 320 × 640 and 150% text had no horizontal overflow in either account card.
- The ordinary Home at 390 × 844 shows accounts, actions and money story together. Small phones, enlarged text, long names and substantial forms may need natural scrolling. Content is not globally clipped or text reduced to force a fit.
- Screenshots are in `docs/qa/chat-home-refinement/`. The QA page in `tests/manual-layout/refinement-audit.html` uses disposable local sample fixtures and is excluded from the published application.

The managed browser does not provide real iOS/Android touch or an on-screen keyboard. Touch delivery is covered by mounted gesture tests; actual-device gesture feel, OS keyboard transitions, camera and biometric hardware remain device QA. No simulation is presented as a live payment or external notification.

## Recovery and isolation

Checkpoint: `checkpoint/pre-chat-layout-fix-20261023` in both checkouts. Before this pass, Everyday was published version22 at source `100623597925ff6d4d2baf5336dbec1dd718362b`; Minna was version4 at `e59c1067d07fe5e01cfc0b15dffc00bbf34ef0a1`. Published history and commit ancestry retain these versions. The same project IDs, public audiences and independent demo storage keys are preserved. Campus Pilot and Clarity Edition were not modified.
