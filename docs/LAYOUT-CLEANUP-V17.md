# Lumo Everyday Edition — overflow cleanup

22 October 2026. Applies to the existing Everyday Edition project only.

## Recoverable starting point

- Published version 16, source `08f1b97a975f9a51642ef0921891085281f1918a`.
- Local checkpoint: `checkpoint/pre-overflow-cleanup-v17`.
- Existing saved information and storage key are unchanged.
- Wordmarks, typeface, illustration assets, calculations and account model are unchanged.

## Changes

- Flexible rows and grid tracks now allow long names, references and amounts to wrap instead of forcing the screen wider. Native date, select and number fields stay within their available track.
- Inputs and adjacent actions no longer compete for a full row each. Verified phone details, support forms and checkbox labels use explicit flexible layout.
- Home can give a large balance the full row before its illustration wraps. Its financial hierarchy remains intact.
- Payment entry has a shorter source hint and removes excess line-height from the amount field. Currency stays together. Payment destination artwork is smaller on short screens.
- A zero-fee Pause avoids repeating the amount already shown in the total. Short-view spacing and the comparison are compact enough to keep the direct consequence and both main choices visible together for the standard checked case.
- Expanded calculations, partner simulation messages, Money Box statuses, receipt references and result descriptions wrap naturally.
- Fixed an undefined formatter in a valid merchant customer-payment preview. It now uses the shared money formatter.

No financial rules, three-second Pause reading period, 90 ms continuation hold, authentication or confirmed-success logic were changed.

## Coverage and evidence

- Inventory: 120 view templates in nine journey families: main navigation, onboarding/access/recovery, payments/funding, requests, Budget/savings, activity/insights, profile/account/support, merchant and preview/test tools.
- Rendered geometry: 204 fixtures, covering every view plus 84 populated, empty, validation, pending, failed, success and expanded variants. No renderer errors or fallback templates.
- Sizes: 360 × 640, 390 × 844, 412 × 915, 320 × 640, and 320 × 640 with 150% root text size.
- Result: all 1,020 settled-layout combinations completed with zero horizontal overflow findings.
- Behavior regression: all 21 selected test files pass, with 249 named checks. Includes account/signup, navigation, Home money story and privacy, payment sources, linked Budget costs, Pause timing/hold, edits, stale quotes, duplicate submission, pending/failure, Money Boxes, protection and support return paths.
- All shipped JavaScript passes syntax checks; `git diff --check` passes.
- Added focused merchant/support runtime coverage and reusable view fixture generation. Migrated archival tests from virtual goal commitments to the existing funded savings model; no calculation engine changes.

### Manual live checks

At 360 × 640, normal text:

| Surface | Evidence |
| --- | --- |
| Payment entry | Review button bottom moved from about 644 px to 616 px; fully inside the viewport. |
| Standard revealed Pause | Edit amount and Continue to PIN end at about 638 px; both visible without scrolling. |
| Edit from Pause | GH₵500 input retained; changing to GH₵80 updates the decision and opens Review. |
| Covered Review | Main Continue action ends at about 502 px. Separate PIN screen follows. |
| Confirmed simulated payment | Done ends at about 529 px. Operational balance changes only after confirmation. |

Also checked Home, Plan, Budget selection/date edit, Campus Pay, Chat opening/answer/calculation and global balance privacy. At 320 px with 150% text, Chat keeps its composer visible and the thread scrolls independently. Money Story and account views allow normal vertical scrolling where required.

### Limits and justified scrolling

The geometry sweep uses actual view HTML and actual styles in a browser, with animation suppressed to measure settled layout. It does not substitute for end-to-end interaction testing. Live checks and behavior tests cover separate concerns.

Long forms, history, conversations, legal text, expanded calculations, long recipient names, protection explanations and enlarged text intentionally scroll vertically. At 360 × 640, Home's payment actions fit; the lower Money Story can require a short scroll. No global scroll lock, font shrinking or financial-text truncation was introduced to make content fit.

A physical phone keyboard and operating-system text scaling were not available in this environment. CSS enlarged text and viewport behavior were checked; a real iOS/Android keyboard pass remains appropriate before production release. All money, identity checks, SMS, partner codes and support outcomes remain simulations.

## Reproduce locally

Run `node tests/build-layout-fixtures.cjs` to create temporary `dist/layout-fixtures.json`. For browser inspection, temporarily copy the three files from `tests/manual-layout/` into `dist/` and start the managed preview. Open `layout-sweep.html`, then Run all layouts. `layout-audit.html` provides phone-size controls around the actual interactive app.

Remove those four temporary files from `dist/` before packaging. The lab, synthetic fixtures and testing controls are not published as part of this update.

Screenshots and final regression output are under `docs/qa/v17/` in source only.
