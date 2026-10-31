# Validation · Guided Budget · 24 October 2026

Both editions: 45 approved regression files pass, including 58 guide controller checks and 13 UI integration checks. Minna's nine edition contract checks and explicit shared-source peer comparison pass. Existing financial, payment, Pause, onboarding, funding, savings, privacy and accessibility checks remain in the approved run.

## Browser observations

- Everyday, 360×640: Create a Budget → Build it with Lumo opens full-screen Chat automatically, with one introduction. One sentence, “Food 250 and transport 100 for seven days”, prepares exactly those two costs and GH₵150 outside the draft Budget.
- Guided review shows named costs. On 360×640, Save ends around y477 and editing/later controls around y537. Optional calculation/expected-money details may scroll.
- Save returns to the same Chat with one clear saved confirmation. Home shows GH₵500 available, GH₵150 after the saved Budget, and GH₵100 still in separate Money Boxes. No payment or savings transfer is introduced.
- A manual Food250 entry survives Continue in Chat. Help me estimate → “30” → Seven days produces GH₵210, with the multiplication explained, before any save.
- Pause/resume preserves that draft. In 390×480 available space, the composer ends at y420 in Everyday and y421 in Minna, with no app-shell or horizontal overflow. Conversation scrolls independently.
- Minna: confirmed first-funding prompt offers guided/direct routes. Guided handoff opens Chat without another tap; the same example, review and saved result agree with Everyday. On 360×640 Save ends around y499 and editing/later controls y559.
- 320×640 with 150% text: zero horizontal overflow in Chat and guided review; the conversation and longer review scroll naturally. Composer remains visible (around y545/546).
- 390×844 and 412×915 layouts were also inspected. The local audit's outer-page toolbar can overlay an iframe header when the entire test fixture is taller than the browser; restoring the fixture viewport removes that test-harness obstruction. The customer app has no such toolbar.

## Coverage and limits

The unit/integration checks cover partial amounts, lecture-day counts, unsupported/ambiguous input, concept questions, known-history evidence, old-choice replay, pending payments, paid coverage, concurrent saved-cost/allowance changes, deliberate stale-draft recovery, historical projections, explicit Save, duplicate Save, navigation/back and lock/privacy guards.

A browser-specific history order was found: native popstate could briefly restore the old parent while task history had already returned to Chat. The guide now acknowledges the existing destination through the task controller's navigation queue and reconciles the outlet without duplicate history or delays. A dedicated native-order simulation check and the actual browser journey pass.

Keyboard validation uses a reduced-height browser viewport, not physical iOS/Android hardware. The existing reduced-motion regression paths pass; the guide adds no decorative animation or timer. This remains a local, bounded prototype conversation, with no external AI service or live payments.
