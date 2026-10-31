# Home: understand and receive money

The user’s attached `image(20261018-231904).png` was inspected directly. Its layout reference is the large illustration above the money, open white space, strong type and compact expandable information row. The implementation adapts that composition to the existing Lumo identity; the reference’s artwork, branding, system bars and mobile controls are not copied.

## Current layout

1. Exact Lumo wordmark with working updates/profile controls; the personal greeting remains below that row.
2. [Current clarity-mirror illustration](HOME-MIRROR-ART.md) over the restrained monochrome Legon setting, full-width above the financial information. It grows with available viewport space between126px and300px; the whole illustration remains contained.
3. Separate available account balance, with dominant Left after your plan and one allocation explanation. Both summary figures retain the eye privacy control and background re-masking.
4. **Add money** and **Request money**, always directly available, including for a fresh or returning empty account. A payment-in-progress notice appears when outgoing money is reserved.
5. Compact Money Story: one leading-category conclusion, supporting seven-day amounts and one-tap detail sheet. Its calculations, fees, transfer scope and pending exclusions are unchanged.

Home has no Send money or Campus Pay shortcut and no saved-payment continuation prompt. The existing Pay destination retains send/merchant/bill journeys, pending payments, activity and the saved draft. No data, calculations, thresholds, authorisation or transaction states change. The old More money tools shelf is unnecessary because its two actions are now directly visible.

## Behavior and checks

- Add money and Request money open the existing task sheet and return to the same Home, focus and position.
- Existing money-out, balance/privacy and allocation calculations remain unchanged.
- Pay is still always visible in navigation. Home → Pay → Campus Pay → amount → review → applicable Pause → authentication → simulated result is exercised through actual rendered controls.
- Deep controller tests still exercise the retained-Home payment sheet API programmatically; they do not claim Home has a payment button. The actual Pay-entry test separately counts the real user journey.
- The normal Home → Pay → Campus → GH₵80 result now takes6 button activations, or7 with Done. The former direct Home Campus shortcut took5, or6 with Done. This additional navigation is the explicit choice to remove payment promotion from Home. Entry typing, native selectors and PIN input are excluded from button counts.
- Task-sheet, native refinement, completion, Home Money Story, production customer experience, navigation and contextual identity checks pass. JavaScript syntax and diff checks pass.

No supported managed browser controller is available. DOM and synthetic viewport checks do not establish real-phone visual fit, enlarged-text rendering, physical keyboard behavior or screenshots. Natural scrolling remains available; text is not shrunk or clipped to force the large illustration into a short screen.

## Recovery

Prior published v11: commit `d3276315275ffa075d0c52644e8ab5863afda18b`; archive-backed Sites version `appgprj_6ad4c822fe3881919757091e91e2ce9f~appgver_31e6b794d9088191a7f35ab933cefa65`. Local checkpoint `checkpoint-clarity-before-funding-home-20261018`. The two original prototypes are unchanged.
