# Experience refinement validation · 24 October 2026

## Automated evidence

Both editions passed all **55 approved test files**, with no failures. The Minna gate also passed all **nine edition-contract checks** covering project identity, shared source, storage isolation, routes, financial outcomes, pending/failure/idempotency, QR/biometric simulation, protected withdrawals and peer parity.

Full logs:

- `lumo-experience-everyday-final.txt`
- `lumo-experience-minna-final.txt`

The added connected integration suite contains 16 checks through the actual shipped module order. It covers saved-item editing across Chat and the form; pending/stale save guards; food/lunch clarification; uncertainty and resource statements; immutable confirmed-result snapshots; pending resolution and duplicate submission; linked-cost fulfilment; dated review exclusions and unknown spending; historical classification; missing start dates; native-order contextual handoffs; original-parent return; remaining Pause reading time; explicit next-period confirmation; and invalidation after a ledger change.

The financial contract retains the fixture of GH₵500 operational money, GH₵350 remaining Budget and GH₵100 in separate savings. Extra GH₵80 spending produces GH₵420 available and GH₵70 left after Budget. A linked GH₵80 Food payment fulfils that commitment once, leaving GH₵270 of Budget costs and GH₵150 outside them. Separate savings are not deducted again. The broader suite also covers comfortable, narrow, shortfall, pending, failed and repeated-payment paths.

## Browser checks completed

These checks use disposable sample fixtures, not visitor records:

- Returning Budget: change a cost in Chat, review, return to the form, edit and explicitly save the same item.
- Relative cost wording: the proposed total remains editable and requires review/save.
- Period review: choose comparison/renewal dates and prepare the next Budget through the existing separate confirmation.
- Pause at 360 × 640 CSS pixels: Edit and Continue remain in the initial viewport; the measured action bottom was 620.94 px.
- Contextual Pause help: return to the same GH₵280 payment without authorising or submitting it.
- Confirmed GH₵80 extra spending: GH₵420 available and GH₵70 left after Budget.
- Both editions: 360 × 640, 390 × 844 and 412 × 915 layouts inspected across Budget, Chat and payment tasks. The Minna Pause action bottom was 620.19 px at 360 × 640.
- Confirmed result spacing adjusted without reducing type or touch targets. Done fits in the initial 360 × 640 view, including the Budget effect.
- Contextual Chat return labels wrap clear of the centred wordmark. Protected Money Box help contains no partner phone or approval code and cannot authorise a release.
- Missing historical start dates open a date-selection sheet instead of inventing a range.
- At 320 × 640 and 150% text, the period review has no horizontal overflow; Adjust next Budget remains reachable through natural scrolling.
- A settled 390 × 480 viewport keeps the Minna guided Chat composer at y371–421, above the 480 px boundary. This resize is a keyboard-space proxy, not a physical operating-system keyboard test.
- The optional Pause tools, Money Boxes below the Budget list, large text, and substantial Budget forms can require scrolling. Main Pause Edit/Continue choices fit at ordinary text size. Conversation and detail scrolling remain intentional.

After the final Pause tools change, focused contextual, connected-integration and Pause checks passed again. The nine edition-contract checks passed against the final shared JavaScript. Later refinements changed CSS spacing only; result and contextual checks passed again.

Natural scrolling is permitted for long lists, conversations, detailed calculations and enlarged text. The test DOM validates semantics and state transitions, not rendered geometry.

## Student verification and limits

`STUDENT-VERIFICATION.md` is a prepared unassisted testing protocol, not completed research. It asks students to explain the Budget, the consequence of a payment, the distinction between projection and confirmation, the purpose of source selection and the limits of recorded-spending comparisons. No real student usability results are claimed.

Physical iOS/Android keyboards, hardware biometrics, real camera/device compatibility, native screen readers and live payment/identity services were not tested in this pass. The prototype has no live AI, bank integration, SMS or call-centre connection. Partner approval and biometric authorisation remain simulated.

Period comparisons use current saved totals and explicitly known or chosen dates. They cannot establish spending outside Lumo or reconstruct an older Budget version that was not recorded. Pending payments remain separate, and refunded payments are excluded entirely rather than treated as new spending.
