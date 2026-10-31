# Compact UI refinement · 23 October 2026

Applied to Everyday Edition and Minna Edition, preserving their own branding, URLs, access, demo storage and existing customer records. No assets, fonts, payment calculations, Pause thresholds or authentication rules changed.

## Recovery

Both source repositories have `checkpoint-before-compact-ui-20261023` at the prior published commits:

- Everyday v26: d305dd5d3e76d2e5ad591a483b1e1d3e83ad9fe0
- Minna v8: e101057892ce7807cd19947cdc3567b48bc22d73

## Task structure

- One chrome title per task; no campaign headline or irrelevant fallback illustration in the new detail/edit sheets.
- Home retains the after-Budget amount as the primary figure. Daily-guide caption is one short line; dates and arithmetic belong in its detail sheet.
- Optional history suggestions and Budget explanations sit in the Plan tools/details shelf. The main Budget and Money Box actions remain visible.
- Recorded-spending suggestions use aligned item/weekly-total columns, one live draft result and one primary Review action. Review uses existing final confirmation and saving authority directly, with editable costs preserved.
- First Budget review uses compact progress, one financial conclusion, supporting account/Budget values, optional detail and grouped editing/later choices. Fresh-period review retains a clear replacement notice and expands longer item lists on demand.
- Pause groups recipient/fee/total, keeps the consequence and hypothetical comparison prominent, and uses compact secondary alternatives. Edit/Continue remain peers. The 900 ms arrival, three-second reading interval, 90 ms confirmation hold and separate authorisation are unchanged.
- Dated Chat answers use a short conclusion and guide, with complete calculation/caveats in the existing disclosure. Uncovered dates and stale expected allowance dates remain visible when relevant.

## Interaction comparison

| Task | Before | After |
| --- | --- | --- |
| Open suggestion to save first Budget | Use draft → full editor → review → save (3 taps after suggestion) | Review → save (2 taps after suggestion) |
| Plan to saved suggested Budget | Suggest → use draft → review → save | Tools → suggest → review → save; same total, less competition on Plan |
| First Budget review, 360×640, Everyday fixture | Save ended at y657, below the viewport | Save ends at y560; edit and later choices end at y620; no scroll |
| Standard shortfall Pause, 360×640 | Tall alternatives and repeated receipt context | Headline, comparison, alternatives and Edit/Continue fit; lower optional actions/details scroll |
| Chat with 390×480 available height | Verbose dated explanation | Short answer; composer ends at y420/421 in Everyday/Minna; no app-shell scroll |

## Validation

- Both editions: approved 43-file regression set passes. Minna: nine edition-contract checks, peer behavior/source parity, storage isolation and feature routes pass.
- Final shortened outlook copy: all 22 focused checks pass in both; history editor/review: all 18 focused checks pass.
- Regression covers the financial fixtures, planned-payment accounting, pending/failure/recovery, duplicate submission, cancellation, focus restoration, history/back, privacy, reduced motion, Pause timing/hold, and separate PIN/biometric simulation.
- Browser: 360×640, 390×844, 412×915, 320×640 and 150% text; tested Budget suggestion/edit/review/save, daily detail sheets, payment entry and shortfall Pause, Home privacy, Chat and return from details.
- Four suggested items fit with Review visible at 390×844. Two-item suggestion and the final Budget review have primary actions visible at 360×640. The currency prefix stays together.
- At 320×640/150% text, review scrolls naturally with zero horizontal overflow. Buttons remain reachable.
- Review of changed files confirms approved logos, typefaces, illustration assets, storage keys and financial engine are unchanged.

## Limits and deliberate scrolling

Long lists, expanded arithmetic, multiple Budget edits, larger text and keyboard-constrained forms retain natural scrolling. At 360×640, Pause's secondary exit/details area may require scrolling; key Edit/Continue choices remain visible and close/back is always in chrome. Plan may scroll slightly on the smallest target while both principal actions remain reachable. No global scroll disabling or text-size squeezing was introduced.

Keyboard QA uses a reduced-height browser viewport, not a physical iOS/Android keyboard. Reduced-motion and authentication paths are exercised by the shipped-runtime regression harness. This is still a simulation with no live payments or real identity/biometric verification.

Screenshots and the reusable local audit fixture are stored alongside the implementation. The temporary audit page is excluded from the deployed dist directory.
