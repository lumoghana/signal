# Home Money Story · 27 October 2026

User request: add a clean Money Story card with a highlight and a working link; keep the ordinary homepage on one screen.

## Implementation

Monochrome-only presentation changes. The new full-width card follows Money Boxes, shares its border/radius/icon/chevron treatment, and opens the existing Money Story root. One category highlight uses the existing seven-day confirmed-spending summary, including fees. Equal leaders, money sent, uncategorised and empty periods have honest copy. No extra currency totals, unsupported privacy keys, financial writes or shared-engine changes.

Money Boxes retains the real savings total, active count, existing destination and privacy target, with wrapping metadata instead of a separate large balance row. Short-phone spacing and supporting copy are reduced; default touch targets remain usable. Larger text, notices and long content grow naturally instead of being cropped.

## Browser verification

Actual shipped page, managed preview, sample account:

| Viewport | View client / scroll height | Result |
| --- | --- | --- |
| 375 × 667, standard text | 566 / 566 | Both cards and bottom navigation visible without scrolling |
| 390 × 844, standard text | 743 / 743 | Both cards and bottom navigation visible without scrolling |
| Desktop 1363 × 936 | 777 / 777 | Standard app frame fits without scrolling |
| 320 × 568, 200% root text | Natural vertical scrolling; client and scroll widths equal | Cards wrap and Money Story remains clickable |

Final compact Money Boxes and Money Story geometry did not move when balances were hidden/revealed (zero displacement). The new card opened the actual seven-day Money Story dashboard; its Data56% highlight matched the dashboard's confirmed GH₵45 of GH₵80 sample spending. New Home card history/Back/Forward checks run in both Window listener orders.

The final empty-period wording is neutral: “No completed payments in 7 days.” No claims of live payments, customer testing or production banking readiness.

## Validation

Focused navigation suite:53/53 passed, including the neutral empty-period copy in the full gate. Final full manifest regression:165/165 Node entries passed, exit0; all8 local edition contracts passed. The peer checkout comparison was skipped because no peer checkout is present. Exact output is recorded in regression.log. Shared baseline hashes and script order remain pinned; no baseline regeneration.
