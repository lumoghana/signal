# Sign-up alignment and visible balances

The v19 pass responds to student feedback about inconsistent sign-up alignment and difficulty finding the balance eye control. The approved identity, Home illustration, calculations, navigation, saved information and simulated service boundaries are preserved.

## Setup and sign-in

Dedicated setup and account-access screens share an `onboarding-page` layout owner. Their top bars use equal 44px side columns and a flexible centred route label. Headings, explanations, form labels and consent copy follow the same left text edge; long content wraps naturally. Field labels use explicit spans rather than a mixture of bare text and spans. The phone prefix and input share a grid with a flexible input column. Consent checkboxes align with the first line of their text. OTP and PIN digits remain intentionally centred inside their fields, while the labels align with the rest of the form.

The checks do not establish real-phone rendered alignment. There is no supported managed browser controller in this environment. Existing navigation, security, retry and validation behaviour is retained.

## Balance visibility

- A fresh unlocked load, successful sign-in or completed sign-up shows the account balance and Left after your plan. New sample accounts show their actual sample values, including zero where applicable.
- A bordered eye-and-text button says “Hide balances” or “Show balances.” It has a minimum 44px target, a visible keyboard focus outline and accessible state/controlled-region labels. It sits beside a stacked available-balance label and amount so the words fit without compressing the numbers.
- The toggle changes exactly those two summary values, retaining Home DOM, focus and scroll. Allocations, Money Story, shortfalls and payment details stay visible.
- Manual hiding is session-only and survives navigation/sheet round trips. Backgrounding, page departure, back-forward cache restoration and locking hide the values. An ordinary initial `pageshow` does not immediately conceal a fresh Home. Failed sign-in never reveals amounts; successful sign-in starts a visible session.
- No money, transaction state or stored account information changes through the visibility control.

## Validation

Production experience checks cover normal sign-up, 95 customer destinations, first-open visibility, visible toggle labels, hiding/revealing without focus or scroll movement, background/cache/lock behaviour, unsuccessful and successful sign-in, financial scenarios, pending/failure and duplicate submission. The actual-index Home (13), sheet (71), native refinement (32), completion (10), contextual artwork (30), navigation (9), broader experience and 15 declared contrast-pair checks pass. JavaScript syntax and diff checks pass. Synthetic viewport contracts are not rendered phone or physical keyboard tests.

## Recovery

Previous published v18: commit `0f35745391414b08533e7ffee3596c41bef05ec1`; archive-backed saved version `appgprj_6ad4c822fe3881919757091e91e2ce9f~appgver_79f1602ad8a48191afb626d04381b223`. Local checkpoint: `checkpoint-clarity-before-signup-visibility-20261019`. Both original prototypes and this project's storage key remain unchanged.
