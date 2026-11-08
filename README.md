# Lumo

A separate, fully interactive mobile-first Lumo prototype. Design references: Up's captured iOS interface and the interaction principles documented in [The Evolutionary Design of Up](https://up.com.au/blog/the-evolutionary-design-of-up/). Lumo uses an acid-lime accent, Ghanaian student context and its own feature set.

## Run and validate

Buildless ES modules, no installation or build required. Serve `dist/` over HTTP. In the managed Sites workspace: `sites-preview start /workspace/sites/lumo-new-experience`.

Run `npm test` for financial, navigation, onboarding and camera lifecycle tests. All monetary amounts in state and actions are integer pesewas. Camera access needs HTTPS or a browser-trusted local origin.

## Experience

- Focused signup with one purpose per page: name, phone, simulated SMS code, Ghana Card number, selfies, returned-details confirmation and PIN. Warm student-friendly copy, a live name greeting and small completion animations keep the experience conversational. Both sample accounts are created at completion; money preferences can wait until after signup.
- Available versus spendable balance, dated budgets, upcoming commitments, spending insights, privacy controls and reminders.
- Named Money Boxes, target/date saving pace, interactive savings pools, pull-to-save, contributions, withdrawals, locks and editable Savings Hacks.
- Payments through Lumo, MoMo and bank demo rails, recipient conversations, notes/reactions, review, timed Pause, PIN, statuses and receipts.
- Collect with an actual encoded request QR, shareable demo payment URLs and expected-money tracking.
- Complete incoming/outgoing IOU records, partial settlements, edits, cancellation and reminder text.
- All Your Money includes manually recorded cash, bank and MoMo balances, with named accounts, update times, editing and removal. Guided allowance recovery, Money Story and state-grounded local Money Chat with three mini-lessons.
- Lux is a lime-loop 2D companion throughout the app, with a black inner face, ivory features and a distinctive upper-right cut. The Pause Moment uses an amber screen, coral-orange worried Lux and one concise payment consequence. The same visual appears in Explore Lumo before signup and the signup tour. Full calculations remain in optional Payment details; payment rules, the three-second pause and PIN authentication are preserved.
- Group collections, member invitations/roles, contributions, reserved payouts, distinct approval thresholds, cancellation and final payout.

## Prototype boundary

Money, identity checks, PIN authentication, approvals and payment outcomes are simulated. No live bank, MoMo, Ghana Card, biometric or AI service is connected. The interface states these boundaries. Demo PIN: `1234`. Demo data is kept in localStorage; unfinished navigation and conversations are kept in sessionStorage. Settings offers a fresh account and a populated demo reset.

Settings → Try full signup enters the short signup directly while preserving the existing account. New visitors take the same focused pages before an empty local account is created. Name, phone, card number and selfies each have their own page. There are no front/back card photos, money questions or account-processing screens. Simulated OTP: `123456`. Demo Ghana Card number: `GHA-000000000-0`.

The Ghana Card page asks only for the number. The following selfie page has a short camera acknowledgement and one continuous front-camera session. Each centre/turn/blink prompt captures an actual photo before the next prompt; the feed remains running until all three are done. The third capture automatically starts a short verification animation. A successful demo response opens a dedicated details-confirmation page with the sample legal name, entered card number, date of birth, nationality and sex. The customer must explicitly confirm those details before PIN setup; a mismatch or failed response offers retry. The number and photos are not sent anywhere. Camera access never requests audio. Prompts are user-confirmed guidance, with no automatic movement detection, OCR, NIA lookup, face matching or identity verification.

Camera streams stop when leaving the step or hiding the page. The Ghana Card number, JPEG photos and object URLs exist only in memory. `persistableOnboardingDraft()` removes the number, returned record, verification attempt and camera proof from the saved copy without modifying the live draft. Neither account state nor browser storage contains the number or photos. Media is released on retake, exit, completion, reset and page unload. In-progress verification is cancelled on navigation or a hidden page; obsolete results cannot confirm a changed number. The confirmed sample legal name is used for both demo account holders, while the chosen display name is preserved. Saved text answers and phone verification can resume; the identity check must be repeated after exit/reload. Permission errors include retry guidance. The flow never substitutes a generated feed for a real camera.

Expected allowance and open incoming IOUs never count as held or spendable money. Budget reservations do not move funds. Savings and group funds are distinct. Payments, pending holds, failures, reversals, partial repayments and saving hacks use a shared validated ledger with idempotency guards.

Outside balances are manual snapshots, without bank connections or account credentials. They contribute to the full recorded-money total, while Lumo payments, planned commitments, savings contributions and the daily guide continue to use the Lumo ledger. Older saved accounts gain an empty outside ledger without losing existing data.

## Structure

- `dist/js/app.js`: shell, navigation, home, onboarding, sheets, demo PIN and celebrations.
- `dist/js/onboarding.js`, `onboarding-model.js`, `camera.js`, `dist/onboarding.css`: guarded signup, volatile media, real camera lifecycle and scoped styling.
- `dist/js/model.js`: financial state and validated mutations.
- `dist/js/payments.js`, `planning.js`, `life.js`, `chat.js`: complete journeys.
- `dist/js/ui.js`, `dist/style.css`: shared components and responsive styling.
- `tests/model.test.js`: meaningful money-invariant regression coverage.

## References and licences

Captured references are not a claim to reproduce every screen of the current Up release. Custom Lumo journeys extend the referenced patterns. System fonts and emoji are used. QR generation vendors `qrcode-generator` 1.4.4 by Kazuhiko Arase, MIT licensed; its notice is retained in `dist/js/vendor/qrcode.js`.

## Validation

The complete signup, first funding, dated budget, goal setup, payment review/Pause/PIN/status, saving contribution, conversational guidance, recovery and two-approver group payout were exercised in the browser. Home was checked at 390×844, 360×740 and 320×667 without page or horizontal overflow. The financial model has 26 passing invariant tests. Browser-specific haptics, device tilt and real biometric prompts are not claimed.

The navigation audit adds persistent main navigation on signed-in pages, a direct Groups section, explicit parent destinations, resumable full-page group and IOU setup, focused review edits, form restoration after PIN cancellation, and indexed native Back/Forward with completed-flow cleanup. See `NAVIGATION-AUDIT.md`. Route/history regression tests are included in `tests/navigation.test.js` and `tests/router.test.js`.

Outside-money regression coverage in `tests/external-money.test.js` and `tests/external-chat.test.js` checks manual balances, totals, persistence, old-state migration, invalid entries, duplicate submissions and Lumo-only payment guidance. Browser checks cover all three account types, edits, zero balances, duplicate names, reload persistence, cancellation and removal.

The focused signup is covered by `tests/onboarding.test.js` and `tests/onboarding-navigation.test.js`, including seven-page completion, old-route migration, no bypass of identity proof, number changes, private serialization, verification-result binding, explicit details confirmation, reload/resume, zero-funded accounts and preserved preview balances. A browser-history regression covers entry from an existing session. Live camera coverage in `tests/camera.test.js` checks no microphone access, permission errors, preview readiness, lens switching, track release, concurrent requests, camera disconnection, cropped JPEG snapshots, cancellation during encoding and object URL ownership. Onboarding tests also guard schema migration, fresh captures after reload and selfie requirements.
