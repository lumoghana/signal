# Signal pages and contextual sheets · 31 October 2026

Entire destinations and multi-step journeys previously used bottom-sheet presentation. That made Profile, Money Boxes, Collect and similar screens feel temporary. The user approved opening those destinations as pages while keeping sheets for brief contextual choices.

## Result

Signal's task destinations now default to full pages. Each fills the measured app frame, uses the existing Back, Help and QR controls, and has one natural vertical scroller. Page chrome has no dimmed backdrop, rounded sheet edge, grab handle, header Close or drag-to-dismiss. Generic legacy body buttons labelled only “Close” are concealed on pages; meaningful Cancel, Done and financial decisions keep their native behavior. Generic page-name headings remain accessible and visually concealed as previously requested.

Pages use a labelled nonmodal region rather than an ARIA modal dialog. Normal Tab can leave the page's last control through the browser's default behavior. Escape moves back through the existing journey instead of dismissing the entire flow. Native QR handling and external recovery dialogs retain priority. The page frame follows the app's desktop bounds and the visible viewport when a keyboard reduces its height. Pause retains its dark frame and existing content, phase timing and actions.

Menu keeps its native modal drawer, retained navigation nodes, closing queue and focus behavior.

## When a sheet is appropriate

The adapter has fourteen explicit short-choice candidates:

- `addMoney`, `chatBankingActions`, `chatBankingChoice`, `chatBankingReplace`
- `paymentCancel`, `paymentPlanLink`, `requestConfirm`, `actionConfirm`
- `monoGroupDraftReplace`, `categoryEdit`, `moneySourceRemove`, `budgetDelete`
- `chatExpectedDate`, `everydayRepeatChoice`

Eligibility does not mean a route is always a sheet. A choice can be a sheet before a full-page step has been visited in that task, or when Back returns to a remembered original sheet entry. A new choice reached after a page stays in-page. The native controller retains the original primary page rather than each intermediate step; exposing that original page behind a later popup could show unrelated Home content. Whole-page content detected inside an eligible route also stays a page.

For example, Home → Add money is a short sheet; choosing Mobile Money opens a full form page; Back restores the original Add money sheet over Home. A cancellation decision reached inside a payment journey remains in-page and keeps the same explicit native draft decision.

## Implementation boundary

`dist/signal-navigation.js` runs after `signal-payments.js` and before the final platform runtime. It adds presentation, accessibility semantics, frame measurement and page keyboard/drag handling around the existing guarded task controller. `dist/signal-page-chrome.css` supplies page geometry within the existing Signal style layer. The entry and edition manifest include the new adapter and focused tests.

The native controller remains authoritative for route history, captured fields, drafts, payment guards, retained parents, scrolling and focus restoration. Closed or completed tasks keep their existing protected Forward behavior. No financial, authentication, persistence, QR, mandate, IOU, recovery, Savings Hack or Pause timing source is changed. No baseline hashes are regenerated. Signal remains independent of Monochrome and the other editions.

## Verification

Focused latest-build checks passed: six broader current suites with **103 internal checks**, plus **8/8** new Signal page tests. The new shipped-bundle tests cover destination classification, full-page semantics, native return and money preservation, nested Back/Escape, the funding sheet-to-page transition, page-local cancellation, ordinary Tab/no page drag, root sheet drag/Menu restoration and visible-frame clamping. Existing tests retain financial, draft, timing and history assertions; Signal presentation expectations now distinguish a nonmodal page from a real choice sheet.

The required full manifest gate passed **543/543 tests**, with no failures, cancellations or skipped test cases. The edition contract also passed its local pinned baseline, source order, independent storage and financial-journey checks. Peer-checkout comparison was unavailable and explicitly skipped; no other edition was modified.

Managed-browser review covered **219 prepared layouts across all 217 registered views** at 390 × 844. There were no setup, geometry, actual font-family, font-loading or solid-text contrast findings. The source-owned audit is [route-audit.json](route-audit.json); this is a diagnostic review, not a WCAG certification or proof of live provider behavior.

Manual review verified Profile, Money Boxes and an individual box, Collect → IOUs, All Your Money, funding options → full Mobile Money form → original options, and payment review → in-page cancellation. The generic Money Boxes body Close is hidden. Page semantics are nonmodal and native Back returns through the journey. Further visual checks covered All Your Money at 375 × 667, payment review/cancellation at 390 × 480, Pause at 320 × 568 with 200% text and IOUs inside the 1100 × 900 desktop shell. Long/enlarged content scrolls naturally. The desktop page exactly matched the 440 × 852 app frame at (516, 24), with a flat inner page and no exposed retained Home.

Actual browser evidence: [Collect](collect-page.png), [Money Boxes](boxes-page.png), and the uncropped [Collect browser](collect-browser.jpg) / [Money Boxes browser](boxes-browser.jpg) captures. These are memory-only sample fixtures. The [regression log](regression.log) retains the required gate result.

Verified release bundle: `lumo-runtime.f5ce50acf959.js` and `lumo-ui.42cb05a75aff.css`. The deterministic build check passed after fixture cleanup.

## Reproduce

Build using `node scripts/build-release.cjs`, check determinism with `node scripts/build-release.cjs --check`, and run `node scripts/check-edition-parity.cjs --regression`. Use the current manifest rather than a blanket historical test glob.

For memory-only managed-browser QA, stage `node tests/manual-layout/signal-experience-stage.cjs` and review `/__mono-audit.html`. The framework's legacy filename loads the current Signal bundle. Clean with the same helper plus `--clean`; remove every staged `dist/__*` file before publication.
