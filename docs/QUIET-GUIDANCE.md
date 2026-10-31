# Quieter recurring pages

Shared presentation behavior for Everyday, Minna and Hibiscus, reviewed 26 October 2026.

## Money Box actions

Savings hack controls sit in the same action group as Fund this box and Transfer back, before metadata editing and archiving. A box without an attached hack has Add savings hack. An attached hack has its status and Edit, Pause/Resume and Cancel controls. Cancellation confirmation stays in that group and does not duplicate the Cancel button.

Rule descriptions, limits and recent saving activity remain below. Rule explanation is available in the closed How this Savings hack works disclosure. Saving, withdrawal, protection, consent and ledger rules are unchanged.

## First-use education

The additive page-guidance module moves only explicitly reviewed static educational copy into lower About disclosures. Guidance starts expanded on the first distinct visit, then returns collapsed. Got it closes it immediately without rerendering the page; the native disclosure can always be reopened.

Same-visit rerenders retain the current open/closed state. Leaving a page also collapses guidance in retained task-parent DOM, so returning from a sheet stays quiet even when the parent is not repainted. Different Money Boxes share a page preference rather than repeating the same introduction per box.

Seen and dismissed preferences live in the existing profile state. State replacement and owner changes cannot inherit another profile's mounted disclosure state. Edition identities and saved namespaces remain separate.

## Scope

Reviewed copy covers Money Boxes, balances, expected money, Budget editing and categories, funding/transfer choices, requests, virtual cards and their Cards root, Money Story and its root, profile/settings, activity, and support pages when the specific static copy exists. Plan and Pay do not gain filler where no matching educational text is present. Existing Money Box and Money Story explainers are reused.

No blanket paragraph selector hides page content. Current amounts, dates, status, payment consequences, Budget amount semantics, active warnings, empty-state help, form hints, Savings hack examples/consent/limits, account protection, legal and onboarding copy, simulation disclosures, review and authorisation remain outside optional education.

## Verification

- Mounted Savings hack UI tests verify action-group order, lower supporting details, all lifecycle actions, cancellation and consent.
- Page guidance tests verify first visit, repeat visit, reload, manual dismissal/reopening, retained task-parent DOM, correct profile scope, and preservation of unfinished forms.
- Independent safety tests compare protected transaction, approval, onboarding and disclosure routes and prove that guide interaction does not alter financial state.
- Each peer edition runs its full regression and contract gate against the Everyday source. Browser geometry is checked separately.

Final automated gates passed: Minna 9 contracts and 79/79 regression files; Hibiscus 9 contracts and 87/87 regression files. Both include 22 mounted Savings hack UI, 32 page guidance and 25 independent safety checks. Browser inspection remains a separate step.

Final browser QA: 240 guidance layouts and 272 Savings hack layouts per edition (512 each), including 120 first/returning comparisons, reported no overflow, clipping, inaccessible controls, changed critical content or incorrect guidance state. Everyday `tests/manual-layout/QUIET-UI-AUDIT.json` retains source hashes and counts.
